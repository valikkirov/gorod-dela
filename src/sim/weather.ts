// Погода меняет спрос: в жару хотят лимонад и холодное пиво, в дождь прячутся в кафе.
import type { WantKind } from './demand';
import type { Rng } from './rng';

export type WeatherKind = 'sunny' | 'hot' | 'cloudy' | 'rain';

export interface Weather {
  kind: WeatherKind;
  /** °C днём */
  temp: number;
  /** Ветер: 0 — тихо, 1 — ветерок, 2 — ветрено. Пока только для картинки и прогноза. */
  wind?: WindLevel;
}

export type WindLevel = 0 | 1 | 2;

export const WIND_LABEL: Record<WindLevel, string> = { 0: 'тихо', 1: 'ветерок', 2: 'ветрено' };

/**
 * Ветер в день: из seed и номера дня, без общего генератора погоды — так он не сдвигает
 * последовательность погоды и баланс. В дождь ветрено чаще.
 */
export function windFor(seed: number, day: number, kind: WeatherKind): WindLevel {
  let h = (seed * 374761393 + day * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  const u = (h >>> 0) / 4294967296;
  const [strong, any] = kind === 'rain' ? [0.35, 0.75] : kind === 'hot' ? [0.08, 0.35] : [0.15, 0.5];
  return u < strong ? 2 : u < any ? 1 : 0;
}

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  sunny: 'Ясно',
  hot: 'Жара',
  cloudy: 'Пасмурно',
  rain: 'Дождь',
};

export const WEATHER_ICON: Record<WeatherKind, string> = {
  sunny: '☀️',
  hot: '🔥',
  cloudy: '☁️',
  rain: '🌧',
};

const TEMP: Record<WeatherKind, [number, number]> = {
  sunny: [18, 25],
  hot: [28, 34],
  cloudy: [11, 17],
  rain: [9, 15],
};

const WEIGHTS: [WeatherKind, number][] = [
  ['sunny', 40],
  ['cloudy', 28],
  ['rain', 20],
  ['hot', 12],
];

/** Погода «липкая»: с вероятностью 45 % завтра как сегодня */
export function rollWeather(rng: Rng, prev?: Weather): Weather {
  let kind: WeatherKind;
  if (prev && rng.chance(0.45)) kind = prev.kind;
  else {
    const total = WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let x = rng.range(0, total);
    kind = WEIGHTS[WEIGHTS.length - 1][0];
    for (const [k, w] of WEIGHTS) {
      x -= w;
      if (x <= 0) {
        kind = k;
        break;
      }
    }
  }
  const [lo, hi] = TEMP[kind];
  return { kind, temp: rng.int(lo, hi) };
}

/** Во сколько раз чаще возникает желание при такой погоде */
export const WEATHER_WANT: Record<WeatherKind, Partial<Record<WantKind, number>>> = {
  sunny: { bar: 1.1 },
  hot: { coffee: 0.8, tea: 1.6, bar: 1.35, lunch: 0.9 },
  cloudy: { coffee: 1.1 },
  rain: { coffee: 1.2, tea: 1.4, snack: 1.15, bar: 0.8 },
};

/** Подсказка в отчёте: что обычно меняет такая погода */
export const WEATHER_HINT: Record<WeatherKind, string> = {
  sunny: 'Обычный день, вечером больше гуляют',
  hot: 'Хотят лимонад и холодное пиво, горячий кофе — меньше',
  cloudy: 'Чуть больше берут кофе',
  rain: 'В сквер почти не ходят, зато прячутся в кафе: чай и кофе',
};
