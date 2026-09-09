import { useState } from 'react';
import { TextField } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';

interface ListNameDialogProps {
  isOpen: boolean;
  /** Changes whenever the dialog opens for a different purpose (create vs. rename list X); resets the draft. */
  dialogKey: string;
  title: string;
  initialName: string;
  submitLabel: string;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}

const MAX_NAME_LENGTH = 255;

export default function ListNameDialog({
  isOpen,
  dialogKey,
  title,
  initialName,
  submitLabel,
  loading,
  onCancel,
  onSubmit,
}: ListNameDialogProps) {
  const b3Lang = useB3Lang();
  // The draft is keyed by purpose so a stale draft falls back to the initial name without an
  // effect (B3Dialog has to stay mounted while closed, so the component never remounts).
  const [draft, setDraft] = useState<{ key: string; name: string } | null>(null);
  const name = draft && draft.key === dialogKey ? draft.name : initialName;
  const trimmed = name.trim();
  const showRequired = draft?.key === dialogKey && trimmed.length === 0;

  const submit = () => {
    if (trimmed.length > 0) {
      onSubmit(trimmed);
    }
  };

  return (
    <B3Dialog
      isOpen={isOpen}
      title={title}
      rightSizeBtn={submitLabel}
      disabledSaveBtn={trimmed.length === 0}
      loading={loading}
      handleLeftClick={onCancel}
      handRightClick={submit}
    >
      <TextField
        autoFocus
        fullWidth
        margin="dense"
        label={b3Lang('favorites.listName.label')}
        value={name}
        onChange={(event) => setDraft({ key: dialogKey, name: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
        error={showRequired}
        helperText={showRequired ? b3Lang('favorites.listName.required') : ' '}
        inputProps={{ maxLength: MAX_NAME_LENGTH }}
      />
    </B3Dialog>
  );
}
