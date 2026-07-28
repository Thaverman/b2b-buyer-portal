import { WorkspacePremiumOutlined } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyCustomer, LoyaltyTier, LoyaltyTierProgress } from '../api';

import TierProgressCard from './TierProgressCard';

interface BenefitsTabProps {
  customer: LoyaltyCustomer | undefined;
  tiers: LoyaltyTier[];
  tierProgress: LoyaltyTierProgress | null;
  tierDisplayName: string | null;
}

const benefitsBoxSx = {
  bgcolor: 'primary.main',
  color: 'primary.contrastText',
  borderRadius: 2,
  p: { xs: 3, sm: 4 },
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 3,
} as const;

interface BenefitsBoxProps {
  title: string;
  perks: string[];
}

function BenefitsBox({ title, perks }: BenefitsBoxProps) {
  return (
    <Box sx={benefitsBoxSx}>
      <WorkspacePremiumOutlined
        sx={{ fontSize: 64, flex: '0 0 auto', mx: { xs: 'auto', sm: 3 } }}
      />
      <Box sx={{ flex: '1 1 60%' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          {title}
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {perks.map((perk) => (
            <Typography key={perk} component="li" variant="body2" sx={{ mb: 0.5 }}>
              {perk}
            </Typography>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function BenefitsTab({ customer, tiers, tierProgress, tierDisplayName }: BenefitsTabProps) {
  const b3Lang = useB3Lang();

  if (!customer) {
    return null;
  }

  const currentTier = tiers.find((tier) => tier.id === customer.currentLoyaltyTierId);
  const membership = customer.currentMembership;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {b3Lang('loyalty.benefits.introLead')}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {tierDisplayName
            ? b3Lang('loyalty.benefits.introGuide', { tier: tierDisplayName })
            : b3Lang('loyalty.benefits.introGuideGeneric')}
        </Typography>
      </Box>
      {currentTier && (
        <BenefitsBox
          title={b3Lang('loyalty.overview.benefitsTitle', { tier: currentTier.title })}
          perks={currentTier.perks}
        />
      )}
      {membership && membership.perks.length > 0 && (
        <BenefitsBox
          title={b3Lang('loyalty.overview.membershipBenefitsTitle', {
            membership: membership.title,
          })}
          perks={membership.perks}
        />
      )}
      <TierProgressCard progress={tierProgress} />
    </Box>
  );
}

export default BenefitsTab;
