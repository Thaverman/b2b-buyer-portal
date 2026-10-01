import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import {
  cancelSubscription,
  changeNextOrderDate,
  changeShippingAddress,
  changeSubscriptionFrequency,
  changeSubscriptionPayment,
  changeSubscriptionQuantity,
  createPayment,
  FrequencyPeriod,
  OrdergrooveError,
  reactivateSubscription,
  ReactivationInput,
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
 * Every subscription write as a mutation. Success re-reads the resources a write changes and confirms
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
      succeed('subscriptions.actions.changeCard.success', ['subscriptions', 'upcoming']),
    // On settle, not only on success: a failed repoint can still follow a successful create, and
    // Ordergroove has no delete for payment records, so the retry must see that created record
    // rather than create a second, permanent one (spec §8).
    onSettled: () => refresh(['payments']),
    onError,
  });

  const changeFrequency = useMutation({
    mutationFn: ({
      subscriptionId,
      every,
      everyPeriod,
    }: {
      subscriptionId: string;
      every: number;
      everyPeriod: FrequencyPeriod;
    }) => changeSubscriptionFrequency(id, subscriptionId, every, everyPeriod),
    // The probe saw a schedule change leave the upcoming order's date alone (Task 0 finding E);
    // 'upcoming' is refreshed regardless (spec §5.2) so the card can never show a stale order.
    onSuccess: () =>
      succeed('subscriptions.actions.frequency.success', ['subscriptions', 'upcoming']),
    onError,
  });

  const changeQuantity = useMutation({
    mutationFn: ({ subscriptionId, quantity }: { subscriptionId: string; quantity: number }) =>
      changeSubscriptionQuantity(id, subscriptionId, quantity),
    onSuccess: () =>
      succeed('subscriptions.actions.quantity.success', ['subscriptions', 'upcoming']),
    onError,
  });

  const cancel = useMutation({
    mutationFn: ({
      subscriptionId,
      cancelReason,
    }: {
      subscriptionId: string;
      cancelReason: string;
    }) => cancelSubscription(id, subscriptionId, cancelReason),
    // Cancelling removes the subscription's items from its upcoming order (Task 0 finding I).
    onSuccess: () => succeed('subscriptions.actions.cancel.success', ['subscriptions', 'upcoming']),
    onError,
  });

  const reactivate = useMutation({
    mutationFn: ({ subscriptionId, ...input }: ReactivationInput & { subscriptionId: string }) =>
      reactivateSubscription(id, subscriptionId, input),
    onSuccess: () =>
      succeed('subscriptions.actions.reactivate.success', ['subscriptions', 'upcoming']),
    onError,
  });

  const changeAddress = useMutation({
    mutationFn: ({ subscriptionId, addressId }: { subscriptionId: string; addressId: string }) =>
      changeShippingAddress(id, subscriptionId, addressId),
    onSuccess: () =>
      succeed('subscriptions.actions.address.success', ['subscriptions', 'upcoming']),
    onError,
  });

  return {
    skip,
    sendNow,
    changeDate,
    changeCard,
    changeFrequency,
    changeQuantity,
    cancel,
    reactivate,
    changeAddress,
  };
};
