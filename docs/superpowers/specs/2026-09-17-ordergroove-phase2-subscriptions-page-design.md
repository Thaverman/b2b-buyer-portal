# Ordergroove Phase 2 — read-only subscriptions page (design)

**Program spec:** [2026-09-15-ordergroove-subscriptions-custom-manager-design.md](2026-09-15-ordergroove-subscriptions-custom-manager-design.md)
(§5 shared foundation, §7 Phase 2 scope, §5.4 data model, §5.5 error kinds).
**Builds on:** Phase 1 (merged to `dev` as `adf1eee3`, fixes through `94d98484`): the
`BC_CONTEXT.subscriptions` gate, `src/shared/service/ordergroove/` (auth mint and cache, `ogFetch`,
`listAll`, `withTimeout`, `getProduct`), the Ordergroove builders, and the Playwright live-check
recipe.

## 1. Decisions

| # | Decision | Alternatives considered |
|---|---|---|
| 1 | The new page swaps in only when a **second host flag**, `BC_CONTEXT.subscriptions.customManager`, is true. Phase 1's warning keeps working from the parent object alone, so prod can carry the warning while the page is still sandbox-only. | Reuse the parent key (couples the warning's rollout to a read-only page); stay dark until Phase 4; build Phases 2 and 3 together. |
| 2 | Until Phase 3 lands, the page carries an **escape link** to today's hosted manager for actions, opened in the top window. | No link (fine only while the flag never leaves sandbox). |
| 3 | **One card per active subscription**, flat list; cancelled ones in a collapsed section. | Grouped by upcoming order (Ordergroove's manager style; fights subscription-scoped edits in Phase 3); table. |
| 4 | A **recent orders** section under the cards: latest ten Ordergroove orders, newest first, web order numbers linking to the portal's order detail, failed attempts with their message, "Show more". | Next order date only; history nested in each card. |
| 5 | **Per-resource `useQuery`s joined by a pure function** into card view-models. | One aggregate query (all-or-nothing); a middleware aggregation endpoint (server component the program excludes). |
| 6 | **No explicit analytics event.** Hash-route page views are handled like every other portal page. | Re-emit a page-view event via `pushDataLayerEvent`; add later if GTM needs a named event. |

## 2. Switch and structure

### 2.1 Host flag and gate

```ts
// apps/storefront/src/index.d.ts — inside BC_CONTEXT.subscriptions
/** Phase 2: when true (or "true"), /manage-subscriptions renders the portal page, not the hosted iframe. */
customManager?: boolean | string;
```

```ts
// src/shared/service/ordergroove/config.ts
export const isCustomManagerAvailable = () =>
  isSubscriptionsAvailable() && isHostFlagEnabled(getSubscriptionsConfig()?.customManager);
```

The theme emits `customManager: true` from a new theme setting next to `ordergroove_merchant_id`
(stencil repo; not in this plan). Theme templates emit booleans as strings routinely, so the flag
is on for `true` or `"true"` in any case and off for everything else — the rule the Braintree
add-card flag already followed, now shared as `isHostFlagEnabled` in `src/utils/hostFlag.ts`.

Found on sandbox during the live check (2026-09-17): the theme now emits the whole
`subscriptions` block itself, with an extra `enabled` boolean beside the three Phase 1 keys, and
— a theme bug — an **empty `merchantId`** on the test store (it reads the production setting,
not the `_test` one). Two consequences: `isSubscriptionsAvailable()` honours `enabled` (absent =
on; `false` or `"false"` = every Ordergroove feature off, Phase 1's warning included), and until
the stencil fix lands every Ordergroove call from sandbox fails at the CORS layer, so the Phase 1
warning degrades to "couldn't check" there. The live check injected the known-good merchant id
to verify the page itself.

Resolved later the same day: by ~11:10 CDT the sandbox theme emitted
`{ enabled: true, customManager: true, merchantId, authEndpoint, appClientId }` with a full
merchant id, and a bundle containing Phase 2 was on `/content/b2bBuyerPortal/dist/`. Checked as a
customer with no injection: the portal page renders with 14 fully populated cards, the cancelled
toggle, the escape link and ten recent-order rows, and the Phase 1 dialog lists the 14
subscriptions again.

### 2.2 Route and switch

- `routeList.ts` entry for `/manage-subscriptions` is **unchanged**: same permissions, same menu
  item, no new gate. The route stays reachable for everyone because the iframe fallback still
  serves anyone the new page does not.
- `src/pages/ManageSubscriptions/index.tsx` becomes the switch:

```tsx
export default function ManageSubscriptions() {
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  // The Ordergroove credential is signed for the logged-in customer, so a masquerading rep
  // must never see the portal page (program spec §5.1); the iframe keeps today's behaviour.
  return isCustomManagerAvailable() && !isAgenting ? <SubscriptionsManager /> : <HostedManagerFrame />;
}
```

- Today's iframe code moves verbatim into `components/HostedManagerFrame.tsx` (the unused
  `_props` parameter and the `console.warn` go with the move; that clears the two pre-existing
  ESLint findings on this file).

### 2.3 Escape link

Page header, right of the title: **"Manage in the subscription manager"** — an MUI `Link` with
`href={`${BigCommerceStorefrontAPIBaseURL}/subscriptions`}` and `target="_top"`. The portal renders
inside the ThemeFrame iframe; a plain anchor would load the theme page inside the frame. Phase 3
removes the link when every action exists in the portal.

### 2.4 Files

```
apps/storefront/src/
  index.d.ts                                   customManager flag (type + doc comment)
  shared/service/ordergroove/
    config.ts                                  isCustomManagerAvailable()
    types.ts                                   OgOrder, OgItem, OgAddress
    api.ts                                     listSubscriptions, listPayments, listAddresses,
                                               listUpcomingOrders, listOrdersPage (+ existing getProduct)
    index.ts                                   exports the above and the new types
  pages/ManageSubscriptions/
    index.tsx                                  switch (above)
    SubscriptionsManager.tsx                   the page
    viewModel.ts                               pure join + mapping tables
    hooks/useSubscriptionsData.ts              the six queries
    components/HostedManagerFrame.tsx          today's iframe, moved
    components/SubscriptionCard.tsx
    components/CancelledSubscriptions.tsx
    components/RecentOrders.tsx
  lib/lang/locales/en.json                     subscriptions.* keys (§6)
apps/storefront/tests/ordergrooveBuilders/index.ts   buildOgOrderWith, buildOgItemWith, buildOgAddressWith
```

Business logic (which orders to show, how to phrase a card) stays in the page folder; the service
module only lists resources.

## 3. Data

### 3.1 Service additions (`src/shared/service/ordergroove/`)

| function | request | notes |
|---|---|---|
| `listSubscriptions(customerId)` | `listAll('/subscriptions/')` | live and cancelled; the page decides |
| `listPayments(customerId)` | `listAll('/payments/')` | all records; the card looks up `subscription.payment` by `public_id` |
| `listAddresses(customerId)` | `listAll('/addresses/')` | |
| `listUpcomingOrders(customerId)` | `listAll('/orders/?status=1')` and `listAll('/items/?status=1')` | returns `{ orders, items }`; status 1 = UNSENT (future order) |
| `listOrdersPage(customerId, url)` | `ogFetch(url)` for one page | `url` is the first-page URL or a `next` cursor; returns `OgPage<OgOrder>` |
| `getProduct(customerId, externalId)` | existing | |

Every request keeps the existing per-request 5 s `withTimeout`, the 403 re-mint, and the error
kinds. `listAll` is unchanged.

New types, as documented in Ordergroove's REST reference and observed on the 2026-09-15 spike:

```ts
export interface OgOrder {
  public_id: string;
  customer: string;
  payment: string;
  shipping_address: string;
  currency_code: string;
  sub_total: string;
  total: string;
  place: string;               // "YYYY-MM-DD" (probe confirms; see §3.3)
  status: number;              // §4.3 table
  order_merchant_id: string | null;   // BigCommerce order id once placed
  rejected_message: string | null;
  tries: number;
  cancelled: string | null;
}

export interface OgItem {
  public_id: string;
  order: string;
  subscription: string | null;
  product: string;
  quantity: number;
  price: string;
}

export interface OgAddress {
  public_id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  address: string;
  address2: string | null;
  city: string;
  state_province_code: string;
  zip_postal_code: string;
  country_code: string;
  live: boolean;
}
```

### 3.2 Queries (`hooks/useSubscriptionsData.ts`)

All keys start `['ordergroove', customerId, …]`; all use `retry: false` (the page has its own Retry).

| key | queryFn | enabled | feeds |
|---|---|---|---|
| `subscriptions` | `listSubscriptions` | always (page is rendered only when the gate passes) | cards, cancelled section, product ids |
| `payments` | `listPayments` | always | payment summary |
| `addresses` | `listAddresses` | always | shipping summary |
| `upcoming` | `listUpcomingOrders` | always | next order date |
| `products` | `getProduct` per distinct `subscription.product`, `Promise.all`, each `.catch(() => null)` | subscriptions loaded and at least one id; key includes the sorted id list | name, image, SKU, detail link |
| `orderHistory` | `useInfiniteQuery`, `listOrdersPage`; `initialPageParam` = `/orders/?place_end=<today>&ordering=-place`; `getNextPageParam = (page) => page.next ?? undefined` | always | recent orders |

`place_end=<today>` excludes future (UNSENT) orders, which belong on the cards, while keeping
anything placed or attempted up to today (inclusive). `ordering=-place` makes the API return
newest first; its default order is not by place (probe, §3.3). `<today>` is the local date as
`YYYY-MM-DD`, computed once per mount.

The hook returns the raw query results; `viewModel.ts` turns them into the render model. Nothing
here touches Redux, Context, or storage.

### 3.3 Task 0 — live probe before implementation (GET only, throwaway)

Run 2026-09-17 with the spike recipe (middleware-minted header, Node `fetch`, customer 80591).
Findings:

1. `GET /items/?status=1` — 14 items for the 14 active subscriptions; each carries `subscription`,
   `order`, `product`, `quantity`, `price`. The join works as designed.
2. `place` is `"YYYY-MM-DD HH:mm:ss"` — upcoming orders at `00:00:00`, placed ones with the real
   placement time (e.g. `2026-09-17 01:37:45`). The view model keeps the first ten characters.
3. `GET /orders/?place_end=<today>` is **not** newest-first by default (page 1 came back 09-17,
   09-16, 09-03, 09-02, 09-01, 09-09, …). `ordering=-place` **is** honoured and strictly
   descending, so the first-page URL carries it. `place_end` is inclusive of today and excludes the
   future UNSENT orders.
4. Page size 10; this customer has 155 past orders (statuses 5 and 3 on page 1).

No code was kept from the probe.

## 4. View model (`viewModel.ts`, pure)

### 4.1 Types

```ts
export interface SubscriptionCard {
  publicId: string;
  externalProductId: string;
  product: { name: string; imageUrl: string | null; detailUrl: string | null; sku: string | null } | null;
  quantity: number;
  frequencyDays: number;
  nextOrderDate: string | null;          // YYYY-MM-DD of the earliest upcoming order holding one of its items
  shippingAddress: AddressSummary | null;
  payment: PaymentSummary | null;
  cancelledOn: string | null;            // null = active
}

export interface AddressSummary { name: string; company: string | null; line1: string; line2: string | null; locality: string /* "City, ST 12345" */ }
export interface PaymentSummary { brand: string | null; last4: string; expiry: string /* "M/YYYY" as Ordergroove sends it */ }

export interface RecentOrder {
  publicId: string;
  placedOn: string;                      // order.place
  webOrderNumber: string | null;         // formatOrderId(order_merchant_id) when present
  orderDetailPath: string | null;        // `/orderDetail/${order_merchant_id}` when present
  total: string;
  currencyCode: string;
  outcome: 'success' | 'failed' | 'cancelled' | 'processing';
  message: string | null;                // rejected_message for failed orders
}
```

### 4.2 Join rules

- **Active** = `cancelled === null && live`; **cancelled** = `cancelled !== null` (`live` false alone,
  with no cancelled date, is treated as cancelled with an unknown date and shown without one).
- **Product**: `products.get(subscription.product)`; `null` while loading or after a failed lookup.
  The card then shows "Product {externalProductId}" and no image or link.
- **Next order date**: items with `item.subscription === subscription.public_id` → their orders →
  the smallest `place`. None → `null` → "No upcoming order".
- **Shipping**: `addresses.find(a => a.public_id === subscription.shipping_address)`;
  `name` = first and last name, `locality` = `city, state_province_code zip_postal_code`.
- **Payment**: `payments.find(p => p.public_id === subscription.payment)`; brand from the table
  below, `last4 = cc_number_ending`, `expiry = cc_exp_date`.
- **Frequency copy**: days divisible by 7 → weeks, else days, both ICU plurals (same rule as Phase 1).
- **Card order**: active cards by next order date ascending, unscheduled last, then product name.
  Cancelled cards by `cancelled` descending.

### 4.3 Mapping tables

Card brands (`cc_type`, Ordergroove reference "Credit Card Types"): 1 Visa, 2 Mastercard,
3 American Express, 4 Discover, 5 Diners, 6 JCB; anything else → `null` → "Card ending in …".

Order outcome (`status`, Ordergroove reference "Order Status Codes"):

| status | outcome |
|---|---|
| 5 SUCCESS | `success` |
| 3 REJECTED, 12, 13, 14, 15, 18 CREDIT_CARD_RETRY, 19, 20 | `failed` (shows `rejected_message` when present) |
| 4 CANCELLED | `cancelled` |
| 1 UNSENT, 6 SEND_NOW, 9, 10, 11 | `processing` |
| 17 MERGED | dropped from the list |
| unknown | `processing` |

The API returns recent orders newest first (`ordering=-place`); the view model also sorts each
loaded page by `place` descending so the order never depends on the transport.

## 5. UX

### 5.1 Layout

```
Manage Subscriptions                              Manage in the subscription manager ↗
─────────────────────────────────────────────────────────────────────────────────────
[image] Product name                                            Next order Oct 3, 2026
        SKU 12345 · View product
        Qty 2 · every 4 weeks
        Ships to  Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701
        Paid with Visa ending in 1111 · exp 3/2028
… one card per active subscription …

▸ 4 cancelled subscriptions                                   (collapsed; same card, "Cancelled on …")

Recent subscription orders
Sep 5, 2026   Order 8KX2Q →   $81.50   Placed
Aug 8, 2026   —              $81.50   Failed · Card declined (rejected_message)
[Show more]
```

- Cards: MUI `Card`/`Paper` in the visual family of `/payment-methods`' `PaymentMethodRow`;
  image 80 px with the product name as alt text, falls back to nothing when `imageUrl` is null.
  The details column is a `group` named by the product (or the "Product {id}" fallback), which
  names the card for assistive tech and lets the phone-layout test tell the two layouts apart.
  "View product" is a plain anchor to `detailUrl` with `target="_top"` (storefront page, outside
  the SPA).
- Mobile (`useMobile`): cards stack full-width, the next-order date moves under the title, recent
  order rows wrap to two lines.
- Cancelled section: an MUI `Accordion` (or `Collapse` with a toggle button) headed by the plural
  count; hidden entirely when there are none.
- Recent orders: rows, not a table, ten per page; "Show more" while `hasNextPage`; the web order
  number is a router `Link` to `/orderDetail/{order_merchant_id}` (internal navigation, so no
  `target`); a failed row shows its message on a second line in `text.secondary`.

### 5.2 States

| state | rendering |
|---|---|
| subscriptions loading | `B3Spin` over the page body |
| no active subscriptions | "You don't have any active subscriptions." in the list area; cancelled section and recent orders still render |
| secondary query loading | skeleton text in that card cell (product line, address, payment, next date) |
| secondary query failed while subscriptions loaded | that cell reads "Unavailable" (product cell: "Product {id}"), and the page-level `Alert severity="error"` reads "Some subscription details couldn't be loaded." with a **Try again** button that refetches every errored query |
| `sessionExpired` on any query | `Alert severity="warning"` with the session-expired copy, nothing else changes |
| subscriptions query failed (other kinds) | `Alert severity="error"` "We couldn't load your subscriptions." with a **Try again** button that refetches every errored query; list area empty |
| recent orders failed | inline "We couldn't load your orders." with its own Try again; cards unaffected |
| recent orders empty | "No subscription orders yet." |

Masquerading, missing flag, or non-BigCommerce platform never reach these states: the switch
renders the iframe.

## 6. Copy (`en.json`, all new)

```
subscriptions.hostedManagerLink           Manage in the subscription manager
subscriptions.empty                       You don't have any active subscriptions.
subscriptions.loadError                   We couldn't load your subscriptions.
subscriptions.partialLoadError            Some subscription details couldn't be loaded.
subscriptions.retry                       Try again
subscriptions.sessionExpired              Your session has expired — please sign in again.
subscriptions.card.quantity               Qty {count}
subscriptions.card.everyWeeks             every {count, plural, one {week} other {# weeks}}
subscriptions.card.everyDays              every {count, plural, one {day} other {# days}}
subscriptions.card.nextOrder              Next order {date}
subscriptions.card.noUpcomingOrder        No upcoming order
subscriptions.card.shipsTo                Ships to
subscriptions.card.paidWith               Paid with
subscriptions.card.payment                {brand} ending in {last4} · exp {expiry}
subscriptions.card.paymentUnbranded       Card ending in {last4} · exp {expiry}
subscriptions.card.unnamedProduct         Product {id}
subscriptions.card.viewProduct            View product
subscriptions.card.sku                    SKU {sku}
subscriptions.card.unavailable            Unavailable
subscriptions.card.cancelledOn            Cancelled on {date}
subscriptions.card.cancelled              Cancelled
subscriptions.cancelled.toggle            {count, plural, one {# cancelled subscription} other {# cancelled subscriptions}}
subscriptions.orders.title                Recent subscription orders
subscriptions.orders.empty                No subscription orders yet.
subscriptions.orders.loadError            We couldn't load your orders.
subscriptions.orders.showMore             Show more
subscriptions.orders.webOrder             Order {number}
subscriptions.orders.outcome.success      Placed
subscriptions.orders.outcome.failed       Failed
subscriptions.orders.outcome.cancelled    Cancelled
subscriptions.orders.outcome.processing   Processing
```

The page title is the route name the layout already renders, so there is no `subscriptions.title`
key. Dates render through `displayFormat` from `@/utils/b3DateFormat` (the store's display
format); totals through `currencyFormat` from `@/utils/b3CurrencyFormat` (the store's active
currency — `ordersCurrencyFormat` needs a per-order money format the Ordergroove record does not
carry).

## 7. Error handling

Follows program spec §5.5 for a page: `sessionExpired` → warning alert; `rateLimited`, `timeout`,
`upstream` → error alert with Try again. Per-request timeouts stay at 5 s inside the service; the
page does not add an overall deadline (nothing is blocked while it loads, unlike the Phase 1
dialog). A secondary query's failure degrades its cells only (§5.2). Errors are never logged to the
console from the page; the alerts are the disclosure.

## 8. Analytics

No `pushDataLayerEvent` call. The hosted page emitted GTM events as a full page load; the portal
route is a hash change like every other portal page and is tracked the same way those are. If a
named event is wanted later it is one line in `SubscriptionsManager`.

## 9. Testing

**Builders** (`tests/ordergrooveBuilders`): `buildOgOrderWith`, `buildOgItemWith`,
`buildOgAddressWith`, faker-driven defaults, exported through `tests/test-utils`.

**Unit — `viewModel.test.ts`:** active/cancelled split; product join and the unnamed fallback;
next order date picks the earliest of several upcoming orders and is null with none; address and
payment summaries, including an unknown `cc_type`; frequency weeks vs days; every status code in
§4.3 maps as tabled and 17 is dropped; card ordering; a subscription referencing a payment or
address that is missing from the lists yields `null` summaries.

**Service — `api.test.ts` additions:** each new list function hits the documented path;
`listUpcomingOrders` issues both requests; `listOrdersPage` follows a `next` URL verbatim.

**Hook — `useSubscriptionsData.test.tsx`:** products query waits for subscriptions and de-duplicates
ids; `orderHistory` exposes `hasNextPage` from `next` and `fetchNextPage` requests that URL.

**Page — `SubscriptionsManager.test.tsx`** (MSW, builders, `renderWithProviders`):
1. Cards for two subscription pages with real names, quantities, frequencies, next dates, shipping
   and payment summaries.
2. Product and address lookups fail → "Product {id}" and "Unavailable"; the rest intact.
3. Empty active list with two cancelled → empty copy, toggle reads "2 cancelled subscriptions",
   expands to the cards with their cancelled dates.
4. Subscriptions 403 twice → session-expired alert, no Try again.
5. Subscriptions 500 → error alert; Try again re-requests and the cards appear.
6. Recent orders: a placed order links to `/orderDetail/{id}` with its web number, a failed order
   shows its message, a merged order is absent, Show more loads the second page and disappears
   when `next` is null.
7. The escape link points at `{storefront}/subscriptions` with `target="_top"`.
8. The switch (`index.test.tsx`): flag absent → iframe; flag on and masquerading → iframe; flag on →
   the page (and no iframe).

**Mobile — `SubscriptionsManager.mobile.test.tsx`:** cards stack; the next-order line is present
under the title.

**Live checkpoint (sandbox, customer 80591, Playwright, flag injected via the Phase 1 init-script
setter with `customManager: true`):** fourteen active cards with real names and next dates; the
cancelled toggle reads four; recent orders show web order numbers that match `/orders`; the
escape link opens the hosted manager in the top window; with the flag off the iframe renders and
no request reaches `restapi.ordergroove.com` from the page. No mutation is attempted.

## 10. Out of scope and follow-ups

- Every action (skip, frequency, quantity, address, cancel, reactivate, payment change) — Phase 3
  and Phase 4. The escape link is their interim home and is removed with Phase 3.
- Theme work: emitting `customManager`; later the `/subscriptions` redirect and cutover (Phase 4).
- Grouping duplicate products, per-card order history, a named analytics event.
- Order placement attempts (`/order-placement-attempts/`) for retry — Phase 3.
