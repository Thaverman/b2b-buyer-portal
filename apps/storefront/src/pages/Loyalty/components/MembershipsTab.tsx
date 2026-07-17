import { Box, Card, CardContent, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyMembership } from '../api';

import SectionHeader from './SectionHeader';

interface MembershipsTabProps {
  memberships: LoyaltyMembership[];
}

function MembershipsTab({ memberships }: MembershipsTabProps) {
  const b3Lang = useB3Lang();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.memberships')}</SectionHeader>
      {memberships.map((membership) => (
        <Card key={membership.id} variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {membership.title}
            </Typography>
            {membership.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {membership.description}
              </Typography>
            )}
            {membership.perks.map((perk) => (
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

export default MembershipsTab;
