import { useSearchParams } from 'react-router-dom';
import {
  CardGiftcard,
  CardMembership,
  FavoriteBorder,
  Layers,
  Schedule,
  StarBorder,
} from '@mui/icons-material';
import { Alert, Box, Button, Tab, Tabs, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import B3Spin from '@/components/spin/B3Spin';
import { useB3Lang } from '@/lib/lang';
import { useAppSelector } from '@/store';

import EarnPointsTab from './components/EarnPointsTab';
import LoyaltyHero from './components/LoyaltyHero';
import MembershipsTab from './components/MembershipsTab';
import MyRewardsTab from './components/MyRewardsTab';
import OverviewTab from './components/OverviewTab';
import RewardsTab from './components/RewardsTab';
import TiersTab from './components/TiersTab';
import {
  fetchLoyaltyCustomer,
  fetchMemberships,
  fetchTierProgress,
  fetchTiers,
  getAllowedTiers,
  getBannerUrl,
  getLoyaltyDigest,
  isLoyaltyAvailable,
  isTierAllowed,
  isTierProgressAvailable,
  LoyaltyError,
} from './api';

const LOYALTY_TABS = ['overview', 'earn', 'redeem', 'tiers', 'memberships', 'history'] as const;
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
  const firstName = useAppSelector(({ company }) => company.customer.firstName);
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

  const membershipsQuery = useQuery({
    queryKey: ['loyaltyMemberships'],
    queryFn: fetchMemberships,
    enabled: isAvailable,
    staleTime: Infinity,
  });
  const memberships = membershipsQuery.data ?? [];

  const tierProgressQuery = useQuery({
    queryKey: ['loyaltyTierProgress', customerId],
    queryFn: () => fetchTierProgress(customerId),
    enabled: isAvailable && isTierProgressAvailable() && Boolean(customerId),
    staleTime: Infinity,
  });
  const tierProgress = tierProgressQuery.data ?? null;

  if (!isAvailable) {
    return (
      <Box>
        <Typography sx={{ mt: 2 }}>{b3Lang('loyalty.unavailable')}</Typography>
      </Box>
    );
  }

  const tierTitle =
    (customer?.currentLoyaltyTierId &&
      tiers.find((tier) => tier.id === customer.currentLoyaltyTierId)?.title) ||
    null;

  // Display identity only — the allowlist gate below stays keyed to the Influence title.
  const displayTierTitle = tierProgress?.currentTierName || tierTitle;

  // Theme rollout gate (spec 2026-07-14): with a non-empty allowlist every
  // unverifiable state fails CLOSED — matching the theme's four enforcement
  // points. With an empty list (or missing global) behavior is unchanged.
  const allowedTiers = getAllowedTiers();
  let tierVerdict: 'allowed' | 'denied' | 'pending' = 'allowed';
  if (allowedTiers.length > 0) {
    if (digestQuery.isError || customerQuery.isError || tiersQuery.isError) {
      tierVerdict = 'denied';
    } else if (customerQuery.isSuccess && tiersQuery.isSuccess) {
      tierVerdict = isTierAllowed(tierTitle, allowedTiers) ? 'allowed' : 'denied';
    } else {
      tierVerdict = 'pending';
    }
  }

  if (tierVerdict === 'pending') {
    // No hero/tabs flash to a possibly-denied member (theme hidden-shell principle).
    return (
      <B3Spin isSpinning>
        <Box sx={{ flex: 1, width: '100%', minHeight: 200 }} />
      </B3Spin>
    );
  }
  if (tierVerdict === 'denied') {
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

  const hasMemberships = memberships.length > 0;
  const activeTab = tab === 'memberships' && !hasMemberships ? 'overview' : tab;

  return (
    <B3Spin isSpinning={digestQuery.isFetching || customerQuery.isFetching}>
      {/* pb clears host-page overlays (company-hierarchy bar, loyalty launcher) that float
          above the portal iframe at the bottom of small screens. */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          width: '100%',
          pb: { xs: 15, md: 0 },
        }}
      >
        <LoyaltyHero
          firstName={firstName}
          companyName={companyName}
          memberSince={customer ? formatMemberSince(customer.createdAt) : null}
          tierTitle={displayTierTitle}
          pointBalance={customer ? customer.pointBalance : null}
          showEarnCta={tierProgress?.targetKind === 'PrePointsGate'}
          gateSummary={
            tierProgress?.targetKind === 'PrePointsGate' ? tierProgress.summary || null : null
          }
          bannerUrl={getBannerUrl()}
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
          value={activeTab}
          onChange={(_, newTab: LoyaltyTab) => setSearchParams({ tab: newTab }, { replace: true })}
          variant="scrollable"
          allowScrollButtonsMobile
          // Auto margins center the tab group when it fits and resolve to 0 on overflow,
          // keeping start-aligned scrolling. (justify-content 'safe center' is parsed but
          // ignored by Chromium <115 / Safari <17.6, where it would clip the first tabs.)
          sx={{
            mb: 2,
            '& .MuiTabs-flexContainer > :first-of-type': { ml: 'auto' },
            '& .MuiTabs-flexContainer > :last-of-type': { mr: 'auto' },
          }}
        >
          <Tab
            value="overview"
            icon={<FavoriteBorder />}
            iconPosition="start"
            label={b3Lang('loyalty.tabs.overview')}
          />
          <Tab
            value="earn"
            icon={<StarBorder />}
            iconPosition="start"
            label={b3Lang('loyalty.tabs.earn')}
          />
          <Tab
            value="redeem"
            icon={<CardGiftcard />}
            iconPosition="start"
            label={b3Lang('loyalty.tabs.getRewards')}
          />
          <Tab
            value="tiers"
            icon={<Layers />}
            iconPosition="start"
            label={b3Lang('loyalty.tabs.tiers')}
          />
          {hasMemberships && (
            <Tab
              value="memberships"
              icon={<CardMembership />}
              iconPosition="start"
              label={b3Lang('loyalty.tabs.memberships')}
            />
          )}
          <Tab
            value="history"
            icon={<Schedule />}
            iconPosition="start"
            label={b3Lang('loyalty.tabs.history')}
          />
        </Tabs>
        {activeTab === 'overview' && (
          <OverviewTab customer={customer} tiers={tiers} tierProgress={tierProgress} />
        )}
        {activeTab === 'earn' && (
          <EarnPointsTab
            identity={identity}
            customer={customer}
            customerQueryKey={['loyaltyCustomer', customerId]}
          />
        )}
        {activeTab === 'redeem' && (
          <RewardsTab
            identity={identity}
            pointBalance={customer?.pointBalance ?? 0}
            customerQueryKey={['loyaltyCustomer', customerId]}
          />
        )}
        {activeTab === 'tiers' && (
          <TiersTab
            tiers={tiers}
            currentTierId={customer?.currentLoyaltyTierId ?? null}
            tierProgress={tierProgress}
          />
        )}
        {activeTab === 'memberships' && <MembershipsTab memberships={memberships} />}
        {activeTab === 'history' && <MyRewardsTab identity={identity} />}
      </Box>
    </B3Spin>
  );
}

export default Loyalty;
