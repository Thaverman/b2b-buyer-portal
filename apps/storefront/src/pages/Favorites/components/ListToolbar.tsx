import { Box, Button, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { FavoriteList } from '../favorites';

interface ListToolbarProps {
  list: FavoriteList;
  disabled: boolean;
  onRename: () => void;
  onDelete: () => void;
}

export default function ListToolbar({ list, disabled, onRename, onDelete }: ListToolbarProps) {
  const b3Lang = useB3Lang();

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2 }}>
      <Typography variant="h6" component="h2" sx={{ flex: 1, minWidth: '10rem' }}>
        {list.name}
      </Typography>
      <Button size="small" disabled={disabled} onClick={onRename}>
        {b3Lang('favorites.rename')}
      </Button>
      <Button size="small" color="error" disabled={disabled} onClick={onDelete}>
        {b3Lang('favorites.deleteList')}
      </Button>
    </Box>
  );
}
