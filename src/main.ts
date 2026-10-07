import Phaser from 'phaser';
import './style.css';
import { Hud } from './game/hud';
import { StreetScene, type SceneHooks } from './game/StreetScene';
import { autosave, loadGame } from './game/save';
import { showTutorial, tutorialDone } from './game/tutorial';
import { Simulation } from './sim/simulation';
import { initMetrika } from './game/metrika';
import { CHALLENGE, isChallenge, saveKeyFor } from './game/challenge';
import { Drawer, isWide } from './game/drawer';

initMetrika();

const params = new URLSearchParams(location.search);
// ?seed=N — новый город с этим seed (без загрузки сохранения); ?challenge — испытание недели
const challenge = isChallenge();
const saveKey = saveKeyFor(challenge);
const sim =
  (params.has('seed') ? null : loadGame(saveKey)) ??
  new Simulation(challenge ? CHALLENGE.seed : Number(params.get('seed') ?? 1));
autosave(sim, saveKey);
const scene = new StreetScene();
const drawer = new Drawer((css) => scene.setCovered(css));
const hud = new Hud(
  sim,
  () => {
    scene.select(null);
    scene.selectPlace(null, false);
  },
  (r) => scene.select(r),
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

const hooks: SceneHooks = {
  sim,
  getSpeed: () => hud.speed,
  onSelect: (r) => {
    hud.select(r);
    if (r) drawer.open();
  },
  onPlace: (p) => {
    hud.selectPlace(p);
    if (p) drawer.open();
    else drawer.collapse();
  },
  wide: isWide,
  onFrame: () => hud.frame(),
  onDayEnd: () => {
    hud.onDayEnd();
    drawer.open();
  },
  onBankrupt: () => hud.onBankrupt(),
};
game.scene.add('street', scene, true, hooks);

// Первый запуск — короткое обучение (с ?seed — для отладки — не показываем)
if (!params.has('seed') && !tutorialDone()) showTutorial(hud);

// Канвас подстраивается под место между верхней панелью и карточкой
new ResizeObserver(() => game.scale.resize(Math.max(1, gameEl.clientWidth * DPR), Math.max(1, gameEl.clientHeight * DPR))).observe(gameEl);

// Кнопки масштаба поверх карты
document.getElementById('zoom')!.addEventListener('click', (ev) => {
  const z = (ev.target as HTMLElement).closest<HTMLElement>('[data-zoom]')?.dataset.zoom;
  if (z === 'in') scene.zoomBy(1.35);
  if (z === 'out') scene.zoomBy(1 / 1.35);
  if (z === 'fit') scene.fitView();
});

// Доступ из консоли браузера для отладки: window.sim
Object.assign(window, { sim, scene });
