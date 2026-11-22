import { describe, expect, it } from 'vitest';
import { placeCitizens, type Citizen } from '../src/sim/citizens';
import { heroOf } from '../src/sim/regulars';
import { Simulation } from '../src/sim/simulation';

const LIST: Citizen[] = [
  { id: 'ivan', name: 'Иван Тестов', district: 'klenovaya', kind: 'remote' },
  { id: 'olga', name: 'Ольга Проверкина', district: 'klenovaya', kind: 'pensioner' },
  { id: 'petr', name: 'Пётр Кварталов', district: 'delovoy', kind: 'office' },
];

describe('Почётные жители', () => {
  it('получают имя и отметку, не трогая героев; в каждом городе — те же жители', () => {
    const a = new Simulation(3);
    const b = new Simulation(3);
    placeCitizens(a.residents, 'klenovaya', LIST);
    placeCitizens(b.residents, 'klenovaya', LIST);
    const ivanA = a.residents.find((r) => r.honorary === 'ivan')!;
    const ivanB = b.residents.find((r) => r.honorary === 'ivan')!;
    expect(ivanA.name).toBe('Иван Тестов');
    expect(ivanA.kind).toBe('remote');
    expect(ivanA.id).toBe(ivanB.id);
    expect(a.residents.filter((r) => r.honorary).length).toBe(2);
    // Чужой район и герои не тронуты
    expect(a.residents.some((r) => r.honorary === 'petr')).toBe(false);
    for (const r of a.residents.filter((x) => x.honorary)) expect(heroOf(r.name)).toBeNull();
  });

  it('в деловом квартале — свой житель, не архитектор', () => {
    const d = new Simulation(3, undefined, 'delovoy');
    placeCitizens(d.residents, 'delovoy', LIST);
    const p = d.residents.find((r) => r.honorary === 'petr')!;
    expect(p.name).toBe('Пётр Кварталов');
    expect(p.workId).not.toBe('bc-glass-architect');
    expect(heroOf(p.name)).toBeNull();
  });

  it('мир не сдвигается: остальные жители те же', () => {
    const a = new Simulation(4);
    const before = a.residents.map((r) => `${r.kind}/${r.homeId}/${r.workId}`);
    placeCitizens(a.residents, 'klenovaya', LIST);
    expect(a.residents.map((r) => `${r.kind}/${r.homeId}/${r.workId}`)).toEqual(before);
  });
});
