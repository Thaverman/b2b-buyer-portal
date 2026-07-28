import { ArrowOutward } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyTier } from '../api';

interface NextTiersSectionProps {
  tiers: LoyaltyTier[];
  currentTierId: string | null;
}

function NextTiersSection({ tiers, currentTierId }: NextTiersSectionProps) {
  const b3Lang = useB3Lang();

  const currentIndex = tiers.findIndex((tier) => tier.id === currentTierId);
  // Unknown current tier: we cannot say what is "above", so show nothing.
  const nextTiers = currentIndex === -1 ? [] : tiers.slice(currentIndex + 1);

  if (nextTiers.length === 0) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 800, textAlign: 'center' }}>
        {b3Lang('loyalty.benefits.nextTiersTitle')}
      </Typography>
      <Typography sx={{ textAlign: 'center' }}>
        {nextTiers.length === 1
          ? b3Lang('loyalty.benefits.nextTiersIntroOne')
          : b3Lang('loyalty.benefits.nextTiersIntroMany', { count: nextTiers.length })}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {nextTiers.map((tier) => (
          <Box
            key={tier.id}
            sx={{
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              borderRadius: 2,
              p: 3,
              flex: '1 1 40%',
              minWidth: 240,
            }}
          >
            <Box
              sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <Typography variant="h5" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>
                {b3Lang('loyalty.benefits.nextTierName', { title: tier.title })}
              </Typography>
              <ArrowOutward sx={{ fontSize: 32 }} />
            </Box>
            {tier.threshold.trim() !== '' && (
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>
                {`(${tier.threshold}) :`}
              </Typography>
            )}
            {tier.perks.length > 0 && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {tier.perks.join(', ')}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
      <Typography sx={{ textAlign: 'center' }}>{b3Lang('loyalty.benefits.autoUpgrade')}</Typography>
    </Box>
  );
}

export default NextTiersSection;
