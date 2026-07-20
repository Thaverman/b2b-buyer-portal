import { Box, LinearProgress, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { currencyFormat } from '@/utils/b3CurrencyFormat';

import { LoyaltyTierProgress } from '../api';

interface TierProgressCardProps {
  progress: LoyaltyTierProgress | null;
}

function TierProgressCard({ progress }: TierProgressCardProps) {
  const b3Lang = useB3Lang();

  if (!progress) {
    return null;
  }

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
      <Typography variant="subtitle2" color="text.secondary">
        {b3Lang('loyalty.tiers.progressTo', { tier: progress.targetTierName })}
      </Typography>
      {progress.targetOrdersRequired > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('loyalty.progress.orders')}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {`${progress.ordersInWindow.toLocaleString()} / ${progress.targetOrdersRequired.toLocaleString()}`}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, progress.ordersProgressPct)}
            sx={{ mt: 1, height: 8, borderRadius: 4 }}
          />
        </Box>
      )}
      {progress.targetAmountRequired > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('loyalty.progress.spend')}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {`${currencyFormat(progress.spendInWindow)} / ${currencyFormat(progress.targetAmountRequired)}`}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, progress.spendProgressPct)}
            sx={{ mt: 1, height: 8, borderRadius: 4 }}
          />
        </Box>
      )}
      {progress.summary && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {progress.summary}
        </Typography>
      )}
    </Box>
  );
}

export default TierProgressCard;
