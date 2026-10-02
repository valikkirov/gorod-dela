import Phaser from 'phaser';
import './style.css';
import { Hud } from './game/hud';
import { StreetScene, type SceneHooks } from './game/StreetScene';
import { Simulation } from './sim/simulation';
import { WORLD } from './sim/world';

const sim = new Simulation(Number(new URLSearchParams(location.search).get('seed') ?? 1));
const scene = new StreetScene();
const hud = new Hud(sim, () => scene.select(null));

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

// Канвас подстраивается под место между верхней панелью и карточкой
new ResizeObserver(() => game.scale.refresh()).observe(document.getElementById('game')!);

// Доступ из консоли браузера для отладки: window.sim
Object.assign(window, { sim });
