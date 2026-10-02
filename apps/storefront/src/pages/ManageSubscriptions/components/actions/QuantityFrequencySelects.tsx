import { Box, CircularProgress, MenuItem, TextField } from '@mui/material';

import { useMobile } from '@/hooks/useMobile';
import { useB3Lang } from '@/lib/lang';

import { describeFrequency } from '../../format';
import {
  frequencyKey,
  FrequencyOption,
  frequencyOptions,
  quantityOptions,
  SubscriptionCard,
} from '../../viewModel';

interface QuantityFrequencySelectsProps {
  card: SubscriptionCard;
  /** every control of the row is held while any of its writes is in flight */
  disabled: boolean;
  quantityPending: boolean;
  frequencyPending: boolean;
  onChangeQuantity: (quantity: number) => void;
  onChangeFrequency: (option: FrequencyOption) => void;
}

// Takes the dropdown arrow's place while the write is in flight. The value stays the card's until
// the refetch lands, so a failed save visibly snaps back (spec §6.3).
function Saving() {
  const b3Lang = useB3Lang();

  return (
    <CircularProgress
      size={16}
      aria-label={b3Lang('subscriptions.actions.saving')}
      sx={{ position: 'absolute', right: 12, pointerEvents: 'none' }}
    />
  );
}

function QuantityFrequencySelects({
  card,
  disabled,
  quantityPending,
  frequencyPending,
  onChangeQuantity,
  onChangeFrequency,
}: QuantityFrequencySelectsProps) {
  const b3Lang = useB3Lang();
  const [isMobile] = useMobile();
  const frequencies = frequencyOptions(card.every, card.everyPeriod);

  return (
    <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 1, my: 0.5 }}>
      <TextField
        id={`subscription-quantity-${card.publicId}`}
        select
        size="small"
        fullWidth={isMobile}
        label={b3Lang('subscriptions.actions.quantityLabel')}
        value={card.quantity}
        disabled={disabled}
        onChange={(event) => onChangeQuantity(Number(event.target.value))}
        SelectProps={quantityPending ? { IconComponent: Saving } : undefined}
        sx={{ minWidth: '6rem' }}
      >
        {quantityOptions(card.quantity).map((quantity) => (
          <MenuItem key={quantity} value={quantity}>
            {quantity}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        id={`subscription-frequency-${card.publicId}`}
        select
        size="small"
        fullWidth={isMobile}
        label={b3Lang('subscriptions.actions.frequencyLabel')}
        value={frequencyKey({ every: card.every, period: card.everyPeriod })}
        disabled={disabled}
        onChange={(event) => {
          const option = frequencies.find(
            (candidate) => frequencyKey(candidate) === event.target.value,
          );
          if (option) {
            onChangeFrequency(option);
          }
        }}
        SelectProps={frequencyPending ? { IconComponent: Saving } : undefined}
        sx={{ minWidth: '11rem' }}
      >
        {frequencies.map((option) => (
          <MenuItem key={frequencyKey(option)} value={frequencyKey(option)}>
            {describeFrequency(option.every, option.period, b3Lang)}
          </MenuItem>
        ))}
      </TextField>
    </Box>
  );
}

export default QuantityFrequencySelects;
