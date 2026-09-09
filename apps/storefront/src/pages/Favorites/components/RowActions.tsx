import { Box, Button } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { FavoriteRow } from '../favorites';

interface RowActionsProps {
  row: FavoriteRow;
  /** The catalog call failed: no cart action, since minimums and options are unknown. */
  productsFailed: boolean;
  disabled: boolean;
  onAddToCart: (row: FavoriteRow) => void;
  onSaveToLists: (row: FavoriteRow) => void;
  onRemove: (row: FavoriteRow) => void;
}

export default function RowActions({
  row,
  productsFailed,
  disabled,
  onAddToCart,
  onSaveToLists,
  onRemove,
}: RowActionsProps) {
  const b3Lang = useB3Lang();
  const showCartAction = !productsFailed && row.available;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'flex-end' }}>
      {/* Options need the product page. Leaves the portal: anchors in the ThemeFrame iframe need _top. */}
      {showCartAction && row.requiresOptions && (
        <Button
          size="small"
          variant="outlined"
          href={row.productUrl}
          target="_top"
          disabled={disabled}
        >
          {b3Lang('favorites.item.chooseOptions')}
        </Button>
      )}
      {showCartAction && !row.requiresOptions && row.purchasable && (
        <Button
          size="small"
          variant="outlined"
          disabled={disabled}
          onClick={() => onAddToCart(row)}
        >
          {b3Lang('favorites.item.addToCart')}
        </Button>
      )}
      <Button size="small" disabled={disabled} onClick={() => onSaveToLists(row)}>
        {b3Lang('favorites.item.saveToLists')}
      </Button>
      <Button size="small" color="error" disabled={disabled} onClick={() => onRemove(row)}>
        {b3Lang('favorites.item.remove')}
      </Button>
    </Box>
  );
}
