import { describe, expect, it } from 'vitest';
import { bindShort, HERO_BIO, heroLine, type HeroId } from '../src/sim/heroes';
import { heroOf, pickRegulars, MARINA, ARCHITECT } from '../src/sim/regulars';
import { Simulation } from '../src/sim/simulation';

const HEROES: HeroId[] = ['marina', 'lesha', 'zinaida', 'architect'];

describe('Герои', () => {
  it('у каждого героя есть описание и реплика на любой статус и причину', () => {
    for (const h of HEROES) {
      expect(HERO_BIO[h].length).toBeGreaterThan(20);
      for (const st of ['unaware', 'new', 'visiting', 'regular', 'lost'] as const) expect(heroLine(h, st).length).toBeGreaterThan(10);
      // Причина, для которой нет своей реплики, — общая фраза
      expect(heroLine(h, 'lost', 'company')).toBe(heroLine(h, 'lost'));
    }
    expect(heroLine('lesha', 'lost', 'expensive')).not.toBe(heroLine('lesha', 'lost'));
  });

  it('героев узнаём по имени: Марина на Кленовой, архитектор в деловом квартале', () => {
    const kl = new Simulation(5);
    const dl = new Simulation(5, undefined, 'delovoy');
    const names = (s: Simulation) => s.regulars.map((g) => s.residents[g.residentId].name);
    expect(names(kl)).toContain(MARINA);
    expect(names(dl)).toContain(ARCHITECT);
    expect(heroOf(MARINA)).toBe('marina');
    expect(heroOf(ARCHITECT)).toBe('architect');
    expect(heroOf('Иван Петров')).toBeNull();
    // Архитектор работает в БЦ «Стекло»
    const arch = dl.residents.find((r) => r.name === ARCHITECT)!;
    expect(arch.workId).toBe('bc-glass');
    void pickRegulars;
  });

  it('короткие слова привязаны к следующему, тире не начинает строку', () => {
    const t = bindShort('Захожу к вам на чай — и в обед');
    expect(t).toBe('Захожу к вам на чай — и в обед');
  });
});
