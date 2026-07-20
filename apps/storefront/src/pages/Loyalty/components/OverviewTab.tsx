import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyCustomer, LoyaltyTier, LoyaltyTierProgress } from '../api';

import SectionHeader from './SectionHeader';
import TierProgressCard from './TierProgressCard';

interface OverviewTabProps {
  customer: LoyaltyCustomer | undefined;
  tiers: LoyaltyTier[];
  tierProgress: LoyaltyTierProgress | null;
}

function OverviewTab({ customer, tiers, tierProgress }: OverviewTabProps) {
  const b3Lang = useB3Lang();

  if (!customer) {
    return null;
  }

  const currentTier = tiers.find((tier) => tier.id === customer.currentLoyaltyTierId);

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
      {customer.currentMembership && customer.currentMembership.perks.length > 0 && (
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
            {b3Lang('loyalty.overview.membershipBenefitsTitle', {
              membership: customer.currentMembership.title,
            })}
          </Typography>
          <Box sx={{ flex: '1 1 50%' }}>
            {customer.currentMembership.perks.map((perk) => (
              <Typography key={perk} variant="body2" sx={{ mb: 0.5 }}>
                {perk}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
      <TierProgressCard progress={tierProgress} />
    </Box>
  );
}

export default OverviewTab;
