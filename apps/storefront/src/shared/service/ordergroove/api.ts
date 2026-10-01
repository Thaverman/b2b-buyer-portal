import { getAuthorizationHeader, invalidateAuthorization } from './auth';
import { OrdergrooveError } from './errors';
import {
  FrequencyPeriod,
  OgAddress,
  OgItem,
  OgOrder,
  OgPage,
  OgPayment,
  OgProduct,
  OgSubscription,
} from './types';

const API_BASE = 'https://restapi.ordergroove.com';
// The warning is advisory; past this the dialog falls back to "we couldn't check" (spec §6.3).
const REQUEST_TIMEOUT_MS = 5000;
// Writes get longer: a customer is watching a spinner, and a change that lands after we gave up
// still shows on the next read (Phase 3 spec §8).
const WRITE_TIMEOUT_MS = 10000;

interface Write {
  method: 'PATCH' | 'POST';
  body?: object;
}

// Promise.race rather than AbortSignal: nothing else in the portal passes signals to fetch, and
// the jsdom/undici pairing in tests has historically disagreed about AbortSignal identity.
export const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new OrdergrooveError('timeout')), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });

const request = async (
  customerId: string,
  url: string,
  retryOnForbidden: boolean,
  write?: Write,
): Promise<Response> => {
  const authorization = await getAuthorizationHeader(customerId);

  let response: Response;
  try {
    response = await withTimeout(
      fetch(url, {
        method: write?.method ?? 'GET',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: write?.body === undefined ? undefined : JSON.stringify(write.body),
      }),
      write ? WRITE_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
    );
  } catch (error) {
    throw error instanceof OrdergrooveError ? error : new OrdergrooveError('upstream');
  }

  if (response.status === 403 && retryOnForbidden) {
    // The signature can be revoked or age out server-side; mint once more before giving up.
    invalidateAuthorization();

    return request(customerId, url, false, write);
  }

  return response;
};

const throwForFailure = (response: Response): never => {
  if (response.status === 401 || response.status === 403) {
    throw new OrdergrooveError('sessionExpired');
  }
  if (response.status === 429) {
    throw new OrdergrooveError('rateLimited');
  }
  throw new OrdergrooveError('upstream');
};

const parse = async <T>(response: Response): Promise<T> => {
  if (response.ok) {
    return response.json() as Promise<T>;
  }

  return throwForFailure(response);
};

// Tolerates the empty body the vendor documents (spec §3.1): unlike `parse`, an empty 200 resolves
// instead of `response.json()` throwing a raw SyntaxError.
const parseAllowingEmptyBody = async (response: Response): Promise<void> => {
  if (response.ok) {
    const text = await response.text();
    if (text) {
      JSON.parse(text);
    }

    return;
  }

  throwForFailure(response);
};

const ogFetch = async <T>(customerId: string, url: string): Promise<T> =>
  parse<T>(await request(customerId, url, true));

const ogMutate = async <T>(
  customerId: string,
  url: string,
  method: Write['method'],
  body?: object,
): Promise<T> => parse<T>(await request(customerId, url, true, { method, body }));

const ogMutateAllowingEmptyBody = async (
  customerId: string,
  url: string,
  method: Write['method'],
): Promise<void> => parseAllowingEmptyBody(await request(customerId, url, true, { method }));

// Every Ordergroove list is paginated; `next` is an absolute URL or null. Recursive rather than a
// loop so there is no await-in-loop; a customer has a handful of pages at most.
const listAll = async <T>(customerId: string, url: string | null, acc: T[] = []): Promise<T[]> => {
  if (!url) {
    return acc;
  }
  const current = await ogFetch<OgPage<T>>(customerId, url);

  return listAll(customerId, current.next, [...acc, ...current.results]);
};

const isActive = (subscription: OgSubscription) =>
  subscription.cancelled === null && subscription.live;

export const listSubscriptions = (customerId: string) =>
  listAll<OgSubscription>(customerId, `${API_BASE}/subscriptions/`);

export const listPayments = (customerId: string) =>
  listAll<OgPayment>(customerId, `${API_BASE}/payments/`);

export const listAddresses = (customerId: string) =>
  listAll<OgAddress>(customerId, `${API_BASE}/addresses/`);

/**
 * Future orders (status 1, UNSENT) and their lines. Subscriptions carry no next-order date; the
 * lines are the only link from a subscription to the order that will charge it next.
 */
export const listUpcomingOrders = async (customerId: string) => {
  const [orders, items] = await Promise.all([
    listAll<OgOrder>(customerId, `${API_BASE}/orders/?status=1`),
    listAll<OgItem>(customerId, `${API_BASE}/items/?status=1`),
  ]);

  return { orders, items };
};

/**
 * First-page URL for order history: everything due for placement up to and including the date,
 * newest first. The API's default order is not by place (verified live 2026-09-17).
 */
export const orderHistoryUrl = (throughDate: string) =>
  `${API_BASE}/orders/?place_end=${throughDate}&ordering=-place`;

/** One page of orders — the first-page URL above, or the `next` cursor of a previous page. */
export const listOrdersPage = (customerId: string, url: string) =>
  ogFetch<OgPage<OgOrder>>(customerId, url);

/**
 * Active subscriptions charged to a BigCommerce stored instrument. Ordergroove's payment
 * `token_id` IS the instrument token (verified live, spec §2). Several payment records can carry
 * one token and a live subscription can still reference a record that is no longer `live`, so
 * every record with the token counts.
 */
export const getSubscriptionsUsingToken = async (
  customerId: string,
  token: string,
): Promise<OgSubscription[]> => {
  const payments = await listPayments(customerId);
  const paymentIds = new Set(
    payments.filter((payment) => payment.token_id === token).map((payment) => payment.public_id),
  );
  if (paymentIds.size === 0) {
    return [];
  }

  const subscriptions = await listSubscriptions(customerId);

  return subscriptions.filter(
    (subscription) => isActive(subscription) && paymentIds.has(subscription.payment),
  );
};

export const getProduct = (customerId: string, externalProductId: string) =>
  ogFetch<OgProduct>(customerId, `${API_BASE}/products/${encodeURIComponent(externalProductId)}/`);

const orderUrl = (orderId: string, action: string) =>
  `${API_BASE}/orders/${encodeURIComponent(orderId)}/${action}/`;

// The trailing slash is the documented form; the Phase 3a probe confirmed it live (finding A).
const subscriptionUrl = (subscriptionId: string, action: string) =>
  `${API_BASE}/subscriptions/${encodeURIComponent(subscriptionId)}/${action}/`;

/** Removes this subscription's items from the order and generates its next order (spec §3.2). */
export const skipSubscription = (customerId: string, orderId: string, subscriptionId: string) =>
  ogMutate<OgOrder>(customerId, orderUrl(orderId, 'skip_subscription'), 'PATCH', {
    subscription: subscriptionId,
  });

/** Places the whole order within 24 hours — every subscription shipping on it, not just one. */
export const sendOrderNow = (customerId: string, orderId: string) =>
  ogMutate<OgOrder>(customerId, orderUrl(orderId, 'send_now'), 'PATCH');

/** `orderDate` is "YYYY-MM-DD" and must be in the future. */
export const changeNextOrderDate = (
  customerId: string,
  subscriptionId: string,
  orderDate: string,
) =>
  ogMutate<OgSubscription>(
    customerId,
    subscriptionUrl(subscriptionId, 'change_next_order_date'),
    'PATCH',
    { order_date: orderDate },
  );

/** Ordergroove regenerates the upcoming order from the new schedule (Task 0 finding E). */
export const changeSubscriptionFrequency = (
  customerId: string,
  subscriptionId: string,
  every: number,
  everyPeriod: FrequencyPeriod,
) =>
  ogMutate<OgSubscription>(customerId, subscriptionUrl(subscriptionId, 'change_frequency'), 'PATCH', {
    every,
    every_period: everyPeriod,
  });

export const changeSubscriptionQuantity = (
  customerId: string,
  subscriptionId: string,
  quantity: number,
) =>
  ogMutate<OgSubscription>(customerId, subscriptionUrl(subscriptionId, 'change_quantity'), 'PATCH', {
    quantity,
  });

/** `cancelReason` is the manager's "{code} | {label}" string or its no-survey default (spec §4.5). */
export const cancelSubscription = (
  customerId: string,
  subscriptionId: string,
  cancelReason: string,
) =>
  ogMutate<OgSubscription>(customerId, subscriptionUrl(subscriptionId, 'cancel'), 'PATCH', {
    cancel_reason: cancelReason,
  });

export interface ReactivationInput {
  /** "YYYY-MM-DD", today */
  startDate: string;
  every: number;
  everyPeriod: FrequencyPeriod;
  /** "YYYY-MM-DD"; Ordergroove rejects a date in the past (reference "Reactivate") */
  nextOrderDate: string;
}

export const reactivateSubscription = (
  customerId: string,
  subscriptionId: string,
  input: ReactivationInput,
) =>
  ogMutate<OgSubscription>(customerId, subscriptionUrl(subscriptionId, 'reactivate'), 'PATCH', {
    start_date: input.startDate,
    every: input.every,
    every_period: input.everyPeriod,
    next_order_date: input.nextOrderDate,
  });

export const changeShippingAddress = (
  customerId: string,
  subscriptionId: string,
  addressId: string,
) =>
  ogMutate<OgSubscription>(customerId, subscriptionUrl(subscriptionId, 'change_shipping'), 'PATCH', {
    shipping_address: addressId,
  });

const paymentUrl = (paymentId: string, action: string) =>
  `${API_BASE}/payments/${encodeURIComponent(paymentId)}/${action}/`;

/** A BigCommerce stored instrument, in the shape Ordergroove's create endpoint wants. */
interface NewPaymentInput {
  /** the BigCommerce stored-instrument token — Ordergroove's token_id, byte for byte (spec §11.2) */
  tokenId: string;
  last4: string;
  /** "MM/YYYY", zero-padded */
  expiry: string;
  /** Ordergroove credit-card type code; omitted for a brand we do not map */
  ccType?: number;
  /** the billing address of the subscription's current record, when known */
  billingAddress?: string;
}

/**
 * Registers a card Ordergroove does not hold yet. One-way: Ordergroove has no delete for payment
 * records, so callers must look for a live record with the same token first (spec §5).
 */
export const createPayment = (customerId: string, input: NewPaymentInput) =>
  ogMutate<OgPayment>(customerId, `${API_BASE}/payments/create/`, 'POST', {
    customer: customerId,
    token_id: input.tokenId,
    cc_number_ending: input.last4,
    cc_exp_date: input.expiry,
    ...(input.ccType === undefined ? {} : { cc_type: input.ccType }),
    ...(input.billingAddress === undefined ? {} : { billing_address: input.billingAddress }),
  });

export const changeSubscriptionPayment = (
  customerId: string,
  subscriptionId: string,
  paymentId: string,
) =>
  ogMutate<OgSubscription>(customerId, subscriptionUrl(subscriptionId, 'change_payment'), 'PATCH', {
    payment: paymentId,
  });

/**
 * Moves every subscription AND every upcoming order of the customer onto this record — verified
 * live 2026-09-18 (14 of 14 subscriptions, 12 of 12 orders), which is why the copy says
 * "all my subscriptions" rather than "these".
 */
export const applyPaymentToAll = (customerId: string, paymentId: string) =>
  ogMutateAllowingEmptyBody(customerId, paymentUrl(paymentId, 'use_for_all'), 'POST');
