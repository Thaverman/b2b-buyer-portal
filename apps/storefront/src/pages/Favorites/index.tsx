import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Typography } from '@mui/material';

import B3Spin from '@/components/spin/B3Spin';
import { useB3Lang } from '@/lib/lang';
import { activeCurrencyInfoSelector, useAppSelector } from '@/store';

import EmptyState from './components/EmptyState';
import FavoriteItemsTable from './components/FavoriteItemsTable';
import ListTabs from './components/ListTabs';
import { isFavoritesAvailable } from './api';
import { FavoriteList, hydrateRows } from './favorites';
import { useFavoriteLists } from './useFavoriteLists';
import { useFavoriteProducts } from './useFavoriteProducts';

// `?list=<id>` selects the list; unknown or missing falls back to the first one (spec §4.5).
const selectList = (lists: FavoriteList[], param: string | null): FavoriteList | undefined =>
  lists.find((list) => String(list.id) === param) ?? lists[0];

function Favorites() {
  const b3Lang = useB3Lang();
  const navigate = useNavigate();
  const customerId = useAppSelector(({ company }) => company.customer.id);
  const companyId = useAppSelector(({ company }) => company.companyInfo.id);
  const customerGroupId = useAppSelector(({ company }) => company.customer.customerGroupId);
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  const showInclusiveTaxPrice = useAppSelector(({ global }) => global.showInclusiveTaxPrice);
  const { currency_code: currencyCode } = useAppSelector(activeCurrencyInfoSelector);
  // The storefront session cookie identifies the logged-in rep, so a masquerading rep must
  // not see or edit favorites here. Belt and braces with the route filter: gotoAllowedAppPage
  // checks the unfiltered routes array, so a programmatic push could still mount this page.
  const isAvailable = isFavoritesAvailable() && !isAgenting;

  const [searchParams, setSearchParams] = useSearchParams();
  const listsQuery = useFavoriteLists(customerId, isAvailable);
  const lists = listsQuery.data ?? [];
  const selectedList = selectList(lists, searchParams.get('list'));
  const productsQuery = useFavoriteProducts({
    productIds: lists.flatMap((list) => list.items.map((item) => item.productId)),
    currencyCode,
    companyId,
    customerGroupId,
  });
  const rows = selectedList
    ? hydrateRows(selectedList, productsQuery.data ?? {}, showInclusiveTaxPrice)
    : [];

  const selectListId = (listId: number) =>
    setSearchParams({ list: String(listId) }, { replace: true });

  if (!isAvailable) {
    return <Typography>{b3Lang('favorites.unavailable')}</Typography>;
  }

  if (listsQuery.data === null) {
    return (
      <EmptyState message={b3Lang('favorites.signedOut')}>
        <Button variant="contained" onClick={() => navigate('/login')}>
          {b3Lang('favorites.signIn')}
        </Button>
      </EmptyState>
    );
  }

  const isLoading = listsQuery.isLoading || productsQuery.isLoading;
  const productsFailed = productsQuery.isError;

  return (
    <B3Spin isSpinning={isLoading}>
      <Box>
        {productsFailed && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {b3Lang('favorites.error.products')}
          </Alert>
        )}
        {!listsQuery.isLoading && lists.length === 0 && (
          <EmptyState message={b3Lang('favorites.empty.noLists')}>
            {/* Leaves the portal: anchors rendered inside the ThemeFrame iframe need _top. */}
            <Button variant="contained" href="/" target="_top">
              {b3Lang('favorites.empty.startShopping')}
            </Button>
          </EmptyState>
        )}
        {selectedList && (
          <>
            <ListTabs lists={lists} selectedId={selectedList.id} onSelect={selectListId} />
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
              {selectedList.name}
            </Typography>
            {rows.length === 0 ? (
              <Typography>{b3Lang('favorites.empty.list')}</Typography>
            ) : (
              <FavoriteItemsTable rows={rows} productsFailed={productsFailed} />
            )}
          </>
        )}
      </Box>
    </B3Spin>
  );
}

export default Favorites;
