import { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  TextField,
  Typography,
} from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';

import { FavoriteList, FavoriteRow, isEmptyPlan, membership, planSaveToLists } from '../favorites';
import { SaveToListsInput } from '../useFavoriteActions';

interface SaveToListsDialogProps {
  /** The favorite being saved; null keeps the dialog mounted but closed. */
  row: FavoriteRow | null;
  lists: FavoriteList[];
  loading: boolean;
  onCancel: () => void;
  onSave: (input: SaveToListsInput) => void;
  onCreateList: (name: string) => Promise<{ entityId: number; name: string }>;
}

interface Draft {
  rowId: number;
  selected: Set<number>;
  createdLists: FavoriteList[];
  newListName: string;
}

const noPlan = { adds: [], removes: [] };

/**
 * The picker (spec §10.3): one checkbox per list showing membership, inline create, Save
 * applies the diff. Checking another list copies, also unchecking the current one moves,
 * unchecking everything removes the product from every list.
 */
export default function SaveToListsDialog({
  row,
  lists,
  loading,
  onCancel,
  onSave,
  onCreateList,
}: SaveToListsDialogProps) {
  const b3Lang = useB3Lang();
  // Draft keyed by the row: opening the dialog for another favorite starts from that row's
  // membership without an effect (B3Dialog has to stay mounted while closed).
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const current: Draft =
    row && draft?.rowId === row.item.id
      ? draft
      : {
          rowId: row?.item.id ?? 0,
          selected: row ? membership(lists, row.item) : new Set<number>(),
          createdLists: [],
          newListName: '',
        };
  const allLists = [
    ...lists,
    ...current.createdLists.filter((created) => !lists.some((list) => list.id === created.id)),
  ];
  const plan = row
    ? planSaveToLists({ lists: allLists, ref: row.item, selected: current.selected })
    : noPlan;

  const toggle = (listId: number) => {
    const selected = new Set(current.selected);

    if (selected.has(listId)) {
      selected.delete(listId);
    } else {
      selected.add(listId);
    }

    setDraft({ ...current, selected });
  };

  const createList = async () => {
    const name = current.newListName.trim();

    if (!name) {
      return;
    }

    setIsCreating(true);

    try {
      const created = await onCreateList(name);
      setDraft({
        ...current,
        selected: new Set([...current.selected, created.entityId]),
        createdLists: [
          ...current.createdLists,
          { id: created.entityId, name: created.name, isPublic: false, items: [] },
        ],
        newListName: '',
      });
    } catch {
      // the actions hook already toasted the failure; keep the draft as it was
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <B3Dialog
      isOpen={row !== null}
      title={b3Lang('favorites.picker.title', { product: row?.name ?? '' })}
      rightSizeBtn={b3Lang('favorites.listName.save')}
      disabledSaveBtn={isEmptyPlan(plan) || isCreating}
      loading={loading}
      handleLeftClick={onCancel}
      handRightClick={() => {
        if (row) {
          onSave({ plan, row, lists: allLists });
        }
      }}
    >
      <FormGroup>
        {allLists.map((list) => (
          <FormControlLabel
            key={list.id}
            label={list.name}
            control={
              <Checkbox checked={current.selected.has(list.id)} onChange={() => toggle(list.id)} />
            }
          />
        ))}
      </FormGroup>
      {current.selected.size === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {b3Lang('favorites.picker.removeHint')}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
        <TextField
          size="small"
          fullWidth
          label={b3Lang('favorites.picker.newListName')}
          value={current.newListName}
          onChange={(event) => setDraft({ ...current, newListName: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              createList();
            }
          }}
        />
        <Button
          variant="outlined"
          disabled={isCreating || current.newListName.trim().length === 0}
          onClick={createList}
        >
          {b3Lang('favorites.listName.create')}
        </Button>
      </Box>
    </B3Dialog>
  );
}
