// Карточка события-дилеммы: всплывает утром, ставит игру на паузу. «Решить позже» — закрыть,
// напоминание останется на вкладке «Обзор»; не решил до конца дня — сработает вариант по умолчанию.
import { card } from '../sim/events';
import type { Simulation } from '../sim/simulation';
import { goal } from './metrika';

const NB = ' ';

interface SpeedControl {
  speed: number;
  setSpeed(s: number): void;
}

export function showEventCard(sim: Simulation, hud: SpeedControl, onDone: () => void): void {
  const e = sim.pendingEvent;
  if (!e) return;
  document.querySelector('.overlay')?.remove();
  const resume = hud.speed || 1;
  hud.setSpeed(0);
  const c = card(e);
  const fallback = c.options.find((o) => o.id === c.fallback)!;
  const root = document.createElement('div');
  root.className = 'overlay';
  root.innerHTML = `
    <div class="sheet event-card" role="dialog" aria-label="${c.title}">
      <div class="event-icon">${c.icon}</div>
      <b>${c.title}</b>
      <p>${c.text}</p>
      ${c.stake ? `<p class="event-stake">${c.stake}</p>` : ''}
      <div class="event-options">
        ${c.options
          .map(
            (o) => `<button class="event-option" data-choice="${o.id}">
              <span>${o.label}</span><small>${o.hint}</small>
            </button>`,
          )
          .join('')}
      </div>
      <div class="actions">
        <small>Не${NB}решишь до${NB}конца дня${NB}— будет «${fallback.label}»</small>
        <button class="link" data-choice="later">Решить позже</button>
      </div>
    </div>`;
  document.body.append(root);
  const close = () => {
    root.remove();
    hud.setSpeed(resume);
    onDone();
  };
  root.addEventListener('click', (ev) => {
    const id = (ev.target as HTMLElement).closest<HTMLElement>('[data-choice]')?.dataset.choice;
    if (!id) return;
    if (id !== 'later' && sim.chooseEvent(id)) goal('event', { id: e.id, choice: id });
    close();
  });
}
