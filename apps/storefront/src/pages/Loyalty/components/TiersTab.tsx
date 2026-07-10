import { Box, Card, CardContent, LinearProgress, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyTier } from '../api';
import { findNextTier } from '../tierProgress';

import SectionHeader from './SectionHeader';

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
      <SectionHeader>{b3Lang('loyalty.tabs.tiers')}</SectionHeader>
      {next && currentTierProgress !== null && (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
          <Typography variant="subtitle2" color="text.secondary">
            {b3Lang('loyalty.tiers.progressTo', { tier: next.tier.title })}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {`${currentTierProgress.toLocaleString()} / ${next.threshold.toLocaleString()}`}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, (currentTierProgress / next.threshold) * 100)}
            sx={{ mt: 1, height: 8, borderRadius: 4 }}
          />
        </Box>
      )}
      {tiers.map((tier) => (
        <Card
          key={tier.id}
          variant="outlined"
          sx={{
            borderRadius: 2,
            borderColor: tier.id === currentTierId ? 'primary.main' : 'divider',
          }}
        >
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {tier.id === currentTierId
                ? b3Lang('loyalty.tiers.currentTier', { tier: tier.title })
                : tier.title}
            </Typography>
            {tier.perks.map((perk) => (
              <Typography key={perk} variant="body2" color="text.secondary">
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
