// Погода меняет спрос: в жару хотят лимонад и холодное пиво, в дождь прячутся в кафе.
import type { WantKind } from './demand';
import type { Rng } from './rng';

import { L } from './i18n';
export type WeatherKind = 'sunny' | 'hot' | 'cloudy' | 'rain' | 'snow' | 'frost';

export interface Weather {
  kind: WeatherKind;
  /** °C днём */
  temp: number;
  /** Ветер: 0 — тихо, 1 — ветерок, 2 — ветрено. Пока только для картинки и прогноза. */
  wind?: WindLevel;
}

export type WindLevel = 0 | 1 | 2;

export const WIND_LABEL: Record<WindLevel, string> = { 0: L('тихо'), 1: L('ветерок'), 2: L('ветрено') };

/**
 * Ветер в день: из seed и номера дня, без общего генератора погоды — так он не сдвигает
 * последовательность погоды и баланс. В дождь ветрено чаще.
 */
export function windFor(seed: number, day: number, kind: WeatherKind): WindLevel {
  let h = (seed * 374761393 + day * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  const u = (h >>> 0) / 4294967296;
  const [strong, any] = kind === 'rain' || kind === 'snow' ? [0.35, 0.75] : kind === 'hot' ? [0.08, 0.35] : [0.15, 0.5];
  return u < strong ? 2 : u < any ? 1 : 0;
}

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  sunny: L('Ясно'),
  hot: L('Жара'),
  cloudy: L('Пасмурно'),
  rain: L('Дождь'),
  snow: L('Снег'),
  frost: L('Мороз'),
};

export const WEATHER_ICON: Record<WeatherKind, string> = {
  sunny: '☀️',
  hot: '🔥',
  cloudy: '☁️',
  rain: '🌧',
  snow: '🌨',
  frost: '❄️',
};

const TEMP: Record<WeatherKind, [number, number]> = {
  sunny: [18, 25],
  hot: [28, 34],
  cloudy: [11, 17],
  rain: [9, 15],
  snow: [-6, -1],
  frost: [-18, -9],
};

/** Зимой (новогодний сезон) ясно и пасмурно — тоже с минусом */
const WINTER_TEMP: Partial<Record<WeatherKind, [number, number]>> = {
  sunny: [-8, -3],
  cloudy: [-4, 1],
};

const WINTER: WeatherKind[] = ['sunny', 'cloudy', 'snow', 'frost'];

const WEIGHTS: [WeatherKind, number][] = [
  ['sunny', 40],
  ['cloudy', 28],
  ['rain', 20],
  ['hot', 12],
];

const WINTER_WEIGHTS: [WeatherKind, number][] = [
  ['snow', 35],
  ['cloudy', 30],
  ['frost', 20],
  ['sunny', 15],
];

const tempOf = (kind: WeatherKind, winter: boolean): [number, number] => (winter && WINTER_TEMP[kind]) || TEMP[kind];

/** Зимняя погода на тот же день: без броска кубика, чтобы смена сезона не сдвигала погоду */
export function toWinter(w: Weather): Weather {
  if (WINTER.includes(w.kind) && w.temp <= 2) return w;
  const kind: WeatherKind = w.kind === 'rain' ? 'snow' : w.kind === 'hot' ? 'frost' : w.kind;
  const [lo, hi] = tempOf(kind, true);
  return { ...w, kind, temp: Math.round((lo + hi) / 2) };
}

/** Обратно к обычной погоде, когда сезон кончился */
export function toSummer(w: Weather): Weather {
  if (!WINTER.includes(w.kind) || w.temp > 2) return w;
  const kind: WeatherKind = w.kind === 'snow' ? 'rain' : w.kind === 'frost' ? 'cloudy' : w.kind;
  const [lo, hi] = TEMP[kind];
  return { ...w, kind, temp: Math.round((lo + hi) / 2) };
}

/** Погода «липкая»: с вероятностью 45 % завтра как сегодня */
export function rollWeather(rng: Rng, prev?: Weather, winter = false): Weather {
  let kind: WeatherKind;
  const weights = winter ? WINTER_WEIGHTS : WEIGHTS;
  // Липкость только внутри своего сезона: жара не перейдёт в зиму, снег — в лето
  if (prev && rng.chance(0.45) && weights.some(([k]) => k === prev.kind)) kind = prev.kind;
  else {
    const total = weights.reduce((s, [, w]) => s + w, 0);
    let x = rng.range(0, total);
    kind = weights[weights.length - 1][0];
    for (const [k, w] of weights) {
      x -= w;
      if (x <= 0) {
        kind = k;
        break;
      }
    }
  }
  const [lo, hi] = tempOf(kind, winter);
  return { kind, temp: rng.int(lo, hi) };
}

/** Во сколько раз чаще возникает желание при такой погоде */
export const WEATHER_WANT: Record<WeatherKind, Partial<Record<WantKind, number>>> = {
  sunny: { bar: 1.1 },
  hot: { coffee: 0.8, tea: 1.6, bar: 1.35, lunch: 0.9 },
  cloudy: { coffee: 1.1 },
  rain: { coffee: 1.2, tea: 1.4, snack: 1.15, bar: 0.8 },
  snow: { coffee: 1.25, tea: 1.4, snack: 1.1, bar: 0.85 },
  frost: { coffee: 1.35, tea: 1.5, lunch: 1.1, bar: 0.7 },
};

/** Какая доля прогулок по скверу отменяется: в дождь и мороз сидят дома, в снег гуляют почти все */
export const PARK_SKIP: Partial<Record<WeatherKind, number>> = { rain: 0.6, frost: 0.6, snow: 0.25 };

/** Подсказка в отчёте: что обычно меняет такая погода */
export const WEATHER_HINT: Record<WeatherKind, string> = {
  sunny: L('Обычный день, вечером больше гуляют'),
  hot: L('Хотят лимонад и холодное пиво, горячий кофе — меньше'),
  cloudy: L('Чуть больше берут кофе'),
  rain: L('В сквер почти не ходят, зато прячутся в кафе: чай и кофе'),
  snow: L('Снег: гуляют, а потом греются — горячие напитки и выпечка'),
  frost: L('Мороз: на улице не задерживаются, греются горячим, пиво почти не берут'),
};
