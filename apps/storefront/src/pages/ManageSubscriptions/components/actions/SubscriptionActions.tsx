import { useState } from 'react';
import { Box, Button } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import { listPayments } from '@/shared/service/ordergroove';
import { buildCardOptions } from '@/shared/service/ssw/cardOptions';
import { listStoredInstruments } from '@/shared/service/ssw/customerClient';

import { useSubscriptionActions } from '../../hooks/useSubscriptionActions';
import { SubscriptionCard } from '../../viewModel';

import ChangeCardDialog from './ChangeCardDialog';
import ChangeDateDialog from './ChangeDateDialog';
import SendNowDialog from './SendNowDialog';
import SkipDialog from './SkipDialog';

interface SubscriptionActionsProps {
  card: SubscriptionCard;
  customerId: number;
}

type OpenDialog = 'skip' | 'sendNow' | 'changeDate' | 'changeCard' | null;

/**
 * The order actions of one active card. The dialogs stay mounted and toggle `isOpen`: B3Dialog
 * only opens on a re-render after its container ref exists. Skip, Send now and Change date all
 * need the upcoming order, so they render only when one exists; Change card does not (spec §6.4).
 */
function SubscriptionActions({ card, customerId }: SubscriptionActionsProps) {
  const b3Lang = useB3Lang();
  const [open, setOpen] = useState<OpenDialog>(null);
  const { skip, sendNow, changeDate, changeCard } = useSubscriptionActions(customerId);

  const instruments = useQuery({
    queryKey: ['storedInstruments', customerId],
    queryFn: listStoredInstruments,
    enabled: open === 'changeCard',
    retry: false,
  });
  const payments = useQuery({
    queryKey: ['ordergroove', customerId, 'payments'],
    queryFn: () => listPayments(String(customerId)),
    enabled: open === 'changeCard',
    retry: false,
  });
  const cardOptions = buildCardOptions(
    instruments.data?.instruments ?? [],
    payments.data,
    card.paymentId,
  );

  const upcoming = card.nextOrder;
  const isPending =
    skip.isPending || sendNow.isPending || changeDate.isPending || changeCard.isPending;
  const close = () => setOpen(null);

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
        {upcoming && (
          <>
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
          </>
        )}
        <Button
          size="small"
          variant="outlined"
          disabled={isPending}
          onClick={() => setOpen('changeCard')}
        >
          {b3Lang('subscriptions.actions.changeCard')}
        </Button>
      </Box>
      {/* The per-call onSuccess runs after the hook's refresh resolves, so the card is already current. */}
      {upcoming && (
        <>
          <SkipDialog
            card={card}
            isOpen={open === 'skip'}
            isPending={skip.isPending}
            onClose={close}
            onConfirm={() =>
              skip.mutate(
                { orderId: upcoming.orderId, subscriptionId: card.publicId },
                { onSuccess: close },
              )
            }
          />
          <SendNowDialog
            card={card}
            isOpen={open === 'sendNow'}
            isPending={sendNow.isPending}
            onClose={close}
            onConfirm={() => sendNow.mutate({ orderId: upcoming.orderId }, { onSuccess: close })}
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
      )}
      <ChangeCardDialog
        options={cardOptions}
        isOpen={open === 'changeCard'}
        isPending={changeCard.isPending}
        onClose={close}
        onConfirm={(option) =>
          changeCard.mutate(
            {
              subscriptionId: card.publicId,
              option,
              billingAddress: card.billingAddressId,
            },
            { onSuccess: close },
          )
        }
      />
    </>
  );
}

export default SubscriptionActions;
