import { ArrowOutward } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyTier } from '../api';

interface NextTiersSectionProps {
  tiers: LoyaltyTier[];
  currentTierId: string | null;
  currentTierName: string | null;
  atTop: boolean;
}

function NextTiersSection({ tiers, currentTierId, currentTierName, atTop }: NextTiersSectionProps) {
  const b3Lang = useB3Lang();

  // SSW is the only trustworthy source for "topped out": Influence tier ids live in a
  // separate id space, so an id match cannot tell us the customer's real position.
  if (atTop) {
    return (
      <Typography sx={{ textAlign: 'center' }}>
        {currentTierName
          ? b3Lang('loyalty.benefits.atTopTier', { tier: currentTierName })
          : b3Lang('loyalty.benefits.atTopTierGeneric')}
      </Typography>
    );
  }

  const sswName = currentTierName?.trim().toLowerCase() ?? '';
  const byName = sswName
    ? tiers.findIndex((tier) => tier.title.trim().toLowerCase() === sswName)
    : -1;
  // Prefer the SSW name; fall back to the Influence id when progress is unavailable.
  const currentIndex =
    byName === -1 ? tiers.findIndex((tier) => tier.id === currentTierId) : byName;
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
