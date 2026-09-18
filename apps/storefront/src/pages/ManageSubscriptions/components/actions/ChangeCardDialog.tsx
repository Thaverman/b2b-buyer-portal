import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, FormControlLabel, Radio, RadioGroup, Typography } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';
import { CardOption } from '@/shared/service/ssw/cardOptions';

interface ChangeCardDialogProps {
  options: CardOption[];
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (option: CardOption) => void;
}

function ChangeCardDialog({
  options,
  isOpen,
  isPending,
  onClose,
  onConfirm,
}: ChangeCardDialogProps) {
  const b3Lang = useB3Lang();
  const navigate = useNavigate();
  const current = options.find((option) => option.isCurrent);
  const [token, setToken] = useState('');

  // Every opening starts from the card in use, whatever was picked last time.
  useEffect(() => {
    if (isOpen) {
      setToken(current?.token ?? '');
    }
  }, [isOpen, current?.token]);

  const label = (option: CardOption) => {
    const card = b3Lang('subscriptions.actions.changeCard.option', {
      brand: option.brand,
      last4: option.last4,
      expiry: option.expiry,
    });

    return option.isCurrent ? b3Lang('subscriptions.actions.changeCard.current', { card }) : card;
  };

  const chosen = options.find((option) => option.token === token);
  const canSave = Boolean(chosen) && !chosen?.isCurrent;
  const hasChoice = options.length > 1;

  return (
    <B3Dialog
      isOpen={isOpen}
      title={b3Lang('subscriptions.actions.changeCard.title')}
      rightSizeBtn={b3Lang('subscriptions.actions.changeCard.confirm')}
      showRightBtn={hasChoice}
      loading={isPending}
      disabledSaveBtn={!canSave}
      handleLeftClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
      handRightClick={() => {
        if (chosen) {
          onConfirm(chosen);
        }
      }}
    >
      {hasChoice ? (
        <RadioGroup value={token} onChange={(event) => setToken(event.target.value)}>
          {options.map((option) => (
            <FormControlLabel
              key={option.token}
              value={option.token}
              control={<Radio />}
              label={label(option)}
            />
          ))}
        </RadioGroup>
      ) : (
        <Typography>
          {b3Lang('subscriptions.actions.changeCard.onlyCard', { link: '' })}
          {/* A button, not an anchor: /payment-methods is a portal route, and internal navigation
              inside the ThemeFrame goes through the router (the delete warning does the same). */}
          <Button
            variant="text"
            size="small"
            onClick={() => navigate('/payment-methods')}
            sx={{ px: 0 }}
          >
            {b3Lang('subscriptions.actions.changeCard.onlyCardLink')}
          </Button>
        </Typography>
      )}
    </B3Dialog>
  );
}

export default ChangeCardDialog;
