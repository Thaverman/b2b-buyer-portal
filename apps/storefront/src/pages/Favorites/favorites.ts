import { PRODUCT_DEFAULT_IMAGE } from '@/constants';
import type { ProductSearch } from '@/shared/service/b2b/graphql/product';
import type { WishlistNode } from '@/shared/service/bc/graphql/wishlist';

export interface ItemRef {
  productId: number;
  variantId: number | null;
}

export interface FavoriteItem extends ItemRef {
  id: number;
}

/** The theme's normalized list shape (spec §2.2), so both sides talk about the same thing. */
export interface FavoriteList {
  id: number;
  name: string;
  isPublic: boolean;
  items: FavoriteItem[];
}

export const normalizeLists = (nodes: WishlistNode[]): FavoriteList[] =>
  nodes.map((node) => ({
    id: node.entityId,
    name: node.name,
    isPublic: node.isPublic,
    items: node.items.map((item) => ({
      id: item.entityId,
      productId: item.productEntityId,
      variantId: item.variantEntityId ?? null,
    })),
  }));

/** A product-only row and a product+variant row are distinct favorites, as in the API. */
export const itemKey = ({ productId, variantId }: ItemRef): string =>
  `${productId}:${variantId ?? ''}`;

const listHas = (list: FavoriteList, key: string) =>
  list.items.some((item) => itemKey(item) === key);

/** Ids of the lists that contain exactly this product-and-variant pair. */
export const membership = (lists: FavoriteList[], ref: ItemRef): Set<number> => {
  const key = itemKey(ref);

  return new Set(lists.filter((list) => listHas(list, key)).map((list) => list.id));
};

export interface SaveToListsPlan {
  adds: { listId: number }[];
  removes: { listId: number; itemId: number }[];
}

/** Turns the picker's checkbox state into writes. An empty selection removes the product everywhere. */
export const planSaveToLists = ({
  lists,
  ref,
  selected,
}: {
  lists: FavoriteList[];
  ref: ItemRef;
  selected: Set<number>;
}): SaveToListsPlan => {
  const key = itemKey(ref);

  return {
    adds: lists
      .filter((list) => selected.has(list.id) && !listHas(list, key))
      .map((list) => ({ listId: list.id })),
    removes: lists
      .filter((list) => !selected.has(list.id))
      .flatMap((list) =>
        list.items
          .filter((item) => itemKey(item) === key)
          .map((item) => ({ listId: list.id, itemId: item.id })),
      ),
  };
};

export const isEmptyPlan = ({ adds, removes }: SaveToListsPlan) =>
  adds.length === 0 && removes.length === 0;

// Not exported: knip fails the build on exports with no consumer outside this file.
type MergeTarget = { kind: 'existing'; listId: number; name: string } | { kind: 'create' };

export interface GuestMergePlan {
  target: MergeTarget;
  rows: ItemRef[];
}

const dedupe = (refs: ItemRef[]): ItemRef[] => {
  const seen = new Set<string>();

  return refs.flatMap(({ productId, variantId }) => {
    const key = itemKey({ productId, variantId });

    if (seen.has(key)) {
      return [];
    }

    seen.add(key);

    return [{ productId, variantId }];
  });
};

/**
 * Guest → customer merge (spec §8). Target: the default list if it still exists, else the
 * first list, else create one (the caller names it "My Favorites"). Rows: the guest rows
 * missing from the target. `null` when the guest store is empty.
 */
export const planGuestMerge = ({
  guest,
  lists,
  defaultListId,
}: {
  guest: ItemRef[];
  lists: FavoriteList[];
  defaultListId: number | null;
}): GuestMergePlan | null => {
  if (guest.length === 0) {
    return null;
  }

  const rows = dedupe(guest);
  const target = lists.find((list) => list.id === defaultListId) ?? lists[0];

  if (!target) {
    return { target: { kind: 'create' }, rows };
  }

  return {
    target: { kind: 'existing', listId: target.id, name: target.name },
    rows: rows.filter((row) => !listHas(target, itemKey(row))),
  };
};

export type ProductsById = Record<number, ProductSearch | undefined>;

export interface FavoriteRow {
  item: FavoriteItem;
  /** False when the product, or the saved variant, is no longer in the catalog response. */
  available: boolean;
  name: string;
  sku: string;
  imageUrl: string;
  /** null = hidden for this buyer, or unknown. */
  price: number | null;
  productUrl: string;
  /** Needs the product page: a required modifier, or options with no saved variant. */
  requiresOptions: boolean;
  purchasable: boolean;
  orderQuantityMinimum: number;
  /** The variant a cart line needs: the saved one, else the product's first (base) variant. */
  cartVariantId: number | null;
}

type Variant = ProductSearch['variants'][number];

const hasRequiredModifier = (modifiers: unknown[]): boolean =>
  modifiers.some(
    (modifier) =>
      typeof modifier === 'object' &&
      modifier !== null &&
      (modifier as { required?: unknown }).required === true,
  );

const priceOf = (variant: Variant | undefined, showInclusiveTaxPrice: boolean): number | null => {
  if (!variant) {
    return null;
  }

  const { tax_inclusive: inclusive, tax_exclusive: exclusive } = variant.bc_calculated_price;

  return showInclusiveTaxPrice ? inclusive : exclusive;
};

const unavailableRow = (item: FavoriteItem, product?: ProductSearch): FavoriteRow => ({
  item,
  available: false,
  name: product?.name ?? '',
  sku: product?.sku ?? '',
  imageUrl: product?.imageUrl || PRODUCT_DEFAULT_IMAGE,
  price: null,
  productUrl: product?.productUrl ?? '',
  requiresOptions: false,
  purchasable: false,
  orderQuantityMinimum: 1,
  cartVariantId: null,
});

/** Joins a list's items with the productsSearch results (spec §8). */
export const hydrateRows = (
  list: FavoriteList,
  productsById: ProductsById,
  showInclusiveTaxPrice: boolean,
): FavoriteRow[] =>
  list.items.map((item) => {
    const product = productsById[item.productId];

    if (!product) {
      return unavailableRow(item);
    }

    const savedVariant =
      item.variantId === null
        ? undefined
        : product.variants.find((variant) => variant.variant_id === item.variantId);

    if (item.variantId !== null && !savedVariant) {
      return unavailableRow(item, product);
    }

    const variant = savedVariant ?? product.variants[0];

    return {
      item,
      available: true,
      name: product.name,
      sku: savedVariant?.sku ?? product.sku,
      imageUrl: savedVariant?.image_url || product.imageUrl || PRODUCT_DEFAULT_IMAGE,
      price: product.isPriceHidden ? null : priceOf(variant, showInclusiveTaxPrice),
      productUrl: product.productUrl,
      requiresOptions:
        hasRequiredModifier(product.modifiers) ||
        (item.variantId === null && product.options.length > 0),
      purchasable: variant ? !variant.purchasing_disabled : false,
      orderQuantityMinimum: Math.max(1, product.orderQuantityMinimum || 1),
      cartVariantId: variant?.variant_id ?? null,
    };
  });

// CartLineItem and SkipReason stay module-internal: knip fails the build on unused exports.
/** The shape `createOrUpdateExistingCart` reads: productId, variantId, quantity, empty option selection. */
interface CartLineItem {
  productId: number;
  variantId: number;
  quantity: number;
  newSelectOptionList: never[];
}

type SkipReason = 'unavailable' | 'optionsRequired' | 'notPurchasable';

export interface AddToCartPlan {
  lineItems: CartLineItem[];
  skipped: { row: FavoriteRow; reason: SkipReason }[];
}

const skipReasonFor = (row: FavoriteRow): SkipReason | null => {
  if (!row.available || row.cartVariantId === null) {
    return 'unavailable';
  }

  if (row.requiresOptions) {
    return 'optionsRequired';
  }

  if (!row.purchasable) {
    return 'notPurchasable';
  }

  return null;
};

/** Quantity is fixed: 1 raised to the catalog minimum (spec §1). */
export const planAddToCart = (rows: FavoriteRow[]): AddToCartPlan => ({
  lineItems: rows.flatMap((row) =>
    skipReasonFor(row) === null && row.cartVariantId !== null
      ? [
          {
            productId: row.item.productId,
            variantId: row.cartVariantId,
            quantity: row.orderQuantityMinimum,
            newSelectOptionList: [],
          },
        ]
      : [],
  ),
  skipped: rows.flatMap((row) => {
    const reason = skipReasonFor(row);

    return reason === null ? [] : [{ row, reason }];
  }),
});
