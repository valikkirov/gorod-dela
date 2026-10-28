// Кредит (GDD §8.1, §13.4 блок 13): помощь-толчок, а не образ жизни.
// Один кредит за раз, новый — после погашения и паузы. Банк смотрит историю и не кредитует убыточную точку,
// частник даёт всегда, но дорого и не больше двух раз за игру. Проценты — расход дня, возврат долга — нет.
import type { DayReport } from './cafe';

export type LoanSource = 'bank' | 'private';

export interface LoanTerms {
  /** Сколько недель платить */
  weeks: number;
  /** Процент за неделю от взятой суммы */
  weeklyRate: number;
  /** Штраф за просрочку: доля оставшегося долга */
  penalty: number;
  min: number;
}

export const LOAN_TERMS: Record<LoanSource, LoanTerms> = {
  bank: { weeks: 6, weeklyRate: 0.03, penalty: 0.05, min: 10_000 },
  private: { weeks: 3, weeklyRate: 0.08, penalty: 0.1, min: 5_000 },
};

export const LOAN = {
  /** Банк смотрит неделю работы — раньше не даёт */
  bankFromDay: 7,
  /** Лимит банка: база + за каждую неделю в плюсе + за веху, не больше max */
  bankBase: 40_000,
  bankPerGoodWeek: 20_000,
  bankPerMilestone: 10_000,
  bankMax: 150_000,
  /** Банк отказывает, если за последние 7 дней точка потеряла больше этого */
  bankRefuseLoss: 35_000,
  privateMax: 40_000,
  /** Частник выручает не больше стольких раз за игру */
  privateTimes: 2,
  /** После погашения — пауза перед новым кредитом, дней */
  cooldownDays: 7,
  /** Шаг суммы в интерфейсе */
  step: 5_000,
};

export const LOAN_LABEL: Record<LoanSource, string> = {
  bank: 'Банк',
  private: 'Частный заём',
};

export interface Loan {
  source: LoanSource;
  /** Сколько взяли */
  amount: number;
  /** Сколько тела долга осталось */
  left: number;
  /** День, когда взяли; платежи — каждые 7 дней от него */
  takenDay: number;
  nextDue: number;
  paidWeeks: number;
  /** Сколько раз платёж пришёлся на пустую кассу */
  late: number;
}

export interface LoanHistory {
  privateTaken: number;
  /** Последний день погашения — для паузы перед новым */
  repaidDay: number | null;
  /** Платежи вовремя и с опозданием — кредитная история */
  onTime: number;
  late: number;
}

export const emptyHistory = (): LoanHistory => ({ privateTaken: 0, repaidDay: null, onTime: 0, late: 0 });

/** Платёж за неделю: равная часть долга + проценты от взятой суммы */
export function weeklyPayment(l: Pick<Loan, 'source' | 'amount'>): { principal: number; interest: number } {
  const t = LOAN_TERMS[l.source];
  return { principal: Math.round(l.amount / t.weeks), interest: Math.round(l.amount * t.weeklyRate) };
}

/** Сколько всего вернёшь сверху: проценты за весь срок */
export function totalInterest(source: LoanSource, amount: number): number {
  const t = LOAN_TERMS[source];
  return Math.round(amount * t.weeklyRate) * t.weeks;
}

export interface Offer {
  source: LoanSource;
  /** null — можно, иначе почему нельзя */
  refusal: string | null;
  max: number;
}

/** Как сейчас с деньгами — чтобы до кредита было видно, поможет ли он */
export interface CashDiagnosis {
  /** Сколько дней с открытой точкой посчитано (до 7) и из них рабочих */
  span: number;
  days: number;
  /** Прибыль за эти дни: выручка минус все расходы дня, без вложений */
  weekProfit: number;
  /** Вложения за те же дни: оборудование, вещи, улучшения */
  invested: number;
  /** profit — точка зарабатывает; loss — точка сама в убытке; early — данных мало */
  kind: 'profit' | 'loss' | 'early';
}

export function cashDiagnosis(reports: Pick<DayReport, 'opened' | 'dayOff' | 'profit' | 'invested'>[]): CashDiagnosis {
  const last = reports.filter((r) => r.opened).slice(-7);
  const days = last.filter((r) => !r.dayOff).length;
  const weekProfit = last.reduce((s, r) => s + r.profit, 0);
  const invested = last.reduce((s, r) => s + (r.invested ?? 0), 0);
  const kind = days < 3 ? 'early' : weekProfit > 0 ? 'profit' : 'loss';
  return { span: last.length, days, weekProfit, invested, kind };
}

/** Платёж в неделю против недельной прибыли: что останется */
export function paymentLeft(d: CashDiagnosis, payment: number): number | null {
  if (d.kind === 'early') return null;
  // Неполная неделя — пересчитываем на 7 дней
  const perWeek = d.span >= 7 ? d.weekProfit : Math.round((d.weekProfit / Math.max(1, d.span)) * 7);
  return perWeek - payment;
}
