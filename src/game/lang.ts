// Язык игры выбирается до загрузки остальных модулей (этот импорт в main.ts — первый): тексты-константы
// в модулях считаются при загрузке. Порядок: ?lang=en|ru → выбор игрока → язык браузера (русский
// и языки СНГ — по-русски, остальное — по-английски). Сборка для ВКонтакте — всегда по-русски.
import { L, setLang, type Lang } from '../sim/i18n';
import { EN } from '../i18n/en';

const KEY = 'gorod-dela:lang';
const RU_LIKE = ['ru', 'uk', 'be', 'kk', 'uz', 'ky', 'tg', 'hy', 'az', 'ka', 'tk', 'mo'];

/** Строки из index.html (их нет в коде) */
const PAGE: Record<string, string> = {
  'Город дела': 'Business Town',
  'День 1 · 06:00': 'Day 1 · 06:00',
  'Маленькое дело. Живая улица.': 'A small business. A living street.',
  'Включить звук': 'Turn sound on',
  'Вся улица': 'Whole street',
  Отдалить: 'Zoom out',
  Приблизить: 'Zoom in',
  'Развернуть панель': 'Expand panel',
  Звук: 'Sound',
};

function detect(): Lang {
  if (import.meta.env.VITE_PLATFORM === 'vk') return 'ru';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'ru' || q === 'en') {
      localStorage.setItem(KEY, q);
      return q;
    }
    const saved = localStorage.getItem(KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    /* без хранилища — по браузеру */
  }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language ?? 'ru'];
  return RU_LIKE.includes((langs[0] ?? 'ru').slice(0, 2).toLowerCase()) ? 'ru' : 'en';
}

export const LANG: Lang = detect();
setLang(LANG, LANG === 'en' ? { ...EN, ...PAGE } : {});

/** Перевести статичную разметку страницы: текст и подписи кнопок */
function translatePage(): void {
  if (LANG === 'ru') return;
  document.documentElement.lang = 'en';
  document.title = L('Город дела');
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue?.trim();
    if (t && /[А-Яа-яЁё]/.test(t)) n.nodeValue = n.nodeValue!.replace(t, L(t));
  }
  for (const el of document.querySelectorAll<HTMLElement>('[aria-label], [title]')) {
    for (const a of ['aria-label', 'title']) {
      const v = el.getAttribute(a);
      if (v && /[А-Яа-яЁё]/.test(v)) el.setAttribute(a, L(v));
    }
  }
}
translatePage();

/** Сменить язык: запомнить и перезапустить игру (тексты считаются при загрузке) */
export function switchLang(): void {
  try {
    localStorage.setItem(KEY, LANG === 'ru' ? 'en' : 'ru');
  } catch {
    /* без хранилища язык не запомнится */
  }
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  location.replace(url.toString());
}
