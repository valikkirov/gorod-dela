// Иконки предметов (GDD §13.4, блок 5): плоские, фронтальные, в палитре игры.
// Исходники — art-src/v2/icons, сборка — scripts/pack_icons.py.
import { isDish, parseDish, type BaseId } from '../sim/dishes';

const FILES = import.meta.glob('./art/icons/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const url = (name: string): string | undefined => FILES[`./art/icons/${name}.webp`];

/** Адрес иконки по имени файла — для сцены карты */
export const iconUrl = url;

/** Основа своего блюда → иконка похожей позиции */
const BASE_ICON: Record<BaseId, string> = {
  'milk-coffee': 'latte',
  'black-coffee': 'americano',
  pastry: 'base-pastry',
  toast: 'base-toast',
  soup: 'soup',
  hot: 'base-hot',
  tea: 'kind-tea',
  lemonade: 'lemonade',
};

/** Картинка позиции меню: своя у каталога, у своего блюда — по основе */
export function itemIcon(id: string): string | undefined {
  if (isDish(id)) {
    const d = parseDish(id);
    return d ? url(BASE_ICON[d.base.id]) : undefined;
  }
  return url(id);
}

/** <img> иконки или пусто, если её нет */
export function iconImg(id: string, cls = 'icon'): string {
  const src = itemIcon(id);
  return src ? `<img class="${cls}" src="${src}" alt="" aria-hidden="true">` : '';
}

export function namedIcon(name: string, cls = 'icon'): string {
  const src = url(name);
  return src ? `<img class="${cls}" src="${src}" alt="" aria-hidden="true">` : '';
}
