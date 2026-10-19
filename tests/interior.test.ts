import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { Interior, INTERIOR, preset, PRESETS } from '../src/sim/interior';
import { Simulation } from '../src/sim/simulation';

function openKnown(sim: Simulation): void {
  sim.openCafe();
  for (const r of sim.residents) r.aware = true;
}

describe('Зал кафе', () => {
  it('открытие кафе даёт «Стандарт»: два столика, 4 места, уюта нет', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    expect(sim.cafe.interior.matches('standard')).toBe(true);
    expect(sim.cafe.interior.seats).toBe(4);
    expect(sim.cafe.interior.cozy).toBe(0);
  });

  it('у киоска зала нет', () => {
    const sim = new Simulation(1);
    sim.openCafe('kiosk');
    expect(sim.hasHall).toBe(false);
    expect(sim.applyPreset('cozy')).toBe(false);
  });

  it('комплектации растут по местам и уюту', () => {
    const hall = PRESETS.map((p) => {
      const i = new Interior();
      i.load(p.layout);
      return [i.seats, i.cozy];
    });
    for (let k = 1; k < hall.length; k++) {
      expect(hall[k][0]).toBeGreaterThanOrEqual(hall[k - 1][0]);
      expect(hall[k][1]).toBeGreaterThan(hall[k - 1][1]);
    }
  });

  it('комплектация: новое покупается, лишнее продаётся за половину, совпавшее не трогается', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    const cash = sim.cash;
    const cost = sim.cafe.interior.presetCost('cozy');
    // Два столика уже стоят — платим только за диван, картину, цветок и коврик
    expect(cost).toBe(15_000 + 3_000 + 2_000 + 3_000);
    expect(sim.applyPreset('cozy')).toBe(true);
    expect(sim.cash).toBe(cash - cost);
    expect(sim.cafe.interior.matches('cozy')).toBe(true);
    // Обратно к «Стандарту» — продаём лишнее за половину
    expect(sim.cafe.interior.presetCost('standard')).toBe(-Math.round(23_000 * INTERIOR.sellShare));
  });

  it('свой дизайн: поставить, заменить и продать', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    const cash = sim.cash;
    expect(sim.placeFurniture('window', 'bar')).toBe(true);
    expect(sim.placeFurniture('window', 'sofa')).toBe(false); // диван у окна не встаёт
    expect(sim.placeFurniture('table-1', 'table4')).toBe(true); // столик на двоих продаётся
    expect(sim.cash).toBe(cash - 12_000 - (11_000 - 3_000));
    expect(sim.cafe.interior.seats).toBe(3 + 4 + 2);
    expect(sim.sellFurniture('window')).toBe(true);
    expect(sim.cash).toBe(cash - 12_000 - 8_000 + 6_000);
    expect(sim.sellFurniture('window')).toBe(false);
  });

  it('мест нет — гость берёт с собой и уходит, в зале сидит не больше, чем мест', () => {
    const sim = new Simulation(3);
    openKnown(sim);
    // Пустой зал: сесть некуда вообще
    for (const slot of Object.keys(sim.cafe.interior.layout)) sim.sellFurniture(slot);
    expect(sim.cafe.interior.seats).toBe(0);
    let over = false;
    for (let m = 0; m < 3 * MINUTES_PER_DAY; m += 5) {
      sim.advance(5);
      if (sim.seated() > 0) over = true;
    }
    expect(over).toBe(false);
    expect(sim.reports.some((d) => (d.noSeat ?? 0) > 0) || (sim.cafe.today.noSeat ?? 0) > 0).toBe(true);
  });

  it('уют прибавляет продаж: «Премиум» против «Стандарта» за неделю', () => {
    const run = (cozy: boolean) => {
      const sim = new Simulation(5);
      openKnown(sim);
      if (cozy) {
        sim.cash += 200_000;
        sim.applyPreset('premium');
      }
      sim.advance(7 * MINUTES_PER_DAY);
      return sim.reports.reduce((s, d) => s + (d.extras ?? 0), 0);
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });

  it('старое сохранение: купленный «Уютный интерьер» превращается в комплектацию «Уют»', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    const save = JSON.parse(JSON.stringify(sim.serialize()));
    delete save.cafe.interior;
    save.cafe.upgrades = ['interior'];
    const back = Simulation.restore(save)!;
    expect(back.cafe.interior.matches('cozy')).toBe(true);
    expect(preset('cozy').layout.corner).toBe('sofa');
  });
});
