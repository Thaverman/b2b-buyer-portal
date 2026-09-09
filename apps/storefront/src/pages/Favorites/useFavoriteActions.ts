import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import {
  addWishlistItems,
  createWishlist,
  deleteWishlistItems,
  deleteWishlists,
  updateWishlistName,
  WishlistItemInput,
} from '@/shared/service/bc';
import { snackbar } from '@/utils/b3Tip';
import b3TriggerCartNumber from '@/utils/b3TriggerCartNumber';
import { createOrUpdateExistingCart } from '@/utils/cartUtils';

import { trackAddToWishlist } from './analytics';
import {
  AddToCartPlan,
  FavoriteList,
  FavoriteRow,
  GuestMergePlan,
  ItemRef,
  SaveToListsPlan,
} from './favorites';
import {
  clearDefaultListId,
  clearGuestFavorites,
  getDefaultListId,
  invalidateListsCache,
  setDefaultListId,
} from './storage';
import { favoritesListsQueryKey } from './useFavoriteLists';

export interface SaveToListsInput {
  plan: SaveToListsPlan;
  row: FavoriteRow;
  /** Every list the dialog showed, including ones created inside it, so names resolve for toasts and GA4. */
  lists: FavoriteList[];
}

const toWishlistItem = ({ productId, variantId }: ItemRef): WishlistItemInput =>
  variantId === null
    ? { productEntityId: productId }
    : { productEntityId: productId, variantEntityId: variantId };

const CART_URL = '/cart.php';

/**
 * Every write the page makes. Each success drops the theme's session cache and refetches
 * our lists, so the star on the next storefront page and this page agree (spec §9).
 */
export const useFavoriteActions = (customerId: number) => {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();

  const refresh = () => {
    invalidateListsCache();

    return queryClient.invalidateQueries({ queryKey: favoritesListsQueryKey(customerId) });
  };

  const onError = () => {
    snackbar.error(b3Lang('favorites.error.generic'));
    refresh();
  };

  const createList = useMutation({
    mutationFn: (name: string) => createWishlist(name),
    onSuccess: () => refresh(),
    onError,
  });

  const renameList = useMutation({
    mutationFn: ({ listId, name }: { listId: number; name: string }) =>
      updateWishlistName(listId, name),
    onSuccess: () => {
      snackbar.success(b3Lang('favorites.renamed'));
      refresh();
    },
    onError,
  });

  const deleteList = useMutation({
    mutationFn: async (listId: number) => {
      await deleteWishlists([listId]);

      // The theme's one-click save targets the default list; never leave it pointing at a deleted one.
      if (getDefaultListId() === listId) {
        clearDefaultListId();
      }
    },
    onSuccess: () => {
      snackbar.success(b3Lang('favorites.deleteList.deleted'));
      refresh();
    },
    onError,
  });

  const removeItem = useMutation({
    mutationFn: ({ listId, itemId }: { listId: number; listName: string; itemId: number }) =>
      deleteWishlistItems(listId, [itemId]),
    onSuccess: (_, { listName }) => {
      snackbar.success(b3Lang('favorites.item.removed', { list: listName }));
      refresh();
    },
    onError,
  });

  const saveToLists = useMutation({
    mutationFn: async ({ plan, row, lists }: SaveToListsInput) => {
      const item = toWishlistItem(row.item);
      await Promise.all(plan.adds.map(({ listId }) => addWishlistItems(listId, [item])));
      await Promise.all(
        plan.removes.map(({ listId, itemId }) => deleteWishlistItems(listId, [itemId])),
      );
      const addedTo = plan.adds.flatMap(({ listId }) => lists.filter((list) => list.id === listId));

      return { addedTo, removedCount: plan.removes.length };
    },
    onSuccess: ({ addedTo, removedCount }, { row }) => {
      const lastAdded = addedTo[addedTo.length - 1];

      if (lastAdded) {
        setDefaultListId(lastAdded.id);
      }

      addedTo.forEach((list) =>
        trackAddToWishlist({
          productId: row.item.productId,
          variantId: row.item.variantId,
          name: row.name,
          listName: list.name,
        }),
      );
      snackbar.success(
        lastAdded && addedTo.length === 1 && removedCount === 0
          ? b3Lang('favorites.picker.saved', { list: lastAdded.name })
          : b3Lang('favorites.picker.updated'),
      );
      refresh();
    },
    onError,
  });

  const addToCart = useMutation({
    mutationFn: async ({ plan }: { plan: AddToCartPlan }) => {
      try {
        await createOrUpdateExistingCart(plan.lineItems);
      } finally {
        // Refresh the header count whether or not the add went through, as Quick Order does.
        b3TriggerCartNumber();
      }

      return plan;
    },
    onSuccess: (plan) => {
      // The React realm is the top window (only the DOM is portaled into the ThemeFrame),
      // so assigning location here leaves the portal correctly.
      const action = {
        label: b3Lang('favorites.cart.view'),
        onClick: () => {
          window.location.href = CART_URL;
        },
      };
      const added = plan.lineItems.length;
      const skipped = plan.skipped.length;

      if (added === 1 && skipped === 0) {
        snackbar.success(b3Lang('favorites.cart.addedOne'), { action });

        return;
      }

      snackbar.success(b3Lang('favorites.cart.addedMany', { count: added }), {
        action,
        description: skipped > 0 ? b3Lang('favorites.cart.skipped', { count: skipped }) : undefined,
      });
    },
    onError: (error: unknown) => {
      // The cart helper throws the storefront's own message; show it as the other pages do.
      snackbar.error(
        error instanceof Error && error.message ? error.message : b3Lang('favorites.error.generic'),
      );
    },
  });

  const mergeGuest = useMutation({
    mutationFn: async ({ plan }: { plan: GuestMergePlan }) => {
      const target =
        plan.target.kind === 'existing'
          ? { id: plan.target.listId, name: plan.target.name }
          : await createWishlist(b3Lang('favorites.defaultListName')).then((created) => ({
              id: created.entityId,
              name: created.name,
            }));

      if (plan.rows.length > 0) {
        await addWishlistItems(target.id, plan.rows.map(toWishlistItem));
      }

      // Only once the server has the rows: a failure above leaves the guest store for a retry
      // by either side (spec §13).
      clearGuestFavorites();

      return { target, rows: plan.rows };
    },
    onSuccess: ({ target, rows }) => {
      if (rows.length > 0) {
        setDefaultListId(target.id);
        rows.forEach((row) =>
          trackAddToWishlist({
            productId: row.productId,
            variantId: row.variantId,
            listName: target.name,
          }),
        );
        snackbar.success(
          b3Lang('favorites.merge.added', { count: rows.length, list: target.name }),
        );
      }

      refresh();
    },
    onError,
  });

  const isBusy = [
    createList,
    renameList,
    deleteList,
    removeItem,
    saveToLists,
    addToCart,
    mergeGuest,
  ].some((mutation) => mutation.isPending);

  return {
    createList,
    renameList,
    deleteList,
    removeItem,
    saveToLists,
    addToCart,
    mergeGuest,
    isBusy,
  };
};
