import { useQuery, UseQueryResult } from '@tanstack/react-query';

import {
  getProduct,
  getSubscriptionsUsingToken,
  OgSubscription,
  withTimeout,
} from '@/shared/service/ordergroove';

/** One active subscription charged to the card being deleted, ready for display. */
export interface AffectedSubscription {
  publicId: string;
  /** null when the product lookup failed — the warning still counts it. */
  productName: string | null;
  frequencyDays: number;
}

export type SubscriptionCheckStatus = 'checking' | 'clear' | 'failed' | 'affected';

// One deadline around the whole check — auth mint, every page, every product lookup — so the
// confirm button is never disabled for longer than this (spec §6.1).
const CHECK_TIMEOUT_MS = 5000;

// Product names are best-effort (spec §6.3): a failed lookup keeps the subscription in the list
// with productName null rather than hiding a real warning behind a cosmetic failure.
const describeSubscriptions = async (
  customerId: string,
  subscriptions: OgSubscription[],
): Promise<AffectedSubscription[]> => {
  const productIds = [...new Set(subscriptions.map((subscription) => subscription.product))];
  const names = new Map<string, string | null>(
    await Promise.all(
      productIds.map(
        async (productId): Promise<[string, string | null]> => [
          productId,
          await getProduct(customerId, productId)
            .then((product) => product.name)
            .catch(() => null),
        ],
      ),
    ),
  );

  return subscriptions.map((subscription) => ({
    publicId: subscription.public_id,
    productName: names.get(subscription.product) ?? null,
    frequencyDays: subscription.frequency_days,
  }));
};

const lookupAffectedSubscriptions = async (customerId: string, token: string) =>
  describeSubscriptions(customerId, await getSubscriptionsUsingToken(customerId, token));

export const useSubscriptionsUsingInstrument = (
  customerId: number,
  token: string | undefined,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ['subscriptionsUsingToken', customerId, token],
    // The no-token branch is unreachable while `enabled` is false without one; it narrows the type.
    queryFn: () =>
      token
        ? withTimeout(lookupAffectedSubscriptions(String(customerId), token), CHECK_TIMEOUT_MS)
        : Promise.resolve<AffectedSubscription[]>([]),
    enabled: enabled && Boolean(token),
    // The check is advisory and already has its own deadline; a retry would only prolong the wait.
    retry: false,
  });

type CheckQuery = Pick<UseQueryResult<AffectedSubscription[]>, 'data' | 'isError'>;

/**
 * Four dialog states (spec §6.3). Any result — even a stale one while a re-check fails — beats
 * "we couldn't check"; only a query with nothing to show is failed. `enabled` must be the same
 * predicate the hook was given: a disabled query with no data stays pending forever.
 */
export const deriveSubscriptionCheckStatus = (
  enabled: boolean,
  query: CheckQuery,
): SubscriptionCheckStatus => {
  if (!enabled) {
    return 'clear';
  }
  if (query.data !== undefined) {
    return query.data.length > 0 ? 'affected' : 'clear';
  }

  return query.isError ? 'failed' : 'checking';
};
