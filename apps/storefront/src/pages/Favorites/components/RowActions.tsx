import { Box, Button } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { FavoriteRow } from '../favorites';

interface RowActionsProps {
  row: FavoriteRow;
  disabled: boolean;
  onSaveToLists: (row: FavoriteRow) => void;
  onRemove: (row: FavoriteRow) => void;
}

export default function RowActions({ row, disabled, onSaveToLists, onRemove }: RowActionsProps) {
  const b3Lang = useB3Lang();

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'flex-end' }}>
      <Button size="small" disabled={disabled} onClick={() => onSaveToLists(row)}>
        {b3Lang('favorites.item.saveToLists')}
      </Button>
      <Button size="small" color="error" disabled={disabled} onClick={() => onRemove(row)}>
        {b3Lang('favorites.item.remove')}
      </Button>
    </Box>
  );
}
