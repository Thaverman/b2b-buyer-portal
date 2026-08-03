import { useState } from 'react';
import { WorkspacePremiumOutlined } from '@mui/icons-material';
import { Box, Button, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { getBenefitsBannerUrl, LoyaltyCustomer, LoyaltyTier, LoyaltyTierProgress } from '../api';

import BenefitsInfoCards from './BenefitsInfoCards';
import NextTiersSection from './NextTiersSection';
import TierProgressCard from './TierProgressCard';

interface BenefitsTabProps {
  customer: LoyaltyCustomer | undefined;
  tiers: LoyaltyTier[];
  tierProgress: LoyaltyTierProgress | null;
  tierDisplayName: string | null;
}

const benefitsBoxSx = {
  bgcolor: 'primary.main',
  color: 'primary.contrastText',
  borderRadius: 2,
  p: { xs: 3, sm: 4 },
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 3,
} as const;

interface BenefitsBoxProps {
  title: string;
  perks: string[];
}

function BenefitsBox({ title, perks }: BenefitsBoxProps) {
  return (
    <Box sx={benefitsBoxSx}>
      <WorkspacePremiumOutlined
        sx={{ fontSize: 64, flex: '0 0 auto', mx: { xs: 'auto', sm: 3 } }}
      />
      <Box sx={{ flex: '1 1 60%' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          {title}
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {perks.map((perk) => (
            <Typography key={perk} component="li" variant="body2" sx={{ mb: 0.5 }}>
              {perk}
            </Typography>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function BenefitsTab({ customer, tiers, tierProgress, tierDisplayName }: BenefitsTabProps) {
  const b3Lang = useB3Lang();
  // background-image cannot report load failures, so the banner is a real <img> we can hide.
  const [bannerFailed, setBannerFailed] = useState(false);

  if (!customer) {
    return null;
  }

  const currentTier = tiers.find((tier) => tier.id === customer.currentLoyaltyTierId);
  const membership = customer.currentMembership;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {b3Lang('loyalty.benefits.introLead')}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {tierDisplayName
            ? b3Lang('loyalty.benefits.introGuide', { tier: tierDisplayName })
            : b3Lang('loyalty.benefits.introGuideGeneric')}
        </Typography>
      </Box>
      {currentTier && (
        <BenefitsBox
          title={b3Lang('loyalty.overview.benefitsTitle', { tier: currentTier.title })}
          perks={currentTier.perks}
        />
      )}
      {membership && membership.perks.length > 0 && (
        <BenefitsBox
          title={b3Lang('loyalty.overview.membershipBenefitsTitle', {
            membership: membership.title,
          })}
          perks={membership.perks}
        />
      )}
      <TierProgressCard progress={tierProgress} />
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          borderRadius: 2,
          p: { xs: 3, sm: 6 },
        }}
      >
        {!bannerFailed && (
          <Box
            component="img"
            src={getBenefitsBannerUrl()}
            alt=""
            onError={() => setBannerFailed(true)}
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              height: '100%',
              width: { xs: 0, md: '45%' },
              objectFit: 'cover',
              // The photo is 3:2 (1347x898) with the subject's head near the top; this panel is
              // far wider than that, so bias the crop upwards to keep the head in frame.
              objectPosition: 'center 20%',
              display: { xs: 'none', md: 'block' },
            }}
          />
        )}
        <Box sx={{ position: 'relative', maxWidth: { md: '50%' } }}>
          <Typography variant="h4" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>
            {tierDisplayName
              ? b3Lang('loyalty.benefits.bannerTitle', { tier: tierDisplayName })
              : b3Lang('loyalty.benefits.bannerTitleGeneric')}
          </Typography>
          <Typography variant="body2" sx={{ mt: 2, opacity: 0.9 }}>
            {b3Lang('loyalty.benefits.bannerSubtitle')}
          </Typography>
        </Box>
      </Box>
      <BenefitsInfoCards tierDisplayName={tierDisplayName} />
      <NextTiersSection
        tiers={tiers}
        currentTierId={customer.currentLoyaltyTierId ?? null}
        currentTierName={tierProgress?.currentTierName || null}
        atTop={tierProgress?.targetKind === 'AtTop'}
      />
      <Typography sx={{ textAlign: 'center', fontWeight: 700 }}>
        {b3Lang('loyalty.benefits.contact')}
      </Typography>
      <Button
        href={`${window.location.origin}/`}
        // The portal lives in the ThemeFrame iframe; without _top the storefront home
        // page loads inside the account panel instead of closing the portal.
        target="_top"
        variant="contained"
        color="error"
        size="large"
        fullWidth
      >
        {b3Lang('loyalty.benefits.orderCta')}
      </Button>
    </Box>
  );
}

export default BenefitsTab;
