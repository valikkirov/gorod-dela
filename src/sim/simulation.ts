import { hm, minuteOfDay } from './clock';
import { currentEntry, generateResidents, type Resident } from './residents';
import { Rng } from './rng';
import {
  clampSidewalkY,
  place,
  ROAD_CENTER_X,
  sidewalkX,
  type Place,
  type Point,
} from './world';

/** Шаг симуляции в игровых минутах. Мелкий — чтобы движение было плавным. */
const STEP = 0.2;

/** Ядро симуляции. Не знает ничего об отрисовке — этот же код
 *  на этапе 2 переедет на сервер. */
export class Simulation {
  /** Игровое время в минутах с начала первого дня */
  time: number;
  readonly residents: Resident[];
  private readonly rng: Rng;
  private carry = 0;

  constructor(seed = 1, startTime = hm(6, 0)) {
    this.rng = new Rng(seed);
    this.time = startTime;
    this.residents = generateResidents(this.rng);
    for (const r of this.residents) this.placeAt(r, r.homeId);
    // Сразу ставим каждого туда, где он должен быть в стартовую минуту
    for (const r of this.residents) {
      const entry = currentEntry(r.schedule, minuteOfDay(this.time));
      this.placeAt(r, entry.placeId);
      r.activity = entry.activity;
    }
  }

  /** Продвинуть время на dt игровых минут */
  advance(dt: number): void {
    this.carry += dt;
    while (this.carry >= STEP) {
      this.carry -= STEP;
      this.step(STEP);
    }
  }

  get onStreet(): number {
    return this.residents.filter((r) => r.visible).length;
  }

  private step(dt: number): void {
    this.time += dt;
    const minute = minuteOfDay(this.time);
    for (const r of this.residents) {
      const entry = currentEntry(r.schedule, minute);
      if (entry.placeId !== r.placeId) {
        r.placeId = entry.placeId;
        r.path = this.route(r, place(entry.placeId));
        r.walking = true;
        r.visible = true;
      }
      r.activity = entry.activity;
      if (r.walking) this.walk(r, dt);
    }
  }

  private walk(r: Resident, dt: number): void {
    let budget = r.speed * dt;
    while (budget > 0 && r.path.length > 0) {
      const target = r.path[0];
      const dx = target.x - r.pos.x;
      const dy = target.y - r.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= budget) {
        r.pos = { ...target };
        r.path.shift();
        budget -= dist;
      } else {
        r.pos = { x: r.pos.x + (dx / dist) * budget, y: r.pos.y + (dy / dist) * budget };
        budget = 0;
      }
    }
    if (r.path.length === 0) {
      r.walking = false;
      r.visible = !place(r.placeId).indoor;
    }
  }

  /** Маршрут: к тротуару → вдоль улицы → переход → ко входу */
  private route(r: Resident, to: Place): Point[] {
    const side = r.pos.x < ROAD_CENTER_X ? 'left' : 'right';
    const lane = (s: 'left' | 'right') => sidewalkX(s) + r.lane;
    const path: Point[] = [{ x: lane(side), y: clampSidewalkY(r.pos.y) }];

    const targetSide = to.side === 'center' ? side : to.side;
    const targetY = clampSidewalkY(to.door.y);
    path.push({ x: lane(side), y: targetY });
    if (targetSide !== side) path.push({ x: lane(targetSide), y: targetY });

    path.push(this.spotIn(to));
    return path;
  }

  /** Куда именно встать в месте назначения */
  private spotIn(p: Place): Point {
    if (p.kind === 'park') {
      return {
        x: this.rng.range(p.rect.x + 40, p.rect.x + p.rect.w - 40),
        y: this.rng.range(p.rect.y + 50, p.rect.y + p.rect.h - 30),
      };
    }
    return { ...p.door };
  }

  private placeAt(r: Resident, placeId: string): void {
    const p = place(placeId);
    r.placeId = placeId;
    r.pos = this.spotIn(p);
    r.path = [];
    r.walking = false;
    r.visible = !p.indoor;
  }
}
