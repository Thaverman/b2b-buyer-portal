import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import {
  LoyaltyCustomer,
  LoyaltyIdentity,
  LoyaltyMembership,
  LoyaltyTier,
  LoyaltyTierProgress,
} from '../api';

import EarnPointsTab from './EarnPointsTab';
import MembershipsTab from './MembershipsTab';
import SectionHeader from './SectionHeader';
import TierProgressCard from './TierProgressCard';
import TiersTab from './TiersTab';

interface BenefitsTabProps {
  customer: LoyaltyCustomer | undefined;
  tiers: LoyaltyTier[];
  memberships: LoyaltyMembership[];
  tierProgress: LoyaltyTierProgress | null;
  identity: LoyaltyIdentity | undefined;
  customerQueryKey: (string | number)[];
}

const benefitsBoxSx = {
  bgcolor: 'primary.main',
  color: 'primary.contrastText',
  borderRadius: 2,
  p: { xs: 3, sm: 4 },
  display: 'flex',
  flexWrap: 'wrap',
  gap: 2,
} as const;

const benefitsTitleSx = { fontWeight: 800, textTransform: 'uppercase', flex: '1 1 40%' } as const;

function BenefitsTab({
  customer,
  tiers,
  memberships,
  tierProgress,
  identity,
  customerQueryKey,
}: BenefitsTabProps) {
  const b3Lang = useB3Lang();
  const currentTier = tiers.find((tier) => tier.id === customer?.currentLoyaltyTierId);
  const membership = customer?.currentMembership;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.benefits')}</SectionHeader>
      {membership && membership.perks.length > 0 && (
        <Box sx={benefitsBoxSx}>
          <Typography variant="h6" sx={benefitsTitleSx}>
            {b3Lang('loyalty.overview.membershipBenefitsTitle', { membership: membership.title })}
          </Typography>
          <Box sx={{ flex: '1 1 50%' }}>
            {membership.perks.map((perk) => (
              <Typography key={perk} variant="body2" sx={{ mb: 0.5 }}>
                {perk}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
      {currentTier && (
        <Box sx={benefitsBoxSx}>
          <Typography variant="h6" sx={benefitsTitleSx}>
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
      <TierProgressCard progress={tierProgress} />
      <EarnPointsTab identity={identity} customer={customer} customerQueryKey={customerQueryKey} />
      <TiersTab tiers={tiers} currentTierId={customer?.currentLoyaltyTierId ?? null} />
      {memberships.length > 0 && <MembershipsTab memberships={memberships} />}
    </Box>
  );
}

export default BenefitsTab;
