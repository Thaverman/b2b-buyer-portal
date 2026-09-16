import { Alert, Box, Link, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { AffectedSubscription } from '../hooks/useSubscriptionsUsingInstrument';

export type SubscriptionCheckStatus = 'checking' | 'clear' | 'failed' | 'affected';

interface DeleteSubscriptionWarningProps {
  status: SubscriptionCheckStatus;
  subscriptions: AffectedSubscription[];
  onManageSubscriptions: () => void;
}

const MAX_LISTED = 5;

function DeleteSubscriptionWarning({
  status,
  subscriptions,
  onManageSubscriptions,
}: DeleteSubscriptionWarningProps) {
  const b3Lang = useB3Lang();

  if (status === 'clear') {
    return null;
  }
  if (status === 'checking') {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {b3Lang('paymentMethods.deleteDialog.subscriptions.checking')}
      </Typography>
    );
  }
  if (status === 'failed') {
    // The warning is advisory: say we could not check, and leave the decision to the customer.
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        {b3Lang('paymentMethods.deleteDialog.subscriptions.checkFailed')}
      </Alert>
    );
  }

  // Ordergroove reports frequency in days; whole weeks read better (spec §5.4).
  const frequency = (days: number) =>
    days % 7 === 0
      ? b3Lang('paymentMethods.deleteDialog.subscriptions.everyWeeks', { count: days / 7 })
      : b3Lang('paymentMethods.deleteDialog.subscriptions.everyDays', { count: days });

  const listed = subscriptions.slice(0, MAX_LISTED);
  const remaining = subscriptions.length - listed.length;

  return (
    <Alert severity="warning" sx={{ mt: 2 }}>
      <Typography variant="body2">
        {b3Lang('paymentMethods.deleteDialog.subscriptions.title', { count: subscriptions.length })}
      </Typography>
      <Box component="ul" sx={{ pl: 2, my: 1 }}>
        {listed.map((subscription) => (
          <li key={subscription.publicId}>
            {subscription.productName
              ? b3Lang('paymentMethods.deleteDialog.subscriptions.item', {
                  product: subscription.productName,
                  frequency: frequency(subscription.frequencyDays),
                })
              : b3Lang('paymentMethods.deleteDialog.subscriptions.itemUnnamed', {
                  frequency: frequency(subscription.frequencyDays),
                })}
          </li>
        ))}
        {remaining > 0 && (
          <li>{b3Lang('paymentMethods.deleteDialog.subscriptions.more', { count: remaining })}</li>
        )}
      </Box>
      <Typography variant="body2">
        {b3Lang('paymentMethods.deleteDialog.subscriptions.consequence')}
      </Typography>
      {/* A button-styled link: internal router navigation, never a plain anchor inside the ThemeFrame. */}
      <Link
        component="button"
        type="button"
        variant="body2"
        onClick={onManageSubscriptions}
        sx={{ mt: 1 }}
      >
        {b3Lang('paymentMethods.deleteDialog.subscriptions.manage')}
      </Link>
    </Alert>
  );
}

export default DeleteSubscriptionWarning;
