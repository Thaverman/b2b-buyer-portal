import { ReactNode } from 'react';
import { Box, Card, CardContent, Link, Skeleton, Typography } from '@mui/material';

import { useMobile } from '@/hooks/useMobile';
import { useB3Lang } from '@/lib/lang';

import { describePayment, formatDate } from '../format';
import { SubscriptionCard as SubscriptionCardModel } from '../viewModel';

/** True while the query behind a cell is still pending; false once it settled, even by failing. */
export interface CellLoading {
  product: boolean;
  shipping: boolean;
  payment: boolean;
  nextOrder: boolean;
}

interface SubscriptionCardProps {
  card: SubscriptionCardModel;
  variant: 'active' | 'cancelled';
  loading: CellLoading;
  /** the actions row (Phase 3); rendered at the end of the details group */
  actions?: ReactNode;
}

function SubscriptionCard({ card, variant, loading, actions }: SubscriptionCardProps) {
  const b3Lang = useB3Lang();
  const [isMobile] = useMobile();

  // Skeleton while loading, the value once known, the fallback when the lookup found nothing.
  const cell = (isLoading: boolean, value: string | null, fallback: string) => {
    if (isLoading) {
      return <Skeleton width={180} sx={{ display: 'inline-block' }} />;
    }

    return value ?? fallback;
  };

  const frequency =
    card.frequencyDays % 7 === 0
      ? b3Lang('subscriptions.card.everyWeeks', { count: card.frequencyDays / 7 })
      : b3Lang('subscriptions.card.everyDays', { count: card.frequencyDays });

  const shipping =
    card.shippingAddress &&
    [
      card.shippingAddress.name,
      card.shippingAddress.company,
      card.shippingAddress.line1,
      card.shippingAddress.line2,
      card.shippingAddress.locality,
    ]
      .filter(Boolean)
      .join(', ');

  const paymentText = () => (card.payment ? describePayment(card.payment, b3Lang) : null);

  const schedule = () => {
    if (variant === 'cancelled') {
      return card.cancelledOn
        ? b3Lang('subscriptions.card.cancelledOn', { date: formatDate(card.cancelledOn) })
        : b3Lang('subscriptions.card.cancelled');
    }

    return cell(
      loading.nextOrder,
      card.nextOrderDate &&
        b3Lang('subscriptions.card.nextOrder', { date: formatDate(card.nextOrderDate) }),
      b3Lang('subscriptions.card.noUpcomingOrder'),
    );
  };

  const scheduleNode = (
    <Typography variant="body2" color={variant === 'cancelled' ? 'text.secondary' : 'text.primary'}>
      {schedule()}
    </Typography>
  );

  return (
    <Card>
      <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {card.product?.imageUrl && (
          <Box
            component="img"
            src={card.product.imageUrl}
            alt={card.product.name}
            sx={{ width: 80, height: 80, objectFit: 'contain', flexShrink: 0 }}
          />
        )}
        {/* The group names the card for assistive tech and lets tests tell the phone layout apart. */}
        <Box
          role="group"
          aria-label={
            card.product?.name ??
            b3Lang('subscriptions.card.unnamedProduct', { id: card.externalProductId })
          }
          sx={{ flex: 1, minWidth: '14rem', display: 'flex', flexDirection: 'column', gap: 0.5 }}
        >
          <Typography variant="subtitle1">
            {cell(
              loading.product,
              card.product?.name ?? null,
              b3Lang('subscriptions.card.unnamedProduct', { id: card.externalProductId }),
            )}
          </Typography>
          {isMobile && scheduleNode}
          {card.product?.sku && (
            <Typography variant="body2" color="text.secondary">
              {b3Lang('subscriptions.card.sku', { sku: card.product.sku })}
              {card.product.detailUrl && (
                <>
                  {' · '}
                  {/* A storefront page outside the SPA: open it in the top window, not in the ThemeFrame. */}
                  <Link href={card.product.detailUrl} target="_top">
                    {b3Lang('subscriptions.card.viewProduct')}
                  </Link>
                </>
              )}
            </Typography>
          )}
          <Typography variant="body2">
            {b3Lang('subscriptions.card.quantity', { count: card.quantity })} · {frequency}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('subscriptions.card.shipsTo')}{' '}
            {cell(loading.shipping, shipping, b3Lang('subscriptions.card.unavailable'))}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('subscriptions.card.paidWith')}{' '}
            {cell(loading.payment, paymentText(), b3Lang('subscriptions.card.unavailable'))}
          </Typography>
          {actions}
        </Box>
        {!isMobile && <Box sx={{ minWidth: '11rem', textAlign: 'right' }}>{scheduleNode}</Box>}
      </CardContent>
    </Card>
  );
}

export default SubscriptionCard;
