import { Box, LinearProgress, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyCustomer, LoyaltyTier } from '../api';
import { findNextTier } from '../tierProgress';

import SectionHeader from './SectionHeader';

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
  const nextTier = findNextTier(tiers, progress);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.overview')}</SectionHeader>
      {currentTier && (
        <Box
          sx={{
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            borderRadius: 2,
            p: { xs: 3, sm: 4 },
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Typography
            variant="h6"
            sx={{ fontWeight: 800, textTransform: 'uppercase', flex: '1 1 40%' }}
          >
            {b3Lang('loyalty.overview.benefitsTitle', { tier: currentTier.title })}
          </Typography>
          <Box sx={{ flex: '1 1 50%' }}>
            {currentTier.perks.map((perk) => (
              <Typography key={perk} variant="body2" sx={{ mb: 0.5 }}>
                {perk}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
      {nextTier && progress !== null && (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
          <Typography variant="subtitle2" color="text.secondary">
            {b3Lang('loyalty.tiers.progressTo', { tier: nextTier.tier.title })}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {`${progress.toLocaleString()} / ${nextTier.threshold.toLocaleString()}`}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, (progress / nextTier.threshold) * 100)}
            sx={{ mt: 1, height: 8, borderRadius: 4 }}
          />
        </Box>
      )}
    </Box>
  );
}

export default OverviewTab;
