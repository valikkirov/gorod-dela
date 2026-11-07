// Дополняет src/i18n/en.ts переводами из scripts/i18n/en-*.tsv («номер<TAB>"строка JSON"», номер — порядок ключа
// в свежем catalog.json) и печатает ключи без перевода. Первый перевод (ноябрь 2026) уже в en.ts; новые строки
// можно добавлять прямо туда. Порядок: node scripts/i18n/scan.mjs --apply → node scripts/i18n/build.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const { keys } = JSON.parse(readFileSync(join(ROOT, 'scripts/i18n/catalog.json'), 'utf8'));
const OUT = join(ROOT, 'src/i18n/en.ts');
const dict = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8').replace(/^[\s\S]*?=\s*/, '').replace(/;\s*$/, '')) : {};
const placeholders = (s) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');
let n = 0;
for (const f of readdirSync(join(ROOT, 'scripts/i18n')).filter((f) => /^en-\d+\.tsv$/.test(f)).sort()) {
  for (const line of readFileSync(join(ROOT, 'scripts/i18n', f), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const tab = line.indexOf('\t');
    const id = Number(line.slice(0, tab));
    const en = JSON.parse(line.slice(tab + 1));
    const key = keys[id]?.key;
    if (key === undefined) throw new Error(`${f}: нет ключа ${id}`);
    // Каждое значение из русского шаблона должно быть и в переводе (кроме суффиксов, которые в английском не нужны)
    const lost = placeholders(key).split(',').filter((p) => p && !en.includes(`{${p}}`));
    if (lost.length) console.warn(`${id}: в переводе нет {${lost.join('},{')}} — ${key.slice(0, 60)}`);
    dict[key] = en;
    n++;
  }
}
const missing = keys.filter((k) => !(k.key in dict));
writeFileSync(OUT, `// Английский перевод: ключ — русский текст из кода (src/sim/i18n.ts). Собран scripts/i18n/build.mjs\nexport const EN: Record<string, string> = ${JSON.stringify(dict, Object.keys(dict).sort(), 1)};\n`);
console.log('переводов', n, 'в словаре', Object.keys(dict).length, 'без перевода', missing.length);
for (const m of missing.slice(0, 20)) console.log('  нет:', m.at, m.key.slice(0, 70));
