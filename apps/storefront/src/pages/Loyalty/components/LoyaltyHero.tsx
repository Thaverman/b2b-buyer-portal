import { Box, Chip, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

interface LoyaltyHeroProps {
  companyName: string;
  memberSince: string | null;
  tierTitle: string | null;
  pointBalance: number | null;
}

function LoyaltyHero({ companyName, memberSince, tierTitle, pointBalance }: LoyaltyHeroProps) {
  const b3Lang = useB3Lang();

  return (
    <Box
      sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 1, p: 3, mb: 2 }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h5">{b3Lang('loyalty.hero.welcome')}</Typography>
        {memberSince && (
          <Chip
            label={b3Lang('loyalty.hero.memberSince', { date: memberSince })}
            sx={{ bgcolor: 'common.black', color: 'common.white' }}
          />
        )}
      </Box>
      <Typography variant="h6">{companyName}</Typography>
      {tierTitle && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2">{b3Lang('loyalty.hero.currentTier')}</Typography>
          <Chip label={tierTitle} sx={{ mt: 1, bgcolor: 'common.black', color: 'common.white' }} />
        </Box>
      )}
      {pointBalance !== null && (
        <Typography sx={{ mt: 2 }}>
          {b3Lang('loyalty.hero.points', { points: pointBalance.toLocaleString() })}
        </Typography>
      )}
    </Box>
  );
}

export default LoyaltyHero;
