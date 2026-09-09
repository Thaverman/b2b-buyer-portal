import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Typography } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import B3Spin from '@/components/spin/B3Spin';
import { useB3Lang } from '@/lib/lang';
import { activeCurrencyInfoSelector, useAppSelector } from '@/store';
import { snackbar } from '@/utils/b3Tip';

import EmptyState from './components/EmptyState';
import FavoriteItemsTable from './components/FavoriteItemsTable';
import ListNameDialog from './components/ListNameDialog';
import ListTabs from './components/ListTabs';
import ListToolbar from './components/ListToolbar';
import SaveToListsDialog from './components/SaveToListsDialog';
import { isFavoritesAvailable } from './api';
import { FavoriteList, FavoriteRow, hydrateRows, planAddToCart } from './favorites';
import { SaveToListsInput, useFavoriteActions } from './useFavoriteActions';
import { useFavoriteLists } from './useFavoriteLists';
import { useFavoriteProducts } from './useFavoriteProducts';

type NameDialogState = { mode: 'create' } | { mode: 'rename'; list: FavoriteList };

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
  const actions = useFavoriteActions(customerId);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FavoriteList | null>(null);
  const [pickerRow, setPickerRow] = useState<FavoriteRow | null>(null);

  const selectListId = (listId: number) =>
    setSearchParams({ list: String(listId) }, { replace: true });

  const handleCreateList = async (name: string) => {
    try {
      const created = await actions.createList.mutateAsync(name);
      setNameDialog(null);
      selectListId(created.entityId);
    } catch {
      // the actions hook already toasted the failure; keep the dialog open to retry
    }
  };

  const handleRenameList = async (list: FavoriteList, name: string) => {
    try {
      await actions.renameList.mutateAsync({ listId: list.id, name });
      setNameDialog(null);
    } catch {
      // toasted by the actions hook
    }
  };

  const handleDeleteList = async (list: FavoriteList) => {
    try {
      await actions.deleteList.mutateAsync(list.id);
      setPendingDelete(null);

      if (selectedList?.id === list.id) {
        setSearchParams({}, { replace: true });
      }
    } catch {
      // toasted by the actions hook
    }
  };

  const handleSaveToLists = async (input: SaveToListsInput) => {
    try {
      await actions.saveToLists.mutateAsync(input);
      setPickerRow(null);
    } catch {
      // toasted by the actions hook; keep the picker open
    }
  };

  const addRowToCart = (row: FavoriteRow) =>
    actions.addToCart.mutate({ plan: planAddToCart([row]) });

  const handleAddAllToCart = () => {
    const plan = planAddToCart(rows);

    if (plan.lineItems.length === 0) {
      snackbar.info(b3Lang('favorites.cart.nothingToAdd'));

      return;
    }

    actions.addToCart.mutate({ plan });
  };

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
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button
            variant="outlined"
            disabled={actions.isBusy}
            onClick={() => setNameDialog({ mode: 'create' })}
          >
            {b3Lang('favorites.newList')}
          </Button>
        </Box>
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
            <ListToolbar
              list={selectedList}
              disabled={actions.isBusy}
              hasItems={rows.length > 0}
              onRename={() => setNameDialog({ mode: 'rename', list: selectedList })}
              onDelete={() => setPendingDelete(selectedList)}
              onAddAll={handleAddAllToCart}
            />
            {rows.length === 0 ? (
              <Typography>{b3Lang('favorites.empty.list')}</Typography>
            ) : (
              <FavoriteItemsTable
                rows={rows}
                productsFailed={productsFailed}
                disabled={actions.isBusy}
                onAddToCart={addRowToCart}
                onSaveToLists={setPickerRow}
                onRemove={(row) =>
                  actions.removeItem.mutate({
                    listId: selectedList.id,
                    listName: selectedList.name,
                    itemId: row.item.id,
                  })
                }
              />
            )}
          </>
        )}
      </Box>
      {/* Dialogs sit after the layout Box: B3Dialog renders an in-flow wrapper even while closed. */}
      <ListNameDialog
        isOpen={nameDialog !== null}
        dialogKey={nameDialog?.mode === 'rename' ? `rename-${nameDialog.list.id}` : 'create'}
        title={b3Lang(nameDialog?.mode === 'rename' ? 'favorites.rename' : 'favorites.newList')}
        initialName={nameDialog?.mode === 'rename' ? nameDialog.list.name : ''}
        submitLabel={b3Lang(
          nameDialog?.mode === 'rename' ? 'favorites.listName.save' : 'favorites.listName.create',
        )}
        loading={actions.createList.isPending || actions.renameList.isPending}
        onCancel={() => setNameDialog(null)}
        onSubmit={(name) =>
          nameDialog?.mode === 'rename'
            ? handleRenameList(nameDialog.list, name)
            : handleCreateList(name)
        }
      />
      <B3Dialog
        isOpen={pendingDelete !== null}
        title={b3Lang('favorites.deleteList')}
        rightSizeBtn={b3Lang('favorites.deleteList')}
        loading={actions.deleteList.isPending}
        handleLeftClick={() => setPendingDelete(null)}
        handRightClick={() => {
          if (pendingDelete) {
            handleDeleteList(pendingDelete);
          }
        }}
      >
        <Typography>
          {pendingDelete
            ? b3Lang('favorites.deleteList.confirm', {
                name: pendingDelete.name,
                count: pendingDelete.items.length,
              })
            : ''}
        </Typography>
      </B3Dialog>
      <SaveToListsDialog
        row={pickerRow}
        lists={lists}
        loading={actions.saveToLists.isPending}
        onCancel={() => setPickerRow(null)}
        onSave={handleSaveToLists}
        onCreateList={(name) => actions.createList.mutateAsync(name)}
      />
    </B3Spin>
  );
}

export default Favorites;
