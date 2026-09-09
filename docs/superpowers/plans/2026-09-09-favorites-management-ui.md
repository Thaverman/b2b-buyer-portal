# Favorites Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `#/favorites` page to the buyer portal where a signed-in customer manages the BigCommerce wishlists the Stencil favorites star writes: lists (create, rename, delete), items (image, name, SKU, price, remove, copy or move between lists) and add-to-cart (one item or the whole list), plus the guest-to-customer merge.

**Architecture:** A thin, paged storefront wishlist service (`src/shared/service/bc/graphql/wishlist.ts`) under a page-owned module (`src/pages/Favorites/`): a storage-contract adapter for the three theme browser keys, pure planning functions (normalize, save-to-lists diff, guest merge, cart plan, row hydration), react-query hooks, and MUI components. Product rows are hydrated through the B2B `productsSearch` call the portal already uses; cart adds go through `createOrUpdateExistingCart`. Everything is gated by the theme-emitted `window.BC_CONTEXT.favorites.enabled`, Stencil-only, hidden while masquerading.

**Tech Stack:** React 18, TypeScript, MUI 5, `@tanstack/react-query` v5, react-router 6 (`useSearchParams`), react-intl via `useB3Lang`, Vitest + Testing Library + MSW (`graphql.query` / `graphql.mutation` handlers), `tests/builder.ts` builders with faker.

**Spec:** `docs/superpowers/specs/2026-09-09-favorites-management-ui-design.md` (read it first; section numbers below refer to it).

## Global Constraints

- **Working directory:** every command runs from `apps/storefront/`. Paths below are relative to `apps/storefront/` unless they start with `docs/`.
- **Copy vocabulary:** customer-facing strings say "favorites" and "list", never "wishlist". Code may say `wishlist` where it names the BigCommerce API.
- **Default list name:** `My Favorites` (i18n key `favorites.defaultListName`), identical to the theme.
- **Browser keys (theme contract, exact):** `favorites_guest` (localStorage, `{ value: [{ productId, variantId|null, addedAt }], expiry: null }`), `favorites_lists` (sessionStorage, removed after every mutation), `favorites_default_list` (localStorage, list id as a string).
- **Host flag:** `window.BC_CONTEXT.favorites = { enabled: boolean }`; absent or `enabled: false` = off. Also requires `platform === 'bigcommerce'` and not agenting.
- **Roles:** Admin, Senior buyer, Junior buyer, Custom role, B2C. No guests, no sales reps.
- **Quantities:** fixed, `max(1, orderQuantityMinimum)`; no editing.
- **Repo rules (AGENTS.md):** no new Redux slice or Context; Redux read only at the top of `index.tsx`; `useQuery`/`useMutation` for data; builders for all test data; no `react/jsx-props-no-spreading`, no `any`, no `console`, no destructuring-assignment violations; imports use `@/` and `tests/` aliases; `lodash-es`; named `@mui/icons-material` imports (none needed here).
- **Web storage exception:** `src/pages/Favorites/storage.ts` is the only file that touches `localStorage`/`sessionStorage`; its header comment states the interop justification (spec §7).
- **Commit format:** `type: B2B-0000 Short description` (types used here: `feat`, `test`, `docs`) with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Stage only your own files. `en.json` currently carries another session's uncommitted hunk (a removed `paymentMethods.title` line): when you commit `en.json`, stage only your added lines (`git add -p` is unavailable non-interactively; instead run `git diff src/lib/lang/locales/en.json > /tmp/en.patch`, edit the patch down to your hunks, `git apply --cached /tmp/en.patch`).
- **Lint on intermediate commits:** `yarn lint:knip` reports unused exports until their consumers land (Task 8 onward). Per task run `yarn tsc --noEmit` and `yarn lint:eslint`; the full `yarn lint` (with knip and dependency-cruiser) is a gate in Task 14 only.
- **Negative control for every new test:** after a test passes, revert the production line it covers (or comment it out), rerun that single test, confirm it fails, restore the line. This repo has shipped vacuous tests three times; do not skip this.
- **Full-suite runs are flaky under load** (see `.claude/agent-memory/storefront-shared/MEMORY.md`). Run scoped suites: `yarn test --run src/pages/Favorites src/shared/service/bc/graphql/wishlist.test.ts src/shared/routeList.test.ts src/shared/routeList.platform.test.ts`.

---

## File Structure

```
apps/storefront/src/
├── index.d.ts                                   # MODIFY: BC_CONTEXT.favorites typing
├── shared/service/bc/graphql/wishlist.ts        # CREATE: 6 storefront operations, paged, typed, errors checked
├── shared/service/bc/graphql/wishlist.test.ts   # CREATE: MSW tests for the service
├── shared/service/bc/index.ts                   # MODIFY: export * from './graphql/wishlist'
├── shared/routeList.ts                          # MODIFY: route entry + gate clause
├── shared/routeList.test.ts                     # MODIFY: /favorites gate matrix
├── shared/routeList.platform.test.ts            # CREATE: /favorites hidden on non-bigcommerce platforms
├── shared/routes/config.ts                      # MODIFY: favoritesPermissions
├── shared/routes/index.tsx                      # MODIFY: lazy Favorites in routesMap
├── lib/lang/locales/en.json                     # MODIFY: global.navMenu.favorites + favorites.* keys
└── pages/Favorites/
    ├── index.tsx                  # page: gate, queries, URL list selection, merge trigger, dialogs
    ├── index.test.tsx             # desktop integration tests
    ├── index.mobile.test.tsx      # mobile card layout test
    ├── index.platform.test.tsx    # unavailable on non-bigcommerce platforms
    ├── api.ts                     # isFavoritesAvailable, fetchFavoriteProducts (chunked productsSearch)
    ├── api.test.ts
    ├── storage.ts                 # theme storage-contract adapter (ONLY web-storage code)
    ├── storage.test.ts
    ├── favorites.ts               # pure: normalizeLists, itemKey, membership, planSaveToLists,
    │                              #       isEmptyPlan, planGuestMerge, hydrateRows, planAddToCart
    ├── favorites.test.ts
    ├── analytics.ts               # trackAddToWishlist → pushDataLayerEvent
    ├── useFavoriteLists.ts        # lists query (+ query key)
    ├── useFavoriteProducts.ts     # products query
    ├── useFavoriteActions.ts      # every mutation, toasts, GA4, cache invalidation
    └── components/
        ├── EmptyState.tsx
        ├── ListTabs.tsx
        ├── ListToolbar.tsx
        ├── ProductSummary.tsx     # image + name + unavailable chip (table and card)
        ├── RowActions.tsx         # Add to cart / Choose options / Save to lists / Remove
        ├── FavoriteItemsTable.tsx # desktop
        ├── FavoriteItemCard.tsx   # mobile
        ├── ListNameDialog.tsx     # create / rename
        └── SaveToListsDialog.tsx  # the picker
apps/storefront/tests/
├── favoritesBuilders/index.ts                   # CREATE: builders shared by the favorites tests
└── test-utils.tsx                               # MODIFY: export * from 'tests/favoritesBuilders'
```

Ownership: `storefront-shared` owns `shared/**` and `index.d.ts`; `storefront-pages` owns `pages/Favorites/**`; `storefront-tests` owns `tests/**` and `*.test.*`.

---

### Task 0: Prove the portal's storefront token authorizes wishlist operations (spike, manual)

Spec §12.1. Nothing else in this plan changes if this passes; if it fails, Task 2 gains the fallback described in Step 4. Do this first so the fallback decision is known before the service is written.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-09-favorites-management-ui-design.md` (§12.1, record the result)

- [ ] **Step 1: Open the SSW sandbox storefront signed in as a test customer, with the portal loaded**

Sign in through the storefront (`/login.php`, which the portal takes over). After login you are on the portal (`account.php#/…`). Open the browser devtools console on that page. The portal's JS realm is the top window, so the console's `window` is the right one.

- [ ] **Step 2: Run the customer-scoped read with the portal's token**

```js
// redux-persist stores each slice field as its own JSON string
const token = JSON.parse(JSON.parse(sessionStorage.getItem('persist:company')).tokens).bcGraphqlToken;
const gql = (query, variables) =>
  fetch('/graphql', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  }).then((r) => r.json());

await gql(`query { customer { entityId wishlists(first: 50) {
  pageInfo { hasNextPage endCursor }
  edges { node { entityId name isPublic items(first: 50) {
    pageInfo { hasNextPage endCursor }
    edges { node { entityId productEntityId variantEntityId } } } } } } } }`);
```

Expected: `data.customer.entityId` is the signed-in customer's id and `wishlists.edges` lists their lists (possibly empty). **Failure signatures:** `data.customer === null`, or an `errors[]` entry mentioning authorization.

- [ ] **Step 3: Verify the schema fields the service relies on, then round-trip a mutation**

```js
await gql(`{ __type(name: "WishlistFiltersInput") { inputFields { name } } }`);
await gql(`{ __type(name: "Customer") { fields { name args { name } } } }`);
// expected: WishlistFiltersInput has entityIds; Customer.wishlists has args filters, first, after

const created = await gql(
  `mutation ($name: String!) { wishlist { createWishlist(input: { name: $name, isPublic: false }) { result { entityId name } } } }`,
  { name: 'Portal token check' },
);
const id = created.data.wishlist.createWishlist.result.entityId;
await gql(`mutation ($ids: [Int!]!) { wishlist { deleteWishlists(input: { entityIds: $ids }) { result } } }`, { ids: [id] });
```

Expected: the create returns an `entityId`, the delete returns `result` without errors, and the customer's lists are as they were.

- [ ] **Step 4: Record the outcome in the spec and choose the path**

Append to spec §12.1 a dated paragraph: "Verified YYYY-MM-DD on sandbox.storesupply.com: read ✓/✗, create+delete ✓/✗, `WishlistFiltersInput.entityIds` present ✓/✗." If any field name differs from §6.1, correct §6.1 and use the corrected names in Task 2.

If the read or mutation **fails** with the portal token, the fallback is: the theme emits `window.BC_CONTEXT.favorites = { enabled: true, storefrontToken: '{{settings.storefront_api.token}}' }`; in Task 1 add `storefrontToken?: string` to the typing; in Task 2's `post()` helper replace the `B3Request.graphqlBC` call with a direct `b3Fetch` to `${BigCommerceStorefrontAPIBaseURL}/graphql` using `Authorization: Bearer ${window.BC_CONTEXT.favorites.storefrontToken}` when that field is present (import `b3Fetch` from `@/shared/service/request/fetch` and `BigCommerceStorefrontAPIBaseURL` from `@/utils/basicConfig`). Record which path was taken in §12.1.

- [ ] **Step 5: Commit the spec note**

```bash
git add docs/superpowers/specs/2026-09-09-favorites-management-ui-design.md
git commit -m "docs: B2B-0000 Record the favorites storefront-token spike result

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1: Host flag typing and the availability gate

Spec §4.1, §4.2.

**Files:**
- Modify: `src/index.d.ts` (inside `Window.BC_CONTEXT`, after the `loyalty` block)
- Create: `src/pages/Favorites/api.ts`
- Create: `src/pages/Favorites/api.test.ts`

**Interfaces:**
- Produces: `isFavoritesAvailable(): boolean` from `@/pages/Favorites/api`; `window.BC_CONTEXT.favorites?: { enabled: boolean }`.

- [ ] **Step 1: Write the failing test**

`src/pages/Favorites/api.test.ts`:

```ts
import { isFavoritesAvailable } from './api';

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test --run src/pages/Favorites/api.test.ts`
Expected: FAIL, "Cannot find module './api'" (and a type error on `favorites` in `BC_CONTEXT`).

- [ ] **Step 3: Add the typing and the gate**

In `src/index.d.ts`, inside the `BC_CONTEXT?: { … }` object, directly after the closing `};` of the `loyalty?: { … }` block, add:

```ts
      /**
       * Gates the /favorites page; absent or enabled:false = feature off. Emitted by the
       * theme from the same theme setting that turns on the Stencil favorites star.
       */
      favorites?: {
        enabled: boolean;
      };
```

Create `src/pages/Favorites/api.ts`:

```ts
import { platform } from '@/utils/basicConfig';

// Stencil-only: the favorites browser keys are shared with the theme on the same origin,
// and the storefront session cookie is what scopes the wishlist calls to the customer.
export const isFavoritesAvailable = () =>
  platform === 'bigcommerce' && Boolean(window.BC_CONTEXT?.favorites?.enabled);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test --run src/pages/Favorites/api.test.ts`
Expected: PASS (4 tests).

Negative control: change `Boolean(window.BC_CONTEXT?.favorites?.enabled)` to `true`, rerun, expect two failures, restore.

- [ ] **Step 5: Type-check and commit**

```bash
yarn tsc --noEmit
git add src/index.d.ts src/pages/Favorites/api.ts src/pages/Favorites/api.test.ts
git commit -m "feat: B2B-0000 Add the favorites host flag typing and availability gate

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Storefront wishlist service

Spec §6. Six operations over `B3Request.graphqlBC`, paged, with the `errors` envelope checked (the client does not check it).

**Files:**
- Create: `src/shared/service/bc/graphql/wishlist.ts`
- Create: `src/shared/service/bc/graphql/wishlist.test.ts`
- Modify: `src/shared/service/bc/index.ts` (append one export line)
- Create: `tests/favoritesBuilders/index.ts`
- Modify: `tests/test-utils.tsx` (append one export line)

**Interfaces:**
- Produces (from `@/shared/service/bc`):
  - `interface WishlistItemNode { entityId: number; productEntityId: number; variantEntityId: number | null }`
  - `interface WishlistNode { entityId: number; name: string; isPublic: boolean; items: WishlistItemNode[] }`
  - `interface WishlistItemInput { productEntityId: number; variantEntityId?: number }`
  - `class WishlistError extends Error`
  - `getCustomerWishlists(): Promise<WishlistNode[] | null>` (`null` = signed out)
  - `createWishlist(name: string): Promise<{ entityId: number; name: string }>`
  - `updateWishlistName(listId: number, name: string): Promise<{ entityId: number; name: string }>`
  - `addWishlistItems(listId: number, items: WishlistItemInput[]): Promise<void>`
  - `deleteWishlistItems(listId: number, itemIds: number[]): Promise<void>`
  - `deleteWishlists(listIds: number[]): Promise<void>`
- Produces (from `tests/test-utils`): `buildWishlistItemNodeWith`, `buildWishlistNodeWith`.

- [ ] **Step 1: Create the shared test builders**

`tests/favoritesBuilders/index.ts`:

```ts
import { faker } from '@faker-js/faker';
import { builder } from 'tests/builder';

import { WishlistItemNode, WishlistNode } from '@/shared/service/bc/graphql/wishlist';

export const buildWishlistItemNodeWith = builder<WishlistItemNode>(() => ({
  entityId: faker.number.int({ min: 1, max: 1_000_000 }),
  productEntityId: faker.number.int({ min: 1, max: 1_000_000 }),
  variantEntityId: null,
}));

export const buildWishlistNodeWith = builder<WishlistNode>(() => ({
  entityId: faker.number.int({ min: 1, max: 1_000_000 }),
  name: faker.commerce.department(),
  isPublic: false,
  items: [],
}));
```

Append to `tests/test-utils.tsx`, after `export * from 'tests/quoteBuilders';`:

```ts
export * from 'tests/favoritesBuilders';
```

- [ ] **Step 2: Write the failing service tests**

`src/shared/service/bc/graphql/wishlist.test.ts`:

```ts
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

const lastPage = { hasNextPage: false, endCursor: null };

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
      HttpResponse.json({ data: { customer: { wishlists: connection(lists.map(rawList)) } } }),
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
      { productEntityId: faker.number.int({ min: 1 }), variantEntityId: faker.number.int({ min: 1 }) },
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

    await expect(createWishlist('x')).rejects.toThrow(WishlistError);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn test --run src/shared/service/bc/graphql/wishlist.test.ts`
Expected: FAIL, "Cannot find module './wishlist'".

- [ ] **Step 4: Write the service**

`src/shared/service/bc/graphql/wishlist.ts`:

```ts
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
```

Append to `src/shared/service/bc/index.ts`:

```ts
export * from './graphql/wishlist';
```

If Task 0 chose the fallback token path, `post()` instead builds the request itself:

```ts
import b3Fetch from '../../request/fetch';
import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';
// …
const post = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
  const hostToken = window.BC_CONTEXT?.favorites?.storefrontToken;
  const response: GraphqlEnvelope<T> = hostToken
    ? await b3Fetch(`${BigCommerceStorefrontAPIBaseURL}/graphql`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${hostToken}` },
        body: JSON.stringify({ query, variables }),
      })
    : await B3Request.graphqlBC({ query, variables });
  // … unchanged checks
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn test --run src/shared/service/bc/graphql/wishlist.test.ts`
Expected: PASS (12 tests).

Negative controls: (a) in `fetchLists`, return `all` unconditionally instead of following `hasNextPage`; the wishlists-cursor test must fail. (b) In `post`, remove the `errors` check; the two error tests must fail. Restore both.

- [ ] **Step 6: Type-check, lint the new files, commit**

```bash
yarn tsc --noEmit
yarn eslint src/shared/service/bc/graphql/wishlist.ts src/shared/service/bc/graphql/wishlist.test.ts tests/favoritesBuilders/index.ts tests/test-utils.tsx
git add src/shared/service/bc/graphql/wishlist.ts src/shared/service/bc/graphql/wishlist.test.ts src/shared/service/bc/index.ts tests/favoritesBuilders/index.ts tests/test-utils.tsx
git commit -m "feat: B2B-0000 Add the paged storefront wishlist service

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Storage-contract adapter

Spec §7. The only module touching web storage; reads and writes the theme's three keys.

**Files:**
- Create: `src/pages/Favorites/storage.ts`
- Create: `src/pages/Favorites/storage.test.ts`
- Modify: `tests/favoritesBuilders/index.ts` (add `buildGuestFavoriteWith`)

**Interfaces:**
- Produces (from `./storage`): `interface GuestFavorite { productId: number; variantId: number | null; addedAt: number }`, `readGuestFavorites(): GuestFavorite[]`, `clearGuestFavorites(): void`, `getDefaultListId(): number | null`, `setDefaultListId(listId: number): void`, `clearDefaultListId(): void`, `invalidateListsCache(): void`.
- Produces (from `tests/test-utils`): `buildGuestFavoriteWith`.

- [ ] **Step 1: Add the guest builder**

Append to `tests/favoritesBuilders/index.ts` (add the import next to the existing ones):

```ts
import { GuestFavorite } from '@/pages/Favorites/storage';

export const buildGuestFavoriteWith = builder<GuestFavorite>(() => ({
  productId: faker.number.int({ min: 1, max: 1_000_000_000 }),
  variantId: null,
  addedAt: faker.date.recent().getTime(),
}));
```

- [ ] **Step 2: Write the failing tests**

`src/pages/Favorites/storage.test.ts`:

```ts
import { buildGuestFavoriteWith, faker } from 'tests/test-utils';

import {
  clearDefaultListId,
  clearGuestFavorites,
  getDefaultListId,
  invalidateListsCache,
  readGuestFavorites,
  setDefaultListId,
} from './storage';

// The theme's storage-utils wrapper.
const wrap = (value: unknown, expiry: number | null = null) => JSON.stringify({ value, expiry });

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('readGuestFavorites', () => {
  it('reads the rows the theme saved for a guest', () => {
    const rows = [
      buildGuestFavoriteWith({ variantId: null }),
      buildGuestFavoriteWith({ variantId: faker.number.int({ min: 1 }) }),
    ];
    window.localStorage.setItem('favorites_guest', wrap(rows));

    expect(readGuestFavorites()).toEqual(rows);
  });

  it('is empty when nothing was saved', () => {
    expect(readGuestFavorites()).toEqual([]);
  });

  it('is empty when the stored value is not JSON, not wrapped, or not an array', () => {
    window.localStorage.setItem('favorites_guest', '{not json');
    expect(readGuestFavorites()).toEqual([]);

    window.localStorage.setItem(
      'favorites_guest',
      JSON.stringify([buildGuestFavoriteWith('WHATEVER_VALUES')]),
    );
    expect(readGuestFavorites()).toEqual([]);

    window.localStorage.setItem('favorites_guest', wrap({ productId: 1 }));
    expect(readGuestFavorites()).toEqual([]);
  });

  it('is empty once the wrapper has expired', () => {
    window.localStorage.setItem(
      'favorites_guest',
      wrap([buildGuestFavoriteWith('WHATEVER_VALUES')], Date.now() - 1),
    );

    expect(readGuestFavorites()).toEqual([]);
  });

  it('keeps rows with a future expiry', () => {
    const row = buildGuestFavoriteWith('WHATEVER_VALUES');
    window.localStorage.setItem('favorites_guest', wrap([row], Date.now() + 60_000));

    expect(readGuestFavorites()).toEqual([row]);
  });

  it('drops rows without a numeric productId and normalizes a missing variantId to null', () => {
    const productId = faker.number.int({ min: 1 });
    window.localStorage.setItem(
      'favorites_guest',
      wrap([{ productId: 'abc' }, { productId, addedAt: 5 }, 'junk']),
    );

    expect(readGuestFavorites()).toEqual([{ productId, variantId: null, addedAt: 5 }]);
  });

  it('reads as empty when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readGuestFavorites()).toEqual([]);
    expect(getDefaultListId()).toBeNull();
  });
});

describe('clearGuestFavorites', () => {
  it('writes an empty wrapper so the theme reads "no guest favorites"', () => {
    window.localStorage.setItem('favorites_guest', wrap([buildGuestFavoriteWith('WHATEVER_VALUES')]));

    clearGuestFavorites();

    expect(JSON.parse(window.localStorage.getItem('favorites_guest') ?? '')).toEqual({
      value: [],
      expiry: null,
    });
  });
});

describe('default list id', () => {
  it('round-trips the id as a string', () => {
    setDefaultListId(42);

    expect(window.localStorage.getItem('favorites_default_list')).toBe('42');
    expect(getDefaultListId()).toBe(42);
  });

  it('is null when absent or not a whole number', () => {
    expect(getDefaultListId()).toBeNull();

    window.localStorage.setItem('favorites_default_list', 'forty-two');
    expect(getDefaultListId()).toBeNull();
  });

  it('clears the key', () => {
    setDefaultListId(7);

    clearDefaultListId();

    expect(window.localStorage.getItem('favorites_default_list')).toBeNull();
  });
});

describe('invalidateListsCache', () => {
  it('removes the theme lists cache from session storage', () => {
    window.sessionStorage.setItem('favorites_lists', wrap([], Date.now() + 1000));

    invalidateListsCache();

    expect(window.sessionStorage.getItem('favorites_lists')).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn test --run src/pages/Favorites/storage.test.ts`
Expected: FAIL, "Cannot find module './storage'".

- [ ] **Step 4: Write the adapter**

`src/pages/Favorites/storage.ts`:

```ts
/**
 * Adapter for the Stencil theme's favorites browser keys (spec §2.2, §7).
 *
 * This is the ONLY portal module that touches localStorage/sessionStorage for favorites,
 * and it is a deliberate exception to the repo rule against web storage for state: these
 * keys are another system's storage (the theme's favorites star, same origin). They are
 * read and written through this adapter and never used as a React state source. Values
 * use the theme's storage-utils `{ value, expiry }` wrapper.
 */

const GUEST_KEY = 'favorites_guest';
const LISTS_CACHE_KEY = 'favorites_lists';
const DEFAULT_LIST_KEY = 'favorites_default_list';

export interface GuestFavorite {
  productId: number;
  variantId: number | null;
  addedAt: number;
}

interface Wrapped {
  value: unknown;
  expiry: unknown;
}

const isWrapped = (parsed: unknown): parsed is Wrapped =>
  typeof parsed === 'object' && parsed !== null && 'value' in parsed;

// Storage can throw (private windows, blocked site data); a throw reads as "nothing there".
const readWrappedValue = (storage: Storage, key: string): unknown => {
  try {
    const raw = storage.getItem(key);

    if (!raw) {
      return undefined;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!isWrapped(parsed)) {
      return undefined;
    }

    if (typeof parsed.expiry === 'number' && parsed.expiry <= Date.now()) {
      return undefined;
    }

    return parsed.value;
  } catch {
    return undefined;
  }
};

const write = (action: () => void) => {
  try {
    action();
  } catch {
    // best effort: the theme tolerates a missing key
  }
};

const toGuestFavorite = (row: unknown): GuestFavorite[] => {
  if (typeof row !== 'object' || row === null) {
    return [];
  }

  const { productId, variantId, addedAt } = row as Record<string, unknown>;

  if (typeof productId !== 'number' || !Number.isFinite(productId)) {
    return [];
  }

  return [
    {
      productId,
      variantId: typeof variantId === 'number' ? variantId : null,
      addedAt: typeof addedAt === 'number' ? addedAt : 0,
    },
  ];
};

export const readGuestFavorites = (): GuestFavorite[] => {
  const value = readWrappedValue(window.localStorage, GUEST_KEY);

  return Array.isArray(value) ? value.flatMap(toGuestFavorite) : [];
};

/** Writes an empty wrapper rather than removing the key, so either style of theme reader sees "empty". */
export const clearGuestFavorites = () =>
  write(() =>
    window.localStorage.setItem(GUEST_KEY, JSON.stringify({ value: [], expiry: null })),
  );

export const getDefaultListId = (): number | null => {
  try {
    const raw = window.localStorage.getItem(DEFAULT_LIST_KEY);
    const id = Number(raw);

    return raw && Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
};

/** The theme's one-click save goes to "the last list the customer saved to"; keep it current. */
export const setDefaultListId = (listId: number) =>
  write(() => window.localStorage.setItem(DEFAULT_LIST_KEY, String(listId)));

export const clearDefaultListId = () =>
  write(() => window.localStorage.removeItem(DEFAULT_LIST_KEY));

/** The theme caches the customer's lists for five minutes; drop it after every mutation. */
export const invalidateListsCache = () =>
  write(() => window.sessionStorage.removeItem(LISTS_CACHE_KEY));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Favorites/storage.test.ts`
Expected: PASS (12 tests).

Negative control: remove the `expiry` check in `readWrappedValue`; the expired-wrapper test must fail. Restore.

- [ ] **Step 6: Type-check, lint, commit**

```bash
yarn tsc --noEmit
yarn eslint src/pages/Favorites/storage.ts src/pages/Favorites/storage.test.ts tests/favoritesBuilders/index.ts
git add src/pages/Favorites/storage.ts src/pages/Favorites/storage.test.ts tests/favoritesBuilders/index.ts
git commit -m "feat: B2B-0000 Add the favorites theme storage adapter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Pure list model: normalize, membership, save-to-lists diff, guest merge plan

Spec §8 (first half). No React, no network, no storage.

**Files:**
- Create: `src/pages/Favorites/favorites.ts`
- Create: `src/pages/Favorites/favorites.test.ts`
- Modify: `tests/favoritesBuilders/index.ts` (add `buildFavoriteItemWith`, `buildFavoriteListWith`)

**Interfaces:**
- Consumes: `WishlistNode` from Task 2.
- Produces (from `./favorites`):
  - `interface ItemRef { productId: number; variantId: number | null }`
  - `interface FavoriteItem extends ItemRef { id: number }`
  - `interface FavoriteList { id: number; name: string; isPublic: boolean; items: FavoriteItem[] }`
  - `normalizeLists(nodes: WishlistNode[]): FavoriteList[]`
  - `itemKey(ref: ItemRef): string`
  - `membership(lists: FavoriteList[], ref: ItemRef): Set<number>`
  - `interface SaveToListsPlan { adds: { listId: number }[]; removes: { listId: number; itemId: number }[] }`
  - `planSaveToLists({ lists, ref, selected }: { lists: FavoriteList[]; ref: ItemRef; selected: Set<number> }): SaveToListsPlan`
  - `isEmptyPlan(plan: SaveToListsPlan): boolean`
  - (module-internal) `type MergeTarget = { kind: 'existing'; listId: number; name: string } | { kind: 'create' }`
  - `interface GuestMergePlan { target: MergeTarget; rows: ItemRef[] }`
  - `planGuestMerge({ guest, lists, defaultListId }: { guest: ItemRef[]; lists: FavoriteList[]; defaultListId: number | null }): GuestMergePlan | null`
- Produces (from `tests/test-utils`): `buildFavoriteItemWith`, `buildFavoriteListWith`.

- [ ] **Step 1: Add the list builders**

Append to `tests/favoritesBuilders/index.ts` (import next to the others):

```ts
import { FavoriteItem, FavoriteList } from '@/pages/Favorites/favorites';

export const buildFavoriteItemWith = builder<FavoriteItem>(() => ({
  id: faker.number.int({ min: 1, max: 1_000_000_000 }),
  productId: faker.number.int({ min: 1, max: 1_000_000_000 }),
  variantId: null,
}));

export const buildFavoriteListWith = builder<FavoriteList>(() => ({
  id: faker.number.int({ min: 1, max: 1_000_000_000 }),
  name: faker.commerce.department(),
  isPublic: false,
  items: [],
}));
```

- [ ] **Step 2: Write the failing tests**

`src/pages/Favorites/favorites.test.ts`:

```ts
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
    expect(planSaveToLists({ lists: [current, other], ref, selected: new Set([other.id]) })).toEqual({
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn test --run src/pages/Favorites/favorites.test.ts`
Expected: FAIL, "Cannot find module './favorites'".

- [ ] **Step 4: Write the list model**

`src/pages/Favorites/favorites.ts`:

```ts
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
type MergeTarget =
  | { kind: 'existing'; listId: number; name: string }
  | { kind: 'create' };

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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Favorites/favorites.test.ts`
Expected: PASS (13 tests).

Negative controls: (a) make `itemKey` ignore `variantId`; the `itemKey`, `membership` and "different variant" tests must fail. (b) In `planGuestMerge`, drop the `lists.find(...defaultListId)` and always use `lists[0]`; the "targets the default list" test must fail. Restore both.

- [ ] **Step 6: Type-check, lint, commit**

```bash
yarn tsc --noEmit
yarn eslint src/pages/Favorites/favorites.ts src/pages/Favorites/favorites.test.ts tests/favoritesBuilders/index.ts
git add src/pages/Favorites/favorites.ts src/pages/Favorites/favorites.test.ts tests/favoritesBuilders/index.ts
git commit -m "feat: B2B-0000 Add the favorites list model and planning functions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Pure row model: hydrate rows from the catalog and plan cart adds

Spec §8 (second half), §1 quantities.

**Files:**
- Modify: `src/pages/Favorites/favorites.ts` (append)
- Modify: `src/pages/Favorites/favorites.test.ts` (append)
- Modify: `tests/favoritesBuilders/index.ts` (add `buildFavoriteVariantWith`, `buildFavoriteProductWith`, `buildFavoriteRowWith`)

**Interfaces:**
- Consumes: `ProductSearch` from `@/shared/service/b2b/graphql/product` (existing), `PRODUCT_DEFAULT_IMAGE` from `@/constants` (existing).
- Produces (from `./favorites`):
  - `type ProductsById = Record<number, ProductSearch | undefined>`
  - `interface FavoriteRow { item: FavoriteItem; available: boolean; name: string; sku: string; imageUrl: string; price: number | null; productUrl: string; requiresOptions: boolean; purchasable: boolean; orderQuantityMinimum: number; cartVariantId: number | null }`
  - `hydrateRows(list: FavoriteList, productsById: ProductsById, showInclusiveTaxPrice: boolean): FavoriteRow[]`
  - (module-internal) `interface CartLineItem { productId: number; variantId: number; quantity: number; newSelectOptionList: never[] }`
  - (module-internal) `type SkipReason = 'unavailable' | 'optionsRequired' | 'notPurchasable'`
  - `interface AddToCartPlan { lineItems: CartLineItem[]; skipped: { row: FavoriteRow; reason: SkipReason }[] }`
  - `planAddToCart(rows: FavoriteRow[]): AddToCartPlan`
- Produces (from `tests/test-utils`): `buildFavoriteVariantWith`, `buildFavoriteProductWith`, `buildFavoriteRowWith`.

- [ ] **Step 1: Add the product, variant and row builders**

Append to `tests/favoritesBuilders/index.ts` (imports next to the others; `FavoriteRow` joins the existing `@/pages/Favorites/favorites` import):

```ts
import { ProductSearch } from '@/shared/service/b2b/graphql/product';

export const buildFavoriteVariantWith = builder<ProductSearch['variants'][number]>(() => {
  const price = Number(faker.commerce.price());

  return {
    variant_id: faker.number.int({ min: 1, max: 1_000_000_000 }),
    product_id: faker.number.int({ min: 1, max: 1_000_000_000 }),
    sku: faker.string.alphanumeric(8).toUpperCase(),
    option_values: [],
    calculated_price: price,
    image_url: faker.image.url(),
    has_price_list: false,
    bulk_prices: [],
    purchasing_disabled: false,
    cost_price: price,
    inventory_level: faker.number.int({ min: 1, max: 100 }),
    bc_calculated_price: {
      as_entered: price,
      tax_inclusive: Number((price * 1.2).toFixed(2)),
      tax_exclusive: price,
      entered_inclusive: false,
    },
  };
});

export const buildFavoriteProductWith = builder<ProductSearch>(() => ({
  id: faker.number.int({ min: 1, max: 1_000_000_000 }),
  name: faker.commerce.productName(),
  sku: faker.string.alphanumeric(6).toUpperCase(),
  costPrice: faker.commerce.price(),
  inventoryLevel: faker.number.int({ min: 1, max: 100 }),
  inventoryTracking: 'none',
  availability: 'available',
  orderQuantityMinimum: 1,
  orderQuantityMaximum: 0,
  variants: [buildFavoriteVariantWith('WHATEVER_VALUES')],
  currencyCode: 'USD',
  imageUrl: faker.image.url(),
  modifiers: [],
  options: [],
  optionsV3: [],
  channelId: [],
  productUrl: faker.internet.url(),
  taxClassId: 0,
  isPriceHidden: false,
}));

export const buildFavoriteRowWith = builder<FavoriteRow>(() => ({
  item: buildFavoriteItemWith('WHATEVER_VALUES'),
  available: true,
  name: faker.commerce.productName(),
  sku: faker.string.alphanumeric(6).toUpperCase(),
  imageUrl: faker.image.url(),
  price: Number(faker.commerce.price()),
  productUrl: faker.internet.url(),
  requiresOptions: false,
  purchasable: true,
  orderQuantityMinimum: 1,
  cartVariantId: faker.number.int({ min: 1, max: 1_000_000_000 }),
}));
```

- [ ] **Step 2: Write the failing tests**

Append to `src/pages/Favorites/favorites.test.ts`. Extend the two import blocks so they read:

```ts
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
```

Then append:

```ts
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

    const [row] = hydrateRows(buildFavoriteListWith({ items: [item] }), { [product.id]: product }, true);

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

    const [row] = hydrateRows(buildFavoriteListWith({ items: [item] }), { [product.id]: product }, false);

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

    const [row] = hydrateRows(buildFavoriteListWith({ items: [item] }), { [product.id]: product }, false);

    expect(row.price).toBeNull();
  });

  it('requires options for a product-only favorite of a product with options', () => {
    const product = buildFavoriteProductWith({
      options: [{ option_id: 1, display_name: 'Size', sort_order: 0, is_required: true }],
    });
    const item = buildFavoriteItemWith({ productId: product.id, variantId: null });

    const [row] = hydrateRows(buildFavoriteListWith({ items: [item] }), { [product.id]: product }, false);

    expect(row.requiresOptions).toBe(true);
  });

  it('does not require options when the favorite saved a variant of an option product', () => {
    const variant = buildFavoriteVariantWith('WHATEVER_VALUES');
    const product = buildFavoriteProductWith({
      variants: [variant],
      options: [{ option_id: 1, display_name: 'Size', sort_order: 0, is_required: true }],
    });
    const item = buildFavoriteItemWith({ productId: product.id, variantId: variant.variant_id });

    const [row] = hydrateRows(buildFavoriteListWith({ items: [item] }), { [product.id]: product }, false);

    expect(row.requiresOptions).toBe(false);
  });

  it('requires options when a modifier is required, even with a saved variant', () => {
    const variant = buildFavoriteVariantWith('WHATEVER_VALUES');
    const product = buildFavoriteProductWith({ variants: [variant], modifiers: [{ required: true }] });
    const item = buildFavoriteItemWith({ productId: product.id, variantId: variant.variant_id });

    const [row] = hydrateRows(buildFavoriteListWith({ items: [item] }), { [product.id]: product }, false);

    expect(row.requiresOptions).toBe(true);
  });

  it('marks a variant the catalog disabled for purchase', () => {
    const variant = buildFavoriteVariantWith({ purchasing_disabled: true });
    const product = buildFavoriteProductWith({ variants: [variant] });
    const item = buildFavoriteItemWith({ productId: product.id, variantId: variant.variant_id });

    const [row] = hydrateRows(buildFavoriteListWith({ items: [item] }), { [product.id]: product }, false);

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

    const [row] = hydrateRows(buildFavoriteListWith({ items: [item] }), { [product.id]: product }, false);

    expect(row).toMatchObject({ available: false, name: product.name, cartVariantId: null });
  });

  it('raises the quantity minimum to at least one', () => {
    const product = buildFavoriteProductWith({ orderQuantityMinimum: 0 });
    const item = buildFavoriteItemWith({ productId: product.id, variantId: null });

    const [row] = hydrateRows(buildFavoriteListWith({ items: [item] }), { [product.id]: product }, false);

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
```

- [ ] **Step 3: Run the tests to verify the new ones fail**

Run: `yarn test --run src/pages/Favorites/favorites.test.ts`
Expected: FAIL, `hydrateRows`/`planAddToCart` are not exported.

- [ ] **Step 4: Append the row model**

Append to `src/pages/Favorites/favorites.ts`. Add the two imports at the top (keep the existing `WishlistNode` import; `simple-import-sort` wants `@/constants` first, then `@/shared/...`):

```ts
import { PRODUCT_DEFAULT_IMAGE } from '@/constants';
import type { ProductSearch } from '@/shared/service/b2b/graphql/product';
```

Then append at the end of the file:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Favorites/favorites.test.ts`
Expected: PASS (26 tests).

Negative controls: (a) make `requiresOptions` ignore `product.options.length`; the "requires options for a product-only favorite" test must fail. (b) In `planAddToCart`, use `1` instead of `row.orderQuantityMinimum`; the first cart test must fail. Restore both.

- [ ] **Step 6: Type-check, lint, commit**

```bash
yarn tsc --noEmit
yarn eslint src/pages/Favorites/favorites.ts src/pages/Favorites/favorites.test.ts tests/favoritesBuilders/index.ts
git add src/pages/Favorites/favorites.ts src/pages/Favorites/favorites.test.ts tests/favoritesBuilders/index.ts
git commit -m "feat: B2B-0000 Hydrate favorite rows from the catalog and plan cart adds

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Product hydration through `productsSearch`, chunked

Spec §9 (products query). Reuses the B2B `searchProducts` call Quick Order and Shopping Lists use, 50 ids per call like `AddToQuote`.

**Files:**
- Modify: `src/pages/Favorites/api.ts`
- Modify: `src/pages/Favorites/api.test.ts`

**Interfaces:**
- Consumes: `searchProducts` from `@/shared/service/b2b` (existing); `ProductsById` from Task 5.
- Produces (from `./api`): `interface FavoriteProductsQuery { productIds: number[]; currencyCode: string; companyId: string | number; customerGroupId: number }`, `fetchFavoriteProducts(query: FavoriteProductsQuery): Promise<ProductsById>`.

- [ ] **Step 1: Write the failing tests**

Replace the import block of `src/pages/Favorites/api.test.ts` with:

```ts
import {
  buildFavoriteProductWith,
  bulk,
  graphql,
  HttpResponse,
  startMockServer,
} from 'tests/test-utils';

import { fetchFavoriteProducts, isFavoritesAvailable } from './api';

const { server } = startMockServer();
```

Append:

```ts
describe('fetchFavoriteProducts', () => {
  // With the B2B-3705 flag off (the test default) the ids are interpolated into the query text.
  const idsIn = (query: string) =>
    (query.match(/productIds: \[([^\]]*)\]/)?.[1] ?? '')
      .split(',')
      .filter(Boolean)
      .map(Number);

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
      fetchFavoriteProducts({ productIds: [], currencyCode: 'USD', companyId: '', customerGroupId: 0 }),
    ).resolves.toEqual({});
    expect(handler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `yarn test --run src/pages/Favorites/api.test.ts`
Expected: FAIL, `fetchFavoriteProducts` is not exported.

- [ ] **Step 3: Add the hydration call**

`src/pages/Favorites/api.ts` becomes:

```ts
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
  const pages: { productsSearch: ProductSearch[] }[] = await Promise.all(
    chunk(productIds, PRODUCT_SEARCH_CHUNK_SIZE).map((ids) =>
      searchProducts({ productIds: ids, currencyCode, companyId, customerGroupId }),
    ),
  );

  return pages
    .flatMap((page) => page.productsSearch)
    .reduce<ProductsById>((byId, product) => ({ ...byId, [Number(product.id)]: product }), {});
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Favorites/api.test.ts`
Expected: PASS (6 tests).

Negative control: change the chunk size to `500`; the chunking test must fail on `[50, 50, 20]`. Restore.

- [ ] **Step 5: Type-check, lint, commit**

```bash
yarn tsc --noEmit
yarn eslint src/pages/Favorites/api.ts src/pages/Favorites/api.test.ts
git add src/pages/Favorites/api.ts src/pages/Favorites/api.test.ts
git commit -m "feat: B2B-0000 Hydrate favorite products through chunked productsSearch

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Route, permissions, nav item, copy, and the gated page shell

Spec §4.3, §4.4, §10.4. After this task `/favorites` appears in the side nav for the right customers on a flagged Stencil store and renders the unavailable message everywhere else.

**Files:**
- Modify: `src/shared/routes/config.ts` (add `favoritesPermissions` to `legacyPermissions`)
- Modify: `src/shared/routeList.ts` (destructure, route entry, gate clause)
- Modify: `src/shared/routes/index.tsx` (lazy import + `routesMap` entry)
- Modify: `src/lib/lang/locales/en.json` (nav key + all `favorites.*` keys)
- Create: `src/pages/Favorites/index.tsx` (gated shell)
- Create: `src/pages/Favorites/index.test.tsx` (unavailable states)
- Create: `src/pages/Favorites/index.platform.test.tsx`
- Modify: `src/shared/routeList.test.ts` (favorites gate matrix)
- Create: `src/shared/routeList.platform.test.ts`

**Interfaces:**
- Consumes: `isFavoritesAvailable` (Task 1).
- Produces: route `/favorites` (`idLang: 'global.navMenu.favorites'`), default export `Favorites` page component, every `favorites.*` copy key used by later tasks.

- [ ] **Step 1: Write the failing route tests**

In `src/shared/routeList.test.ts`, change the two store imports to:

```ts
import { setMasqueradeCompany, store } from '@/store';
import { setCompanyInfo, setCustomerInfo } from '@/store/slices/company';
import { CompanyStatus, CustomerRole, UserTypes } from '@/types';
```

Append at the end of the file:

```ts
describe('/favorites', () => {
  const hasFavoritesRoute = (globalState = buildGlobalStateWith({})) =>
    getAllowedRoutesWithoutComponent(globalState).some((route) => route.path === '/favorites');

  const primeCustomerRole = (role: CustomerRole, userType = UserTypes.B2C) => {
    const { customer } = buildCompanyStateWith({});
    store.dispatch(setCustomerInfo({ ...customer, role, userType }));
  };

  const setAgenting = (isAgenting: boolean) =>
    store.dispatch(
      setMasqueradeCompany({
        masqueradeCompany: { id: 0, isAgenting, companyName: '', customerGroupId: 0 },
      }),
    );

  beforeEach(() => {
    window.BC_CONTEXT = { favorites: { enabled: true } };
    setAgenting(false);
  });

  it('offers the route to a B2C customer when the host enables favorites', () => {
    primeCustomerRole(CustomerRole.B2C);

    expect(hasFavoritesRoute()).toBe(true);
  });

  it('offers the route to a B2B buyer of an approved company', () => {
    primeCustomerRole(CustomerRole.ADMIN, UserTypes.MULTIPLE_B2C);
    store.dispatch(
      setCompanyInfo({ id: '1', companyName: 'Acme', status: CompanyStatus.APPROVED }),
    );
    // B2B routes are only offered once the storefront config has loaded.
    const loadedConfig = buildGlobalStateWith({
      storefrontConfig: { shoppingLists: true, tradeProfessionalApplication: false },
    });

    expect(hasFavoritesRoute(loadedConfig)).toBe(true);
  });

  it('withholds the route when the host has no favorites config', () => {
    delete window.BC_CONTEXT;
    primeCustomerRole(CustomerRole.B2C);

    expect(hasFavoritesRoute()).toBe(false);
  });

  it('withholds the route when the host disables favorites', () => {
    window.BC_CONTEXT = { favorites: { enabled: false } };
    primeCustomerRole(CustomerRole.B2C);

    expect(hasFavoritesRoute()).toBe(false);
  });

  it('withholds the route while a sales rep is masquerading', () => {
    primeCustomerRole(CustomerRole.SUPER_ADMIN, UserTypes.B2B_SUPER_ADMIN);
    setAgenting(true);

    expect(hasFavoritesRoute()).toBe(false);
  });

  it('withholds the route from a sales rep who is not masquerading', () => {
    primeCustomerRole(CustomerRole.SUPER_ADMIN, UserTypes.B2B_SUPER_ADMIN);

    expect(hasFavoritesRoute()).toBe(false);
  });
});
```

Create `src/shared/routeList.platform.test.ts`:

```ts
import { buildCompanyStateWith, builder } from 'tests/test-utils';

import { GlobalState, initState } from '@/shared/global/context/config';
import { store } from '@/store';
import { setCustomerInfo } from '@/store/slices/company';
import { CustomerRole } from '@/types';

import { getAllowedRoutesWithoutComponent } from './routeList';

vi.mock('@/utils/basicConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/basicConfig')>()),
  platform: 'catalyst',
}));

// Context-flavored GlobalState (see the note in routeList.test.ts).
const buildGlobalStateWith = builder<GlobalState>(() => initState);

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('withholds the favorites route on non-bigcommerce platforms even when the host enables it', () => {
  window.BC_CONTEXT = { favorites: { enabled: true } };
  const { customer } = buildCompanyStateWith({});
  store.dispatch(setCustomerInfo({ ...customer, role: CustomerRole.B2C }));

  expect(
    getAllowedRoutesWithoutComponent(buildGlobalStateWith({})).some(
      (route) => route.path === '/favorites',
    ),
  ).toBe(false);
});
```

- [ ] **Step 2: Write the failing page-shell tests**

`src/pages/Favorites/index.test.tsx`:

```tsx
import { buildB2BFeaturesStateWith, renderWithProviders, screen } from 'tests/test-utils';

import Favorites from '.';

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('shows the unavailable state when the host has not enabled favorites', () => {
  renderWithProviders(<Favorites />);

  expect(screen.getByText('Favorites are not available for this account.')).toBeInTheDocument();
});

it('shows the unavailable state while a sales rep is masquerading', () => {
  window.BC_CONTEXT = { favorites: { enabled: true } };

  renderWithProviders(<Favorites />, {
    preloadedState: {
      b2bFeatures: buildB2BFeaturesStateWith({ masqueradeCompany: { isAgenting: true } }),
    },
  });

  expect(screen.getByText('Favorites are not available for this account.')).toBeInTheDocument();
});
```

`src/pages/Favorites/index.platform.test.tsx`:

```tsx
import { renderWithProviders, screen } from 'tests/test-utils';

import Favorites from '.';

vi.mock('@/utils/basicConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/basicConfig')>()),
  platform: 'catalyst',
}));

beforeEach(() => {
  window.BC_CONTEXT = { favorites: { enabled: true } };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('shows the unavailable state on non-bigcommerce platforms even when the host enables favorites', () => {
  renderWithProviders(<Favorites />);

  expect(screen.getByText('Favorites are not available for this account.')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn test --run src/shared/routeList.test.ts src/shared/routeList.platform.test.ts src/pages/Favorites/index.test.tsx src/pages/Favorites/index.platform.test.tsx`
Expected: the six `/favorites` route tests that expect `true` FAIL (no such route yet); the page tests FAIL with "Cannot find module '.'".

- [ ] **Step 4: Add the permissions, route entry, gate clause and lazy page**

`src/shared/routes/config.ts`: inside `legacyPermissions`, after the `accountSettingPermissions` array, add:

```ts
  favoritesPermissions: [
    CustomerRole.ADMIN,
    CustomerRole.SENIOR_BUYER,
    CustomerRole.JUNIOR_BUYER,
    CustomerRole.CUSTOM_ROLE,
    CustomerRole.B2C,
  ],
```

`src/shared/routeList.ts`:

1. In the `const { … } = legacyPermissions;` destructuring, add `favoritesPermissions,` after `quoteDetailPermissions,`.
2. In `routeList`, directly after the object whose `path` is `'/shoppingLists'`, insert:

```ts
  {
    path: '/favorites',
    name: 'Favorites',
    wsKey: 'favorites',
    isMenuItem: true,
    permissions: favoritesPermissions,
    isTokenLogin: true,
    idLang: 'global.navMenu.favorites',
  },
```

3. In `getAllowedRoutesWithoutComponent`, directly after the `if (path === '/loyalty' && (…)) { return false; }` block, insert:

```ts
    // /favorites is Stencil-only, host-configured, and hidden while agenting — the storefront
    // session cookie identifies the logged-in rep, not the masqueraded buyer. Mirrors
    // isFavoritesAvailable() in src/pages/Favorites/api.ts; keep the two in sync.
    if (
      path === '/favorites' &&
      (platform !== 'bigcommerce' || !window.BC_CONTEXT?.favorites?.enabled || isAgenting)
    ) {
      return false;
    }
```

`src/shared/routes/index.tsx`:

1. After `const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));` add:

```ts
const Favorites = lazy(() => import('@/pages/Favorites'));
```

2. In `routesMap`, after `'/shoppingLists': ShoppingLists,` add:

```ts
  '/favorites': Favorites,
```

`src/pages/Favorites/index.tsx`:

```tsx
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { useAppSelector } from '@/store';

import { isFavoritesAvailable } from './api';

function Favorites() {
  const b3Lang = useB3Lang();
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  // The storefront session cookie identifies the logged-in rep, so a masquerading rep must
  // not see or edit favorites here. Belt and braces with the route filter: gotoAllowedAppPage
  // checks the unfiltered routes array, so a programmatic push could still mount this page.
  const isAvailable = isFavoritesAvailable() && !isAgenting;

  if (!isAvailable) {
    return <Typography>{b3Lang('favorites.unavailable')}</Typography>;
  }

  // Task 8 renders the lists here.
  return <Box />;
}

export default Favorites;
```

- [ ] **Step 5: Add the copy**

In `src/lib/lang/locales/en.json`:

1. After the line `"global.navMenu.loyalty": "Smart Rewards",` insert:

```json
  "global.navMenu.favorites": "Favorites",
```

2. The file's last entry is `"loyalty.errors.generic": "Something went wrong. Please try again."` followed by `}`. Add a comma to that entry and insert before the closing brace:

```json
  "favorites.unavailable": "Favorites are not available for this account.",
  "favorites.signedOut": "Sign in to see your favorites.",
  "favorites.signIn": "Sign in",
  "favorites.empty.noLists": "No favorites yet. Look for the star on any product to save it.",
  "favorites.empty.startShopping": "Start shopping",
  "favorites.empty.list": "This list is empty.",
  "favorites.newList": "New list",
  "favorites.listName.label": "List name",
  "favorites.listName.required": "Enter a list name",
  "favorites.listName.create": "Create",
  "favorites.listName.save": "Save",
  "favorites.rename": "Rename",
  "favorites.renamed": "List renamed",
  "favorites.deleteList": "Delete list",
  "favorites.deleteList.confirm": "Delete {name}? {count, plural, one {Its # favorite} other {Its # favorites}} will be removed.",
  "favorites.deleteList.deleted": "List deleted",
  "favorites.tabLabel": "{name} ({count})",
  "favorites.column.product": "Product",
  "favorites.column.sku": "SKU",
  "favorites.column.price": "Price",
  "favorites.item.remove": "Remove",
  "favorites.item.removed": "Removed from {list}",
  "favorites.item.saveToLists": "Save to lists",
  "favorites.item.addToCart": "Add to cart",
  "favorites.item.chooseOptions": "Choose options",
  "favorites.item.unavailable": "No longer available",
  "favorites.item.detailsUnavailable": "Product details unavailable",
  "favorites.addAllToCart": "Add all to cart",
  "favorites.cart.addedOne": "Added to cart",
  "favorites.cart.addedMany": "{count, plural, one {# item} other {# items}} added to cart",
  "favorites.cart.skipped": "{count, plural, one {# item} other {# items}} skipped: they need options or are unavailable",
  "favorites.cart.nothingToAdd": "Nothing to add: these items need options or are unavailable.",
  "favorites.cart.view": "View cart",
  "favorites.picker.title": "Save {product} to lists",
  "favorites.picker.newListName": "New list name",
  "favorites.picker.removeHint": "Unchecking every list removes this product from your favorites.",
  "favorites.picker.saved": "Saved to {list}",
  "favorites.picker.updated": "Favorites updated",
  "favorites.merge.added": "{count, plural, one {# favorite} other {# favorites}} added to {list}",
  "favorites.defaultListName": "My Favorites",
  "favorites.error.generic": "Something went wrong updating your favorites. Please try again.",
  "favorites.error.products": "We couldn't load product details for your favorites."
```

Verify the file is still valid JSON: `node -e "JSON.parse(require('fs').readFileSync('src/lib/lang/locales/en.json','utf8')); console.log('ok')"`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn test --run src/shared/routeList.test.ts src/shared/routeList.platform.test.ts src/pages/Favorites/index.test.tsx src/pages/Favorites/index.platform.test.tsx`
Expected: PASS.

Negative controls: (a) remove `isAgenting` from the new gate clause; the masquerading route test must fail. (b) Remove `&& !isAgenting` from the page; the masquerading page test must fail. Restore both.

- [ ] **Step 7: Type-check, lint, commit (stage only your `en.json` hunks)**

```bash
yarn tsc --noEmit
yarn eslint src/shared/routeList.ts src/shared/routes/config.ts src/shared/routes/index.tsx src/pages/Favorites src/shared/routeList.test.ts src/shared/routeList.platform.test.ts
git diff src/lib/lang/locales/en.json > /tmp/en.patch
# Open /tmp/en.patch and delete the hunk that removes "paymentMethods.title" (another
# session's change); keep only the hunks adding favorites keys. Then:
git apply --cached /tmp/en.patch
git add src/shared/routeList.ts src/shared/routes/config.ts src/shared/routes/index.tsx src/pages/Favorites/index.tsx src/pages/Favorites/index.test.tsx src/pages/Favorites/index.platform.test.tsx src/shared/routeList.test.ts src/shared/routeList.platform.test.ts
git diff --cached --stat   # en.json must show only additions
git commit -m "feat: B2B-0000 Add the gated /favorites route, nav item and copy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Read-only page: lists as tabs, rows with image, name, SKU and price, all states

Spec §9 (queries), §10.1, §10.2. After this task the page shows real data; no writes yet.

**Files:**
- Create: `src/pages/Favorites/useFavoriteLists.ts`
- Create: `src/pages/Favorites/useFavoriteProducts.ts`
- Create: `src/pages/Favorites/components/EmptyState.tsx`
- Create: `src/pages/Favorites/components/ListTabs.tsx`
- Create: `src/pages/Favorites/components/ProductSummary.tsx`
- Create: `src/pages/Favorites/components/FavoriteItemsTable.tsx`
- Modify: `src/pages/Favorites/index.tsx` (replace the shell)
- Modify: `src/pages/Favorites/index.test.tsx` (full harness + read-only tests)

**Interfaces:**
- Consumes: `getCustomerWishlists` (Task 2), `normalizeLists`, `hydrateRows`, `FavoriteList`, `FavoriteRow`, `ProductsById` (Tasks 4-5), `fetchFavoriteProducts`, `FavoriteProductsQuery`, `isFavoritesAvailable` (Tasks 1, 6).
- Produces:
  - `favoritesListsQueryKey(customerId: number): readonly ['favorites', 'lists', number]` and `useFavoriteLists(customerId: number, enabled: boolean)` returning `UseQueryResult<FavoriteList[] | null>` from `./useFavoriteLists`.
  - `useFavoriteProducts(query: FavoriteProductsQuery)` returning `UseQueryResult<ProductsById>` from `./useFavoriteProducts`.
  - Components: `EmptyState({ message, children? })`, `ListTabs({ lists, selectedId, onSelect })`, `ProductSummary({ row, productsFailed })`, `FavoriteItemsTable({ rows, productsFailed })` (Task 10 adds the actions column).
  - The page test harness (`mockLists`, `mockProducts`, `listWith`, `preloadedState`) that later tasks extend.

- [ ] **Step 1: Write the failing tests**

Replace `src/pages/Favorites/index.test.tsx` entirely with:

```tsx
import {
  buildB2BFeaturesStateWith,
  buildCompanyStateWith,
  buildFavoriteItemWith,
  buildFavoriteListWith,
  buildFavoriteProductWith,
  buildFavoriteVariantWith,
  buildGlobalStateWith,
  graphql,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
  within,
} from 'tests/test-utils';

import { ProductSearch } from '@/shared/service/b2b/graphql/product';
import { CustomerRole, UserTypes } from '@/types';

import { FavoriteList } from './favorites';
import Favorites from '.';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/utils/b3Logger');

const { server } = startMockServer();

const preloadedState = {
  company: buildCompanyStateWith({
    customer: {
      id: 4242,
      emailAddress: 'buyer@example.com',
      role: CustomerRole.B2C,
      userType: UserTypes.B2C,
    },
    tokens: { bcGraphqlToken: 'storefront-token' },
  }),
};

const lastPage = { hasNextPage: false, endCursor: null };

const connection = <T,>(nodes: T[]) => ({
  pageInfo: lastPage,
  edges: nodes.map((node) => ({ node })),
});

// The storefront API shape of a normalized list.
const rawList = (list: FavoriteList) => ({
  entityId: list.id,
  name: list.name,
  isPublic: list.isPublic,
  items: connection(
    list.items.map((item) => ({
      entityId: item.id,
      productEntityId: item.productId,
      variantEntityId: item.variantId,
    })),
  ),
});

const mockLists = (lists: FavoriteList[]) =>
  server.use(
    graphql.query('FavoritesLists', () =>
      HttpResponse.json({ data: { customer: { wishlists: connection(lists.map(rawList)) } } }),
    ),
  );

const mockProducts = (products: ProductSearch[]) =>
  server.use(
    graphql.query('SearchProducts', () =>
      HttpResponse.json({ data: { productsSearch: products } }),
    ),
  );

// A list holding one product-only favorite of `product`.
const listWith = (product: ProductSearch, name = 'My Favorites') =>
  buildFavoriteListWith({
    name,
    items: [buildFavoriteItemWith({ productId: product.id, variantId: null })],
  });

beforeEach(() => {
  window.BC_CONTEXT = { favorites: { enabled: true } };
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.dataLayer = [];
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

describe('availability', () => {
  it('shows the unavailable state when the host has not enabled favorites', () => {
    delete window.BC_CONTEXT;

    renderWithProviders(<Favorites />, { preloadedState });

    expect(screen.getByText('Favorites are not available for this account.')).toBeInTheDocument();
  });

  it('shows the unavailable state while a sales rep is masquerading', () => {
    renderWithProviders(<Favorites />, {
      preloadedState: {
        ...preloadedState,
        b2bFeatures: buildB2BFeaturesStateWith({ masqueradeCompany: { isAgenting: true } }),
      },
    });

    expect(screen.getByText('Favorites are not available for this account.')).toBeInTheDocument();
  });

  it('shows the signed-out state when the storefront session has no customer', async () => {
    server.use(
      graphql.query('FavoritesLists', () => HttpResponse.json({ data: { customer: null } })),
    );

    const { user, navigation } = renderWithProviders(<Favorites />, { preloadedState });

    expect(await screen.findByText('Sign in to see your favorites.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(navigation).toHaveBeenCalledWith('/login');
  });
});

describe('lists and rows', () => {
  it('shows the empty state with a top-window shopping link when the customer has no lists', async () => {
    mockLists([]);

    renderWithProviders(<Favorites />, { preloadedState });

    expect(
      await screen.findByText('No favorites yet. Look for the star on any product to save it.'),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Start shopping' });
    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveAttribute('target', '_top');
  });

  it('renders lists as tabs and the selected list rows with image, name, SKU and price', async () => {
    const variant = buildFavoriteVariantWith({
      sku: 'VAR-77',
      image_url: 'https://img.example/var.png',
      bc_calculated_price: {
        as_entered: 12.5,
        tax_inclusive: 15,
        tax_exclusive: 12.5,
        entered_inclusive: false,
      },
    });
    const product = buildFavoriteProductWith({ name: 'Slicker Brush', variants: [variant] });
    const first = buildFavoriteListWith({
      name: 'My Favorites',
      items: [buildFavoriteItemWith({ productId: product.id, variantId: variant.variant_id })],
    });
    const second = buildFavoriteListWith({ name: 'Spring order', items: [] });
    mockLists([first, second]);
    mockProducts([product]);

    renderWithProviders(<Favorites />, { preloadedState });

    expect(await screen.findByRole('tab', { name: 'My Favorites (1)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Spring order (0)' })).toBeInTheDocument();

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    expect(within(row).getByRole('presentation')).toHaveAttribute(
      'src',
      'https://img.example/var.png',
    );
    expect(within(row).getByText('VAR-77')).toBeInTheDocument();
    expect(within(row).getByText('$12.50')).toBeInTheDocument();
  });

  it('shows the tax-inclusive price when the store displays inclusive prices', async () => {
    const variant = buildFavoriteVariantWith({
      bc_calculated_price: {
        as_entered: 12.5,
        tax_inclusive: 15,
        tax_exclusive: 12.5,
        entered_inclusive: false,
      },
    });
    const product = buildFavoriteProductWith({ variants: [variant] });
    mockLists([listWith(product)]);
    mockProducts([product]);

    renderWithProviders(<Favorites />, {
      preloadedState: {
        ...preloadedState,
        global: buildGlobalStateWith({ showInclusiveTaxPrice: true }),
      },
    });

    expect(await screen.findByText('$15.00')).toBeInTheDocument();
  });

  it('hides the price when the catalog hides it for this buyer', async () => {
    const product = buildFavoriteProductWith({ name: 'Hidden Price Brush', isPriceHidden: true });
    mockLists([listWith(product)]);
    mockProducts([product]);

    renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Hidden Price Brush/ });
    expect(within(row).queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('selects the list named in the URL', async () => {
    const first = buildFavoriteListWith({ name: 'First', items: [] });
    const second = buildFavoriteListWith({ name: 'Second', items: [] });
    mockLists([first, second]);

    renderWithProviders(<Favorites />, {
      preloadedState,
      initialEntries: [`/favorites?list=${second.id}`],
    });

    expect(await screen.findByRole('tab', { name: 'Second (0)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('falls back to the first list when the URL names an unknown list', async () => {
    const first = buildFavoriteListWith({ name: 'First', items: [] });
    const second = buildFavoriteListWith({ name: 'Second', items: [] });
    mockLists([first, second]);

    renderWithProviders(<Favorites />, {
      preloadedState,
      initialEntries: ['/favorites?list=999999'],
    });

    expect(await screen.findByRole('tab', { name: 'First (0)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('switches lists through the URL when a tab is clicked', async () => {
    const first = buildFavoriteListWith({ name: 'First', items: [] });
    const second = buildFavoriteListWith({ name: 'Second', items: [] });
    mockLists([first, second]);

    const { user, navigation } = renderWithProviders(<Favorites />, { preloadedState });

    await user.click(await screen.findByRole('tab', { name: 'Second (0)' }));

    expect(navigation).toHaveBeenCalledWith(`/?list=${second.id}`);
    expect(screen.getByRole('heading', { name: 'Second' })).toBeInTheDocument();
  });

  it('shows the empty-list message for a list with no items', async () => {
    mockLists([buildFavoriteListWith({ items: [] })]);

    renderWithProviders(<Favorites />, { preloadedState });

    expect(await screen.findByText('This list is empty.')).toBeInTheDocument();
  });

  it('marks a favorite whose product is no longer in the catalog', async () => {
    mockLists([buildFavoriteListWith({ items: [buildFavoriteItemWith('WHATEVER_VALUES')] })]);
    mockProducts([]);

    renderWithProviders(<Favorites />, { preloadedState });

    expect(await screen.findByText('No longer available')).toBeInTheDocument();
  });

  it('keeps the page usable with placeholders when product details fail to load', async () => {
    mockLists([listWith(buildFavoriteProductWith('WHATEVER_VALUES'))]);
    server.use(
      graphql.query('SearchProducts', () =>
        HttpResponse.json({ errors: [{ message: 'B2B API down' }] }),
      ),
    );

    renderWithProviders(<Favorites />, { preloadedState });

    expect(
      await screen.findByText("We couldn't load product details for your favorites."),
    ).toBeInTheDocument();
    expect(screen.getByText('Product details unavailable')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `yarn test --run src/pages/Favorites/index.test.tsx`
Expected: the two availability tests still pass; every other test FAILS (the shell renders an empty Box).

- [ ] **Step 3: Write the hooks**

`src/pages/Favorites/useFavoriteLists.ts`:

```ts
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
```

`src/pages/Favorites/useFavoriteProducts.ts`:

```ts
import { useQuery } from '@tanstack/react-query';

import { fetchFavoriteProducts, FavoriteProductsQuery } from './api';

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
    queryFn: () => fetchFavoriteProducts({ productIds: ids, currencyCode, companyId, customerGroupId }),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
};
```

- [ ] **Step 4: Write the components**

`src/pages/Favorites/components/EmptyState.tsx`:

```tsx
import { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';

interface EmptyStateProps {
  message: string;
  children?: ReactNode;
}

export default function EmptyState({ message, children }: EmptyStateProps) {
  return (
    <Box sx={{ textAlign: 'center', py: 6 }}>
      <Typography sx={{ mb: 2 }}>{message}</Typography>
      {children && <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>{children}</Box>}
    </Box>
  );
}
```

`src/pages/Favorites/components/ListTabs.tsx`:

```tsx
import { Tab, Tabs } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { FavoriteList } from '../favorites';

interface ListTabsProps {
  lists: FavoriteList[];
  selectedId: number;
  onSelect: (listId: number) => void;
}

export default function ListTabs({ lists, selectedId, onSelect }: ListTabsProps) {
  const b3Lang = useB3Lang();

  return (
    <Tabs
      value={selectedId}
      onChange={(_, listId: number) => onSelect(listId)}
      variant="scrollable"
      allowScrollButtonsMobile
      sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
    >
      {lists.map((list) => (
        <Tab
          key={list.id}
          value={list.id}
          label={b3Lang('favorites.tabLabel', { name: list.name, count: list.items.length })}
        />
      ))}
    </Tabs>
  );
}
```

`src/pages/Favorites/components/ProductSummary.tsx`:

```tsx
import { Box, Chip, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { FavoriteRow } from '../favorites';

interface ProductSummaryProps {
  row: FavoriteRow;
  /** The catalog call failed: show a placeholder instead of pretending the product is gone. */
  productsFailed: boolean;
}

export default function ProductSummary({ row, productsFailed }: ProductSummaryProps) {
  const b3Lang = useB3Lang();
  const unavailableLabel = b3Lang('favorites.item.unavailable');
  const label = productsFailed
    ? b3Lang('favorites.item.detailsUnavailable')
    : row.name || unavailableLabel;
  const showUnavailableChip = !productsFailed && !row.available && row.name !== '';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {/* Decorative: the name sits beside it, so an empty alt keeps screen readers from reading it twice. */}
      <Box
        component="img"
        src={row.imageUrl}
        alt=""
        sx={{ width: 60, height: 60, objectFit: 'contain', borderRadius: 1, flexShrink: 0 }}
      />
      <Box>
        <Typography variant="body1">{label}</Typography>
        {showUnavailableChip && <Chip size="small" label={unavailableLabel} />}
      </Box>
    </Box>
  );
}
```

`src/pages/Favorites/components/FavoriteItemsTable.tsx`:

```tsx
import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { currencyFormat } from '@/utils/b3CurrencyFormat';

import { FavoriteRow } from '../favorites';

import ProductSummary from './ProductSummary';

interface FavoriteItemsTableProps {
  rows: FavoriteRow[];
  productsFailed: boolean;
}

export default function FavoriteItemsTable({ rows, productsFailed }: FavoriteItemsTableProps) {
  const b3Lang = useB3Lang();

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>{b3Lang('favorites.column.product')}</TableCell>
          <TableCell>{b3Lang('favorites.column.sku')}</TableCell>
          <TableCell>{b3Lang('favorites.column.price')}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.item.id}>
            <TableCell>
              <ProductSummary row={row} productsFailed={productsFailed} />
            </TableCell>
            <TableCell>{productsFailed ? '' : row.sku}</TableCell>
            <TableCell>
              {productsFailed || row.price === null ? '' : currencyFormat(row.price)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 5: Write the page**

Replace `src/pages/Favorites/index.tsx` with:

```tsx
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Typography } from '@mui/material';

import B3Spin from '@/components/spin/B3Spin';
import { useB3Lang } from '@/lib/lang';
import { activeCurrencyInfoSelector, useAppSelector } from '@/store';

import EmptyState from './components/EmptyState';
import FavoriteItemsTable from './components/FavoriteItemsTable';
import ListTabs from './components/ListTabs';
import { isFavoritesAvailable } from './api';
import { FavoriteList, hydrateRows } from './favorites';
import { useFavoriteLists } from './useFavoriteLists';
import { useFavoriteProducts } from './useFavoriteProducts';

// `?list=<id>` selects the list; unknown or missing falls back to the first one (spec §4.5).
const selectList = (lists: FavoriteList[], param: string | null): FavoriteList | undefined =>
  lists.find((list) => String(list.id) === param) ?? lists[0];

function Favorites() {
  const b3Lang = useB3Lang();
  const navigate = useNavigate();
  const customerId = useAppSelector(({ company }) => company.customer.id);
  const companyId = useAppSelector(({ company }) => company.companyInfo.id);
  const customerGroupId = useAppSelector(({ company }) => company.customer.customerGroupId);
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  const showInclusiveTaxPrice = useAppSelector(({ global }) => global.showInclusiveTaxPrice);
  const { currency_code: currencyCode } = useAppSelector(activeCurrencyInfoSelector);
  // The storefront session cookie identifies the logged-in rep, so a masquerading rep must
  // not see or edit favorites here. Belt and braces with the route filter: gotoAllowedAppPage
  // checks the unfiltered routes array, so a programmatic push could still mount this page.
  const isAvailable = isFavoritesAvailable() && !isAgenting;

  const [searchParams, setSearchParams] = useSearchParams();
  const listsQuery = useFavoriteLists(customerId, isAvailable);
  const lists = listsQuery.data ?? [];
  const selectedList = selectList(lists, searchParams.get('list'));
  const productsQuery = useFavoriteProducts({
    productIds: lists.flatMap((list) => list.items.map((item) => item.productId)),
    currencyCode,
    companyId,
    customerGroupId,
  });
  const rows = selectedList
    ? hydrateRows(selectedList, productsQuery.data ?? {}, showInclusiveTaxPrice)
    : [];

  const selectListId = (listId: number) =>
    setSearchParams({ list: String(listId) }, { replace: true });

  if (!isAvailable) {
    return <Typography>{b3Lang('favorites.unavailable')}</Typography>;
  }

  if (listsQuery.data === null) {
    return (
      <EmptyState message={b3Lang('favorites.signedOut')}>
        <Button variant="contained" onClick={() => navigate('/login')}>
          {b3Lang('favorites.signIn')}
        </Button>
      </EmptyState>
    );
  }

  const isLoading = listsQuery.isLoading || productsQuery.isLoading;
  const productsFailed = productsQuery.isError;

  return (
    <B3Spin isSpinning={isLoading}>
      <Box>
        {productsFailed && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {b3Lang('favorites.error.products')}
          </Alert>
        )}
        {!listsQuery.isLoading && lists.length === 0 && (
          <EmptyState message={b3Lang('favorites.empty.noLists')}>
            {/* Leaves the portal: anchors rendered inside the ThemeFrame iframe need _top. */}
            <Button variant="contained" href="/" target="_top">
              {b3Lang('favorites.empty.startShopping')}
            </Button>
          </EmptyState>
        )}
        {selectedList && (
          <>
            <ListTabs lists={lists} selectedId={selectedList.id} onSelect={selectListId} />
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
              {selectedList.name}
            </Typography>
            {rows.length === 0 ? (
              <Typography>{b3Lang('favorites.empty.list')}</Typography>
            ) : (
              <FavoriteItemsTable rows={rows} productsFailed={productsFailed} />
            )}
          </>
        )}
      </Box>
    </B3Spin>
  );
}

export default Favorites;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Favorites/index.test.tsx`
Expected: PASS (13 tests).

Negative controls: (a) make `selectList` always return `lists[0]`; the "selects the list named in the URL" test must fail. (b) Remove the `productsFailed` `Alert`; the placeholders test must fail. Restore both.

- [ ] **Step 7: Type-check, lint, commit**

```bash
yarn tsc --noEmit
yarn eslint src/pages/Favorites
git add src/pages/Favorites
git commit -m "feat: B2B-0000 Render favorites lists and items on the /favorites page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: List management: New list, Rename, Delete list

Spec §9 (mutations), §10.3 (first three flows).

**Files:**
- Create: `src/pages/Favorites/useFavoriteActions.ts`
- Create: `src/pages/Favorites/components/ListNameDialog.tsx`
- Create: `src/pages/Favorites/components/ListToolbar.tsx`
- Modify: `src/pages/Favorites/index.tsx`
- Modify: `src/pages/Favorites/index.test.tsx`

**Interfaces:**
- Consumes: `createWishlist`, `updateWishlistName`, `deleteWishlists` (Task 2); `getDefaultListId`, `clearDefaultListId`, `invalidateListsCache` (Task 3); `favoritesListsQueryKey` (Task 8).
- Produces (from `./useFavoriteActions`): `useFavoriteActions(customerId: number)` returning `{ createList, renameList, deleteList, isBusy }` where `createList: UseMutationResult<{ entityId: number; name: string }, Error, string>`, `renameList: UseMutationResult<{ entityId: number; name: string }, Error, { listId: number; name: string }>`, `deleteList: UseMutationResult<void, Error, number>`. Later tasks add `removeItem`, `saveToLists`, `addToCart`, `mergeGuest`.
- Produces components: `ListNameDialog({ isOpen, dialogKey, title, initialName, submitLabel, loading, onCancel, onSubmit })`, `ListToolbar({ list, disabled, onRename, onDelete })` (Task 11 adds `hasItems`, `onAddAll`).

- [ ] **Step 1: Write the failing tests**

In `src/pages/Favorites/index.test.tsx`, add `waitFor` to the `tests/test-utils` import and add:

```tsx
import { snackbar } from '@/utils/b3Tip';
```

Append:

```tsx
describe('list management', () => {
  it('creates a list, trims the name, and selects the new list', async () => {
    const existing = buildFavoriteListWith({ name: 'Existing', items: [] });
    const created = buildFavoriteListWith({ name: 'Gift ideas', items: [] });
    const received = vi.fn();
    let lists = [existing];
    server.use(
      graphql.query('FavoritesLists', () =>
        HttpResponse.json({ data: { customer: { wishlists: connection(lists.map(rawList)) } } }),
      ),
      graphql.mutation('CreateFavoritesList', ({ variables }) => {
        received(variables);
        lists = [existing, created];

        return HttpResponse.json({
          data: {
            wishlist: { createWishlist: { result: { entityId: created.id, name: created.name } } },
          },
        });
      }),
    );

    const { user, navigation } = renderWithProviders(<Favorites />, { preloadedState });

    await user.click(await screen.findByRole('button', { name: 'New list' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'List name' }), '  Gift ideas ');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(received).toHaveBeenCalledWith({ name: 'Gift ideas' }));
    expect(await screen.findByRole('tab', { name: 'Gift ideas (0)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(navigation).toHaveBeenCalledWith(`/?list=${created.id}`);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables Create until a name is entered', async () => {
    mockLists([buildFavoriteListWith({ items: [] })]);

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    await user.click(await screen.findByRole('button', { name: 'New list' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();

    await user.type(within(dialog).getByRole('textbox', { name: 'List name' }), '   ');

    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(within(dialog).getByText('Enter a list name')).toBeInTheDocument();
  });

  it('renames the selected list', async () => {
    const list = buildFavoriteListWith({ name: 'Old name', items: [] });
    const received = vi.fn();
    mockLists([list]);
    server.use(
      graphql.mutation('RenameFavoritesList', ({ variables }) => {
        received(variables);

        return HttpResponse.json({
          data: {
            wishlist: { updateWishlist: { result: { entityId: list.id, name: variables.name } } },
          },
        });
      }),
    );

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    await user.click(await screen.findByRole('button', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByRole('textbox', { name: 'List name' });
    expect(input).toHaveValue('Old name');
    await user.clear(input);
    await user.type(input, 'New name');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(received).toHaveBeenCalledWith({ listId: list.id, name: 'New name' }),
    );
    expect(snackbar.success).toHaveBeenCalledWith('List renamed');
  });

  it('deletes the selected list, clears the default-list key, and falls back to the first remaining list', async () => {
    const keep = buildFavoriteListWith({ name: 'Keep', items: [] });
    const doomed = buildFavoriteListWith({
      name: 'Doomed',
      items: [buildFavoriteItemWith('WHATEVER_VALUES'), buildFavoriteItemWith('WHATEVER_VALUES')],
    });
    const received = vi.fn();
    let lists = [keep, doomed];
    window.localStorage.setItem('favorites_default_list', String(doomed.id));
    window.sessionStorage.setItem('favorites_lists', '{"value":[],"expiry":1}');
    server.use(
      graphql.query('FavoritesLists', () =>
        HttpResponse.json({ data: { customer: { wishlists: connection(lists.map(rawList)) } } }),
      ),
      graphql.mutation('DeleteFavoritesLists', ({ variables }) => {
        received(variables);
        lists = [keep];

        return HttpResponse.json({ data: { wishlist: { deleteWishlists: { result: 'ok' } } } });
      }),
    );
    mockProducts([]);

    const { user } = renderWithProviders(<Favorites />, {
      preloadedState,
      initialEntries: [`/favorites?list=${doomed.id}`],
    });

    await user.click(await screen.findByRole('button', { name: 'Delete list' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Delete Doomed? Its 2 favorites will be removed.'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete list' }));

    await waitFor(() => expect(received).toHaveBeenCalledWith({ listIds: [doomed.id] }));
    expect(await screen.findByRole('tab', { name: 'Keep (0)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('tab', { name: 'Doomed (2)' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('favorites_default_list')).toBeNull();
    expect(window.sessionStorage.getItem('favorites_lists')).toBeNull();
    expect(snackbar.success).toHaveBeenCalledWith('List deleted');
  });

  it('keeps the default-list key when a different list is deleted', async () => {
    const defaultList = buildFavoriteListWith({ name: 'Default', items: [] });
    const other = buildFavoriteListWith({ name: 'Other', items: [] });
    window.localStorage.setItem('favorites_default_list', String(defaultList.id));
    mockLists([defaultList, other]);
    server.use(
      graphql.mutation('DeleteFavoritesLists', () =>
        HttpResponse.json({ data: { wishlist: { deleteWishlists: { result: 'ok' } } } }),
      ),
    );

    const { user } = renderWithProviders(<Favorites />, {
      preloadedState,
      initialEntries: [`/favorites?list=${other.id}`],
    });

    await user.click(await screen.findByRole('button', { name: 'Delete list' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete list' }));

    await waitFor(() => expect(snackbar.success).toHaveBeenCalledWith('List deleted'));
    expect(window.localStorage.getItem('favorites_default_list')).toBe(String(defaultList.id));
  });

  it('shows the generic error and keeps the dialog open when renaming fails', async () => {
    mockLists([buildFavoriteListWith({ name: 'Old', items: [] })]);
    server.use(
      graphql.mutation('RenameFavoritesList', () =>
        HttpResponse.json({ errors: [{ message: 'nope' }] }),
      ),
    );

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    await user.click(await screen.findByRole('button', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'List name' }), ' 2');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(snackbar.error).toHaveBeenCalledWith(
        'Something went wrong updating your favorites. Please try again.',
      ),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `yarn test --run src/pages/Favorites/index.test.tsx`
Expected: the six new tests FAIL (no "New list" / "Rename" / "Delete list" buttons).

- [ ] **Step 3: Write the actions hook**

`src/pages/Favorites/useFavoriteActions.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import { createWishlist, deleteWishlists, updateWishlistName } from '@/shared/service/bc';
import { snackbar } from '@/utils/b3Tip';

import { clearDefaultListId, getDefaultListId, invalidateListsCache } from './storage';
import { favoritesListsQueryKey } from './useFavoriteLists';

/**
 * Every write the page makes. Each success drops the theme's session cache and refetches
 * our lists, so the star on the next storefront page and this page agree (spec §9).
 */
export const useFavoriteActions = (customerId: number) => {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();

  const refresh = () => {
    invalidateListsCache();

    return queryClient.invalidateQueries({ queryKey: favoritesListsQueryKey(customerId) });
  };

  const onError = () => {
    snackbar.error(b3Lang('favorites.error.generic'));
    refresh();
  };

  const createList = useMutation({
    mutationFn: (name: string) => createWishlist(name),
    onSuccess: () => refresh(),
    onError,
  });

  const renameList = useMutation({
    mutationFn: ({ listId, name }: { listId: number; name: string }) =>
      updateWishlistName(listId, name),
    onSuccess: () => {
      snackbar.success(b3Lang('favorites.renamed'));
      refresh();
    },
    onError,
  });

  const deleteList = useMutation({
    mutationFn: async (listId: number) => {
      await deleteWishlists([listId]);

      // The theme's one-click save targets the default list; never leave it pointing at a deleted one.
      if (getDefaultListId() === listId) {
        clearDefaultListId();
      }
    },
    onSuccess: () => {
      snackbar.success(b3Lang('favorites.deleteList.deleted'));
      refresh();
    },
    onError,
  });

  const isBusy = [createList, renameList, deleteList].some((mutation) => mutation.isPending);

  return { createList, renameList, deleteList, isBusy };
};
```

- [ ] **Step 4: Write the dialog and toolbar**

`src/pages/Favorites/components/ListNameDialog.tsx`:

```tsx
import { useState } from 'react';
import { TextField } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';

interface ListNameDialogProps {
  isOpen: boolean;
  /** Changes whenever the dialog opens for a different purpose (create vs. rename list X); resets the draft. */
  dialogKey: string;
  title: string;
  initialName: string;
  submitLabel: string;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}

const MAX_NAME_LENGTH = 255;

export default function ListNameDialog({
  isOpen,
  dialogKey,
  title,
  initialName,
  submitLabel,
  loading,
  onCancel,
  onSubmit,
}: ListNameDialogProps) {
  const b3Lang = useB3Lang();
  // The draft is keyed by purpose so a stale draft falls back to the initial name without an
  // effect (B3Dialog has to stay mounted while closed, so the component never remounts).
  const [draft, setDraft] = useState<{ key: string; name: string } | null>(null);
  const name = draft && draft.key === dialogKey ? draft.name : initialName;
  const trimmed = name.trim();
  const showRequired = draft?.key === dialogKey && trimmed.length === 0;

  const submit = () => {
    if (trimmed.length > 0) {
      onSubmit(trimmed);
    }
  };

  return (
    <B3Dialog
      isOpen={isOpen}
      title={title}
      rightSizeBtn={submitLabel}
      disabledSaveBtn={trimmed.length === 0}
      loading={loading}
      handleLeftClick={onCancel}
      handRightClick={submit}
    >
      <TextField
        autoFocus
        fullWidth
        margin="dense"
        label={b3Lang('favorites.listName.label')}
        value={name}
        onChange={(event) => setDraft({ key: dialogKey, name: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
        error={showRequired}
        helperText={showRequired ? b3Lang('favorites.listName.required') : ' '}
        inputProps={{ maxLength: MAX_NAME_LENGTH }}
      />
    </B3Dialog>
  );
}
```

`src/pages/Favorites/components/ListToolbar.tsx`:

```tsx
import { Box, Button, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { FavoriteList } from '../favorites';

interface ListToolbarProps {
  list: FavoriteList;
  disabled: boolean;
  onRename: () => void;
  onDelete: () => void;
}

export default function ListToolbar({ list, disabled, onRename, onDelete }: ListToolbarProps) {
  const b3Lang = useB3Lang();

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2 }}>
      <Typography variant="h6" component="h2" sx={{ flex: 1, minWidth: '10rem' }}>
        {list.name}
      </Typography>
      <Button size="small" disabled={disabled} onClick={onRename}>
        {b3Lang('favorites.rename')}
      </Button>
      <Button size="small" color="error" disabled={disabled} onClick={onDelete}>
        {b3Lang('favorites.deleteList')}
      </Button>
    </Box>
  );
}
```

- [ ] **Step 5: Wire the page**

In `src/pages/Favorites/index.tsx`:

1. Imports. Add `import { useState } from 'react';` as the first import; add `import B3Dialog from '@/components/B3Dialog';` before the `B3Spin` import; add `import ListNameDialog from './components/ListNameDialog';` and `import ListToolbar from './components/ListToolbar';` among the component imports (alphabetical: after `ListTabs`... `simple-import-sort` orders `ListNameDialog` < `ListTabs` < `ListToolbar`); add `import { useFavoriteActions } from './useFavoriteActions';` before the `useFavoriteLists` import.

2. Above `const selectList = …`, add the dialog state type:

```tsx
type NameDialogState = { mode: 'create' } | { mode: 'rename'; list: FavoriteList };
```

3. After the `const rows = …` statement, add:

```tsx
  const actions = useFavoriteActions(customerId);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FavoriteList | null>(null);
```

4. After `selectListId`, add the handlers:

```tsx
  const handleCreateList = async (name: string) => {
    try {
      const created = await actions.createList.mutateAsync(name);
      setNameDialog(null);
      selectListId(created.entityId);
    } catch {
      // the actions hook already toasted the failure; keep the dialog open to retry
    }
  };

  const handleRenameList = async (list: FavoriteList, name: string) => {
    try {
      await actions.renameList.mutateAsync({ listId: list.id, name });
      setNameDialog(null);
    } catch {
      // toasted by the actions hook
    }
  };

  const handleDeleteList = async (list: FavoriteList) => {
    try {
      await actions.deleteList.mutateAsync(list.id);
      setPendingDelete(null);

      if (selectedList?.id === list.id) {
        setSearchParams({}, { replace: true });
      }
    } catch {
      // toasted by the actions hook
    }
  };
```

5. In the JSX, as the first child of the layout `<Box>` (before the `productsFailed` Alert), add:

```tsx
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button
            variant="outlined"
            disabled={actions.isBusy}
            onClick={() => setNameDialog({ mode: 'create' })}
          >
            {b3Lang('favorites.newList')}
          </Button>
        </Box>
```

6. Replace the `<Typography variant="h6" component="h2" sx={{ mb: 2 }}>{selectedList.name}</Typography>` block with:

```tsx
            <ListToolbar
              list={selectedList}
              disabled={actions.isBusy}
              onRename={() => setNameDialog({ mode: 'rename', list: selectedList })}
              onDelete={() => setPendingDelete(selectedList)}
            />
```

7. After the layout `</Box>` and before `</B3Spin>`, add the dialogs:

```tsx
      {/* Dialogs sit after the layout Box: B3Dialog renders an in-flow wrapper even while closed. */}
      <ListNameDialog
        isOpen={nameDialog !== null}
        dialogKey={nameDialog?.mode === 'rename' ? `rename-${nameDialog.list.id}` : 'create'}
        title={b3Lang(nameDialog?.mode === 'rename' ? 'favorites.rename' : 'favorites.newList')}
        initialName={nameDialog?.mode === 'rename' ? nameDialog.list.name : ''}
        submitLabel={b3Lang(
          nameDialog?.mode === 'rename' ? 'favorites.listName.save' : 'favorites.listName.create',
        )}
        loading={actions.createList.isPending || actions.renameList.isPending}
        onCancel={() => setNameDialog(null)}
        onSubmit={(name) =>
          nameDialog?.mode === 'rename'
            ? handleRenameList(nameDialog.list, name)
            : handleCreateList(name)
        }
      />
      <B3Dialog
        isOpen={pendingDelete !== null}
        title={b3Lang('favorites.deleteList')}
        rightSizeBtn={b3Lang('favorites.deleteList')}
        loading={actions.deleteList.isPending}
        handleLeftClick={() => setPendingDelete(null)}
        handRightClick={() => {
          if (pendingDelete) {
            handleDeleteList(pendingDelete);
          }
        }}
      >
        <Typography>
          {pendingDelete
            ? b3Lang('favorites.deleteList.confirm', {
                name: pendingDelete.name,
                count: pendingDelete.items.length,
              })
            : ''}
        </Typography>
      </B3Dialog>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Favorites/index.test.tsx`
Expected: PASS (19 tests).

Negative controls: (a) in `deleteList`'s `mutationFn`, remove the `clearDefaultListId()` branch; the delete test must fail on the default-list key. (b) In `ListNameDialog`, submit `name` instead of `trimmed`; the create test must fail on `{ name: 'Gift ideas' }`. Restore both.

- [ ] **Step 7: Type-check, lint, commit**

```bash
yarn tsc --noEmit
yarn eslint src/pages/Favorites
git add src/pages/Favorites
git commit -m "feat: B2B-0000 Create, rename and delete favorites lists

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Remove an item, and the Save to lists picker (copy, move, remove everywhere, inline create)

Spec §10.3 (Remove, Save to lists), §11 (GA4 on adds).

**Files:**
- Create: `src/pages/Favorites/analytics.ts`
- Create: `src/pages/Favorites/components/RowActions.tsx`
- Create: `src/pages/Favorites/components/SaveToListsDialog.tsx`
- Modify: `src/pages/Favorites/components/FavoriteItemsTable.tsx` (actions column)
- Modify: `src/pages/Favorites/useFavoriteActions.ts` (`removeItem`, `saveToLists`)
- Modify: `src/pages/Favorites/index.tsx`
- Modify: `src/pages/Favorites/index.test.tsx`

**Interfaces:**
- Consumes: `addWishlistItems`, `deleteWishlistItems`, `WishlistItemInput` (Task 2); `setDefaultListId` (Task 3); `membership`, `planSaveToLists`, `isEmptyPlan`, `SaveToListsPlan`, `ItemRef`, `FavoriteRow`, `FavoriteList` (Tasks 4-5); `pushDataLayerEvent` from `@/utils/analytics` (existing).
- Produces:
  - `trackAddToWishlist({ productId, variantId, name?, listName }): void` from `./analytics`.
  - `interface SaveToListsInput { plan: SaveToListsPlan; row: FavoriteRow; lists: FavoriteList[] }` and, on the actions hook, `removeItem: UseMutationResult<void, Error, { listId: number; listName: string; itemId: number }>` and `saveToLists: UseMutationResult<{ addedTo: FavoriteList[]; removedCount: number }, Error, SaveToListsInput>`.
  - `RowActions({ row, disabled, onSaveToLists, onRemove })` (Task 11 adds `productsFailed`, `onAddToCart`).
  - `SaveToListsDialog({ row, lists, loading, onCancel, onSave, onCreateList })`.
  - `FavoriteItemsTable` gains `disabled`, `onSaveToLists`, `onRemove` props.

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/Favorites/index.test.tsx`:

```tsx
describe('remove and save to lists', () => {
  const addItemsHandler = (received: ReturnType<typeof vi.fn>) =>
    graphql.mutation('AddFavoritesItems', ({ variables }) => {
      received(variables);

      return HttpResponse.json({
        data: { wishlist: { addWishlistItems: { result: { entityId: variables.listId } } } },
      });
    });

  const deleteItemsHandler = (received: ReturnType<typeof vi.fn>) =>
    graphql.mutation('DeleteFavoritesItems', ({ variables }) => {
      received(variables);

      return HttpResponse.json({
        data: { wishlist: { deleteWishlistItems: { result: { entityId: variables.listId } } } },
      });
    });

  it('removes an item and invalidates the theme cache', async () => {
    const product = buildFavoriteProductWith({ name: 'Slicker Brush' });
    const list = listWith(product);
    const received = vi.fn();
    window.sessionStorage.setItem('favorites_lists', '{"value":[],"expiry":1}');
    mockLists([list]);
    mockProducts([product]);
    server.use(deleteItemsHandler(received));

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    await user.click(within(row).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(received).toHaveBeenCalledWith({ listId: list.id, itemIds: [list.items[0].id] }),
    );
    expect(snackbar.success).toHaveBeenCalledWith('Removed from My Favorites');
    expect(window.sessionStorage.getItem('favorites_lists')).toBeNull();
  });

  it('copies an item to another list from the save-to-lists dialog', async () => {
    const variant = buildFavoriteVariantWith('WHATEVER_VALUES');
    const product = buildFavoriteProductWith({ name: 'Slicker Brush', variants: [variant] });
    const current = buildFavoriteListWith({
      name: 'My Favorites',
      items: [buildFavoriteItemWith({ productId: product.id, variantId: variant.variant_id })],
    });
    const other = buildFavoriteListWith({ name: 'Spring order', items: [] });
    const received = vi.fn();
    mockLists([current, other]);
    mockProducts([product]);
    server.use(addItemsHandler(received));

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    await user.click(within(row).getByRole('button', { name: 'Save to lists' }));

    const dialog = await screen.findByRole('dialog', { name: 'Save Slicker Brush to lists' });
    expect(within(dialog).getByRole('checkbox', { name: 'My Favorites' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Spring order' })).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.click(within(dialog).getByRole('checkbox', { name: 'Spring order' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(received).toHaveBeenCalledWith({
        listId: other.id,
        items: [{ productEntityId: product.id, variantEntityId: variant.variant_id }],
      }),
    );
    expect(snackbar.success).toHaveBeenCalledWith('Saved to Spring order');
    expect(window.localStorage.getItem('favorites_default_list')).toBe(String(other.id));
    expect(window.dataLayer).toContainEqual({
      event: 'add_to_wishlist',
      ecommerce: {
        items: [
          {
            item_id: String(product.id),
            item_name: 'Slicker Brush',
            item_variant: String(variant.variant_id),
            item_list_name: 'Spring order',
            quantity: 1,
          },
        ],
      },
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('moves an item by checking another list and unchecking the current one', async () => {
    const product = buildFavoriteProductWith({ name: 'Slicker Brush' });
    const current = listWith(product);
    const other = buildFavoriteListWith({ name: 'Spring order', items: [] });
    const added = vi.fn();
    const deleted = vi.fn();
    mockLists([current, other]);
    mockProducts([product]);
    server.use(addItemsHandler(added), deleteItemsHandler(deleted));

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    await user.click(within(row).getByRole('button', { name: 'Save to lists' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Spring order' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'My Favorites' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(added).toHaveBeenCalledWith({
        listId: other.id,
        items: [{ productEntityId: product.id }],
      }),
    );
    expect(deleted).toHaveBeenCalledWith({ listId: current.id, itemIds: [current.items[0].id] });
    expect(snackbar.success).toHaveBeenCalledWith('Favorites updated');
  });

  it('warns that unchecking every list removes the product, then removes it on save', async () => {
    const product = buildFavoriteProductWith({ name: 'Slicker Brush' });
    const current = listWith(product);
    const added = vi.fn();
    const deleted = vi.fn();
    mockLists([current]);
    mockProducts([product]);
    server.use(addItemsHandler(added), deleteItemsHandler(deleted));

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    await user.click(within(row).getByRole('button', { name: 'Save to lists' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: 'My Favorites' }));

    expect(
      within(dialog).getByText('Unchecking every list removes this product from your favorites.'),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(deleted).toHaveBeenCalledWith({ listId: current.id, itemIds: [current.items[0].id] }),
    );
    expect(added).not.toHaveBeenCalled();
  });

  it('creates a new list from the dialog, pre-checks it, and saves into it', async () => {
    const product = buildFavoriteProductWith({ name: 'Slicker Brush' });
    const current = listWith(product);
    const created = buildFavoriteListWith({ name: 'Gift ideas', items: [] });
    const createReceived = vi.fn();
    const added = vi.fn();
    let lists = [current];
    server.use(
      graphql.query('FavoritesLists', () =>
        HttpResponse.json({ data: { customer: { wishlists: connection(lists.map(rawList)) } } }),
      ),
      graphql.mutation('CreateFavoritesList', ({ variables }) => {
        createReceived(variables);
        lists = [current, created];

        return HttpResponse.json({
          data: {
            wishlist: { createWishlist: { result: { entityId: created.id, name: created.name } } },
          },
        });
      }),
      addItemsHandler(added),
    );
    mockProducts([product]);

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    await user.click(within(row).getByRole('button', { name: 'Save to lists' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'New list name' }), 'Gift ideas');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createReceived).toHaveBeenCalledWith({ name: 'Gift ideas' }));
    expect(await within(dialog).findByRole('checkbox', { name: 'Gift ideas' })).toBeChecked();

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(added).toHaveBeenCalledWith({
        listId: created.id,
        items: [{ productEntityId: product.id }],
      }),
    );
    expect(snackbar.success).toHaveBeenCalledWith('Saved to Gift ideas');
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `yarn test --run src/pages/Favorites/index.test.tsx`
Expected: the five new tests FAIL (no "Remove" / "Save to lists" buttons).

- [ ] **Step 3: Write the analytics helper**

`src/pages/Favorites/analytics.ts`:

```ts
import { pushDataLayerEvent } from '@/utils/analytics';

interface AddToWishlistEvent {
  productId: number;
  variantId: number | null;
  /** Unknown for guest-merge rows, which are saved before the catalog is loaded. */
  name?: string;
  listName: string;
}

/**
 * GA4 add_to_wishlist, one item per successful add (spec §11). item_id / item_variant are the
 * product and variant ids, mirroring what the theme's star has in its data attributes.
 */
export const trackAddToWishlist = ({ productId, variantId, name, listName }: AddToWishlistEvent) =>
  pushDataLayerEvent({
    event: 'add_to_wishlist',
    ecommerce: {
      items: [
        {
          item_id: String(productId),
          ...(name ? { item_name: name } : {}),
          ...(variantId === null ? {} : { item_variant: String(variantId) }),
          item_list_name: listName,
          quantity: 1,
        },
      ],
    },
  });
```

- [ ] **Step 4: Extend the actions hook**

In `src/pages/Favorites/useFavoriteActions.ts`:

1. Replace the `@/shared/service/bc` import with:

```ts
import {
  addWishlistItems,
  createWishlist,
  deleteWishlistItems,
  deleteWishlists,
  updateWishlistName,
  WishlistItemInput,
} from '@/shared/service/bc';
```

2. Add these imports (before the `./storage` import; `simple-import-sort` puts `./analytics` and `./favorites` first):

```ts
import { trackAddToWishlist } from './analytics';
import { FavoriteList, FavoriteRow, ItemRef, SaveToListsPlan } from './favorites';
```

and extend the storage import to `{ clearDefaultListId, getDefaultListId, invalidateListsCache, setDefaultListId }`.

3. Above `export const useFavoriteActions`, add:

```ts
export interface SaveToListsInput {
  plan: SaveToListsPlan;
  row: FavoriteRow;
  /** Every list the dialog showed, including ones created inside it, so names resolve for toasts and GA4. */
  lists: FavoriteList[];
}

const toWishlistItem = ({ productId, variantId }: ItemRef): WishlistItemInput =>
  variantId === null
    ? { productEntityId: productId }
    : { productEntityId: productId, variantEntityId: variantId };
```

4. After the `deleteList` mutation, add:

```ts
  const removeItem = useMutation({
    mutationFn: ({ listId, itemId }: { listId: number; listName: string; itemId: number }) =>
      deleteWishlistItems(listId, [itemId]),
    onSuccess: (_, { listName }) => {
      snackbar.success(b3Lang('favorites.item.removed', { list: listName }));
      refresh();
    },
    onError,
  });

  const saveToLists = useMutation({
    mutationFn: async ({ plan, row, lists }: SaveToListsInput) => {
      const item = toWishlistItem(row.item);
      await Promise.all(plan.adds.map(({ listId }) => addWishlistItems(listId, [item])));
      await Promise.all(
        plan.removes.map(({ listId, itemId }) => deleteWishlistItems(listId, [itemId])),
      );
      const addedTo = plan.adds.flatMap(({ listId }) => lists.filter((list) => list.id === listId));

      return { addedTo, removedCount: plan.removes.length };
    },
    onSuccess: ({ addedTo, removedCount }, { row }) => {
      const lastAdded = addedTo[addedTo.length - 1];

      if (lastAdded) {
        setDefaultListId(lastAdded.id);
      }

      addedTo.forEach((list) =>
        trackAddToWishlist({
          productId: row.item.productId,
          variantId: row.item.variantId,
          name: row.name,
          listName: list.name,
        }),
      );
      snackbar.success(
        lastAdded && addedTo.length === 1 && removedCount === 0
          ? b3Lang('favorites.picker.saved', { list: lastAdded.name })
          : b3Lang('favorites.picker.updated'),
      );
      refresh();
    },
    onError,
  });
```

5. Update the tail of the hook:

```ts
  const isBusy = [createList, renameList, deleteList, removeItem, saveToLists].some(
    (mutation) => mutation.isPending,
  );

  return { createList, renameList, deleteList, removeItem, saveToLists, isBusy };
```

- [ ] **Step 5: Write the row actions and the picker**

`src/pages/Favorites/components/RowActions.tsx`:

```tsx
import { Box, Button } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { FavoriteRow } from '../favorites';

interface RowActionsProps {
  row: FavoriteRow;
  disabled: boolean;
  onSaveToLists: (row: FavoriteRow) => void;
  onRemove: (row: FavoriteRow) => void;
}

export default function RowActions({ row, disabled, onSaveToLists, onRemove }: RowActionsProps) {
  const b3Lang = useB3Lang();

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'flex-end' }}>
      <Button size="small" disabled={disabled} onClick={() => onSaveToLists(row)}>
        {b3Lang('favorites.item.saveToLists')}
      </Button>
      <Button size="small" color="error" disabled={disabled} onClick={() => onRemove(row)}>
        {b3Lang('favorites.item.remove')}
      </Button>
    </Box>
  );
}
```

`src/pages/Favorites/components/SaveToListsDialog.tsx`:

```tsx
import { useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, FormGroup, TextField, Typography } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';

import { FavoriteList, FavoriteRow, isEmptyPlan, membership, planSaveToLists } from '../favorites';
import { SaveToListsInput } from '../useFavoriteActions';

interface SaveToListsDialogProps {
  /** The favorite being saved; null keeps the dialog mounted but closed. */
  row: FavoriteRow | null;
  lists: FavoriteList[];
  loading: boolean;
  onCancel: () => void;
  onSave: (input: SaveToListsInput) => void;
  onCreateList: (name: string) => Promise<{ entityId: number; name: string }>;
}

interface Draft {
  rowId: number;
  selected: Set<number>;
  createdLists: FavoriteList[];
  newListName: string;
}

const noPlan = { adds: [], removes: [] };

/**
 * The picker (spec §10.3): one checkbox per list showing membership, inline create, Save
 * applies the diff. Checking another list copies, also unchecking the current one moves,
 * unchecking everything removes the product from every list.
 */
export default function SaveToListsDialog({
  row,
  lists,
  loading,
  onCancel,
  onSave,
  onCreateList,
}: SaveToListsDialogProps) {
  const b3Lang = useB3Lang();
  // Draft keyed by the row: opening the dialog for another favorite starts from that row's
  // membership without an effect (B3Dialog has to stay mounted while closed).
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const current: Draft =
    row && draft?.rowId === row.item.id
      ? draft
      : {
          rowId: row?.item.id ?? 0,
          selected: row ? membership(lists, row.item) : new Set<number>(),
          createdLists: [],
          newListName: '',
        };
  const allLists = [
    ...lists,
    ...current.createdLists.filter((created) => !lists.some((list) => list.id === created.id)),
  ];
  const plan = row ? planSaveToLists({ lists: allLists, ref: row.item, selected: current.selected }) : noPlan;

  const toggle = (listId: number) => {
    const selected = new Set(current.selected);

    if (selected.has(listId)) {
      selected.delete(listId);
    } else {
      selected.add(listId);
    }

    setDraft({ ...current, selected });
  };

  const createList = async () => {
    const name = current.newListName.trim();

    if (!name) {
      return;
    }

    setIsCreating(true);

    try {
      const created = await onCreateList(name);
      setDraft({
        ...current,
        selected: new Set([...current.selected, created.entityId]),
        createdLists: [
          ...current.createdLists,
          { id: created.entityId, name: created.name, isPublic: false, items: [] },
        ],
        newListName: '',
      });
    } catch {
      // the actions hook already toasted the failure; keep the draft as it was
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <B3Dialog
      isOpen={row !== null}
      title={b3Lang('favorites.picker.title', { product: row?.name ?? '' })}
      rightSizeBtn={b3Lang('favorites.listName.save')}
      disabledSaveBtn={isEmptyPlan(plan) || isCreating}
      loading={loading}
      handleLeftClick={onCancel}
      handRightClick={() => {
        if (row) {
          onSave({ plan, row, lists: allLists });
        }
      }}
    >
      <FormGroup>
        {allLists.map((list) => (
          <FormControlLabel
            key={list.id}
            label={list.name}
            control={
              <Checkbox checked={current.selected.has(list.id)} onChange={() => toggle(list.id)} />
            }
          />
        ))}
      </FormGroup>
      {current.selected.size === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {b3Lang('favorites.picker.removeHint')}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
        <TextField
          size="small"
          fullWidth
          label={b3Lang('favorites.picker.newListName')}
          value={current.newListName}
          onChange={(event) => setDraft({ ...current, newListName: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              createList();
            }
          }}
        />
        <Button
          variant="outlined"
          disabled={isCreating || current.newListName.trim().length === 0}
          onClick={createList}
        >
          {b3Lang('favorites.listName.create')}
        </Button>
      </Box>
    </B3Dialog>
  );
}
```

Replace `src/pages/Favorites/components/FavoriteItemsTable.tsx` with:

```tsx
import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { currencyFormat } from '@/utils/b3CurrencyFormat';

import { FavoriteRow } from '../favorites';

import ProductSummary from './ProductSummary';
import RowActions from './RowActions';

interface FavoriteItemsTableProps {
  rows: FavoriteRow[];
  productsFailed: boolean;
  disabled: boolean;
  onSaveToLists: (row: FavoriteRow) => void;
  onRemove: (row: FavoriteRow) => void;
}

export default function FavoriteItemsTable({
  rows,
  productsFailed,
  disabled,
  onSaveToLists,
  onRemove,
}: FavoriteItemsTableProps) {
  const b3Lang = useB3Lang();

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>{b3Lang('favorites.column.product')}</TableCell>
          <TableCell>{b3Lang('favorites.column.sku')}</TableCell>
          <TableCell>{b3Lang('favorites.column.price')}</TableCell>
          <TableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.item.id}>
            <TableCell>
              <ProductSummary row={row} productsFailed={productsFailed} />
            </TableCell>
            <TableCell>{productsFailed ? '' : row.sku}</TableCell>
            <TableCell>
              {productsFailed || row.price === null ? '' : currencyFormat(row.price)}
            </TableCell>
            <TableCell align="right">
              <RowActions
                row={row}
                disabled={disabled}
                onSaveToLists={onSaveToLists}
                onRemove={onRemove}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 6: Wire the page**

In `src/pages/Favorites/index.tsx`:

1. Imports: add `import SaveToListsDialog from './components/SaveToListsDialog';` after the `ListToolbar` import; change the `./favorites` import to `import { FavoriteList, FavoriteRow, hydrateRows } from './favorites';`; change the actions import to `import { SaveToListsInput, useFavoriteActions } from './useFavoriteActions';`.

2. After `const [pendingDelete, …]`, add:

```tsx
  const [pickerRow, setPickerRow] = useState<FavoriteRow | null>(null);
```

3. After `handleDeleteList`, add:

```tsx
  const handleSaveToLists = async (input: SaveToListsInput) => {
    try {
      await actions.saveToLists.mutateAsync(input);
      setPickerRow(null);
    } catch {
      // toasted by the actions hook; keep the picker open
    }
  };
```

4. Replace `<FavoriteItemsTable rows={rows} productsFailed={productsFailed} />` with:

```tsx
              <FavoriteItemsTable
                rows={rows}
                productsFailed={productsFailed}
                disabled={actions.isBusy}
                onSaveToLists={setPickerRow}
                onRemove={(row) =>
                  actions.removeItem.mutate({
                    listId: selectedList.id,
                    listName: selectedList.name,
                    itemId: row.item.id,
                  })
                }
              />
```

5. After the delete `</B3Dialog>`, add:

```tsx
      <SaveToListsDialog
        row={pickerRow}
        lists={lists}
        loading={actions.saveToLists.isPending}
        onCancel={() => setPickerRow(null)}
        onSave={handleSaveToLists}
        onCreateList={(name) => actions.createList.mutateAsync(name)}
      />
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Favorites/index.test.tsx`
Expected: PASS (24 tests).

Negative controls: (a) in `saveToLists`'s `onSuccess`, remove `setDefaultListId(lastAdded.id)`; the copy test must fail on the default-list key. (b) In `SaveToListsDialog`, drop the `removeHint` block; the remove-everywhere test must fail. (c) In `trackAddToWishlist`, drop `item_variant`; the copy test must fail on the dataLayer event. Restore all.

- [ ] **Step 8: Type-check, lint, commit**

```bash
yarn tsc --noEmit
yarn eslint src/pages/Favorites
git add src/pages/Favorites
git commit -m "feat: B2B-0000 Remove favorites and save them to lists from the picker

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Add to cart: one row, or the whole list, at fixed quantities

Spec §10.3 (Add to cart, Add all to cart), §9 (cart).

**Files:**
- Modify: `src/pages/Favorites/useFavoriteActions.ts` (`addToCart`)
- Modify: `src/pages/Favorites/components/RowActions.tsx` (cart action / Choose options link)
- Modify: `src/pages/Favorites/components/FavoriteItemsTable.tsx` (pass-through props)
- Modify: `src/pages/Favorites/components/ListToolbar.tsx` (Add all to cart)
- Modify: `src/pages/Favorites/index.tsx`
- Modify: `src/pages/Favorites/index.test.tsx`

**Interfaces:**
- Consumes: `planAddToCart`, `AddToCartPlan` (Task 5); `createOrUpdateExistingCart` from `@/utils/cartUtils` and `b3TriggerCartNumber` from `@/utils/b3TriggerCartNumber` (existing). The cart helper reads `productId`, `variantId`, `quantity`, `newSelectOptionList` off each line, and posts the storefront mutation named `addCartLineItemsTwo` (existing cart) or `createCartSimple` (no cart); see `src/shared/service/bc/graphql/cart.ts`.
- Produces: on the actions hook, `addToCart: UseMutationResult<AddToCartPlan, Error, { plan: AddToCartPlan }>`; `RowActions` gains `productsFailed: boolean` and `onAddToCart: (row: FavoriteRow) => void`; `FavoriteItemsTable` gains `onAddToCart`; `ListToolbar` gains `hasItems: boolean` and `onAddAll: () => void`.

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/Favorites/index.test.tsx`:

```tsx
describe('add to cart', () => {
  const existingCart = { data: { site: { cart: { entityId: 'cart-1', lineItems: {} } } } };
  const sizeOption = { option_id: 1, display_name: 'Size', sort_order: 0, is_required: true };

  const mockCart = (received: ReturnType<typeof vi.fn>) =>
    server.use(
      graphql.query('getCart', () => HttpResponse.json(existingCart)),
      graphql.mutation('addCartLineItemsTwo', ({ variables }) => {
        received(variables);

        return HttpResponse.json({
          data: { cart: { addCartLineItems: { cart: { entityId: 'cart-1' } } } },
        });
      }),
    );

  it('adds an item to the cart at the catalog minimum quantity', async () => {
    const variant = buildFavoriteVariantWith('WHATEVER_VALUES');
    const product = buildFavoriteProductWith({
      name: 'Slicker Brush',
      variants: [variant],
      orderQuantityMinimum: 6,
    });
    const received = vi.fn();
    mockLists([listWith(product)]);
    mockProducts([product]);
    mockCart(received);

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    await user.click(within(row).getByRole('button', { name: 'Add to cart' }));

    await waitFor(() =>
      expect(received).toHaveBeenCalledWith({
        addCartLineItemsInput: {
          cartEntityId: 'cart-1',
          data: {
            lineItems: [
              {
                quantity: 6,
                productEntityId: product.id,
                variantEntityId: variant.variant_id,
                selectedOptions: { multipleChoices: [], textFields: [] },
              },
            ],
          },
        },
      }),
    );
    expect(snackbar.success).toHaveBeenCalledWith(
      'Added to cart',
      expect.objectContaining({ action: expect.objectContaining({ label: 'View cart' }) }),
    );
  });

  it('adds every addable row to the cart and reports the skipped rows', async () => {
    const addable = buildFavoriteProductWith({ name: 'Addable' });
    const needsOptions = buildFavoriteProductWith({ name: 'Needs options', options: [sizeOption] });
    const gone = buildFavoriteProductWith({ name: 'Gone' });
    const list = buildFavoriteListWith({
      name: 'My Favorites',
      items: [addable, needsOptions, gone].map((product) =>
        buildFavoriteItemWith({ productId: product.id, variantId: null }),
      ),
    });
    const received = vi.fn();
    mockLists([list]);
    mockProducts([addable, needsOptions]); // `gone` is missing from the catalog response
    mockCart(received);

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    await screen.findByRole('row', { name: /Addable/ });
    await user.click(screen.getByRole('button', { name: 'Add all to cart' }));

    await waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received.mock.calls[0][0].addCartLineItemsInput.data.lineItems).toEqual([
      {
        quantity: 1,
        productEntityId: addable.id,
        variantEntityId: addable.variants[0].variant_id,
        selectedOptions: { multipleChoices: [], textFields: [] },
      },
    ]);
    expect(snackbar.success).toHaveBeenCalledWith(
      '1 item added to cart',
      expect.objectContaining({
        description: '2 items skipped: they need options or are unavailable',
      }),
    );
  });

  it('says there is nothing to add when no row can go to the cart', async () => {
    const needsOptions = buildFavoriteProductWith({ name: 'Needs options', options: [sizeOption] });
    const received = vi.fn();
    mockLists([listWith(needsOptions)]);
    mockProducts([needsOptions]);
    mockCart(received);

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    await screen.findByRole('row', { name: /Needs options/ });
    await user.click(screen.getByRole('button', { name: 'Add all to cart' }));

    await waitFor(() =>
      expect(snackbar.info).toHaveBeenCalledWith(
        'Nothing to add: these items need options or are unavailable.',
      ),
    );
    expect(received).not.toHaveBeenCalled();
  });

  it('links option products to the product page in the top window instead of adding blindly', async () => {
    const needsOptions = buildFavoriteProductWith({
      name: 'Needs options',
      productUrl: 'https://store.example/needs-options/',
      options: [sizeOption],
    });
    mockLists([listWith(needsOptions)]);
    mockProducts([needsOptions]);

    renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Needs options/ });
    const link = within(row).getByRole('link', { name: 'Choose options' });
    expect(link).toHaveAttribute('href', 'https://store.example/needs-options/');
    expect(link).toHaveAttribute('target', '_top');
    expect(within(row).queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument();
  });

  it('offers no cart action for a favorite whose product is gone', async () => {
    mockLists([buildFavoriteListWith({ items: [buildFavoriteItemWith('WHATEVER_VALUES')] })]);
    mockProducts([]);

    renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /No longer available/ });
    expect(within(row).queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('link', { name: 'Choose options' })).not.toBeInTheDocument();
  });

  it('shows the storefront message when the cart rejects the add', async () => {
    const product = buildFavoriteProductWith({ name: 'Slicker Brush' });
    mockLists([listWith(product)]);
    mockProducts([product]);
    server.use(
      graphql.query('getCart', () => HttpResponse.json(existingCart)),
      graphql.mutation('addCartLineItemsTwo', () =>
        HttpResponse.json({ errors: [{ message: 'Not enough stock' }] }),
      ),
    );

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    await user.click(within(row).getByRole('button', { name: 'Add to cart' }));

    await waitFor(() => expect(snackbar.error).toHaveBeenCalledWith('Not enough stock'));
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `yarn test --run src/pages/Favorites/index.test.tsx`
Expected: the six new tests FAIL (no cart buttons).

- [ ] **Step 3: Add the cart mutation**

In `src/pages/Favorites/useFavoriteActions.ts`:

1. Add imports (`@/utils/...` sorted after `@/shared/...`, before `./analytics`):

```ts
import b3TriggerCartNumber from '@/utils/b3TriggerCartNumber';
import { createOrUpdateExistingCart } from '@/utils/cartUtils';
```

and extend the `./favorites` import to `{ AddToCartPlan, FavoriteList, FavoriteRow, ItemRef, SaveToListsPlan }`.

2. Above `export const useFavoriteActions`, add:

```ts
const CART_URL = '/cart.php';
```

3. After the `saveToLists` mutation, add:

```ts
  const addToCart = useMutation({
    mutationFn: async ({ plan }: { plan: AddToCartPlan }) => {
      try {
        await createOrUpdateExistingCart(plan.lineItems);
      } finally {
        // Refresh the header count whether or not the add went through, as Quick Order does.
        b3TriggerCartNumber();
      }

      return plan;
    },
    onSuccess: (plan) => {
      // The React realm is the top window (only the DOM is portaled into the ThemeFrame),
      // so assigning location here leaves the portal correctly.
      const action = {
        label: b3Lang('favorites.cart.view'),
        onClick: () => {
          window.location.href = CART_URL;
        },
      };
      const added = plan.lineItems.length;
      const skipped = plan.skipped.length;

      if (added === 1 && skipped === 0) {
        snackbar.success(b3Lang('favorites.cart.addedOne'), { action });

        return;
      }

      snackbar.success(b3Lang('favorites.cart.addedMany', { count: added }), {
        action,
        description: skipped > 0 ? b3Lang('favorites.cart.skipped', { count: skipped }) : undefined,
      });
    },
    onError: (error: unknown) => {
      // The cart helper throws the storefront's own message; show it as the other pages do.
      snackbar.error(
        error instanceof Error && error.message ? error.message : b3Lang('favorites.error.generic'),
      );
    },
  });
```

4. Update the tail:

```ts
  const isBusy = [createList, renameList, deleteList, removeItem, saveToLists, addToCart].some(
    (mutation) => mutation.isPending,
  );

  return { createList, renameList, deleteList, removeItem, saveToLists, addToCart, isBusy };
```

- [ ] **Step 4: Add the cart actions to the row, the table and the toolbar**

Replace `src/pages/Favorites/components/RowActions.tsx` with:

```tsx
import { Box, Button } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { FavoriteRow } from '../favorites';

interface RowActionsProps {
  row: FavoriteRow;
  /** The catalog call failed: no cart action, since minimums and options are unknown. */
  productsFailed: boolean;
  disabled: boolean;
  onAddToCart: (row: FavoriteRow) => void;
  onSaveToLists: (row: FavoriteRow) => void;
  onRemove: (row: FavoriteRow) => void;
}

export default function RowActions({
  row,
  productsFailed,
  disabled,
  onAddToCart,
  onSaveToLists,
  onRemove,
}: RowActionsProps) {
  const b3Lang = useB3Lang();
  const showCartAction = !productsFailed && row.available;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'flex-end' }}>
      {/* Options need the product page. Leaves the portal: anchors in the ThemeFrame iframe need _top. */}
      {showCartAction && row.requiresOptions && (
        <Button
          size="small"
          variant="outlined"
          href={row.productUrl}
          target="_top"
          disabled={disabled}
        >
          {b3Lang('favorites.item.chooseOptions')}
        </Button>
      )}
      {showCartAction && !row.requiresOptions && row.purchasable && (
        <Button size="small" variant="outlined" disabled={disabled} onClick={() => onAddToCart(row)}>
          {b3Lang('favorites.item.addToCart')}
        </Button>
      )}
      <Button size="small" disabled={disabled} onClick={() => onSaveToLists(row)}>
        {b3Lang('favorites.item.saveToLists')}
      </Button>
      <Button size="small" color="error" disabled={disabled} onClick={() => onRemove(row)}>
        {b3Lang('favorites.item.remove')}
      </Button>
    </Box>
  );
}
```

In `src/pages/Favorites/components/FavoriteItemsTable.tsx`: add `onAddToCart: (row: FavoriteRow) => void;` to the props interface (after `disabled`), destructure it, and render `RowActions` as:

```tsx
              <RowActions
                row={row}
                productsFailed={productsFailed}
                disabled={disabled}
                onAddToCart={onAddToCart}
                onSaveToLists={onSaveToLists}
                onRemove={onRemove}
              />
```

Replace `src/pages/Favorites/components/ListToolbar.tsx` with:

```tsx
import { Box, Button, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { FavoriteList } from '../favorites';

interface ListToolbarProps {
  list: FavoriteList;
  disabled: boolean;
  /** Add all stays clickable whenever the list has rows; the page explains when none can be added. */
  hasItems: boolean;
  onRename: () => void;
  onDelete: () => void;
  onAddAll: () => void;
}

export default function ListToolbar({
  list,
  disabled,
  hasItems,
  onRename,
  onDelete,
  onAddAll,
}: ListToolbarProps) {
  const b3Lang = useB3Lang();

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2 }}>
      <Typography variant="h6" component="h2" sx={{ flex: 1, minWidth: '10rem' }}>
        {list.name}
      </Typography>
      <Button size="small" disabled={disabled} onClick={onRename}>
        {b3Lang('favorites.rename')}
      </Button>
      <Button size="small" color="error" disabled={disabled} onClick={onDelete}>
        {b3Lang('favorites.deleteList')}
      </Button>
      <Button size="small" variant="contained" disabled={disabled || !hasItems} onClick={onAddAll}>
        {b3Lang('favorites.addAllToCart')}
      </Button>
    </Box>
  );
}
```

- [ ] **Step 5: Wire the page**

In `src/pages/Favorites/index.tsx`:

1. Imports: add `import { snackbar } from '@/utils/b3Tip';` after the `@/store` import; extend the `./favorites` import to `{ FavoriteList, FavoriteRow, hydrateRows, planAddToCart }`.

2. After `handleSaveToLists`, add:

```tsx
  const addRowToCart = (row: FavoriteRow) =>
    actions.addToCart.mutate({ plan: planAddToCart([row]) });

  const handleAddAllToCart = () => {
    const plan = planAddToCart(rows);

    if (plan.lineItems.length === 0) {
      snackbar.info(b3Lang('favorites.cart.nothingToAdd'));

      return;
    }

    actions.addToCart.mutate({ plan });
  };
```

3. Add to the `<ListToolbar …/>` props: `hasItems={rows.length > 0}` and `onAddAll={handleAddAllToCart}`.

4. Add to the `<FavoriteItemsTable …/>` props: `onAddToCart={addRowToCart}`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Favorites/index.test.tsx`
Expected: PASS (30 tests).

Negative controls: (a) in `handleAddAllToCart`, drop the empty-plan guard; the nothing-to-add test must fail. (b) In `RowActions`, remove `target="_top"`; the choose-options test must fail. (c) In `addToCart`'s `onSuccess`, drop the `description`; the add-all test must fail. Restore all.

- [ ] **Step 7: Type-check, lint, commit**

```bash
yarn tsc --noEmit
yarn eslint src/pages/Favorites
git add src/pages/Favorites
git commit -m "feat: B2B-0000 Add favorites to the cart one row or one list at a time

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Guest-to-customer merge on page load

Spec §9 (merge trigger), §12.3, §13.

**Files:**
- Modify: `src/pages/Favorites/useFavoriteActions.ts` (`mergeGuest`)
- Modify: `src/pages/Favorites/index.tsx` (merge effect)
- Modify: `src/pages/Favorites/index.test.tsx`

**Interfaces:**
- Consumes: `planGuestMerge`, `GuestMergePlan` (Task 4); `readGuestFavorites`, `clearGuestFavorites`, `getDefaultListId`, `setDefaultListId` (Task 3); `createWishlist`, `addWishlistItems` (Task 2); `trackAddToWishlist` (Task 10).
- Produces: on the actions hook, `mergeGuest: UseMutationResult<{ target: { id: number; name: string }; rows: ItemRef[] }, Error, { plan: GuestMergePlan }>`.

- [ ] **Step 1: Write the failing tests**

In `src/pages/Favorites/index.test.tsx`, add `buildGuestFavoriteWith` to the `tests/test-utils` import. Append:

```tsx
describe('guest merge', () => {
  const guestStore = (rows: unknown[]) =>
    window.localStorage.setItem('favorites_guest', JSON.stringify({ value: rows, expiry: null }));

  const addItemsHandler = (received: ReturnType<typeof vi.fn>) =>
    graphql.mutation('AddFavoritesItems', ({ variables }) => {
      received(variables);

      return HttpResponse.json({
        data: { wishlist: { addWishlistItems: { result: { entityId: variables.listId } } } },
      });
    });

  it('adds the missing guest favorites to the default list, clears the guest store, and toasts', async () => {
    const present = buildFavoriteProductWith({ name: 'Already saved' });
    const missing = buildFavoriteProductWith({ name: 'New find' });
    const defaultList = buildFavoriteListWith({
      name: 'My Favorites',
      items: [buildFavoriteItemWith({ productId: present.id, variantId: null })],
    });
    const other = buildFavoriteListWith({ name: 'Other', items: [] });
    window.localStorage.setItem('favorites_default_list', String(defaultList.id));
    guestStore([
      buildGuestFavoriteWith({ productId: present.id, variantId: null }),
      buildGuestFavoriteWith({ productId: missing.id, variantId: 77 }),
    ]);
    const received = vi.fn();
    mockLists([other, defaultList]);
    mockProducts([present, missing]);
    server.use(addItemsHandler(received));

    renderWithProviders(<Favorites />, { preloadedState });

    await waitFor(() =>
      expect(received).toHaveBeenCalledWith({
        listId: defaultList.id,
        items: [{ productEntityId: missing.id, variantEntityId: 77 }],
      }),
    );
    expect(snackbar.success).toHaveBeenCalledWith('1 favorite added to My Favorites');
    expect(JSON.parse(window.localStorage.getItem('favorites_guest') ?? '')).toEqual({
      value: [],
      expiry: null,
    });
    expect(window.dataLayer).toContainEqual({
      event: 'add_to_wishlist',
      ecommerce: {
        items: [
          {
            item_id: String(missing.id),
            item_variant: '77',
            item_list_name: 'My Favorites',
            quantity: 1,
          },
        ],
      },
    });
  });

  it('creates "My Favorites" for the merge when the customer has no lists', async () => {
    const productA = buildFavoriteProductWith('WHATEVER_VALUES');
    const productB = buildFavoriteProductWith('WHATEVER_VALUES');
    guestStore([
      buildGuestFavoriteWith({ productId: productA.id }),
      buildGuestFavoriteWith({ productId: productB.id }),
    ]);
    const created = buildFavoriteListWith({ name: 'My Favorites', items: [] });
    const createReceived = vi.fn();
    const added = vi.fn();
    let lists: FavoriteList[] = [];
    server.use(
      graphql.query('FavoritesLists', () =>
        HttpResponse.json({ data: { customer: { wishlists: connection(lists.map(rawList)) } } }),
      ),
      graphql.mutation('CreateFavoritesList', ({ variables }) => {
        createReceived(variables);
        lists = [created];

        return HttpResponse.json({
          data: {
            wishlist: { createWishlist: { result: { entityId: created.id, name: created.name } } },
          },
        });
      }),
      addItemsHandler(added),
    );
    mockProducts([productA, productB]);

    renderWithProviders(<Favorites />, { preloadedState });

    await waitFor(() => expect(createReceived).toHaveBeenCalledWith({ name: 'My Favorites' }));
    await waitFor(() =>
      expect(added).toHaveBeenCalledWith({
        listId: created.id,
        items: [{ productEntityId: productA.id }, { productEntityId: productB.id }],
      }),
    );
    expect(snackbar.success).toHaveBeenCalledWith('2 favorites added to My Favorites');
    expect(window.localStorage.getItem('favorites_default_list')).toBe(String(created.id));
  });

  it('clears the guest store without an API call or toast when every guest row is already saved', async () => {
    const product = buildFavoriteProductWith('WHATEVER_VALUES');
    guestStore([buildGuestFavoriteWith({ productId: product.id, variantId: null })]);
    const added = vi.fn();
    mockLists([listWith(product)]);
    mockProducts([product]);
    server.use(addItemsHandler(added));

    renderWithProviders(<Favorites />, { preloadedState });

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('favorites_guest') ?? '')).toEqual({
        value: [],
        expiry: null,
      }),
    );
    expect(added).not.toHaveBeenCalled();
    expect(snackbar.success).not.toHaveBeenCalled();
  });

  it('leaves the guest store intact and shows the generic error when the merge fails', async () => {
    const guestRows = [buildGuestFavoriteWith('WHATEVER_VALUES')];
    guestStore(guestRows);
    mockLists([buildFavoriteListWith({ items: [] })]);
    server.use(
      graphql.mutation('AddFavoritesItems', () =>
        HttpResponse.json({ errors: [{ message: 'nope' }] }),
      ),
    );

    renderWithProviders(<Favorites />, { preloadedState });

    await waitFor(() =>
      expect(snackbar.error).toHaveBeenCalledWith(
        'Something went wrong updating your favorites. Please try again.',
      ),
    );
    expect(JSON.parse(window.localStorage.getItem('favorites_guest') ?? '')).toEqual({
      value: guestRows,
      expiry: null,
    });
  });

  it('does nothing when the guest store is empty', async () => {
    const list = buildFavoriteListWith({ items: [] });
    const added = vi.fn();
    mockLists([list]);
    server.use(addItemsHandler(added));

    renderWithProviders(<Favorites />, { preloadedState });

    await screen.findByRole('tab', { name: `${list.name} (0)` });
    expect(added).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `yarn test --run src/pages/Favorites/index.test.tsx`
Expected: the first four merge tests FAIL (nothing merges); the last one passes already.

- [ ] **Step 3: Add the merge mutation**

In `src/pages/Favorites/useFavoriteActions.ts`:

1. Extend the `./favorites` import to `{ AddToCartPlan, FavoriteList, FavoriteRow, GuestMergePlan, ItemRef, SaveToListsPlan }` and the `./storage` import to `{ clearDefaultListId, clearGuestFavorites, getDefaultListId, invalidateListsCache, setDefaultListId }`.

2. After the `addToCart` mutation, add:

```ts
  const mergeGuest = useMutation({
    mutationFn: async ({ plan }: { plan: GuestMergePlan }) => {
      const target =
        plan.target.kind === 'existing'
          ? { id: plan.target.listId, name: plan.target.name }
          : await createWishlist(b3Lang('favorites.defaultListName')).then((created) => ({
              id: created.entityId,
              name: created.name,
            }));

      if (plan.rows.length > 0) {
        await addWishlistItems(target.id, plan.rows.map(toWishlistItem));
      }

      // Only once the server has the rows: a failure above leaves the guest store for a retry
      // by either side (spec §13).
      clearGuestFavorites();

      return { target, rows: plan.rows };
    },
    onSuccess: ({ target, rows }) => {
      if (rows.length > 0) {
        setDefaultListId(target.id);
        rows.forEach((row) =>
          trackAddToWishlist({
            productId: row.productId,
            variantId: row.variantId,
            listName: target.name,
          }),
        );
        snackbar.success(
          b3Lang('favorites.merge.added', { count: rows.length, list: target.name }),
        );
      }

      refresh();
    },
    onError,
  });
```

3. Update the tail:

```ts
  const isBusy = [
    createList,
    renameList,
    deleteList,
    removeItem,
    saveToLists,
    addToCart,
    mergeGuest,
  ].some((mutation) => mutation.isPending);

  return {
    createList,
    renameList,
    deleteList,
    removeItem,
    saveToLists,
    addToCart,
    mergeGuest,
    isBusy,
  };
```

- [ ] **Step 4: Trigger the merge from the page**

In `src/pages/Favorites/index.tsx`:

1. Change the React import to `import { useEffect, useRef, useState } from 'react';`; extend the `./favorites` import to `{ FavoriteList, FavoriteRow, hydrateRows, planAddToCart, planGuestMerge }`; add `import { getDefaultListId, readGuestFavorites } from './storage';` after the `./favorites` import.

2. After the `const [pickerRow, …]` line (still before any early `return`), add:

```tsx
  // Guest favorites saved before signing in join the customer's lists the first time this
  // page sees them (spec §9). Once per mount; the theme does the same on storefront pages, and
  // duplicate adds are server-side no-ops, so the two never conflict.
  const mergeAttempted = useRef(false);
  const { mutate: mergeGuest } = actions.mergeGuest;
  useEffect(() => {
    if (mergeAttempted.current || !listsQuery.data) {
      return;
    }

    mergeAttempted.current = true;
    const plan = planGuestMerge({
      guest: readGuestFavorites(),
      lists: listsQuery.data,
      defaultListId: getDefaultListId(),
    });

    if (plan) {
      mergeGuest({ plan });
    }
  }, [listsQuery.data, mergeGuest]);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Favorites/index.test.tsx`
Expected: PASS (35 tests).

Negative controls: (a) move `clearGuestFavorites()` above the `addWishlistItems` call; the merge-failure test must fail. (b) In `planGuestMerge`'s caller, pass `defaultListId: null`; the first merge test must fail (it would target `other`, the first list). Restore both.

- [ ] **Step 6: Type-check, lint, commit**

```bash
yarn tsc --noEmit
yarn eslint src/pages/Favorites
git add src/pages/Favorites
git commit -m "feat: B2B-0000 Merge guest favorites into the customer's lists on the favorites page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Mobile card layout

Spec §10.1 (mobile).

**Files:**
- Create: `src/pages/Favorites/components/FavoriteItemCard.tsx`
- Modify: `src/pages/Favorites/index.tsx`
- Create: `src/pages/Favorites/index.mobile.test.tsx`

**Interfaces:**
- Consumes: `useMobile` from `@/hooks/useMobile` (existing; `[isMobile]`, true at `document.body.clientWidth <= 768`), `ProductSummary`, `RowActions` (Tasks 8, 11).
- Produces: `FavoriteItemCard({ row, productsFailed, disabled, onAddToCart, onSaveToLists, onRemove })`.

- [ ] **Step 1: Write the failing test**

`src/pages/Favorites/index.mobile.test.tsx`:

```tsx
import {
  buildCompanyStateWith,
  buildFavoriteItemWith,
  buildFavoriteListWith,
  buildFavoriteProductWith,
  buildFavoriteVariantWith,
  graphql,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
  within,
} from 'tests/test-utils';

import { CustomerRole, UserTypes } from '@/types';

import Favorites from '.';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/utils/b3Logger');

const { server } = startMockServer();

const preloadedState = {
  company: buildCompanyStateWith({
    customer: {
      id: 4242,
      emailAddress: 'buyer@example.com',
      role: CustomerRole.B2C,
      userType: UserTypes.B2C,
    },
    tokens: { bcGraphqlToken: 'storefront-token' },
  }),
};

const lastPage = { hasNextPage: false, endCursor: null };

beforeEach(() => {
  window.BC_CONTEXT = { favorites: { enabled: true } };
  // The portal's mobile breakpoint (useMobile) is 768px.
  vi.spyOn(document.body, 'clientWidth', 'get').mockReturnValue(500);
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('renders favorites as cards with name, SKU, price and actions on mobile', async () => {
  const variant = buildFavoriteVariantWith({
    sku: 'VAR-77',
    bc_calculated_price: {
      as_entered: 12.5,
      tax_inclusive: 15,
      tax_exclusive: 12.5,
      entered_inclusive: false,
    },
  });
  const product = buildFavoriteProductWith({ name: 'Slicker Brush', variants: [variant] });
  const list = buildFavoriteListWith({
    name: 'My Favorites',
    items: [buildFavoriteItemWith({ productId: product.id, variantId: variant.variant_id })],
  });
  server.use(
    graphql.query('FavoritesLists', () =>
      HttpResponse.json({
        data: {
          customer: {
            wishlists: {
              pageInfo: lastPage,
              edges: [
                {
                  node: {
                    entityId: list.id,
                    name: list.name,
                    isPublic: false,
                    items: {
                      pageInfo: lastPage,
                      edges: list.items.map((item) => ({
                        node: {
                          entityId: item.id,
                          productEntityId: item.productId,
                          variantEntityId: item.variantId,
                        },
                      })),
                    },
                  },
                },
              ],
            },
          },
        },
      }),
    ),
    graphql.query('SearchProducts', () =>
      HttpResponse.json({ data: { productsSearch: [product] } }),
    ),
  );

  renderWithProviders(<Favorites />, { preloadedState });

  const card = (await screen.findByText('Slicker Brush')).closest('.MuiCard-root') as HTMLElement;
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(within(card).getByText('VAR-77')).toBeInTheDocument();
  expect(within(card).getByText('$12.50')).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Add to cart' })).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Save to lists' })).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test --run src/pages/Favorites/index.mobile.test.tsx`
Expected: FAIL, a `table` is rendered and no `.MuiCard-root` exists.

- [ ] **Step 3: Write the card and switch layouts on mobile**

`src/pages/Favorites/components/FavoriteItemCard.tsx`:

```tsx
import { Box, Card, CardContent, Typography } from '@mui/material';

import { currencyFormat } from '@/utils/b3CurrencyFormat';

import { FavoriteRow } from '../favorites';

import ProductSummary from './ProductSummary';
import RowActions from './RowActions';

interface FavoriteItemCardProps {
  row: FavoriteRow;
  productsFailed: boolean;
  disabled: boolean;
  onAddToCart: (row: FavoriteRow) => void;
  onSaveToLists: (row: FavoriteRow) => void;
  onRemove: (row: FavoriteRow) => void;
}

export default function FavoriteItemCard({
  row,
  productsFailed,
  disabled,
  onAddToCart,
  onSaveToLists,
  onRemove,
}: FavoriteItemCardProps) {
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <ProductSummary row={row} productsFailed={productsFailed} />
        {!productsFailed && row.sku && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {row.sku}
          </Typography>
        )}
        {!productsFailed && row.price !== null && (
          <Typography variant="subtitle1">{currencyFormat(row.price)}</Typography>
        )}
        <Box sx={{ mt: 1 }}>
          <RowActions
            row={row}
            productsFailed={productsFailed}
            disabled={disabled}
            onAddToCart={onAddToCart}
            onSaveToLists={onSaveToLists}
            onRemove={onRemove}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
```

In `src/pages/Favorites/index.tsx`:

1. Imports: add `import { useMobile } from '@/hooks/useMobile';` after the `B3Spin` import; add `import FavoriteItemCard from './components/FavoriteItemCard';` before the `FavoriteItemsTable` import.

2. After `const navigate = useNavigate();`, add `const [isMobile] = useMobile();`.

3. Lift the inline remove callback into a handler next to `addRowToCart`, so the table and the card share it:

```tsx
  const removeRow = (row: FavoriteRow) => {
    if (selectedList) {
      actions.removeItem.mutate({
        listId: selectedList.id,
        listName: selectedList.name,
        itemId: row.item.id,
      });
    }
  };
```

4. Replace the rows block (from `{rows.length === 0 ? (` through the matching `)}`) with:

```tsx
            {rows.length === 0 && <Typography>{b3Lang('favorites.empty.list')}</Typography>}
            {rows.length > 0 && !isMobile && (
              <FavoriteItemsTable
                rows={rows}
                productsFailed={productsFailed}
                disabled={actions.isBusy}
                onAddToCart={addRowToCart}
                onSaveToLists={setPickerRow}
                onRemove={removeRow}
              />
            )}
            {rows.length > 0 &&
              isMobile &&
              rows.map((row) => (
                <FavoriteItemCard
                  key={row.item.id}
                  row={row}
                  productsFailed={productsFailed}
                  disabled={actions.isBusy}
                  onAddToCart={addRowToCart}
                  onSaveToLists={setPickerRow}
                  onRemove={removeRow}
                />
              ))}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Favorites`
Expected: PASS (the mobile test plus every earlier Favorites suite).

Negative control: render the table regardless of `isMobile`; the mobile test must fail on `queryByRole('table')`. Restore.

- [ ] **Step 5: Type-check, lint, commit**

```bash
yarn tsc --noEmit
yarn eslint src/pages/Favorites
git add src/pages/Favorites
git commit -m "feat: B2B-0000 Render favorites as cards on mobile

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Verification, live check, docs, coordinator

Spec §16. Nothing new is built here; this task proves the branch and closes the loop.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-09-favorites-management-ui-design.md` (status, live-check record)
- Possibly: `.claude/agent-memory/<role>/MEMORY.md` or a `.memory/` note via the `memory-write` skill, only if a reusable gotcha surfaced

- [ ] **Step 1: Run the scoped suites, the type check, and the full lint**

```bash
yarn test --run src/pages/Favorites src/shared/service/bc/graphql/wishlist.test.ts src/shared/routeList.test.ts src/shared/routeList.platform.test.ts
yarn tsc --noEmit
yarn lint
```

Expected: every suite green; `tsc` clean. `yarn lint` runs dependency-cruiser, ESLint and knip. Any finding that names a file this plan created or modified must be fixed before continuing (a knip "unused export" means a type or helper lost its consumer: drop the `export`, do not add a fake consumer). Findings in untouched files are pre-existing (`dev` is a known-red baseline; the `ManageSubscriptions` ESLint findings are known) and are listed, not fixed. Note that `src/utils/analytics.ts` used to be reported as an orphan; it now has a consumer, so that finding should be gone.

- [ ] **Step 2: Build**

```bash
yarn build
```

Expected: `prebuild` type-check passes and Vite emits `dist/`.

- [ ] **Step 3: Live check on the SSW sandbox**

The sandbox serves the portal from `/content/b2bBuyerPortal/dist`; route that prefix to the local `dist` (browser DevTools local overrides, or the proxy approach recorded in the memory note "Sandbox portal bundle path"). Then, signed in as the Task 0 test customer:

1. If the theme does not yet emit the flag, run in the console `window.BC_CONTEXT = Object.assign(window.BC_CONTEXT || {}, { favorites: { enabled: true } })` and click any other nav item so the nav re-evaluates the route filter. "Favorites" appears after Shopping lists.
2. Save a product with the theme's star on a storefront page (or create a list with the Task 0 snippet), open Favorites: the list and the product render with image, name, SKU and price.
3. New list, Rename, Delete list round-trip; the URL carries `?list=`.
4. Save to lists: copy the product into the new list; open a storefront page and confirm the star's picker shows the same membership (the theme refetched because `favorites_lists` was removed).
5. Add to cart on a plain product (header count increments; "View cart" lands on `/cart.php`); Choose options on an option product opens the product page in the top window; Add all reports skipped rows.
6. Guest merge: sign out, star two products as a guest, sign in, open Favorites: "2 favorites added to My Favorites" and `favorites_guest` is `{ value: [], expiry: null }`.

Record each outcome in the spec as a new subsection "12.4 Live check (YYYY-MM-DD)".

- [ ] **Step 4: Update the spec status and commit**

Set the spec header to `- **Status:** Implemented on dev (YYYY-MM-DD); live-checked on sandbox` and commit:

```bash
git add docs/superpowers/specs/2026-09-09-favorites-management-ui-design.md
git commit -m "docs: B2B-0000 Record the favorites live check and mark the spec implemented

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: Memory and coordination**

- If a reusable gotcha surfaced during implementation (something a future session would otherwise rediscover), record it with the `memory-write` skill (all three sinks) or as an entry under `.claude/agent-memory/<role>/`. Do not record routine progress.
- Coordinator (`project: "b2b-buyer-portal"`): `log_decision` with `category: "other"` and tags `favorites,shipped` summarizing what landed and the spec path; `update_status` `done` with a one-line summary; `send_message` broadcast so parallel sessions know `/favorites`, the `wishlist` service and the `favorites.*` copy keys exist.
- Relay spec §15 (theme-side asks) to the LoveGroomers team out of band: emit the flag from the star's theme setting, page the wishlist queries, confirm the GA4 field sources, optionally link the star's toasts to `/#/favorites`.

---

## Appendix A: `src/pages/Favorites/index.tsx` after Task 13

The assembled result of Tasks 7–13, for checking the incremental edits landed where intended.

```tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Typography } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import B3Spin from '@/components/spin/B3Spin';
import { useMobile } from '@/hooks/useMobile';
import { useB3Lang } from '@/lib/lang';
import { activeCurrencyInfoSelector, useAppSelector } from '@/store';
import { snackbar } from '@/utils/b3Tip';

import EmptyState from './components/EmptyState';
import FavoriteItemCard from './components/FavoriteItemCard';
import FavoriteItemsTable from './components/FavoriteItemsTable';
import ListNameDialog from './components/ListNameDialog';
import ListTabs from './components/ListTabs';
import ListToolbar from './components/ListToolbar';
import SaveToListsDialog from './components/SaveToListsDialog';
import { isFavoritesAvailable } from './api';
import {
  FavoriteList,
  FavoriteRow,
  hydrateRows,
  planAddToCart,
  planGuestMerge,
} from './favorites';
import { getDefaultListId, readGuestFavorites } from './storage';
import { SaveToListsInput, useFavoriteActions } from './useFavoriteActions';
import { useFavoriteLists } from './useFavoriteLists';
import { useFavoriteProducts } from './useFavoriteProducts';

type NameDialogState = { mode: 'create' } | { mode: 'rename'; list: FavoriteList };

// `?list=<id>` selects the list; unknown or missing falls back to the first one (spec §4.5).
const selectList = (lists: FavoriteList[], param: string | null): FavoriteList | undefined =>
  lists.find((list) => String(list.id) === param) ?? lists[0];

function Favorites() {
  const b3Lang = useB3Lang();
  const navigate = useNavigate();
  const [isMobile] = useMobile();
  const customerId = useAppSelector(({ company }) => company.customer.id);
  const companyId = useAppSelector(({ company }) => company.companyInfo.id);
  const customerGroupId = useAppSelector(({ company }) => company.customer.customerGroupId);
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  const showInclusiveTaxPrice = useAppSelector(({ global }) => global.showInclusiveTaxPrice);
  const { currency_code: currencyCode } = useAppSelector(activeCurrencyInfoSelector);
  // The storefront session cookie identifies the logged-in rep, so a masquerading rep must
  // not see or edit favorites here. Belt and braces with the route filter: gotoAllowedAppPage
  // checks the unfiltered routes array, so a programmatic push could still mount this page.
  const isAvailable = isFavoritesAvailable() && !isAgenting;

  const [searchParams, setSearchParams] = useSearchParams();
  const listsQuery = useFavoriteLists(customerId, isAvailable);
  const lists = listsQuery.data ?? [];
  const selectedList = selectList(lists, searchParams.get('list'));
  const productsQuery = useFavoriteProducts({
    productIds: lists.flatMap((list) => list.items.map((item) => item.productId)),
    currencyCode,
    companyId,
    customerGroupId,
  });
  const rows = selectedList
    ? hydrateRows(selectedList, productsQuery.data ?? {}, showInclusiveTaxPrice)
    : [];
  const actions = useFavoriteActions(customerId);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FavoriteList | null>(null);
  const [pickerRow, setPickerRow] = useState<FavoriteRow | null>(null);

  // Guest favorites saved before signing in join the customer's lists the first time this
  // page sees them (spec §9). Once per mount; the theme does the same on storefront pages, and
  // duplicate adds are server-side no-ops, so the two never conflict.
  const mergeAttempted = useRef(false);
  const { mutate: mergeGuest } = actions.mergeGuest;
  useEffect(() => {
    if (mergeAttempted.current || !listsQuery.data) {
      return;
    }

    mergeAttempted.current = true;
    const plan = planGuestMerge({
      guest: readGuestFavorites(),
      lists: listsQuery.data,
      defaultListId: getDefaultListId(),
    });

    if (plan) {
      mergeGuest({ plan });
    }
  }, [listsQuery.data, mergeGuest]);

  const selectListId = (listId: number) =>
    setSearchParams({ list: String(listId) }, { replace: true });

  const handleCreateList = async (name: string) => {
    try {
      const created = await actions.createList.mutateAsync(name);
      setNameDialog(null);
      selectListId(created.entityId);
    } catch {
      // the actions hook already toasted the failure; keep the dialog open to retry
    }
  };

  const handleRenameList = async (list: FavoriteList, name: string) => {
    try {
      await actions.renameList.mutateAsync({ listId: list.id, name });
      setNameDialog(null);
    } catch {
      // toasted by the actions hook
    }
  };

  const handleDeleteList = async (list: FavoriteList) => {
    try {
      await actions.deleteList.mutateAsync(list.id);
      setPendingDelete(null);

      if (selectedList?.id === list.id) {
        setSearchParams({}, { replace: true });
      }
    } catch {
      // toasted by the actions hook
    }
  };

  const handleSaveToLists = async (input: SaveToListsInput) => {
    try {
      await actions.saveToLists.mutateAsync(input);
      setPickerRow(null);
    } catch {
      // toasted by the actions hook; keep the picker open
    }
  };

  const addRowToCart = (row: FavoriteRow) =>
    actions.addToCart.mutate({ plan: planAddToCart([row]) });

  const removeRow = (row: FavoriteRow) => {
    if (selectedList) {
      actions.removeItem.mutate({
        listId: selectedList.id,
        listName: selectedList.name,
        itemId: row.item.id,
      });
    }
  };

  const handleAddAllToCart = () => {
    const plan = planAddToCart(rows);

    if (plan.lineItems.length === 0) {
      snackbar.info(b3Lang('favorites.cart.nothingToAdd'));

      return;
    }

    actions.addToCart.mutate({ plan });
  };

  if (!isAvailable) {
    return <Typography>{b3Lang('favorites.unavailable')}</Typography>;
  }

  if (listsQuery.data === null) {
    return (
      <EmptyState message={b3Lang('favorites.signedOut')}>
        <Button variant="contained" onClick={() => navigate('/login')}>
          {b3Lang('favorites.signIn')}
        </Button>
      </EmptyState>
    );
  }

  const isLoading = listsQuery.isLoading || productsQuery.isLoading;
  const productsFailed = productsQuery.isError;

  return (
    <B3Spin isSpinning={isLoading}>
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button
            variant="outlined"
            disabled={actions.isBusy}
            onClick={() => setNameDialog({ mode: 'create' })}
          >
            {b3Lang('favorites.newList')}
          </Button>
        </Box>
        {productsFailed && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {b3Lang('favorites.error.products')}
          </Alert>
        )}
        {!listsQuery.isLoading && lists.length === 0 && (
          <EmptyState message={b3Lang('favorites.empty.noLists')}>
            {/* Leaves the portal: anchors rendered inside the ThemeFrame iframe need _top. */}
            <Button variant="contained" href="/" target="_top">
              {b3Lang('favorites.empty.startShopping')}
            </Button>
          </EmptyState>
        )}
        {selectedList && (
          <>
            <ListTabs lists={lists} selectedId={selectedList.id} onSelect={selectListId} />
            <ListToolbar
              list={selectedList}
              disabled={actions.isBusy}
              hasItems={rows.length > 0}
              onRename={() => setNameDialog({ mode: 'rename', list: selectedList })}
              onDelete={() => setPendingDelete(selectedList)}
              onAddAll={handleAddAllToCart}
            />
            {rows.length === 0 && <Typography>{b3Lang('favorites.empty.list')}</Typography>}
            {rows.length > 0 && !isMobile && (
              <FavoriteItemsTable
                rows={rows}
                productsFailed={productsFailed}
                disabled={actions.isBusy}
                onAddToCart={addRowToCart}
                onSaveToLists={setPickerRow}
                onRemove={removeRow}
              />
            )}
            {rows.length > 0 &&
              isMobile &&
              rows.map((row) => (
                <FavoriteItemCard
                  key={row.item.id}
                  row={row}
                  productsFailed={productsFailed}
                  disabled={actions.isBusy}
                  onAddToCart={addRowToCart}
                  onSaveToLists={setPickerRow}
                  onRemove={removeRow}
                />
              ))}
          </>
        )}
      </Box>
      {/* Dialogs sit after the layout Box: B3Dialog renders an in-flow wrapper even while closed. */}
      <ListNameDialog
        isOpen={nameDialog !== null}
        dialogKey={nameDialog?.mode === 'rename' ? `rename-${nameDialog.list.id}` : 'create'}
        title={b3Lang(nameDialog?.mode === 'rename' ? 'favorites.rename' : 'favorites.newList')}
        initialName={nameDialog?.mode === 'rename' ? nameDialog.list.name : ''}
        submitLabel={b3Lang(
          nameDialog?.mode === 'rename' ? 'favorites.listName.save' : 'favorites.listName.create',
        )}
        loading={actions.createList.isPending || actions.renameList.isPending}
        onCancel={() => setNameDialog(null)}
        onSubmit={(name) =>
          nameDialog?.mode === 'rename'
            ? handleRenameList(nameDialog.list, name)
            : handleCreateList(name)
        }
      />
      <B3Dialog
        isOpen={pendingDelete !== null}
        title={b3Lang('favorites.deleteList')}
        rightSizeBtn={b3Lang('favorites.deleteList')}
        loading={actions.deleteList.isPending}
        handleLeftClick={() => setPendingDelete(null)}
        handRightClick={() => {
          if (pendingDelete) {
            handleDeleteList(pendingDelete);
          }
        }}
      >
        <Typography>
          {pendingDelete
            ? b3Lang('favorites.deleteList.confirm', {
                name: pendingDelete.name,
                count: pendingDelete.items.length,
              })
            : ''}
        </Typography>
      </B3Dialog>
      <SaveToListsDialog
        row={pickerRow}
        lists={lists}
        loading={actions.saveToLists.isPending}
        onCancel={() => setPickerRow(null)}
        onSave={handleSaveToLists}
        onCreateList={(name) => actions.createList.mutateAsync(name)}
      />
    </B3Spin>
  );
}

export default Favorites;
```

## Appendix B: `src/pages/Favorites/useFavoriteActions.ts` after Task 12

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import {
  addWishlistItems,
  createWishlist,
  deleteWishlistItems,
  deleteWishlists,
  updateWishlistName,
  WishlistItemInput,
} from '@/shared/service/bc';
import { snackbar } from '@/utils/b3Tip';
import b3TriggerCartNumber from '@/utils/b3TriggerCartNumber';
import { createOrUpdateExistingCart } from '@/utils/cartUtils';

import { trackAddToWishlist } from './analytics';
import {
  AddToCartPlan,
  FavoriteList,
  FavoriteRow,
  GuestMergePlan,
  ItemRef,
  SaveToListsPlan,
} from './favorites';
import {
  clearDefaultListId,
  clearGuestFavorites,
  getDefaultListId,
  invalidateListsCache,
  setDefaultListId,
} from './storage';
import { favoritesListsQueryKey } from './useFavoriteLists';

export interface SaveToListsInput {
  plan: SaveToListsPlan;
  row: FavoriteRow;
  /** Every list the dialog showed, including ones created inside it, so names resolve for toasts and GA4. */
  lists: FavoriteList[];
}

const toWishlistItem = ({ productId, variantId }: ItemRef): WishlistItemInput =>
  variantId === null
    ? { productEntityId: productId }
    : { productEntityId: productId, variantEntityId: variantId };

const CART_URL = '/cart.php';

/**
 * Every write the page makes. Each success drops the theme's session cache and refetches
 * our lists, so the star on the next storefront page and this page agree (spec §9).
 */
export const useFavoriteActions = (customerId: number) => {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();

  const refresh = () => {
    invalidateListsCache();

    return queryClient.invalidateQueries({ queryKey: favoritesListsQueryKey(customerId) });
  };

  const onError = () => {
    snackbar.error(b3Lang('favorites.error.generic'));
    refresh();
  };

  const createList = useMutation({
    mutationFn: (name: string) => createWishlist(name),
    onSuccess: () => refresh(),
    onError,
  });

  const renameList = useMutation({
    mutationFn: ({ listId, name }: { listId: number; name: string }) =>
      updateWishlistName(listId, name),
    onSuccess: () => {
      snackbar.success(b3Lang('favorites.renamed'));
      refresh();
    },
    onError,
  });

  const deleteList = useMutation({
    mutationFn: async (listId: number) => {
      await deleteWishlists([listId]);

      // The theme's one-click save targets the default list; never leave it pointing at a deleted one.
      if (getDefaultListId() === listId) {
        clearDefaultListId();
      }
    },
    onSuccess: () => {
      snackbar.success(b3Lang('favorites.deleteList.deleted'));
      refresh();
    },
    onError,
  });

  const removeItem = useMutation({
    mutationFn: ({ listId, itemId }: { listId: number; listName: string; itemId: number }) =>
      deleteWishlistItems(listId, [itemId]),
    onSuccess: (_, { listName }) => {
      snackbar.success(b3Lang('favorites.item.removed', { list: listName }));
      refresh();
    },
    onError,
  });

  const saveToLists = useMutation({
    mutationFn: async ({ plan, row, lists }: SaveToListsInput) => {
      const item = toWishlistItem(row.item);
      await Promise.all(plan.adds.map(({ listId }) => addWishlistItems(listId, [item])));
      await Promise.all(
        plan.removes.map(({ listId, itemId }) => deleteWishlistItems(listId, [itemId])),
      );
      const addedTo = plan.adds.flatMap(({ listId }) => lists.filter((list) => list.id === listId));

      return { addedTo, removedCount: plan.removes.length };
    },
    onSuccess: ({ addedTo, removedCount }, { row }) => {
      const lastAdded = addedTo[addedTo.length - 1];

      if (lastAdded) {
        setDefaultListId(lastAdded.id);
      }

      addedTo.forEach((list) =>
        trackAddToWishlist({
          productId: row.item.productId,
          variantId: row.item.variantId,
          name: row.name,
          listName: list.name,
        }),
      );
      snackbar.success(
        lastAdded && addedTo.length === 1 && removedCount === 0
          ? b3Lang('favorites.picker.saved', { list: lastAdded.name })
          : b3Lang('favorites.picker.updated'),
      );
      refresh();
    },
    onError,
  });

  const addToCart = useMutation({
    mutationFn: async ({ plan }: { plan: AddToCartPlan }) => {
      try {
        await createOrUpdateExistingCart(plan.lineItems);
      } finally {
        // Refresh the header count whether or not the add went through, as Quick Order does.
        b3TriggerCartNumber();
      }

      return plan;
    },
    onSuccess: (plan) => {
      // The React realm is the top window (only the DOM is portaled into the ThemeFrame),
      // so assigning location here leaves the portal correctly.
      const action = {
        label: b3Lang('favorites.cart.view'),
        onClick: () => {
          window.location.href = CART_URL;
        },
      };
      const added = plan.lineItems.length;
      const skipped = plan.skipped.length;

      if (added === 1 && skipped === 0) {
        snackbar.success(b3Lang('favorites.cart.addedOne'), { action });

        return;
      }

      snackbar.success(b3Lang('favorites.cart.addedMany', { count: added }), {
        action,
        description: skipped > 0 ? b3Lang('favorites.cart.skipped', { count: skipped }) : undefined,
      });
    },
    onError: (error: unknown) => {
      // The cart helper throws the storefront's own message; show it as the other pages do.
      snackbar.error(
        error instanceof Error && error.message ? error.message : b3Lang('favorites.error.generic'),
      );
    },
  });

  const mergeGuest = useMutation({
    mutationFn: async ({ plan }: { plan: GuestMergePlan }) => {
      const target =
        plan.target.kind === 'existing'
          ? { id: plan.target.listId, name: plan.target.name }
          : await createWishlist(b3Lang('favorites.defaultListName')).then((created) => ({
              id: created.entityId,
              name: created.name,
            }));

      if (plan.rows.length > 0) {
        await addWishlistItems(target.id, plan.rows.map(toWishlistItem));
      }

      // Only once the server has the rows: a failure above leaves the guest store for a retry
      // by either side (spec §13).
      clearGuestFavorites();

      return { target, rows: plan.rows };
    },
    onSuccess: ({ target, rows }) => {
      if (rows.length > 0) {
        setDefaultListId(target.id);
        rows.forEach((row) =>
          trackAddToWishlist({
            productId: row.productId,
            variantId: row.variantId,
            listName: target.name,
          }),
        );
        snackbar.success(
          b3Lang('favorites.merge.added', { count: rows.length, list: target.name }),
        );
      }

      refresh();
    },
    onError,
  });

  const isBusy = [
    createList,
    renameList,
    deleteList,
    removeItem,
    saveToLists,
    addToCart,
    mergeGuest,
  ].some((mutation) => mutation.isPending);

  return {
    createList,
    renameList,
    deleteList,
    removeItem,
    saveToLists,
    addToCart,
    mergeGuest,
    isBusy,
  };
};
```
