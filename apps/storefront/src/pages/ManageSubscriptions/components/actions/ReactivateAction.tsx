import { useState } from 'react';
import { Button } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { useSubscriptionActions } from '../../hooks/useSubscriptionActions';
import { SubscriptionCard } from '../../viewModel';

import ReactivateDialog from './ReactivateDialog';

interface ReactivateActionProps {
  card: SubscriptionCard;
  customerId: number;
}

/** The one control of a cancelled card: its button and dialog, with their own mutation instance. */
function ReactivateAction({ card, customerId }: ReactivateActionProps) {
  const b3Lang = useB3Lang();
  const [isOpen, setIsOpen] = useState(false);
  const { reactivate } = useSubscriptionActions(customerId);
  const close = () => setIsOpen(false);

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        disabled={reactivate.isPending}
        onClick={() => setIsOpen(true)}
        sx={{ mt: 1, alignSelf: 'flex-start' }}
      >
        {b3Lang('subscriptions.actions.reactivate')}
      </Button>
      <ReactivateDialog
        card={card}
        isOpen={isOpen}
        isPending={reactivate.isPending}
        onClose={close}
        onConfirm={(input) =>
          reactivate.mutate({ subscriptionId: card.publicId, ...input }, { onSuccess: close })
        }
      />
    </>
  );
}

export default ReactivateAction;
