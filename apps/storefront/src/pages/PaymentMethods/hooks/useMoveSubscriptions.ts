import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import {
  applyPaymentToAll,
  createPayment,
  listPayments,
  OrdergrooveError,
} from '@/shared/service/ordergroove';
import { buildCardOptions, CardOption, ccTypeFor } from '@/shared/service/ssw/cardOptions';
import { listStoredInstruments } from '@/shared/service/ssw/customerClient';
import { snackbar } from '@/utils/b3Tip';

/**
 * The cards a customer can move their subscriptions to before deleting one, and the move itself.
 * `use_for_all` moves every subscription AND every order the customer has, which is why the copy
 * says "all my subscriptions" rather than "these" (spec §1 decision 4).
 */
export const useMoveSubscriptions = (
  customerId: number,
  token: string | undefined,
  enabled: boolean,
) => {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();

  const instruments = useQuery({
    queryKey: ['storedInstruments', customerId],
    queryFn: listStoredInstruments,
    enabled,
    retry: false,
  });
  const payments = useQuery({
    queryKey: ['ordergroove', customerId, 'payments'],
    queryFn: () => listPayments(String(customerId)),
    enabled,
    retry: false,
  });

  // Never offer the card being deleted. `currentPaymentId` is irrelevant here, so pass `null`:
  // nothing in this list should render as "current".
  const options = buildCardOptions(
    (instruments.data?.instruments ?? []).filter((instrument) => instrument.token !== token),
    payments.data,
    null,
  );

  const move = useMutation({
    mutationFn: async (option: CardOption) => {
      // Reuse before create: Ordergroove cannot delete a payment record (spec §1 decision 3).
      const paymentId =
        option.paymentId ??
        (
          await createPayment(String(customerId), {
            tokenId: option.token,
            last4: option.last4,
            expiry: option.expiry,
            ccType: ccTypeFor(option.brand),
          })
        ).public_id;

      await applyPaymentToAll(String(customerId), paymentId);
    },
    onSuccess: async (_result, option) => {
      snackbar.success(
        b3Lang('paymentMethods.deleteDialog.move.success', {
          card: b3Lang('paymentMethods.deleteDialog.move.option', {
            brand: option.brand,
            last4: option.last4,
            expiry: option.expiry,
          }),
        }),
      );
      // Re-read rather than assume: the endpoint's atomicity is undocumented (spec §8).
      await queryClient.invalidateQueries({
        queryKey: ['subscriptionsUsingToken', customerId, token],
      });
    },
    // On settle, not only on success: a failed move can still follow a successful create, and
    // Ordergroove has no delete for payment records, so the retry must see that created record
    // rather than create a second, permanent one (spec §8).
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['ordergroove', customerId, 'payments'] }),
    onError: (error: unknown) => {
      const expired = error instanceof OrdergrooveError && error.kind === 'sessionExpired';
      snackbar.error(
        b3Lang(expired ? 'subscriptions.sessionExpired' : 'subscriptions.actions.error'),
      );
    },
  });

  return { options, move };
};
