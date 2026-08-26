import {
  LocalShippingOutlined,
  LockClockOutlined,
  SavingsOutlined,
  SupportAgentOutlined,
  SvgIconComponent,
  TrendingUp,
} from '@mui/icons-material';
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

interface BenefitsInfoCardsProps {
  tierDisplayName: string | null;
  // SSW's placement, not tierDisplayName: the tier-restricted cards below are a visibility
  // gate, and tierDisplayName falls back to the Influence tier that b23b6eb3 removed from
  // this tab for placing customers on the wrong level. Per the 2026-08-03 decision, SSW
  // alone answers "which membership is this?", so an absent name hides those cards.
  currentTierName: string | null;
}

interface InfoCardProps {
  title: string;
  Icon: SvgIconComponent;
  points: string[];
}

function InfoCard({ title, Icon, points }: InfoCardProps) {
  return (
    <Box sx={{ bgcolor: '#ededed', borderRadius: 2, p: { xs: 3, sm: 4 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography variant="h6" color="primary" sx={{ fontWeight: 700, mb: 1 }}>
          {title}
        </Typography>
        <Icon color="primary" sx={{ fontSize: 40 }} />
      </Box>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {points.map((point) => (
          <Typography
            key={point}
            component="li"
            variant="body2"
            sx={{ mb: 0.5, fontSize: '18px', color: '#282828' }}
          >
            {point}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

type CreditRateTier = 'essential' | 'select' | 'signature';

const CREDIT_RATE_TIERS: CreditRateTier[] = ['essential', 'select', 'signature'];

// Case-insensitive, trim-then-compare — mirrors isTierAllowed's convention in api.ts —
// but stays local: this is display-copy selection, not shared by any other consumer.
function matchCreditRateTier(tierDisplayName: string | null): CreditRateTier | null {
  const normalized = tierDisplayName?.trim().toLowerCase();
  return CREDIT_RATE_TIERS.find((tier) => tier === normalized) ?? null;
}

function BenefitsInfoCards({ tierDisplayName, currentTierName }: BenefitsInfoCardsProps) {
  const b3Lang = useB3Lang();
  const creditRateTier = matchCreditRateTier(tierDisplayName);
  const sswTier = currentTierName?.trim().toLowerCase();
  const isSelect = sswTier === 'select';
  const isSignature = sswTier === 'signature';
  // Both perks start at Select; only their early-access window differs by tier.
  const isSelectOrAbove = isSelect || isSignature;

  const point2 = (() => {
    if (creditRateTier === 'essential') return b3Lang('loyalty.benefits.credit.point2Essential');
    if (creditRateTier === 'select') return b3Lang('loyalty.benefits.credit.point2Select');
    if (creditRateTier === 'signature') return b3Lang('loyalty.benefits.credit.point2Signature');
    return b3Lang('loyalty.benefits.credit.point2Generic');
  })();

  // Only Select and Signature publish a maintenance threshold; other tiers omit the line.
  const maintainLine = (() => {
    if (isSelect) return b3Lang('loyalty.benefits.tierStatus.maintainSelect');
    if (isSignature) return b3Lang('loyalty.benefits.tierStatus.maintainSignature');
    return null;
  })();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <InfoCard
        title={b3Lang('loyalty.benefits.credit.title')}
        Icon={SavingsOutlined}
        points={[
          b3Lang('loyalty.benefits.credit.point1'),
          point2,
          b3Lang('loyalty.benefits.credit.point3'),
          b3Lang('loyalty.benefits.credit.point4'),
        ]}
      />
      <InfoCard
        title={b3Lang('loyalty.benefits.shipping.title')}
        Icon={LocalShippingOutlined}
        points={[
          b3Lang('loyalty.benefits.shipping.point1'),
          b3Lang('loyalty.benefits.shipping.point2'),
        ]}
      />
      <InfoCard
        title={b3Lang('loyalty.benefits.tierStatus.title')}
        Icon={TrendingUp}
        points={[
          b3Lang('loyalty.benefits.tierStatus.point1'),
          ...(maintainLine ? [maintainLine] : []),
          b3Lang('loyalty.benefits.tierStatus.point2'),
        ]}
      />
      {isSelectOrAbove && (
        <InfoCard
          title={b3Lang('loyalty.benefits.accountRep.title')}
          Icon={SupportAgentOutlined}
          points={[b3Lang('loyalty.benefits.accountRep.point1')]}
        />
      )}
      {isSelectOrAbove && (
        <InfoCard
          title={
            isSignature
              ? b3Lang('loyalty.benefits.earlyAccess.titleSignature')
              : b3Lang('loyalty.benefits.earlyAccess.titleSelect')
          }
          Icon={LockClockOutlined}
          points={[
            isSignature
              ? b3Lang('loyalty.benefits.earlyAccess.point1Signature')
              : b3Lang('loyalty.benefits.earlyAccess.point1Select'),
            b3Lang('loyalty.benefits.earlyAccess.point2'),
          ]}
        />
      )}
    </Box>
  );
}

export default BenefitsInfoCards;
