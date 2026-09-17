import { Box, Typography } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';

import { describePayment } from '../../format';
import { SubscriptionCard } from '../../viewModel';

interface SendNowDialogProps {
  card: SubscriptionCard;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function SendNowDialog({ card, isOpen, isPending, onClose, onConfirm }: SendNowDialogProps) {
  const b3Lang = useB3Lang();

  const body = card.payment
    ? b3Lang('subscriptions.actions.sendNow.body', { card: describePayment(card.payment, b3Lang) })
    : b3Lang('subscriptions.actions.sendNow.bodyNoCard');
  // Send now is order-scoped: everything shipping on that date goes with it (spec decision 2).
  const others = card.nextOrder?.otherProducts ?? [];

  return (
    <B3Dialog
      isOpen={isOpen}
      title={b3Lang('subscriptions.actions.sendNow.title')}
      rightSizeBtn={b3Lang('subscriptions.actions.sendNow.confirm')}
      loading={isPending}
      handleLeftClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
      handRightClick={onConfirm}
    >
      <Typography>{body}</Typography>
      {others.length > 0 && (
        <>
          <Typography sx={{ mt: 2 }}>
            {b3Lang('subscriptions.actions.sendNow.alsoIncludes')}
          </Typography>
          <Box component="ul" sx={{ mt: 1, pl: 3 }}>
            {others.map((other) => (
              <li key={other.externalProductId}>
                {other.name ??
                  b3Lang('subscriptions.card.unnamedProduct', { id: other.externalProductId })}
              </li>
            ))}
          </Box>
        </>
      )}
    </B3Dialog>
  );
}

export default SendNowDialog;
