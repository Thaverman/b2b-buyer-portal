import { useEffect, useState } from 'react';
import { FormControlLabel, Radio, RadioGroup, TextField } from '@mui/material';
import dayjs from 'dayjs';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';
import { FrequencyPeriod } from '@/shared/service/ordergroove';

import { formatDate } from '../../format';
import { changeDatePresets, DatePreset, SubscriptionCard } from '../../viewModel';

interface ChangeDateDialogProps {
  card: SubscriptionCard;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  /** receives "YYYY-MM-DD" */
  onConfirm: (orderDate: string) => void;
}

const CUSTOM = 'custom';

const OFFSET_KEYS: Record<FrequencyPeriod, string> = {
  1: 'subscriptions.actions.changeDate.offsetDays',
  2: 'subscriptions.actions.changeDate.offsetWeeks',
  3: 'subscriptions.actions.changeDate.offsetMonths',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Ordergroove requires a future date (reference "Change Next Order Date").
const isAfterToday = (date: string) =>
  ISO_DATE.test(date) && dayjs(date).isValid() && dayjs(date).isAfter(dayjs(), 'day');

function ChangeDateDialog({ card, isOpen, isPending, onClose, onConfirm }: ChangeDateDialogProps) {
  const b3Lang = useB3Lang();
  // A preset's date, CUSTOM, or nothing chosen yet.
  const [choice, setChoice] = useState('');
  const [customDate, setCustomDate] = useState('');

  // Every opening starts clean, whatever the customer picked last time.
  useEffect(() => {
    if (isOpen) {
      setChoice('');
      setCustomDate('');
    }
  }, [isOpen]);

  const presets = changeDatePresets(card);
  const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
  const customIsValid = isAfterToday(customDate);

  const presetLabel = (preset: DatePreset) =>
    b3Lang('subscriptions.actions.changeDate.preset', {
      offset: b3Lang(OFFSET_KEYS[preset.period], { count: preset.every }),
      date: formatDate(preset.date),
    });

  const selectedDate = () => {
    if (choice === CUSTOM) {
      return customIsValid ? customDate : null;
    }

    return choice || null;
  };
  const selected = selectedDate();

  return (
    <B3Dialog
      isOpen={isOpen}
      title={b3Lang('subscriptions.actions.changeDate.title')}
      rightSizeBtn={b3Lang('subscriptions.actions.changeDate.confirm')}
      loading={isPending}
      disabledSaveBtn={selected === null}
      handleLeftClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
      handRightClick={() => {
        if (selected) {
          onConfirm(selected);
        }
      }}
    >
      <RadioGroup value={choice} onChange={(event) => setChoice(event.target.value)}>
        {presets.map((preset) => (
          <FormControlLabel
            key={preset.date}
            value={preset.date}
            control={<Radio />}
            label={presetLabel(preset)}
          />
        ))}
        <FormControlLabel
          value={CUSTOM}
          control={<Radio />}
          label={b3Lang('subscriptions.actions.changeDate.pick')}
        />
      </RadioGroup>
      {choice === CUSTOM && (
        <TextField
          id="subscription-next-order-date"
          type="date"
          size="small"
          label={b3Lang('subscriptions.actions.changeDate.pickerLabel')}
          value={customDate}
          onChange={(event) => setCustomDate(event.target.value)}
          error={customDate !== '' && !customIsValid}
          helperText={
            customDate !== '' && !customIsValid
              ? b3Lang('subscriptions.actions.changeDate.pickerHint')
              : ' '
          }
          inputProps={{ min: tomorrow }}
          InputLabelProps={{ shrink: true }}
          sx={{ mt: 1, ml: 4 }}
        />
      )}
    </B3Dialog>
  );
}

export default ChangeDateDialog;
