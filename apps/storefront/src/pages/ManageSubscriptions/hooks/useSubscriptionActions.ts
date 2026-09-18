import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import {
  changeNextOrderDate,
  changeSubscriptionPayment,
  createPayment,
  OrdergrooveError,
  sendOrderNow,
  skipSubscription,
} from '@/shared/service/ordergroove';
import { CardOption, ccTypeFor } from '@/shared/service/ssw/cardOptions';
import { snackbar } from '@/utils/b3Tip';

interface ChangeCardVariables {
  subscriptionId: string;
  option: CardOption;
  /** billing address of the subscription's current record, carried onto a new one */
  billingAddress: string | null;
}

/**
 * The three 3a writes as mutations. Success re-reads the resources a write changes and confirms
 * with a snackbar; failure reports and changes nothing locally (spec §5). Each card instantiates
 * this hook, so pending state is per card.
 */
export const useSubscriptionActions = (customerId: number) => {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();
  const id = String(customerId);

  // Awaited so the mutation stays pending until the cards show the new state (spec §5.2).
  const refresh = (resources: string[]) =>
    Promise.all(
      resources.map((resource) =>
        queryClient.invalidateQueries({ queryKey: ['ordergroove', customerId, resource] }),
      ),
    );

  const succeed = async (messageKey: string, resources: string[]) => {
    snackbar.success(b3Lang(messageKey));
    await refresh(resources);
  };

  const onError = (error: unknown) => {
    const expired = error instanceof OrdergrooveError && error.kind === 'sessionExpired';
    snackbar.error(
      b3Lang(expired ? 'subscriptions.sessionExpired' : 'subscriptions.actions.error'),
    );
  };

  const skip = useMutation({
    mutationFn: ({ orderId, subscriptionId }: { orderId: string; subscriptionId: string }) =>
      skipSubscription(id, orderId, subscriptionId),
    onSuccess: () => succeed('subscriptions.actions.skip.success', ['subscriptions', 'upcoming']),
    onError,
  });

  const sendNow = useMutation({
    mutationFn: ({ orderId }: { orderId: string }) => sendOrderNow(id, orderId),
    // The sent order leaves the upcoming set and appears in history.
    onSuccess: () =>
      succeed('subscriptions.actions.sendNow.success', [
        'subscriptions',
        'upcoming',
        'orderHistory',
      ]),
    onError,
  });

  const changeDate = useMutation({
    mutationFn: ({ subscriptionId, orderDate }: { subscriptionId: string; orderDate: string }) =>
      changeNextOrderDate(id, subscriptionId, orderDate),
    onSuccess: () =>
      succeed('subscriptions.actions.changeDate.success', ['subscriptions', 'upcoming']),
    onError,
  });

  const changeCard = useMutation({
    mutationFn: async ({ subscriptionId, option, billingAddress }: ChangeCardVariables) => {
      // Reuse before create: Ordergroove cannot delete a payment record (spec §1 decision 3).
      const paymentId =
        option.paymentId ??
        (
          await createPayment(id, {
            tokenId: option.token,
            last4: option.last4,
            expiry: option.expiry,
            ccType: ccTypeFor(option.brand),
            ...(billingAddress === null ? {} : { billingAddress }),
          })
        ).public_id;

      // The upcoming order follows the subscription on its own (Task 0 finding A), so this is
      // the only repoint needed.
      await changeSubscriptionPayment(id, subscriptionId, paymentId);
    },
    onSuccess: () =>
      succeed('subscriptions.actions.changeCard.success', [
        'subscriptions',
        'upcoming',
        'payments',
      ]),
    onError,
  });

  return { skip, sendNow, changeDate, changeCard };
};
