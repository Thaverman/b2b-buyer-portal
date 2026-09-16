import { getAuthorizationHeader, invalidateAuthorization } from './auth';
import { OrdergrooveError } from './errors';
import { OgPayment, OgProduct, OgSubscription } from './types';

const API_BASE = 'https://restapi.ordergroove.com';
// The warning is advisory; past this the dialog falls back to "we couldn't check" (spec §6.3).
const REQUEST_TIMEOUT_MS = 5000;

interface OgPage<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Promise.race rather than AbortSignal: nothing else in the portal passes signals to fetch, and
// the jsdom/undici pairing in tests has historically disagreed about AbortSignal identity.
const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new OrdergrooveError('timeout')), REQUEST_TIMEOUT_MS);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });

const request = async (
  customerId: string,
  url: string,
  retryOnForbidden: boolean,
): Promise<Response> => {
  const authorization = await getAuthorizationHeader(customerId);

  let response: Response;
  try {
    response = await withTimeout(
      fetch(url, { headers: { Authorization: authorization, 'Content-Type': 'application/json' } }),
    );
  } catch (error) {
    throw error instanceof OrdergrooveError ? error : new OrdergrooveError('upstream');
  }

  if (response.status === 403 && retryOnForbidden) {
    // The signature can be revoked or age out server-side; mint once more before giving up.
    invalidateAuthorization();

    return request(customerId, url, false);
  }

  return response;
};

const ogFetch = async <T>(customerId: string, url: string): Promise<T> => {
  const response = await request(customerId, url, true);

  if (response.ok) {
    return response.json() as Promise<T>;
  }
  if (response.status === 401 || response.status === 403) {
    throw new OrdergrooveError('sessionExpired');
  }
  if (response.status === 429) {
    throw new OrdergrooveError('rateLimited');
  }
  throw new OrdergrooveError('upstream');
};

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
  const payments = await listAll<OgPayment>(customerId, `${API_BASE}/payments/`);
  const paymentIds = new Set(
    payments.filter((payment) => payment.token_id === token).map((payment) => payment.public_id),
  );
  if (paymentIds.size === 0) {
    return [];
  }

  const subscriptions = await listAll<OgSubscription>(customerId, `${API_BASE}/subscriptions/`);

  return subscriptions.filter(
    (subscription) => isActive(subscription) && paymentIds.has(subscription.payment),
  );
};

export const getProduct = (customerId: string, externalProductId: string) =>
  ogFetch<OgProduct>(customerId, `${API_BASE}/products/${encodeURIComponent(externalProductId)}/`);
