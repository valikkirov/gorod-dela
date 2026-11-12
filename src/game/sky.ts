// Небо над всем городом: туман за краем и погода. Отдельная сцена поверх районов — Кленовой и делового
// квартала (у каждого своя сцена): так облака и дождь лежат одним слоем, без шва на стыке районов.
// Координаты — общего мира (как у Кленовой), камеру ведёт главная сцена.
import Phaser from 'phaser';
import { Fog } from './fog';
import { WeatherFx, type FxKind } from './weatherFx';
import type { WindLevel } from '../sim/weather';

export class SkyScene extends Phaser.Scene {
  private fog: Fog | null = null;
  private fx!: WeatherFx;
  /** Левые края открытых районов в общем мире */
  private districts: number[] = [0];

  constructor() {
    super('sky');
  }

  create(): void {
    this.input.enabled = false;
    this.fx = new WeatherFx(this, 1);
    this.applyLook();
  }

  /** Открылся район — туман расходится и над ним */
  setDistricts(districts: number[]): void {
    if (districts.join() === this.districts.join()) return;
    this.districts = districts;
    this.fog?.destroy();
    this.fog = null;
  }

  /** Куда смотрит главная камера: небо догоняет её в каждом кадре (сцена неба может быть ещё не создана) */
  private look: { x: number; y: number; w: number; h: number; cx: number; cy: number; zoom: number } | null = null;

  /** Камера неба повторяет камеру главной сцены */
  follow(cam: Phaser.Cameras.Scene2D.Camera, cx: number, cy: number, zoom: number): void {
    this.look = { x: cam.x, y: cam.y, w: cam.width, h: cam.height, cx, cy, zoom };
    this.applyLook();
  }

  private applyLook(): void {
    const l = this.look;
    const own = this.cameras?.main;
    if (!l || !own) return;
    if (own.x !== l.x || own.y !== l.y || own.width !== l.w || own.height !== l.h) own.setViewport(l.x, l.y, l.w, l.h);
    own.setZoom(l.zoom);
    own.centerOn(l.cx, l.cy);
  }

  /**
   * Кадр неба. dark — насколько стемнело (0…1 от самой тёмной ночи): облака темнеют вместе с городом.
   * area — где лежит оттенок погоды (весь город с границами)
   */
  draw(dt: number, time: number, kind: FxKind, wind: WindLevel, px: number, area: Phaser.Geom.Rectangle, winter: boolean, night: { color: number; alpha: number }): void {
    if (!this.fx) return;
    // Облака — из текстуры главной сцены: она загружена, когда главная сцена начала рисовать
    this.fog ??= new Fog(this, 0, this.districts);
    this.fx.update(dt, time, kind, wind, this.cameras.main.worldView, px, area, winter);
    this.fog?.shade(night.color, night.alpha);
  }

  update(_time: number, delta: number): void {
    this.fog?.update(Math.min(delta, 250) / 1000);
  }
}
