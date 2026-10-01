import { useState } from 'react';
import { Button } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import { listPayments, OgAddress } from '@/shared/service/ordergroove';
import { buildCardOptions } from '@/shared/service/ssw/cardOptions';
import { listStoredInstruments } from '@/shared/service/ssw/customerClient';

import { useSubscriptionActions } from '../../hooks/useSubscriptionActions';
import { buildAddressOptions, SubscriptionCard as SubscriptionCardModel } from '../../viewModel';
import SubscriptionCard, { CellLoading } from '../SubscriptionCard';

import CancelDialog from './CancelDialog';
import ChangeAddressDialog from './ChangeAddressDialog';
import ChangeCardDialog from './ChangeCardDialog';
import ChangeDateDialog from './ChangeDateDialog';
import QuantityFrequencySelects from './QuantityFrequencySelects';
import SendNowDialog from './SendNowDialog';
import SkipDialog from './SkipDialog';
import SubscriptionActions, { SubscriptionDialog } from './SubscriptionActions';

interface ActiveSubscriptionCardProps {
  card: SubscriptionCardModel;
  loading: CellLoading;
  customerId: number;
  /** the page's addresses lookup; undefined while pending or failed */
  addresses: OgAddress[] | undefined;
}

/**
 * One active card with every control wired. This is the only place that instantiates the actions
 * hook for the card, so pending state is per card and exactly one dialog is open at a time. The
 * dialogs stay mounted and toggle `isOpen`: B3Dialog only opens on a re-render after its container
 * ref exists.
 */
function ActiveSubscriptionCard({
  card,
  loading,
  customerId,
  addresses,
}: ActiveSubscriptionCardProps) {
  const b3Lang = useB3Lang();
  const [open, setOpen] = useState<SubscriptionDialog | null>(null);
  const {
    skip,
    sendNow,
    changeDate,
    changeCard,
    changeFrequency,
    changeQuantity,
    cancel,
    changeAddress,
  } = useSubscriptionActions(customerId);

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
  const addressOptions = buildAddressOptions(addresses, card.shippingAddressId);

  const subscriptionId = card.publicId;
  const upcoming = card.nextOrder;
  const isPending = [
    skip,
    sendNow,
    changeDate,
    changeCard,
    changeFrequency,
    changeQuantity,
    cancel,
    changeAddress,
  ].some((mutation) => mutation.isPending);
  const close = () => setOpen(null);

  return (
    <>
      <SubscriptionCard
        card={card}
        variant="active"
        loading={loading}
        scheduleControls={
          <QuantityFrequencySelects
            card={card}
            disabled={isPending}
            quantityPending={changeQuantity.isPending}
            frequencyPending={changeFrequency.isPending}
            onChangeQuantity={(quantity) => changeQuantity.mutate({ subscriptionId, quantity })}
            onChangeFrequency={({ every, period }) =>
              changeFrequency.mutate({ subscriptionId, every, everyPeriod: period })
            }
          />
        }
        shippingAction={
          // Nothing to move to while the addresses are unknown — no control rather than an empty dialog.
          addressOptions.length > 0 && (
            <Button
              variant="text"
              size="small"
              disabled={isPending}
              onClick={() => setOpen('address')}
              sx={{ p: 0, minWidth: 0, verticalAlign: 'baseline' }}
            >
              {b3Lang('subscriptions.actions.changeAddress')}
            </Button>
          )
        }
        actions={
          <SubscriptionActions
            hasUpcomingOrder={Boolean(upcoming)}
            disabled={isPending}
            onOpen={setOpen}
          />
        }
      />
      {/* The per-call onSuccess runs after the hook's refresh resolves, so the card is already current. */}
      {upcoming && (
        <>
          <SkipDialog
            card={card}
            isOpen={open === 'skip'}
            isPending={skip.isPending}
            onClose={close}
            onConfirm={() =>
              skip.mutate({ orderId: upcoming.orderId, subscriptionId }, { onSuccess: close })
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
              changeDate.mutate({ subscriptionId, orderDate }, { onSuccess: close })
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
            { subscriptionId, option, billingAddress: card.billingAddressId },
            { onSuccess: close },
          )
        }
      />
      <CancelDialog
        card={card}
        isOpen={open === 'cancel'}
        isPending={cancel.isPending}
        onClose={close}
        onSkipInstead={() => setOpen('skip')}
        onConfirm={(cancelReason) =>
          cancel.mutate({ subscriptionId, cancelReason }, { onSuccess: close })
        }
      />
      <ChangeAddressDialog
        options={addressOptions}
        isOpen={open === 'address'}
        isPending={changeAddress.isPending}
        onClose={close}
        onConfirm={(addressId) =>
          changeAddress.mutate({ subscriptionId, addressId }, { onSuccess: close })
        }
      />
    </>
  );
}

export default ActiveSubscriptionCard;
