import { L } from './i18n';
// «Первые шаги»: короткие задачи на первые минуты игры — чтобы новичок сразу видел прогресс.
// Наград деньгами нет: только галочка и похвала, баланс не меняется.

export type StepId = 'guests' | 'price' | 'stock' | 'revenue' | 'resident';

export interface FirstStep {
  id: StepId;
  title: string;
  hint: string;
}

export const FIRST_STEPS: FirstStep[] = [
  { id: 'guests', title: L('Обслужи 10 гостей'), hint: L('Открой кафе и дождись первых посетителей') },
  { id: 'price', title: L('Поменяй цену'), hint: L('Меню → «Меню и\u00a0цены»: нажми на позицию и поставь свою цену') },
  { id: 'stock', title: L('Закажи продукты'), hint: L('Меню → «Склад»: закажи впрок или поменяй, сколько держать') },
  { id: 'revenue', title: L('Выручка за день от 3 000 ₽'), hint: L('Считается в конце дня') },
  { id: 'resident', title: L('Узнай, чего хотят жители'), hint: L('Нажми на любого жителя на карте: куда идёт, что любит, знает ли о тебе') },
];

/** Сколько гостей нужно для первого шага */
export const STEP_GUESTS = 10;
export const STEP_REVENUE = 3000;
