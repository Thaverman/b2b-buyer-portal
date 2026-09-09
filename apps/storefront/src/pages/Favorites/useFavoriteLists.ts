import { useQuery } from '@tanstack/react-query';

import { getCustomerWishlists } from '@/shared/service/bc';

import { FavoriteList, normalizeLists } from './favorites';

export const favoritesListsQueryKey = (customerId: number) =>
  ['favorites', 'lists', customerId] as const;

/** The customer's lists; `null` data means the storefront session has no customer (signed out). */
export const useFavoriteLists = (customerId: number, enabled: boolean) =>
  useQuery<FavoriteList[] | null>({
    queryKey: favoritesListsQueryKey(customerId),
    queryFn: async () => {
      const nodes = await getCustomerWishlists();

      return nodes === null ? null : normalizeLists(nodes);
    },
    enabled,
    staleTime: 0,
  });
