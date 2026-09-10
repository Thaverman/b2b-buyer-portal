import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { currencyFormat } from '@/utils/b3CurrencyFormat';

import { FavoriteRow } from '../favorites';

import ProductSummary from './ProductSummary';
import RowActions from './RowActions';

interface FavoriteItemsTableProps {
  rows: FavoriteRow[];
  productsFailed: boolean;
  disabled: boolean;
  onAddToCart: (row: FavoriteRow) => void;
  onSaveToLists: (row: FavoriteRow) => void;
  onRemove: (row: FavoriteRow) => void;
}

export default function FavoriteItemsTable({
  rows,
  productsFailed,
  disabled,
  onAddToCart,
  onSaveToLists,
  onRemove,
}: FavoriteItemsTableProps) {
  const b3Lang = useB3Lang();

  return (
    // Like the shared B3Table: the four columns overflow between the 768px mobile cutoff and
    // roughly 1000px, and the ThemeFrame iframe can be narrower than the window.
    <TableContainer>
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
                  productsFailed={productsFailed}
                  disabled={disabled}
                  onAddToCart={onAddToCart}
                  onSaveToLists={onSaveToLists}
                  onRemove={onRemove}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
