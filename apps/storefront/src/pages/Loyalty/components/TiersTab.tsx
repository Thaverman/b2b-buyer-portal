import { Box, Card, CardContent, LinearProgress, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyTier } from '../api';
import { findNextTier } from '../tierProgress';

interface TiersTabProps {
  tiers: LoyaltyTier[];
  currentTierId: string | null;
  currentTierProgress: number | null;
}

function TiersTab({ tiers, currentTierId, currentTierProgress }: TiersTabProps) {
  const b3Lang = useB3Lang();
  const next = findNextTier(tiers, currentTierProgress);

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
