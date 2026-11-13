import { describe, expect, it } from 'vitest';
import { City } from '../src/sim/city';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { commuterPairs, COMMUTE, syncCommuters } from '../src/sim/commute';
import { Simulation } from '../src/sim/simulation';

function city(): City {
  const main = new Simulation(5);
  main.openCafe('cafe');
  const c = new City(main);
  c.openDistrict();
  return c;
}

describe('Сквозные жители', () => {
  it('24 офисных с Кленовой — те же люди, что выходят из метро в квартале: имя, вкус и характер одни', () => {
    const c = city();
    const pairs = commuterPairs(c.main, c.branch!);
    expect(pairs.length).toBe(COMMUTE.pairs);
    for (const [a, b] of pairs) {
      expect(b.name).toBe(a.name);
      expect(b.favorites).toEqual(a.favorites);
      expect(b.character).toBe(a.character);
      expect(a.commute).toBe('delovoy');
      expect(b.commute).toBe('klenovaya');
      expect(a.workId).toBe('metro');
      expect(b.homeId).toBe('metro');
    }
  }, 60_000);

  it('свой на Кленовой узнаёт бистро и приходит туда не чужим — только если бистро открыто', () => {
    const c = city();
    const pairs = commuterPairs(c.main, c.branch!);
    const [a0, b0] = pairs[0];
    a0.aware = true;
    a0.loyalty = 0.3;
    c.advance(MINUTES_PER_DAY);
    // Бистро нет — рассказывать не о чем
    expect(b0.loyalty).toBe(0);
    c.branch!.openCafe('bistro');
    // При открытии часть квартала узнаёт о бистро сама; берём того, кто ещё не знает
    const [a, b] = pairs.find(([, x]) => !x.aware)!;
    for (const [x] of pairs) x.loyalty = 0;
    a.aware = true;
    a.loyalty = 0.3;
    c.advance(MINUTES_PER_DAY);
    expect(b.aware).toBe(true);
    expect(b.loyalty).toBeGreaterThanOrEqual(0.3 * COMMUTE.share - 1e-9);
  }, 120_000);

  it('кто узнал точку от себя же — новость в отчёт, не больше двух в день', () => {
    const c = city();
    c.branch!.openCafe('bistro');
    const pairs = commuterPairs(c.main, c.branch!);
    for (const [a, b] of pairs) {
      a.aware = true;
      a.loyalty = 0.3;
      b.aware = false;
    }
    const before = c.branch!.cafe.today.news?.length ?? 0;
    expect(syncCommuters(pairs, c.main, c.branch!)).toBe(pairs.length);
    const news = (c.branch!.cafe.today.news ?? []).slice(before);
    expect(news.length).toBe(COMMUTE.newsPerDay);
    expect(news[0].startsWith(pairs[0][0].name.split(' ')[0])).toBe(true);
    for (const [, b] of pairs) expect(b.aware).toBe(true);
  }, 60_000);

  it('и обратно: постоянный гость бистро узнаёт кафе на Кленовой', () => {
    const c = city();
    c.branch!.openCafe('bistro');
    const [a, b] = commuterPairs(c.main, c.branch!)[1];
    a.aware = false;
    a.loyalty = 0;
    b.aware = true;
    b.loyalty = 0.25;
    c.advance(MINUTES_PER_DAY);
    expect(a.aware).toBe(true);
    expect(a.loyalty).toBeGreaterThan(0);
  }, 120_000);

  it('после загрузки пары те же', () => {
    const c = city();
    const names = commuterPairs(c.main, c.branch!).map(([a]) => a.name);
    const back = City.restore(JSON.parse(JSON.stringify(c.serialize())))!;
    const pairs = commuterPairs(back.main, back.branch!);
    expect(pairs.map(([a]) => a.name)).toEqual(names);
    for (const [a, b] of pairs) expect(b.name).toBe(a.name);
  }, 60_000);

  it('город на одной карте: сквозной житель не ходит по обоим районам сразу', () => {
    const c = city();
    c.branch!.openCafe('bistro');
    c.branch!.cafe.hire('shift');
    const pairs = commuterPairs(c.main, c.branch!);
    let both = 0;
    let commuted = 0;
    for (let t = 0; t < 3 * MINUTES_PER_DAY; t += 5) {
      c.advance(5);
      for (const [a, b] of pairs) {
        if (a.visible && b.visible) both += 1;
        if (b.visible) commuted += 1;
      }
    }
    expect(commuted).toBeGreaterThan(0);
    expect(both).toBe(0);
  }, 120_000);

  it('в городе нет тёзок: одинаковое имя только у сквозного жителя и его «я» в квартале', () => {
    const c = city();
    const seen = new Map<string, number>();
    for (const r of [...c.main.residents, ...c.branch!.residents.filter((x) => !x.commute)]) seen.set(r.name, (seen.get(r.name) ?? 0) + 1);
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
    // Те же имена после загрузки
    const back = City.restore(JSON.parse(JSON.stringify(c.serialize())))!;
    expect(back.branch!.residents.map((r) => r.name)).toEqual(c.branch!.residents.map((r) => r.name));
  }, 60_000);

  it('после загрузки город идёт шаг в шаг с несохранённым', () => {
    const c = city();
    c.branch!.openCafe('bistro');
    c.branch!.cafe.hire('shift');
    c.advance(MINUTES_PER_DAY + 333);
    const back = City.restore(JSON.parse(JSON.stringify(c.serialize())))!;
    for (let h = 0; h < 30; h++) {
      c.advance(60);
      back.advance(60);
      expect(back.main.cash).toBe(c.main.cash);
      expect(back.branch!.today).toBe(c.branch!.today);
    }
  }, 120_000);
});
