// Знакомые лица: шесть жителей с именем и чертой, за которыми игрок следит по ходу игры.
// Они живут по тем же правилам, что и все, — у них просто ведётся история визитов,
// а смена статуса попадает в отчёт: «Анна теперь в постоянных гостях», «Глеб перестал заходить: очередь».
import { REJECT_LABEL, type RejectReason } from './cafe';
import type { WantKind } from './demand';
import { isFemale, type Resident, type ResidentKind } from './residents';

export interface RegularNote {
  day: number;
  minute: number;
  ok: boolean;
  reason?: RejectReason;
  itemId?: string;
}

export type RegularStatus = 'unaware' | 'new' | 'visiting' | 'regular' | 'lost';

export const STATUS_LABEL: Record<RegularStatus, string> = {
  unaware: 'Не знает о\u00a0кафе',
  new: 'Ещё не\u00a0заходил',
  visiting: 'Заходит',
  regular: 'Постоянный гость',
  lost: 'Перестал заходить',
};

export interface Regular {
  residentId: number;
  trait: string;
  /** Зачем обычно приходит — чтобы показать любимую позицию */
  usual: WantKind;
  history: RegularNote[];
  status: RegularStatus;
  /** Главная причина, если пропал */
  lostReason?: RejectReason;
}

interface Pick {
  kind: ResidentKind;
  trait: string;
  usual: WantKind;
  /** Живёт на улице — его легче встретить */
  local: boolean;
  /** Постоянный персонаж: те же жители ведут Telegram-группу игры */
  name?: string;
  /** Желательно: где живёт и где работает (если такой житель есть) */
  home?: string;
  work?: string;
}

const PICKS: Pick[] = [
  { kind: 'office', trait: 'Кофе по\u00a0дороге в\u00a0офис', usual: 'coffee', local: true, name: 'Марина Орлова', work: 'office-north' },
  { kind: 'pensioner', trait: 'Любит тихие часы и\u00a0чай', usual: 'tea', local: true, name: 'Зинаида Петровна', home: 'home-1' },
  { kind: 'student', trait: 'Считает каждый рубль', usual: 'snack', local: true, name: 'Лёша Ковалёв' },
  { kind: 'remote', trait: 'Сидит с\u00a0ноутбуком подолгу', usual: 'coffee', local: true },
  { kind: 'youth', trait: 'Вечером\u00a0— с\u00a0друзьями', usual: 'bar', local: true },
  { kind: 'passenger', trait: 'Пересадка, берёт с\u00a0собой', usual: 'coffee', local: false },
];

/** История не растёт бесконечно: для статуса нужна неделя, для карточки — последние визиты */
export const HISTORY_LIMIT = 20;
/** За сколько дней смотрим, чтобы решить статус */
export const STATUS_WINDOW = 7;
/** С какой лояльности житель считается своим */
export const LOYAL = 0.3;

/** Выбор детерминирован: первый подходящий житель каждого типа. Rng не трогаем — мир не сдвигается. */
export function pickRegulars(residents: Resident[]): Regular[] {
  const out: Regular[] = [];
  for (const p of PICKS) {
    const fits = (x: Resident) => x.kind === p.kind && (p.local ? x.homeId !== 'metro' : true);
    const r =
      residents.find((x) => fits(x) && (!p.home || x.homeId === p.home) && (!p.work || x.workId === p.work)) ??
      residents.find(fits);
    if (!r) continue;
    // Имя — не из генератора: rng не трогаем, мир остаётся тем же
    if (p.name) r.name = p.name;
    out.push({ residentId: r.id, trait: p.trait, usual: p.usual, history: [], status: 'unaware' });
  }
  return out;
}

export function addNote(reg: Regular, note: RegularNote): void {
  reg.history.push(note);
  if (reg.history.length > HISTORY_LIMIT) reg.history.splice(0, reg.history.length - HISTORY_LIMIT);
}

/** Статус на конец дня day. «Не сегодня» — не повод считать, что гость пропал. */
export function statusOf(reg: Regular, r: Resident, day: number): { status: RegularStatus; reason?: RejectReason } {
  if (!r.aware) return { status: 'unaware' };
  const ever = reg.history.some((n) => n.ok);
  if (!ever) return { status: 'new' };
  const recent = reg.history.filter((n) => n.day > day - STATUS_WINDOW);
  const ok = recent.filter((n) => n.ok).length;
  if (r.loyalty >= LOYAL - 1e-9 && ok >= 2) return { status: 'regular' };
  const fails = recent.filter((n) => !n.ok && n.reason && n.reason !== 'mood');
  if (ok === 0 && fails.length >= 2) {
    const count = new Map<RejectReason, number>();
    for (const n of fails) count.set(n.reason!, (count.get(n.reason!) ?? 0) + 1);
    const reason = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { status: 'lost', reason };
  }
  return { status: 'visiting' };
}

/** Строка в отчёт о смене статуса; null — если об этом не стоит писать */
export function newsLine(name: string, from: RegularStatus, to: RegularStatus, reason?: RejectReason): string | null {
  const f = isFemale(name);
  const first = name.split(' ')[0];
  if (to === 'regular') return `${first} теперь в\u00a0постоянных гостях`;
  if (to === 'lost') return `${first} ${f ? 'перестала' : 'перестал'} заходить${reason ? `: ${REJECT_LABEL[reason].toLowerCase()}` : ''}`;
  if (to === 'visiting' && from === 'new') return `${first} впервые ${f ? 'зашла' : 'зашёл'}`;
  if (to === 'visiting' && from === 'lost') return `${first} ${f ? 'вернулась' : 'вернулся'}`;
  if (to === 'visiting' && from === 'regular') return `${first} стал${f ? 'а' : ''} заходить реже`;
  return null;
}

/** Статус с учётом рода: «Перестала заходить» */
export function statusText(status: RegularStatus, name: string): string {
  const f = isFemale(name);
  if (status === 'new') return f ? 'Ещё не\u00a0заходила' : STATUS_LABEL.new;
  if (status === 'lost') return f ? 'Перестала заходить' : STATUS_LABEL.lost;
  return STATUS_LABEL[status];
}
