import { Alert, Box, Button, Link, Typography } from '@mui/material';

import B3Spin from '@/components/spin/B3Spin';
import { useB3Lang } from '@/lib/lang';
import { OrdergrooveError } from '@/shared/service/ordergroove';
import { useAppSelector } from '@/store';
import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';

import CancelledSubscriptions from './components/CancelledSubscriptions';
import RecentOrders from './components/RecentOrders';
import SubscriptionCard, { CellLoading } from './components/SubscriptionCard';
import { useSubscriptionsData } from './hooks/useSubscriptionsData';
import { buildRecentOrders, buildSubscriptionCards } from './viewModel';

// Until Phase 3, every action still lives on the theme's hosted manager page.
const HOSTED_MANAGER_URL = `${BigCommerceStorefrontAPIBaseURL}/subscriptions`;

const isSessionExpired = (error: unknown) =>
  error instanceof OrdergrooveError && error.kind === 'sessionExpired';

function SubscriptionsManager() {
  const b3Lang = useB3Lang();
  const customerId = useAppSelector(({ company }) => company.customer.id);
  const { subscriptions, payments, addresses, upcoming, products, orderHistory } =
    useSubscriptionsData(customerId);

  const { active, cancelled } = buildSubscriptionCards(subscriptions.data ?? [], {
    products: products.data,
    addresses: addresses.data,
    payments: payments.data,
    upcoming: upcoming.data,
  });
  const loading: CellLoading = {
    product: products.isPending,
    shipping: addresses.isPending,
    payment: payments.isPending,
    nextOrder: upcoming.isPending,
  };

  // Only the subscriptions query blocks the page; the others degrade their cells (spec §5.2).
  const cardQueries = [subscriptions, payments, addresses, upcoming];
  const failed = cardQueries.filter((query) => query.isError);
  const sessionExpired = [...cardQueries, orderHistory].some((query) =>
    isSessionExpired(query.error),
  );
  const retryFailed = () => failed.forEach((query) => query.refetch());

  return (
    <B3Spin isSpinning={subscriptions.isPending}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          {/* target="_top": the portal renders inside the ThemeFrame; a plain anchor would load the theme page inside it. */}
          <Link href={HOSTED_MANAGER_URL} target="_top">
            {b3Lang('subscriptions.hostedManagerLink')}
          </Link>
        </Box>
        {sessionExpired && (
          <Alert severity="warning">{b3Lang('subscriptions.sessionExpired')}</Alert>
        )}
        {!sessionExpired && failed.length > 0 && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={retryFailed}>
                {b3Lang('subscriptions.retry')}
              </Button>
            }
          >
            {subscriptions.isError
              ? b3Lang('subscriptions.loadError')
              : b3Lang('subscriptions.partialLoadError')}
          </Alert>
        )}
        {subscriptions.isSuccess && active.length === 0 && (
          <Typography color="text.secondary">{b3Lang('subscriptions.empty')}</Typography>
        )}
        {active.map((card) => (
          <SubscriptionCard key={card.publicId} card={card} variant="active" loading={loading} />
        ))}
        <CancelledSubscriptions cards={cancelled} loading={loading} />
        <RecentOrders
          orders={buildRecentOrders(
            orderHistory.data?.pages.flatMap((result) => result.results) ?? [],
          )}
          isPending={orderHistory.isPending}
          isError={orderHistory.isError && !isSessionExpired(orderHistory.error)}
          hasNextPage={Boolean(orderHistory.hasNextPage)}
          isFetchingNextPage={orderHistory.isFetchingNextPage}
          onShowMore={() => orderHistory.fetchNextPage()}
          onRetry={() => orderHistory.refetch()}
        />
      </Box>
    </B3Spin>
  );
}

export default SubscriptionsManager;
