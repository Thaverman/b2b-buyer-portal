import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { currencyFormat } from '@/utils/b3CurrencyFormat';

import { FavoriteRow } from '../favorites';

import ProductSummary from './ProductSummary';

interface FavoriteItemsTableProps {
  rows: FavoriteRow[];
  productsFailed: boolean;
}

export default function FavoriteItemsTable({ rows, productsFailed }: FavoriteItemsTableProps) {
  const b3Lang = useB3Lang();

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>{b3Lang('favorites.column.product')}</TableCell>
          <TableCell>{b3Lang('favorites.column.sku')}</TableCell>
          <TableCell>{b3Lang('favorites.column.price')}</TableCell>
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
