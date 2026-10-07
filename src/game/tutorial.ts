import { goal } from './metrika';

// Обучение на 30 секунд: пять карточек при первом запуске. Повторить — «Как играть» внизу панели.
const KEY = 'gorod-dela:tutorial-done-2';
const NB = ' ';

const STEPS: { title: string; text: string }[] = [
  {
    title: `Это твоя улица`,
    text: `Больше полутора сотен жителей живут по${NB}своему расписанию: утром едут на${NB}работу, в${NB}обед ищут, где поесть, вечером гуляют и${NB}ходят в${NB}бар. Спрос создают они сами.`,
  },
  {
    title: `Смотри, кто чего хочет`,
    text: `Нажми на${NB}любого жителя — увидишь, куда он идёт, чего хочет и${NB}сколько готов заплатить. Нажми на${NB}дом или офис — кто там живёт и${NB}работает. Карту можно двигать и${NB}приближать пальцами.`,
  },
  {
    title: `Открой своё дело`,
    text: `Два свободных помещения: киоск у${NB}метро и${NB}кафе с${NB}залом. Выбери одно, меню, цены и${NB}часы. Житель зайдёт, если знает о${NB}тебе, цена по${NB}карману и${NB}идти недалеко. Через несколько дней по${NB}соседству откроется конкурент.`,
  },
  {
    title: `Каждую ночь — отчёт`,
    text: `Сколько заработал, кто и${NB}почему не${NB}зашёл, что изменилось. Первая неделя почти всегда в${NB}минусе: ты вкладываешься в${NB}известность. Следи за${NB}кассой: три дня в${NB}минусе — банкротство.`,
  },
  {
    title: `Расти`,
    text: `Жители со${NB}★ над головой — знакомые лица, вкладка «Гости» покажет, как они к${NB}тебе привыкают. Во${NB}вкладке «Развитие» — вехи и${NB}улучшения. По${NB}утрам бывают события: выбери, как поступить. Вверху — пауза, скорость и${NB}⏭ до${NB}утра.`,
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
    root.innerHTML = `
      <div class="sheet" role="dialog" aria-label="Как играть">
        <small class="step">${step + 1} из${NB}${STEPS.length}</small>
        <b>${s.title}</b>
        <p>${s.text}</p>
        <div class="dots">${STEPS.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>
        <div class="actions">
          ${last ? '' : `<button class="link" data-t="skip">Пропустить</button>`}
          <button class="primary" data-t="next">${last ? 'Играть' : 'Дальше'}</button>
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
