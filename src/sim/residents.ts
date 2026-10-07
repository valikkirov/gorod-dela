import { hm } from './clock';
import { BASE_BUDGET, type Decision, type Want, type WantKind } from './demand';
import { Rng } from './rng';
import type { Point } from './world';

export type ResidentKind =
  | 'office'
  | 'student'
  | 'pensioner'
  | 'shopkeeper'
  | 'remote'
  | 'youth'
  | 'nightworker'
  | 'passenger'
  | 'visitor';

export const KIND_LABEL: Record<ResidentKind, string> = {
  office: 'Офисный сотрудник',
  student: 'Студент',
  pensioner: 'Пенсионер',
  shopkeeper: 'Продавец',
  remote: 'Фрилансер',
  youth: 'Молодёжь',
  nightworker: 'Ночная смена',
  passenger: 'Пассажир',
  visitor: 'Гость района',
};

/** Не живут и не работают на улице — только проходят или приезжают отдохнуть */
export const OUTSIDERS: ResidentKind[] = ['passenger', 'visitor'];

export type Activity = 'home' | 'work' | 'study' | 'lunch' | 'groceries' | 'walk' | 'night';

export const ACTIVITY_LABEL: Record<Activity, string> = {
  home: 'Дома',
  work: 'На работе',
  study: 'На учёбе',
  lunch: 'Обед',
  groceries: 'За продуктами',
  walk: 'Прогулка',
  night: 'Вечер с друзьями',
};

export interface ScheduleEntry {
  /** Минута суток, с которой начинается занятие */
  start: number;
  placeId: string;
  activity: Activity;
}

export interface Resident {
  id: number;
  name: string;
  kind: ResidentKind;
  homeId: string;
  /** Где работает или учится; 'metro' — за пределами улицы */
  workId: string | null;
  /** Расписание на сегодня: отсортировано по start, первое занятие начинается в 0:00 */
  schedule: ScheduleEntry[];
  /** Будни и выходные — разные дни */
  weekday: ScheduleEntry[];
  weekend: ScheduleEntry[];

  /** Готовность платить, ₽ — у каждого своя */
  budget: Record<WantKind, number>;
  /** Любимая позиция в каждой категории — за ней житель идёт охотнее */
  favorites: Record<WantKind, string>;
  /** 0…0.4: растёт после удачных визитов */
  loyalty: number;
  /** Последнее решение насчёт кафе — для карточки жителя */
  decision: Decision | null;
  /** Знает ли о кафе игрока */
  aware: boolean;
  /** Уже проходил мимо кафе в этой прогулке — второй раз не «замечает» */
  noticed: boolean;
  /** Сколько кофе купил — для карты лояльности */
  coffeeCount: number;
  /** День последней покупки (0 — не покупал) */
  lastVisit: number;

  // Состояние симуляции
  pos: Point;
  /** Занятие по расписанию, которое сейчас идёт */
  entry: ScheduleEntry;
  /** Где житель сейчас находится или куда идёт */
  placeId: string;
  /** Визит в кафе: идёт туда, стоит в очереди или сидит */
  visit: Visit | null;
  /** Ушёл к конкуренту: until — когда уйдёт от него (null — ещё идёт туда) */
  rivalVisit: { until: number | null; dwell: number } | null;
  activity: Activity;
  path: Point[];
  walking: boolean;
  visible: boolean;
  speed: number;
  /** Смещение по ширине тротуара, чтобы жители не шли «друг в друге» */
  lane: number;
}

export interface Visit {
  want: Want;
  itemId: string;
  stage: 'going' | 'queued' | 'dining';
  until: number;
  /** Когда житель решил зайти — чтобы не ждать бесконечно */
  since: number;
}

const FIRST_NAMES = [
  'Анна', 'Борис', 'Вера', 'Глеб', 'Дарья', 'Егор', 'Жанна', 'Илья', 'Ксения', 'Лев',
  'Мария', 'Никита', 'Ольга', 'Павел', 'Роман', 'Светлана', 'Тимур', 'Ульяна', 'Фёдор',
  'Юлия', 'Яна', 'Артём', 'Полина', 'Денис', 'Алиса', 'Кирилл', 'Нина', 'Олег', 'Софья', 'Виктор',
];
const LAST_NAMES = [
  'Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Соколов', 'Лебедев', 'Козлов', 'Новиков',
  'Морозов', 'Волков', 'Зайцев', 'Павлов', 'Семёнов', 'Голубев', 'Виноградов', 'Белов',
];
const FEMALE = new Set([
  'Зинаида', 'Марина',
  'Анна', 'Вера', 'Дарья', 'Жанна', 'Ксения', 'Мария', 'Ольга', 'Светлана', 'Ульяна', 'Юлия',
  'Яна', 'Полина', 'Алиса', 'Нина', 'Софья',
]);

/** Для согласования глаголов: «зашла» или «зашёл» */
export function isFemale(name: string): boolean {
  return FEMALE.has(name.split(' ')[0]);
}

function makeName(rng: Rng): string {
  const first = rng.pick(FIRST_NAMES);
  const last = rng.pick(LAST_NAMES);
  return `${first} ${FEMALE.has(first) ? `${last}а` : last}`;
}

const HOMES = ['home-1', 'home-2', 'home-3', 'home-4'];
/** Сколько людей проходит через улицу и приезжает отдохнуть */
export const PASSENGERS = 40;
export const VISITORS = 36;
const STREET_OFFICES = ['office-north', 'office-bc'];

type Builder = (rng: Rng, homeId: string, workId: string) => ScheduleEntry[];

const e = (start: number, placeId: string, activity: Activity): ScheduleEntry => ({
  start: Math.round(start),
  placeId,
  activity,
});

const SCHEDULES: Record<ResidentKind, Builder> = {
  office: (rng, home, work) => {
    const out = [e(0, home, 'home'), e(hm(7, 40) + rng.jitter(25), work, 'work')];
    if (work !== 'metro') {
      // Обед на улице: сейчас идут в магазин — это и есть спрос для кафе
      const lunch = hm(12, 45) + rng.jitter(25);
      out.push(e(lunch, 'shop', 'lunch'), e(lunch + rng.int(15, 25), work, 'work'));
    }
    const leave = hm(18, 10) + rng.jitter(40);
    if (rng.chance(0.3)) out.push(e(leave, 'shop', 'groceries'), e(leave + rng.int(15, 30), home, 'home'));
    else out.push(e(leave, home, 'home'));
    return out;
  },
  student: (rng, home) => {
    const out = [
      e(0, home, 'home'),
      e(hm(9, 20) + rng.jitter(40), 'metro', 'study'),
      e(hm(16, 30) + rng.jitter(60), home, 'home'),
    ];
    if (rng.chance(0.45)) {
      const walk = hm(19, 30) + rng.jitter(40);
      out.push(e(walk, 'park', 'night'), e(walk + rng.int(90, 180), home, 'home'));
    }
    return out;
  },
  pensioner: (rng, home) => {
    const shop = hm(9, 30) + rng.jitter(60);
    const walk = hm(14, 0) + rng.jitter(60);
    return [
      e(0, home, 'home'),
      e(shop, 'shop', 'groceries'),
      e(shop + rng.int(25, 45), home, 'home'),
      e(walk, 'park', 'walk'),
      e(walk + rng.int(60, 120), home, 'home'),
    ];
  },
  shopkeeper: (rng, home) => [
    e(0, home, 'home'),
    e(hm(7, 30) + rng.jitter(10), 'shop', 'work'),
    e(hm(20, 15) + rng.jitter(10), home, 'home'),
  ],
  remote: (rng, home) => {
    const walk = hm(11, 0) + rng.jitter(60);
    const shop = hm(17, 0) + rng.jitter(60);
    return [
      e(0, home, 'home'),
      e(walk, rng.chance(0.5) ? 'park' : 'shop', rng.chance(0.5) ? 'walk' : 'groceries'),
      e(walk + rng.int(30, 60), home, 'home'),
      e(shop, 'shop', 'groceries'),
      e(shop + rng.int(15, 30), home, 'home'),
    ];
  },
  youth: (rng, home) => {
    // Просыпаются поздно, вечером и ночью — в сквере и барах
    const day = hm(13) + rng.jitter(60);
    const out = [e(0, home, 'home'), e(day, rng.chance(0.6) ? 'park' : 'shop', 'walk'), e(day + rng.int(60, 120), home, 'home')];
    if (rng.chance(0.75)) {
      out[0] = e(0, 'park', 'night');
      out.push(e(hm(1, 30) + rng.jitter(40), home, 'home'), e(hm(21) + rng.jitter(60), 'park', 'night'));
    }
    return out;
  },
  passenger: (rng) => {
    // Пересадка с метро на автобус: утром идут вниз по улице, вечером обратно
    const morning = hm(7, 30) + rng.jitter(50);
    return [e(0, 'metro', 'home'), e(morning, 'bus', 'work'), e(hm(18, 20) + rng.jitter(60), 'metro', 'home')];
  },
  visitor: (rng) => {
    // В будни приезжают немногие — после работы посидеть вечером
    if (!rng.chance(0.25)) return [e(0, 'metro', 'home')];
    const evening = hm(19, 30) + rng.jitter(40);
    return [e(0, 'metro', 'home'), e(evening, 'park', 'night'), e(evening + rng.int(120, 180), 'metro', 'home')];
  },
  nightworker: (rng, home, work) => {
    // Охрана, курьеры, таксисты: работают ночью, ночной перекус около 2:00
    const snack = hm(2) + rng.jitter(30);
    return [
      e(0, work, 'work'),
      e(snack, 'shop', 'lunch'),
      e(snack + rng.int(20, 30), work, 'work'),
      e(hm(7, 30) + rng.jitter(20), home, 'home'),
      e(hm(21, 30) + rng.jitter(30), work, 'work'),
    ];
  },
};

/** Выходные: офисы пустеют, люди гуляют и встречаются. Кого нет в списке — живёт как в будни. */
const WEEKEND: Partial<Record<ResidentKind, Builder>> = {
  office: (rng, home) => {
    // Те, кто приезжает на метро в офисы улицы, в выходные не появляются
    if (home === 'metro') return [e(0, home, 'home')];
    const out = [e(0, home, 'home')];
    const walk = hm(11, 30) + rng.jitter(60);
    out.push(e(walk, rng.chance(0.6) ? 'park' : 'shop', 'walk'), e(walk + rng.int(60, 150), home, 'home'));
    if (rng.chance(0.3)) {
      const evening = hm(19, 30) + rng.jitter(40);
      out.push(e(evening, 'park', 'night'), e(evening + rng.int(90, 180), home, 'home'));
    }
    return out;
  },
  student: (rng, home) => {
    const out = [e(0, home, 'home')];
    const walk = hm(13) + rng.jitter(60);
    out.push(e(walk, 'park', 'walk'), e(walk + rng.int(60, 120), home, 'home'));
    if (rng.chance(0.7)) {
      const evening = hm(20) + rng.jitter(40);
      out.push(e(evening, 'park', 'night'), e(evening + rng.int(120, 200), home, 'home'));
    }
    return out;
  },
  youth: (rng, home) => {
    // В выходные гуляют почти все и дольше
    const day = hm(13) + rng.jitter(60);
    return [
      e(0, 'park', 'night'),
      e(hm(2, 30) + rng.jitter(40), home, 'home'),
      e(day, 'park', 'walk'),
      e(day + rng.int(60, 150), home, 'home'),
      e(hm(20, 30) + rng.jitter(60), 'park', 'night'),
    ];
  },
  shopkeeper: (rng, home) => [
    e(0, home, 'home'),
    e(hm(8, 30) + rng.jitter(10), 'shop', 'work'),
    e(hm(20, 15) + rng.jitter(10), home, 'home'),
  ],
  // В выходные пересадок почти нет
  passenger: (rng) => {
    if (!rng.chance(0.2)) return [e(0, 'metro', 'home')];
    const t = hm(12) + rng.jitter(120);
    return [e(0, 'metro', 'home'), e(t, 'bus', 'work'), e(t + rng.int(240, 420), 'metro', 'home')];
  },
  // Гости района: днём гуляют в сквере, вечером остаются в баре
  visitor: (rng) => {
    const day = hm(13) + rng.jitter(90);
    const out = [e(0, 'metro', 'home'), e(day, 'park', 'walk')];
    if (rng.chance(0.6)) {
      const evening = Math.max(day + 90, hm(19) + rng.jitter(60));
      out.push(e(day + rng.int(60, 90), 'shop', 'groceries'), e(evening, 'park', 'night'), e(evening + rng.int(120, 200), 'metro', 'home'));
    } else out.push(e(day + rng.int(90, 150), 'metro', 'home'));
    return out;
  },
};

/** Вкусы: какая позиция в категории нравится больше — зависит от типа жителя */
const TASTES: Record<WantKind, Partial<Record<ResidentKind, [string, number][]>> & { any: [string, number][] }> = {
  coffee: {
    any: [['americano', 1], ['cappuccino', 1], ['latte', 1], ['raf', 0.5]],
    office: [['americano', 4], ['cappuccino', 3], ['latte', 2], ['raf', 1]],
    pensioner: [['americano', 5], ['cappuccino', 3], ['latte', 2]],
    student: [['cappuccino', 3], ['latte', 3], ['raf', 3], ['americano', 1]],
    youth: [['raf', 4], ['latte', 3], ['cappuccino', 2], ['americano', 1]],
    passenger: [['americano', 3], ['cappuccino', 3], ['latte', 2]],
    visitor: [['latte', 3], ['raf', 2], ['cappuccino', 2], ['americano', 1]],
  },
  snack: {
    any: [['croissant', 1], ['sandwich', 1], ['syrniki', 1]],
    office: [['sandwich', 3], ['croissant', 2], ['syrniki', 1]],
    pensioner: [['syrniki', 3], ['croissant', 2]],
    nightworker: [['sandwich', 4], ['croissant', 1]],
    passenger: [['croissant', 3], ['sandwich', 2]],
  },
  lunch: {
    any: [['lunch', 1], ['soup', 1]],
    office: [['lunch', 3], ['soup', 2]],
    student: [['soup', 3], ['lunch', 1]],
    pensioner: [['soup', 3], ['lunch', 1]],
  },
  tea: {
    any: [['tea', 1], ['lemonade', 1]],
    pensioner: [['tea', 4], ['lemonade', 1]],
    youth: [['lemonade', 3], ['tea', 1]],
  },
  bar: {
    any: [['beer', 1], ['cider', 1]],
    youth: [['cider', 3], ['beer', 2]],
    nightworker: [['beer', 1]],
  },
};

function weighted(rng: Rng, items: [string, number][]): string {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = rng.range(0, total);
  for (const [id, w] of items) {
    x -= w;
    if (x <= 0) return id;
  }
  return items[items.length - 1][0];
}

interface Template {
  kind: ResidentKind;
  count: number;
  home: () => string;
  work: () => string;
}

export function generateResidents(rng: Rng): Resident[] {
  const fromStreet = () => rng.pick(HOMES);
  const templates: Template[] = [
    // Живут на улице
    { kind: 'office', count: 14, home: fromStreet, work: () => 'metro' },
    { kind: 'office', count: 6, home: fromStreet, work: () => rng.pick(STREET_OFFICES) },
    { kind: 'student', count: 8, home: fromStreet, work: () => 'metro' },
    { kind: 'pensioner', count: 8, home: fromStreet, work: () => 'metro' },
    { kind: 'remote', count: 12, home: fromStreet, work: () => 'metro' },
    // Приезжают на метро работать на улице
    { kind: 'office', count: 36, home: () => 'metro', work: () => rng.pick(STREET_OFFICES) },
    { kind: 'shopkeeper', count: 2, home: () => 'metro', work: () => 'shop' },
    // Ночная жизнь
    { kind: 'youth', count: 9, home: fromStreet, work: () => 'metro' },
    { kind: 'nightworker', count: 5, home: fromStreet, work: () => rng.pick([...STREET_OFFICES, 'metro']) },
    // Не с улицы: пересаживаются с метро на автобус и приезжают отдохнуть
    { kind: 'passenger', count: PASSENGERS, home: () => 'metro', work: () => 'bus' },
    { kind: 'visitor', count: VISITORS, home: () => 'metro', work: () => 'metro' },
  ];

  const residents: Resident[] = [];
  for (const t of templates) {
    for (let i = 0; i < t.count; i++) {
      const homeId = t.home();
      const workId = t.work();
      const byStart = (a: ScheduleEntry, b: ScheduleEntry) => a.start - b.start;
      const schedule = SCHEDULES[t.kind](rng, homeId, workId).sort(byStart);
      const weekend = (WEEKEND[t.kind] ?? SCHEDULES[t.kind])(rng, homeId, workId).sort(byStart);
      const wallet = rng.range(0.8, 1.25);
      const base = BASE_BUDGET[t.kind];
      residents.push({
        id: residents.length,
        name: makeName(rng),
        kind: t.kind,
        homeId,
        workId: t.kind === 'pensioner' || t.kind === 'remote' || t.kind === 'youth' || t.kind === 'visitor' ? null : workId,
        schedule,
        weekday: schedule,
        weekend,
        budget: {
          coffee: Math.round(base.coffee * wallet),
          lunch: Math.round(base.lunch * wallet),
          tea: Math.round(base.tea * wallet),
          snack: Math.round(base.snack * wallet),
          bar: Math.round(base.bar * wallet),
        },
        favorites: {
          coffee: weighted(rng, TASTES.coffee[t.kind] ?? TASTES.coffee.any),
          snack: weighted(rng, TASTES.snack[t.kind] ?? TASTES.snack.any),
          lunch: weighted(rng, TASTES.lunch[t.kind] ?? TASTES.lunch.any),
          tea: weighted(rng, TASTES.tea[t.kind] ?? TASTES.tea.any),
          bar: weighted(rng, TASTES.bar[t.kind] ?? TASTES.bar.any),
        },
        loyalty: 0,
        decision: null,
        aware: false,
        noticed: false,
        coffeeCount: 0,
        lastVisit: 0,
        pos: { x: 0, y: 0 },
        entry: schedule[0],
        placeId: homeId,
        visit: null,
        rivalVisit: null,
        activity: 'home',
        path: [],
        walking: false,
        visible: false,
        speed: 25 * rng.range(0.85, 1.15),
        lane: rng.jitter(9),
      });
    }
  }
  return residents;
}

/** Что житель должен делать в эту минуту суток */
export function currentEntry(schedule: ScheduleEntry[], minute: number): ScheduleEntry {
  let current = schedule[0];
  for (const entry of schedule) {
    if (entry.start <= minute) current = entry;
    else break;
  }
  return current;
}
