import { ArrowOutward } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyMembership } from '../api';

interface NextMembershipsSectionProps {
  memberships: LoyaltyMembership[];
  currentTierName: string | null;
  atTop: boolean;
}

const MEMBERSHIP_LADDER_ORDER = ['essential', 'select', 'signature'];

function NextMembershipsSection({
  memberships,
  currentTierName,
  atTop,
}: NextMembershipsSectionProps) {
  const b3Lang = useB3Lang();

  const sswName = currentTierName?.trim() ?? '';

  // SSW is the only source consulted for placement (per the 2026-08-03 decision):
  // Influence is no longer trusted for "which membership is this customer in."
  if (atTop) {
    return (
      <Typography sx={{ textAlign: 'center' }}>
        {sswName
          ? b3Lang('loyalty.benefits.atTopTier', { tier: sswName })
          : b3Lang('loyalty.benefits.atTopTierGeneric')}
      </Typography>
    );
  }

  const anchorIndex = MEMBERSHIP_LADDER_ORDER.indexOf(sswName.toLowerCase());
  // Unknown or absent current membership: we cannot say what is "above," so show nothing.
  if (anchorIndex === -1) {
    return null;
  }

  const nextMemberships = MEMBERSHIP_LADDER_ORDER.slice(anchorIndex + 1)
    .map((name) => memberships.find((membership) => membership.title.trim().toLowerCase() === name))
    .filter((membership): membership is LoyaltyMembership => Boolean(membership));

  if (nextMemberships.length === 0) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 800, textAlign: 'center' }}>
        {b3Lang('loyalty.benefits.nextTiersTitle')}
      </Typography>
      <Typography sx={{ textAlign: 'center' }}>
        {nextMemberships.length === 1
          ? b3Lang('loyalty.benefits.nextTiersIntroOne')
          : b3Lang('loyalty.benefits.nextTiersIntroMany', { count: nextMemberships.length })}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {nextMemberships.map((membership) => (
          <Box
            key={membership.id}
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
                {b3Lang('loyalty.benefits.nextTierName', { title: membership.title })}
              </Typography>
              <ArrowOutward sx={{ fontSize: 32 }} />
            </Box>
            {membership.description.trim() !== '' && (
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>
                {`(${membership.description}) :`}
              </Typography>
            )}
            {membership.perks.length > 0 && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {membership.perks.join(', ')}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
      <Typography sx={{ textAlign: 'center' }}>{b3Lang('loyalty.benefits.autoUpgrade')}</Typography>
    </Box>
  );
}

export default NextMembershipsSection;
