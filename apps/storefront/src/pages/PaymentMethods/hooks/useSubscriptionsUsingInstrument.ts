import { useQuery } from '@tanstack/react-query';

import {
  getProduct,
  getSubscriptionsUsingToken,
  OgSubscription,
} from '@/shared/service/ordergroove';

/** One active subscription charged to the card being deleted, ready for display. */
export interface AffectedSubscription {
  publicId: string;
  /** null when the product lookup failed — the warning still counts it. */
  productName: string | null;
  frequencyDays: number;
}

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

export const useSubscriptionsUsingInstrument = (
  customerId: number,
  token: string | undefined,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ['subscriptionsUsingToken', customerId, token],
    queryFn: async () => {
      if (!token) {
        return [];
      }
      const id = String(customerId);

      return describeSubscriptions(id, await getSubscriptionsUsingToken(id, token));
    },
    enabled: enabled && Boolean(token),
    // The check is advisory and already has its own 5s timeout; a retry would only prolong the wait.
    retry: false,
  });
