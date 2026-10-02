import { useEffect, useState } from 'react';
import { FormControlLabel, Link, Radio, RadioGroup, Typography } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';

import { describeAddress, HOSTED_MANAGER_URL } from '../../format';
import { AddressOption } from '../../viewModel';

interface ChangeAddressDialogProps {
  options: AddressOption[];
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  /** receives the Ordergroove address public_id */
  onConfirm: (addressId: string) => void;
}

// Stands in for the link inside the translated sentence so the words around it keep their order.
const LINK = '%LINK%';

function ChangeAddressDialog({
  options,
  isOpen,
  isPending,
  onClose,
  onConfirm,
}: ChangeAddressDialogProps) {
  const b3Lang = useB3Lang();
  const current = options.find((option) => option.isCurrent);
  const [choice, setChoice] = useState('');

  // Every opening starts from the address in use, whatever was picked last time.
  useEffect(() => {
    if (isOpen) {
      setChoice(current?.publicId ?? '');
    }
  }, [isOpen, current?.publicId]);

  const canSave = Boolean(choice) && choice !== current?.publicId;
  const [before, after] = b3Lang('subscriptions.actions.address.addNew', { link: LINK }).split(
    LINK,
  );

  return (
    <B3Dialog
      isOpen={isOpen}
      title={b3Lang('subscriptions.actions.address.title')}
      rightSizeBtn={b3Lang('subscriptions.actions.address.confirm')}
      loading={isPending}
      disabledSaveBtn={!canSave}
      handleLeftClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
      handRightClick={() => {
        if (canSave) {
          onConfirm(choice);
        }
      }}
    >
      <RadioGroup
        aria-label={b3Lang('subscriptions.actions.address.title')}
        value={choice}
        onChange={(event) => setChoice(event.target.value)}
      >
        {options.map((option) => (
          <FormControlLabel
            key={option.publicId}
            value={option.publicId}
            control={<Radio />}
            label={describeAddress(option.summary)}
          />
        ))}
      </RadioGroup>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {before}
        {/* The hosted manager is a theme page outside the SPA: open it in the top window, not in the ThemeFrame. */}
        <Link href={HOSTED_MANAGER_URL} target="_top">
          {b3Lang('subscriptions.actions.address.addNewLink')}
        </Link>
        {after}
      </Typography>
    </B3Dialog>
  );
}

export default ChangeAddressDialog;
