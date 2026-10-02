import { hm } from './clock';
import { BASE_BUDGET, type Decision, type Want, type WantKind } from './demand';
import { Rng } from './rng';
import type { Point } from './world';

export type ResidentKind = 'office' | 'student' | 'pensioner' | 'shopkeeper' | 'remote';

export const KIND_LABEL: Record<ResidentKind, string> = {
  office: 'Офисный сотрудник',
  student: 'Студент',
  pensioner: 'Пенсионер',
  shopkeeper: 'Продавец',
  remote: 'Фрилансер',
};

export type Activity = 'home' | 'work' | 'study' | 'lunch' | 'groceries' | 'walk';

export const ACTIVITY_LABEL: Record<Activity, string> = {
  home: 'Дома',
  work: 'На работе',
  study: 'На учёбе',
  lunch: 'Обед',
  groceries: 'За продуктами',
  walk: 'Прогулка',
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
  /** Отсортировано по start; первое занятие начинается в 0:00 */
  schedule: ScheduleEntry[];

  /** Готовность платить, ₽ — у каждого своя */
  budget: Record<WantKind, number>;
  /** Любимая позиция меню — к ней житель готов прибавить */
  favorite: string;
  /** 0…0.4: растёт после удачных визитов */
  loyalty: number;
  /** Последнее решение насчёт кафе — для карточки жителя */
  decision: Decision | null;

  // Состояние симуляции
  pos: Point;
  /** Занятие по расписанию, которое сейчас идёт */
  entry: ScheduleEntry;
  /** Где житель сейчас находится или куда идёт */
  placeId: string;
  /** Визит в кафе: идёт туда, стоит в очереди или сидит */
  visit: Visit | null;
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
  'Анна', 'Вера', 'Дарья', 'Жанна', 'Ксения', 'Мария', 'Ольга', 'Светлана', 'Ульяна', 'Юлия',
  'Яна', 'Полина', 'Алиса', 'Нина', 'Софья',
]);

function makeName(rng: Rng): string {
  const first = rng.pick(FIRST_NAMES);
  const last = rng.pick(LAST_NAMES);
  return `${first} ${FEMALE.has(first) ? `${last}а` : last}`;
}

const HOMES = ['home-1', 'home-2', 'home-3', 'home-4'];
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
      out.push(e(walk, 'park', 'walk'), e(walk + rng.int(60, 120), home, 'home'));
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
};

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
    { kind: 'remote', count: 6, home: fromStreet, work: () => 'metro' },
    // Приезжают на метро работать на улице
    { kind: 'office', count: 36, home: () => 'metro', work: () => rng.pick(STREET_OFFICES) },
    { kind: 'shopkeeper', count: 2, home: () => 'metro', work: () => 'shop' },
  ];

  const residents: Resident[] = [];
  for (const t of templates) {
    for (let i = 0; i < t.count; i++) {
      const homeId = t.home();
      const workId = t.work();
      const schedule = SCHEDULES[t.kind](rng, homeId, workId).sort((a, b) => a.start - b.start);
      const wallet = rng.range(0.8, 1.25);
      const base = BASE_BUDGET[t.kind];
      residents.push({
        id: residents.length,
        name: makeName(rng),
        kind: t.kind,
        homeId,
        workId: t.kind === 'pensioner' || t.kind === 'remote' ? null : workId,
        schedule,
        budget: {
          coffee: Math.round(base.coffee * wallet),
          lunch: Math.round(base.lunch * wallet),
          tea: Math.round(base.tea * wallet),
          snack: Math.round(base.snack * wallet),
        },
        favorite: rng.chance(0.5) ? 'cappuccino' : 'americano',
        loyalty: 0,
        decision: null,
        pos: { x: 0, y: 0 },
        entry: schedule[0],
        placeId: homeId,
        visit: null,
        activity: 'home',
        path: [],
        walking: false,
        visible: false,
        speed: 22 * rng.range(0.85, 1.15),
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
