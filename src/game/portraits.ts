// Портреты жителей и картинки зданий изнутри (GDD §13.4, блоки 9, 11, 12).
// Портрет — общий по полу и возрасту, у шести «знакомых лиц» — свой. Тип жителя не теряем:
// его цвет — ободок, занятие — значок в углу.
import type { Resident, ResidentKind } from '../sim/residents';
import { isFemale } from '../sim/residents';
import type { DistrictId, Place } from '../sim/world';
import { RESIDENT_COLOR, toCss } from './palette';
import { namedIcon } from './icons';

const INTERIORS = import.meta.glob('./art/interiors/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const interior = (name: string): string | undefined => INTERIORS[`./art/interiors/${name}.webp`];

/** Лица «знакомых»: тип жителя → портрет (у кого пол не задан — оба варианта) */
const REGULAR_FACE: Partial<Record<ResidentKind, string>> = {
  office: 'reg-marina',
  pensioner: 'reg-zinaida',
  student: 'reg-lesha',
  remote: 'reg-remote',
  youth: 'reg-youth',
  passenger: 'reg-passenger',
};
const BOTH_GENDERS = new Set(['reg-remote', 'reg-youth', 'reg-passenger']);

/** Общий портрет по полу и возрасту */
function genericFace(r: Resident): string {
  const f = isFemale(r.name);
  if (r.kind === 'student') return f ? 'face-teen-f' : 'face-teen-m';
  if (r.kind === 'pensioner') return f ? 'face-old-f' : 'face-old-m';
  if (f) return 'face-woman';
  return r.id % 3 === 0 ? 'face-man-beard' : 'face-man';
}

export function faceOf(r: Resident, regular: boolean): string {
  const reg = regular ? REGULAR_FACE[r.kind] : undefined;
  if (reg) return BOTH_GENDERS.has(reg) ? `${reg}-${isFemale(r.name) ? 'f' : 'm'}` : reg;
  return genericFace(r);
}

/** Портрет в ободке цвета типа и со значком занятия; size — css-класс размера */
export function portrait(r: Resident, regular = false, size: 'sm' | 'md' | 'lg' = 'sm'): string {
  const ring = toCss(RESIDENT_COLOR[r.kind]);
  return `<span class="portrait ${size}" style="--ring:${ring}">${namedIcon(faceOf(r, regular), 'face')}${
    size === 'sm' ? '' : namedIcon(`job-${r.kind}`, 'job')
  }</span>`;
}

/** Картинка изнутри для карточки здания: у каждого офиса, магазина и метро — своя (scripts/pack_interiors.py) */
const INTERIOR_OF: Record<string, string> = {
  // Кленовая
  'klenovaya:metro': 'metro-maple',
  'klenovaya:metro-2': 'metro-garden',
  'klenovaya:office-bc': 'bc',
  'klenovaya:office-north': 'office-north',
  'klenovaya:shop': 'shop',
  'klenovaya:school': 'school',
  // В доме 3 на первом этаже аптека — её и показываем
  'klenovaya:home-3': 'pharmacy',
  // Деловой квартал
  'delovoy:metro': 'metro-delovoy',
  'delovoy:metro-2': 'metro-delovoy-2',
  'delovoy:bc-alfa': 'bc-alfa',
  'delovoy:cowork': 'cowork',
  'delovoy:bc-meridian': 'bc-meridian',
  'delovoy:bc-tower': 'bc-tower',
  'delovoy:bc-east': 'bc-east',
  'delovoy:bc-bank': 'bc-bank',
  'delovoy:bc-glass': 'bc-glass',
  'delovoy:shop': 'snack',
  'delovoy:school': 'institute',
  'delovoy:gym': 'gym',
  'delovoy:apart-1': 'apart-lobby',
  'delovoy:apart-2': 'entrance-f',
};
// Подъезды жилых домов: шесть разных, дом выбирает свой по номеру
const ENTRANCES = ['entrance-a', 'entrance-b', 'entrance-c', 'entrance-d', 'entrance-e', 'entrance-f'];

export function placeInterior(p: Place, district: DistrictId = 'klenovaya'): string {
  let name: string | undefined = INTERIOR_OF[`${district}:${p.id}`];
  if (!name) {
    if (p.kind === 'office') name = 'office';
    else if (p.kind === 'shop') name = 'shop';
    else if (p.kind === 'school') name = 'school';
    else if (p.kind === 'vacant') name = 'vacant';
    else if (p.kind === 'home') {
      const n = Number(p.id.replace(/\D/g, '')) || 0;
      name = ENTRANCES[n % ENTRANCES.length];
    }
  }
  const src = name ? interior(name) : undefined;
  return src ? `<div class="place-interior"><img src="${src}" alt=""></div>` : '';
}
