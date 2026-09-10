import { Box, Button, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { FavoriteList } from '../favorites';

interface ListToolbarProps {
  list: FavoriteList;
  disabled: boolean;
  /** Add all stays clickable whenever the list has rows; the page explains when none can be added. */
  hasItems: boolean;
  onRename: () => void;
  onDelete: () => void;
  onAddAll: () => void;
}

export default function ListToolbar({
  list,
  disabled,
  hasItems,
  onRename,
  onDelete,
  onAddAll,
}: ListToolbarProps) {
  const b3Lang = useB3Lang();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1,
        mb: 2,
        // The brief's 44px minimum touch target; MUI's small button is ~31px tall.
        '& > .MuiButton-root': { minHeight: '44px' },
      }}
    >
      <Typography variant="h6" component="h2" sx={{ flex: 1, minWidth: '10rem' }}>
        {list.name}
      </Typography>
      <Button size="small" disabled={disabled} onClick={onRename}>
        {b3Lang('favorites.rename')}
      </Button>
      <Button size="small" color="error" disabled={disabled} onClick={onDelete}>
        {b3Lang('favorites.deleteList')}
      </Button>
      <Button size="small" variant="contained" disabled={disabled || !hasItems} onClick={onAddAll}>
        {b3Lang('favorites.addAllToCart')}
      </Button>
    </Box>
  );
}
