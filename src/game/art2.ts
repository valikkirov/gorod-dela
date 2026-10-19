// Проба «Графики 2.0» — только на ветке образцов, в main не идёт.
// Новые дом, кафе и «Продукты» рисуются поверх старых спрайтов, ночной свет повторяет старый слой.
// Адрес с ?old — старая графика для сравнения.
import Phaser from 'phaser';
import type { Place } from '../sim/world';

const ART2: Record<string, string> = { 'home-1': 'home', cafe: 'cafe', shop: 'shop' };
/** Картинки нарисованы вдвое крупнее мира, как атласы */
const SCALE = 0.5;
/** Низ картинки — цоколь; чуть ниже основания, чтобы не было щели до полосы у двери */
const BASE_SHIFT = 4;

export const art2On = typeof location !== 'undefined' && !new URLSearchParams(location.search).has('old');

export function preloadArt2(scene: Phaser.Scene): void {
  if (!art2On) return;
  for (const n of new Set(Object.values(ART2))) {
    scene.load.image(`art2-${n}`, `art2/${n}.png`);
    scene.load.image(`art2-${n}-lights`, `art2/${n}-lights.png`);
  }
}

interface Pair {
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
      const n = ART2[p.id];
      if (!n) continue;
      const x = p.rect.x;
      const y = p.rect.y + p.rect.h + BASE_SHIFT;
      const day = scene.add.image(x, y, `art2-${n}`).setOrigin(0, 1).setScale(SCALE).setDepth(sprite.depth);
      const l = scene.add.image(x, y, `art2-${n}-lights`).setOrigin(0, 1).setScale(SCALE).setDepth(light.depth);
      this.pairs.push({ old: sprite, oldLight: light, day, light: l });
    }
  }

  /** После drawCafe и drawNight: прячем старое, свет берём у старого слоя */
  sync(): void {
    for (const p of this.pairs) {
      p.old.setAlpha(0);
      p.light.setAlpha(p.oldLight.alpha).setVisible(p.oldLight.visible);
      p.oldLight.setVisible(false);
    }
    // Накладки кафе (витрина, интерьер) нарисованы под старый фасад
    if (this.pairs.length) for (const o of this.hide) (o as Phaser.GameObjects.Image).setVisible(false);
  }
}
