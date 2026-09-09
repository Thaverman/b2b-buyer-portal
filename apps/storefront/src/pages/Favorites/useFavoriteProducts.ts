import { useQuery } from '@tanstack/react-query';

import { FavoriteProductsQuery, fetchFavoriteProducts } from './api';

/** Catalog data for every product in every list, so switching tabs never refetches. */
export const useFavoriteProducts = ({
  productIds,
  currencyCode,
  companyId,
  customerGroupId,
}: FavoriteProductsQuery) => {
  const ids = Array.from(new Set(productIds)).sort((a, b) => a - b);

  return useQuery({
    queryKey: ['favorites', 'products', ids, currencyCode],
    queryFn: () =>
      fetchFavoriteProducts({ productIds: ids, currencyCode, companyId, customerGroupId }),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
};
