import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Chip, Link, Skeleton, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { currencyFormat } from '@/utils/b3CurrencyFormat';
import { displayFormat } from '@/utils/b3DateFormat';

import { OrderOutcome, RecentOrder } from '../viewModel';

interface RecentOrdersProps {
  orders: RecentOrder[];
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onShowMore: () => void;
  onRetry: () => void;
}

const OUTCOME_LABEL: Record<OrderOutcome, string> = {
  success: 'subscriptions.orders.outcome.success',
  failed: 'subscriptions.orders.outcome.failed',
  cancelled: 'subscriptions.orders.outcome.cancelled',
  processing: 'subscriptions.orders.outcome.processing',
};

const OUTCOME_COLOR: Record<OrderOutcome, 'success' | 'error' | 'default' | 'info'> = {
  success: 'success',
  failed: 'error',
  cancelled: 'default',
  processing: 'info',
};

function RecentOrders({
  orders,
  isPending,
  isError,
  hasNextPage,
  isFetchingNextPage,
  onShowMore,
  onRetry,
}: RecentOrdersProps) {
  const b3Lang = useB3Lang();

  return (
    <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="h6" component="h2">
        {b3Lang('subscriptions.orders.title')}
      </Typography>
      {isError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={onRetry}>
              {b3Lang('subscriptions.retry')}
            </Button>
          }
        >
          {b3Lang('subscriptions.orders.loadError')}
        </Alert>
      )}
      {isPending && [0, 1, 2].map((row) => <Skeleton key={row} height={32} />)}
      {!isPending && !isError && orders.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {b3Lang('subscriptions.orders.empty')}
        </Typography>
      )}
      {orders.map((order) => (
        <Box
          key={order.publicId}
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            alignItems: 'baseline',
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="body2" sx={{ minWidth: '7rem' }}>
            {String(displayFormat(order.placedOn, true))}
          </Typography>
          <Typography variant="body2" sx={{ minWidth: '9rem' }}>
            {order.webOrderNumber && order.orderDetailPath ? (
              // Internal navigation: the router link stays inside the SPA.
              <Link component={RouterLink} to={order.orderDetailPath}>
                {b3Lang('subscriptions.orders.webOrder', { number: order.webOrderNumber })}
              </Link>
            ) : (
              '—'
            )}
          </Typography>
          <Typography variant="body2" sx={{ minWidth: '5rem' }}>
            {currencyFormat(order.total)}
          </Typography>
          <Chip
            size="small"
            label={b3Lang(OUTCOME_LABEL[order.outcome])}
            color={OUTCOME_COLOR[order.outcome]}
          />
          {order.message && (
            <Typography variant="body2" color="text.secondary" sx={{ flexBasis: '100%' }}>
              {order.message}
            </Typography>
          )}
        </Box>
      ))}
      {hasNextPage && (
        <Button
          size="small"
          disabled={isFetchingNextPage}
          onClick={onShowMore}
          sx={{ alignSelf: 'flex-start' }}
        >
          {b3Lang('subscriptions.orders.showMore')}
        </Button>
      )}
    </Box>
  );
}

export default RecentOrders;
