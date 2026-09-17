import dayjs from 'dayjs';

import {
  FrequencyPeriod,
  OgAddress,
  OgItem,
  OgOrder,
  OgPayment,
  OgProduct,
  OgSubscription,
} from '@/shared/service/ordergroove';
import { formatOrderId } from '@/utils/orderId';

interface ProductSummary {
  name: string;
  imageUrl: string | null;
  detailUrl: string | null;
  sku: string | null;
}

interface AddressSummary {
  name: string;
  company: string | null;
  line1: string;
  line2: string | null;
  /** "City, ST 12345" */
  locality: string;
}

export interface PaymentSummary {
  /** null for a card type Ordergroove's table does not name */
  brand: string | null;
  last4: string;
  /** "M/YYYY" as Ordergroove sends it */
  expiry: string;
}

interface SiblingProduct {
  externalProductId: string;
  /** null until the product lookup names it (the component falls back to "Product {id}") */
  name: string | null;
}

interface NextOrder {
  /** Ordergroove order public_id — the target of skip and send now */
  orderId: string;
  /** the other subscriptions' products shipping on that order, one entry per product */
  otherProducts: SiblingProduct[];
}

export interface SubscriptionCard {
  publicId: string;
  externalProductId: string;
  product: ProductSummary | null;
  quantity: number;
  frequencyDays: number;
  every: number;
  everyPeriod: FrequencyPeriod;
  /** "YYYY-MM-DD" of the earliest upcoming order holding one of its items */
  nextOrderDate: string | null;
  /** that order, with what else ships on it; null while nothing is scheduled */
  nextOrder: NextOrder | null;
  shippingAddress: AddressSummary | null;
  /** Ordergroove address public_id the subscription ships to */
  shippingAddressId: string;
  payment: PaymentSummary | null;
  /** Ordergroove timestamp when cancelled; null for active cards and for retired ones with no date */
  cancelledOn: string | null;
}

/** Each lookup is `undefined` until its query settles; a failed lookup stays `undefined`. */
interface SubscriptionLookups {
  products: Map<string, OgProduct | null> | undefined;
  addresses: OgAddress[] | undefined;
  payments: OgPayment[] | undefined;
  upcoming: { orders: OgOrder[]; items: OgItem[] } | undefined;
}

export type OrderOutcome = 'success' | 'failed' | 'cancelled' | 'processing';

export interface RecentOrder {
  publicId: string;
  /** "YYYY-MM-DD" */
  placedOn: string;
  webOrderNumber: string | null;
  orderDetailPath: string | null;
  total: string;
  currencyCode: string;
  outcome: OrderOutcome;
  /** the merchant's rejection message, failed orders only */
  message: string | null;
}

// Ordergroove reference "Credit Card Types".
const CARD_BRANDS: Record<number, string> = {
  1: 'Visa',
  2: 'Mastercard',
  3: 'American Express',
  4: 'Discover',
  5: 'Diners',
  6: 'JCB',
};

// Ordergroove reference "Order Status Codes" (spec §4.3).
const SUCCESS_STATUS = 5;
const CANCELLED_STATUS = 4;
const MERGED_STATUS = 17;
const FAILED_STATUSES = new Set([3, 12, 13, 14, 15, 18, 19, 20]);

const isActive = (subscription: OgSubscription) =>
  subscription.cancelled === null && subscription.live;

// `place` arrives as "YYYY-MM-DD HH:mm:ss"; only the day matters here.
const placeDate = (place: string) => place.slice(0, 10);

const summarizeProduct = (product: OgProduct): ProductSummary => ({
  name: product.name,
  imageUrl: product.image_url || null,
  detailUrl: product.detail_url || null,
  sku: product.sku || null,
});

const summarizeAddress = (address: OgAddress): AddressSummary => ({
  name: `${address.first_name} ${address.last_name}`.trim(),
  company: address.company_name || null,
  line1: address.address,
  line2: address.address2 || null,
  locality: `${address.city}, ${address.state_province_code} ${address.zip_postal_code}`.trim(),
});

const summarizePayment = (payment: OgPayment): PaymentSummary => ({
  brand: CARD_BRANDS[payment.cc_type] ?? null,
  last4: payment.cc_number_ending,
  expiry: payment.cc_exp_date,
});

interface UpcomingOrder {
  orderId: string;
  date: string;
}

// subscription public_id → the earliest upcoming order holding one of its items.
const earliestOrders = (upcoming: SubscriptionLookups['upcoming']) => {
  const earliest = new Map<string, UpcomingOrder>();
  if (!upcoming) {
    return earliest;
  }
  const placeByOrder = new Map(
    upcoming.orders.map((order) => [order.public_id, placeDate(order.place)]),
  );
  upcoming.items.forEach((item) => {
    const date = item.subscription ? placeByOrder.get(item.order) : undefined;
    if (!item.subscription || !date) {
      return;
    }
    const current = earliest.get(item.subscription);
    // ISO dates compare correctly as strings.
    if (!current || date < current.date) {
      earliest.set(item.subscription, { orderId: item.order, date });
    }
  });

  return earliest;
};

// The other subscriptions' products on an order, once per product; one-time lines never count.
const otherProductsOn = (
  orderId: string,
  subscriptionId: string,
  items: OgItem[],
  products: SubscriptionLookups['products'],
): SiblingProduct[] => {
  const seen = new Set<string>();

  return items
    .filter(
      (item) =>
        item.order === orderId &&
        item.subscription !== null &&
        item.subscription !== subscriptionId,
    )
    .filter((item) => {
      if (seen.has(item.product)) {
        return false;
      }
      seen.add(item.product);

      return true;
    })
    .map((item) => ({
      externalProductId: item.product,
      name: products?.get(item.product)?.name ?? null,
    }));
};

const byNextOrderThenName = (a: SubscriptionCard, b: SubscriptionCard) => {
  if (a.nextOrderDate !== b.nextOrderDate) {
    if (a.nextOrderDate === null) {
      return 1;
    }
    if (b.nextOrderDate === null) {
      return -1;
    }

    return a.nextOrderDate.localeCompare(b.nextOrderDate);
  }

  return (a.product?.name ?? '').localeCompare(b.product?.name ?? '');
};

const byCancelledNewestFirst = (a: SubscriptionCard, b: SubscriptionCard) =>
  (b.cancelledOn ?? '').localeCompare(a.cancelledOn ?? '');

export const buildSubscriptionCards = (
  subscriptions: OgSubscription[],
  lookups: SubscriptionLookups,
): { active: SubscriptionCard[]; cancelled: SubscriptionCard[] } => {
  const addressById = new Map(
    (lookups.addresses ?? []).map((address) => [address.public_id, address]),
  );
  const paymentById = new Map(
    (lookups.payments ?? []).map((payment) => [payment.public_id, payment]),
  );
  const earliest = earliestOrders(lookups.upcoming);

  const toCard = (subscription: OgSubscription): SubscriptionCard => {
    const product = lookups.products?.get(subscription.product) ?? null;
    const address = addressById.get(subscription.shipping_address);
    const payment = paymentById.get(subscription.payment);
    const upcomingOrder = earliest.get(subscription.public_id);

    return {
      publicId: subscription.public_id,
      externalProductId: subscription.product,
      product: product ? summarizeProduct(product) : null,
      quantity: subscription.quantity,
      frequencyDays: subscription.frequency_days,
      every: subscription.every,
      everyPeriod: subscription.every_period,
      nextOrderDate: upcomingOrder?.date ?? null,
      nextOrder: upcomingOrder
        ? {
            orderId: upcomingOrder.orderId,
            otherProducts: otherProductsOn(
              upcomingOrder.orderId,
              subscription.public_id,
              lookups.upcoming?.items ?? [],
              lookups.products,
            ),
          }
        : null,
      shippingAddress: address ? summarizeAddress(address) : null,
      shippingAddressId: subscription.shipping_address,
      payment: payment ? summarizePayment(payment) : null,
      cancelledOn: subscription.cancelled,
    };
  };

  return {
    active: subscriptions.filter(isActive).map(toCard).sort(byNextOrderThenName),
    cancelled: subscriptions
      .filter((subscription) => !isActive(subscription))
      .map(toCard)
      .sort(byCancelledNewestFirst),
  };
};

const PERIOD_UNITS: Record<FrequencyPeriod, 'day' | 'week' | 'month'> = {
  1: 'day',
  2: 'week',
  3: 'month',
};

/**
 * `date` plus `multiplier` intervals of the schedule, "YYYY-MM-DD". Calendar arithmetic, as the
 * hosted manager does it: Sep 19 + 10 months is Jul 19, which `frequency_days` would miss.
 */
export const addIntervals = (
  date: string,
  every: number,
  period: FrequencyPeriod,
  multiplier: number,
) =>
  dayjs(date)
    .add(every * multiplier, PERIOD_UNITS[period])
    .format('YYYY-MM-DD');

export interface DatePreset {
  /** the offset in the card's period unit, e.g. 20 (months) for the second preset */
  every: number;
  period: FrequencyPeriod;
  /** "YYYY-MM-DD" */
  date: string;
}

/** The manager's pause presets: one, two and three intervals after the next order (spec §4.2). */
export const changeDatePresets = (card: SubscriptionCard): DatePreset[] => {
  const from = card.nextOrderDate;
  if (!from) {
    return [];
  }

  return [1, 2, 3].map((multiplier) => ({
    every: card.every * multiplier,
    period: card.everyPeriod,
    date: addIntervals(from, card.every, card.everyPeriod, multiplier),
  }));
};

const outcomeOf = (status: number): OrderOutcome => {
  if (status === SUCCESS_STATUS) {
    return 'success';
  }
  if (status === CANCELLED_STATUS) {
    return 'cancelled';
  }
  if (FAILED_STATUSES.has(status)) {
    return 'failed';
  }

  return 'processing';
};

export const buildRecentOrders = (orders: OgOrder[]): RecentOrder[] =>
  orders
    .filter((order) => order.status !== MERGED_STATUS)
    .map((order) => {
      const outcome = outcomeOf(order.status);

      return {
        publicId: order.public_id,
        placedOn: placeDate(order.place),
        webOrderNumber: order.order_merchant_id ? formatOrderId(order.order_merchant_id) : null,
        orderDetailPath: order.order_merchant_id ? `/orderDetail/${order.order_merchant_id}` : null,
        total: order.total,
        currencyCode: order.currency_code,
        outcome,
        message: outcome === 'failed' ? order.rejected_message || null : null,
      };
    })
    .sort((a, b) => b.placedOn.localeCompare(a.placedOn));
