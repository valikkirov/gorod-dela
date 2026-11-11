// Компании посетителей: коллеги из одного офиса обедают вместе по будням.
// Решают сообща: если место нравится большинству (трём из четырёх) и очередь небольшая — приходят все,
// иначе все идут в другое место. Каждый пришедший — обычный гость со своим заказом.
// Состав компаний строится из жителей детерминированно и в сохранение не идёт; итог дня — идёт (Simulation).
import type { Resident } from './residents';

export const GROUP = {
  size: 4,
  /** Компания засчитывается, если в ней хотя бы столько человек */
  minSize: 3,
  /** Сколько компаний в районе, не больше */
  max: 4,
  /** Доля голосов «за», чтобы пришли все: 3 из 4, 3 из 3 */
  majority: 0.75,
  /** В такую очередь компания не встаёт — уходит целиком */
  queue: 3,
} as const;

export interface Group {
  id: number;
  /** Где работают — оттуда и идут на обед */
  workId: string;
  members: number[];
}

/** Итог компании за день: идут ли к вам и почему нет */
export interface GroupDay {
  day: number;
  go: boolean;
  reason?: 'company' | 'queue' | 'rival';
}

/** Компании по местам работы: офисные одного офиса по порядку, по четыре */
export function formGroups(residents: Resident[]): Group[] {
  const byWork = new Map<string, Resident[]>();
  for (const r of residents) {
    if (r.kind !== 'office' || !r.workId || r.workId === 'metro') continue;
    if (!byWork.has(r.workId)) byWork.set(r.workId, []);
    byWork.get(r.workId)!.push(r);
  }
  const groups: Group[] = [];
  // Офисы по числу сотрудников: самые людные первыми, при равенстве — по названию
  const works = [...byWork.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  for (let round = 0; groups.length < GROUP.max; round++) {
    let added = false;
    for (const [workId, people] of works) {
      const members = people.slice(round * GROUP.size, (round + 1) * GROUP.size).map((r) => r.id);
      if (members.length < GROUP.minSize || groups.length >= GROUP.max) continue;
      groups.push({ id: groups.length, workId, members });
      added = true;
    }
    if (!added) break;
  }
  return groups;
}

/** Сколько голосов «за» нужно компании этого размера */
export const votesNeeded = (size: number): number => Math.ceil(size * GROUP.majority);
