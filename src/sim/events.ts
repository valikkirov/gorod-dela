// События-дилеммы: утром на улице что-то происходит, и игрок выбирает, как поступить.
// У каждого варианта видна цена и последствие — без скрытых штрафов. Не выбрал до конца дня — сработает
// вариант «по умолчанию» (обычно «ничего не делать»).
// Здесь только данные и тексты; что именно меняется в мире — в Simulation.chooseEvent.
import { ECONOMY, formatMoney } from './economy';
import { isFemale } from './residents';
import { ingredient, type IngredientId } from './stock';

import { L, tr } from './i18n';
export type EventId =
  | 'breakdown'
  | 'festival'
  | 'supplier'
  | 'office-order'
  | 'blogger'
  | 'day-off'
  | 'corporate'
  | 'fair'
  | 'contract'
  | 'contract-renew'
  | 'complaint'
  | 'fridge'
  | 'inspection'
  | 'farm';

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
  /** Новогодний сезон. Корпоратив: офис заказывает праздничное к вечеру, платит без скидки и с надбавкой за срочность */
  corporate: { qty: 30, premium: 0.1, minute: 16 * 60 },
  /** Новогодняя ярмарка в сквере — как праздник района, но народу больше */
  fair: { cost: 3_000, boost: 1.4 },
  /**
   * Договор с офисом после удачного разового заказа: каждый будний день порции к полудню, две недели.
   * Обязательство — в 11:00 открыто; сорвал strikes заказов — договор расторгнут, офис не обращается banDays.
   * Без срывов офис предлагает продлить и берёт на grow порций больше (до maxQty).
   */
  /** Свой срок между повторами для событий с долгим хвостом (вместо cooldownDays) */
  cooldown: { fridge: 30, inspection: 35, farm: 35, complaint: 10 } as Partial<Record<EventId, number>>,
  /**
   * Жалоба гостя. Извиниться и угостить — гость теплеет и через несколько дней рассказывает соседям;
   * промолчать — через несколько дней пишет в чат дома, и соседи, которые вас знают, холоднее.
   */
  complaint: { below: 0, cost: 300, warm: 0.25, goodAfter: 3, badAfter: 4, tell: 4, chill: 6, chillBy: 0.15 },
  /**
   * Холодильник. Подлатать дёшево, но с шансом relapse через relapseFrom–relapseTo дней он потечёт снова:
   * скоропорт пропадёт и всё равно придётся менять компрессор.
   */
  fridge: { patchCost: 400, fixCost: 2_500, relapse: 0.7, relapseFrom: 3, relapseTo: 7 },
  /**
   * Санитарная проверка: предупреждают заранее, приходят через from–to дней с 10 до 15.
   * Подготовились — проверка за 30 минут. Нет — с шансом fail штраф и два часа на устранение, иначе час.
   */
  inspection: { prepCost: 1_500, from: 2, to: 6, fail: 0.6, fine: 5_000, readyMinutes: 30, passMinutes: 60, failMinutes: 120, fromDay: 10 },
  /** Ферма: продукт на 25 % дешевле четыре недели, но раз в неделю с шансом bad партия приезжает испорченной */
  farm: { discount: 0.25, days: 28, bad: 0.35, fromDay: 7 },
  contract: { qty: 12, discount: 0.1, minute: 11 * 60, weekdays: 10, strikes: 2, banDays: 28, grow: 4, maxQty: 20, afterOrders: 1 },
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
  /** Корпоратив и договор: сколько порций (у заказа офиса — EVENTS.order.qty) */
  qty?: number;
  /** Отгул: какой бариста */
  baristaId?: number;
  /** Есть ли вторая кофемашина: тогда поломка не останавливает кофе, а замедляет */
  spareMachine?: boolean;
  /** Жалоба: кто жалуется и на что */
  residentId?: number;
  residentName?: string;
  topic?: ComplaintTopic;
}

/** На что жалуется гость: из того, как ему запомнился вчерашний визит */
export type ComplaintTopic = 'long-wait' | 'pricey' | 'not-my-taste' | 'cold';

function complaintText(topic: ComplaintTopic, item: string): string {
  switch (topic) {
    case 'long-wait':
      return L('вчера заказ пришлось ждать слишком долго');
    case 'pricey':
      return tr`вчера за\u00a0«${item}» взяли слишком много`;
    case 'not-my-taste':
      return tr`вчера «${item}» приготовили совсем не\u00a0так`;
    case 'cold':
      return L('вчера кофе принесли едва тёплым');
  }
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
    case 'corporate': {
      const c = EVENTS.corporate;
      return {
        icon: '🎄',
        title: L('Новогодний корпоратив'),
        text: tr`Бизнес-центр празднует и заказывает ${e.qty ?? c.qty} порций «${e.itemName}» на завтра к 16:00 — за ${money(e.pay!)}, с надбавкой за срочность. Продукты под заказ привезут отдельно. Пока заказ готовится, стойка занята и новых гостей не обслуживают.`,
        stake: tr`Хорошие деньги, но в предвечерний час стойка будет занята`,
        options: [
          { id: 'accept', label: L('Взять заказ'), hint: tr`+${money(e.pay!)} завтра, продукты −${money(e.ingredientCost!)}` },
          { id: 'decline', label: L('Отказаться'), hint: L('Ничего не меняется') },
        ],
        fallback: 'decline',
      };
    }
    case 'fair': {
      const f = EVENTS.fair;
      return {
        icon: '🎪',
        title: L('Новогодняя ярмарка в сквере'),
        text: tr`Сегодня в сквере у ёлки ярмарка: гирлянды, каток, горячие напитки. Народ со всего района. Организаторы предлагают место для вашего домика.`,
        stake: tr`Полрайона узнает о вас, а с горячим в меню — ещё и купит. Проверь склад`,
        options: [
          { id: 'stall', label: L('Поставить домик'), hint: tr`${money(f.cost)}: все, кто придёт в сквер, узнают о вас, гостей сегодня заметно больше` },
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
    case 'contract': {
      const c = EVENTS.contract;
      return {
        icon: '🤝',
        title: L('«Север» предлагает договор'),
        text: tr`После удачного заказа офис «Север» хочет обедать у\u00a0вас постоянно: ${e.qty} порций «${e.itemName}» каждый будний день к\u00a0полудню, две недели. Платят ${money(e.pay!)} за\u00a0день (со\u00a0скидкой 10\u00a0%), продукты под заказ закупаются каждое утро. Условие одно: в\u00a011:00 кафе открыто. Сорвёте ${c.strikes} заказа\u00a0— договор расторгнут.`,
        stake: tr`Каждый будний день стабильные деньги, но в\u00a0обед стойка занята`,
        options: [
          { id: 'sign', label: L('Подписать'), hint: tr`+${money(e.pay!)} в\u00a0будни, продукты −${money(e.ingredientCost!)} в\u00a0день` },
          { id: 'decline', label: L('Отказаться'), hint: L('Разовые заказы офиса по-прежнему возможны') },
        ],
        fallback: 'decline',
      };
    }
    case 'contract-renew': {
      return {
        icon: '🤝',
        title: L('«Север» хочет продлить договор'),
        text: tr`Две недели без единого срыва: офис доволен и\u00a0готов продлить ещё на\u00a0две недели, теперь ${e.qty} порций «${e.itemName}» в\u00a0день за\u00a0${money(e.pay!)}.`,
        stake: tr`Порций больше\u00a0— стойка в\u00a0обед занята дольше`,
        options: [
          { id: 'renew', label: L('Продлить'), hint: tr`+${money(e.pay!)} в\u00a0будни, продукты −${money(e.ingredientCost!)} в\u00a0день` },
          { id: 'stop', label: L('Закончить'), hint: L('Договор завершится, офис останется доволен') },
        ],
        fallback: 'stop',
      };
    }
    case 'complaint': {
      const c = EVENTS.complaint;
      const name = e.residentName ?? '';
      const first = name.split(' ')[0];
      const f = isFemale(name);
      return {
        icon: '😤',
        title: f ? tr`${first} недовольна` : tr`${first} недоволен`,
        text: f
          ? tr`${name} подошла к\u00a0стойке: ${complaintText(e.topic ?? 'cold', e.itemName ?? '')}. Говорит негромко, но\u00a0её слышат за\u00a0соседними столиками.`
          : tr`${name} подошёл к\u00a0стойке: ${complaintText(e.topic ?? 'cold', e.itemName ?? '')}. Говорит негромко, но\u00a0его слышат за\u00a0соседними столиками.`,
        stake: tr`Живёт рядом и\u00a0знает полдома. Как обойдутся с\u00a0гостем, через несколько дней узнают соседи`,
        options: [
          { id: 'apologize', label: L('Извиниться и\u00a0угостить'), hint: tr`${money(c.cost)}: гость оттает и\u00a0расскажет соседям, как с\u00a0ним обошлись` },
          { id: 'ignore', label: L('Промолчать'), hint: tr`Бесплатно. Через несколько дней гость напишет в\u00a0чат дома` },
        ],
        fallback: 'ignore',
      };
    }
    case 'fridge': {
      const f = EVENTS.fridge;
      return {
        icon: '🧊',
        title: L('Течёт холодильник'),
        text: tr`Под холодильником лужа, компрессор гудит громче обычного. Продукты пока холодные. Мастер говорит: можно подлатать, а\u00a0можно поменять компрессор.`,
        stake: tr`Заплатка может не\u00a0продержаться: если холодильник встанет, скоропорт пропадёт за\u00a0ночь`,
        options: [
          { id: 'fix', label: L('Поменять компрессор'), hint: tr`${money(f.fixCost)}, и\u00a0надолго забыть` },
          { id: 'patch', label: L('Подлатать'), hint: tr`${money(f.patchCost)}. Скорее всего, через несколько дней потечёт снова` },
        ],
        fallback: 'patch',
      };
    }
    case 'inspection': {
      const i = EVENTS.inspection;
      return {
        icon: '🧾',
        title: L('Санитарная проверка'),
        text: tr`Соседи по\u00a0улице предупредили: в\u00a0районе ходит санитарная проверка, на\u00a0этой неделе придут и\u00a0к\u00a0вам. Когда именно\u00a0— не\u00a0говорят.`,
        stake: tr`Без подготовки могут найти нарушения: штраф и\u00a0пара часов, когда стойка стоит`,
        options: [
          { id: 'prepare', label: L('Подготовиться'), hint: tr`${money(i.prepCost)} на\u00a0уборку и\u00a0журналы. Проверка пройдёт за\u00a0полчаса` },
          { id: 'risk', label: L('Работать как обычно'), hint: tr`Бесплатно. Нашли нарушения\u00a0— штраф ${money(i.fine)} и\u00a0два часа без гостей` },
        ],
        fallback: 'risk',
      };
    }
    case 'farm': {
      const f = EVENTS.farm;
      const ing = ingredient(e.ingredientId!);
      return {
        icon: '🚜',
        title: L('Ферма предлагает договор'),
        text: tr`Фермер из\u00a0области готов возить ${ing.name.toLowerCase()} на\u00a0${Math.round(f.discount * 100)}\u00a0% дешевле четыре недели. Но\u00a0у\u00a0фермы бывают сбои: иногда партия приезжает испорченной, и\u00a0в\u00a0этот день продукта нет.`,
        stake: tr`Экономия на\u00a0каждой поставке против риска остаться без продукта в\u00a0случайный день`,
        options: [
          { id: 'sign', label: L('Подписать на\u00a0месяц'), hint: tr`−${Math.round(f.discount * 100)}\u00a0% на\u00a0поставки, но\u00a0иногда партия пропадёт` },
          { id: 'decline', label: L('Остаться со\u00a0своим поставщиком'), hint: L('Ничего не\u00a0меняется') },
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
