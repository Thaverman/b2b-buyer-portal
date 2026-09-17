import {
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

interface PaymentSummary {
  /** null for a card type Ordergroove's table does not name */
  brand: string | null;
  last4: string;
  /** "M/YYYY" as Ordergroove sends it */
  expiry: string;
}

export interface SubscriptionCard {
  publicId: string;
  externalProductId: string;
  product: ProductSummary | null;
  quantity: number;
  frequencyDays: number;
  /** "YYYY-MM-DD" of the earliest upcoming order holding one of its items */
  nextOrderDate: string | null;
  shippingAddress: AddressSummary | null;
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

// subscription public_id → earliest place date among the upcoming orders holding its items.
const nextOrderDates = (upcoming: SubscriptionLookups['upcoming']) => {
  const dates = new Map<string, string>();
  if (!upcoming) {
    return dates;
  }
  const placeByOrder = new Map(
    upcoming.orders.map((order) => [order.public_id, placeDate(order.place)]),
  );
  upcoming.items.forEach((item) => {
    const place = item.subscription ? placeByOrder.get(item.order) : undefined;
    if (!item.subscription || !place) {
      return;
    }
    const current = dates.get(item.subscription);
    // ISO dates compare correctly as strings.
    if (!current || place < current) {
      dates.set(item.subscription, place);
    }
  });

  return dates;
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
  const nextDates = nextOrderDates(lookups.upcoming);

  const toCard = (subscription: OgSubscription): SubscriptionCard => {
    const product = lookups.products?.get(subscription.product) ?? null;
    const address = addressById.get(subscription.shipping_address);
    const payment = paymentById.get(subscription.payment);

    return {
      publicId: subscription.public_id,
      externalProductId: subscription.product,
      product: product ? summarizeProduct(product) : null,
      quantity: subscription.quantity,
      frequencyDays: subscription.frequency_days,
      nextOrderDate: nextDates.get(subscription.public_id) ?? null,
      shippingAddress: address ? summarizeAddress(address) : null,
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
