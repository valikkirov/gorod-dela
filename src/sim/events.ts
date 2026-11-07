// События-дилеммы: утром на улице что-то происходит, и игрок выбирает, как поступить.
// У каждого варианта видна цена и последствие — без скрытых штрафов. Не выбрал до конца дня — сработает
// вариант «по умолчанию» (обычно «ничего не делать»).
// Здесь только данные и тексты; что именно меняется в мире — в Simulation.chooseEvent.
import { ECONOMY, formatMoney } from './economy';
import { ingredient, type IngredientId } from './stock';

import { L, tr } from './i18n';
export type EventId = 'breakdown' | 'festival' | 'supplier' | 'office-order' | 'blogger' | 'day-off';

export const EVENTS = {
  /** С какого дня работы начинаются события */
  fromDay: 3,
  /** Шанс события в обычное утро */
  chance: 0.25,
  /** Одно и то же событие — не чаще раза в столько дней */
  cooldownDays: 7,
  breakdown: { urgentCost: 1_000, urgentMinutes: 45, laterCost: 500 },
  /** Поломка случается реже остальных */
  weight: { breakdown: 0.5 } as Partial<Record<EventId, number>>,
  festival: { cost: 2_000, boost: 1.25 },
  supplier: { qty: 100, discount: 0.5 },
  order: { qty: 20, discount: 0.1, minute: 11 * 60 },
  blogger: { cost: 1_000, success: 0.6, reach: 14 },
  dayOff: { extra: 0.5 },
} as const;

/** Что известно о событии, когда оно случилось: подставляется в тексты и в последствия */
export interface PendingEvent {
  id: EventId;
  day: number;
  /** Поставщик: что предлагает */
  ingredientId?: IngredientId;
  /** Заказ офиса: какое блюдо и сколько платят */
  itemId?: string;
  itemName?: string;
  pay?: number;
  /** Заказ офиса: сколько продуктов докупим и сколько минут стойка будет занята */
  ingredientCost?: number;
  /** Отгул: какой бариста */
  baristaId?: number;
  /** Есть ли вторая кофемашина: тогда поломка не останавливает кофе, а замедляет */
  spareMachine?: boolean;
}

export interface EventOption {
  id: string;
  label: string;
  /** Цена и последствие одной строкой */
  hint: string;
}

export interface EventCard {
  icon: string;
  title: string;
  text: string;
  /** Что на кону, если ничего не делать: коротко, до кнопок (UI 2.1) */
  stake?: string;
  options: EventOption[];
  /** Что сработает, если не выбрать до конца дня */
  fallback: string;
}

const money = (n: number) => formatMoney(n);

export function supplierPrice(id: IngredientId): { full: number; sale: number } {
  const full = Math.round(ingredient(id).unitCost * EVENTS.supplier.qty);
  return { full, sale: Math.round(full * (1 - EVENTS.supplier.discount)) };
}

export function card(e: PendingEvent): EventCard {
  switch (e.id) {
    case 'breakdown': {
      const b = EVENTS.breakdown;
      return e.spareMachine
        ? {
            icon: '🔧',
            title: L('Сломалась кофемашина'),
            text: tr`Одна из двух кофемашин не включается. Вторая работает, но заказы будут готовиться в полтора раза дольше.`,
            stake: tr`Если ждать мастера до завтра, сегодня очередь будет длиннее и часть гостей уйдёт`,
            options: [
              { id: 'urgent', label: L('Срочный мастер'), hint: tr`${money(b.urgentCost)}, через 45 минут всё как было` },
              { id: 'later', label: L('Мастер завтра'), hint: tr`${money(b.laterCost)}, сегодня работаем медленнее` },
            ],
            fallback: 'later',
          }
        : {
            icon: '🔧',
            title: L('Сломалась кофемашина'),
            text: tr`Утром кофемашина не включилась. Пока её не починят, кофе не будет — остальное меню работает.`,
            stake: tr`Если ждать мастера до завтра, продажи кофе сегодня потеряны`,
            options: [
              { id: 'urgent', label: L('Срочный мастер'), hint: tr`${money(b.urgentCost)}, кофе снова будет через 45 минут` },
              { id: 'later', label: L('Мастер завтра'), hint: tr`${money(b.laterCost)}, сегодня без кофе` },
            ],
            fallback: 'later',
          };
    }
    case 'festival': {
      const f = EVENTS.festival;
      return {
        icon: '🎈',
        title: L('Праздник района в сквере'),
        text: tr`Сегодня в сквере праздник: музыка, ярмарка, народ со всего района. Организаторы предлагают место для столика с вашим меню.`,
        stake: tr`Шанс разом познакомить с точкой полрайона. Без запаса на складе гости уйдут ни с чем`,
        options: [
          {
            id: 'stall',
            label: L('Поставить столик'),
            hint: tr`${money(f.cost)}: все, кто придёт в сквер, узнают о вас, гостей сегодня больше. Проверь склад`,
          },
          { id: 'skip', label: L('Не участвовать'), hint: L('Бесплатно, обычный выходной') },
        ],
        fallback: 'skip',
      };
    }
    case 'supplier': {
      const ing = ingredient(e.ingredientId!);
      const p = supplierPrice(e.ingredientId!);
      return {
        icon: '📦',
        title: L('Поставщик распродаёт остатки'),
        text: tr`${ing.name}: ${EVENTS.supplier.qty} порций за ${money(p.sale)} вместо ${money(p.full)}. Привезут сразу. Хранится ${ing.shelfDays} дн. — что не продашь, спишется.`,
        stake: tr`Выгодно, только если успеешь продать до конца срока`,
        options: [
          { id: 'take', label: L('Взять партию'), hint: tr`−${money(p.sale)}, на складе +${EVENTS.supplier.qty} порций` },
          { id: 'decline', label: L('Отказаться'), hint: L('Ничего не меняется') },
        ],
        fallback: 'decline',
      };
    }
    case 'office-order': {
      const o = EVENTS.order;
      return {
        icon: '🏢',
        title: L('Заказ от офиса «Север»'),
        text: tr`Офис заказывает ${o.qty} порций «${e.itemName}» на завтра к полудню и платит ${money(e.pay!)} (это со скидкой 10 %). Продукты под заказ привезут отдельно. Готовить начнёте в 11:00, перед обедом: пока заказ не готов, стойка занята и новых гостей не обслуживают.`,
        stake: tr`Крупная оплата, но в обед стойка будет занята`,
        options: [
          {
            id: 'accept',
            label: L('Взять заказ'),
            hint: tr`+${money(e.pay!)} завтра, продукты −${money(e.ingredientCost!)}. Один без бариста готовить его около 40 минут`,
          },
          { id: 'decline', label: L('Отказаться'), hint: L('Ничего не меняется') },
        ],
        fallback: 'decline',
      };
    }
    case 'blogger': {
      const b = EVENTS.blogger;
      return {
        icon: '📱',
        title: L('Блогер хочет снять обзор'),
        text: tr`Местный блогер просит угостить его с друзьями и обещает рассказать о вас подписчикам. Обзоры у него выходят не всегда.`,
        stake: tr`Риск: продукты уйдут, а обзор может не выйти`,
        options: [
          { id: 'treat', label: L('Угостить'), hint: tr`${money(b.cost)} продуктами. Если обзор выйдет, о вас узнает молодёжь` },
          { id: 'decline', label: L('Вежливо отказать'), hint: L('Ничего не меняется') },
        ],
        fallback: 'decline',
      };
    }
    case 'day-off': {
      const extra = Math.round(ECONOMY.shiftWage * EVENTS.dayOff.extra);
      return {
        icon: '🙋',
        title: L('Бариста просит отгул'),
        text: tr`Бариста на смене просит сегодня выходной: семейные дела. Без него ты один за стойкой.`,
        stake: tr`Если отпустить, в часы пик гостей может быть некому обслужить`,
        options: [
          { id: 'let', label: L('Отпустить'), hint: tr`Сегодня без бариста, зарплату за смену не платишь` },
          { id: 'ask', label: L('Попросить выйти'), hint: tr`Он выйдет, но за смену +${money(extra)}` },
        ],
        fallback: 'let',
      };
    }
  }
}

/** Строка в отчёт: что случилось и что выбрали */
export function resultLine(e: PendingEvent, optionId: string, auto: boolean): string {
  const c = card(e);
  const opt = c.options.find((o) => o.id === optionId)!;
  return `${c.icon} ${c.title}: ${opt.label.toLowerCase()}${auto ? tr` (не успели решить)` : ''}`;
}
