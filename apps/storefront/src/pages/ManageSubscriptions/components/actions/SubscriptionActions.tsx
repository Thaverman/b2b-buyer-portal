import { useState } from 'react';
import { Box, Button } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { useSubscriptionActions } from '../../hooks/useSubscriptionActions';
import { SubscriptionCard } from '../../viewModel';

import ChangeDateDialog from './ChangeDateDialog';
import SendNowDialog from './SendNowDialog';
import SkipDialog from './SkipDialog';

interface SubscriptionActionsProps {
  card: SubscriptionCard;
  customerId: number;
}

type OpenDialog = 'skip' | 'sendNow' | 'changeDate' | null;

/**
 * The order actions of one active card. The three dialogs stay mounted and toggle `isOpen`:
 * B3Dialog only opens on a re-render after its container ref exists. Every 3a action needs the
 * upcoming order, so a card without one renders nothing (spec §6.4).
 */
function SubscriptionActions({ card, customerId }: SubscriptionActionsProps) {
  const b3Lang = useB3Lang();
  const [open, setOpen] = useState<OpenDialog>(null);
  const { skip, sendNow, changeDate } = useSubscriptionActions(customerId);

  if (!card.nextOrder) {
    return null;
  }
  const { orderId } = card.nextOrder;
  const isPending = skip.isPending || sendNow.isPending || changeDate.isPending;
  const close = () => setOpen(null);

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
        <Button
          size="small"
          variant="outlined"
          disabled={isPending}
          onClick={() => setOpen('skip')}
        >
          {b3Lang('subscriptions.actions.skip')}
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={isPending}
          onClick={() => setOpen('sendNow')}
        >
          {b3Lang('subscriptions.actions.sendNow')}
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={isPending}
          onClick={() => setOpen('changeDate')}
        >
          {b3Lang('subscriptions.actions.changeDate')}
        </Button>
      </Box>
      {/* The per-call onSuccess runs after the hook's refresh resolves, so the card is already current. */}
      <SkipDialog
        card={card}
        isOpen={open === 'skip'}
        isPending={skip.isPending}
        onClose={close}
        onConfirm={() =>
          skip.mutate({ orderId, subscriptionId: card.publicId }, { onSuccess: close })
        }
      />
      <SendNowDialog
        card={card}
        isOpen={open === 'sendNow'}
        isPending={sendNow.isPending}
        onClose={close}
        onConfirm={() => sendNow.mutate({ orderId }, { onSuccess: close })}
      />
      <ChangeDateDialog
        card={card}
        isOpen={open === 'changeDate'}
        isPending={changeDate.isPending}
        onClose={close}
        onConfirm={(orderDate) =>
          changeDate.mutate({ subscriptionId: card.publicId, orderDate }, { onSuccess: close })
        }
      />
    </>
  );
}

export default SubscriptionActions;
