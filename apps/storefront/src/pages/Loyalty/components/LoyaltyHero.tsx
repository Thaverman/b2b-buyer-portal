import { WorkspacePremium } from '@mui/icons-material';
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
    <>
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          borderRadius: 2,
          p: { xs: 3, sm: 4 },
          mb: 2,
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Typography
            variant="h4"
            sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}
          >
            {b3Lang('loyalty.hero.welcome')}
          </Typography>
          {memberSince && (
            <Chip
              label={b3Lang('loyalty.hero.memberSince', { date: memberSince })}
              sx={{ bgcolor: 'common.black', color: 'common.white' }}
            />
          )}
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 400, opacity: 0.9 }}>
          {companyName}
        </Typography>
        {tierTitle && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              {b3Lang('loyalty.hero.currentTier')}
            </Typography>
            <Chip
              icon={<WorkspacePremium />}
              label={tierTitle}
              sx={{
                mt: 1,
                fontWeight: 700,
                bgcolor: 'common.black',
                color: 'common.white',
                '& .MuiChip-icon': { color: 'common.white' },
              }}
            />
          </Box>
        )}
      </Box>
      {pointBalance !== null && (
        <Typography sx={{ textAlign: 'center', mb: 2, color: 'text.secondary' }}>
          {b3Lang('loyalty.hero.points', { points: pointBalance.toLocaleString() })}
        </Typography>
      )}
    </>
  );
}

export default LoyaltyHero;
