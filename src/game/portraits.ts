// Портреты жителей и картинки зданий изнутри (GDD §13.4, блоки 9, 11, 12).
// Портрет — общий по полу и возрасту, у шести «знакомых лиц» — свой. Тип жителя не теряем:
// его цвет — ободок, занятие — значок в углу.
import type { Resident, ResidentKind } from '../sim/residents';
import { isFemale } from '../sim/residents';
import type { Place } from '../sim/world';
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

/** Картинка изнутри для карточки здания; пусто — если для места её нет */
export function placeInterior(p: Place): string {
  let name: string | undefined;
  if (p.id === 'metro') name = 'metro-maple';
  else if (p.id === 'metro-2') name = 'metro-garden';
  else if (p.id === 'office-bc') name = 'bc';
  else if (p.kind === 'office') name = 'office';
  else if (p.kind === 'shop') name = 'shop';
  else if (p.kind === 'school') name = 'school';
  else if (p.kind === 'vacant') name = 'vacant';
  // В доме 3 на первом этаже аптека — её и показываем
  else if (p.id === 'home-3') name = 'pharmacy';
  else if (p.kind === 'home') {
    const n = Number(p.id.replace(/\D/g, '')) || 0;
    name = ['entrance-a', 'entrance-b', 'entrance-c'][n % 3];
  }
  const src = name ? interior(name) : undefined;
  return src ? `<div class="place-interior"><img src="${src}" alt=""></div>` : '';
}
