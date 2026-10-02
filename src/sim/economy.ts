// Экономика: все суммы — целые рубли с кодом валюты (GDD: валюта у каждой суммы).
export type Currency = 'RUB';

export const CURRENCY: Currency = 'RUB';

export const ECONOMY = {
  startCash: 500_000,
  cafeOpeningCost: 300_000,
  /** 90 000 ₽ в месяц → списывается каждый игровой день */
  rentPerDay: 3_000,
  utilitiesPerDay: 500,
  /** Бариста почасово. Ночью (22:00–6:00) — с надбавкой, как по ТК */
  baristaWagePerHour: 300,
  /** Бариста на смене: фикс за смену до 12 часов с открытия кафе */
  shiftWage: 2_500,
  shiftHours: 12,
  nightBonus: 0.2,
  maxBaristas: 2,
  /** УСН «доходы» */
  taxRate: 0.06,
  /** Столько дней подряд в минусе — банкротство */
  bankruptDays: 3,
  priceStep: 10,
} as const;

export function formatMoney(amount: number, currency: Currency = CURRENCY): string {
  const sign = amount < 0 ? '−' : '';
  const abs = Math.abs(Math.round(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${abs} ${currency === 'RUB' ? '₽' : currency}`;
}
