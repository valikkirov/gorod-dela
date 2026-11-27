// Конкурс «Новогодний зал»: игрок делает картинку зала с конкурсной лентой и хэштегом и выкладывает её
// в комментарии к посту конкурса — в ВК или в Telegram. Победителя выбирает жюри (Валентин).
// Только на русском и только там, где можно давать внешние ссылки: сайт (и Telegram) и ВК.
import { getLang } from '../sim/i18n';
import { PLATFORM } from './platform';

export const CONTEST = {
  /** Приём работ по календарю игрока, включительно (месяц 1–12, день) */
  from: { month: 12, day: 1 },
  to: { month: 12, day: 21 },
  results: '28 декабря',
  tag: '#новогоднийзал',
  vk: 'https://vk.ru/gorod_dela',
  tg: 'https://t.me/+u-malhj9mupkNGNi',
} as const;

/** Идёт ли приём работ: ?contest=on — посмотреть без ожидания, ?contest=off — выключить */
export function contestOn(now = new Date()): boolean {
  if (getLang() !== 'ru' || (PLATFORM !== 'web' && PLATFORM !== 'vk')) return false;
  const q = new URLSearchParams(location.search).get('contest');
  if (q === 'on') return true;
  if (q === 'off') return false;
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const { from, to } = CONTEST;
  return m === from.month && m === to.month && d >= from.day && d <= to.day;
}
