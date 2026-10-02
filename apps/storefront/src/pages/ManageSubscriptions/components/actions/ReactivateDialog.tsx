import { useEffect, useState } from 'react';
import { MenuItem, TextField, Typography } from '@mui/material';
import dayjs from 'dayjs';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';
import { ReactivationInput } from '@/shared/service/ordergroove';

import { describeFrequency } from '../../format';
import { frequencyKey, frequencyOptions, SubscriptionCard } from '../../viewModel';

interface ReactivateDialogProps {
  card: SubscriptionCard;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (input: ReactivationInput) => void;
}

// Task 0 finding H: Ordergroove accepted tomorrow as the first order date.
const FIRST_ORDER_MIN_DAYS = 1;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function ReactivateDialog({ card, isOpen, isPending, onClose, onConfirm }: ReactivateDialogProps) {
  const b3Lang = useB3Lang();
  const options = frequencyOptions(card.every, card.everyPeriod);
  // Always on the list: frequencyOptions appends a schedule SSW does not offer.
  const currentKey = frequencyKey({ every: card.every, period: card.everyPeriod });
  const earliest = dayjs().add(FIRST_ORDER_MIN_DAYS, 'day').format('YYYY-MM-DD');
  const [frequency, setFrequency] = useState(currentKey);
  const [date, setDate] = useState(earliest);

  // Every opening starts from the old schedule and the earliest allowed date.
  useEffect(() => {
    if (isOpen) {
      setFrequency(currentKey);
      setDate(earliest);
    }
  }, [isOpen, currentKey, earliest]);

  const product =
    card.product?.name ??
    b3Lang('subscriptions.card.unnamedProduct', { id: card.externalProductId });
  const dateIsValid =
    ISO_DATE.test(date) && dayjs(date).isValid() && !dayjs(date).isBefore(dayjs(earliest), 'day');
  const chosen = options.find((option) => frequencyKey(option) === frequency);

  return (
    <B3Dialog
      isOpen={isOpen}
      title={b3Lang('subscriptions.actions.reactivate.title')}
      rightSizeBtn={b3Lang('subscriptions.actions.reactivate.confirm')}
      loading={isPending}
      disabledSaveBtn={!dateIsValid || !chosen}
      handleLeftClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
      handRightClick={() => {
        if (chosen && dateIsValid) {
          onConfirm({
            startDate: dayjs().format('YYYY-MM-DD'),
            every: chosen.every,
            everyPeriod: chosen.period,
            nextOrderDate: date,
          });
        }
      }}
    >
      <Typography sx={{ mb: 2 }}>
        {b3Lang('subscriptions.actions.reactivate.body', { product })}
      </Typography>
      <TextField
        id="subscription-reactivate-frequency"
        select
        size="small"
        fullWidth
        label={b3Lang('subscriptions.actions.frequencyLabel')}
        value={frequency}
        onChange={(event) => setFrequency(event.target.value)}
        sx={{ mb: 2 }}
      >
        {options.map((option) => (
          <MenuItem key={frequencyKey(option)} value={frequencyKey(option)}>
            {describeFrequency(option.every, option.period, b3Lang)}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        id="subscription-reactivate-date"
        type="date"
        size="small"
        fullWidth
        label={b3Lang('subscriptions.actions.reactivate.dateLabel')}
        value={date}
        onChange={(event) => setDate(event.target.value)}
        error={!dateIsValid}
        helperText={dateIsValid ? ' ' : b3Lang('subscriptions.actions.reactivate.dateHint')}
        inputProps={{ min: earliest }}
        InputLabelProps={{ shrink: true }}
      />
    </B3Dialog>
  );
}

export default ReactivateDialog;
