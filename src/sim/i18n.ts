// Перевод игры. Ключ — русский текст, как он написан в коде: L('Склад') и tr`Гостей: ${n}` (в ключе — «Гостей: {0}»).
// По-русски всё возвращается как есть. По-английски — из словаря (src/i18n/en.ts, его подставляет setLang),
// а русские значения внутри шаблонов (названия мест, блюд) переводятся по тому же словарю; чего в словаре
// нет (имена жителей) — транслитерация. Язык выбирают до запуска игры (src/game/lang.ts) и не меняют на ходу.
// Модуль без DOM: симуляция остаётся детерминированной, от языка зависят только тексты.

export type Lang = 'ru' | 'en';

let lang: Lang = 'ru';
let dict: Record<string, string> = {};
/** Ключи, которых не нашлось в словаре — для проверки перевода (window.missingTr) */
export const missing = new Set<string>();

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang, dictionary: Record<string, string> = {}): void {
  lang = l;
  dict = {};
  for (const [k, v] of Object.entries(dictionary)) dict[norm(k)] = v;
}

const norm = (s: string): string => s.replace(/ /g, ' ');
const CYR = /[А-Яа-яЁё]/;

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Имена и прочее без перевода — латиницей: «Зинаида Смирнова» → «Zinaida Smirnova» */
export function translit(s: string): string {
  return s.replace(/[А-Яа-яЁё]/g, (ch) => {
    const low = ch.toLowerCase();
    const t = TRANSLIT[low] ?? ch;
    return ch === low ? t : t.charAt(0).toUpperCase() + t.slice(1);
  });
}

/** Перевести значение, вставленное в шаблон: строка из словаря, иначе латиницей */
function value(v: unknown): unknown {
  if (typeof v !== 'string' || !CYR.test(v)) return v;
  const hit = dict[norm(v)];
  if (hit !== undefined) return hit;
  // Разметка с уже переведённым текстом (и словом «Русский» в переключателе языка) — как есть
  if (v.includes('<')) return v;
  missing.add(v);
  return translit(v);
}

/** Обычная строка */
export function L(s: string): string {
  if (lang === 'ru') return s;
  const hit = dict[norm(s)];
  if (hit !== undefined) return hit;
  missing.add(s);
  return translit(s);
}

const keys = new WeakMap<TemplateStringsArray, string>();

function keyOf(strings: TemplateStringsArray): string {
  let k = keys.get(strings);
  if (k === undefined) {
    k = norm(strings.reduce((acc, s, i) => (i === 0 ? s : `${acc}{${i - 1}}${s}`), ''));
    keys.set(strings, k);
  }
  return k;
}

/** Шаблон: tr`Гостей сегодня: ${n}`. В переводе места значений — {0}, {1}…, порядок можно менять */
export function tr(strings: TemplateStringsArray, ...values: unknown[]): string {
  if (lang === 'ru') {
    let out = strings[0];
    for (let i = 0; i < values.length; i++) out += String(values[i]) + strings[i + 1];
    return out;
  }
  const key = keyOf(strings);
  const pattern = dict[key];
  if (pattern === undefined) {
    missing.add(key);
    let out = translit(strings[0]);
    for (let i = 0; i < values.length; i++) out += String(value(values[i])) + translit(strings[i + 1]);
    return out;
  }
  return pattern.replace(/\{(\d+)\}/g, (_, i: string) => String(value(values[Number(i)])));
}

/** Число по-английски или по-русски: 12 345 или 12,345 */
export function num(n: number): string {
  return Math.round(n).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US');
}
