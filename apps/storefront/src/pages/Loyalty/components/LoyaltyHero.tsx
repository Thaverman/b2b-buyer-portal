import { useState } from 'react';
import { WorkspacePremium } from '@mui/icons-material';
import { alpha, Box, Button, Chip, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import ShippingTracker from './ShippingTracker';

interface LoyaltyHeroProps {
  firstName: string;
  companyName: string;
  tierTitle: string | null;
  pointBalance: number | null;
  showEarnCta: boolean;
  gateSummary: string | null;
  bannerUrl: string;
}

function LoyaltyHero({
  firstName,
  companyName,
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
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              // loyalty-account-banner.jpg's subject sits in roughly the right third of the
              // frame; the default centered crop pushes her out of frame entirely on narrow
              // (mobile-width, tall) boxes, where object-fit:cover crops from the sides.
              objectPosition: 'right center',
            }}
          />
        )}
        {/* A flat neutral scrim, not this theme's own primary blue: the default banner asset
            already bakes in its own solid-blue field on the left fading into the photo on the
            right, so stacking another primary-colored layer on top double-tints that field and
            makes the seam between "flat" and "photo" more visible instead of less. */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            bgcolor: (theme) => alpha(theme.palette.common.black, 0.5),
          }}
        />
        <Box sx={{ position: 'relative' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WorkspacePremium />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {b3Lang('loyalty.hero.brand')}
            </Typography>
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
