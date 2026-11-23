// Обучение в игре: подсказка показывает, куда нажать, и ждёт, пока игрок сделает это сам.
// Шаги: житель → его карточка → открыть помещение → меню → цена → скорость → первый гость → отчёт дня.
// Игра не стоит на паузе: всё происходит по-настоящему, подсказка только ведёт.
// Старые карточки «Как играть» остались справкой — по кнопке внизу панели.
import type { City } from '../sim/city';
import { bindShort } from '../sim/heroes';
import { L, tr } from '../sim/i18n';
import { goal, goalOnce } from './metrika';

const KEY = 'gorod-dela:coach-done';

export function coachDone(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

function markDone(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* приватный режим — не страшно */
  }
}

/** Что произошло в игре: нажали на жителя, сменили вкладку… */
const listeners = new Set<(name: string) => void>();
export function coachSignal(name: string): void {
  for (const l of listeners) l(name);
}

interface Ctx {
  city: City;
  speed: () => number;
  openDrawer: () => void;
  collapseDrawer: () => void;
}

interface Step {
  id: string;
  text: () => string;
  /** Куда показывать; нет цели — подсказка над картой */
  target?: () => HTMLElement | null;
  /** Кнопка в подсказке: шаг закончится по ней */
  ok?: () => string;
  /** Что сделать при входе в шаг */
  enter?: (c: Ctx) => void;
  /** Шаг выполнен (проверяется каждый кадр) */
  done?: (c: Ctx, s: State) => boolean;
  /** Сигнал, завершающий шаг */
  signal?: (name: string) => boolean;
  /** Шаг уже не нужен (игрок сделал это раньше) — пропускаем */
  skip?: (c: Ctx) => boolean;
  /** Без подсказки: просто ждём */
  silent?: boolean;
  /** Через сколько мс шаг закончится сам */
  auto?: number;
}

interface State {
  /** Сколько дней в отчётах было при входе в шаг */
  reports: number;
}

const q = <T extends HTMLElement = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const opened = (c: Ctx): boolean => c.city.main.cafe.opened;

const STEPS: Step[] = [
  {
    id: 'resident',
    text: () => tr`<b>Это твоя улица.</b> Жители живут сами: едут на работу, обедают, гуляют. Нажми на любого человека на карте.`,
    signal: (n) => n === 'resident',
    skip: opened,
  },
  {
    id: 'card',
    text: () => tr`Здесь видно, куда он идёт, чего хочет и сколько готов заплатить. О твоём деле он пока не знает — его ещё нет.`,
    target: () => q('#panel .card-head') ?? q('#panel'),
    ok: () => L('Понятно'),
    skip: opened,
  },
  {
    id: 'open',
    text: () => tr`Выбери помещение. Кафе с залом — гости сидят и заказывают больше. Киоск у метро дешевле, только навынос.`,
    target: () => q('#panel [data-action="open-cafe"][data-item="cafe"]') ?? q('#panel [data-action="open-cafe"]'),
    enter: (c) => {
      // Из карточки жителя — обратно к помещениям
      q('#panel [data-action="back"]')?.click();
      c.openDrawer();
    },
    done: opened,
  },
  {
    id: 'menu',
    text: () => tr`Открыто! Загляни в меню: что продаёшь и почём.`,
    target: () => q('#panel .tabs button:nth-child(2)'),
    enter: (c) => c.openDrawer(),
    signal: (n) => n === 'tab:menu' || n === 'tab:stock',
  },
  {
    id: 'price',
    text: () =>
      q('#panel [data-action="price-up"]')
        ? tr`Поменяй цену: дороже — больше денег с гостя, но часть гостей уйдёт.`
        : tr`Нажми на любую позицию меню.`,
    target: () => q('#panel [data-action="price-up"]') ?? q('#panel [data-action="item-toggle"]'),
    signal: (n) => n === 'price',
  },
  {
    id: 'speed',
    text: () => tr`Время идёт само. Ускорь его, чтобы быстрее дождаться гостей.`,
    target: () => q('#speeds [data-role="cycle"]'),
    enter: (c) => c.collapseDrawer(),
    done: (c) => c.speed() > 1,
  },
  {
    id: 'guest',
    text: () => tr`Жители зайдут, если знают о тебе, им по карману и идти недалеко. Ждём первых гостей…`,
    done: (c) => c.city.main.guestsServed > 0,
  },
  {
    id: 'first',
    text: () => tr`<b>Первый гость!</b> Чтобы о тебе узнало больше людей, загляни потом во вкладку «Гости → Реклама».`,
    auto: 7000,
  },
  { id: 'wait', text: () => '', silent: true, done: (c, s) => c.city.main.reports.length > s.reports },
  {
    id: 'report',
    text: () => tr`<b>Конец дня — отчёт.</b> Сколько заработал и кто почему не зашёл. Первая неделя почти всегда в минусе — ты вкладываешься в известность. Дальше — сам!`,
    target: () => q('#panel'),
    ok: () => L('Играть'),
  },
];

export function startCoach(c: Ctx): void {
  // Дело уже открыто (вернулся старый игрок) — учить нечему
  if (opened(c)) {
    markDone();
    return;
  }
  const ring = document.createElement('div');
  ring.className = 'coach-ring';
  const bubble = document.createElement('div');
  bubble.className = 'coach-bubble';
  bubble.setAttribute('role', 'status');
  document.body.append(ring, bubble);

  let i = -1;
  let state: State = { reports: 0 };
  let enteredAt = 0;
  let scrolledFor = -1;
  let raf = 0;
  const shown = STEPS.filter((s) => !s.silent && !s.auto);

  const finish = (how: 'done' | 'skip') => {
    cancelAnimationFrame(raf);
    listeners.delete(onSignal);
    document.removeEventListener('click', onClick, true);
    ring.remove();
    bubble.remove();
    markDone();
    goal(how === 'done' ? 'tutorial_done' : 'tutorial_skip', { step: STEPS[i]?.id ?? '' });
  };

  const next = () => {
    i += 1;
    while (i < STEPS.length && STEPS[i].skip?.(c)) i += 1;
    if (i >= STEPS.length) return finish('done');
    const s = STEPS[i];
    state = { reports: c.city.main.reports.length };
    enteredAt = performance.now();
    s.enter?.(c);
    goal('tutorial_step', { step: s.id });
    if (s.id === 'open') goalOnce('game_start', { tutorial: 'coach' });
    render();
  };

  const render = () => {
    const s = STEPS[i];
    if (s.silent) {
      bubble.hidden = true;
      ring.hidden = true;
      return;
    }
    const n = shown.indexOf(s);
    bubble.hidden = false;
    bubble.innerHTML = `
      ${n >= 0 ? `<small>${tr`Шаг ${n + 1} из ${shown.length}`}</small>` : ''}
      <p>${bindShort(s.text())}</p>
      <div class="coach-actions">
        <button class="link" data-c="skip">${L('Пропустить обучение')}</button>
        ${s.ok ? `<button class="primary" data-c="ok">${s.ok()}</button>` : ''}
      </div>
      <i class="coach-arrow"></i>`;
  };

  const onSignal = (name: string) => {
    if (STEPS[i]?.signal?.(name)) next();
  };
  listeners.add(onSignal);

  // Нажатия по кнопкам игры: смена вкладки и цены приходят отсюда
  const onClick = (ev: Event) => {
    const el = ev.target as HTMLElement;
    const c2 = el.closest<HTMLElement>('[data-c]')?.dataset.c;
    if (c2 === 'skip') return finish('skip');
    if (c2 === 'ok') return next();
    const btn = el.closest<HTMLElement>('[data-action]');
    if (!btn) return;
    const { action, item } = btn.dataset;
    // После обработки игрой: панель успеет пересобраться
    setTimeout(() => {
      if (action === 'tab') coachSignal(`tab:${item}`);
      if (action === 'price-up' || action === 'price-down') coachSignal('price');
    }, 0);
  };
  document.addEventListener('click', onClick, true);

  let lastText = '';
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const s = STEPS[i];
    if (!s) return;
    if (s.done?.(c, state) || (s.auto && performance.now() - enteredAt > s.auto)) return next();
    if (s.silent) return;
    // Текст шага может зависеть от того, что на экране (позиция меню открыта или нет)
    const text = s.text();
    if (text !== lastText) {
      lastText = text;
      render();
    }
    place(s);
  };

  const place = (s: Step) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const el = s.target?.() ?? null;
    let r = el?.getBoundingClientRect() ?? null;
    if (el && r && r.width) {
      // Цель в панели за краем — прокручиваем к ней (раз в шаг)
      const clip = el.closest('#panel')?.getBoundingClientRect();
      const out = clip ? r.top < clip.top || r.bottom > clip.bottom : r.bottom < 0 || r.top > vh;
      if (out && scrolledFor !== i && el.id !== 'panel') {
        scrolledFor = i;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      if (clip) {
        const top = Math.max(r.top, clip.top);
        const bottom = Math.min(r.bottom, clip.bottom);
        r = bottom > top ? new DOMRect(r.left, top, r.width, bottom - top) : null;
      }
    } else r = null;
    const bw = Math.min(340, vw - 24);
    bubble.style.width = `${bw}px`;
    const bh = bubble.offsetHeight;
    const arrow = bubble.querySelector<HTMLElement>('.coach-arrow');
    if (!r) {
      // Без цели — над картой, под верхней панелью
      ring.hidden = true;
      const top = (q('#topbar')?.getBoundingClientRect().bottom ?? 0) + 12;
      bubble.style.left = `${(vw - bw) / 2}px`;
      bubble.style.top = `${top}px`;
      if (arrow) arrow.hidden = true;
      return;
    }
    const big = r.height > vh * 0.4;
    ring.hidden = big;
    const pad = 4;
    ring.style.left = `${r.left - pad}px`;
    ring.style.top = `${r.top - pad}px`;
    ring.style.width = `${r.width + pad * 2}px`;
    ring.style.height = `${r.height + pad * 2}px`;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - bw / 2), vw - bw - 12);
    let top: number;
    let above: boolean;
    if (big) {
      // Цель — вся панель: подсказка прямо над ней
      above = true;
      top = Math.max(12, r.top - bh - 12);
    } else if (r.top - bh - 16 > 8) {
      above = true;
      top = r.top - bh - 14;
    } else {
      above = false;
      top = Math.min(r.bottom + 14, vh - bh - 8);
    }
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    if (arrow) {
      arrow.hidden = big;
      arrow.dataset.side = above ? 'below' : 'above';
      arrow.style.left = `${Math.min(Math.max(16, r.left + r.width / 2 - left), bw - 16)}px`;
    }
  };

  next();
  frame();
}
