// Город: несколько точек игрока в разных районах. Касса, кредит, погода и банкротство — общие,
// время идёт в ногу. Деловой квартал открывается, когда первая точка встала на ноги.
import { SAVE_VERSION, Simulation, STEP, type SaveData } from './simulation';
import { hm, MINUTES_PER_DAY } from './clock';
import { linkCommuters, syncCommuters } from './commute';
import type { Resident } from './residents';
import type { DistrictId } from './world';

export const UNLOCK = {
  /** Недельная прибыль первой точки, ₽ */
  weeklyProfit: 15_000,
  /** Столько недель подряд */
  weeks: 2,
} as const;

export interface CitySave {
  city: 1;
  main: SaveData;
  branch: SaveData | null;
  unlocked: boolean;
}

export interface UnlockProgress {
  /** Сколько недель подряд (с конца) прибыль была не меньше цели: 0…UNLOCK.weeks */
  weeks: number;
  /** Прибыль за последние 7 дней (или меньше, если работали меньше недели) */
  lastWeek: number;
  /** Сколько дней из текущей недели уже прошло: 0…7 */
  daysIntoWeek: number;
}

export class City {
  private carry = 0;
  /** Квартал открыт — флаг не сбрасывается, даже если прибыль потом упала */
  unlocked = false;
  /** Квартал открылся только что — интерфейс покажет карточку и сбросит флаг */
  justUnlocked = false;
  /** Сквозные жители: пары «Кленовая — квартал» */
  private commuters: [Resident, Resident][] = [];

  constructor(
    readonly main: Simulation,
    public branch: Simulation | null = null,
  ) {
    if (branch) this.linkBranch(branch);
  }

  private linkBranch(branch: Simulation): void {
    branch.link(this.main);
    this.commuters = linkCommuters(this.main, branch);
  }

  get points(): Simulation[] {
    return this.branch ? [this.main, this.branch] : [this.main];
  }

  point(district: DistrictId): Simulation | null {
    return this.points.find((p) => p.district === district) ?? null;
  }

  /** Продвинуть все точки на dt игровых минут — шаг в шаг, чтобы день у всех закрывался одновременно */
  advance(dt: number): void {
    if (!this.branch) {
      this.main.advance(dt);
      this.checkUnlock();
      return;
    }
    this.carry += dt;
    while (this.carry >= STEP && !this.main.bankrupt) {
      this.carry -= STEP;
      const day = this.main.today;
      this.main.tick();
      this.branch.tick();
      // Новый день: свои люди одной точки узнают другую
      if (this.main.today !== day) syncCommuters(this.commuters, this.main, this.branch);
    }
  }

  /** Промотать до 6:00 утра все точки вместе */
  skipToMorning(): void {
    const left = (hm(6) - this.main.minute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    this.advance(left < 1 ? MINUTES_PER_DAY : left);
  }

  /** Прибыль по неделям, считая от последнего закрытого дня назад */
  unlockProgress(): UnlockProgress {
    const opened = this.main.reports.filter((r) => r.opened);
    const week = (i: number) => opened.slice(Math.max(0, opened.length - 7 * (i + 1)), opened.length - 7 * i);
    let weeks = 0;
    for (let i = 0; i < UNLOCK.weeks; i++) {
      const w = week(i);
      if (w.length < 7 || w.reduce((s, r) => s + r.profit, 0) < UNLOCK.weeklyProfit) break;
      weeks += 1;
    }
    const last = week(0);
    return { weeks, lastWeek: last.reduce((s, r) => s + r.profit, 0), daysIntoWeek: last.length };
  }

  /** Проверить условие и открыть квартал. true — открылся только что */
  checkUnlock(): boolean {
    if (this.unlocked) return false;
    if (this.unlockProgress().weeks < UNLOCK.weeks) return false;
    this.openDistrict();
    this.justUnlocked = true;
    return true;
  }

  /** Открыть деловой квартал: там начинается жизнь, игрок может арендовать бистро */
  openDistrict(): Simulation {
    this.unlocked = true;
    if (this.branch) return this.branch;
    // Свой seed: другие люди, но та же погода (её ведёт главная точка)
    const branch = new Simulation(this.main.seed * 31 + 7, this.main.time, 'delovoy');
    this.linkBranch(branch);
    this.branch = branch;
    this.carry = 0;
    return branch;
  }

  serialize(): CitySave {
    return { city: 1, main: this.main.serialize(), branch: this.branch?.serialize() ?? null, unlocked: this.unlocked };
  }

  /** Сохранение города или старое сохранение одной точки. null — несовместимая версия */
  static restore(d: CitySave | SaveData): City | null {
    if (!('city' in d)) {
      const sim = Simulation.restore(d);
      return sim ? new City(sim) : null;
    }
    const main = Simulation.restore(d.main);
    if (!main) return null;
    const branch = d.branch && d.branch.version === SAVE_VERSION ? Simulation.restore(d.branch) : null;
    const city = new City(main, branch);
    city.unlocked = d.unlocked || branch !== null;
    return city;
  }
}
