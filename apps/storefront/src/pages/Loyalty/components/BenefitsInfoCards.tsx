import {
  LocalShippingOutlined,
  SavingsOutlined,
  SvgIconComponent,
  TrendingUp,
} from '@mui/icons-material';
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

interface BenefitsInfoCardsProps {
  tierDisplayName: string | null;
}

interface InfoCardProps {
  title: string;
  Icon: SvgIconComponent;
  points: string[];
}

function InfoCard({ title, Icon, points }: InfoCardProps) {
  return (
    <Box sx={{ bgcolor: 'grey.100', borderRadius: 2, p: { xs: 3, sm: 4 } }}>
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

function BenefitsInfoCards({ tierDisplayName }: BenefitsInfoCardsProps) {
  const b3Lang = useB3Lang();
  const creditRateTier = matchCreditRateTier(tierDisplayName);

  const point2 = (() => {
    if (creditRateTier === 'essential') return b3Lang('loyalty.benefits.credit.point2Essential');
    if (creditRateTier === 'select') return b3Lang('loyalty.benefits.credit.point2Select');
    if (creditRateTier === 'signature') return b3Lang('loyalty.benefits.credit.point2Signature');
    return b3Lang('loyalty.benefits.credit.point2Generic');
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
          b3Lang('loyalty.benefits.tierStatus.point2'),
        ]}
      />
    </Box>
  );
}

export default BenefitsInfoCards;
