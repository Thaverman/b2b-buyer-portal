import { useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Tab, Tabs, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import B3Spin from '@/components/spin/B3Spin';
import { useB3Lang } from '@/lib/lang';
import { useAppSelector } from '@/store';

import LoyaltyHero from './components/LoyaltyHero';
import OverviewTab from './components/OverviewTab';
import TiersTab from './components/TiersTab';
import {
  fetchLoyaltyCustomer,
  fetchTiers,
  getLoyaltyDigest,
  isLoyaltyAvailable,
  LoyaltyError,
} from './api';

const LOYALTY_TABS = ['overview', 'earn', 'redeem', 'tiers', 'history'] as const;
type LoyaltyTab = (typeof LOYALTY_TABS)[number];

const toLoyaltyTab = (value: string | null): LoyaltyTab =>
  LOYALTY_TABS.includes(value as LoyaltyTab) ? (value as LoyaltyTab) : 'overview';

const formatMemberSince = (createdAt: string): string | null => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

function Loyalty() {
  const b3Lang = useB3Lang();
  const customerId = useAppSelector(({ company }) => company.customer.id);
  const companyName = useAppSelector(({ company }) => company.companyInfo.companyName);
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  // The digest identifies the logged-in customer, so a masquerading rep must not see points here.
  const isAvailable = isLoyaltyAvailable() && !isAgenting;

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = toLoyaltyTab(searchParams.get('tab'));

  const digestQuery = useQuery({
    queryKey: ['loyaltyDigest', customerId],
    queryFn: getLoyaltyDigest,
    enabled: isAvailable,
    staleTime: Infinity,
  });
  const identity = digestQuery.data;

  const customerQuery = useQuery({
    queryKey: ['loyaltyCustomer', customerId],
    queryFn: () => {
      // The enabled guard means this branch never runs; it satisfies the type
      // system without a non-null assertion (banned by the disabled-rule list).
      if (!identity) {
        return Promise.reject(new Error('identity not loaded'));
      }
      return fetchLoyaltyCustomer(identity);
    },
    enabled: Boolean(identity),
  });
  const customer = customerQuery.data;

  const tiersQuery = useQuery({
    queryKey: ['loyaltyTiers'],
    queryFn: fetchTiers,
    enabled: isAvailable,
    staleTime: Infinity,
  });
  const tiers = tiersQuery.data ?? [];

  if (!isAvailable) {
    return (
      <Box>
        <Typography sx={{ mt: 2 }}>{b3Lang('loyalty.unavailable')}</Typography>
      </Box>
    );
  }

  const error = digestQuery.error ?? customerQuery.error;
  let errorKind: string | null = null;
  if (error instanceof LoyaltyError) {
    errorKind = error.kind;
  } else if (error) {
    errorKind = 'upstream';
  }
  const isNotEnrolled = errorKind === 'notEnrolled';
  const isSessionExpired = errorKind === 'sessionExpired';
  const isLoadError = Boolean(errorKind) && !isNotEnrolled && !isSessionExpired;

  const tierTitle =
    (customer?.currentLoyaltyTierId &&
      tiers.find((tier) => tier.id === customer.currentLoyaltyTierId)?.title) ||
    null;

  return (
    <B3Spin isSpinning={digestQuery.isFetching || customerQuery.isFetching}>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%' }}>
        <LoyaltyHero
          companyName={companyName}
          memberSince={customer ? formatMemberSince(customer.createdAt) : null}
          tierTitle={tierTitle}
          pointBalance={customer ? customer.pointBalance : null}
        />
        {isSessionExpired && <Alert severity="warning">{b3Lang('loyalty.sessionExpired')}</Alert>}
        {isNotEnrolled && <Alert severity="info">{b3Lang('loyalty.notEnrolled')}</Alert>}
        {isLoadError && (
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() =>
                  digestQuery.error ? digestQuery.refetch() : customerQuery.refetch()
                }
              >
                {b3Lang('loyalty.retry')}
              </Button>
            }
          >
            {b3Lang('loyalty.loadError')}
          </Alert>
        )}
        <Tabs
          value={tab}
          onChange={(_, newTab: LoyaltyTab) => setSearchParams({ tab: newTab })}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ mb: 2 }}
        >
          <Tab value="overview" label={b3Lang('loyalty.tabs.overview')} />
          <Tab value="earn" label={b3Lang('loyalty.tabs.earn')} />
          <Tab value="redeem" label={b3Lang('loyalty.tabs.redeem')} />
          <Tab value="tiers" label={b3Lang('loyalty.tabs.tiers')} />
          <Tab value="history" label={b3Lang('loyalty.tabs.history')} />
        </Tabs>
        {tab === 'overview' && <OverviewTab customer={customer} tiers={tiers} />}
        {tab === 'earn' && <Box data-testid="loyalty-tab-earn" />}
        {tab === 'redeem' && <Box data-testid="loyalty-tab-redeem" />}
        {tab === 'tiers' && (
          <TiersTab
            tiers={tiers}
            currentTierId={customer?.currentLoyaltyTierId ?? null}
            currentTierProgress={customer?.currentLoyaltyTierProgress ?? null}
          />
        )}
        {tab === 'history' && <Box data-testid="loyalty-tab-history" />}
      </Box>
    </B3Spin>
  );
}

export default Loyalty;
