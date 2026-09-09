import {
  buildFavoriteItemWith,
  buildFavoriteListWith,
  buildFavoriteProductWith,
  buildFavoriteRowWith,
  buildFavoriteVariantWith,
  buildWishlistItemNodeWith,
  buildWishlistNodeWith,
  faker,
} from 'tests/test-utils';

import { PRODUCT_DEFAULT_IMAGE } from '@/constants';

import {
  hydrateRows,
  isEmptyPlan,
  itemKey,
  membership,
  normalizeLists,
  planAddToCart,
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

describe('hydrateRows', () => {
  const priced = (exclusive: number) => ({
    as_entered: exclusive,
    tax_inclusive: exclusive * 2,
    tax_exclusive: exclusive,
    entered_inclusive: false,
  });

  it('joins a variant favorite with its product: variant SKU, image and price, product URL', () => {
    const variant = buildFavoriteVariantWith({
      sku: 'VAR-1',
      image_url: 'https://img.example/var.png',
      bc_calculated_price: priced(10),
    });
    const product = buildFavoriteProductWith({
      variants: [buildFavoriteVariantWith('WHATEVER_VALUES'), variant],
      orderQuantityMinimum: 4,
    });
    const item = buildFavoriteItemWith({ productId: product.id, variantId: variant.variant_id });
    const list = buildFavoriteListWith({ items: [item] });

    expect(hydrateRows(list, { [product.id]: product }, false)).toEqual([
      {
        item,
        available: true,
        name: product.name,
        sku: 'VAR-1',
        imageUrl: 'https://img.example/var.png',
        price: 10,
        productUrl: product.productUrl,
        requiresOptions: false,
        purchasable: true,
        orderQuantityMinimum: 4,
        cartVariantId: variant.variant_id,
      },
    ]);
  });

  it('uses the tax-inclusive price when the store displays inclusive prices', () => {
    const variant = buildFavoriteVariantWith({ bc_calculated_price: priced(10) });
    const product = buildFavoriteProductWith({ variants: [variant] });
    const item = buildFavoriteItemWith({ productId: product.id, variantId: variant.variant_id });

    const [row] = hydrateRows(
      buildFavoriteListWith({ items: [item] }),
      { [product.id]: product },
      true,
    );

    expect(row.price).toBe(20);
  });

  it('falls back to the product SKU and image and the first variant price for a product-only favorite', () => {
    const first = buildFavoriteVariantWith({ bc_calculated_price: priced(7) });
    const product = buildFavoriteProductWith({
      sku: 'PROD-1',
      imageUrl: 'https://img.example/prod.png',
      variants: [first, buildFavoriteVariantWith('WHATEVER_VALUES')],
      options: [],
    });
    const item = buildFavoriteItemWith({ productId: product.id, variantId: null });

    const [row] = hydrateRows(
      buildFavoriteListWith({ items: [item] }),
      { [product.id]: product },
      false,
    );

    expect(row).toMatchObject({
      sku: 'PROD-1',
      imageUrl: 'https://img.example/prod.png',
      price: 7,
      requiresOptions: false,
      cartVariantId: first.variant_id,
    });
  });

  it('hides the price when the catalog hides it for this buyer', () => {
    const product = buildFavoriteProductWith({ isPriceHidden: true });
    const item = buildFavoriteItemWith({ productId: product.id, variantId: null });

    const [row] = hydrateRows(
      buildFavoriteListWith({ items: [item] }),
      { [product.id]: product },
      false,
    );

    expect(row.price).toBeNull();
  });

  it('requires options for a product-only favorite of a product with options', () => {
    const product = buildFavoriteProductWith({
      options: [{ option_id: 1, display_name: 'Size', sort_order: 0, is_required: true }],
    });
    const item = buildFavoriteItemWith({ productId: product.id, variantId: null });

    const [row] = hydrateRows(
      buildFavoriteListWith({ items: [item] }),
      { [product.id]: product },
      false,
    );

    expect(row.requiresOptions).toBe(true);
  });

  it('does not require options when the favorite saved a variant of an option product', () => {
    const variant = buildFavoriteVariantWith('WHATEVER_VALUES');
    const product = buildFavoriteProductWith({
      variants: [variant],
      options: [{ option_id: 1, display_name: 'Size', sort_order: 0, is_required: true }],
    });
    const item = buildFavoriteItemWith({ productId: product.id, variantId: variant.variant_id });

    const [row] = hydrateRows(
      buildFavoriteListWith({ items: [item] }),
      { [product.id]: product },
      false,
    );

    expect(row.requiresOptions).toBe(false);
  });

  it('requires options when a modifier is required, even with a saved variant', () => {
    const variant = buildFavoriteVariantWith('WHATEVER_VALUES');
    const product = buildFavoriteProductWith({
      variants: [variant],
      modifiers: [{ required: true }],
    });
    const item = buildFavoriteItemWith({ productId: product.id, variantId: variant.variant_id });

    const [row] = hydrateRows(
      buildFavoriteListWith({ items: [item] }),
      { [product.id]: product },
      false,
    );

    expect(row.requiresOptions).toBe(true);
  });

  it('marks a variant the catalog disabled for purchase', () => {
    const variant = buildFavoriteVariantWith({ purchasing_disabled: true });
    const product = buildFavoriteProductWith({ variants: [variant] });
    const item = buildFavoriteItemWith({ productId: product.id, variantId: variant.variant_id });

    const [row] = hydrateRows(
      buildFavoriteListWith({ items: [item] }),
      { [product.id]: product },
      false,
    );

    expect(row.purchasable).toBe(false);
  });

  it('marks the row unavailable when the product is missing from the catalog response', () => {
    const item = buildFavoriteItemWith('WHATEVER_VALUES');

    expect(hydrateRows(buildFavoriteListWith({ items: [item] }), {}, false)).toEqual([
      {
        item,
        available: false,
        name: '',
        sku: '',
        imageUrl: PRODUCT_DEFAULT_IMAGE,
        price: null,
        productUrl: '',
        requiresOptions: false,
        purchasable: false,
        orderQuantityMinimum: 1,
        cartVariantId: null,
      },
    ]);
  });

  it('marks the row unavailable but keeps the product name when the saved variant is gone', () => {
    const product = buildFavoriteProductWith('WHATEVER_VALUES');
    const item = buildFavoriteItemWith({ productId: product.id, variantId: 999_999_999 });

    const [row] = hydrateRows(
      buildFavoriteListWith({ items: [item] }),
      { [product.id]: product },
      false,
    );

    expect(row).toMatchObject({ available: false, name: product.name, cartVariantId: null });
  });

  it('raises the quantity minimum to at least one', () => {
    const product = buildFavoriteProductWith({ orderQuantityMinimum: 0 });
    const item = buildFavoriteItemWith({ productId: product.id, variantId: null });

    const [row] = hydrateRows(
      buildFavoriteListWith({ items: [item] }),
      { [product.id]: product },
      false,
    );

    expect(row.orderQuantityMinimum).toBe(1);
  });
});

describe('planAddToCart', () => {
  it('builds one cart line per addable row at the catalog minimum with no option selection', () => {
    const row = buildFavoriteRowWith({ orderQuantityMinimum: 6 });

    expect(planAddToCart([row])).toEqual({
      lineItems: [
        {
          productId: row.item.productId,
          variantId: row.cartVariantId,
          quantity: 6,
          newSelectOptionList: [],
        },
      ],
      skipped: [],
    });
  });

  it('skips unavailable, options-required and not-purchasable rows with a reason each', () => {
    const unavailable = buildFavoriteRowWith({ available: false });
    const needsOptions = buildFavoriteRowWith({ requiresOptions: true });
    const disabled = buildFavoriteRowWith({ purchasable: false });
    const noVariant = buildFavoriteRowWith({ cartVariantId: null });
    const addable = buildFavoriteRowWith('WHATEVER_VALUES');

    const plan = planAddToCart([unavailable, needsOptions, disabled, noVariant, addable]);

    expect(plan.lineItems).toHaveLength(1);
    expect(plan.lineItems[0].productId).toBe(addable.item.productId);
    expect(plan.skipped).toEqual([
      { row: unavailable, reason: 'unavailable' },
      { row: needsOptions, reason: 'optionsRequired' },
      { row: disabled, reason: 'notPurchasable' },
      { row: noVariant, reason: 'unavailable' },
    ]);
  });
});
