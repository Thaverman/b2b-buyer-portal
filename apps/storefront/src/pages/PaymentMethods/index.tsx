import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Link, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import B3Dialog from '@/components/B3Dialog';
import B3Spin from '@/components/spin/B3Spin';
import { useB3Lang } from '@/lib/lang';
import { PageProps } from '@/pages/PageProps';
import { isSubscriptionsAvailable } from '@/shared/service/ordergroove';
import { useAppSelector } from '@/store';
import { snackbar } from '@/utils/b3Tip';
import { isHostFlagEnabled } from '@/utils/hostFlag';

import AddPaymentMethodBraintreeDialog from './components/AddPaymentMethodBraintreeDialog';
import AddPaymentMethodDialog from './components/AddPaymentMethodDialog';
import DeleteSubscriptionWarning from './components/DeleteSubscriptionWarning';
import PaymentMethodRow from './components/PaymentMethodRow';
import {
  deriveSubscriptionCheckStatus,
  useSubscriptionsUsingInstrument,
} from './hooks/useSubscriptionsUsingInstrument';
import {
  deleteStoredInstrument,
  getBraintreeClientToken,
  isPaymentMethodsAvailable,
  listStoredInstruments,
  PaymentMethodsError,
  setDefaultStoredInstrument,
  StoredInstrument,
} from './api';
import { hasActiveCart } from './cartPresence';
import { getVaultAccess, NATIVE_ADD_PAYMENT_METHOD_PATH } from './vaultAccess';

type AddCardVariant = 'hostedForm' | 'braintree';

// Intersected with PageProps because routesMap is typed as components taking PageProps,
// and a props type with no properties in common trips TypeScript's weak-type check.
type PaymentMethodsProps = Partial<PageProps> & {
  variant?: AddCardVariant;
};

// The theme flag chooses the add-card mechanism for this store. It originally exposed a
// parallel evaluation route; now it selects the flow on /payment-methods itself, so a brand
// rolls forward or back with a one-line theme change and no redeploy. Absent means today's
// cart-gated hosted form, so a store that has not opted in is unchanged.
const flaggedVariant = (): AddCardVariant =>
  isHostFlagEnabled(window.BC_CONTEXT?.paymentMethodsBraintree?.enabled)
    ? 'braintree'
    : 'hostedForm';

function PaymentMethods({ variant }: PaymentMethodsProps) {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pendingDelete, setPendingDelete] = useState<StoredInstrument | null>(null);
  const customerId = useAppSelector(({ company }) => company.customer.id);
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  // The JWT identifies the logged-in customer, so a masquerading rep must not manage cards here.
  const isAvailable = isPaymentMethodsAvailable() && !isAgenting;
  // An explicit prop wins so tests can drive either flow directly.
  const isBraintree = (variant ?? flaggedVariant()) === 'braintree';
  // Only while the dialog is open, and only for a card with a token to look up: the check is per
  // card and the page shows no subscription data. The same predicate feeds the hook's `enabled`.
  const isSubscriptionCheckEnabled = isSubscriptionsAvailable() && Boolean(pendingDelete?.token);
  const affectedSubscriptions = useSubscriptionsUsingInstrument(
    customerId,
    pendingDelete?.token,
    isSubscriptionCheckEnabled,
  );
  const subscriptionCheckStatus = deriveSubscriptionCheckStatus(
    isSubscriptionCheckEnabled,
    affectedSubscriptions,
  );

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['storedInstruments', customerId],
    queryFn: listStoredInstruments,
    enabled: isAvailable,
  });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const customerEmail = useAppSelector(({ company }) => company.customer.emailAddress);

  // Tri-state gate (spec §6): 'available' → in-portal dialog; 'unavailable' (theme page
  // without a token = no gateway, i.e. Preferred) → no affordance at all; error (scrape
  // broken / challenge / outage) → link out to the native page instead.
  const vaultAccess = useQuery({
    queryKey: ['vaultAccess', customerId],
    queryFn: getVaultAccess,
    enabled: isAvailable && !isBraintree,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // The hosted card form is checkout infrastructure and only works with an active cart
  // (spec §2.9); without one we say so instead of offering a dialog that cannot load.
  const activeCart = useQuery({
    queryKey: ['activeCart', customerId],
    queryFn: hasActiveCart,
    enabled: isAvailable && !isBraintree,
  });

  // Braintree needs no cart and no VAT: gate on whether a client token can be minted,
  // which also self-gates brands with no Braintree gateway.
  const braintreeClientToken = useQuery({
    queryKey: ['braintreeClientToken', customerId],
    queryFn: getBraintreeClientToken,
    enabled: isAvailable && isBraintree,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const isVaultAvailable = vaultAccess.data?.state === 'available';
  const canAddInPortal = isBraintree
    ? Boolean(braintreeClientToken.data)
    : isVaultAvailable && activeCart.data === true;
  const needsCart = !isBraintree && isVaultAvailable && activeCart.data === false;

  const handleAdded = () => {
    setIsAddOpen(false);
    queryClient.invalidateQueries({ queryKey: ['storedInstruments', customerId] });
    snackbar.success(b3Lang('paymentMethods.addCard.success'));
  };

  const handleMutationError = (err: unknown) => {
    if (err instanceof PaymentMethodsError) {
      if (err.kind === 'notFound') {
        snackbar.error(b3Lang('paymentMethods.errors.notFound'));
        queryClient.invalidateQueries({ queryKey: ['storedInstruments', customerId] });
        return;
      }
      if (err.kind === 'rateLimited') {
        snackbar.error(b3Lang('paymentMethods.errors.rateLimited'));
        return;
      }
      if (err.kind === 'sessionExpired') {
        snackbar.error(b3Lang('paymentMethods.sessionExpired'));
        return;
      }
    }
    snackbar.error(b3Lang('paymentMethods.errors.generic'));
  };

  const setDefaultMutation = useMutation({
    mutationFn: setDefaultStoredInstrument,
    onSuccess: (refreshed) => {
      queryClient.setQueryData(['storedInstruments', customerId], refreshed);
      snackbar.success(b3Lang('paymentMethods.defaultUpdated'));
    },
    onError: handleMutationError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStoredInstrument,
    onSuccess: (refreshed) => {
      queryClient.setQueryData(['storedInstruments', customerId], refreshed);
      setPendingDelete(null);
      snackbar.success(b3Lang('paymentMethods.deleted'));
    },
    onError: (err) => {
      setPendingDelete(null);
      handleMutationError(err);
    },
  });

  if (!isAvailable) {
    return <Typography>{b3Lang('paymentMethods.unavailable')}</Typography>;
  }

  const isSessionExpired = error instanceof PaymentMethodsError && error.kind === 'sessionExpired';
  const isMutating = setDefaultMutation.isPending || deleteMutation.isPending;

  return (
    <B3Spin isSpinning={isFetching}>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%' }}>
        {isSessionExpired && (
          <Alert severity="warning">{b3Lang('paymentMethods.sessionExpired')}</Alert>
        )}
        {isError && !isSessionExpired && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                {b3Lang('paymentMethods.retry')}
              </Button>
            }
          >
            {b3Lang('paymentMethods.loadError')}
          </Alert>
        )}
        {canAddInPortal && (
          <Box sx={{ mb: 2 }}>
            <Button variant="outlined" onClick={() => setIsAddOpen(true)}>
              {b3Lang('paymentMethods.addCard.button')}
            </Button>
          </Box>
        )}
        {needsCart && (
          <Typography sx={{ mb: 2 }}>{b3Lang('paymentMethods.addCard.needsCart')}</Typography>
        )}
        {!isBraintree && vaultAccess.isError && (
          <Box sx={{ mb: 2 }}>
            {/* The portal renders inside the ThemeFrame; a plain anchor would navigate the frame. */}
            <Link href={NATIVE_ADD_PAYMENT_METHOD_PATH} target="_top">
              {b3Lang('paymentMethods.addCard.button')}
            </Link>
          </Box>
        )}
        {isAddOpen &&
          (isBraintree && braintreeClientToken.data ? (
            <AddPaymentMethodBraintreeDialog
              clientToken={braintreeClientToken.data}
              customerEmail={customerEmail}
              onAdded={handleAdded}
              onClose={() => setIsAddOpen(false)}
            />
          ) : (
            <AddPaymentMethodDialog
              customerEmail={customerEmail}
              onAdded={handleAdded}
              onClose={() => setIsAddOpen(false)}
            />
          ))}
        {data && data.instruments.length === 0 && (
          <Typography>
            {canAddInPortal
              ? b3Lang('paymentMethods.addCard.emptyList')
              : b3Lang('paymentMethods.empty')}
          </Typography>
        )}
        {data &&
          data.instruments.map((instrument) => (
            <PaymentMethodRow
              key={instrument.token}
              instrument={instrument}
              disableActions={isMutating}
              onSetDefault={() => setDefaultMutation.mutate(instrument.token)}
              onDelete={() => setPendingDelete(instrument)}
            />
          ))}
        <B3Dialog
          isOpen={Boolean(pendingDelete)}
          title={b3Lang('paymentMethods.deleteDialog.title')}
          leftSizeBtn={b3Lang('paymentMethods.deleteDialog.cancel')}
          rightSizeBtn={b3Lang('paymentMethods.deleteDialog.confirm')}
          loading={deleteMutation.isPending}
          disabledSaveBtn={subscriptionCheckStatus === 'checking'}
          handleLeftClick={() => {
            if (!deleteMutation.isPending) {
              setPendingDelete(null);
            }
          }}
          handRightClick={() => {
            if (pendingDelete) {
              deleteMutation.mutate(pendingDelete.token);
            }
          }}
        >
          <Box>
            {pendingDelete &&
              b3Lang('paymentMethods.deleteDialog.content', {
                card: b3Lang('paymentMethods.cardLabel', {
                  brand: pendingDelete.brand,
                  last4: pendingDelete.last4,
                }),
              })}
            <DeleteSubscriptionWarning
              status={subscriptionCheckStatus}
              subscriptions={affectedSubscriptions.data ?? []}
              onManageSubscriptions={() => navigate('/manage-subscriptions')}
            />
          </Box>
        </B3Dialog>
      </Box>
    </B3Spin>
  );
}

export default PaymentMethods;
