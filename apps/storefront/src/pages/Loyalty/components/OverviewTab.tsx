import { Box, Card, CardContent, LinearProgress, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyCustomer, LoyaltyTier, parseThreshold } from '../api';

interface OverviewTabProps {
  customer: LoyaltyCustomer | undefined;
  tiers: LoyaltyTier[];
}

function OverviewTab({ customer, tiers }: OverviewTabProps) {
  const b3Lang = useB3Lang();

  if (!customer) {
    return null;
  }

  const currentTier = tiers.find((tier) => tier.id === customer.currentLoyaltyTierId);
  const progress = customer.currentLoyaltyTierProgress;
  const sortedThresholds = tiers
    .map((tier) => ({ tier, threshold: parseThreshold(tier.threshold) }))
    .filter((entry): entry is { tier: LoyaltyTier; threshold: number } => entry.threshold !== null)
    .sort((a, b) => a.threshold - b.threshold);
  const nextTier =
    progress !== null && sortedThresholds.length === tiers.length
      ? sortedThresholds.find((entry) => entry.threshold > progress)
      : undefined;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {currentTier && (
        <Card>
          <CardContent>
            <Typography variant="h6">
              {b3Lang('loyalty.overview.benefitsTitle', { tier: currentTier.title })}
            </Typography>
            {currentTier.perks.map((perk) => (
              <Typography key={perk} variant="body2">
                {perk}
              </Typography>
            ))}
          </CardContent>
        </Card>
      )}
      {nextTier && progress !== null && (
        <Card>
          <CardContent>
            <Typography variant="subtitle2">
              {b3Lang('loyalty.tiers.progressTo', { tier: nextTier.tier.title })}
            </Typography>
            <Typography variant="h6">{`${progress.toLocaleString()} / ${nextTier.threshold.toLocaleString()}`}</Typography>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, (progress / nextTier.threshold) * 100)}
              sx={{ mt: 1 }}
            />
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

export default OverviewTab;
