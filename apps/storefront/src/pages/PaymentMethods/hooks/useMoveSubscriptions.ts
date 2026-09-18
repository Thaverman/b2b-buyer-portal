import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import {
  createPayment,
  listPayments,
  OrdergrooveError,
  usePaymentForAll,
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

  // Never offer the card being deleted. `currentPaymentId` is irrelevant here, so pass a value no
  // record can have: nothing in this list should render as "current".
  const options = buildCardOptions(
    (instruments.data?.instruments ?? []).filter((instrument) => instrument.token !== token),
    payments.data,
    '',
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

      // Not a hook despite the name: an Ordergroove API call from Task 2.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      await usePaymentForAll(String(customerId), paymentId);
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
    onError: (error: unknown) => {
      const expired = error instanceof OrdergrooveError && error.kind === 'sessionExpired';
      snackbar.error(
        b3Lang(expired ? 'subscriptions.sessionExpired' : 'subscriptions.actions.error'),
      );
    },
  });

  return { options, move };
};
