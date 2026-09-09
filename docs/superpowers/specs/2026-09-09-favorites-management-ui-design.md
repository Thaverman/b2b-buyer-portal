# Favorites management UI (BigCommerce wishlists) — Design

- **Date:** 2026-09-09
- **Status:** Approved (brainstormed with THaverman, 2026-09-09)
- **Page:** `apps/storefront/src/pages/Favorites/` plus a thin storefront wishlist service
- **Plan:** `docs/superpowers/plans/2026-09-09-favorites-management-ui.md`
- **Interop partner:** the Stencil favorites star in the `LoveGroomers` theme repo
  (`docs/superpowers/specs/2026-09-08-favorites-star-design.md`, code under
  `assets/js/theme/f/favorites/`). This document restates the parts of that contract the
  portal must honor; the theme spec stays authoritative for the star itself.

## 1. Decision summary

Build a **Favorites page in the buyer portal** at `#/favorites` where a signed-in customer
sees the lists the Stencil star writes, renames, deletes and creates lists, sees each item
with image, name, SKU and price, removes items, copies or moves items between lists through
the same picker semantics the star uses, and adds one item or a whole list to the cart.

Decisions taken during brainstorming:

| Question | Decision |
|---|---|
| Scope | Management UI only. The star on portal product surfaces (Quick Order, Shopping List rows, product-search dialog) is **out of scope**; the data layer is shaped so a star could consume it later, but no star code ships. |
| Backend | **BigCommerce wishlists for every signed-in customer**, B2C and B2B company users alike. B2B Edition Shopping Lists stay a separate concept. |
| Placement | New route `/favorites`, lazy page, side-nav item "Favorites" after Shopping lists. Selected list in the URL as `?list=<id>`. |
| Quantities | **Fixed**: quantity 1 raised to the catalog minimum. No quantity editing. |
| Rollout | **Channel-level only** via the theme-emitted host flag. SSW sandbox first, production when the theme ships the star and the flag together. No company or role allowlist. |
| Structure | Page-owned favorites module over a thin storefront wishlist service (approach 1). Product rows hydrated through the B2B `productsSearch` call the portal already uses. |

## 2. The contract inherited from the Stencil side

Everything below is already live in the theme and verified on the SSW sandbox. The portal
**reads and writes the same backend and the same browser keys**; it must never contradict
the star's behavior table.

### 2.1 Backend: Storefront GraphQL wishlists

Same-origin `POST /graphql` with `Authorization: Bearer <storefront token>` and the shopper's
session cookie is enough for customer-scoped reads and writes. Variant ids are the **V3**
variant entity ids (`variantEntityId`). A product-only row and a product+variant row are
**distinct** items; re-adding an existing row is a silent no-op.

### 2.2 Browser storage (same origin, therefore shared)

| key | storage | shape |
|---|---|---|
| `favorites_guest` | localStorage | `{ "value": [{ "productId": 6376, "variantId": 6340 \| null, "addedAt": 1757000000000 }], "expiry": null }` |
| `favorites_lists` | sessionStorage | `{ "value": List[], "expiry": <ms epoch> }` — 5-minute cache of the customer's lists, normalized as `{ id, name, isPublic, items: [{ id, productId, variantId }] }` |
| `favorites_default_list` | localStorage | list id as a string; the last list the customer saved to |

The `{ value, expiry }` wrapper comes from the theme's `storage-utils`. The theme
invalidates `favorites_lists` after any mutation; the portal must too.

### 2.3 Behavior the portal must not contradict

- Customer with 0 lists saving a favorite → the theme creates a private list named
  **"My Favorites"**. The portal creates the same name when it has to create a list.
- The picker: one checkbox per list showing membership, inline "New list name" + Create,
  Save applies the add/remove diff, unchecking every list removes the product.
- Guest → customer merge on login: read `favorites_guest`, add the missing rows to the
  default list (create "My Favorites" if none), clear the guest store, toast
  "{n} favorites added to {list}".
- Copy says **"favorites"** and **"list"**, never "wishlist". Code may say `wishlist` where
  it names the BigCommerce API; customer-facing strings may not.
- GA4: `add_to_wishlist` with one item per successful add.

## 3. Scope

**In scope**

- Host flag, route, nav item, role gating, URL-selected list.
- Storefront wishlist service (6 operations, paged, typed, error-checked).
- Storage-contract adapter for the three theme keys.
- Pure planning functions: normalize, save-to-lists diff, guest merge plan, cart plan, row
  hydration.
- Page UI: list tabs, list toolbar (rename, delete, add all to cart), item rows with image,
  name, SKU, price, per-row Add to cart / Choose options / Save to lists / Remove,
  desktop table and mobile cards, empty, signed-out, unavailable and loading states.
- Guest merge on page mount.
- GA4 `add_to_wishlist` through the existing `pushDataLayerEvent`.
- Unit, service and page integration tests; route gate tests.

**Out of scope (recorded follow-ups)**

- The star on portal product surfaces.
- Bulk select-and-move/copy; undo on remove; showing or changing the default list.
- "Add to shopping list" bridge for B2B users.
- Reading or writing the theme's `favorites_lists` cache beyond invalidating it.
- Any Headless/Catalyst support: the storage contract is same-origin with the Stencil
  storefront, so the feature is Stencil-only like Payment Methods and Loyalty.

## 4. Gate, routing, roles

### 4.1 Host flag

```ts
// src/index.d.ts, inside Window.BC_CONTEXT
/** Gates the /favorites page; absent or enabled:false = feature off. Emitted by the theme
 *  from the same theme setting that turns on the Stencil favorites star. */
favorites?: { enabled: boolean };
```

Absent key or `enabled: false` means off. The object form matches the two existing custom
keys and leaves room for a `storefrontToken` fallback (§12.1) without a shape change.

### 4.2 Availability (page-side source of truth)

`src/pages/Favorites/api.ts`:

```ts
export const isFavoritesAvailable = () =>
  platform === 'bigcommerce' && Boolean(window.BC_CONTEXT?.favorites?.enabled);
```

The page additionally hides itself while `b2bFeatures.masqueradeCompany.isAgenting` is true
(the session cookie identifies the rep, not the buyer), rendering the same kind of short
"unavailable" message Payment Methods renders.

### 4.3 Route filter

`src/shared/routeList.ts`, in `getAllowedRoutesWithoutComponent`, a clause shaped exactly
like the `/payment-methods` one:

```ts
if (
  path === '/favorites' &&
  (platform !== 'bigcommerce' || !window.BC_CONTEXT?.favorites?.enabled || isAgenting)
) {
  return false;
}
```

The route filter cannot import from a page folder, so the condition is duplicated there;
`isFavoritesAvailable()` remains the page-side source of truth. Keep the two in sync.

### 4.4 Route entry

```ts
{
  path: '/favorites',
  name: 'Favorites',
  wsKey: 'favorites',
  isMenuItem: true,
  permissions: favoritesPermissions,
  isTokenLogin: true,
  idLang: 'global.navMenu.favorites',
}
```

Inserted directly after the `/shoppingLists` entry (menu order follows array order).
`favoritesPermissions` is added to `legacyPermissions` in `src/shared/routes/config.ts`:
`[ADMIN, SENIOR_BUYER, JUNIOR_BUYER, CUSTOM_ROLE, B2C]`. Sales reps (3 and 4) are excluded:
a rep who is not agenting hits the `permissions.includes(4)` branch, and an agenting rep
(role 3) is caught by the explicit clause above and by 3 not being in the list. Guests are
not listed either, but the filter's non-B2B branch tests the B2C permission regardless of the
actual role; that is fine, because guests never reach the portal layout (it redirects them to
login) and the nav's guest click handler prompts registration, exactly as for every other
B2C-permitted route. No guest-specific clause is needed.

`src/shared/routes/index.tsx` gains `const Favorites = lazy(() => import('@/pages/Favorites'))`
and `'/favorites': Favorites` in `routesMap`. The layout auto-titles the page from the route's
`idLang`, so the page renders no heading of its own.

### 4.5 URL state

`?list=<id>` selects the list. Missing, non-numeric, or not among the customer's lists →
the first list. Creating a list navigates to it; deleting the selected list falls back to
the first remaining one. `useSearchParams` with `replace: true` so tab changes do not pile
up history entries.

## 5. Architecture and file layout

```
apps/storefront/src/
├── index.d.ts                                   # + BC_CONTEXT.favorites
├── shared/service/bc/graphql/wishlist.ts        # 6 storefront operations, paged, typed, errors checked
├── shared/service/bc/graphql/wishlist.test.ts   # MSW tests for the service
├── shared/service/bc/index.ts                   # + wishlist exports
├── shared/routeList.ts                          # + route entry + gate clause
├── shared/routeList.test.ts                     # + /favorites gate matrix
├── shared/routeList.platform.test.ts            # /favorites hidden on non-bigcommerce platforms
├── shared/routes/config.ts                      # + favoritesPermissions
├── shared/routes/index.tsx                      # + lazy Favorites in routesMap
├── lib/lang/locales/en.json                     # + global.navMenu.favorites, favorites.*
└── pages/Favorites/
    ├── index.tsx                  # gate, queries, URL list selection, merge trigger, dialogs
    ├── index.test.tsx             # desktop integration tests
    ├── index.mobile.test.tsx      # mobile card layout test
    ├── index.platform.test.tsx    # unavailable on non-bigcommerce platforms
    ├── api.ts                     # isFavoritesAvailable, fetchFavoriteProducts (chunked)
    ├── api.test.ts
    ├── storage.ts                 # theme storage-contract adapter (the ONLY web-storage code)
    ├── storage.test.ts
    ├── favorites.ts               # pure: normalizeLists, itemKey, membership, planSaveToLists,
    │                              #       isEmptyPlan, planGuestMerge, hydrateRows, planAddToCart
    ├── favorites.test.ts
    ├── analytics.ts               # trackAddToWishlist → pushDataLayerEvent
    ├── useFavoriteLists.ts        # lists query (+ query key)
    ├── useFavoriteProducts.ts     # products query keyed by the id set
    ├── useFavoriteActions.ts      # every mutation: toasts, GA4, cache invalidation
    └── components/
        ├── EmptyState.tsx
        ├── ListTabs.tsx           # MUI Tabs, one per list
        ├── ListToolbar.tsx        # list name + Rename / Delete list / Add all to cart
        ├── ProductSummary.tsx     # image + name + unavailable chip (table and card)
        ├── RowActions.tsx         # Add to cart / Choose options / Save to lists / Remove
        ├── FavoriteItemsTable.tsx # desktop rows
        ├── FavoriteItemCard.tsx   # mobile card
        ├── ListNameDialog.tsx     # create / rename (one component, two modes)
        └── SaveToListsDialog.tsx  # the picker
apps/storefront/tests/
├── favoritesBuilders/index.ts                   # builders shared by the favorites tests
└── test-utils.tsx                               # + export * from 'tests/favoritesBuilders'
```

Division of ownership: `storefront-shared` owns everything under `shared/` and `index.d.ts`;
`storefront-pages` owns `pages/Favorites/`; `storefront-tests` owns the tests. The exact
component split may be adjusted during implementation; the module boundaries (service,
storage adapter, pure planning functions, hooks, components) may not.

Redux is read only at the top of `index.tsx` (customer id, company id, customer group id,
`isAgenting`, `showInclusiveTaxPrice`, active currency) and passed down as props. No new
slice, no Context, no `useStorageState`.

## 6. Storefront wishlist service

`src/shared/service/bc/graphql/wishlist.ts`, calling `B3Request.graphqlBC`. On Stencil the
endpoint is `window.origin + '/graphql'`, same-origin, so the default fetch credentials mode
sends the session cookie. `graphqlBC` returns the raw envelope and does **not** inspect
`errors` (unlike `graphqlB2B`), so every function here does.

### 6.1 Operations

Operation names are for MSW matching and readability; they do not affect the API. Field
names are to be verified against the live schema during the token spike (§12.1).

```graphql
query FavoritesLists($after: String) {
  customer {
    wishlists(first: 50, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        entityId name isPublic
        items(first: 50) {
          pageInfo { hasNextPage endCursor }
          edges { node { entityId productEntityId variantEntityId } }
        }
      } }
    }
  }
}

query FavoritesListItems($listId: Int!, $after: String) {
  customer {
    wishlists(filters: { entityIds: [$listId] }, first: 1) {
      edges { node { entityId
        items(first: 50, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges { node { entityId productEntityId variantEntityId } }
        }
      } }
    }
  }
}

mutation CreateFavoritesList($name: String!) {
  wishlist { createWishlist(input: { name: $name, isPublic: false }) { result { entityId name } } }
}
mutation AddFavoritesItems($listId: Int!, $items: [WishlistItemInput!]!) {
  wishlist { addWishlistItems(input: { entityId: $listId, items: $items }) { result { entityId } } }
}
mutation RenameFavoritesList($listId: Int!, $name: String!) {
  wishlist { updateWishlist(input: { entityId: $listId, data: { name: $name } }) { result { entityId name } } }
}
mutation DeleteFavoritesItems($listId: Int!, $itemIds: [Int!]!) {
  wishlist { deleteWishlistItems(input: { entityId: $listId, itemEntityIds: $itemIds }) { result { entityId } } }
}
mutation DeleteFavoritesLists($listIds: [Int!]!) {
  wishlist { deleteWishlists(input: { entityIds: $listIds }) { result } }
}
```

### 6.2 Functions

| function | behavior |
|---|---|
| `getCustomerWishlists(): Promise<WishlistNode[] \| null>` | Pages `wishlists` with cursors; for any list whose `items.pageInfo.hasNextPage` is true, pages `FavoritesListItems` until complete. Returns `null` when `data.customer` is `null` (signed out). |
| `createWishlist(name)` | returns `{ entityId, name }` |
| `updateWishlistName(listId, name)` | returns `{ entityId, name }` |
| `addWishlistItems(listId, items: { productEntityId: number; variantEntityId?: number }[])` | resolves to `void` |
| `deleteWishlistItems(listId, itemIds: number[])` | resolves to `void` |
| `deleteWishlists(listIds: number[])` | resolves to `void` |

Any response with a non-empty `errors` array, or a missing `data` payload, throws
`WishlistError` (a plain `Error` subclass carrying the first GraphQL message). Types are
hand-written in the module like `cart.ts`; there is no codegen for the storefront schema
(see `base.ts`). Exports go through `src/shared/service/bc/index.ts`; every export must have
a consumer (knip).

## 7. Storage-contract adapter

`src/pages/Favorites/storage.ts` is the **only** module that touches `localStorage` or
`sessionStorage`. This is a deliberate, documented exception to the repo rule against web
storage for state: these keys are **another system's storage** (the Stencil theme's), read
and written through one adapter, and never used as a React state source. The file header
says so.

| function | behavior |
|---|---|
| `readGuestFavorites(): GuestFavorite[]` | Parses `favorites_guest`. Absent, malformed JSON, non-array `value`, or a non-null past `expiry` → `[]`. Rows missing a numeric `productId` are dropped; `variantId` normalizes to `number \| null`. |
| `clearGuestFavorites()` | Writes `{ "value": [], "expiry": null }` so both a null-tolerant and a non-null-tolerant theme reader see "empty". |
| `getDefaultListId(): number \| null` | Parses `favorites_default_list`; non-numeric → `null`. |
| `setDefaultListId(id: number)` | Writes the id as a string. |
| `clearDefaultListId()` | Removes the key. |
| `invalidateListsCache()` | Removes `favorites_lists`. |

Every storage access is wrapped in try/catch (storage can throw in private windows); a
throw reads as empty and writes are best-effort.

## 8. Pure domain functions

`src/pages/Favorites/favorites.ts`. No React, no network, no storage. Fully unit-tested.

```ts
type FavoriteItem = { id: number; productId: number; variantId: number | null };
type FavoriteList = { id: number; name: string; isPublic: boolean; items: FavoriteItem[] };
type GuestFavorite = { productId: number; variantId: number | null; addedAt: number };
type ItemRef = { productId: number; variantId: number | null };
```

- `normalizeLists(nodes: WishlistNode[]): FavoriteList[]` — flattens edges into the theme's
  normalized shape (same field names as the theme's `favorites_lists` cache, by design).
- `itemKey(ref: ItemRef): string` — `${productId}:${variantId ?? ''}`. Product-only and
  product+variant rows are distinct keys, matching the backend.
- `membership(lists, ref): Set<number>` — ids of lists containing that exact key.
- `planSaveToLists({ lists, ref, selected: Set<number> })` →
  `{ adds: { listId }[]; removes: { listId; itemId }[] }`. Lists in `selected` without the
  key are adds; lists containing the key but not in `selected` are removes. Empty `selected`
  therefore removes the product from every list.
- `planGuestMerge({ guest, lists, defaultListId })` →
  `{ target: { kind: 'existing'; listId; name } | { kind: 'create' }; rows: ItemRef[] } | null`.
  Target is the default list **if it exists in `lists`**, else the first list, else create
  (the caller names the new list with the `favorites.defaultListName` copy, "My Favorites").
  `rows` are guest rows whose key is absent from the target (de-duplicated among
  themselves). When `guest` is empty the plan is `null`. When `guest` is non-empty but every
  row is already in the target, the plan has `rows: []`; the caller then clears the guest
  store without calling the API and shows no toast.
- `planAddToCart(rows: FavoriteRow[])` →
  `{ lineItems: CartLineItem[]; skipped: { row; reason: 'optionsRequired' | 'notPurchasable' | 'unavailable' }[] }`.
  Per row: unavailable (including a product with no variant at all) → skipped;
  `requiresOptions` → skipped; variant `purchasing_disabled` → skipped; otherwise
  `{ productId, variantId, quantity, newSelectOptionList: [] }`, the shape
  `createOrUpdateExistingCart` reads, with `variantId` = the saved variant id, or the
  product's first variant id for an option-less product (as the product-search dialog does),
  and `quantity = max(1, orderQuantityMinimum || 1)`.
- `hydrateRows(list, productsById, { showInclusiveTaxPrice })` → `FavoriteRow[]`, joining
  each item with its `productsSearch` product:
  - `available`: product present and, when a variant is saved, that variant present.
  - `name`: product name. `sku`: the saved variant's sku, else the product sku.
  - `imageUrl`: the saved variant's `image_url`, else the product `imageUrl`, else the
    portal's default product image.
  - `price`: the saved variant's `bc_calculated_price.tax_inclusive` or `tax_exclusive` per
    the setting, else the first variant's; `null` when the catalog flags `isPriceHidden` for
    this buyer.
  - `requiresOptions`: any modifier is required, **or** no variant is saved and the product
    has options.
  - `purchasable`: the resolved variant is not `purchasing_disabled`.
  - `productUrl`, `orderQuantityMinimum` passed through.

## 9. Data flow and hooks

- **Lists query.** `['favorites', 'lists', customerId]` → `getCustomerWishlists` →
  `normalizeLists`. `null` result is kept as the signed-out signal. `staleTime: 0`; refetch
  on mount.
- **Products query.** `['favorites', 'products', sortedUniqueProductIds]` →
  `fetchFavoriteProducts` in `api.ts`, which calls `searchProducts({ productIds, currencyCode,
  companyId, customerGroupId })` in chunks of 50 (the size `AddToQuote` uses) and merges
  results into a `Map<productId, ProductSearch>`. Enabled only when there are ids.
- **Mutations** (`useMutation`, one per operation) share an `onSuccess` that calls
  `invalidateListsCache()` and `queryClient.invalidateQueries(['favorites', 'lists'])`, plus
  `setDefaultListId(listId)` for any mutation that **added** items to a list (save-to-lists
  adds, merge). `onError` toasts `favorites.error.generic` and invalidates the lists query.
- **Merge trigger.** In `index.tsx`, once the lists query has data and a `useRef` flag says it
  has not run this mount: read the guest store, build the plan, run it (create list if
  needed → `addWishlistItems`), `clearGuestFavorites()`, toast `favorites.merge.added`,
  fire GA4 per row, invalidate. A plan with no rows only clears the guest store. On
  failure: no clear, one `favorites.error.generic` toast.
- **Cart.** `createOrUpdateExistingCart(lineItems)` then `b3TriggerCartNumber()` in a
  `finally`, exactly as Quick Order does. Cart errors surface the thrown message.

## 10. Page UI

### 10.1 Layout

```
Favorites                                                        [ + New list ]
[ My Favorites (12) ] [ Spring order (3) ] [ Gift ideas (0) ]        ← scrollable MUI Tabs
My Favorites                     [ Rename ] [ Delete list ] [ Add all to cart ]
img  Product name          SKU-100   $12.34   [Add to cart]      [Save to lists…] [Remove]
img  Product with options  SKU-200   $9.00    [Choose options ↗] [Save to lists…] [Remove]
img  No longer available   —         —                           [Save to lists…] [Remove]
```

Mobile (`useMobile`, ≤ 768px): tabs scroll, the toolbar wraps, rows become cards in the
Quick Order card style — image left; name, SKU and price stacked; actions beneath.

### 10.2 States

| state | render |
|---|---|
| flag off or agenting | `favorites.unavailable` text (route filter normally prevents arrival) |
| lists query returned `null` | `favorites.signedOut` + a Sign in link to `#/login` |
| zero lists | `favorites.empty.noLists` + "Start shopping" link (`href="/"`, `target="_top"`) + New list button |
| selected list has zero items | `favorites.empty.list` |
| loading | portal `B3Spin` over the content until lists **and** products settle |
| products query failed | rows render `favorites.item.detailsUnavailable` with no cart action, and an inline error alert with `favorites.error.products` sits above the rows (no extra toast: the B2B client already toasts its own message); list-level and remove/save actions keep working |

### 10.3 Flows

- **New list / Rename** — `ListNameDialog` (B3Dialog; text field; primary button "Create"
  or "Save"). Name is required and trimmed; duplicates allowed. Create → `createWishlist`
  → select the new list. Rename → `updateWishlistName` → toast `favorites.renamed`.
- **Delete list** — B3Dialog confirm with `favorites.deleteList.confirm` (ICU plural on item
  count) → `deleteWishlists([id])`; if `getDefaultListId() === id` → `clearDefaultListId()`;
  selection falls to the first remaining list; toast `favorites.deleteList.deleted`.
- **Remove** — `deleteWishlistItems(listId, [itemId])` immediately; toast
  `favorites.item.removed`. No confirm, no undo.
- **Save to lists** (the picker) — `SaveToListsDialog` titled `favorites.picker.title`:
  one labeled checkbox per list, checked when `membership` contains the list; an inline
  `favorites.picker.newListName` field with Create that calls `createWishlist` and adds the
  new list to the dialog pre-checked; a hint `favorites.picker.removeHint` shown when no
  list is checked; Save disabled until the selection differs from membership. Save runs
  `planSaveToLists`: one `addWishlistItems` per add, one `deleteWishlistItems` per remove,
  then toast `favorites.picker.saved` (exactly one add, no removes) or
  `favorites.picker.updated`, GA4 per add, `setDefaultListId` to the last added list.
- **Add to cart (row)** — `planAddToCart([row])` → cart helper → toast
  `favorites.cart.addedOne` with action `favorites.cart.view` that sets
  `window.location.href = '/cart.php'` (the React realm is the parent window, so this
  leaves the portal correctly). Rows with `requiresOptions` render a "Choose options" link
  to `productUrl` with `target="_top"` instead of the button; unavailable rows render no
  cart action.
- **Add all to cart** — `planAddToCart(rows)`; if `lineItems` is empty → toast info
  `favorites.cart.nothingToAdd`, no cart call. Otherwise one cart call, then toast
  `favorites.cart.addedMany` with `favorites.cart.skipped` as the description when any were
  skipped. The cart call is all-or-nothing; a rejection shows the server message.

### 10.4 Copy (en.json, all new keys)

```
global.navMenu.favorites            Favorites
favorites.unavailable               Favorites are not available for this account.
favorites.signedOut                 Sign in to see your favorites.
favorites.signIn                    Sign in
favorites.empty.noLists             No favorites yet. Look for the star on any product to save it.
favorites.empty.startShopping       Start shopping
favorites.empty.list                This list is empty.
favorites.newList                   New list
favorites.listName.label            List name
favorites.listName.required         Enter a list name
favorites.listName.create           Create
favorites.listName.save             Save
favorites.rename                    Rename
favorites.renamed                   List renamed
favorites.deleteList                Delete list
favorites.deleteList.confirm        Delete {name}? {count, plural, one {Its # favorite} other {Its # favorites}} will be removed.
favorites.deleteList.deleted        List deleted
favorites.tabLabel                  {name} ({count})
favorites.item.remove               Remove
favorites.item.removed              Removed from {list}
favorites.item.saveToLists          Save to lists
favorites.item.addToCart            Add to cart
favorites.item.chooseOptions        Choose options
favorites.item.unavailable          No longer available
favorites.item.detailsUnavailable   Product details unavailable
favorites.addAllToCart              Add all to cart
favorites.cart.addedOne             Added to cart
favorites.cart.addedMany            {count, plural, one {# item} other {# items}} added to cart
favorites.cart.skipped              {count, plural, one {# item} other {# items}} skipped: they need options or are unavailable
favorites.cart.nothingToAdd         Nothing to add: these items need options or are unavailable.
favorites.cart.view                 View cart
favorites.picker.title              Save {product} to lists
favorites.picker.newListName        New list name
favorites.picker.removeHint         Unchecking every list removes this product from your favorites.
favorites.picker.saved              Saved to {list}
favorites.picker.updated            Favorites updated
favorites.merge.added               {count, plural, one {# favorite} other {# favorites}} added to {list}
favorites.defaultListName           My Favorites
favorites.error.generic             Something went wrong updating your favorites. Please try again.
favorites.error.products            We couldn't load product details for your favorites.
```

Wording may be polished during implementation; the vocabulary rule (favorites, list; never
wishlist) may not.

### 10.5 Accessibility

Real `<button>`s throughout (MUI Button / IconButton); dialogs are MUI Dialogs via
`B3Dialog`, giving Escape-to-close, focus trap and focus return; checkboxes labeled by list
name; tabs are MUI Tabs with proper roles; text buttons at the portal's default size clear
the 44px target; MUI's focus-visible ring is left intact. `aria-pressed` is not needed on
this page since the star is out of scope.

## 11. Analytics

`src/pages/Favorites/analytics.ts`:

```ts
trackAddToWishlist({ productId, variantId, name, listName }) =>
  pushDataLayerEvent({
    event: 'add_to_wishlist',
    ecommerce: {
      items: [{
        item_id: String(productId),
        item_name: name,
        ...(variantId != null ? { item_variant: String(variantId) } : {}),
        item_list_name: listName,
        quantity: 1,
      }],
    },
  });
```

Fired once per item for every successful add: save-to-lists adds (copy and move alike) and
merge rows (merge rows carry no `item_name`, since they are saved before the catalog is
loaded). **Assumption to confirm with the theme team:** `item_id` is the product id and
`item_variant` the variant id, as the star's `data-product-id` / `data-variant-id`
attributes expose; if the theme sends SKUs, the portal matches the theme.

## 12. Interop risks and verification order

### 12.1 Token authority (verify first, before any UI work)

The portal's storefront token (`company.tokens.bcGraphqlToken`) is minted through the B2B
API's `storeFrontToken` mutation, not the theme's auto-generated `settings.storefront_api.token`.
Both are Storefront API tokens and the cookie carries the customer identity, so the
customer-scoped query and mutations are expected to work. **Task 1 of the plan proves it on
the SSW sandbox** with a signed-in customer: run `FavoritesLists` and one mutation through
the portal's token. Fallback if it fails: the theme adds `storefrontToken` to
`BC_CONTEXT.favorites` and `wishlist.ts` prefers it when present. Either way the field
names in §6.1 are checked against the live schema in the same session.

### 12.2 Page sizes

The portal pages both connections. The theme's contract query is unpaged and will truncate
at BigCommerce's default page size once a list grows; this is relayed to the theme team
(§15), not worked around in the portal.

### 12.3 Concurrent merge

On a full page load of `…#/favorites` both the theme module and the portal may see a
non-empty guest store. Duplicate adds are server no-ops and the store is cleared twice; the
worst case is a duplicate toast. Accepted.

## 13. Error handling and edge cases

- `WishlistError` → toast `favorites.error.generic` + refetch lists.
- `customer: null` → signed-out state.
- Products query failure → §10.2 row.
- Cart error → server message verbatim.
- Merge failure → guest store untouched, one generic toast.
- Saved variant missing from the catalog response, or product missing → unavailable row.
- `?list=` naming a deleted or foreign list → first list.
- `favorites_default_list` left by another customer on a shared browser → ignored by the
  merge (target must exist in the current customer's lists).
- Long lists → paged fetch, chunked hydration, no table pagination.

## 14. Testing

All tests use `tests/test-utils` re-exports, MSW, and **builders for every piece of data**
(`buildWishlistNodeWith`, `buildWishlistItemWith`, `buildProductSearchWith`,
`buildGuestFavoriteWith`, alongside the existing state builders). Each new test is proven
able to fail by reverting the production change it covers and rerunning it once, per this
repo's record of vacuous tests. No `act`, no hardcoded data, use-case-named `it` blocks.

- **`storage.test.ts`** — wrapper parsing; absent, malformed, non-array, expired; clear
  writes the empty wrapper; default-list parse and NaN; cache invalidation removes the key;
  storage throwing reads as empty.
- **`favorites.test.ts`** — `normalizeLists`; `itemKey` distinguishes variant rows;
  `planSaveToLists` copy, move, remove-all, no-change; `planGuestMerge` default present,
  default missing → first list, no lists → create "My Favorites", filters existing pairs,
  de-duplicates guest rows, `null` on empty guest; `planAddToCart` minimum quantity,
  first-variant fill for option-less products, each skip reason; `hydrateRows` variant SKU
  and image, product fallbacks, tax-inclusive vs exclusive price, hidden price,
  unavailability, `requiresOptions` from modifiers and from missing variant.
- **`wishlist.test.ts`** — MSW `graphql.query`/`graphql.mutation` handlers on the storefront
  endpoint: variables asserted per operation; list paging and item paging across cursors;
  `errors` envelope → `WishlistError`; `customer: null` → `null`.
- **`api.test.ts`** — availability matrix (platform, flag absent, `enabled:false`);
  chunked hydration issues one `searchProducts` per 50 ids and merges.
- **`index.test.tsx`** — tabs and rows with image, name, SKU, price; `?list=` selection and
  fallback; create (variables, new tab selected); rename; delete with default-key clearing
  and fallback selection; remove; the picker end to end (membership checkboxes, copy, move,
  remove-all hint, inline create pre-checked, Save disabled until change, GA4 event pushed,
  default-list key written, `favorites_lists` removed); single add to cart with the
  minimum quantity; add all with skips and the two toasts; nothing-to-add path; cart
  server error toast; choose-options link has `target="_top"`; guest merge creates
  "My Favorites" when there are no lists, adds only missing rows, clears the store, plural
  toast; merge failure leaves the store; signed-out state; unavailable state when agenting.
- **`index.mobile.test.tsx`** — cards render name, SKU, price and actions.
- **`routeList.test.ts`** — `/favorites` visible for a B2C customer and for a B2B buyer of
  an approved company with the flag on; hidden when the flag is absent, `enabled:false`,
  agenting, or the customer is a sales rep. **`routeList.platform.test.ts`** — hidden on a
  non-`bigcommerce` platform (its own file because the platform mock is module-wide).

## 15. Theme-side asks (relay to the LoveGroomers team)

1. Emit `window.BC_CONTEXT.favorites = { enabled: <favorites theme setting> }` on every
   page, before the portal bundle loads, from the same setting that enables the star.
2. Page the wishlist queries (`first: 50` + cursors); the unpaged query truncates.
3. Confirm the GA4 `add_to_wishlist` item field sources (§11).
4. Optionally add a "View favorites" action to the star's toasts linking to `/#/favorites`,
   and `/#/favorites?list=<id>` from the picker.

## 16. Verification before completion

From `apps/storefront/`: the scoped suites (`yarn test --run src/pages/Favorites
src/shared/service/bc/graphql/wishlist.test.ts src/shared/routeList.test.ts`),
`yarn tsc --noEmit`, `yarn lint` diffed against the known-red `dev` baseline (never expected
green), `yarn build`, then a live check on the SSW sandbox by routing the sandbox bundle
path to the local `dist`. Commits follow `feat: B2B-0000 …`; `en.json` is staged
hunk-by-hunk because the working tree carries another session's uncommitted change to it.
