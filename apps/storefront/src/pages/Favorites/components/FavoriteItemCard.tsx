import { Box, Card, CardContent, Typography } from '@mui/material';

import { currencyFormat } from '@/utils/b3CurrencyFormat';

import { FavoriteRow } from '../favorites';

import ProductSummary from './ProductSummary';
import RowActions from './RowActions';

interface FavoriteItemCardProps {
  row: FavoriteRow;
  productsFailed: boolean;
  disabled: boolean;
  onAddToCart: (row: FavoriteRow) => void;
  onSaveToLists: (row: FavoriteRow) => void;
  onRemove: (row: FavoriteRow) => void;
}

export default function FavoriteItemCard({
  row,
  productsFailed,
  disabled,
  onAddToCart,
  onSaveToLists,
  onRemove,
}: FavoriteItemCardProps) {
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <ProductSummary row={row} productsFailed={productsFailed} />
        {!productsFailed && row.sku && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {row.sku}
          </Typography>
        )}
        {!productsFailed && row.price !== null && (
          <Typography variant="subtitle1">{currencyFormat(row.price)}</Typography>
        )}
        <Box sx={{ mt: 1 }}>
          <RowActions
            row={row}
            productsFailed={productsFailed}
            disabled={disabled}
            onAddToCart={onAddToCart}
            onSaveToLists={onSaveToLists}
            onRemove={onRemove}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
