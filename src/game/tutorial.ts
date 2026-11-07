import { goal } from './metrika';

import { L, tr } from '../sim/i18n';
// Обучение на 30 секунд: пять карточек при первом запуске. Повторить — «Как играть» внизу панели.
const KEY = 'gorod-dela:tutorial-done-2';

const STEPS: { title: string; text: string }[] = [
  {
    title: tr`Это твоя улица`,
    text: tr`Больше полутора сотен жителей живут по своему расписанию: утром едут на работу, в обед ищут, где поесть, вечером гуляют и ходят в бар. Спрос создают они сами.`,
  },
  {
    title: tr`Смотри, кто чего хочет`,
    text: tr`Нажми на любого жителя — увидишь, куда он идёт, чего хочет и сколько готов заплатить. Нажми на дом или офис — кто там живёт и работает. Карту можно двигать и приближать пальцами.`,
  },
  {
    title: tr`Открой своё дело`,
    text: tr`Два свободных помещения: киоск у метро и кафе с залом. Выбери одно, меню, цены и часы. Житель зайдёт, если знает о тебе, цена по карману и идти недалеко. Через несколько дней по соседству откроется конкурент.`,
  },
  {
    title: tr`Каждую ночь — отчёт`,
    text: tr`Сколько заработал, кто и почему не зашёл, что изменилось. Первая неделя почти всегда в минусе: ты вкладываешься в известность. Следи за кассой: три дня в минусе — банкротство.`,
  },
  {
    title: tr`Расти`,
    text: tr`Жители со ★ над головой — знакомые лица, вкладка «Гости» покажет, как они к тебе привыкают. Во вкладке «Развитие» — вехи и улучшения. По утрам бывают события: выбери, как поступить. Вверху — пауза, скорость и ⏭ до утра.`,
  },
];

interface SpeedControl {
  speed: number;
  setSpeed(s: number): void;
}

export function tutorialDone(): boolean {
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
    /* приватный режим — покажем ещё раз, не страшно */
  }
}

export function showTutorial(hud: SpeedControl): void {
  document.querySelector('.overlay')?.remove();
  const resume = hud.speed || 1;
  hud.setSpeed(0);
  const root = document.createElement('div');
  root.className = 'overlay';
  document.body.append(root);
  let step = 0;

  const close = () => {
    root.remove();
    markDone();
    hud.setSpeed(resume);
  };
  const render = () => {
    const s = STEPS[step];
    const last = step === STEPS.length - 1;
    root.innerHTML = tr`
      <div class="sheet" role="dialog" aria-label="Как играть">
        <small class="step">${step + 1} из ${STEPS.length}</small>
        <b>${s.title}</b>
        <p>${s.text}</p>
        <div class="dots">${STEPS.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>
        <div class="actions">
          ${last ? '' : tr`<button class="link" data-t="skip">Пропустить</button>`}
          <button class="primary" data-t="next">${last ? L('Играть') : L('Дальше')}</button>
        </div>
      </div>`;
  };
  root.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-t]')?.dataset.t;
    if (t === 'skip') {
      goal('tutorial_skip', { step: step + 1 });
      close();
    }
    if (t === 'next') {
      if (step === STEPS.length - 1) {
        goal('tutorial_done');
        close();
      }
      else {
        step += 1;
        render();
      }
    }
  });
  render();
}
