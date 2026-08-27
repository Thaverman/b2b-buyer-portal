import { useState } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import B3Dialog from '@/components/B3Dialog';
import B3Spin from '@/components/spin/B3Spin';
import { useB3Lang } from '@/lib/lang';
import { useAppSelector } from '@/store';
import { snackbar } from '@/utils/b3Tip';

import AddPaymentMethod from './components/AddPaymentMethod';
import PaymentMethodRow from './components/PaymentMethodRow';
import {
  deleteStoredInstrument,
  getVaultClientToken,
  isPaymentMethodsAvailable,
  listStoredInstruments,
  PaymentMethodsError,
  setDefaultStoredInstrument,
  StoredInstrument,
} from './api';

function PaymentMethods() {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<StoredInstrument | null>(null);
  const customerId = useAppSelector(({ company }) => company.customer.id);
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  // The JWT identifies the logged-in customer, so a masquerading rep must not manage cards here.
  const isAvailable = isPaymentMethodsAvailable() && !isAgenting;

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['storedInstruments', customerId],
    queryFn: listStoredInstruments,
    enabled: isAvailable,
  });

  // Brand gate: only Braintree-enabled stores can add cards. On brands without a
  // Braintree merchant account (Preferred) this probe 502s and the add-card
  // affordance simply never renders. Deliberately a probe, not a theme flag —
  // prod themes lag sandbox and a theme gate would silently fail open/closed.
  const { data: vaultClientToken } = useQuery({
    queryKey: ['vaultClientToken', customerId],
    queryFn: getVaultClientToken,
    enabled: isAvailable,
    staleTime: Infinity,
  });

  const handleAdded = () => {
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
    return (
      <Box>
        <Typography variant="h4">{b3Lang('paymentMethods.title')}</Typography>
        <Typography sx={{ mt: 2 }}>{b3Lang('paymentMethods.unavailable')}</Typography>
      </Box>
    );
  }

  const isSessionExpired = error instanceof PaymentMethodsError && error.kind === 'sessionExpired';
  const isMutating = setDefaultMutation.isPending || deleteMutation.isPending;

  return (
    <B3Spin isSpinning={isFetching}>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%' }}>
        <Typography variant="h4" sx={{ mb: 3 }}>
          {b3Lang('paymentMethods.title')}
        </Typography>
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
        {vaultClientToken && (
          <AddPaymentMethod clientToken={vaultClientToken} onAdded={handleAdded} />
        )}
        {data && data.instruments.length === 0 && (
          <Typography>
            {vaultClientToken
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
          </Box>
        </B3Dialog>
      </Box>
    </B3Spin>
  );
}

export default PaymentMethods;
