// Сквозные жители (простая версия): одни и те же люди в двух районах.
// 24 офисных с Кленовой утром уезжают на метро — это они выходят из метро в Деловом квартале.
// У пары одно имя и один вкус. Кто стал своим в одной вашей точке, узнаёт и другую и приходит туда
// с частью этой привязанности: репутация сети ходит вместе с людьми.
// Пары строятся заново при связывании районов (детерминированно), поэтому в сохранение не идут.
import { L, tr } from './i18n';
import type { Resident, ScheduleEntry } from './residents';
import type { Simulation } from './simulation';
import type { DistrictId } from './world';

export const COMMUTE = {
  /** Сколько пар: офисные Кленовой, которые работают «за пределами улицы» */
  pairs: 24,
  /** С какой привязанности в одной точке человек рассказывает о себе и в другой */
  loyal: 0.15,
  /** Какая доля привязанности переносится в другую точку */
  share: 0.5,
  /** Новостей о «своих людях» в день, не больше */
  newsPerDay: 2,
  /** Минут от выхода из дома до выхода из метро в другом районе: дорога до станции и поезд */
  ride: 20,
} as const;

/** Второй «я» сквозного жителя в другом районе. Не в самом жителе: связь не идёт в сохранение и JSON */
const twins = new WeakMap<Resident, Resident>();

/** Сколько ещё ждать в метро, если второй «я» почему-то так и не спустился (минут после начала занятия) */
const HOLD_MAX = 180;

/**
 * Сквозной житель стоит в метро и собирается выйти: выходит, только когда второй «я» уже в метро
 * в своём районе. Город на одной карте — по обоим районам одновременно один человек не ходит
 */
export function heldInMetro(r: Resident, entry: ScheduleEntry, minute: number): boolean {
  const twin = twins.get(r);
  if (!twin || r.placeId !== 'metro' || r.walking || entry.placeId === 'metro') return false;
  if (twin.placeId === 'metro' && !twin.walking) return false;
  return minute < entry.start + HOLD_MAX;
}

/** «Ходит к вам на Кленовой» */
const DISTRICT_AT: Record<DistrictId, string> = {
  klenovaya: L('на\u00a0Кленовой'),
  delovoy: L('в\u00a0Деловом квартале'),
};

/** Пары «Кленовая — квартал»: по порядку жителей, одинаково при одном seed */
export function commuterPairs(main: Simulation, branch: Simulation): [Resident, Resident][] {
  const home = main.residents.filter((r) => r.kind === 'office' && r.workId === 'metro' && r.homeId !== 'metro');
  const work = branch.residents.filter((r) => r.kind === 'office' && r.homeId === 'metro');
  const n = Math.min(COMMUTE.pairs, home.length, work.length);
  return Array.from({ length: n }, (_, i) => [home[i], work[i]]);
}

/** Сделать пары одними людьми: имя, любимое и характер — как у жителя Кленовой; отметить, где второй район */
export function linkCommuters(main: Simulation, branch: Simulation): [Resident, Resident][] {
  const pairs = commuterPairs(main, branch);
  for (const [a, b] of pairs) {
    b.name = a.name;
    b.favorites = { ...a.favorites };
    b.character = a.character;
    a.commute = branch.district;
    b.commute = main.district;
    twins.set(a, b);
    twins.set(b, a);
    syncDay(a, b);
  }
  return pairs;
}

/**
 * Город теперь на одной карте — один и тот же человек не может идти по обоим районам сразу.
 * Утро ведёт Кленовая: из метро в квартале он выходит через дорогу после того, как ушёл в метро дома.
 * Вечер ведёт квартал: дома появляется через дорогу после того, как ушёл с работы в метро.
 * Расписания в выходные не трогаем: офисы квартала пустые, человек весь день на Кленовой
 */
function syncDay(a: Resident, b: Resident): void {
  const go = a.weekday.findIndex((e) => e.placeId === 'metro');
  const arrive = b.weekday.findIndex((e, i) => i > 0 && e.placeId !== 'metro');
  let leave = -1;
  b.weekday.forEach((e, i) => {
    if (i > arrive && e.placeId === 'metro') leave = i;
  });
  if (go < 0 || arrive < 0 || leave < 0 || go + 1 >= a.weekday.length) return;
  const next = arrive + 1 < b.weekday.length ? b.weekday[arrive + 1].start : Infinity;
  b.weekday[arrive].start = Math.min(a.weekday[go].start + COMMUTE.ride, next - 5);
  // Вечер на Кленовой (магазин, дом) сдвигается целиком: сколько он там занят — не меняется
  const shift = b.weekday[leave].start + COMMUTE.ride - a.weekday[go + 1].start;
  for (let i = go + 1; i < a.weekday.length; i++) a.weekday[i].start += shift;
}

/**
 * Раз в день: кто свой в одной вашей точке, узнаёт другую (если она открыта) и приходит туда не чужим.
 * Возвращает, сколько человек перенесли привязанность в каждую сторону.
 */
export function syncCommuters(pairs: [Resident, Resident][], main: Simulation, branch: Simulation): number {
  let moved = 0;
  let news = 0;
  const pass = (from: Resident, to: Resident, there: Simulation, fromDistrict: DistrictId) => {
    if (!there.cafe.opened || !from.aware || from.loyalty < COMMUTE.loyal) return;
    const carry = from.loyalty * COMMUTE.share;
    const knew = to.aware;
    if (!knew) there.learnFromChain(to);
    if (to.loyalty >= carry && knew) return;
    to.loyalty = Math.max(to.loyalty, carry);
    moved += 1;
    if (!knew) there.cafe.today.chain = (there.cafe.today.chain ?? 0) + 1;
    if (!knew && news < COMMUTE.newsPerDay) {
      news += 1;
      const first = to.name.split(' ')[0];
      there.addNews(tr`${first} ходит к\u00a0вам ${DISTRICT_AT[fromDistrict]}\u00a0— теперь знает и\u00a0эту точку`);
    }
  };
  for (const [a, b] of pairs) {
    pass(a, b, branch, main.district);
    pass(b, a, main, branch.district);
  }
  return moved;
}
