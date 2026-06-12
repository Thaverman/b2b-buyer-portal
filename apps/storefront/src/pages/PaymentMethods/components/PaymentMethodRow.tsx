import { Box, Button, Card, CardContent, Chip, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { StoredInstrument } from '../api';

interface PaymentMethodRowProps {
  instrument: StoredInstrument;
  disableActions: boolean;
  onSetDefault: () => void;
}

// A card is valid through the last day of its expiry month.
const isExpired = ({ expiryYear, expiryMonth }: StoredInstrument) =>
  new Date(expiryYear, expiryMonth, 1) <= new Date();

function PaymentMethodRow({ instrument, disableActions, onSetDefault }: PaymentMethodRowProps) {
  const b3Lang = useB3Lang();

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: '12rem' }}>
          <Typography variant="subtitle1">
            {b3Lang('paymentMethods.cardLabel', {
              brand: instrument.brand,
              last4: instrument.last4,
            })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('paymentMethods.expires', {
              month: String(instrument.expiryMonth).padStart(2, '0'),
              year: instrument.expiryYear,
            })}
          </Typography>
        </Box>
        {instrument.isDefault && (
          <Chip label={b3Lang('paymentMethods.default')} color="primary" size="small" />
        )}
        {isExpired(instrument) && (
          <Chip label={b3Lang('paymentMethods.expired')} color="warning" size="small" />
        )}
        {!instrument.isDefault && (
          <Button size="small" disabled={disableActions} onClick={onSetDefault}>
            {b3Lang('paymentMethods.setAsDefault')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default PaymentMethodRow;
