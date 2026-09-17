import { Typography } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';

import { formatDate } from '../../format';
import { addIntervals, SubscriptionCard } from '../../viewModel';

interface SkipDialogProps {
  card: SubscriptionCard;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function SkipDialog({ card, isOpen, isPending, onClose, onConfirm }: SkipDialogProps) {
  const b3Lang = useB3Lang();

  const product =
    card.product?.name ??
    b3Lang('subscriptions.card.unnamedProduct', { id: card.externalProductId });
  // The manager shows the same projection: one interval after the order being skipped.
  const body =
    card.nextOrderDate &&
    b3Lang('subscriptions.actions.skip.body', {
      product,
      date: formatDate(card.nextOrderDate),
      nextDate: formatDate(addIntervals(card.nextOrderDate, card.every, card.everyPeriod, 1)),
    });

  return (
    <B3Dialog
      isOpen={isOpen}
      title={b3Lang('subscriptions.actions.skip.title')}
      rightSizeBtn={b3Lang('subscriptions.actions.skip.confirm')}
      loading={isPending}
      handleLeftClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
      handRightClick={onConfirm}
    >
      <Typography>{body}</Typography>
    </B3Dialog>
  );
}

export default SkipDialog;
