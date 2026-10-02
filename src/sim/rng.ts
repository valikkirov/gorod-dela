// Детерминированный генератор случайных чисел (mulberry32).
// Один seed — один и тот же город: важно для отладки и будущего сервера.
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Внутреннее состояние — для сохранения игры */
  get snapshot(): number {
    return this.state;
  }

  set snapshot(v: number) {
    this.state = v >>> 0;
  }

  /** Число в диапазоне [0, 1) */
  next(): number {
    // Держим состояние в 32 битах — вывод тот же, а в долгой игре нет потери точности
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Число в диапазоне [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Целое в диапазоне [min, max] */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Отклонение ±spread от нуля */
  jitter(spread: number): number {
    return this.range(-spread, spread);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}
