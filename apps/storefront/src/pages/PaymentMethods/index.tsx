import { Alert, Box, Button, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import B3Spin from '@/components/spin/B3Spin';
import { useB3Lang } from '@/lib/lang';
import { useAppSelector } from '@/store';

import PaymentMethodRow from './components/PaymentMethodRow';
import { isPaymentMethodsAvailable, listStoredInstruments, PaymentMethodsError } from './api';

function PaymentMethods() {
  const b3Lang = useB3Lang();
  const customerId = useAppSelector(({ company }) => company.customer.id);
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  // The JWT identifies the logged-in customer, so a masquerading rep must not manage cards here.
  const isAvailable = isPaymentMethodsAvailable() && !isAgenting;

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['storedInstruments', customerId],
    queryFn: listStoredInstruments,
    enabled: isAvailable,
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
        {data && data.instruments.length === 0 && (
          <Typography>{b3Lang('paymentMethods.empty')}</Typography>
        )}
        {data &&
          data.instruments.map((instrument) => (
            <PaymentMethodRow key={instrument.token} instrument={instrument} />
          ))}
      </Box>
    </B3Spin>
  );
}

export default PaymentMethods;
