import B3Request from '../../request/b3Fetch';

/**
 * BigCommerce Storefront GraphQL wishlists, scoped to the shopper by the session cookie
 * (the request is same-origin on Stencil). Shared with the theme's favorites star, which
 * reads and writes the same lists. Types are hand-written: there is no codegen for the
 * storefront schema (see ./base.ts). `graphqlBC` returns the raw envelope without
 * checking `errors`, so every function here does.
 */

export interface WishlistItemNode {
  entityId: number;
  productEntityId: number;
  variantEntityId: number | null;
}

export interface WishlistNode {
  entityId: number;
  name: string;
  isPublic: boolean;
  items: WishlistItemNode[];
}

export interface WishlistItemInput {
  productEntityId: number;
  variantEntityId?: number;
}

export class WishlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WishlistError';
  }
}

interface GraphqlEnvelope<T> {
  data?: T | null;
  errors?: { message: string }[];
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface Connection<T> {
  pageInfo: PageInfo;
  edges: { node: T }[];
}

interface RawWishlistNode {
  entityId: number;
  name: string;
  isPublic: boolean;
  items: Connection<WishlistItemNode>;
}

interface ListsData {
  customer: { wishlists: Connection<RawWishlistNode> } | null;
}

interface ListItemsData {
  customer: {
    wishlists: { edges: { node: { entityId: number; items: Connection<WishlistItemNode> } }[] };
  } | null;
}

interface ListSummary {
  entityId: number;
  name: string;
}

const PAGE_SIZE = 50;

const listsQuery = `query FavoritesLists($after: String) {
  customer {
    wishlists(first: ${PAGE_SIZE}, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          entityId
          name
          isPublic
          items(first: ${PAGE_SIZE}) {
            pageInfo { hasNextPage endCursor }
            edges { node { entityId productEntityId variantEntityId } }
          }
        }
      }
    }
  }
}`;

const listItemsQuery = `query FavoritesListItems($listId: Int!, $after: String) {
  customer {
    wishlists(filters: { entityIds: [$listId] }, first: 1) {
      edges {
        node {
          entityId
          items(first: ${PAGE_SIZE}, after: $after) {
            pageInfo { hasNextPage endCursor }
            edges { node { entityId productEntityId variantEntityId } }
          }
        }
      }
    }
  }
}`;

const createListMutation = `mutation CreateFavoritesList($name: String!) {
  wishlist {
    createWishlist(input: { name: $name, isPublic: false }) { result { entityId name } }
  }
}`;

const renameListMutation = `mutation RenameFavoritesList($listId: Int!, $name: String!) {
  wishlist {
    updateWishlist(input: { entityId: $listId, data: { name: $name } }) { result { entityId name } }
  }
}`;

const addItemsMutation = `mutation AddFavoritesItems($listId: Int!, $items: [WishlistItemInput!]!) {
  wishlist {
    addWishlistItems(input: { entityId: $listId, items: $items }) { result { entityId } }
  }
}`;

const deleteItemsMutation = `mutation DeleteFavoritesItems($listId: Int!, $itemIds: [Int!]!) {
  wishlist {
    deleteWishlistItems(input: { entityId: $listId, itemEntityIds: $itemIds }) { result { entityId } }
  }
}`;

const deleteListsMutation = `mutation DeleteFavoritesLists($listIds: [Int!]!) {
  wishlist {
    deleteWishlists(input: { entityIds: $listIds }) { result }
  }
}`;

const post = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
  const response: GraphqlEnvelope<T> = await B3Request.graphqlBC({ query, variables });

  if (response?.errors?.length) {
    throw new WishlistError(response.errors[0].message);
  }

  if (!response?.data) {
    throw new WishlistError('The storefront API returned no data');
  }

  return response.data;
};

const nodesOf = <T>(connection: Connection<T>): T[] => connection.edges.map((edge) => edge.node);

const fetchRemainingItems = async (
  listId: number,
  pageInfo: PageInfo,
  collected: WishlistItemNode[],
): Promise<WishlistItemNode[]> => {
  if (!pageInfo.hasNextPage) {
    return collected;
  }

  const data = await post<ListItemsData>(listItemsQuery, { listId, after: pageInfo.endCursor });
  const list = data.customer?.wishlists.edges[0]?.node;

  if (!list) {
    return collected;
  }

  return fetchRemainingItems(listId, list.items.pageInfo, [...collected, ...nodesOf(list.items)]);
};

const fetchLists = async (
  after: string | null,
  collected: WishlistNode[],
): Promise<WishlistNode[] | null> => {
  const data = await post<ListsData>(listsQuery, { after });

  if (!data.customer) {
    return null;
  }

  const { wishlists } = data.customer;
  const page = await Promise.all(
    nodesOf(wishlists).map(async (node) => ({
      entityId: node.entityId,
      name: node.name,
      isPublic: node.isPublic,
      items: await fetchRemainingItems(node.entityId, node.items.pageInfo, nodesOf(node.items)),
    })),
  );
  const all = [...collected, ...page];

  return wishlists.pageInfo.hasNextPage ? fetchLists(wishlists.pageInfo.endCursor, all) : all;
};

/** Every list with every item, or null when the storefront session has no customer. */
export const getCustomerWishlists = (): Promise<WishlistNode[] | null> => fetchLists(null, []);

export const createWishlist = async (name: string): Promise<ListSummary> => {
  const data = await post<{ wishlist: { createWishlist: { result: ListSummary } } }>(
    createListMutation,
    { name },
  );

  return data.wishlist.createWishlist.result;
};

export const updateWishlistName = async (listId: number, name: string): Promise<ListSummary> => {
  const data = await post<{ wishlist: { updateWishlist: { result: ListSummary } } }>(
    renameListMutation,
    { listId, name },
  );

  return data.wishlist.updateWishlist.result;
};

export const addWishlistItems = async (
  listId: number,
  items: WishlistItemInput[],
): Promise<void> => {
  await post(addItemsMutation, { listId, items });
};

export const deleteWishlistItems = async (listId: number, itemIds: number[]): Promise<void> => {
  await post(deleteItemsMutation, { listId, itemIds });
};

export const deleteWishlists = async (listIds: number[]): Promise<void> => {
  await post(deleteListsMutation, { listIds });
};
