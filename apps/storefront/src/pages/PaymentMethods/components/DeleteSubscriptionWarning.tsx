import { useState } from 'react';
import { Alert, Box, Button, FormControlLabel, Radio, RadioGroup, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { CardOption } from '@/shared/service/ssw/cardOptions';

import {
  AffectedSubscription,
  SubscriptionCheckStatus,
} from '../hooks/useSubscriptionsUsingInstrument';

interface DeleteSubscriptionWarningProps {
  status: SubscriptionCheckStatus;
  subscriptions: AffectedSubscription[];
  onManageSubscriptions: () => void;
  /** saved cards other than the one being deleted; empty means no offer */
  moveOptions: CardOption[];
  isMoving: boolean;
  /** true once the move mutation has succeeded, so the "clear" state can say why */
  hasMoved: boolean;
  onMove: (option: CardOption) => void;
}

const MAX_LISTED = 5;

function DeleteSubscriptionWarning({
  status,
  subscriptions,
  onManageSubscriptions,
  moveOptions,
  isMoving,
  hasMoved,
  onMove,
}: DeleteSubscriptionWarningProps) {
  const b3Lang = useB3Lang();
  const [token, setToken] = useState('');
  const chosen = moveOptions.find((option) => option.token === token);

  if (status === 'clear') {
    // The check has not run yet (first open), or it ran again after a move and found nothing.
    return hasMoved ? (
      <Alert severity="success" sx={{ mt: 2 }}>
        {b3Lang('paymentMethods.deleteDialog.move.none')}
      </Alert>
    ) : null;
  }
  if (status === 'checking') {
    // A live region: the confirm button is disabled meanwhile, and assistive tech needs to know why.
    return (
      <Typography role="status" variant="body2" color="text.secondary" sx={{ mt: 2 }}>
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
      {moveOptions.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2">
            {b3Lang('paymentMethods.deleteDialog.move.title')}
          </Typography>
          <RadioGroup value={token} onChange={(event) => setToken(event.target.value)}>
            {moveOptions.map((option) => (
              <FormControlLabel
                key={option.token}
                value={option.token}
                control={<Radio size="small" />}
                label={b3Lang('paymentMethods.deleteDialog.move.option', {
                  brand: option.brand,
                  last4: option.last4,
                  expiry: option.expiry,
                })}
              />
            ))}
          </RadioGroup>
          <Button
            variant="text"
            size="small"
            disabled={!chosen || isMoving}
            onClick={() => {
              if (chosen) {
                onMove(chosen);
              }
            }}
            sx={{ px: 0 }}
          >
            {b3Lang('paymentMethods.deleteDialog.move.confirm')}
          </Button>
        </Box>
      )}
      {/* A button, not an anchor: internal router navigation inside the ThemeFrame. */}
      <Button variant="text" size="small" onClick={onManageSubscriptions} sx={{ mt: 1, px: 0 }}>
        {b3Lang('paymentMethods.deleteDialog.subscriptions.manage')}
      </Button>
    </Alert>
  );
}

export default DeleteSubscriptionWarning;
