import {
  buildFavoriteProductWith,
  bulk,
  graphql,
  HttpResponse,
  startMockServer,
} from 'tests/test-utils';

import { fetchFavoriteProducts, isFavoritesAvailable } from './api';

const { server } = startMockServer();

afterEach(() => {
  delete window.BC_CONTEXT;
});

describe('isFavoritesAvailable', () => {
  it('is available when the host enables favorites on a bigcommerce storefront', () => {
    window.BC_CONTEXT = { favorites: { enabled: true } };

    expect(isFavoritesAvailable()).toBe(true);
  });

  it('is unavailable when the host config has no favorites key', () => {
    window.BC_CONTEXT = {};

    expect(isFavoritesAvailable()).toBe(false);
  });

  it('is unavailable when the host disables favorites', () => {
    window.BC_CONTEXT = { favorites: { enabled: false } };

    expect(isFavoritesAvailable()).toBe(false);
  });

  it('is unavailable when there is no host config at all', () => {
    expect(isFavoritesAvailable()).toBe(false);
  });
});

describe('fetchFavoriteProducts', () => {
  // With the B2B-3705 flag off (the test default) the ids are interpolated into the query text.
  const idsIn = (query: string) =>
    (query.match(/productIds: \[([^\]]*)\]/)?.[1] ?? '').split(',').filter(Boolean).map(Number);

  it('searches in chunks of 50 and merges the pages into a lookup by product id', async () => {
    const products = bulk(buildFavoriteProductWith, 'WHATEVER_VALUES')
      .times(120)
      .map((product, index) => ({ ...product, id: index + 1 }));
    const requests: number[][] = [];

    server.use(
      graphql.query('SearchProducts', ({ query }) => {
        const ids = idsIn(query);
        requests.push(ids);

        return HttpResponse.json({
          data: { productsSearch: products.filter((product) => ids.includes(product.id)) },
        });
      }),
    );

    const byId = await fetchFavoriteProducts({
      productIds: products.map((product) => product.id),
      currencyCode: 'USD',
      companyId: '',
      customerGroupId: 0,
    });

    expect(requests.map((ids) => ids.length)).toEqual([50, 50, 20]);
    expect(Object.keys(byId)).toHaveLength(120);
    expect(byId[120]).toEqual(products[119]);
  });

  it('resolves to an empty lookup without calling the API when there are no ids', async () => {
    const handler = vi.fn();

    server.use(
      graphql.query('SearchProducts', () => {
        handler();

        return HttpResponse.json({ data: { productsSearch: [] } });
      }),
    );

    await expect(
      fetchFavoriteProducts({
        productIds: [],
        currencyCode: 'USD',
        companyId: '',
        customerGroupId: 0,
      }),
    ).resolves.toEqual({});
    expect(handler).not.toHaveBeenCalled();
  });
});
