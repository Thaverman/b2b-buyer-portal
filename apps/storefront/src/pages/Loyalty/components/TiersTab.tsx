import { Box, Card, CardContent, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyTier } from '../api';

import SectionHeader from './SectionHeader';

interface TiersTabProps {
  tiers: LoyaltyTier[];
  currentTierId: string | null;
}

function TiersTab({ tiers, currentTierId }: TiersTabProps) {
  const b3Lang = useB3Lang();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.tiers')}</SectionHeader>
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
