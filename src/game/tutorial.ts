// Обучение на 30 секунд: четыре карточки при первом запуске. Повторить — «Как играть» внизу панели.
const KEY = 'gorod-dela:tutorial-done';
const NB = ' ';

const STEPS: { title: string; text: string }[] = [
  {
    title: `Это твоя улица`,
    text: `94${NB}жителя живут по${NB}своему расписанию: утром едут на${NB}работу, в${NB}обед ищут, где поесть, вечером гуляют и${NB}ходят в${NB}бар. Спрос создают они сами.`,
  },
  {
    title: `Смотри, кто чего хочет`,
    text: `Нажми на${NB}любого жителя — увидишь, куда он идёт, чего хочет и${NB}сколько готов заплатить. Ещё до${NB}открытия видно, кто хотел бы зайти в${NB}кафе.`,
  },
  {
    title: `Открой кафе`,
    text: `Внизу — свободное помещение. Открой кафе, выбери меню, цены и${NB}часы работы. Житель зайдёт, если знает о${NB}кафе, цена по${NB}карману и${NB}идти недалеко.`,
  },
  {
    title: `Каждую ночь — отчёт`,
    text: `Сколько заработал, где и${NB}почему потерял гостей, что изменилось. Вверху — пауза и${NB}скорость. Следи за${NB}кассой: три дня в${NB}минусе — банкротство.`,
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
    if (t === 'skip') close();
    if (t === 'next') {
      if (step === STEPS.length - 1) close();
      else {
        step += 1;
        render();
      }
    }
  });
  render();
}
