import { Box, Chip, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { FavoriteRow } from '../favorites';

interface ProductSummaryProps {
  row: FavoriteRow;
  /** The catalog call failed: show a placeholder instead of pretending the product is gone. */
  productsFailed: boolean;
}

export default function ProductSummary({ row, productsFailed }: ProductSummaryProps) {
  const b3Lang = useB3Lang();
  const unavailableLabel = b3Lang('favorites.item.unavailable');
  const label = productsFailed
    ? b3Lang('favorites.item.detailsUnavailable')
    : row.name || unavailableLabel;
  const showUnavailableChip = !productsFailed && !row.available && row.name !== '';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {/* Decorative: the name sits beside it, so an empty alt keeps screen readers from reading it twice. */}
      <Box
        component="img"
        src={row.imageUrl}
        alt=""
        sx={{ width: 60, height: 60, objectFit: 'contain', borderRadius: 1, flexShrink: 0 }}
      />
      <Box>
        <Typography variant="body1">{label}</Typography>
        {showUnavailableChip && <Chip size="small" label={unavailableLabel} />}
      </Box>
    </Box>
  );
}
