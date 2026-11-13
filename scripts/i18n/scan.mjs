// Перевод игры: находит русский текст в коде и (с --apply) оборачивает его для перевода.
//   шаблоны `…` → tr`…` (тег), строки '…' → L('…'). Ключ перевода — русский текст, где ${…} → {0}, {1}…
//   (${NB} внутри шаблонов заменяется на сам неразрывный пробел и в ключ не попадает).
// Запуск: node scripts/i18n/scan.mjs [--apply] — печатает каталог в scripts/i18n/catalog.json
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { parse } from '@babel/parser';

const ROOT = new URL('../../', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const APPLY = process.argv.includes('--apply');
const CYR = /[А-Яа-яЁё]/;
const NBSP = ' ';
// Файлы и места, которые не переводим: словари, имена жителей (транслитерация на лету)
const SKIP_FILES = new Set(['src/sim/i18n.ts', 'src/i18n/en.ts', 'src/game/lang.ts']);
// Строки, которые остаются по-русски в данных (имена жителей и их женские формы — по ним согласуются глаголы)
const SKIP_LINES = { 'src/sim/residents.ts': [[115, 148]] };
const SKIP_CALLEES = new Set(['includes', 'startsWith', 'endsWith', 'indexOf', 'has', 'get', 'set', 'delete', 'split', 'querySelector', 'querySelectorAll', 'closest', 'getElementById', 'addEventListener', 'Error', 'log', 'warn', 'error', 'L', 'tr', 'plural']);

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) files.push(p);
  }
};
walk(SRC);

const catalog = new Map();
const skipped = [];

function keyOfTemplate(node, src) {
  let key = '';
  let i = 0;
  node.quasis.forEach((q, k) => {
    key += q.value.cooked;
    const ex = node.expressions[k];
    if (!ex) return;
    if (ex.type === 'Identifier' && ex.name === 'NB') key += NBSP;
    else key += `{${i++}}`;
  });
  return key;
}

const norm = (s) => s.replace(/ /g, ' ');

for (const file of files) {
  const rel = relative(ROOT, file);
  if (SKIP_FILES.has(rel)) continue;
  const src = readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parse(src, { sourceType: 'module', plugins: ['typescript', 'topLevelAwait'], errorRecovery: false });
  } catch (e) {
    console.error('parse', rel, e.message);
    process.exit(1);
  }
  const edits = [];
  const line = (pos) => src.slice(0, pos).split('\n').length;
  const visit = (node, parent, grand) => {
    if (!node || typeof node.type !== 'string') return;
    // Уже обёрнутое — в каталог (ключи словаря)
    if (node.type === 'TaggedTemplateExpression' && node.tag.type === 'Identifier' && node.tag.name === 'tr') {
      const key = norm(keyOfTemplate(node.quasi, src));
      if (!catalog.has(key)) catalog.set(key, `${rel}:${line(node.start)}`);
    }
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'L' && node.arguments[0]?.type === 'StringLiteral') {
      const key = norm(node.arguments[0].value);
      if (!catalog.has(key)) catalog.set(key, `${rel}:${line(node.start)}`);
      return;
    }
    if (node.type === 'TaggedTemplateExpression') {
      // уже обёрнуто — внутри могут быть свои шаблоны
      for (const ex of node.quasi.expressions) visit(ex, node.quasi, node);
      return;
    }
    if (node.type === 'TSLiteralType' || node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration') return;
    if (node.type === 'StringLiteral' || node.type === 'TemplateLiteral') {
      const text = node.type === 'StringLiteral' ? node.value : node.quasis.map((q) => q.value.cooked).join('');
      if (CYR.test(text)) {
        let why = '';
        if (parent?.type === 'ObjectProperty' && parent.key === node) why = 'key';
        else if (parent?.type === 'ClassProperty' && parent.key === node) why = 'key';
        else if (parent?.type === 'MemberExpression' && parent.property === node) why = 'index';
        else if (parent?.type === 'SwitchCase') why = 'case';
        else if (parent?.type === 'BinaryExpression' && /^[!=]==?$/.test(parent.operator)) why = 'compare';
        else if (parent?.type === 'CallExpression' || parent?.type === 'NewExpression') {
          const c = parent.callee;
          const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' ? c.property?.name : '';
          if (SKIP_CALLEES.has(name)) why = `arg:${name}`;
        } else if (parent?.type === 'TSEnumMember') why = 'enum';
        else if (node.leadingComments?.some((c) => c.value.includes('i18n-skip'))) why = 'marked';
        const ln = line(node.start);
        if ((SKIP_LINES[rel] ?? []).some(([a, b]) => ln >= a && ln <= b)) why = 'data';
        const key = node.type === 'StringLiteral' ? node.value : keyOfTemplate(node, src);
        const entry = { key: norm(key), at: `${rel}:${line(node.start)}` };
        if (why) skipped.push({ ...entry, why });
        else {
          if (!catalog.has(entry.key)) catalog.set(entry.key, entry.at);
          if (node.type === 'StringLiteral') edits.push({ at: node.start, ins: 'L(' }, { at: node.end, ins: ')' });
          else {
            edits.push({ at: node.start, ins: 'tr' });
            // ${NB} — сам неразрывный пробел в тексте шаблона
            node.expressions.forEach((ex, k) => {
              if (ex.type === 'Identifier' && ex.name === 'NB') {
                const from = node.quasis[k].end;
                const to = node.quasis[k + 1].start;
                edits.push({ at: from, cut: to, ins: NBSP });
              }
            });
          }
        }
      }
      if (node.type === 'TemplateLiteral') for (const ex of node.expressions) visit(ex, node, parent);
      return;
    }
    for (const k of Object.keys(node)) {
      if (k === 'leadingComments' || k === 'trailingComments' || k === 'loc') continue;
      const v = node[k];
      if (Array.isArray(v)) for (const c of v) visit(c, node, parent);
      else if (v && typeof v.type === 'string') visit(v, node, parent);
    }
  };
  visit(ast.program, null, null);
  if (APPLY && edits.length) {
    edits.sort((a, b) => b.at - a.at);
    let out = src;
    for (const e of edits) out = out.slice(0, e.at) + e.ins + out.slice(e.cut ?? e.at);
    // Импорт перевода
    const imp = relative(dirname(file), join(SRC, 'sim', 'i18n')).replace(/\\/g, '/');
    const spec = imp.startsWith('.') ? imp : './' + imp;
    if (!/from '[^']*i18n'/.test(out)) {
      const m = out.match(/^(?:import[^;]*;\s*\n)+/m);
      const line = `import { L, tr } from '${spec}';\n`;
      out = m ? out.slice(0, m.index + m[0].length) + line + out.slice(m.index + m[0].length) : line + out;
    }
    writeFileSync(file, out);
  }
}
const list = [...catalog].map(([key, at]) => ({ key, at }));
writeFileSync(join(ROOT, 'scripts/i18n/catalog.json'), JSON.stringify({ keys: list, skipped }, null, 1));
console.log('ключей', list.length, 'пропущено', skipped.length, APPLY ? '(записано)' : '');
