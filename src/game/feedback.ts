// «Предложить идею»: текст тестера + контекст игры → в буфер обмена и в Telegram-группу игры.
import { openExternal } from './telegram';
import { dayNumber, formatClock, WEEKDAY_SHORT, weekday } from '../sim/clock';
import { formatMoney } from '../sim/economy';
import type { Simulation } from '../sim/simulation';

import { L, tr } from '../sim/i18n';
/** Telegram-группа игры «Зинаида Петровна · Город дела». Пусто — кнопка просто копирует текст. */
// В Яндекс Играх внешних ссылок нет (требование 8.4.2): кнопки «Предложить идею» там тоже нет
export const FEEDBACK_URL = import.meta.env.VITE_PLATFORM === 'yandex' ? '' : 'https://t.me/+u-malhj9mupkNGNi';


function context(sim: Simulation): string {
  const day = dayNumber(sim.time);
  const cafe = sim.cafe;
  const parts = [
    tr`День ${day} (${WEEKDAY_SHORT[weekday(day)]}, ${formatClock(sim.time)})`,
    tr`касса ${formatMoney(sim.cash)}`,
    cafe.opened ? tr`кафе открыто, меню: ${cafe.menu.map((m) => m.name).join(', ')}` : L('кафе не открыто'),
  ];
  const last = sim.reports.at(-1);
  if (last?.opened) parts.push(tr`вчера гостей ${last.guests}, итог ${formatMoney(last.profit)}`);
  return parts.join(' · ');
}

export function openFeedback(sim: Simulation): void {
  document.querySelector('.overlay')?.remove();
  const root = document.createElement('div');
  root.className = 'overlay';
  const ctx = context(sim);
  root.innerHTML = tr`
    <div class="sheet" role="dialog" aria-label="Предложить идею">
      <b>Предложить идею</b>
      <p>Что мешало, что непонятно, чего хочется? Любая мелочь пригодится.</p>
      <textarea rows="5" placeholder="Например: не понял, почему никто не заходит утром"></textarea>
      <small>К тексту добавится, где ты сейчас в игре: ${ctx}</small>
      <small class="done" hidden></small>
      <div class="actions">
        <button class="link" data-f="cancel">Отмена</button>
        <button class="primary" data-f="send">${FEEDBACK_URL ? tr`Скопировать и открыть Telegram` : L('Скопировать текст')}</button>
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
    const text = `${area.value.trim() || L('(без текста)')}\n\n— ${ctx}`;
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      area.value = text;
      area.select();
    }
    if (FEEDBACK_URL) {
      openExternal(FEEDBACK_URL);
      done.textContent = copied
        ? tr`Текст скопирован — вставь его в группе, в тему «Идеи» или «Что-то сломалось».`
        : tr`Скопируй текст выше и вставь в группе, в тему «Идеи» или «Что-то сломалось».`;
    } else {
      done.textContent = copied
        ? tr`Текст скопирован. Группа игры скоро появится — пока перешли его разработчику.`
        : tr`Скопируй текст выше и перешли разработчику.`;
    }
    done.hidden = false;
  });
}
