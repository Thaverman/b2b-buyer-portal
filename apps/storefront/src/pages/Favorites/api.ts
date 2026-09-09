import { chunk } from 'lodash-es';

import { searchProducts } from '@/shared/service/b2b';
import { ProductSearch } from '@/shared/service/b2b/graphql/product';
import { platform } from '@/utils/basicConfig';

import { ProductsById } from './favorites';

// Stencil-only: the favorites browser keys are shared with the theme on the same origin,
// and the storefront session cookie is what scopes the wishlist calls to the customer.
export const isFavoritesAvailable = () =>
  platform === 'bigcommerce' && Boolean(window.BC_CONTEXT?.favorites?.enabled);

/** Same batch size the quote page uses for productsSearch by ids. */
const PRODUCT_SEARCH_CHUNK_SIZE = 50;

export interface FavoriteProductsQuery {
  productIds: number[];
  currencyCode: string;
  companyId: string | number;
  customerGroupId: number;
}

interface ProductsSearchPage {
  productsSearch: ProductSearch[];
}

/**
 * productsSearch by ids, merged into a lookup by product id (spec §9). The same call Quick
 * Order and Shopping Lists render from, so prices, price-hidden flags and minimums agree.
 */
export const fetchFavoriteProducts = async ({
  productIds,
  currencyCode,
  companyId,
  customerGroupId,
}: FavoriteProductsQuery): Promise<ProductsById> => {
  const pages = await Promise.all(
    chunk(productIds, PRODUCT_SEARCH_CHUNK_SIZE).map(
      (ids) =>
        // searchProducts is untyped (CustomFieldItems); narrow it once, at this boundary.
        searchProducts({
          productIds: ids,
          currencyCode,
          companyId,
          customerGroupId,
        }) as Promise<ProductsSearchPage>,
    ),
  );

  return pages
    .flatMap((page) => page.productsSearch)
    .reduce<ProductsById>((byId, product) => ({ ...byId, [Number(product.id)]: product }), {});
};
