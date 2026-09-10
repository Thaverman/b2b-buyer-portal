import { Box, Button } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { FavoriteRow } from '../favorites';

interface RowActionsProps {
  row: FavoriteRow;
  /** The catalog call failed: no cart action, since minimums and options are unknown. */
  productsFailed: boolean;
  disabled: boolean;
  /** `card` shares the card's width between the buttons; `row` right-aligns them in a table cell. */
  layout?: 'row' | 'card';
  onAddToCart: (row: FavoriteRow) => void;
  onSaveToLists: (row: FavoriteRow) => void;
  onRemove: (row: FavoriteRow) => void;
}

export default function RowActions({
  row,
  productsFailed,
  disabled,
  layout = 'row',
  onAddToCart,
  onSaveToLists,
  onRemove,
}: RowActionsProps) {
  const b3Lang = useB3Lang();
  const showCartAction = !productsFailed && row.available;
  const isCard = layout === 'card';

  return (
    <Box
      data-testid="favorites-row-actions"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        // Right-aligning is correct in a table cell but leaves a ragged edge on a ~320px
        // card, so there the buttons share each line and stretch to fill it — which also
        // survives translated labels that run longer than the English ones.
        justifyContent: isCard ? 'flex-start' : 'flex-end',
        '& > .MuiButton-root': {
          // The brief's 44px minimum touch target; MUI's small button is ~31px tall.
          minHeight: '44px',
          ...(isCard ? { flex: '1 1 auto' } : {}),
        },
      }}
    >
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
