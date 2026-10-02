import { useEffect, useState } from 'react';
import { Button, FormControlLabel, Radio, RadioGroup, TextField, Typography } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';

import {
  CANCEL_REASONS,
  cancelReasonBody,
  CancelReasonSelection,
  OTHER_REASON_CODE,
  SubscriptionCard,
} from '../../viewModel';

interface CancelDialogProps {
  card: SubscriptionCard;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  /** closes this dialog and opens Skip; offered only while an order is scheduled */
  onSkipInstead: () => void;
  /** receives the `cancel_reason` body (spec §4.5) */
  onConfirm: (cancelReason: string) => void;
}

const OTHER = String(OTHER_REASON_CODE);

function CancelDialog({
  card,
  isOpen,
  isPending,
  onClose,
  onSkipInstead,
  onConfirm,
}: CancelDialogProps) {
  const b3Lang = useB3Lang();
  // A reason code as a string, OTHER, or '' — nothing chosen, the manager's no-survey default.
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');

  // Every opening starts clean, whatever the customer picked last time.
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setDetails('');
    }
  }, [isOpen]);

  const product =
    card.product?.name ??
    b3Lang('subscriptions.card.unnamedProduct', { id: card.externalProductId });

  const selection = (): CancelReasonSelection | null => {
    if (!reason) {
      return null;
    }
    if (reason === OTHER) {
      return { code: OTHER_REASON_CODE, details };
    }

    return { code: Number(reason) };
  };

  return (
    <B3Dialog
      isOpen={isOpen}
      title={b3Lang('subscriptions.actions.cancel.title')}
      leftSizeBtn={b3Lang('subscriptions.actions.cancel.keep')}
      rightSizeBtn={b3Lang('subscriptions.actions.cancel.confirm')}
      rightStyleBtn={{ color: 'error.main' }}
      loading={isPending}
      handleLeftClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
      handRightClick={() => onConfirm(cancelReasonBody(selection()))}
    >
      <Typography sx={{ mb: 2 }}>
        {b3Lang('subscriptions.actions.cancel.body', { product })}
      </Typography>
      {/* The manager's whole retention flow for SSW is this one nudge (spec §6.2). */}
      {card.nextOrder && (
        <Typography sx={{ mb: 2 }}>
          {b3Lang('subscriptions.actions.cancel.skipInstead')}{' '}
          <Button
            variant="text"
            size="small"
            disabled={isPending}
            onClick={onSkipInstead}
            sx={{ px: 0, verticalAlign: 'baseline' }}
          >
            {b3Lang('subscriptions.actions.cancel.skipInsteadLink')}
          </Button>
        </Typography>
      )}
      <Typography id="subscription-cancel-reasons">
        {b3Lang('subscriptions.actions.cancel.reasonsTitle')}
      </Typography>
      <RadioGroup
        aria-labelledby="subscription-cancel-reasons"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      >
        {CANCEL_REASONS.map(({ code }) => (
          <FormControlLabel
            key={code}
            value={String(code)}
            control={<Radio />}
            label={b3Lang(`subscriptions.actions.cancel.reason.${code}`)}
          />
        ))}
        <FormControlLabel
          value={OTHER}
          control={<Radio />}
          label={b3Lang('subscriptions.actions.cancel.reason.other')}
        />
      </RadioGroup>
      {reason === OTHER && (
        <TextField
          id="subscription-cancel-details"
          size="small"
          fullWidth
          label={b3Lang('subscriptions.actions.cancel.otherPlaceholder')}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          sx={{ mt: 1 }}
        />
      )}
    </B3Dialog>
  );
}

export default CancelDialog;
