// Почётные жители: те, кто поддерживает игру (уровень «Меценат» на Boosty). Настоящее имя и портрет
// по фото, перерисованный в стиле игры. Игровых преимуществ нет — они просто живут в городе, как все.
//
// Как добавить: человек присылает фото и согласие на показ имени и портрета (текст — docs/citizens.md);
// портрет — art-src/v2/icons/cit-<id>.png (scripts/pack_icons.py), строка — в CITIZENS.
// Как убрать по просьбе: удалить строку и портрет, выкатить обновление.
//
// Житель выбирается детерминированно — один и тот же человек в каждом городе, rng не трогаем.
import { heroOf } from './regulars';
import type { Resident, ResidentKind } from './residents';
import type { DistrictId } from './world';

export interface Citizen {
  /** Латиница, для файла портрета: cit-<id> */
  id: string;
  /** Как человек попросил себя назвать */
  name: string;
  district: DistrictId;
  /** Кем живёт в городе: офис, студент, пенсионер, фрилансер… */
  kind: ResidentKind;
}

export const CITIZENS: Citizen[] = [];

/** Номер жителя по id гражданина: простой хеш, чтобы выбор не зависел от порядка списка */
function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/**
 * Поселить почётных жителей района: житель нужного типа, живущий в районе, не герой и не сквозной
 * (у сквозного имя общее с жителем другого района). Вызывать после того, как жителям раздали имена.
 */
export function placeCitizens(residents: Resident[], district: DistrictId, list: readonly Citizen[] = CITIZENS): void {
  for (const c of list) {
    if (c.district !== district) continue;
    const fits = residents.filter(
      (r) =>
        r.kind === c.kind &&
        r.homeId !== 'metro' &&
        !r.commute &&
        !r.honorary &&
        !heroOf(r.name) &&
        // Офисный с Кленовой, который ездит в квартал, станет сквозным позже — его не берём
        !(r.kind === 'office' && r.workId === 'metro'),
    );
    if (!fits.length) continue;
    const r = fits[hash(c.id) % fits.length];
    r.name = c.name;
    r.honorary = c.id;
  }
}
