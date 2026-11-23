import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from '../src/sim/i18n';
import { isFemale, NAMES_EN, NAMES_RU } from '../src/sim/residents';
import { Simulation } from '../src/sim/simulation';

describe('Имена жителей в английской версии', () => {
  afterEach(() => setLang('ru'));

  it('списки той же длины — город тот же на обоих языках', () => {
    expect(NAMES_EN.first.length).toBe(NAMES_RU.first.length);
    expect(NAMES_EN.last.length).toBe(NAMES_RU.last.length);
    expect(NAMES_EN.spareFirst.length).toBe(NAMES_RU.spareFirst.length);
    expect(NAMES_EN.spareLast.length).toBe(NAMES_RU.spareLast.length);
    // Пол совпадает по местам: «зашла» / «зашёл» не меняется от языка
    NAMES_RU.first.forEach((n, i) => expect(isFemale(NAMES_EN.first[i])).toBe(isFemale(n)));
    NAMES_RU.spareFirst.forEach((n, i) => expect(isFemale(NAMES_EN.spareFirst[i])).toBe(isFemale(n)));
  });

  it('тот же seed — те же люди с теми же маршрутами, но с английскими именами', () => {
    const ru = new Simulation(5);
    setLang('en');
    const en = new Simulation(5);
    expect(en.residents.length).toBe(ru.residents.length);
    let english = 0;
    en.residents.forEach((r, i) => {
      const o = ru.residents[i];
      expect(r.kind).toBe(o.kind);
      expect(r.homeId).toBe(o.homeId);
      expect(r.workId).toBe(o.workId);
      expect(isFemale(r.name)).toBe(isFemale(o.name));
      if (/^[A-Za-z. ]+$/.test(r.name)) english++;
    });
    // Все, кроме героев (их имена задаются переводом при запуске игры), — по-английски
    expect(english).toBeGreaterThanOrEqual(en.residents.length - 4);
    // Тёзок столько же, сколько в русской версии: имена соответствуют один к одному
    expect(new Set(en.residents.map((r) => r.name)).size).toBe(new Set(ru.residents.map((r) => r.name)).size);
  });
});
