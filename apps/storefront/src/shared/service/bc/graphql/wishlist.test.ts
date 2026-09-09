import {
  buildWishlistItemNodeWith,
  buildWishlistNodeWith,
  faker,
  graphql,
  HttpResponse,
  startMockServer,
} from 'tests/test-utils';

import {
  addWishlistItems,
  createWishlist,
  deleteWishlistItems,
  deleteWishlists,
  getCustomerWishlists,
  updateWishlistName,
  WishlistError,
  WishlistItemNode,
  WishlistNode,
} from './wishlist';

const { server } = startMockServer();

const lastPage: { hasNextPage: boolean; endCursor: string | null } = {
  hasNextPage: false,
  endCursor: null,
};

const connection = <T>(nodes: T[], pageInfo = lastPage) => ({
  pageInfo,
  edges: nodes.map((node) => ({ node })),
});

// The API shape: a list node whose items are a connection, not a flat array.
const rawList = (list: WishlistNode, itemsPageInfo = lastPage) => ({
  entityId: list.entityId,
  name: list.name,
  isPublic: list.isPublic,
  items: connection(list.items, itemsPageInfo),
});

const mockLists = (lists: WishlistNode[]) =>
  server.use(
    graphql.query('FavoritesLists', () =>
      HttpResponse.json({
        data: { customer: { wishlists: connection(lists.map((list) => rawList(list))) } },
      }),
    ),
  );

describe('getCustomerWishlists', () => {
  it('flattens every list and its items', async () => {
    const item = buildWishlistItemNodeWith({ variantEntityId: faker.number.int({ min: 1 }) });
    const list = buildWishlistNodeWith({ items: [item] });
    mockLists([list]);

    await expect(getCustomerWishlists()).resolves.toEqual([
      { entityId: list.entityId, name: list.name, isPublic: list.isPublic, items: [item] },
    ]);
  });

  it('returns null when the storefront session has no customer', async () => {
    server.use(
      graphql.query('FavoritesLists', () => HttpResponse.json({ data: { customer: null } })),
    );

    await expect(getCustomerWishlists()).resolves.toBeNull();
  });

  it('follows the wishlists cursor until the last page', async () => {
    const first = buildWishlistNodeWith('WHATEVER_VALUES');
    const second = buildWishlistNodeWith('WHATEVER_VALUES');
    const afterValues: unknown[] = [];

    server.use(
      graphql.query('FavoritesLists', ({ variables }) => {
        afterValues.push(variables.after);

        return HttpResponse.json({
          data: {
            customer: {
              wishlists:
                variables.after === 'cursor-1'
                  ? connection([rawList(second)])
                  : connection([rawList(first)], { hasNextPage: true, endCursor: 'cursor-1' }),
            },
          },
        });
      }),
    );

    const lists = await getCustomerWishlists();

    expect(lists?.map((list) => list.entityId)).toEqual([first.entityId, second.entityId]);
    expect(afterValues).toEqual([null, 'cursor-1']);
  });

  it('follows the items cursor of a list with more than one page of items', async () => {
    const firstPageItem = buildWishlistItemNodeWith('WHATEVER_VALUES');
    const secondPageItem = buildWishlistItemNodeWith('WHATEVER_VALUES');
    const list = buildWishlistNodeWith({ items: [firstPageItem] });
    const itemsVariables: unknown[] = [];

    server.use(
      graphql.query('FavoritesLists', () =>
        HttpResponse.json({
          data: {
            customer: {
              wishlists: connection([
                rawList(list, { hasNextPage: true, endCursor: 'items-cursor-1' }),
              ]),
            },
          },
        }),
      ),
      graphql.query('FavoritesListItems', ({ variables }) => {
        itemsVariables.push(variables);

        return HttpResponse.json({
          data: {
            customer: {
              wishlists: connection([
                { entityId: list.entityId, items: connection([secondPageItem]) },
              ]),
            },
          },
        });
      }),
    );

    const lists = await getCustomerWishlists();

    expect(lists?.[0].items).toEqual<WishlistItemNode[]>([firstPageItem, secondPageItem]);
    expect(itemsVariables).toEqual([{ listId: list.entityId, after: 'items-cursor-1' }]);
  });

  it('rejects with a WishlistError carrying the first GraphQL error message', async () => {
    server.use(
      graphql.query('FavoritesLists', () =>
        HttpResponse.json({ errors: [{ message: 'Not authorized' }, { message: 'Second' }] }),
      ),
    );

    await expect(getCustomerWishlists()).rejects.toThrow(new WishlistError('Not authorized'));
  });
});

describe('mutations', () => {
  it('creates a private list and returns its summary', async () => {
    const name = faker.commerce.department();
    const entityId = faker.number.int({ min: 1 });
    const received = vi.fn();

    server.use(
      graphql.mutation('CreateFavoritesList', ({ variables }) => {
        received(variables);

        return HttpResponse.json({
          data: { wishlist: { createWishlist: { result: { entityId, name } } } },
        });
      }),
    );

    await expect(createWishlist(name)).resolves.toEqual({ entityId, name });
    expect(received).toHaveBeenCalledWith({ name });
  });

  it('renames a list', async () => {
    const listId = faker.number.int({ min: 1 });
    const name = faker.commerce.department();
    const received = vi.fn();

    server.use(
      graphql.mutation('RenameFavoritesList', ({ variables }) => {
        received(variables);

        return HttpResponse.json({
          data: { wishlist: { updateWishlist: { result: { entityId: listId, name } } } },
        });
      }),
    );

    await expect(updateWishlistName(listId, name)).resolves.toEqual({ entityId: listId, name });
    expect(received).toHaveBeenCalledWith({ listId, name });
  });

  it('adds items to a list', async () => {
    const listId = faker.number.int({ min: 1 });
    const items = [
      { productEntityId: faker.number.int({ min: 1 }) },
      {
        productEntityId: faker.number.int({ min: 1 }),
        variantEntityId: faker.number.int({ min: 1 }),
      },
    ];
    const received = vi.fn();

    server.use(
      graphql.mutation('AddFavoritesItems', ({ variables }) => {
        received(variables);

        return HttpResponse.json({
          data: { wishlist: { addWishlistItems: { result: { entityId: listId } } } },
        });
      }),
    );

    await expect(addWishlistItems(listId, items)).resolves.toBeUndefined();
    expect(received).toHaveBeenCalledWith({ listId, items });
  });

  it('deletes items from a list', async () => {
    const listId = faker.number.int({ min: 1 });
    const itemIds = [faker.number.int({ min: 1 }), faker.number.int({ min: 1 })];
    const received = vi.fn();

    server.use(
      graphql.mutation('DeleteFavoritesItems', ({ variables }) => {
        received(variables);

        return HttpResponse.json({
          data: { wishlist: { deleteWishlistItems: { result: { entityId: listId } } } },
        });
      }),
    );

    await expect(deleteWishlistItems(listId, itemIds)).resolves.toBeUndefined();
    expect(received).toHaveBeenCalledWith({ listId, itemIds });
  });

  it('deletes lists', async () => {
    const listIds = [faker.number.int({ min: 1 })];
    const received = vi.fn();

    server.use(
      graphql.mutation('DeleteFavoritesLists', ({ variables }) => {
        received(variables);

        return HttpResponse.json({ data: { wishlist: { deleteWishlists: { result: 'ok' } } } });
      }),
    );

    await expect(deleteWishlists(listIds)).resolves.toBeUndefined();
    expect(received).toHaveBeenCalledWith({ listIds });
  });

  it('rejects a mutation whose response carries errors', async () => {
    server.use(
      graphql.mutation('CreateFavoritesList', () =>
        HttpResponse.json({ errors: [{ message: 'Name too long' }] }),
      ),
    );

    await expect(createWishlist('x')).rejects.toThrow(new WishlistError('Name too long'));
  });
});
