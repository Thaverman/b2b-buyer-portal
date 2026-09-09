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
