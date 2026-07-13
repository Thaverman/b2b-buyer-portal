import { Box, LinearProgress, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import { currencyFormat } from '@/utils/b3CurrencyFormat';

import { getShippingCalculation, isShippingTrackerAvailable } from '../api';

function ShippingTracker() {
  const b3Lang = useB3Lang();

  const shippingQuery = useQuery({
    queryKey: ['loyaltyShipping'],
    queryFn: getShippingCalculation,
    enabled: isShippingTrackerAvailable(),
  });
  const calculation = shippingQuery.data;

  // Hidden while loading/errored/gate-off, and when threshold is unusable (0/0 bar).
  if (!calculation || calculation.threshold <= 0) {
    return null;
  }

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="body1" sx={{ fontWeight: 700 }}>
        {calculation.qualifies
          ? b3Lang('loyalty.shipping.qualified')
          : b3Lang('loyalty.shipping.away', { amount: currencyFormat(calculation.remaining) })}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={
          calculation.qualifies
            ? 100
            : Math.min(100, (calculation.eligibleSubtotal / calculation.threshold) * 100)
        }
        sx={{
          mt: 1,
          height: 8,
          borderRadius: 4,
          bgcolor: 'rgba(255, 255, 255, 0.3)',
          '& .MuiLinearProgress-bar': { bgcolor: 'common.white', borderRadius: 4 },
        }}
      />
      <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.9 }}>
        {b3Lang('loyalty.shipping.progress', {
          current: currencyFormat(calculation.eligibleSubtotal),
          threshold: currencyFormat(calculation.threshold),
        })}
      </Typography>
    </Box>
  );
}

export default ShippingTracker;
