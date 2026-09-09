import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import { createWishlist, deleteWishlists, updateWishlistName } from '@/shared/service/bc';
import { snackbar } from '@/utils/b3Tip';

import { clearDefaultListId, getDefaultListId, invalidateListsCache } from './storage';
import { favoritesListsQueryKey } from './useFavoriteLists';

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

  const isBusy = [createList, renameList, deleteList].some((mutation) => mutation.isPending);

  return { createList, renameList, deleteList, isBusy };
};
