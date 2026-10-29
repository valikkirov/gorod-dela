// События-дилеммы: утром на улице что-то происходит, и игрок выбирает, как поступить.
// У каждого варианта видна цена и последствие — без скрытых штрафов. Не выбрал до конца дня — сработает
// вариант «по умолчанию» (обычно «ничего не делать»).
// Здесь только данные и тексты; что именно меняется в мире — в Simulation.chooseEvent.
import { ECONOMY, formatMoney } from './economy';
import { ingredient, type IngredientId } from './stock';

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

const NB = ' ';
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
            title: 'Сломалась кофемашина',
            text: `Одна из${NB}двух кофемашин не${NB}включается. Вторая работает, но${NB}заказы будут готовиться в${NB}полтора раза дольше.`,
            stake: `Если ждать мастера до${NB}завтра, сегодня очередь будет длиннее и${NB}часть гостей уйдёт`,
            options: [
              { id: 'urgent', label: 'Срочный мастер', hint: `${money(b.urgentCost)}, через 45${NB}минут всё как было` },
              { id: 'later', label: 'Мастер завтра', hint: `${money(b.laterCost)}, сегодня работаем медленнее` },
            ],
            fallback: 'later',
          }
        : {
            icon: '🔧',
            title: 'Сломалась кофемашина',
            text: `Утром кофемашина не${NB}включилась. Пока её не${NB}починят, кофе не${NB}будет — остальное меню работает.`,
            stake: `Если ждать мастера до${NB}завтра, продажи кофе сегодня потеряны`,
            options: [
              { id: 'urgent', label: 'Срочный мастер', hint: `${money(b.urgentCost)}, кофе снова будет через 45${NB}минут` },
              { id: 'later', label: 'Мастер завтра', hint: `${money(b.laterCost)}, сегодня без кофе` },
            ],
            fallback: 'later',
          };
    }
    case 'festival': {
      const f = EVENTS.festival;
      return {
        icon: '🎈',
        title: 'Праздник района в сквере',
        text: `Сегодня в${NB}сквере праздник: музыка, ярмарка, народ со${NB}всего района. Организаторы предлагают место для${NB}столика с${NB}вашим меню.`,
        stake: `Шанс разом познакомить с${NB}точкой полрайона. Без${NB}запаса на${NB}складе гости уйдут ни${NB}с${NB}чем`,
        options: [
          {
            id: 'stall',
            label: 'Поставить столик',
            hint: `${money(f.cost)}: все, кто придёт в${NB}сквер, узнают о${NB}вас, гостей сегодня больше. Проверь склад`,
          },
          { id: 'skip', label: 'Не участвовать', hint: 'Бесплатно, обычный выходной' },
        ],
        fallback: 'skip',
      };
    }
    case 'supplier': {
      const ing = ingredient(e.ingredientId!);
      const p = supplierPrice(e.ingredientId!);
      return {
        icon: '📦',
        title: 'Поставщик распродаёт остатки',
        text: `${ing.name}: ${EVENTS.supplier.qty}${NB}порций за${NB}${money(p.sale)} вместо ${money(p.full)}. Привезут сразу. Хранится ${ing.shelfDays}${NB}дн.${NB}— что не${NB}продашь, спишется.`,
        stake: `Выгодно, только если успеешь продать до${NB}конца срока`,
        options: [
          { id: 'take', label: 'Взять партию', hint: `−${money(p.sale)}, на${NB}складе +${EVENTS.supplier.qty}${NB}порций` },
          { id: 'decline', label: 'Отказаться', hint: 'Ничего не меняется' },
        ],
        fallback: 'decline',
      };
    }
    case 'office-order': {
      const o = EVENTS.order;
      return {
        icon: '🏢',
        title: 'Заказ от офиса «Север»',
        text: `Офис заказывает ${o.qty}${NB}порций «${e.itemName}» на${NB}завтра к${NB}полудню и${NB}платит ${money(e.pay!)} (это со${NB}скидкой 10${NB}%). Продукты под заказ привезут отдельно. Готовить начнёте в${NB}11:00, перед обедом: пока заказ не${NB}готов, стойка занята и${NB}новых гостей не${NB}обслуживают.`,
        stake: `Крупная оплата, но${NB}в${NB}обед стойка будет занята`,
        options: [
          {
            id: 'accept',
            label: 'Взять заказ',
            hint: `+${money(e.pay!)} завтра, продукты −${money(e.ingredientCost!)}. Один без${NB}бариста готовить его около 40${NB}минут`,
          },
          { id: 'decline', label: 'Отказаться', hint: 'Ничего не меняется' },
        ],
        fallback: 'decline',
      };
    }
    case 'blogger': {
      const b = EVENTS.blogger;
      return {
        icon: '📱',
        title: 'Блогер хочет снять обзор',
        text: `Местный блогер просит угостить его с${NB}друзьями и${NB}обещает рассказать о${NB}вас подписчикам. Обзоры у${NB}него выходят не${NB}всегда.`,
        stake: `Риск: продукты уйдут, а${NB}обзор может не${NB}выйти`,
        options: [
          { id: 'treat', label: 'Угостить', hint: `${money(b.cost)} продуктами. Если обзор выйдет, о${NB}вас узнает молодёжь` },
          { id: 'decline', label: 'Вежливо отказать', hint: 'Ничего не меняется' },
        ],
        fallback: 'decline',
      };
    }
    case 'day-off': {
      const extra = Math.round(ECONOMY.shiftWage * EVENTS.dayOff.extra);
      return {
        icon: '🙋',
        title: 'Бариста просит отгул',
        text: `Бариста на${NB}смене просит сегодня выходной: семейные дела. Без него ты один за${NB}стойкой.`,
        stake: `Если отпустить, в${NB}часы пик гостей может быть некому обслужить`,
        options: [
          { id: 'let', label: 'Отпустить', hint: `Сегодня без бариста, зарплату за${NB}смену не${NB}платишь` },
          { id: 'ask', label: 'Попросить выйти', hint: `Он выйдет, но${NB}за${NB}смену +${money(extra)}` },
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
  return `${c.icon} ${c.title}: ${opt.label.toLowerCase()}${auto ? ` (не${NB}успели решить)` : ''}`;
}
