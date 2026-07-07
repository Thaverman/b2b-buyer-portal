import { Box, Card, CardContent, LinearProgress, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyTier, parseThreshold } from '../api';

interface TiersTabProps {
  tiers: LoyaltyTier[];
  currentTierId: string | null;
  currentTierProgress: number | null;
}

const findNextTier = (
  tiers: LoyaltyTier[],
  progress: number,
): { tier: LoyaltyTier; threshold: number } | null => {
  const parsed = tiers
    .map((tier) => ({ tier, threshold: parseThreshold(tier.threshold) }))
    .filter((entry): entry is { tier: LoyaltyTier; threshold: number } => entry.threshold !== null)
    .sort((a, b) => a.threshold - b.threshold);

  // Defensive: if ANY tier threshold fails to parse, the units are suspect — hide progress.
  if (parsed.length !== tiers.length) {
    return null;
  }

  return parsed.find((entry) => entry.threshold > progress) ?? null;
};

function TiersTab({ tiers, currentTierId, currentTierProgress }: TiersTabProps) {
  const b3Lang = useB3Lang();
  const next = currentTierProgress === null ? null : findNextTier(tiers, currentTierProgress);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {next && currentTierProgress !== null && (
        <Card>
          <CardContent>
            <Typography variant="subtitle2">
              {b3Lang('loyalty.tiers.progressTo', { tier: next.tier.title })}
            </Typography>
            <Typography variant="h6">{`${currentTierProgress.toLocaleString()} / ${next.threshold.toLocaleString()}`}</Typography>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, (currentTierProgress / next.threshold) * 100)}
              sx={{ mt: 1 }}
            />
          </CardContent>
        </Card>
      )}
      {tiers.map((tier) => (
        <Card key={tier.id}>
          <CardContent>
            <Typography variant="h6">
              {tier.id === currentTierId
                ? b3Lang('loyalty.tiers.currentTier', { tier: tier.title })
                : tier.title}
            </Typography>
            {tier.perks.map((perk) => (
              <Typography key={perk} variant="body2">
                {perk}
              </Typography>
            ))}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

export default TiersTab;
