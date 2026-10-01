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
import { CARD_BRANDS, formatRawExpiry } from '@/shared/service/ssw/cardOptions';
import { formatOrderId } from '@/utils/orderId';

interface ProductSummary {
  name: string;
  imageUrl: string | null;
  detailUrl: string | null;
  sku: string | null;
}

export interface AddressSummary {
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
  /** "MM/YYYY", padded to the shape the card picker prints */
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
  /** the Ordergroove payment record this subscription charges today */
  paymentId: string;
  /** that record's billing address, carried onto a new record; null until payments load */
  billingAddressId: string | null;
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
  expiry: formatRawExpiry(payment.cc_exp_date),
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
      paymentId: subscription.payment,
      billingAddressId: payment?.billing_address ?? null,
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

export interface FrequencyOption {
  every: number;
  period: FrequencyPeriod;
}

// Ordergroove merchant configuration as baked into SSW's manager bundle, captured 2026-09-17
// (spec §12.2): days, then "1 day", then weeks. Not readable from the REST API; revisit here if
// SSW changes the offer in Ordergroove.
const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { every: 2, period: 1 },
  { every: 4, period: 1 },
  { every: 6, period: 1 },
  { every: 8, period: 1 },
  { every: 10, period: 1 },
  { every: 12, period: 1 },
  { every: 1, period: 1 },
  { every: 2, period: 2 },
  { every: 4, period: 2 },
  { every: 6, period: 2 },
  { every: 8, period: 2 },
  { every: 10, period: 2 },
  { every: 12, period: 2 },
];

/** SSW's list, with the card's own schedule appended when it is not offered (the manager does the same). */
export const frequencyOptions = (every: number, period: FrequencyPeriod): FrequencyOption[] =>
  FREQUENCY_OPTIONS.some((option) => option.every === every && option.period === period)
    ? FREQUENCY_OPTIONS
    : [...FREQUENCY_OPTIONS, { every, period }];

/** The select value for a schedule, "{every}-{period}" — the same key in every select that offers one. */
export const frequencyKey = ({ every, period }: FrequencyOption) => `${every}-${period}`;

const MAX_QUANTITY = 20;

/** 1…20, plus the current quantity when it is larger (the manager shows 32 for one SSW subscription). */
export const quantityOptions = (current: number): number[] => {
  const options = Array.from({ length: MAX_QUANTITY }, (_, index) => index + 1);

  return current > MAX_QUANTITY ? [...options, current] : options;
};

// Codes and canonical English labels the manager sends. Ordergroove's reporting keys on them, so
// the body carries THESE labels whatever language the radios show (spec §4.5).
export const CANCEL_REASONS = [
  { code: 2, label: 'I have too many of this product' },
  { code: 8, label: 'This product is too expensive' },
  { code: 31, label: 'I had trouble managing my subscription' },
  {
    code: 70,
    label: 'I no longer have any use for this product and I will not need it in the near future',
  },
  { code: 3, label: 'I stopped using this product' },
  { code: 22, label: 'I wanted to switch to a different product/flavor' },
  { code: 15, label: "I don't like this product" },
] as const;
export const OTHER_REASON_CODE = 1;
// The manager's hidden default — no spaces, unlike the radio values.
const NO_SURVEY_REASON = '114|Cancelled without exit survey response';

export interface CancelReasonSelection {
  code: number;
  /** free text; Other only */
  details?: string;
}

/** The `cancel_reason` body: a listed reason, Other with or without details, or the no-survey value. */
export const cancelReasonBody = (selection: CancelReasonSelection | null): string => {
  if (!selection) {
    return NO_SURVEY_REASON;
  }
  if (selection.code === OTHER_REASON_CODE) {
    const details = selection.details?.trim() ?? '';

    return details ? `${OTHER_REASON_CODE} | ${details}` : String(OTHER_REASON_CODE);
  }
  const reason = CANCEL_REASONS.find((candidate) => candidate.code === selection.code);

  return reason ? `${reason.code} | ${reason.label}` : NO_SURVEY_REASON;
};

export interface AddressOption {
  publicId: string;
  summary: AddressSummary;
  isCurrent: boolean;
}

const normalise = (value: string | null) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// Ordergroove mints an address record per checkout and carries no address type, so one place
// accumulates records that differ in company, suite line, city spelling or ZIP+4, and billing
// records sit beside their shipping twins. The hosted manager collapses them on the street line
// alone (24 live records → its 10 "Ship to" choices for the fixture customer, Task 0 finding J);
// the picker does the same so both screens offer the same list.
const addressIdentity = (address: OgAddress) => normalise(address.address);

/**
 * One choice per distinct street line: live records plus the current one even when retired. The
 * current record wins its duplicate group so the preselected radio is the id Ordergroove already
 * holds; otherwise the first live record. Current first, then by name (spec §4.6 as amended).
 */
export const buildAddressOptions = (
  addresses: OgAddress[] | undefined,
  currentId: string,
): AddressOption[] => {
  const byIdentity = new Map<string, OgAddress>();
  (addresses ?? [])
    .filter((address) => address.live || address.public_id === currentId)
    .forEach((address) => {
      const identity = addressIdentity(address);
      if (!byIdentity.has(identity) || address.public_id === currentId) {
        byIdentity.set(identity, address);
      }
    });

  return Array.from(byIdentity.values())
    .map((address) => ({
      publicId: address.public_id,
      summary: summarizeAddress(address),
      isCurrent: address.public_id === currentId,
    }))
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) {
        return a.isCurrent ? -1 : 1;
      }

      return a.summary.name.localeCompare(b.summary.name);
    });
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
