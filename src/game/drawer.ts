// Нижний лист с управлением на телефоне: свёрнут (видна верхняя часть), наполовину или почти на весь экран.
// Тянется за ручку, по тапу на ручку переключается. На компьютере панель — колонка справа, лист не работает.
export type DrawerSize = 'peek' | 'half' | 'full';

const ORDER: DrawerSize[] = ['peek', 'half', 'full'];

export const isWide = (): boolean => matchMedia('(min-width: 900px)').matches;

export class Drawer {
  private readonly el = document.getElementById('drawer')!;
  private readonly grip = document.getElementById('grip')!;
  private timer = 0;

  /** onCover — сколько CSS-пикселей карты закрывает лист, когда он встал на место */
  constructor(private readonly onCover: (css: number) => void = () => {}) {
    window.addEventListener('resize', () => this.report());
    let startY = 0;
    let startH = 0;
    let moved = false;
    this.grip.addEventListener('pointerdown', (ev) => {
      if (isWide()) return;
      startY = ev.clientY;
      startH = this.el.getBoundingClientRect().height;
      moved = false;
      this.grip.setPointerCapture(ev.pointerId);
      this.el.classList.add('dragging');
    });
    this.grip.addEventListener('pointermove', (ev) => {
      if (!this.grip.hasPointerCapture(ev.pointerId)) return;
      const dy = startY - ev.clientY;
      if (Math.abs(dy) > 6) moved = true;
      if (moved) this.el.style.height = `${Math.max(80, startH + dy)}px`;
    });
    const end = (ev: PointerEvent) => {
      if (!this.grip.hasPointerCapture(ev.pointerId)) return;
      this.grip.releasePointerCapture(ev.pointerId);
      this.el.classList.remove('dragging');
      this.el.style.height = '';
      if (!moved) {
        this.set(ORDER[(ORDER.indexOf(this.size) + 1) % ORDER.length]);
        return;
      }
      // Отпустили — прилипает к ближайшему положению
      const h = startH + (startY - ev.clientY);
      const parent = this.el.parentElement!.getBoundingClientRect().height;
      const peek = parseFloat(getComputedStyle(this.el.parentElement!).getPropertyValue('--peek')) || 172;
      const stops: [DrawerSize, number][] = [
        ['peek', peek],
        ['half', parent * 0.52],
        ['full', parent - 64],
      ];
      stops.sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h));
      this.set(stops[0][0]);
    };
    this.grip.addEventListener('pointerup', end);
    this.grip.addEventListener('pointercancel', end);
  }

  get size(): DrawerSize {
    return (this.el.dataset.size as DrawerSize) ?? 'peek';
  }

  set(size: DrawerSize): void {
    const shrinking = ORDER.indexOf(size) < ORDER.indexOf(this.size);
    this.el.dataset.size = size;
    this.grip.setAttribute('aria-label', size === 'full' ? 'Свернуть панель' : 'Развернуть панель');
    // Сворачивается — карта сразу занимает освободившееся место; разворачивается — после анимации
    if (shrinking && size === 'peek') this.onCover(isWide() ? 0 : 14);
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.report(), 260);
  }

  private report(): void {
    if (isWide()) {
      this.onCover(0);
      return;
    }
    const game = document.getElementById('game')!.getBoundingClientRect();
    const top = this.el.getBoundingClientRect().top;
    this.onCover(Math.max(0, game.bottom - top));
  }

  /** Показать содержимое: развернуть хотя бы наполовину, но не сворачивать, если уже больше */
  open(): void {
    if (this.size === 'peek') this.set('half');
  }

  collapse(): void {
    this.set('peek');
  }
}
