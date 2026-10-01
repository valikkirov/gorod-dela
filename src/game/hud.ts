import { dayNumber, formatClock, minuteOfDay } from '../sim/clock';
import {
  ACTIVITY_LABEL,
  currentEntry,
  KIND_LABEL,
  type Resident,
  type ResidentKind,
} from '../sim/residents';
import type { Simulation } from '../sim/simulation';
import { place } from '../sim/world';
import { RESIDENT_COLOR, toCss } from './palette';

// Интерфейс — обычный DOM поверх канваса: чёткий текст на любом экране
// и привычная вёрстка для правок дизайнера.

const NB = ' ';
export const SPEEDS = [0, 1, 2, 4] as const;

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Нет элемента ${sel}`);
  return el;
};

const fmtMinute = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export class Hud {
  speed = 1;
  private selected: Resident | null = null;
  private lastRender = 0;
  private readonly clock = $('#clock');
  private readonly street = $('#on-street');
  private readonly panel = $('#panel');

  constructor(
    private readonly sim: Simulation,
    private readonly onDeselect: () => void,
  ) {
    const speeds = $('#speeds');
    for (const s of SPEEDS) {
      const b = document.createElement('button');
      b.textContent = s === 0 ? '❚❚' : `×${s}`;
      b.title = s === 0 ? 'Пауза' : `Скорость ×${s}`;
      b.dataset.speed = String(s);
      b.addEventListener('click', () => this.setSpeed(s));
      speeds.append(b);
    }
    window.addEventListener('keydown', (ev) => {
      if (ev.code === 'Space') this.setSpeed(this.speed === 0 ? 1 : 0);
      const n = Number(ev.key);
      if (n >= 1 && n <= 3) this.setSpeed(SPEEDS[n]);
    });
    this.setSpeed(1);
    this.renderPanel();
  }

  setSpeed(s: number): void {
    this.speed = s;
    document.querySelectorAll<HTMLButtonElement>('#speeds button').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.speed) === s);
    });
  }

  select(r: Resident | null): void {
    this.selected = r;
    this.renderPanel();
  }

  frame(): void {
    const now = performance.now();
    if (now - this.lastRender < 100) return;
    this.lastRender = now;
    this.clock.textContent = `День ${dayNumber(this.sim.time)} · ${formatClock(this.sim.time)}`;
    this.street.textContent = `На${NB}улице: ${this.sim.onStreet}`;
    if (this.selected) this.renderPanel();
  }

  private lastHtml = '';

  private renderPanel(): void {
    const r = this.selected;
    const html = r ? this.card(r) : this.legend();
    if (html === this.lastHtml) return; // не трогаем DOM без нужды — сохраняется прокрутка
    this.lastHtml = html;
    this.panel.innerHTML = html;
    this.panel.querySelector('[data-close]')?.addEventListener('click', () => this.onDeselect());
  }

  private legend(): string {
    const kinds = Object.keys(KIND_LABEL) as ResidentKind[];
    const items = kinds
      .map((k) => `<li><i style="background:${toCss(RESIDENT_COLOR[k])}"></i>${KIND_LABEL[k]}</li>`)
      .join('');
    return `
      <p class="hint">Нажми на${NB}жителя, чтобы узнать, кто он и${NB}куда идёт</p>
      <ul class="legend">${items}</ul>`;
  }

  private card(r: Resident): string {
    const minute = Math.floor(minuteOfDay(this.sim.time));
    const now = currentEntry(r.schedule, minute);
    const where = place(r.placeId).name;
    const status = r.walking
      ? `${ACTIVITY_LABEL[r.activity]} · в${NB}пути → ${where}`
      : `${ACTIVITY_LABEL[r.activity]} · ${where}`;
    const home = r.homeId === 'metro' ? `Приезжает на${NB}метро` : `Живёт: ${place(r.homeId).name}`;
    const work =
      r.workId === null
        ? ''
        : `<div>${r.kind === 'student' ? 'Учится' : 'Работает'}: ${
            r.workId === 'metro' ? `за${NB}пределами улицы` : place(r.workId).name
          }</div>`;
    const rows = r.schedule
      .map(
        (s) =>
          `<li class="${s === now ? 'now' : ''}"><span>${fmtMinute(s.start)}</span>${
            ACTIVITY_LABEL[s.activity]
          } — ${place(s.placeId).name}</li>`,
      )
      .join('');
    return `
      <div class="card-head">
        <i style="background:${toCss(RESIDENT_COLOR[r.kind])}"></i>
        <div><b>${r.name}</b><small>${KIND_LABEL[r.kind]}</small></div>
        <button data-close aria-label="Закрыть">✕</button>
      </div>
      <div class="status">${status}</div>
      <div class="facts"><div>${home}</div>${work}</div>
      <ul class="schedule">${rows}</ul>`;
  }
}
