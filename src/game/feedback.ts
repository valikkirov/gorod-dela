// «Предложить идею»: текст тестера + контекст игры → в буфер обмена и в Telegram-группу игры.
import { dayNumber, formatClock, WEEKDAY_SHORT, weekday } from '../sim/clock';
import { formatMoney } from '../sim/economy';
import type { Simulation } from '../sim/simulation';

/** Ссылка на Telegram-группу игры. Пока пусто — кнопка просто копирует текст. */
export const FEEDBACK_URL = '';

const NB = ' ';

function context(sim: Simulation): string {
  const day = dayNumber(sim.time);
  const cafe = sim.cafe;
  const parts = [
    `День ${day} (${WEEKDAY_SHORT[weekday(day)]}, ${formatClock(sim.time)})`,
    `касса ${formatMoney(sim.cash)}`,
    cafe.opened ? `кафе открыто, меню: ${cafe.menu.map((m) => m.name).join(', ')}` : 'кафе не открыто',
  ];
  const last = sim.reports.at(-1);
  if (last?.opened) parts.push(`вчера гостей ${last.guests}, итог ${formatMoney(last.profit)}`);
  return parts.join(' · ');
}

export function openFeedback(sim: Simulation): void {
  document.querySelector('.overlay')?.remove();
  const root = document.createElement('div');
  root.className = 'overlay';
  const ctx = context(sim);
  root.innerHTML = `
    <div class="sheet" role="dialog" aria-label="Предложить идею">
      <b>Предложить идею</b>
      <p>Что мешало, что непонятно, чего хочется? Любая мелочь пригодится.</p>
      <textarea rows="5" placeholder="Например: не${NB}понял, почему никто не${NB}заходит утром"></textarea>
      <small>К${NB}тексту добавится, где ты сейчас в${NB}игре: ${ctx}</small>
      <small class="done" hidden></small>
      <div class="actions">
        <button class="link" data-f="cancel">Отмена</button>
        <button class="primary" data-f="send">${FEEDBACK_URL ? `Скопировать и${NB}открыть Telegram` : 'Скопировать текст'}</button>
      </div>
    </div>`;
  document.body.append(root);
  const area = root.querySelector('textarea')!;
  const done = root.querySelector<HTMLElement>('.done')!;
  area.focus();
  root.addEventListener('click', async (ev) => {
    const f = (ev.target as HTMLElement).closest<HTMLElement>('[data-f]')?.dataset.f;
    if (f === 'cancel') root.remove();
    if (f !== 'send') return;
    const text = `${area.value.trim() || '(без текста)'}\n\n— ${ctx}`;
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      area.value = text;
      area.select();
    }
    if (FEEDBACK_URL) {
      window.open(FEEDBACK_URL, '_blank', 'noopener');
      done.textContent = copied ? `Текст скопирован — вставь его в${NB}группе.` : `Скопируй текст выше и${NB}вставь в${NB}группе.`;
    } else {
      done.textContent = copied
        ? `Текст скопирован. Группа игры скоро появится — пока перешли его разработчику.`
        : `Скопируй текст выше и${NB}перешли разработчику.`;
    }
    done.hidden = false;
  });
}
