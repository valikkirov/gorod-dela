// «Испытание недели»: все играют в один и тот же город (один seed — те же жители, погода и события),
// итог — касса на конец последнего дня. Результатом можно поделиться в группе.
// Обычная игра и испытание сохраняются отдельно.
import { formatMoney, PREMISES } from '../sim/economy';
import { MILESTONES } from '../sim/milestones';
import type { Simulation } from '../sim/simulation';
import { FEEDBACK_URL } from './feedback';
import { goal } from './metrika';

export interface Challenge {
  id: number;
  seed: number;
  days: number;
  title: string;
}

/** Текущее испытание. Новое на следующей неделе — увеличить id и сменить seed */
export const CHALLENGE: Challenge = { id: 2, seed: 20261015, days: 14, title: 'Испытание недели №2' };

const NB = ' ';
const RESULT_KEY = `gorod-dela:challenge-${CHALLENGE.id}-result`;

export const isChallenge = (): boolean => new URLSearchParams(location.search).has('challenge');
export const challengeUrl = (): string => `${location.pathname}?challenge`;
export const saveKeyFor = (challenge: boolean): string =>
  challenge ? `gorod-dela:challenge-${CHALLENGE.id}` : 'gorod-dela:save';

export interface ChallengeResult {
  cash: number;
  guests: number;
  premises: string;
  milestones: number;
  bankrupt: boolean;
}

export function savedResult(): ChallengeResult | null {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    return raw ? (JSON.parse(raw) as ChallengeResult) : null;
  } catch {
    return null;
  }
}

/** Итог фиксируется один раз — по концу последнего дня испытания (или банкротству раньше) */
export function resultIfFinished(sim: Simulation): ChallengeResult | null {
  const done = sim.reports.length >= CHALLENGE.days || sim.bankrupt;
  if (!done) return null;
  const at = sim.reports[Math.min(CHALLENGE.days, sim.reports.length) - 1];
  return {
    cash: Math.round(at?.cashAfter ?? sim.cash),
    guests: sim.reports.slice(0, CHALLENGE.days).reduce((s, r) => s + r.guests, 0),
    premises: sim.cafe.opened ? PREMISES[sim.cafe.premisesId].name : 'не открылся',
    milestones: Object.values(sim.milestones).filter((d) => d !== undefined && d <= CHALLENGE.days).length,
    bankrupt: sim.bankrupt && sim.reports.length <= CHALLENGE.days,
  };
}

export function shareText(r: ChallengeResult): string {
  const how = r.bankrupt ? 'обанкротился, но не сдаюсь' : `касса ${formatMoney(r.cash)}`;
  return `${CHALLENGE.title} · Город дела\n${r.premises}: ${how}, гостей ${r.guests}, вех ${r.milestones} из ${MILESTONES.length}.\nСыграй в тот же город: ${location.origin}${challengeUrl()}`;
}

interface SpeedControl {
  speed: number;
  setSpeed(s: number): void;
}

/** Карточка итога: показывается один раз, потом можно играть дальше — результат уже не меняется */
export function showChallengeResult(r: ChallengeResult, hud: SpeedControl): void {
  try {
    if (!localStorage.getItem(RESULT_KEY)) {
      localStorage.setItem(RESULT_KEY, JSON.stringify(r));
      goal('challenge_done', { cash: r.cash, premises: r.premises, bankrupt: r.bankrupt });
    }
  } catch {
    /* без хранилища просто покажем карточку */
  }
  document.querySelector('.overlay')?.remove();
  const resume = hud.speed || 1;
  hud.setSpeed(0);
  const root = document.createElement('div');
  root.className = 'overlay';
  root.innerHTML = `
    <div class="sheet challenge-result" role="dialog" aria-label="Итог испытания">
      <small>${CHALLENGE.title} · ${CHALLENGE.days}${NB}дней</small>
      <b>${r.bankrupt ? 'Банкротство' : formatMoney(r.cash)}</b>
      <p>${r.premises} · гостей за${NB}${CHALLENGE.days}${NB}дней: ${r.guests} · вех: ${r.milestones}${NB}из${NB}${MILESTONES.length}</p>
      <p>Это твой результат в${NB}испытании. Поделись им в${NB}группе — посмотрим, кто вырастил кафе лучше. Играть дальше можно, итог уже не${NB}изменится.</p>
      <small class="done" hidden></small>
      <div class="actions">
        <button class="link" data-c="close">Играть дальше</button>
        <button class="primary" data-c="share">Поделиться</button>
      </div>
    </div>`;
  document.body.append(root);
  const done = root.querySelector<HTMLElement>('.done')!;
  root.addEventListener('click', async (ev) => {
    const c = (ev.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c;
    if (c === 'close') {
      root.remove();
      hud.setSpeed(resume);
    }
    if (c === 'share') {
      const text = shareText(r);
      try {
        await navigator.clipboard.writeText(text);
        done.textContent = `Результат скопирован${NB}— вставь его в${NB}группе`;
      } catch {
        done.textContent = text;
      }
      done.hidden = false;
      goal('challenge_share');
      window.open(FEEDBACK_URL, '_blank', 'noopener');
    }
  });
}
