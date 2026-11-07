// Вкладка «Стойка» у киоска (GDD §13.4, блок 1): киоск изнутри, вещи на своих местах, улучшения.
// Картинка — пустая комната и слои вещей одного размера (scripts/cut_kiosk.py): купил — слой появился.
// Только отрисовка: покупка идёт через Simulation.buyUpgrade.
import { formatMoney } from '../sim/economy';
import { KIOSK_FITS, milestone, upgrade, UPGRADE_EFFECT, type UpgradeId } from '../sim/milestones';
import type { Simulation } from '../sim/simulation';
import { namedIcon } from './icons';

import { L, tr } from '../sim/i18n';
const NB = ' ';
const money = formatMoney;

const ART = import.meta.glob('./art/kiosk/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const art = (name: string): string => ART[`./art/kiosk/${name}.webp`];

/** Слой картинки и метка с номером на ней (доли ширины и высоты) */
const SPOT: Partial<Record<UpgradeId, { layer: string; x: number; y: number }>> = {
  terminal: { layer: 'terminal', x: 0.48, y: 0.61 },
  board: { layer: 'board', x: 0.49, y: 0.17 },
  pastry: { layer: 'pastry', x: 0.61, y: 0.59 },
  shelves: { layer: 'shelves', x: 0.54, y: 0.37 },
  machine: { layer: 'machine', x: 0.25, y: 0.44 },
  showcase: { layer: 'fridge', x: 0.78, y: 0.69 },
};

const ICON: Partial<Record<UpgradeId, string>> = {
  terminal: 'eq-register',
  board: 'mk-sign',
  pastry: 'croissant',
  shelves: 'ing-beans',
  machine: 'eq-machine',
  showcase: 'eq-showcase',
  awning: 'umbrella',
};

export function standTab(sim: Simulation, selected: UpgradeId | null): string {
  const cafe = sim.cafe;
  const layers = [`<img src="${art('room')}" alt="">`];
  if (!cafe.has('board')) layers.push(`<img src="${art('chalk')}" alt="">`);
  const pins: string[] = [];
  KIOSK_FITS.forEach((id, i) => {
    const s = SPOT[id];
    if (!s) return;
    if (cafe.has(id)) layers.push(`<img src="${art(s.layer)}" alt="">`);
    const owned = cafe.has(id);
    pins.push(
      `<button class="stand-pin${owned ? ' owned' : ''}${selected === id ? ' selected' : ''}" data-action="stand-pick" data-item="${id}"
        style="left:${s.x * 100}%;top:${s.y * 100}%" aria-label="${upgrade(id).name}">${i + 1}</button>`,
    );
  });

  const minutes = cafe.serviceMinutes;
  const board = cafe.has('board') ? Math.round((UPGRADE_EFFECT.boardNotice - 1) * 100) : 0;
  const kpis = tr`<div class="kpis">
      <div><small>На гостя</small><b>${minutes.toFixed(1).replace('.', ',')} мин</b></div>
      <div><small>Заметность</small><b>${board ? `+${board}${NB}%` : L('обычная')}</b></div>
      <div><small>Докупают</small><b>${cafe.has('pastry') ? tr`1 из ${Math.round(1 / UPGRADE_EFFECT.pastryChance)}` : '—'}</b></div>
    </div>`;

  const rows = KIOSK_FITS.map((id, i) => {
    const u = upgrade(id);
    const st = sim.upgradeState(id);
    if (st === 'premises') return '';
    const badge = st === 'owned' ? L('<span class="badge on">стоит</span>') : `<span class="badge">${money(u.cost)}</span>`;
    const control =
      st === 'owned'
        ? ''
        : st === 'locked'
          ? tr`<small class="lock">Откроется после вехи «${milestone(u.unlock!).title}»</small>`
          : `<button class="small" data-action="buy-upgrade" data-item="${id}" ${st === 'money' ? 'disabled' : ''}>${
              st === 'money' ? tr`Не хватает денег` : tr`Поставить за ${money(u.cost)}`
            }</button>`;
    return `<li class="upgrade${selected === id ? ' selected' : ''}" id="fit-${id}">
      <div class="row">${namedIcon(ICON[id] ?? '')}<b class="grow">${i + 1}. ${u.name}</b>${badge}</div>
      <small>${u.effect}</small>${control}</li>`;
  }).join('');

  return tr`
    <div class="stand">${layers.join('')}${pins.join('')}</div>
    <small>Нажми на номер в киоске — покажу, что это и сколько стоит.</small>
    ${kpis}
    <h4>Улучшения стойки</h4>
    <small>Покупаются один раз. Это вложение: в прибыль дня не входит, но из кассы уходит.</small>
    <ul class="menu upgrades">${rows}</ul>`;
}
