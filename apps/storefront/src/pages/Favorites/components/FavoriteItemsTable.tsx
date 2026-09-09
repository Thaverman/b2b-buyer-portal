import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { currencyFormat } from '@/utils/b3CurrencyFormat';

import { FavoriteRow } from '../favorites';

import ProductSummary from './ProductSummary';
import RowActions from './RowActions';

interface FavoriteItemsTableProps {
  rows: FavoriteRow[];
  productsFailed: boolean;
  disabled: boolean;
  onSaveToLists: (row: FavoriteRow) => void;
  onRemove: (row: FavoriteRow) => void;
}

export default function FavoriteItemsTable({
  rows,
  productsFailed,
  disabled,
  onSaveToLists,
  onRemove,
}: FavoriteItemsTableProps) {
  const b3Lang = useB3Lang();

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>{b3Lang('favorites.column.product')}</TableCell>
          <TableCell>{b3Lang('favorites.column.sku')}</TableCell>
          <TableCell>{b3Lang('favorites.column.price')}</TableCell>
          <TableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.item.id}>
            <TableCell>
              <ProductSummary row={row} productsFailed={productsFailed} />
            </TableCell>
            <TableCell>{productsFailed ? '' : row.sku}</TableCell>
            <TableCell>
              {productsFailed || row.price === null ? '' : currencyFormat(row.price)}
            </TableCell>
            <TableCell align="right">
              <RowActions
                row={row}
                disabled={disabled}
                onSaveToLists={onSaveToLists}
                onRemove={onRemove}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
