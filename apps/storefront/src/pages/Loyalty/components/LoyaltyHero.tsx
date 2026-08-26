import { useState } from 'react';
import { WorkspacePremium } from '@mui/icons-material';
import { Box, Button, Chip, Typography } from '@mui/material';

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
        sx={(theme) => ({
          position: 'relative',
          overflow: 'hidden',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          borderRadius: 2,
          mb: 2,
          // The banner asset is 1920x600 (3.2:1), but this box is sized by its content, so its
          // own ratio swung from ~7:1 (greeting only) to ~3:1 (with the shipping tracker) and
          // object-fit: cover quietly cropped away up to half the photo's height. The floated
          // zero-width ::before makes the box AT LEAST as tall as the asset's ratio
          // (600/1920 = 31.25% of the width), so desktop crops nothing at any panel width.
          // aspect-ratio cannot do this job: it pins the height and, with overflow hidden,
          // clips the tallest hero states (gate CTA + summary + chip + tracker) instead of
          // growing. Percentage padding resolves against the content-box width, which is why
          // the padding moved to the inner Box below.
          [theme.breakpoints.up('md')]: {
            '&::before': { content: '""', float: 'left', width: 0, paddingBottom: '11.25%' },
            '&::after': { content: '""', display: 'table', clear: 'both' },
          },
        })}
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
              objectPosition: 'right top',
            }}
          />
        )}
        <Box sx={{ position: 'relative', p: { xs: 3, sm: 4 } }}>
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
              // The portal lives in the ThemeFrame iframe; without _top the storefront home
              // page loads inside the account panel instead of closing the portal.
              target="_top"
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
        <Typography sx={{ textAlign: 'center', mb: 2, fontWeight: 700 }}>
          {b3Lang('loyalty.hero.points', { points: pointBalance.toLocaleString() })}
        </Typography>
      )}
    </>
  );
}

export default LoyaltyHero;
