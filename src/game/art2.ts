// Проба «Графики 2.0» — только на ветке образцов, в main не идёт.
// Новые здания рисуются поверх старых спрайтов: картинка выбирается по кадру старого спрайта
// (кафе и киоск меняют вид: сдаётся, твоё, конкурент), ночной свет повторяет старый слой.
// Адрес с ?old — старая графика для сравнения.
import Phaser from 'phaser';
import type { Place } from '../sim/world';

/** Кадр старого атласа → картинка в public/art2 */
const ART2: Record<string, string> = {
  'building-home-a-left': 'home',
  'building-home-c-left': 'home2',
  'building-home-d-right': 'home3',
  'building-home-b-right': 'home4',
  'building-office-left': 'office',
  'building-bc-right': 'bc',
  'building-shop-right': 'shop',
  'building-metro': 'metro',
  'building-cafe-rent': 'cafe-rent',
  'building-cafe-open': 'cafe',
  'building-cafe-rival': 'cafe-rival',
  'building-kiosk-rent': 'kiosk-rent',
  'building-kiosk-open': 'kiosk',
  'building-kiosk-rival': 'kiosk-rival',
};
/** Слои света: у помещений свой кадр света, у остальных — «кадр-lights» */
const LIGHTS: Record<string, string> = {
  'building-cafe-lights': 'cafe',
  'building-cafe-rival-lights': 'cafe-rival',
  'building-kiosk-lights': 'kiosk',
  'building-kiosk-rival-lights': 'kiosk-rival',
};
/** У этих картинок нет света (пустое помещение) */
const DARK = new Set(['cafe-rent', 'kiosk-rent']);
/** Картинки нарисованы вдвое крупнее мира, как атласы */
const SCALE = 0.5;
/** Низ картинки — цоколь; чуть ниже основания, чтобы не было щели до полосы у двери */
const BASE_SHIFT = 4;

export const art2On = typeof location !== 'undefined' && !new URLSearchParams(location.search).has('old');

export function preloadArt2(scene: Phaser.Scene): void {
  if (!art2On) return;
  for (const n of new Set(Object.values(ART2))) {
    scene.load.image(`art2-${n}`, `art2/${n}.png`);
    if (!DARK.has(n)) scene.load.image(`art2-${n}-lights`, `art2/${n}-lights.png`);
  }
}

function lightKey(oldFrame: string): string | null {
  const n = LIGHTS[oldFrame] ?? ART2[oldFrame.replace(/-lights$/, '')];
  return n && !DARK.has(n) ? `art2-${n}-lights` : null;
}

interface Pair {
  place: Place;
  old: Phaser.GameObjects.Image;
  oldLight: Phaser.GameObjects.Image;
  day: Phaser.GameObjects.Image;
  light: Phaser.GameObjects.Image;
}

export class Art2 {
  private pairs: Pair[] = [];

  constructor(
    scene: Phaser.Scene,
    buildings: { place: Place; sprite: Phaser.GameObjects.Image; light: Phaser.GameObjects.Image }[],
    private readonly hide: Phaser.GameObjects.GameObject[],
  ) {
    if (!art2On) return;
    for (const { place: p, sprite, light } of buildings) {
      if (!ART2[sprite.frame.name]) continue;
      const day = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1).setScale(SCALE).setDepth(sprite.depth);
      const l = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1).setScale(SCALE).setDepth(light.depth);
      this.pairs.push({ place: p, old: sprite, oldLight: light, day, light: l });
    }
  }

  /** После drawCafe и drawNight: подменяем картинку по кадру старого спрайта, свет берём у старого слоя */
  sync(): void {
    for (const p of this.pairs) {
      const n = ART2[p.old.frame.name];
      if (!n) {
        // Кадра нет в пробе — показываем старый
        p.old.setAlpha(1);
        p.day.setVisible(false);
        p.light.setVisible(false);
        continue;
      }
      const key = `art2-${n}`;
      if (p.day.texture.key !== key) {
        // По центру места, низом на основание
        const x = p.place.rect.x + p.place.rect.w / 2;
        const y = p.place.rect.y + p.place.rect.h + BASE_SHIFT;
        p.day.setTexture(key).setPosition(x, y);
        p.light.setPosition(x, y);
      }
      p.old.setAlpha(0);
      p.day.setVisible(true);
      const lk = lightKey(p.oldLight.frame.name);
      if (lk && p.light.texture.key !== lk) p.light.setTexture(lk);
      p.light.setAlpha(p.oldLight.alpha).setVisible(!!lk && p.oldLight.visible);
      p.oldLight.setVisible(false);
    }
    // Накладки кафе (витрина, интерьер) нарисованы под старый фасад
    if (this.pairs.length) for (const o of this.hide) (o as Phaser.GameObjects.Image).setVisible(false);
  }
}
