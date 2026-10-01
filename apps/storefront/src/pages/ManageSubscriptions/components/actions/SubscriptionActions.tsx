import { Box, Button } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

export type SubscriptionDialog =
  | 'skip'
  | 'sendNow'
  | 'changeDate'
  | 'changeCard'
  | 'cancel'
  | 'address';

interface SubscriptionActionsProps {
  hasUpcomingOrder: boolean;
  /** every button is held while any of the card's writes is in flight */
  disabled: boolean;
  onOpen: (dialog: SubscriptionDialog) => void;
}

/**
 * The button row of one active card. Skip, Send now and Change date all need the upcoming order,
 * so they render only when one exists; Change card and Cancel do not (spec §6.4). The owner
 * (`ActiveSubscriptionCard`) holds the dialogs and the pending state.
 */
function SubscriptionActions({ hasUpcomingOrder, disabled, onOpen }: SubscriptionActionsProps) {
  const b3Lang = useB3Lang();

  const action = (dialog: SubscriptionDialog, labelKey: string) => (
    <Button size="small" variant="outlined" disabled={disabled} onClick={() => onOpen(dialog)}>
      {b3Lang(labelKey)}
    </Button>
  );

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1 }}>
      {hasUpcomingOrder && (
        <>
          {action('skip', 'subscriptions.actions.skip')}
          {action('sendNow', 'subscriptions.actions.sendNow')}
          {action('changeDate', 'subscriptions.actions.changeDate')}
        </>
      )}
      {action('changeCard', 'subscriptions.actions.changeCard')}
      {/* Text style, right-aligned on desktop, wrapping under the others on phones (spec §6.1). */}
      <Button
        size="small"
        variant="text"
        disabled={disabled}
        onClick={() => onOpen('cancel')}
        sx={{ ml: { xs: 0, md: 'auto' } }}
      >
        {b3Lang('subscriptions.actions.cancel')}
      </Button>
    </Box>
  );
}

export default SubscriptionActions;
