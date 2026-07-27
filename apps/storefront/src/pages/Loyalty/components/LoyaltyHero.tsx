import { useState } from 'react';
import { WorkspacePremium } from '@mui/icons-material';
import { Box, Button, Chip, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import ShippingTracker from './ShippingTracker';

interface LoyaltyHeroProps {
  firstName: string;
  companyName: string;
  memberSince: string | null;
  tierTitle: string | null;
  pointBalance: number | null;
  showEarnCta: boolean;
  gateSummary: string | null;
  bannerUrl: string;
}

function LoyaltyHero({
  firstName,
  companyName,
  memberSince,
  tierTitle,
  pointBalance,
  showEarnCta,
  gateSummary,
  bannerUrl,
}: LoyaltyHeroProps) {
  const b3Lang = useB3Lang();
  // background-image cannot report load failures, so the photo is a real <img> we can hide.
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <>
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          borderRadius: 2,
          p: { xs: 3, sm: 4 },
          mb: 2,
        }}
      >
        {!imageFailed && (
          <Box
            component="img"
            src={bannerUrl}
            alt=""
            onError={() => setImageFailed(true)}
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              height: '100%',
              width: { xs: 0, md: '55%' },
              objectFit: 'cover',
              // Decorative: the gradient below keeps the copy legible over it.
              display: { xs: 'none', md: 'block' },
            }}
          />
        )}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: (theme) =>
              `linear-gradient(to right, ${theme.palette.primary.main} 45%, transparent 100%)`,
          }}
        />
        <Box sx={{ position: 'relative' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <WorkspacePremium />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {b3Lang('loyalty.hero.brand')}
              </Typography>
            </Box>
            {memberSince && (
              <Chip
                label={b3Lang('loyalty.hero.memberSince', { date: memberSince })}
                sx={{ bgcolor: 'common.black', color: 'common.white' }}
              />
            )}
          </Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
            {b3Lang('loyalty.hero.welcomeBack', { name: firstName || companyName })}
          </Typography>
          {showEarnCta && (
            <Button
              href={`${window.location.origin}/`}
              variant="outlined"
              sx={{
                mt: 2,
                borderRadius: 8,
                color: 'primary.contrastText',
                borderColor: 'primary.contrastText',
              }}
            >
              {b3Lang('loyalty.hero.cta')}
            </Button>
          )}
          {gateSummary && (
            <Typography variant="body2" sx={{ mt: 2, opacity: 0.9 }}>
              {gateSummary}
            </Typography>
          )}
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
          <ShippingTracker />
        </Box>
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
