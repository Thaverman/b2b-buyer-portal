import {
  buildFavoriteItemWith,
  buildFavoriteListWith,
  buildWishlistItemNodeWith,
  buildWishlistNodeWith,
  faker,
} from 'tests/test-utils';

import {
  isEmptyPlan,
  itemKey,
  membership,
  normalizeLists,
  planGuestMerge,
  planSaveToLists,
} from './favorites';

describe('normalizeLists', () => {
  it('maps API nodes onto the theme list shape', () => {
    const item = buildWishlistItemNodeWith({ variantEntityId: 6340 });
    const node = buildWishlistNodeWith({ items: [item] });

    expect(normalizeLists([node])).toEqual([
      {
        id: node.entityId,
        name: node.name,
        isPublic: node.isPublic,
        items: [{ id: item.entityId, productId: item.productEntityId, variantId: 6340 }],
      },
    ]);
  });
});

describe('itemKey', () => {
  it('distinguishes a product-only row from a variant row of the same product', () => {
    expect(itemKey({ productId: 1, variantId: null })).not.toBe(
      itemKey({ productId: 1, variantId: 2 }),
    );
    expect(itemKey({ productId: 1, variantId: 2 })).toBe(itemKey({ productId: 1, variantId: 2 }));
  });
});

describe('membership', () => {
  it('returns the ids of the lists holding exactly that pair', () => {
    const productId = faker.number.int({ min: 1 });
    const holding = buildFavoriteListWith({
      items: [buildFavoriteItemWith({ productId, variantId: 5 })],
    });
    const otherVariant = buildFavoriteListWith({
      items: [buildFavoriteItemWith({ productId, variantId: null })],
    });
    const empty = buildFavoriteListWith({ items: [] });

    expect(membership([holding, otherVariant, empty], { productId, variantId: 5 })).toEqual(
      new Set([holding.id]),
    );
  });
});

describe('planSaveToLists', () => {
  const productId = faker.number.int({ min: 1 });
  const ref = { productId, variantId: null };
  const current = buildFavoriteListWith({
    items: [buildFavoriteItemWith({ productId, variantId: null })],
  });
  const other = buildFavoriteListWith({ items: [] });

  it('copies: checking another list adds there and keeps the current list', () => {
    expect(
      planSaveToLists({ lists: [current, other], ref, selected: new Set([current.id, other.id]) }),
    ).toEqual({ adds: [{ listId: other.id }], removes: [] });
  });

  it('moves: checking another list and unchecking the current one adds and removes', () => {
    expect(
      planSaveToLists({ lists: [current, other], ref, selected: new Set([other.id]) }),
    ).toEqual({
      adds: [{ listId: other.id }],
      removes: [{ listId: current.id, itemId: current.items[0].id }],
    });
  });

  it('removes the product from every list when nothing is selected', () => {
    const alsoHolding = buildFavoriteListWith({
      items: [buildFavoriteItemWith({ productId, variantId: null })],
    });

    expect(
      planSaveToLists({ lists: [current, alsoHolding, other], ref, selected: new Set() }),
    ).toEqual({
      adds: [],
      removes: [
        { listId: current.id, itemId: current.items[0].id },
        { listId: alsoHolding.id, itemId: alsoHolding.items[0].id },
      ],
    });
  });

  it('is empty when the selection matches membership', () => {
    const plan = planSaveToLists({ lists: [current, other], ref, selected: new Set([current.id]) });

    expect(plan).toEqual({ adds: [], removes: [] });
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('does not remove a different variant of the same product', () => {
    const variantList = buildFavoriteListWith({
      items: [buildFavoriteItemWith({ productId, variantId: 9 })],
    });

    expect(planSaveToLists({ lists: [variantList], ref, selected: new Set() })).toEqual({
      adds: [],
      removes: [],
    });
  });
});

describe('planGuestMerge', () => {
  const guestRow = (productId: number, variantId: number | null = null) => ({
    productId,
    variantId,
  });

  it('is null when the guest store is empty', () => {
    expect(
      planGuestMerge({
        guest: [],
        lists: [buildFavoriteListWith('WHATEVER_VALUES')],
        defaultListId: null,
      }),
    ).toBeNull();
  });

  it('targets the default list when it still exists and adds only the missing rows', () => {
    const present = guestRow(100, null);
    const missing = guestRow(200, 7);
    const defaultList = buildFavoriteListWith({
      items: [buildFavoriteItemWith({ productId: 100, variantId: null })],
    });
    const other = buildFavoriteListWith('WHATEVER_VALUES');

    expect(
      planGuestMerge({
        guest: [present, missing],
        lists: [other, defaultList],
        defaultListId: defaultList.id,
      }),
    ).toEqual({
      target: { kind: 'existing', listId: defaultList.id, name: defaultList.name },
      rows: [missing],
    });
  });

  it('falls back to the first list when the default list is gone', () => {
    const first = buildFavoriteListWith({ items: [] });
    const second = buildFavoriteListWith({ items: [] });

    expect(
      planGuestMerge({ guest: [guestRow(1)], lists: [first, second], defaultListId: 999 })?.target,
    ).toEqual({ kind: 'existing', listId: first.id, name: first.name });
  });

  it('asks for a new list when the customer has none', () => {
    expect(
      planGuestMerge({ guest: [guestRow(1), guestRow(2)], lists: [], defaultListId: null }),
    ).toEqual({ target: { kind: 'create' }, rows: [guestRow(1), guestRow(2)] });
  });

  it('keeps variant rows distinct and drops duplicate guest rows', () => {
    const list = buildFavoriteListWith({ items: [] });

    expect(
      planGuestMerge({
        guest: [guestRow(1, null), guestRow(1, 5), guestRow(1, 5)],
        lists: [list],
        defaultListId: list.id,
      })?.rows,
    ).toEqual([guestRow(1, null), guestRow(1, 5)]);
  });

  it('has no rows when every guest row is already in the target', () => {
    const list = buildFavoriteListWith({
      items: [buildFavoriteItemWith({ productId: 1, variantId: null })],
    });

    expect(
      planGuestMerge({ guest: [guestRow(1)], lists: [list], defaultListId: list.id })?.rows,
    ).toEqual([]);
  });
});
