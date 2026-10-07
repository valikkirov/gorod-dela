import Phaser from 'phaser';
import './style.css';
import { Hud } from './game/hud';
import { StreetScene, type SceneHooks } from './game/StreetScene';
import { autosave, loadGame } from './game/save';
import { showTutorial, tutorialDone } from './game/tutorial';
import { Simulation } from './sim/simulation';
import { initMetrika } from './game/metrika';
import { CHALLENGE, isChallenge, saveKeyFor } from './game/challenge';
import { WORLD } from './sim/world';

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
const hud = new Hud(
  sim,
  () => scene.select(null),
  (r) => scene.select(r),
  challenge,
);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WORLD.width,
  height: WORLD.height,
  backgroundColor: '#e9e4d8',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [],
});

const hooks: SceneHooks = {
  sim,
  getSpeed: () => hud.speed,
  onSelect: (r) => hud.select(r),
  onFrame: () => hud.frame(),
  onDayEnd: () => hud.onDayEnd(),
  onBankrupt: () => hud.onBankrupt(),
};
game.scene.add('street', scene, true, hooks);

// Первый запуск — короткое обучение (с ?seed — для отладки — не показываем)
if (!params.has('seed') && !tutorialDone()) showTutorial(hud);

// Канвас подстраивается под место между верхней панелью и карточкой
new ResizeObserver(() => game.scale.refresh()).observe(document.getElementById('game')!);

// Доступ из консоли браузера для отладки: window.sim
Object.assign(window, { sim });
