import { alpha, Box, LinearProgress, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { currencyFormat } from '@/utils/b3CurrencyFormat';

import { LoyaltyTierProgress } from '../api';

interface TierProgressCardProps {
  progress: LoyaltyTierProgress | null;
}

function TierProgressCard({ progress }: TierProgressCardProps) {
  const b3Lang = useB3Lang();

  // PrePointsGate is surfaced by the hero (CTA + summary), not by this card.
  if (!progress || progress.targetKind !== 'NextTier') {
    return null;
  }

  return (
    <Box
      sx={{
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
        borderRadius: 2,
        p: 3,
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        {b3Lang('loyalty.tiers.progressTo', { tier: progress.targetTierName })}
      </Typography>
      {progress.targetAmountRequired > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('loyalty.progress.spendOf', {
              spent: currencyFormat(progress.spendInWindow),
              target: currencyFormat(progress.targetAmountRequired),
            })}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, progress.spendProgressPct)}
            sx={{ mt: 1, height: 8, borderRadius: 4 }}
          />
        </Box>
      )}
      {progress.targetOrdersRequired > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('loyalty.progress.ordersOf', {
              current: progress.ordersInWindow.toLocaleString(),
              target: progress.targetOrdersRequired.toLocaleString(),
            })}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, progress.ordersProgressPct)}
            sx={{ mt: 1, height: 8, borderRadius: 4 }}
          />
        </Box>
      )}
    </Box>
  );
}

export default TierProgressCard;
