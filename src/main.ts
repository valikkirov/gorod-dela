// Язык — первым: от него зависят тексты-константы в остальных модулях
import './game/lang';
import { holidayDayOf, isHolidayDate } from './sim/holiday';
import { useWinter } from './game/atlas';
import Phaser from 'phaser';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/600.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/700.css';
import './style.css';
import { Hud } from './game/hud';
import { StreetScene, type SceneHooks } from './game/StreetScene';
import { SkyScene } from './game/sky';
import { autosave, loadGame } from './game/save';
import { showTutorial, tutorialDone } from './game/tutorial';
import { Simulation } from './sim/simulation';
import { City } from './sim/city';
import type { DistrictId } from './sim/world';
import { initMetrika } from './game/metrika';
import { initTelegram } from './game/telegram';
import { CHALLENGE, isChallenge, saveKeyFor } from './game/challenge';
import { Drawer, isWide } from './game/drawer';
import { sound } from './game/sound';
import { initSoundPanel } from './game/soundPanel';
import logoRu from './game/art/logo-ru.webp';
import logoEn from './game/art/logo-en.webp';
import { getLang } from './sim/i18n';
import { switchLang } from './game/lang';
import { gameReady, initPlatform, IS_PORTAL, onPlatformPause, PLATFORM, setPlaying } from './game/platform';

// В Яндекс Играх своя статистика и нет Telegram: внешние скрипты не грузим
if (!IS_PORTAL) {
  initMetrika();
  void initTelegram();
}
// Логотип в шапке (на компьютере): знак и надпись на языке игры
{
  const brand = document.querySelector('#brand');
  const en = getLang() === 'en';
  if (brand) brand.innerHTML = `<img src="${en ? logoEn : logoRu}" alt="${en ? 'Business Town' : 'Город дела'}" height="56" />`;
}
// Переключатель языка: в шапке на компьютере, над кнопками карты на телефоне. Подпись — язык, на который
// переключаем (во ВКонтакте игра только на русском)
if (PLATFORM !== 'vk') {
  const en = getLang() === 'en';
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.lang-switch')) {
    btn.innerHTML = `<span aria-hidden="true">🌐</span>${en ? 'RU' : 'EN'}`;
    btn.title = en ? 'Русский' : 'English';
    btn.setAttribute('aria-label', btn.title);
    btn.hidden = false;
    btn.addEventListener('click', switchLang);
  }
}
// Площадка (Яндекс, ВКонтакте, CrazyGames): SDK и облачное сохранение — до загрузки игры (на сайте — сразу)
await initPlatform();

const params = new URLSearchParams(location.search);
// ?seed=N — новый город с этим seed (без загрузки сохранения); ?challenge — испытание недели
const challenge = isChallenge();
const saveKey = saveKeyFor(challenge);
const city =
  (params.has('seed') ? null : loadGame(saveKey)) ??
  new City(new Simulation(challenge ? CHALLENGE.seed : Number(params.get('seed') ?? 1)));
// Новогодний сезон — по календарю игрока; ?season=ny|eve|newyear|off — посмотреть без ожидания
{
  const now = new Date();
  const q = params.get('season');
  const test = q === 'ny' || q === 'eve' || q === 'newyear';
  city.main.setHoliday(test || (q !== 'off' && isHolidayDate(now.getMonth() + 1, now.getDate())));
  if (city.main.holiday) useWinter();
  city.main.setHolidayDay(q === 'eve' || q === 'newyear' ? q : holidayDayOf(now.getMonth() + 1, now.getDate()));
}
// ?delovoy — сразу открыть деловой квартал (для проверки)
if (params.has('delovoy')) city.openDistrict();
autosave(city, saveKey);
// Город — одна карта: Кленовая (главная сцена) и, когда откроется, деловой квартал восточнее,
// за общей железной дорогой (своя сцена поверх, камера общая)
const scene = new StreetScene();
const sky = new SkyScene();
let neighbor: StreetScene | null = null;
const drawer = new Drawer((css) => scene.setCovered(css));
/** Сцена района, где точка из панели */
const sceneOf = (sim: Simulation): StreetScene => (neighbor && sim.district === neighborSim()?.district ? neighbor : scene);
const neighborSim = (): Simulation | null => city.branch;
const hud = new Hud(
  city,
  () => {
    for (const s of [scene, neighbor]) {
      s?.select(null);
      s?.selectPlace(null, false);
    }
  },
  (r) => sceneOf(hud.current).select(r),
  challenge,
);

// Канвас — во всё место под карту, в физических пикселях экрана: на телефонах графика чёткая.
// Что и в каком масштабе видно, решает камера сцены.
const DPR = Math.min(window.devicePixelRatio || 1, 2.5);
const gameEl = document.getElementById('game')!;
hud.onExpand = () => drawer.open();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#9cc27a',
  scale: {
    mode: Phaser.Scale.NONE,
    width: Math.max(1, gameEl.clientWidth * DPR),
    height: Math.max(1, gameEl.clientHeight * DPR),
    zoom: 1 / DPR,
  },
  scene: [],
});

/** Нажали на что-то в другом районе — панель сначала переходит туда */
function focus(sim: Simulation): void {
  if (hud.current.district === sim.district) return;
  const point = city.point(sim.district);
  if (!point) return;
  hud.show(point);
  scene.setFocus(sim.district);
}

const hooksFor = (sim: Simulation, host?: StreetScene): SceneHooks => ({
  sim,
  city,
  host,
  sky,
  onLook: (district) => {
    const point = city.point(district);
    if (point && hud.current.district !== district) hud.show(point);
  },
  getSpeed: () => hud.speed,
  onSelect: (r) => {
    focus(sim);
    hud.select(r);
    if (r) drawer.open();
  },
  onPlace: (p) => {
    if (p) focus(sim);
    hud.selectPlace(p);
    if (p) drawer.open();
    else drawer.collapse();
  },
  wide: isWide,
  onFrame: () => {
    // Квартал открылся — он появляется на той же карте, за насыпью
    if (city.branch && !neighbor) addNeighbor(city.branch);
    hud.frame();
  },
  onDayEnd: () => {
    hud.onDayEnd();
    drawer.open();
  },
  onStep: (id) => hud.onStep(id),
  onBankrupt: () => hud.onBankrupt(),
  onCreate: () => {
    // Карта нарисована — площадке можно сказать, что игра загружена (повторный вызов при смене района безвреден)
    gameReady();
    syncPlaying();
  },
});
game.scene.add('street', scene, true, hooksFor(city.main));
game.scene.add('sky', sky, true);

/** Деловой квартал на карте: своя сцена поверх Кленовой, камеру ведёт Кленовая */
function addNeighbor(sim: Simulation): void {
  neighbor = new StreetScene('street-delovoy');
  game.scene.add('street-delovoy', neighbor, true, hooksFor(sim, scene));
  // Небо остаётся поверх обоих районов
  game.scene.bringToTop('sky');
  Object.assign(window, { neighbor });
}

/** Перейти в другой район: камера едет туда по карте, панель — на точку района */
function switchTo(district: DistrictId): void {
  const sim = city.point(district);
  if (!sim) return;
  if (city.branch && !neighbor) addNeighbor(city.branch);
  if (hud.current.district !== district) hud.show(sim);
  scene.flyTo(district);
}
hud.onSwitch = switchTo;

// ——— Площадка: «игра загружена», геймплей идёт или стоит, пауза по просьбе площадки ———
let platformPaused = false;
// CrazyGames просит не останавливать геймплей, когда игрок просто ушёл с вкладки
const syncPlaying = () =>
  setPlaying(hud.speed > 0 && (PLATFORM === 'crazygames' || !document.hidden) && !platformPaused);
hud.onSpeedChange = syncPlaying;
document.addEventListener('visibilitychange', syncPlaying);
let resumeSpeed = 1;
onPlatformPause(
  () => {
    platformPaused = true;
    resumeSpeed = hud.speed;
    hud.setSpeed(0);
    sound.hold('platform', true);
  },
  () => {
    platformPaused = false;
    hud.setSpeed(resumeSpeed);
    sound.hold('platform', false);
  },
);
if (IS_PORTAL) {
  // Окно игры без фокуса (нажали на интерфейс площадки) — звук молчит
  window.addEventListener('blur', () => sound.hold('focus', true));
  window.addEventListener('focus', () => sound.hold('focus', false));
  // Ни выделения, ни контекстного меню по игровому полю и панели
  document.addEventListener('contextmenu', (ev) => {
    if (!(ev.target as HTMLElement).closest('textarea, input')) ev.preventDefault();
  });
  document.documentElement.classList.add('in-yandex');
}

// Первый запуск — короткое обучение (с ?seed — для отладки — не показываем)
if (!params.has('seed') && !tutorialDone()) showTutorial(hud);

// Канвас подстраивается под место между верхней панелью и карточкой
new ResizeObserver(() => game.scale.resize(Math.max(1, gameEl.clientWidth * DPR), Math.max(1, gameEl.clientHeight * DPR))).observe(gameEl);

// Звук: кнопка над масштабом открывает настройки; щелчки по кнопкам интерфейса
initSoundPanel();
const soundBtn = document.getElementById('sound')!;
// Браузер разрешает звук только после жеста: включённый в прошлый раз звук стартует с первого нажатия
window.addEventListener('pointerdown', () => sound.resumeIfEnabled(), { once: true, capture: true });
document.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest('button');
  if (!btn || btn === soundBtn) return;
  sound.play(btn.dataset.action === 'tab' ? 'ui-tab' : 'ui-click', 0.6);
});

// Кнопки масштаба поверх карты
document.getElementById('zoom')!.addEventListener('click', (ev) => {
  const z = (ev.target as HTMLElement).closest<HTMLElement>('[data-zoom]')?.dataset.zoom;
  if (z === 'in') scene.zoomBy(1.35);
  if (z === 'out') scene.zoomBy(1 / 1.35);
  if (z === 'fit') scene.fitView();
});

// Доступ из консоли браузера для отладки: window.sim
Object.assign(window, { sim: city.main, city, scene });
