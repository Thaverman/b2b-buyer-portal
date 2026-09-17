# Ordergroove Phase 2 — Read-Only Subscriptions Page: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hosted Ordergroove iframe on `/manage-subscriptions` with a portal page that lists the customer's subscriptions (one card each, cancelled collapsed) and their recent Ordergroove orders, behind a second host flag, with a link back to the hosted manager for actions until Phase 3.

**Architecture:** The route stays as it is; `pages/ManageSubscriptions/index.tsx` becomes a switch that renders the new `SubscriptionsManager` when `BC_CONTEXT.subscriptions.customManager` is on and the shopper is not masquerading, else today's iframe. The page runs six react-query queries against `restapi.ordergroove.com` through the Phase 1 service module (auth mint, timeout, 403 re-mint) and joins them into card view-models with a pure function. Products, addresses, payments and next-order dates fill in as they arrive; only the subscriptions query failing blocks the page.

**Tech Stack:** React 18, TypeScript, `@tanstack/react-query` v5 (`useQuery`, `useInfiniteQuery`), MUI, react-router-dom v6, dayjs, Vitest + jsdom + MSW v2 + Testing Library, `tests/builder.ts` builders, ICU messages via `useB3Lang`.

**Spec:** `docs/superpowers/specs/2026-09-17-ordergroove-phase2-subscriptions-page-design.md` (this plan implements all of it) and the program spec `docs/superpowers/specs/2026-09-15-ordergroove-subscriptions-custom-manager-design.md` §5 (shared foundation) and §5.4 (data model).

## Global Constraints

- All commands run from `apps/storefront/` (`cd apps/storefront` first). Node `>=22.16.0`, Yarn `1.22.22`.
- No new Redux slices, Context providers, `localStorage`/`sessionStorage`. Redux is read once at the top of the page (`company.customer.id`, `b2bFeatures.masqueradeCompany.isAgenting`) and passed down.
- `useQuery`/`useInfiniteQuery` for data; every query `retry: false` (the page has its own Try again).
- Imports: `@/` alias, `lodash-es` only, named MUI imports. Import groups separated by blank lines: externals, then `@/…`, then relative.
- ESLint airbnb is on: no `for…of`, no `await` in loops, **no nested ternaries**, no `console`. Do not add violations of the disabled-rule list in CLAUDE.md (no `any`, no `!` assertions, no JSX prop spreading).
- knip fails on unused exports: **export only what another `src` file consumes.** Test-only helpers are not exported. `lint:dependencies` treats a module with no `src` consumer as an orphan, so `yarn lint` is run at Task 10 — a module landed one task before its consumer is expected to show as an orphan until then.
- Commit subject format: `type: B2B-0000 Short description`; end every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Stage by explicit path — this tree carries other sessions' uncommitted work.
- Copy is fixed by spec §6 with two amendments made here: `subscriptions.partialLoadError` is added (a secondary query failed while subscriptions loaded) and `subscriptions.title` is dropped (the layout already renders the route name as the page title). Task 10 writes both back into the spec.
- Ordergroove: base `https://restapi.ordergroove.com`; lists return `{ count, next, previous, results }` with `next` an absolute URL or `null`; per-request timeout 5 s; status codes and card-type codes are the tables in spec §4.3.
- Host flags may arrive as strings: `customManager` is on for `true` and `"true"` (any case), off for everything else — the same rule the Braintree flag already follows.
- Every planned test must be seen **failing** before its implementation step (the plan's "verify it fails" steps are the negative control — do not skip them).

## Before you start

1. `git status`. Other sessions leave uncommitted work in this tree (a storage refactor across `src/hooks/useStorageState.ts`, `src/utils/b3Storage.ts`, `src/pages/Favorites/storage.ts` and others on 2026-09-17). Never `git add` a path you did not change; never `git add -A`.
2. Baseline: `yarn vitest run 2>&1 | grep -E "^ (×|❯) src/" | sort -u > /tmp/baseline-failing.txt` once. The dev branch has a known red baseline of ~20 files that time out under the suite's own load; only *new* failing files are yours, and every one must pass when run alone.
3. Sandbox fixture for Tasks 0 and 11: customer **80591** (credentials in `apps/storefront/.env` as `VITE_TEST_ACCOUNT_EMAIL` / `VITE_TEST_ACCOUNT_PASSWORD` — never print them). 14 active subscriptions across 2 products, 4 cancelled, order history present. The Ordergroove "Your Merchant ID" is needed as the environment variable `OG_PUBLIC_ID` for the probe and the live check; get it from the project owner and never commit it.
4. The middleware `ordergroove-auth` endpoint is still unauthenticated (Phase 0 pending), so the probe mints a header with `{ customerId, storeHash }` alone. Once Phase 0 lands, mint with a Current Customer JWT from a logged-in Playwright session instead (Task 11 already does).

## File structure

| File | Responsibility |
|---|---|
| `src/index.d.ts` | `customManager?: boolean \| string` on `BC_CONTEXT.subscriptions` |
| `src/utils/hostFlag.ts` | `isHostFlagEnabled()` — the string-tolerant flag rule, lifted from `PaymentMethods/index.tsx` now that it has a second consumer |
| `src/shared/service/ordergroove/config.ts` | `isCustomManagerAvailable()` |
| `src/shared/service/ordergroove/types.ts` | `OgOrder`, `OgItem`, `OgAddress`, `OgPage` (moved here from `api.ts`) |
| `src/shared/service/ordergroove/api.ts` | `listSubscriptions`, `listPayments`, `listAddresses`, `listUpcomingOrders`, `listOrdersPage`, `orderHistoryUrl` |
| `src/shared/service/ordergroove/index.ts` | barrel: adds the above, the new types, `OrdergrooveError` |
| `tests/ordergrooveBuilders/index.ts` | `buildOgOrderWith`, `buildOgItemWith`, `buildOgAddressWith` |
| `src/lib/lang/locales/en.json` | the `subscriptions.*` strings |
| `src/pages/ManageSubscriptions/viewModel.ts` | pure: subscriptions + lookups → cards; orders → recent orders; brand and status tables |
| `src/pages/ManageSubscriptions/hooks/useSubscriptionsData.ts` | the six queries |
| `src/pages/ManageSubscriptions/components/SubscriptionCard.tsx` | one card; skeleton / value / fallback per cell |
| `src/pages/ManageSubscriptions/components/CancelledSubscriptions.tsx` | collapsed cancelled list |
| `src/pages/ManageSubscriptions/components/RecentOrders.tsx` | history rows, Show more, inline error |
| `src/pages/ManageSubscriptions/SubscriptionsManager.tsx` | the page: alerts, list, sections, escape link |
| `src/pages/ManageSubscriptions/components/HostedManagerFrame.tsx` | today's iframe, moved verbatim |
| `src/pages/ManageSubscriptions/index.tsx` | the switch |

---

### Task 0: Live probe of the order and item endpoints (GET only, throwaway)

**Files:** none in the repo. Script lives in your scratch directory and is not committed.

**Interfaces:**
- Produces: four recorded findings (below) that Tasks 2, 3 and 6 read.

- [ ] **Step 1: Write the probe script** to `<scratch>/og-probe.mjs`

```js
// GET-only probe of Ordergroove for customer 80591. Never writes. Run with OG_PUBLIC_ID set.
const MINT = 'https://test-onlineservices.storesupply.com/products/productclient/ordergroove-auth';
const OG = 'https://restapi.ordergroove.com';
const CUSTOMER = '80591';

const mint = await (
  await fetch(MINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId: CUSTOMER, storeHash: '24erkpw9h6' }),
  })
).json();
const [sigField, ts, sig] = mint.cookieValue.split('|');
const auth = JSON.stringify({ public_id: process.env.OG_PUBLIC_ID, sig_field: sigField, ts: Number(ts), sig });

const get = async (path) => {
  const response = await fetch(`${OG}${path}`, { headers: { Authorization: auth } });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const redact = (value) =>
  JSON.stringify(value).replace(/[0-9a-f]{64}/g, '<tok64>').replace(/[0-9a-f]{32}/g, '<id32>');
const today = new Date().toISOString().slice(0, 10);

const subs = await get('/subscriptions/');
const upcoming = await get('/orders/?status=1');
const items = await get('/items/?status=1');
const history = await get(`/orders/?place_end=${today}`);
const ordered = await get(`/orders/?place_end=${today}&ordering=-place`);

const results = (r) => r.body?.results ?? [];
console.log('A items?status=1 ->', items.status, 'count', items.body?.count, 'keys', Object.keys(results(items)[0] ?? {}).join(','));
console.log('  sample', redact(results(items)[0] ?? null).slice(0, 400));
const activeIds = new Set(results(subs).filter((s) => s.cancelled === null && s.live).map((s) => s.public_id));
const itemSubs = new Set(results(items).map((i) => i.subscription));
console.log('  active subs (page 1) with an upcoming item:', [...activeIds].filter((id) => itemSubs.has(id)).length, 'of', activeIds.size);
console.log('B orders?status=1 ->', upcoming.status, 'place values', results(upcoming).map((o) => o.place));
console.log('C orders?place_end ->', history.status, 'count', history.body?.count, 'page size', results(history).length, 'next', history.body?.next ? 'yes' : 'null');
console.log('  places as returned:', results(history).map((o) => o.place));
console.log('  with ordering=-place ->', ordered.status, results(ordered).map((o) => o.place));
console.log('  statuses seen:', [...new Set(results(history).map((o) => o.status))]);
console.log('  sample', redact(results(history)[0] ?? null).slice(0, 500));
```

- [ ] **Step 2: Run it**

Run: `OG_PUBLIC_ID=<merchant id> node <scratch>/og-probe.mjs`
Expected: every status `200`; A lists `subscription`, `order`, `product`, `quantity`, `price` among the keys; B places are future dates.

- [ ] **Step 3: Record the findings here** (edit this file; these lines are read by later tasks)

- Finding A — every active subscription on page 1 has an upcoming item: `[ ] yes  [ ] no (N of M)`. Either way no code changes: a subscription without one renders "No upcoming order" (spec §4.2).
- Finding B — `place` format: `[ ] YYYY-MM-DD  [ ] YYYY-MM-DD HH:mm:ss`. If it carries a time, Task 3's `placeDate()` keeps `slice(0, 10)`; if not, Task 3 still keeps it (harmless) — the finding decides only the test fixture format.
- Finding C — `/orders/?place_end` ordering: `[ ] newest first by default  [ ] ordering=-place honoured  [ ] neither`. Task 2's `orderHistoryUrl` appends `&ordering=-place` **only** when the second box is ticked and the first is not. With "neither", spec §4.3's per-page client sort is the whole story and Task 6's test wording "newest first within the loaded pages" stands.
- Finding D — page size: `__` (the tests use ten; informational).

- [ ] **Step 4: Delete nothing, commit nothing.** The script stays in scratch.

---

### Task 1: Host flag, gate, and the lifted flag helper

**Files:**
- Modify: `src/index.d.ts` (inside `subscriptions?: { … }`, after `appClientId`)
- Create: `src/utils/hostFlag.ts`
- Modify: `src/pages/PaymentMethods/index.tsx:43-53` (replace the local `isFlagEnabled` with the shared helper)
- Modify: `src/shared/service/ordergroove/config.ts`, `src/shared/service/ordergroove/index.ts`
- Test: `src/utils/hostFlag.test.ts`, `src/shared/service/ordergroove/config.test.ts`

**Interfaces:**
- Produces: `isHostFlagEnabled(value: boolean | string | undefined): boolean`; `isCustomManagerAvailable(): boolean` (exported from the `@/shared/service/ordergroove` barrel).

- [ ] **Step 1: Write the failing tests**

`src/utils/hostFlag.test.ts`:

```ts
import { isHostFlagEnabled } from './hostFlag';

it.each([
  [true, true],
  ['true', true],
  ['TRUE', true],
  [false, false],
  ['false', false],
  ['', false],
  [undefined, false],
])('isHostFlagEnabled(%j) is %j', (value, expected) => {
  expect(isHostFlagEnabled(value)).toBe(expected);
});
```

Append to `src/shared/service/ordergroove/config.test.ts` (and widen its import to
`import { isCustomManagerAvailable, isSubscriptionsAvailable } from './config';`):

```ts
describe('isCustomManagerAvailable', () => {
  const configure = (customManager?: boolean | string) => {
    window.BC_CONTEXT = {
      subscriptions: {
        merchantId: 'merchant-public-id',
        authEndpoint: 'https://api.example.com/products/productclient/ordergroove-auth',
        appClientId: 'ssw-app-client-id',
        ...(customManager === undefined ? {} : { customManager }),
      },
    };
  };

  it('is off when the flag is absent, false, or the string "false"', () => {
    configure();
    expect(isCustomManagerAvailable()).toBe(false);
    configure(false);
    expect(isCustomManagerAvailable()).toBe(false);
    configure('false');
    expect(isCustomManagerAvailable()).toBe(false);
  });

  it('is on for true and for the string "true" that theme templates emit', () => {
    configure(true);
    expect(isCustomManagerAvailable()).toBe(true);
    configure('true');
    expect(isCustomManagerAvailable()).toBe(true);
  });

  it('is off without the parent subscriptions config, whatever the flag says', () => {
    window.BC_CONTEXT = {};

    expect(isCustomManagerAvailable()).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `yarn vitest run src/utils/hostFlag.test.ts src/shared/service/ordergroove/config.test.ts`
Expected: FAIL — `Failed to resolve import "./hostFlag"` and `isCustomManagerAvailable is not a function`.

- [ ] **Step 3: Implement**

`src/utils/hostFlag.ts`:

```ts
/**
 * Theme templates emit booleans as strings routinely, so a host flag is on for `true` and for
 * "true" in any case. A plain truthiness check is wrong: the string "false" is truthy too and
 * would switch a store on that the theme had explicitly switched off.
 */
export const isHostFlagEnabled = (value: boolean | string | undefined) =>
  value === true || (typeof value === 'string' && value.toLowerCase() === 'true');
```

`src/index.d.ts` — add after `appClientId: string;` inside `subscriptions?: { … }`:

```ts
        /** Phase 2: when true (or "true"), /manage-subscriptions renders the portal page, not the hosted iframe. */
        customManager?: boolean | string;
```

`src/shared/service/ordergroove/config.ts` — full file:

```ts
import { platform } from '@/utils/basicConfig';
import { isHostFlagEnabled } from '@/utils/hostFlag';

export const getSubscriptionsConfig = () => window.BC_CONTEXT?.subscriptions;

export const isSubscriptionsAvailable = () =>
  platform === 'bigcommerce' && Boolean(getSubscriptionsConfig());

/** Phase 2: the portal's own /manage-subscriptions page replaces the hosted iframe. */
export const isCustomManagerAvailable = () =>
  isSubscriptionsAvailable() && isHostFlagEnabled(getSubscriptionsConfig()?.customManager);
```

`src/shared/service/ordergroove/index.ts` — the config line becomes:

```ts
export { isCustomManagerAvailable, isSubscriptionsAvailable } from './config';
```

`src/pages/PaymentMethods/index.tsx` — delete the local helper (the two lines starting
`const isFlagEnabled = (value: boolean | string | undefined) =>`) and the three comment lines
above it that begin "Theme templates emit booleans as strings routinely" (they now live in
`hostFlag.ts`); add `import { isHostFlagEnabled } from '@/utils/hostFlag';` to the `@/` import
group (alphabetical: after `@/utils/b3Tip`); change `flaggedVariant` to call `isHostFlagEnabled(…)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn vitest run src/utils/hostFlag.test.ts src/shared/service/ordergroove src/pages/PaymentMethods/index.test.tsx`
Expected: PASS (the Braintree "accepts a string true" tests in `PaymentMethods/index.test.tsx` still pass through the shared helper).

- [ ] **Step 5: Type-check and commit**

Run: `yarn tsc --noEmit` — exit 0.

```bash
git add src/index.d.ts src/utils/hostFlag.ts src/utils/hostFlag.test.ts src/pages/PaymentMethods/index.tsx src/shared/service/ordergroove/config.ts src/shared/service/ordergroove/config.test.ts src/shared/service/ordergroove/index.ts
git commit -m "feat: B2B-0000 Add the custom subscription manager host flag" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Service types, list functions, and builders

**Files:**
- Modify: `src/shared/service/ordergroove/types.ts` (append), `src/shared/service/ordergroove/api.ts`, `src/shared/service/ordergroove/index.ts`
- Modify: `tests/ordergrooveBuilders/index.ts` (append three builders)
- Test: `src/shared/service/ordergroove/api.test.ts` (append)

**Interfaces:**
- Consumes: `listAll<T>(customerId, url)`, `ogFetch<T>(customerId, url)`, `API_BASE` (all already in `api.ts`).
- Produces (all exported from the barrel): types `OgOrder`, `OgItem`, `OgAddress`, `OgPage<T>`; `listSubscriptions(customerId: string): Promise<OgSubscription[]>`; `listPayments(customerId): Promise<OgPayment[]>`; `listAddresses(customerId): Promise<OgAddress[]>`; `listUpcomingOrders(customerId): Promise<{ orders: OgOrder[]; items: OgItem[] }>`; `listOrdersPage(customerId, url: string): Promise<OgPage<OgOrder>>`; `orderHistoryUrl(throughDate: string): string`; class `OrdergrooveError` (already exists in `errors.ts`, now re-exported). Builders `buildOgOrderWith`, `buildOgItemWith`, `buildOgAddressWith` via `tests/test-utils`.

- [ ] **Step 1: Write the failing tests** — append to `src/shared/service/ordergroove/api.test.ts`. Widen its imports: from `tests/test-utils` add `buildOgAddressWith`, `buildOgItemWith`, `buildOgOrderWith`; from `./api` add `listAddresses`, `listOrdersPage`, `listPayments`, `listSubscriptions`, `listUpcomingOrders`, `orderHistoryUrl`.

```ts
it('lists every page of subscriptions, payments and addresses', async () => {
  const customerId = someCustomerId();
  const first = buildOgSubscriptionWith('WHATEVER_VALUES');
  const second = buildOgSubscriptionWith('WHATEVER_VALUES');
  server.use(
    http.get(`${ogBase}/subscriptions/`, ({ request }) =>
      new URL(request.url).searchParams.get('page') === '2'
        ? HttpResponse.json(page([second]))
        : HttpResponse.json(page([first], `${ogBase}/subscriptions/?page=2`)),
    ),
    http.get(`${ogBase}/payments/`, () =>
      HttpResponse.json(page([buildOgPaymentWith('WHATEVER_VALUES')])),
    ),
    http.get(`${ogBase}/addresses/`, () =>
      HttpResponse.json(page([buildOgAddressWith('WHATEVER_VALUES')])),
    ),
  );

  expect(await listSubscriptions(customerId)).toEqual([first, second]);
  expect(await listPayments(customerId)).toHaveLength(1);
  expect(await listAddresses(customerId)).toHaveLength(1);
});

it('lists upcoming orders together with their items, both filtered to status 1', async () => {
  const requested = vi.fn();
  const order = buildOgOrderWith({ status: 1 });
  const item = buildOgItemWith({ order: order.public_id });
  server.use(
    http.get(`${ogBase}/orders/`, ({ request }) => {
      requested(`orders:${new URL(request.url).searchParams.get('status')}`);

      return HttpResponse.json(page([order]));
    }),
    http.get(`${ogBase}/items/`, ({ request }) => {
      requested(`items:${new URL(request.url).searchParams.get('status')}`);

      return HttpResponse.json(page([item]));
    }),
  );

  expect(await listUpcomingOrders(someCustomerId())).toEqual({ orders: [order], items: [item] });
  expect(requested.mock.calls.map(([call]) => call).sort()).toEqual(['items:1', 'orders:1']);
});

it('fetches one page of order history at exactly the URL it is given', async () => {
  const requestedUrl = vi.fn();
  const order = buildOgOrderWith('WHATEVER_VALUES');
  server.use(
    http.get(`${ogBase}/orders/`, ({ request }) => {
      requestedUrl(request.url);

      return HttpResponse.json(page([order], `${ogBase}/orders/?place_end=2026-09-17&page=2`));
    }),
  );

  const result = await listOrdersPage(someCustomerId(), orderHistoryUrl('2026-09-17'));

  expect(requestedUrl).toHaveBeenCalledWith(`${ogBase}/orders/?place_end=2026-09-17`);
  expect(result.results).toEqual([order]);
  expect(result.next).toBe(`${ogBase}/orders/?place_end=2026-09-17&page=2`);
});
```

If Task 0 Finding C ticked "ordering=-place honoured" (and not "newest first by default"), the
expected URL in the last test is `${ogBase}/orders/?place_end=2026-09-17&ordering=-place`.

- [ ] **Step 2: Run them to verify they fail**

Run: `yarn vitest run src/shared/service/ordergroove/api.test.ts`
Expected: FAIL — `buildOgOrderWith`/`listSubscriptions` are not exported (module has no exported member).

- [ ] **Step 3: Implement the types** — append to `src/shared/service/ordergroove/types.ts`:

```ts
/** One page of any Ordergroove list. `next` is an absolute URL or null. */
export interface OgPage<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * One Ordergroove order: a future placement (status 1) or a past attempt. Money fields are
 * decimal strings. Status codes are mapped in `pages/ManageSubscriptions/viewModel.ts`.
 */
export interface OgOrder {
  public_id: string;
  customer: string;
  /** payment public_id */
  payment: string;
  /** address public_id */
  shipping_address: string;
  currency_code: string;
  sub_total: string;
  total: string;
  /** "YYYY-MM-DD" — the day the order is (or was) due for placement */
  place: string;
  status: number;
  /** BigCommerce order id once placed, null before */
  order_merchant_id: string | null;
  rejected_message: string | null;
  tries: number;
  cancelled: string | null;
}

/** One line of an order; `subscription` links it to the subscription that generated it. */
export interface OgItem {
  public_id: string;
  /** order public_id */
  order: string;
  /** subscription public_id; null for one-time upsell items */
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

- [ ] **Step 4: Implement the list functions** in `src/shared/service/ordergroove/api.ts`

Replace the import line `import { OgPayment, OgProduct, OgSubscription } from './types';` with
`import { OgAddress, OgItem, OgOrder, OgPage, OgPayment, OgProduct, OgSubscription } from './types';`
and delete the local `interface OgPage<T> { … }` block (it moved to `types.ts`). Then add, above
`getSubscriptionsUsingToken`:

```ts
export const listSubscriptions = (customerId: string) =>
  listAll<OgSubscription>(customerId, `${API_BASE}/subscriptions/`);

export const listPayments = (customerId: string) =>
  listAll<OgPayment>(customerId, `${API_BASE}/payments/`);

export const listAddresses = (customerId: string) =>
  listAll<OgAddress>(customerId, `${API_BASE}/addresses/`);

/**
 * Future orders (status 1, UNSENT) and their lines. Subscriptions carry no next-order date; the
 * lines are the only link from a subscription to the order that will charge it next.
 */
export const listUpcomingOrders = async (customerId: string) => {
  const [orders, items] = await Promise.all([
    listAll<OgOrder>(customerId, `${API_BASE}/orders/?status=1`),
    listAll<OgItem>(customerId, `${API_BASE}/items/?status=1`),
  ]);

  return { orders, items };
};

/** First-page URL for order history: everything due for placement up to and including the date. */
export const orderHistoryUrl = (throughDate: string) => `${API_BASE}/orders/?place_end=${throughDate}`;

/** One page of orders — the first-page URL above, or the `next` cursor of a previous page. */
export const listOrdersPage = (customerId: string, url: string) =>
  ogFetch<OgPage<OgOrder>>(customerId, url);
```

If Task 0 Finding C says `ordering=-place` is needed, `orderHistoryUrl` returns
`` `${API_BASE}/orders/?place_end=${throughDate}&ordering=-place` `` instead.

Inside `getSubscriptionsUsingToken`, replace the two `listAll<…>(customerId, `${API_BASE}/…/`)`
calls with `listPayments(customerId)` and `listSubscriptions(customerId)` (same behaviour, one
definition of each path).

`src/shared/service/ordergroove/index.ts` — full file:

```ts
export {
  getProduct,
  getSubscriptionsUsingToken,
  listAddresses,
  listOrdersPage,
  listPayments,
  listSubscriptions,
  listUpcomingOrders,
  orderHistoryUrl,
  withTimeout,
} from './api';
export { isCustomManagerAvailable, isSubscriptionsAvailable } from './config';
export { OrdergrooveError } from './errors';
export type {
  OgAddress,
  OgItem,
  OgOrder,
  OgPage,
  OgPayment,
  OgProduct,
  OgSubscription,
} from './types';
```

- [ ] **Step 5: Add the builders** — append to `tests/ordergrooveBuilders/index.ts` (widen the type
import to `OgAddress, OgItem, OgOrder, OgPayment, OgProduct, OgSubscription`):

```ts
export const buildOgOrderWith = builder<OgOrder>(() => ({
  public_id: hex(32),
  customer: customerId(),
  payment: hex(32),
  shipping_address: hex(32),
  currency_code: 'USD',
  sub_total: faker.commerce.price(),
  total: faker.commerce.price(),
  place: faker.date.soon({ days: 60 }).toISOString().slice(0, 10),
  status: 5,
  order_merchant_id: String(faker.number.int({ min: 250000, max: 259999 })),
  rejected_message: null,
  tries: 1,
  cancelled: null,
}));

export const buildOgItemWith = builder<OgItem>(() => ({
  public_id: hex(32),
  order: hex(32),
  subscription: hex(32),
  product: externalProductId(),
  quantity: faker.number.int({ min: 1, max: 10 }),
  price: faker.commerce.price(),
}));

export const buildOgAddressWith = builder<OgAddress>(() => ({
  public_id: hex(32),
  first_name: faker.person.firstName(),
  last_name: faker.person.lastName(),
  company_name: faker.company.name(),
  address: faker.location.streetAddress(),
  address2: null,
  city: faker.location.city(),
  state_province_code: faker.location.state({ abbreviated: true }),
  zip_postal_code: faker.location.zipCode('#####'),
  country_code: 'US',
  live: true,
}));
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn vitest run src/shared/service/ordergroove src/pages/PaymentMethods`
Expected: PASS, including Phase 1's `getSubscriptionsUsingToken` tests (its behaviour is unchanged).

- [ ] **Step 7: Type-check and commit**

Run: `yarn tsc --noEmit` — exit 0.

```bash
git add src/shared/service/ordergroove/types.ts src/shared/service/ordergroove/api.ts src/shared/service/ordergroove/api.test.ts src/shared/service/ordergroove/index.ts tests/ordergrooveBuilders/index.ts
git commit -m "feat: B2B-0000 List Ordergroove orders, items and addresses" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The view model (pure join and mapping tables)

**Files:**
- Create: `src/pages/ManageSubscriptions/viewModel.ts`
- Test: `src/pages/ManageSubscriptions/viewModel.test.ts`

**Interfaces:**
- Consumes: the `Og*` types and `formatOrderId(id: number | string): string` from `@/utils/orderId`.
- Produces: `buildSubscriptionCards(subscriptions: OgSubscription[], lookups: SubscriptionLookups): { active: SubscriptionCard[]; cancelled: SubscriptionCard[] }`; `buildRecentOrders(orders: OgOrder[]): RecentOrder[]`; types `SubscriptionCard`, `SubscriptionLookups`, `RecentOrder`, `OrderOutcome`, `ProductSummary`, `AddressSummary`, `PaymentSummary`. A lookup that is `undefined` (still loading, or failed) yields `null` cells; the *component* decides skeleton vs fallback from the query state.

- [ ] **Step 1: Write the failing tests** — `src/pages/ManageSubscriptions/viewModel.test.ts`

```ts
import {
  buildOgAddressWith,
  buildOgItemWith,
  buildOgOrderWith,
  buildOgPaymentWith,
  buildOgProductWith,
  buildOgSubscriptionWith,
} from 'tests/test-utils';

import { formatOrderId } from '@/utils/orderId';

import { buildRecentOrders, buildSubscriptionCards } from './viewModel';

const nothingLoaded = { products: undefined, addresses: undefined, payments: undefined, upcoming: undefined };

describe('buildSubscriptionCards', () => {
  it('splits active from cancelled and keeps the cancellation date', () => {
    const active = buildOgSubscriptionWith({ cancelled: null, live: true });
    const cancelled = buildOgSubscriptionWith({ cancelled: '2026-08-01T10:00:00Z', live: false });
    const retired = buildOgSubscriptionWith({ cancelled: null, live: false });

    const cards = buildSubscriptionCards([active, cancelled, retired], nothingLoaded);

    expect(cards.active.map((card) => card.publicId)).toEqual([active.public_id]);
    expect(cards.cancelled.map((card) => [card.publicId, card.cancelledOn])).toEqual([
      [cancelled.public_id, '2026-08-01T10:00:00Z'],
      [retired.public_id, null],
    ]);
    expect(cards.active[0].cancelledOn).toBeNull();
  });

  it('leaves every cell null while nothing has loaded', () => {
    const [card] = buildSubscriptionCards([buildOgSubscriptionWith('WHATEVER_VALUES')], nothingLoaded).active;

    expect(card).toMatchObject({ product: null, shippingAddress: null, payment: null, nextOrderDate: null });
  });

  it('summarises the product, address and payment records the subscription points at', () => {
    const product = buildOgProductWith({ name: 'Kraft Paper Shopping Bags', sku: '9537', image_url: 'https://cdn.example.com/bags.png', detail_url: 'https://store.example.com/bags' });
    const address = buildOgAddressWith({ first_name: 'Jane', last_name: 'Doe', company_name: 'Acme Co', address: '1 Main St', address2: 'Suite 4', city: 'Springfield', state_province_code: 'IL', zip_postal_code: '62701' });
    const payment = buildOgPaymentWith({ cc_type: 1, cc_number_ending: '1111', cc_exp_date: '3/2028' });
    const subscription = buildOgSubscriptionWith({ product: '9537_12118', shipping_address: address.public_id, payment: payment.public_id, quantity: 2, frequency_days: 28 });

    const [card] = buildSubscriptionCards([subscription], {
      ...nothingLoaded,
      products: new Map([['9537_12118', product]]),
      addresses: [address],
      payments: [payment],
    }).active;

    expect(card).toMatchObject({
      externalProductId: '9537_12118',
      quantity: 2,
      frequencyDays: 28,
      product: { name: 'Kraft Paper Shopping Bags', sku: '9537', imageUrl: 'https://cdn.example.com/bags.png', detailUrl: 'https://store.example.com/bags' },
      shippingAddress: { name: 'Jane Doe', company: 'Acme Co', line1: '1 Main St', line2: 'Suite 4', locality: 'Springfield, IL 62701' },
      payment: { brand: 'Visa', last4: '1111', expiry: '3/2028' },
    });
  });

  it('maps every documented card type and leaves an unknown code unbranded', () => {
    const brands = [1, 2, 3, 4, 5, 6, 99].map((code) => {
      const payment = buildOgPaymentWith({ cc_type: code });
      const subscription = buildOgSubscriptionWith({ payment: payment.public_id });

      return buildSubscriptionCards([subscription], { ...nothingLoaded, payments: [payment] }).active[0].payment?.brand;
    });

    expect(brands).toEqual(['Visa', 'Mastercard', 'American Express', 'Discover', 'Diners', 'JCB', null]);
  });

  it('yields null summaries when a referenced record is missing from a loaded list', () => {
    const subscription = buildOgSubscriptionWith('WHATEVER_VALUES');

    const [card] = buildSubscriptionCards([subscription], {
      products: new Map([[subscription.product, null]]),
      addresses: [],
      payments: [],
      upcoming: { orders: [], items: [] },
    }).active;

    expect(card).toMatchObject({ product: null, shippingAddress: null, payment: null, nextOrderDate: null });
  });

  it('takes the earliest upcoming order holding one of the subscription items as the next order date', () => {
    const subscription = buildOgSubscriptionWith('WHATEVER_VALUES');
    const later = buildOgOrderWith({ status: 1, place: '2026-11-01' });
    const sooner = buildOgOrderWith({ status: 1, place: '2026-10-03' });
    const items = [
      buildOgItemWith({ order: later.public_id, subscription: subscription.public_id }),
      buildOgItemWith({ order: sooner.public_id, subscription: subscription.public_id }),
      buildOgItemWith({ order: sooner.public_id, subscription: null }),
    ];

    const [card] = buildSubscriptionCards([subscription], { ...nothingLoaded, upcoming: { orders: [later, sooner], items } }).active;

    expect(card.nextOrderDate).toBe('2026-10-03');
  });

  it('orders active cards by next order date, unscheduled last, then by product name', () => {
    const products = new Map([
      ['a_1', buildOgProductWith({ name: 'Bags' })],
      ['b_1', buildOgProductWith({ name: 'Tissue' })],
      ['c_1', buildOgProductWith({ name: 'Labels' })],
    ]);
    const bags = buildOgSubscriptionWith({ product: 'a_1' });
    const tissue = buildOgSubscriptionWith({ product: 'b_1' });
    const labels = buildOgSubscriptionWith({ product: 'c_1' });
    const order = buildOgOrderWith({ status: 1, place: '2026-10-03' });
    const items = [buildOgItemWith({ order: order.public_id, subscription: tissue.public_id })];

    const { active } = buildSubscriptionCards([labels, bags, tissue], { ...nothingLoaded, products, upcoming: { orders: [order], items } });

    expect(active.map((card) => card.product?.name)).toEqual(['Tissue', 'Bags', 'Labels']);
  });

  it('orders cancelled cards newest cancellation first', () => {
    const older = buildOgSubscriptionWith({ cancelled: '2026-01-01T00:00:00Z', live: false });
    const newer = buildOgSubscriptionWith({ cancelled: '2026-06-01T00:00:00Z', live: false });

    const { cancelled } = buildSubscriptionCards([older, newer], nothingLoaded);

    expect(cancelled.map((card) => card.publicId)).toEqual([newer.public_id, older.public_id]);
  });
});

describe('buildRecentOrders', () => {
  it('maps every status code to an outcome and drops merged orders', () => {
    const outcomes = [5, 3, 12, 13, 14, 15, 18, 19, 20, 4, 1, 6, 9, 10, 11, 17, 42].map((status) => {
      const [order] = buildRecentOrders([buildOgOrderWith({ status })]);

      return order?.outcome ?? 'dropped';
    });

    expect(outcomes).toEqual([
      'success',
      'failed', 'failed', 'failed', 'failed', 'failed', 'failed', 'failed', 'failed',
      'cancelled',
      'processing', 'processing', 'processing', 'processing', 'processing',
      'dropped',
      'processing',
    ]);
  });

  it('links a placed order to the portal order detail by its web order number', () => {
    const merchantOrderId = '253011';
    const [order] = buildRecentOrders([
      buildOgOrderWith({ status: 5, order_merchant_id: merchantOrderId, total: '81.50', currency_code: 'USD', place: '2026-09-05' }),
    ]);

    expect(order).toMatchObject({
      placedOn: '2026-09-05',
      webOrderNumber: formatOrderId(merchantOrderId),
      orderDetailPath: `/orderDetail/${merchantOrderId}`,
      total: '81.50',
      currencyCode: 'USD',
      outcome: 'success',
      message: null,
    });
  });

  it('carries the rejection message only for failed orders and no link without a BigCommerce order', () => {
    const [failed, placed] = buildRecentOrders([
      buildOgOrderWith({ status: 3, order_merchant_id: null, rejected_message: 'Card declined', place: '2026-09-06' }),
      buildOgOrderWith({ status: 5, rejected_message: 'stale note', place: '2026-09-01' }),
    ]);

    expect(failed).toMatchObject({ webOrderNumber: null, orderDetailPath: null, message: 'Card declined' });
    expect(placed.message).toBeNull();
  });

  it('sorts newest first', () => {
    const orders = buildRecentOrders([
      buildOgOrderWith({ place: '2026-07-01' }),
      buildOgOrderWith({ place: '2026-09-01' }),
      buildOgOrderWith({ place: '2026-08-01' }),
    ]);

    expect(orders.map((order) => order.placedOn)).toEqual(['2026-09-01', '2026-08-01', '2026-07-01']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn vitest run src/pages/ManageSubscriptions/viewModel.test.ts`
Expected: FAIL — `Failed to resolve import "./viewModel"`.

- [ ] **Step 3: Implement** — `src/pages/ManageSubscriptions/viewModel.ts`

```ts
import {
  OgAddress,
  OgItem,
  OgOrder,
  OgPayment,
  OgProduct,
  OgSubscription,
} from '@/shared/service/ordergroove';
import { formatOrderId } from '@/utils/orderId';

export interface ProductSummary {
  name: string;
  imageUrl: string | null;
  detailUrl: string | null;
  sku: string | null;
}

export interface AddressSummary {
  name: string;
  company: string | null;
  line1: string;
  line2: string | null;
  /** "City, ST 12345" */
  locality: string;
}

export interface PaymentSummary {
  /** null for a card type Ordergroove's table does not name */
  brand: string | null;
  last4: string;
  /** "M/YYYY" as Ordergroove sends it */
  expiry: string;
}

export interface SubscriptionCard {
  publicId: string;
  externalProductId: string;
  product: ProductSummary | null;
  quantity: number;
  frequencyDays: number;
  /** "YYYY-MM-DD" of the earliest upcoming order holding one of its items */
  nextOrderDate: string | null;
  shippingAddress: AddressSummary | null;
  payment: PaymentSummary | null;
  /** ISO timestamp when cancelled; null for active cards and for retired ones with no date */
  cancelledOn: string | null;
}

/** Each lookup is `undefined` until its query settles; a failed lookup stays `undefined`. */
export interface SubscriptionLookups {
  products: Map<string, OgProduct | null> | undefined;
  addresses: OgAddress[] | undefined;
  payments: OgPayment[] | undefined;
  upcoming: { orders: OgOrder[]; items: OgItem[] } | undefined;
}

export type OrderOutcome = 'success' | 'failed' | 'cancelled' | 'processing';

export interface RecentOrder {
  publicId: string;
  /** "YYYY-MM-DD" */
  placedOn: string;
  webOrderNumber: string | null;
  orderDetailPath: string | null;
  total: string;
  currencyCode: string;
  outcome: OrderOutcome;
  /** the merchant's rejection message, failed orders only */
  message: string | null;
}

// Ordergroove reference "Credit Card Types".
const CARD_BRANDS: Record<number, string> = {
  1: 'Visa',
  2: 'Mastercard',
  3: 'American Express',
  4: 'Discover',
  5: 'Diners',
  6: 'JCB',
};

// Ordergroove reference "Order Status Codes" (spec §4.3).
const SUCCESS_STATUS = 5;
const CANCELLED_STATUS = 4;
const MERGED_STATUS = 17;
const FAILED_STATUSES = new Set([3, 12, 13, 14, 15, 18, 19, 20]);

const isActive = (subscription: OgSubscription) =>
  subscription.cancelled === null && subscription.live;

// Finding B (Task 0): tolerate a trailing time; only the day matters here.
const placeDate = (place: string) => place.slice(0, 10);

const summarizeProduct = (product: OgProduct): ProductSummary => ({
  name: product.name,
  imageUrl: product.image_url || null,
  detailUrl: product.detail_url || null,
  sku: product.sku || null,
});

const summarizeAddress = (address: OgAddress): AddressSummary => ({
  name: `${address.first_name} ${address.last_name}`.trim(),
  company: address.company_name || null,
  line1: address.address,
  line2: address.address2 || null,
  locality: `${address.city}, ${address.state_province_code} ${address.zip_postal_code}`.trim(),
});

const summarizePayment = (payment: OgPayment): PaymentSummary => ({
  brand: CARD_BRANDS[payment.cc_type] ?? null,
  last4: payment.cc_number_ending,
  expiry: payment.cc_exp_date,
});

// subscription public_id → earliest place date among the upcoming orders holding its items.
const nextOrderDates = (upcoming: SubscriptionLookups['upcoming']) => {
  const dates = new Map<string, string>();
  if (!upcoming) {
    return dates;
  }
  const placeByOrder = new Map(upcoming.orders.map((order) => [order.public_id, placeDate(order.place)]));
  upcoming.items.forEach((item) => {
    const place = item.subscription ? placeByOrder.get(item.order) : undefined;
    if (!item.subscription || !place) {
      return;
    }
    const current = dates.get(item.subscription);
    // ISO dates compare correctly as strings.
    if (!current || place < current) {
      dates.set(item.subscription, place);
    }
  });

  return dates;
};

const byNextOrderThenName = (a: SubscriptionCard, b: SubscriptionCard) => {
  if (a.nextOrderDate !== b.nextOrderDate) {
    if (a.nextOrderDate === null) {
      return 1;
    }
    if (b.nextOrderDate === null) {
      return -1;
    }

    return a.nextOrderDate.localeCompare(b.nextOrderDate);
  }

  return (a.product?.name ?? '').localeCompare(b.product?.name ?? '');
};

const byCancelledNewestFirst = (a: SubscriptionCard, b: SubscriptionCard) =>
  (b.cancelledOn ?? '').localeCompare(a.cancelledOn ?? '');

export const buildSubscriptionCards = (
  subscriptions: OgSubscription[],
  lookups: SubscriptionLookups,
): { active: SubscriptionCard[]; cancelled: SubscriptionCard[] } => {
  const addressById = new Map((lookups.addresses ?? []).map((address) => [address.public_id, address]));
  const paymentById = new Map((lookups.payments ?? []).map((payment) => [payment.public_id, payment]));
  const nextDates = nextOrderDates(lookups.upcoming);

  const toCard = (subscription: OgSubscription): SubscriptionCard => {
    const product = lookups.products?.get(subscription.product) ?? null;
    const address = addressById.get(subscription.shipping_address);
    const payment = paymentById.get(subscription.payment);

    return {
      publicId: subscription.public_id,
      externalProductId: subscription.product,
      product: product ? summarizeProduct(product) : null,
      quantity: subscription.quantity,
      frequencyDays: subscription.frequency_days,
      nextOrderDate: nextDates.get(subscription.public_id) ?? null,
      shippingAddress: address ? summarizeAddress(address) : null,
      payment: payment ? summarizePayment(payment) : null,
      cancelledOn: subscription.cancelled,
    };
  };

  return {
    active: subscriptions.filter(isActive).map(toCard).sort(byNextOrderThenName),
    cancelled: subscriptions
      .filter((subscription) => !isActive(subscription))
      .map(toCard)
      .sort(byCancelledNewestFirst),
  };
};

const outcomeOf = (status: number): OrderOutcome => {
  if (status === SUCCESS_STATUS) {
    return 'success';
  }
  if (status === CANCELLED_STATUS) {
    return 'cancelled';
  }
  if (FAILED_STATUSES.has(status)) {
    return 'failed';
  }

  return 'processing';
};

export const buildRecentOrders = (orders: OgOrder[]): RecentOrder[] =>
  orders
    .filter((order) => order.status !== MERGED_STATUS)
    .map((order) => {
      const outcome = outcomeOf(order.status);

      return {
        publicId: order.public_id,
        placedOn: placeDate(order.place),
        webOrderNumber: order.order_merchant_id ? formatOrderId(order.order_merchant_id) : null,
        orderDetailPath: order.order_merchant_id ? `/orderDetail/${order.order_merchant_id}` : null,
        total: order.total,
        currencyCode: order.currency_code,
        outcome,
        message: outcome === 'failed' ? order.rejected_message || null : null,
      };
    })
    .sort((a, b) => b.placedOn.localeCompare(a.placedOn));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn vitest run src/pages/ManageSubscriptions/viewModel.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/ManageSubscriptions/viewModel.ts src/pages/ManageSubscriptions/viewModel.test.ts
git commit -m "feat: B2B-0000 Build subscription cards and recent orders from Ordergroove records" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The data hook

**Files:**
- Create: `src/pages/ManageSubscriptions/hooks/useSubscriptionsData.ts`
- Test: `src/pages/ManageSubscriptions/hooks/useSubscriptionsData.test.tsx`

**Interfaces:**
- Consumes: Task 2's list functions, `getProduct`, `orderHistoryUrl`.
- Produces: `useSubscriptionsData(customerId: number)` returning `{ subscriptions, payments, addresses, upcoming, products, orderHistory }` — the first five are `UseQueryResult`s (`products.data` is `Map<string, OgProduct | null>`), `orderHistory` is a `UseInfiniteQueryResult` whose pages are `OgPage<OgOrder>`.

- [ ] **Step 1: Write the failing tests** — `src/pages/ManageSubscriptions/hooks/useSubscriptionsData.test.tsx`

```tsx
import { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  buildOgAddressWith,
  buildOgItemWith,
  buildOgOrderWith,
  buildOgPaymentWith,
  buildOgProductWith,
  buildOgSubscriptionWith,
  faker,
  http,
  HttpResponse,
  renderHook,
  startMockServer,
  waitFor,
} from 'tests/test-utils';

import { useSubscriptionsData } from './useSubscriptionsData';

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const page = <T,>(results: T[], next: string | null = null) => ({
  count: results.length,
  next,
  previous: null,
  results,
});

function Wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}
const wrapper = Wrapper;

// A distinct customer per test keeps the module-level auth cache from leaking between tests.
const someCustomerId = () => faker.number.int({ min: 1, max: 1_000_000 });

beforeEach(() => {
  window.BC_CONTEXT = {
    subscriptions: { merchantId: 'merchant-public-id', authEndpoint, appClientId: 'ssw-app-client-id' },
  };
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')),
    http.post(authEndpoint, () =>
      HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 }),
    ),
    http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([buildOgPaymentWith('WHATEVER_VALUES')]))),
    http.get(`${ogBase}/addresses/`, () => HttpResponse.json(page([buildOgAddressWith('WHATEVER_VALUES')]))),
    http.get(`${ogBase}/items/`, () => HttpResponse.json(page([buildOgItemWith('WHATEVER_VALUES')]))),
    http.get(`${ogBase}/orders/`, () => HttpResponse.json(page([buildOgOrderWith('WHATEVER_VALUES')]))),
  );
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('loads every resource and looks each distinct product up once', async () => {
  const productRequests = vi.fn();
  server.use(
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json(
        page([
          buildOgSubscriptionWith({ product: '9537_12118' }),
          buildOgSubscriptionWith({ product: '9537_12118' }),
          buildOgSubscriptionWith({ product: '7674_9534' }),
        ]),
      ),
    ),
    http.get(`${ogBase}/products/:id/`, ({ params }) => {
      productRequests(params.id);

      return HttpResponse.json(buildOgProductWith({ name: `Product ${params.id}` }));
    }),
  );

  const { result } = renderHook(() => useSubscriptionsData(someCustomerId()), { wrapper });

  await waitFor(() => expect(result.current.products.isSuccess).toBe(true));
  expect(result.current.subscriptions.data).toHaveLength(3);
  expect(result.current.payments.data).toHaveLength(1);
  expect(result.current.addresses.data).toHaveLength(1);
  expect(result.current.upcoming.data?.orders).toHaveLength(1);
  expect(result.current.upcoming.data?.items).toHaveLength(1);
  expect([...(result.current.products.data?.keys() ?? [])].sort()).toEqual(['7674_9534', '9537_12118']);
  expect(result.current.products.data?.get('9537_12118')?.name).toBe('Product 9537_12118');
  expect(productRequests).toHaveBeenCalledTimes(2);
});

it('keeps a failed product lookup as null instead of failing the query', async () => {
  server.use(
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json(page([buildOgSubscriptionWith({ product: '1_2' })])),
    ),
    http.get(`${ogBase}/products/1_2/`, () => new HttpResponse(null, { status: 500 })),
  );

  const { result } = renderHook(() => useSubscriptionsData(someCustomerId()), { wrapper });

  await waitFor(() => expect(result.current.products.isSuccess).toBe(true));
  expect(result.current.products.data?.get('1_2')).toBeNull();
});

it('starts order history at today and pages through next', async () => {
  const requestedUrls: string[] = [];
  const today = dayjs().format('YYYY-MM-DD');
  const first = buildOgOrderWith({ place: '2026-09-05' });
  const second = buildOgOrderWith({ place: '2026-08-08' });
  server.use(
    http.get(`${ogBase}/subscriptions/`, () => HttpResponse.json(page([]))),
    http.get(`${ogBase}/orders/`, ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get('status') === '1') {
        return HttpResponse.json(page([]));
      }
      requestedUrls.push(request.url);

      return url.searchParams.get('page') === '2'
        ? HttpResponse.json(page([second]))
        : HttpResponse.json(page([first], `${ogBase}/orders/?place_end=${today}&page=2`));
    }),
  );

  const { result } = renderHook(() => useSubscriptionsData(someCustomerId()), { wrapper });

  await waitFor(() => expect(result.current.orderHistory.isSuccess).toBe(true));
  expect(requestedUrls[0]).toContain(`place_end=${today}`);
  expect(result.current.orderHistory.hasNextPage).toBe(true);

  result.current.orderHistory.fetchNextPage();

  await waitFor(() => expect(result.current.orderHistory.data?.pages).toHaveLength(2));
  expect(result.current.orderHistory.data?.pages.flatMap((p) => p.results)).toEqual([first, second]);
  expect(result.current.orderHistory.hasNextPage).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn vitest run src/pages/ManageSubscriptions/hooks`
Expected: FAIL — `Failed to resolve import "./useSubscriptionsData"`.

- [ ] **Step 3: Implement** — `src/pages/ManageSubscriptions/hooks/useSubscriptionsData.ts`

```ts
import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import {
  getProduct,
  listAddresses,
  listOrdersPage,
  listPayments,
  listSubscriptions,
  listUpcomingOrders,
  OgProduct,
  orderHistoryUrl,
} from '@/shared/service/ordergroove';

// Product names are best-effort (spec §4.2): a failed lookup is a null entry, never an error.
const lookupProducts = async (customerId: string, productIds: string[]) =>
  new Map<string, OgProduct | null>(
    await Promise.all(
      productIds.map(
        async (productId): Promise<[string, OgProduct | null]> => [
          productId,
          await getProduct(customerId, productId).catch(() => null),
        ],
      ),
    ),
  );

/**
 * One query per Ordergroove resource so cards render while the slower lookups fill in, and so
 * Phase 3 mutations can invalidate just the resource they changed. All `retry: false`: the page
 * owns its Try again.
 */
export const useSubscriptionsData = (customerId: number) => {
  const id = String(customerId);
  const key = (resource: string) => ['ordergroove', customerId, resource];

  const subscriptions = useQuery({
    queryKey: key('subscriptions'),
    queryFn: () => listSubscriptions(id),
    retry: false,
  });
  const payments = useQuery({
    queryKey: key('payments'),
    queryFn: () => listPayments(id),
    retry: false,
  });
  const addresses = useQuery({
    queryKey: key('addresses'),
    queryFn: () => listAddresses(id),
    retry: false,
  });
  const upcoming = useQuery({
    queryKey: key('upcoming'),
    queryFn: () => listUpcomingOrders(id),
    retry: false,
  });

  const productIds = [...new Set((subscriptions.data ?? []).map((s) => s.product))].sort();
  const products = useQuery({
    queryKey: [...key('products'), productIds],
    queryFn: () => lookupProducts(id, productIds),
    enabled: productIds.length > 0,
    retry: false,
  });

  // Fixed once per mount so re-renders never move the "through today" boundary mid-pagination.
  const [firstPageUrl] = useState(() => orderHistoryUrl(dayjs().format('YYYY-MM-DD')));
  const orderHistory = useInfiniteQuery({
    queryKey: key('orderHistory'),
    queryFn: ({ pageParam }) => listOrdersPage(id, pageParam),
    initialPageParam: firstPageUrl,
    getNextPageParam: (last) => last.next ?? undefined,
    retry: false,
  });

  return { subscriptions, payments, addresses, upcoming, products, orderHistory };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn vitest run src/pages/ManageSubscriptions/hooks`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint, type-check, commit**

Run: `yarn eslint --fix src/pages/ManageSubscriptions/hooks && yarn tsc --noEmit` — import order is auto-fixed; both exit 0.

```bash
git add src/pages/ManageSubscriptions/hooks/useSubscriptionsData.ts src/pages/ManageSubscriptions/hooks/useSubscriptionsData.test.tsx
git commit -m "feat: B2B-0000 Load the subscriptions page data with one query per Ordergroove resource" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The subscription card

**Files:**
- Modify: `src/lib/lang/locales/en.json` (add the `subscriptions.card.*` keys after the last `paymentMethods.*` key)
- Create: `src/pages/ManageSubscriptions/components/SubscriptionCard.tsx`
- Test: `src/pages/ManageSubscriptions/components/SubscriptionCard.test.tsx`

**Interfaces:**
- Consumes: `SubscriptionCard` model from Task 3; `displayFormat(date: string, isDateStr: true)` from `@/utils/b3DateFormat`; `useMobile()` from `@/hooks/useMobile`.
- Produces: default export `SubscriptionCard({ card, variant: 'active' | 'cancelled', loading: CellLoading })`; `export interface CellLoading { product: boolean; shipping: boolean; payment: boolean; nextOrder: boolean }` — true while the query behind a cell is still pending, false once it settled (even by failing; the card then shows the fallback).

- [ ] **Step 1: Add the copy** — in `en.json`, after `"paymentMethods.deleteDialog.subscriptions.checkFailed": …,`:

```json
  "subscriptions.card.quantity": "Qty {count}",
  "subscriptions.card.everyWeeks": "every {count, plural, one {week} other {# weeks}}",
  "subscriptions.card.everyDays": "every {count, plural, one {day} other {# days}}",
  "subscriptions.card.nextOrder": "Next order {date}",
  "subscriptions.card.noUpcomingOrder": "No upcoming order",
  "subscriptions.card.shipsTo": "Ships to",
  "subscriptions.card.paidWith": "Paid with",
  "subscriptions.card.payment": "{brand} ending in {last4} · exp {expiry}",
  "subscriptions.card.paymentUnbranded": "Card ending in {last4} · exp {expiry}",
  "subscriptions.card.unnamedProduct": "Product {id}",
  "subscriptions.card.viewProduct": "View product",
  "subscriptions.card.sku": "SKU {sku}",
  "subscriptions.card.unavailable": "Unavailable",
  "subscriptions.card.cancelledOn": "Cancelled on {date}",
  "subscriptions.card.cancelled": "Cancelled",
```

- [ ] **Step 2: Write the failing tests** — `src/pages/ManageSubscriptions/components/SubscriptionCard.test.tsx`

```tsx
import { builder, faker, renderWithProviders, screen, within } from 'tests/test-utils';

import { displayFormat } from '@/utils/b3DateFormat';

import { SubscriptionCard as SubscriptionCardModel } from '../viewModel';

import SubscriptionCard from './SubscriptionCard';

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  externalProductId: '9537_12118',
  product: {
    name: faker.commerce.productName(),
    imageUrl: faker.image.url(),
    detailUrl: faker.internet.url(),
    sku: faker.string.numeric(4),
  },
  quantity: faker.number.int({ min: 1, max: 9 }),
  frequencyDays: 28,
  nextOrderDate: '2026-10-03',
  shippingAddress: {
    name: 'Jane Doe',
    company: 'Acme Co',
    line1: '1 Main St',
    line2: null,
    locality: 'Springfield, IL 62701',
  },
  payment: { brand: 'Visa', last4: '1111', expiry: '3/2028' },
  cancelledOn: null,
}));

const settled = { product: false, shipping: false, payment: false, nextOrder: false };
const pending = { product: true, shipping: true, payment: true, nextOrder: true };
const date = (value: string) => String(displayFormat(value, true));

it('renders every field of a loaded active card', () => {
  const card = buildCardWith({
    product: { name: 'Kraft Paper Shopping Bags', imageUrl: 'https://cdn.example.com/bags.png', detailUrl: 'https://store.example.com/bags', sku: '9537' },
    quantity: 2,
    frequencyDays: 28,
  });

  renderWithProviders(<SubscriptionCard card={card} variant="active" loading={settled} />);

  expect(screen.getByText('Kraft Paper Shopping Bags')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Kraft Paper Shopping Bags' })).toHaveAttribute(
    'src',
    'https://cdn.example.com/bags.png',
  );
  expect(screen.getByText(/SKU 9537/)).toBeInTheDocument();
  const productLink = screen.getByRole('link', { name: 'View product' });
  expect(productLink).toHaveAttribute('href', 'https://store.example.com/bags');
  expect(productLink).toHaveAttribute('target', '_top');
  expect(screen.getByText('Qty 2 · every 4 weeks')).toBeInTheDocument();
  expect(screen.getByText('Ships to Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701')).toBeInTheDocument();
  expect(screen.getByText('Paid with Visa ending in 1111 · exp 3/2028')).toBeInTheDocument();
  expect(screen.getByText(`Next order ${date('2026-10-03')}`)).toBeInTheDocument();
  // Desktop: the schedule is its own column, outside the details group (the mobile test checks the inverse).
  expect(
    within(screen.getByRole('group', { name: 'Kraft Paper Shopping Bags' })).queryByText(/Next order/),
  ).not.toBeInTheDocument();
});

it('shows neither values nor fallbacks while the lookups are still loading', () => {
  const card = buildCardWith({ product: null, shippingAddress: null, payment: null, nextOrderDate: null });

  renderWithProviders(<SubscriptionCard card={card} variant="active" loading={pending} />);

  expect(screen.getByText('Ships to')).toBeInTheDocument();
  expect(screen.getByText('Paid with')).toBeInTheDocument();
  expect(screen.queryByText('Product 9537_12118')).not.toBeInTheDocument();
  expect(screen.queryByText(/Unavailable/)).not.toBeInTheDocument();
  expect(screen.queryByText('No upcoming order')).not.toBeInTheDocument();
});

it('falls back cell by cell once the lookups settled without a record', () => {
  const card = buildCardWith({ product: null, shippingAddress: null, payment: null, nextOrderDate: null });

  renderWithProviders(<SubscriptionCard card={card} variant="active" loading={settled} />);

  expect(screen.getByText('Product 9537_12118')).toBeInTheDocument();
  expect(screen.getByText('Ships to Unavailable')).toBeInTheDocument();
  expect(screen.getByText('Paid with Unavailable')).toBeInTheDocument();
  expect(screen.getByText('No upcoming order')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

it('describes an unbranded card and a daily frequency', () => {
  const card = buildCardWith({ payment: { brand: null, last4: '4242', expiry: '12/2027' }, frequencyDays: 10, quantity: 1 });

  renderWithProviders(<SubscriptionCard card={card} variant="active" loading={settled} />);

  expect(screen.getByText('Paid with Card ending in 4242 · exp 12/2027')).toBeInTheDocument();
  expect(screen.getByText('Qty 1 · every 10 days')).toBeInTheDocument();
});

it('shows the cancellation instead of a next order on a cancelled card', () => {
  const dated = buildCardWith({ cancelledOn: '2026-08-01T10:00:00Z', nextOrderDate: null });
  const undated = buildCardWith({ cancelledOn: null, nextOrderDate: null });

  renderWithProviders(
    <>
      <SubscriptionCard card={dated} variant="cancelled" loading={settled} />
      <SubscriptionCard card={undated} variant="cancelled" loading={settled} />
    </>,
  );

  expect(screen.getByText(`Cancelled on ${date('2026-08-01T10:00:00Z')}`)).toBeInTheDocument();
  expect(screen.getByText('Cancelled')).toBeInTheDocument();
  expect(screen.queryByText('No upcoming order')).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `yarn vitest run src/pages/ManageSubscriptions/components/SubscriptionCard.test.tsx`
Expected: FAIL — `Failed to resolve import "./SubscriptionCard"`.

- [ ] **Step 4: Implement** — `src/pages/ManageSubscriptions/components/SubscriptionCard.tsx`

```tsx
import { Box, Card, CardContent, Link, Skeleton, Typography } from '@mui/material';

import { useMobile } from '@/hooks/useMobile';
import { useB3Lang } from '@/lib/lang';
import { displayFormat } from '@/utils/b3DateFormat';

import { SubscriptionCard as SubscriptionCardModel } from '../viewModel';

/** True while the query behind a cell is still pending; false once it settled, even by failing. */
export interface CellLoading {
  product: boolean;
  shipping: boolean;
  payment: boolean;
  nextOrder: boolean;
}

interface SubscriptionCardProps {
  card: SubscriptionCardModel;
  variant: 'active' | 'cancelled';
  loading: CellLoading;
}

const formatDate = (date: string) => String(displayFormat(date, true));

function SubscriptionCard({ card, variant, loading }: SubscriptionCardProps) {
  const b3Lang = useB3Lang();
  const [isMobile] = useMobile();

  // Skeleton while loading, the value once known, the fallback when the lookup found nothing.
  const cell = (isLoading: boolean, value: string | null, fallback: string) => {
    if (isLoading) {
      return <Skeleton width={180} sx={{ display: 'inline-block' }} />;
    }

    return value ?? fallback;
  };

  const frequency =
    card.frequencyDays % 7 === 0
      ? b3Lang('subscriptions.card.everyWeeks', { count: card.frequencyDays / 7 })
      : b3Lang('subscriptions.card.everyDays', { count: card.frequencyDays });

  const shipping =
    card.shippingAddress &&
    [
      card.shippingAddress.name,
      card.shippingAddress.company,
      card.shippingAddress.line1,
      card.shippingAddress.line2,
      card.shippingAddress.locality,
    ]
      .filter(Boolean)
      .join(', ');

  const paymentText = () => {
    if (!card.payment) {
      return null;
    }
    const { brand, last4, expiry } = card.payment;

    return brand
      ? b3Lang('subscriptions.card.payment', { brand, last4, expiry })
      : b3Lang('subscriptions.card.paymentUnbranded', { last4, expiry });
  };

  const schedule = () => {
    if (variant === 'cancelled') {
      return card.cancelledOn
        ? b3Lang('subscriptions.card.cancelledOn', { date: formatDate(card.cancelledOn) })
        : b3Lang('subscriptions.card.cancelled');
    }

    return cell(
      loading.nextOrder,
      card.nextOrderDate &&
        b3Lang('subscriptions.card.nextOrder', { date: formatDate(card.nextOrderDate) }),
      b3Lang('subscriptions.card.noUpcomingOrder'),
    );
  };

  const scheduleNode = (
    <Typography variant="body2" color={variant === 'cancelled' ? 'text.secondary' : 'text.primary'}>
      {schedule()}
    </Typography>
  );

  return (
    <Card>
      <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {card.product?.imageUrl && (
          <Box
            component="img"
            src={card.product.imageUrl}
            alt={card.product.name}
            sx={{ width: 80, height: 80, objectFit: 'contain', flexShrink: 0 }}
          />
        )}
        {/* The group names the card for assistive tech and lets tests tell the phone layout apart. */}
        <Box
          role="group"
          aria-label={
            card.product?.name ??
            b3Lang('subscriptions.card.unnamedProduct', { id: card.externalProductId })
          }
          sx={{ flex: 1, minWidth: '14rem', display: 'flex', flexDirection: 'column', gap: 0.5 }}
        >
          <Typography variant="subtitle1">
            {cell(
              loading.product,
              card.product?.name ?? null,
              b3Lang('subscriptions.card.unnamedProduct', { id: card.externalProductId }),
            )}
          </Typography>
          {isMobile && scheduleNode}
          {card.product?.sku && (
            <Typography variant="body2" color="text.secondary">
              {b3Lang('subscriptions.card.sku', { sku: card.product.sku })}
              {card.product.detailUrl && (
                <>
                  {' · '}
                  {/* A storefront page outside the SPA: open it in the top window, not in the ThemeFrame. */}
                  <Link href={card.product.detailUrl} target="_top">
                    {b3Lang('subscriptions.card.viewProduct')}
                  </Link>
                </>
              )}
            </Typography>
          )}
          <Typography variant="body2">
            {b3Lang('subscriptions.card.quantity', { count: card.quantity })} · {frequency}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('subscriptions.card.shipsTo')}{' '}
            {cell(loading.shipping, shipping, b3Lang('subscriptions.card.unavailable'))}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('subscriptions.card.paidWith')}{' '}
            {cell(loading.payment, paymentText(), b3Lang('subscriptions.card.unavailable'))}
          </Typography>
        </Box>
        {!isMobile && <Box sx={{ minWidth: '11rem', textAlign: 'right' }}>{scheduleNode}</Box>}
      </CardContent>
    </Card>
  );
}

export default SubscriptionCard;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn vitest run src/pages/ManageSubscriptions/components/SubscriptionCard.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Lint, type-check, commit**

Run: `yarn eslint --fix src/pages/ManageSubscriptions/components && yarn tsc --noEmit` — both exit 0.

```bash
git add src/lib/lang/locales/en.json src/pages/ManageSubscriptions/components/SubscriptionCard.tsx src/pages/ManageSubscriptions/components/SubscriptionCard.test.tsx
git commit -m "feat: B2B-0000 Add the subscription card" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The recent orders section

**Files:**
- Modify: `src/lib/lang/locales/en.json` (add the `subscriptions.orders.*` keys and `subscriptions.retry` after the `subscriptions.card.*` block)
- Create: `src/pages/ManageSubscriptions/components/RecentOrders.tsx`
- Test: `src/pages/ManageSubscriptions/components/RecentOrders.test.tsx`

**Interfaces:**
- Consumes: `RecentOrder`, `OrderOutcome` from Task 3; `currencyFormat(price: string | number): string` from `@/utils/b3CurrencyFormat`; `displayFormat` from `@/utils/b3DateFormat`.
- Produces: default export `RecentOrders({ orders: RecentOrder[]; isPending: boolean; isError: boolean; hasNextPage: boolean; isFetchingNextPage: boolean; onShowMore: () => void; onRetry: () => void })`.

- [ ] **Step 1: Add the copy**

```json
  "subscriptions.retry": "Try again",
  "subscriptions.orders.title": "Recent subscription orders",
  "subscriptions.orders.empty": "No subscription orders yet.",
  "subscriptions.orders.loadError": "We couldn't load your orders.",
  "subscriptions.orders.showMore": "Show more",
  "subscriptions.orders.webOrder": "Order {number}",
  "subscriptions.orders.outcome.success": "Placed",
  "subscriptions.orders.outcome.failed": "Failed",
  "subscriptions.orders.outcome.cancelled": "Cancelled",
  "subscriptions.orders.outcome.processing": "Processing",
```

- [ ] **Step 2: Write the failing tests** — `src/pages/ManageSubscriptions/components/RecentOrders.test.tsx`

`createElement` with a merged props object is used instead of JSX prop spreading (a disabled rule
the project does not add violations of).

```tsx
import { ComponentProps, createElement } from 'react';
import { builder, faker, renderWithProviders, screen } from 'tests/test-utils';

import { currencyFormat } from '@/utils/b3CurrencyFormat';
import { displayFormat } from '@/utils/b3DateFormat';

import { RecentOrder } from '../viewModel';

import RecentOrders from './RecentOrders';

const buildRecentOrderWith = builder<RecentOrder>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  placedOn: '2026-09-05',
  webOrderNumber: 'A1B2C',
  orderDetailPath: '/orderDetail/253011',
  total: '81.50',
  currencyCode: 'USD',
  outcome: 'success',
  message: null,
}));

type Props = ComponentProps<typeof RecentOrders>;

const renderOrders = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    orders: [],
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    onShowMore: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };

  return { ...renderWithProviders(createElement(RecentOrders, props)), props };
};

it('lists each order with its date, web order link, total and outcome', () => {
  renderOrders({
    orders: [
      buildRecentOrderWith({ placedOn: '2026-09-05', webOrderNumber: 'A1B2C', orderDetailPath: '/orderDetail/253011', total: '81.50', outcome: 'success' }),
      buildRecentOrderWith({ placedOn: '2026-08-08', webOrderNumber: null, orderDetailPath: null, outcome: 'failed', message: 'Card declined' }),
      buildRecentOrderWith({ outcome: 'cancelled' }),
      buildRecentOrderWith({ outcome: 'processing' }),
    ],
  });

  expect(screen.getByRole('heading', { name: 'Recent subscription orders' })).toBeInTheDocument();
  expect(screen.getByText(String(displayFormat('2026-09-05', true)))).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Order A1B2C' })).toHaveAttribute('href', '/orderDetail/253011');
  expect(screen.getAllByText(currencyFormat('81.50'))).toHaveLength(4);
  expect(screen.getByText('Placed')).toBeInTheDocument();
  expect(screen.getByText('Failed')).toBeInTheDocument();
  expect(screen.getByText('Card declined')).toBeInTheDocument();
  expect(screen.getByText('Cancelled')).toBeInTheDocument();
  expect(screen.getByText('Processing')).toBeInTheDocument();
  // the failed order never placed in BigCommerce, so it has no web order number
  expect(screen.getByText('—')).toBeInTheDocument();
});

it('says so when there are no orders, and stays quiet while loading', () => {
  renderOrders();
  expect(screen.getByText('No subscription orders yet.')).toBeInTheDocument();

  renderOrders({ isPending: true });
  expect(screen.getAllByText('No subscription orders yet.')).toHaveLength(1);
});

it('offers a retry when the history failed to load', async () => {
  const { user, props } = renderOrders({ isError: true });

  expect(screen.getByText("We couldn't load your orders.")).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Try again' }));

  expect(props.onRetry).toHaveBeenCalledTimes(1);
});

it('shows more only while another page exists', async () => {
  const { user, props } = renderOrders({ orders: [buildRecentOrderWith('WHATEVER_VALUES')], hasNextPage: true });

  await user.click(screen.getByRole('button', { name: 'Show more' }));
  expect(props.onShowMore).toHaveBeenCalledTimes(1);

  renderOrders({ orders: [buildRecentOrderWith('WHATEVER_VALUES')], hasNextPage: false });
  expect(screen.getAllByRole('button', { name: 'Show more' })).toHaveLength(1);
});

it('disables show more while the next page is loading', () => {
  renderOrders({ orders: [buildRecentOrderWith('WHATEVER_VALUES')], hasNextPage: true, isFetchingNextPage: true });

  expect(screen.getByRole('button', { name: 'Show more' })).toBeDisabled();
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `yarn vitest run src/pages/ManageSubscriptions/components/RecentOrders.test.tsx`
Expected: FAIL — `Failed to resolve import "./RecentOrders"`.

- [ ] **Step 4: Implement** — `src/pages/ManageSubscriptions/components/RecentOrders.tsx`

```tsx
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Chip, Link, Skeleton, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { currencyFormat } from '@/utils/b3CurrencyFormat';
import { displayFormat } from '@/utils/b3DateFormat';

import { OrderOutcome, RecentOrder } from '../viewModel';

interface RecentOrdersProps {
  orders: RecentOrder[];
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onShowMore: () => void;
  onRetry: () => void;
}

const OUTCOME_LABEL: Record<OrderOutcome, string> = {
  success: 'subscriptions.orders.outcome.success',
  failed: 'subscriptions.orders.outcome.failed',
  cancelled: 'subscriptions.orders.outcome.cancelled',
  processing: 'subscriptions.orders.outcome.processing',
};

const OUTCOME_COLOR: Record<OrderOutcome, 'success' | 'error' | 'default' | 'info'> = {
  success: 'success',
  failed: 'error',
  cancelled: 'default',
  processing: 'info',
};

function RecentOrders({
  orders,
  isPending,
  isError,
  hasNextPage,
  isFetchingNextPage,
  onShowMore,
  onRetry,
}: RecentOrdersProps) {
  const b3Lang = useB3Lang();

  return (
    <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="h6" component="h2">
        {b3Lang('subscriptions.orders.title')}
      </Typography>
      {isError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={onRetry}>
              {b3Lang('subscriptions.retry')}
            </Button>
          }
        >
          {b3Lang('subscriptions.orders.loadError')}
        </Alert>
      )}
      {isPending && [0, 1, 2].map((row) => <Skeleton key={row} height={32} />)}
      {!isPending && !isError && orders.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {b3Lang('subscriptions.orders.empty')}
        </Typography>
      )}
      {orders.map((order) => (
        <Box
          key={order.publicId}
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            alignItems: 'baseline',
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="body2" sx={{ minWidth: '7rem' }}>
            {String(displayFormat(order.placedOn, true))}
          </Typography>
          <Typography variant="body2" sx={{ minWidth: '9rem' }}>
            {order.webOrderNumber && order.orderDetailPath ? (
              // Internal navigation: the router link stays inside the SPA.
              <Link component={RouterLink} to={order.orderDetailPath}>
                {b3Lang('subscriptions.orders.webOrder', { number: order.webOrderNumber })}
              </Link>
            ) : (
              '—'
            )}
          </Typography>
          <Typography variant="body2" sx={{ minWidth: '5rem' }}>
            {currencyFormat(order.total)}
          </Typography>
          <Chip
            size="small"
            label={b3Lang(OUTCOME_LABEL[order.outcome])}
            color={OUTCOME_COLOR[order.outcome]}
          />
          {order.message && (
            <Typography variant="body2" color="text.secondary" sx={{ flexBasis: '100%' }}>
              {order.message}
            </Typography>
          )}
        </Box>
      ))}
      {hasNextPage && (
        <Button
          size="small"
          disabled={isFetchingNextPage}
          onClick={onShowMore}
          sx={{ alignSelf: 'flex-start' }}
        >
          {b3Lang('subscriptions.orders.showMore')}
        </Button>
      )}
    </Box>
  );
}

export default RecentOrders;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn vitest run src/pages/ManageSubscriptions/components/RecentOrders.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Lint, type-check, commit**

Run: `yarn eslint --fix src/pages/ManageSubscriptions/components && yarn tsc --noEmit` — both exit 0.

```bash
git add src/lib/lang/locales/en.json src/pages/ManageSubscriptions/components/RecentOrders.tsx src/pages/ManageSubscriptions/components/RecentOrders.test.tsx
git commit -m "feat: B2B-0000 Add the recent subscription orders section" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The page — alerts, cards, cancelled section, recent orders, escape link

**Files:**
- Modify: `src/lib/lang/locales/en.json` (page keys, after the `subscriptions.orders.*` block)
- Create: `src/pages/ManageSubscriptions/components/CancelledSubscriptions.tsx`
- Create: `src/pages/ManageSubscriptions/SubscriptionsManager.tsx`
- Test: `src/pages/ManageSubscriptions/SubscriptionsManager.test.tsx`

**Interfaces:**
- Consumes: Tasks 3–6; `OrdergrooveError` (barrel); `useAppSelector` from `@/store`; `BigCommerceStorefrontAPIBaseURL` from `@/utils/basicConfig`; `B3Spin` from `@/components/spin/B3Spin`.
- Produces: default export `SubscriptionsManager()` (no props); default export `CancelledSubscriptions({ cards: SubscriptionCard[]; loading: CellLoading })`.

- [ ] **Step 1: Add the copy**

```json
  "subscriptions.hostedManagerLink": "Manage in the subscription manager",
  "subscriptions.empty": "You don't have any active subscriptions.",
  "subscriptions.loadError": "We couldn't load your subscriptions.",
  "subscriptions.partialLoadError": "Some subscription details couldn't be loaded.",
  "subscriptions.sessionExpired": "Your session has expired — please sign in again.",
  "subscriptions.cancelled.toggle": "{count, plural, one {# cancelled subscription} other {# cancelled subscriptions}}",
```

- [ ] **Step 2: Write the failing tests** — `src/pages/ManageSubscriptions/SubscriptionsManager.test.tsx`

```tsx
import {
  buildCompanyStateWith,
  buildOgAddressWith,
  buildOgItemWith,
  buildOgOrderWith,
  buildOgPaymentWith,
  buildOgProductWith,
  buildOgSubscriptionWith,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
  waitFor,
} from 'tests/test-utils';

import {
  OgAddress,
  OgItem,
  OgOrder,
  OgPayment,
  OgProduct,
  OgSubscription,
} from '@/shared/service/ordergroove';
import { currencyFormat } from '@/utils/b3CurrencyFormat';
import { displayFormat } from '@/utils/b3DateFormat';
import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';
import { formatOrderId } from '@/utils/orderId';

import SubscriptionsManager from './SubscriptionsManager';

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const page = <T,>(results: T[], next: string | null = null) => ({
  count: results.length,
  next,
  previous: null,
  results,
});

interface Resources {
  subscriptions?: OgSubscription[];
  subscriptionsPage2?: OgSubscription[];
  payments?: OgPayment[];
  addresses?: OgAddress[];
  upcomingOrders?: OgOrder[];
  items?: OgItem[];
  /** external product id → product; a missing id answers 404 */
  products?: Record<string, OgProduct>;
  history?: OgOrder[];
  historyPage2?: OgOrder[];
}

// Every resource answers; anything not given is an empty page.
const mockResources = ({
  subscriptions = [],
  subscriptionsPage2,
  payments = [],
  addresses = [],
  upcomingOrders = [],
  items = [],
  products = {},
  history = [],
  historyPage2,
}: Resources) =>
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')),
    http.post(authEndpoint, () =>
      HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 }),
    ),
    http.get(`${ogBase}/subscriptions/`, ({ request }) =>
      new URL(request.url).searchParams.get('page') === '2'
        ? HttpResponse.json(page(subscriptionsPage2 ?? []))
        : HttpResponse.json(
            page(subscriptions, subscriptionsPage2 ? `${ogBase}/subscriptions/?page=2` : null),
          ),
    ),
    http.get(`${ogBase}/payments/`, () => HttpResponse.json(page(payments))),
    http.get(`${ogBase}/addresses/`, () => HttpResponse.json(page(addresses))),
    http.get(`${ogBase}/items/`, () => HttpResponse.json(page(items))),
    http.get(`${ogBase}/orders/`, ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get('status') === '1') {
        return HttpResponse.json(page(upcomingOrders));
      }
      if (url.searchParams.get('page') === '2') {
        return HttpResponse.json(page(historyPage2 ?? []));
      }

      return HttpResponse.json(page(history, historyPage2 ? `${ogBase}/orders/?page=2` : null));
    }),
    http.get(`${ogBase}/products/:id/`, ({ params }) => {
      const product = products[String(params.id)];

      return product ? HttpResponse.json(product) : new HttpResponse(null, { status: 404 });
    }),
  );

// A distinct customer per test keeps the module-level auth cache from leaking between tests.
const renderPage = () =>
  renderWithProviders(<SubscriptionsManager />, {
    preloadedState: {
      company: buildCompanyStateWith({
        customer: { id: faker.number.int({ min: 1, max: 1_000_000 }) },
      }),
    },
  });

const date = (value: string) => String(displayFormat(value, true));

beforeEach(() => {
  window.BC_CONTEXT = {
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint,
      appClientId: 'ssw-app-client-id',
      customManager: true,
    },
  };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('lists every active subscription across pages with its product, schedule, address and card', async () => {
  const address = buildOgAddressWith({ first_name: 'Jane', last_name: 'Doe', company_name: 'Acme Co', address: '1 Main St', address2: null, city: 'Springfield', state_province_code: 'IL', zip_postal_code: '62701' });
  const payment = buildOgPaymentWith({ cc_type: 1, cc_number_ending: '1111', cc_exp_date: '3/2028' });
  const bags = buildOgSubscriptionWith({ product: '9537_12118', quantity: 2, frequency_days: 28, shipping_address: address.public_id, payment: payment.public_id });
  const tissue = buildOgSubscriptionWith({ product: '7674_9534', quantity: 1, frequency_days: 14, shipping_address: address.public_id, payment: payment.public_id });
  const order = buildOgOrderWith({ status: 1, place: '2026-10-03' });

  mockResources({
    subscriptions: [bags],
    subscriptionsPage2: [tissue],
    payments: [payment],
    addresses: [address],
    upcomingOrders: [order],
    items: [buildOgItemWith({ order: order.public_id, subscription: bags.public_id })],
    products: {
      '9537_12118': buildOgProductWith({ name: 'Kraft Paper Shopping Bags', sku: '9537' }),
      '7674_9534': buildOgProductWith({ name: 'Tissue Paper', sku: '7674' }),
    },
  });

  renderPage();

  expect(await screen.findByText('Kraft Paper Shopping Bags')).toBeInTheDocument();
  expect(screen.getByText('Tissue Paper')).toBeInTheDocument();
  expect(screen.getByText('Qty 2 · every 4 weeks')).toBeInTheDocument();
  expect(screen.getByText('Qty 1 · every 2 weeks')).toBeInTheDocument();
  expect(await screen.findByText(`Next order ${date('2026-10-03')}`)).toBeInTheDocument();
  expect(screen.getByText('No upcoming order')).toBeInTheDocument();
  expect(screen.getAllByText('Ships to Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701')).toHaveLength(2);
  expect(screen.getAllByText('Paid with Visa ending in 1111 · exp 3/2028')).toHaveLength(2);
  expect(screen.queryByText(/couldn't/)).not.toBeInTheDocument();
});

it('degrades cell by cell when secondary lookups fail and offers a retry', async () => {
  const subscription = buildOgSubscriptionWith({ product: '1_2' });
  mockResources({ subscriptions: [subscription], payments: [buildOgPaymentWith({ public_id: subscription.payment, cc_type: 2, cc_number_ending: '4444', cc_exp_date: '1/2029' })] });
  server.use(http.get(`${ogBase}/addresses/`, () => new HttpResponse(null, { status: 500 })));

  renderPage();

  expect(await screen.findByText('Product 1_2')).toBeInTheDocument();
  expect(await screen.findByText('Ships to Unavailable')).toBeInTheDocument();
  expect(screen.getByText('Paid with Mastercard ending in 4444 · exp 1/2029')).toBeInTheDocument();
  expect(screen.getByText("Some subscription details couldn't be loaded.")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});

it('shows the empty copy and keeps cancelled subscriptions behind a toggle', async () => {
  mockResources({
    subscriptions: [
      buildOgSubscriptionWith({ cancelled: '2026-08-01T10:00:00Z', live: false }),
      buildOgSubscriptionWith({ cancelled: '2026-07-01T10:00:00Z', live: false }),
    ],
  });

  const { user } = renderPage();

  expect(await screen.findByText("You don't have any active subscriptions.")).toBeInTheDocument();
  expect(screen.queryByText(/Cancelled on/)).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '2 cancelled subscriptions' }));

  expect(screen.getByText(`Cancelled on ${date('2026-08-01T10:00:00Z')}`)).toBeInTheDocument();
  expect(screen.getByText(`Cancelled on ${date('2026-07-01T10:00:00Z')}`)).toBeInTheDocument();
});

it('shows the session-expired alert and nothing to retry when Ordergroove rejects the signature', async () => {
  mockResources({});
  server.use(
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json({ detail: 'Authentication Failed' }, { status: 403 }),
    ),
  );

  renderPage();

  expect(await screen.findByText('Your session has expired — please sign in again.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  expect(screen.queryByText("We couldn't load your subscriptions.")).not.toBeInTheDocument();
});

it('recovers from a failed subscriptions request through Try again', async () => {
  const subscription = buildOgSubscriptionWith({ product: '1_2' });
  let attempts = 0;
  mockResources({ products: { '1_2': buildOgProductWith({ name: 'Labels' }) } });
  server.use(
    http.get(`${ogBase}/subscriptions/`, () => {
      attempts += 1;

      return attempts === 1
        ? new HttpResponse(null, { status: 500 })
        : HttpResponse.json(page([subscription]));
    }),
  );

  const { user } = renderPage();

  expect(await screen.findByText("We couldn't load your subscriptions.")).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByText('Labels')).toBeInTheDocument();
  expect(screen.queryByText("We couldn't load your subscriptions.")).not.toBeInTheDocument();
});

it('lists recent orders with web order links and failure messages, and pages with Show more', async () => {
  const merchantOrderId = '253011';
  mockResources({
    history: [
      buildOgOrderWith({ status: 5, order_merchant_id: merchantOrderId, total: '81.50', place: '2026-09-05' }),
      buildOgOrderWith({ status: 3, order_merchant_id: null, rejected_message: 'Card declined', place: '2026-08-08' }),
      buildOgOrderWith({ status: 17, place: '2026-08-01' }),
    ],
    historyPage2: [buildOgOrderWith({ status: 5, order_merchant_id: '253000', place: '2026-07-11' })],
  });

  const { user } = renderPage();

  const placed = await screen.findByRole('link', { name: `Order ${formatOrderId(merchantOrderId)}` });
  expect(placed).toHaveAttribute('href', `/orderDetail/${merchantOrderId}`);
  expect(screen.getByText(currencyFormat('81.50'))).toBeInTheDocument();
  expect(screen.getByText('Card declined')).toBeInTheDocument();
  expect(screen.queryByText(date('2026-08-01'))).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Show more' }));

  expect(await screen.findByRole('link', { name: `Order ${formatOrderId('253000')}` })).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument(),
  );
});

it('links back to the hosted manager in the top window', async () => {
  mockResources({});

  renderPage();

  const link = await screen.findByRole('link', { name: 'Manage in the subscription manager' });
  expect(link).toHaveAttribute('href', `${BigCommerceStorefrontAPIBaseURL}/subscriptions`);
  expect(link).toHaveAttribute('target', '_top');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `yarn vitest run src/pages/ManageSubscriptions/SubscriptionsManager.test.tsx`
Expected: FAIL — `Failed to resolve import "./SubscriptionsManager"`.

- [ ] **Step 4: Implement the cancelled section** — `src/pages/ManageSubscriptions/components/CancelledSubscriptions.tsx`

```tsx
import { useState } from 'react';
import { Box, Button, Collapse } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { SubscriptionCard as SubscriptionCardModel } from '../viewModel';

import SubscriptionCard, { CellLoading } from './SubscriptionCard';

interface CancelledSubscriptionsProps {
  cards: SubscriptionCardModel[];
  loading: CellLoading;
}

function CancelledSubscriptions({ cards, loading }: CancelledSubscriptionsProps) {
  const b3Lang = useB3Lang();
  const [open, setOpen] = useState(false);

  if (cards.length === 0) {
    return null;
  }

  return (
    <Box>
      <Button variant="text" aria-expanded={open} onClick={() => setOpen((value) => !value)} sx={{ px: 0 }}>
        {b3Lang('subscriptions.cancelled.toggle', { count: cards.length })}
      </Button>
      {/* unmountOnExit: collapsed cards leave the DOM rather than hiding at zero height. */}
      <Collapse in={open} unmountOnExit>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {cards.map((card) => (
            <SubscriptionCard key={card.publicId} card={card} variant="cancelled" loading={loading} />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

export default CancelledSubscriptions;
```

- [ ] **Step 5: Implement the page** — `src/pages/ManageSubscriptions/SubscriptionsManager.tsx`

```tsx
import { Alert, Box, Button, Link, Typography } from '@mui/material';

import B3Spin from '@/components/spin/B3Spin';
import { useB3Lang } from '@/lib/lang';
import { OrdergrooveError } from '@/shared/service/ordergroove';
import { useAppSelector } from '@/store';
import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';

import CancelledSubscriptions from './components/CancelledSubscriptions';
import RecentOrders from './components/RecentOrders';
import SubscriptionCard, { CellLoading } from './components/SubscriptionCard';
import { useSubscriptionsData } from './hooks/useSubscriptionsData';
import { buildRecentOrders, buildSubscriptionCards } from './viewModel';

// Until Phase 3, every action still lives on the theme's hosted manager page.
const HOSTED_MANAGER_URL = `${BigCommerceStorefrontAPIBaseURL}/subscriptions`;

const isSessionExpired = (error: unknown) =>
  error instanceof OrdergrooveError && error.kind === 'sessionExpired';

function SubscriptionsManager() {
  const b3Lang = useB3Lang();
  const customerId = useAppSelector(({ company }) => company.customer.id);
  const { subscriptions, payments, addresses, upcoming, products, orderHistory } =
    useSubscriptionsData(customerId);

  const { active, cancelled } = buildSubscriptionCards(subscriptions.data ?? [], {
    products: products.data,
    addresses: addresses.data,
    payments: payments.data,
    upcoming: upcoming.data,
  });
  const loading: CellLoading = {
    product: products.isPending,
    shipping: addresses.isPending,
    payment: payments.isPending,
    nextOrder: upcoming.isPending,
  };

  // Only the subscriptions query blocks the page; the others degrade their cells (spec §5.2).
  const cardQueries = [subscriptions, payments, addresses, upcoming];
  const failed = cardQueries.filter((query) => query.isError);
  const sessionExpired = [...cardQueries, orderHistory].some((query) =>
    isSessionExpired(query.error),
  );
  const retryFailed = () => failed.forEach((query) => query.refetch());

  return (
    <B3Spin isSpinning={subscriptions.isPending}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          {/* target="_top": the portal renders inside the ThemeFrame; a plain anchor would load the theme page inside it. */}
          <Link href={HOSTED_MANAGER_URL} target="_top">
            {b3Lang('subscriptions.hostedManagerLink')}
          </Link>
        </Box>
        {sessionExpired && (
          <Alert severity="warning">{b3Lang('subscriptions.sessionExpired')}</Alert>
        )}
        {!sessionExpired && failed.length > 0 && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={retryFailed}>
                {b3Lang('subscriptions.retry')}
              </Button>
            }
          >
            {subscriptions.isError
              ? b3Lang('subscriptions.loadError')
              : b3Lang('subscriptions.partialLoadError')}
          </Alert>
        )}
        {subscriptions.isSuccess && active.length === 0 && (
          <Typography color="text.secondary">{b3Lang('subscriptions.empty')}</Typography>
        )}
        {active.map((card) => (
          <SubscriptionCard key={card.publicId} card={card} variant="active" loading={loading} />
        ))}
        <CancelledSubscriptions cards={cancelled} loading={loading} />
        <RecentOrders
          orders={buildRecentOrders(orderHistory.data?.pages.flatMap((result) => result.results) ?? [])}
          isPending={orderHistory.isPending}
          isError={orderHistory.isError && !isSessionExpired(orderHistory.error)}
          hasNextPage={Boolean(orderHistory.hasNextPage)}
          isFetchingNextPage={orderHistory.isFetchingNextPage}
          onShowMore={() => orderHistory.fetchNextPage()}
          onRetry={() => orderHistory.refetch()}
        />
      </Box>
    </B3Spin>
  );
}

export default SubscriptionsManager;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn vitest run src/pages/ManageSubscriptions`
Expected: PASS — this file's 7 tests plus every earlier ManageSubscriptions test. If the "degrades cell by cell" test cannot find `Product 1_2`, check that the 404 from `/products/1_2/` is reaching `getProduct` (the hook's `.catch(() => null)` turns it into an unnamed card); if the recent-orders test finds two `Show more` buttons, the second page's `next` is not `null` — fix the fixture, not the component.

- [ ] **Step 7: Lint, type-check, commit**

Run: `yarn eslint --fix src/pages/ManageSubscriptions && yarn tsc --noEmit` — both exit 0.

```bash
git add src/lib/lang/locales/en.json src/pages/ManageSubscriptions/components/CancelledSubscriptions.tsx src/pages/ManageSubscriptions/SubscriptionsManager.tsx src/pages/ManageSubscriptions/SubscriptionsManager.test.tsx
git commit -m "feat: B2B-0000 Add the portal subscriptions page" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The switch and the hosted iframe fallback

**Files:**
- Create: `src/pages/ManageSubscriptions/components/HostedManagerFrame.tsx` (today's `index.tsx` body, moved)
- Modify: `src/pages/ManageSubscriptions/index.tsx` (becomes the switch)
- Test: `src/pages/ManageSubscriptions/index.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `isCustomManagerAvailable()` (Task 1), `SubscriptionsManager` (Task 7), `useAppSelector`.
- Produces: default export `ManageSubscriptions()` — no props; `routesMap` types its entries as `(props: PageProps) => ReactElement`, and a zero-parameter component is assignable to that.

- [ ] **Step 1: Rewrite the tests** — `src/pages/ManageSubscriptions/index.test.tsx` (replace the whole file)

```tsx
import {
  buildB2BFeaturesStateWith,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from 'tests/test-utils';

import ManageSubscriptions from '.';

// The page has its own tests; here only the switch matters.
vi.mock('./SubscriptionsManager', () => ({
  default: () => <div>portal subscriptions page</div>,
}));

const configure = (customManager?: boolean) => {
  window.BC_CONTEXT = {
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint: 'https://api.example.com/products/productclient/ordergroove-auth',
      appClientId: 'ssw-app-client-id',
      ...(customManager === undefined ? {} : { customManager }),
    },
  };
};

afterEach(() => {
  delete window.BC_CONTEXT;
});

describe('without the custom manager flag', () => {
  it('renders the hosted iframe pointing at the storefront subscriptions page', () => {
    configure();

    renderWithProviders(<ManageSubscriptions />);

    const iframe = screen.getByTitle('Manage Subscriptions') as HTMLIFrameElement;
    expect(iframe.src).toContain('/subscriptions?hideLayout=true');
    expect(screen.queryByText('portal subscriptions page')).not.toBeInTheDocument();
  });

  it('shows the spinner until the iframe finishes loading', async () => {
    configure(false);

    renderWithProviders(<ManageSubscriptions />);

    expect(screen.getByText(/Loading/)).toBeInTheDocument();
    fireEvent.load(screen.getByTitle('Manage Subscriptions'));
    await waitFor(() => {
      expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
    });
  });
});

it('renders the portal page when the flag is on', () => {
  configure(true);

  renderWithProviders(<ManageSubscriptions />);

  expect(screen.getByText('portal subscriptions page')).toBeInTheDocument();
  expect(screen.queryByTitle('Manage Subscriptions')).not.toBeInTheDocument();
});

it('keeps the hosted iframe for a masquerading rep even with the flag on', () => {
  configure(true);

  renderWithProviders(<ManageSubscriptions />, {
    preloadedState: {
      b2bFeatures: buildB2BFeaturesStateWith({ masqueradeCompany: { isAgenting: true } }),
    },
  });

  expect(screen.getByTitle('Manage Subscriptions')).toBeInTheDocument();
  expect(screen.queryByText('portal subscriptions page')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn vitest run src/pages/ManageSubscriptions/index.test.tsx`
Expected: FAIL — "renders the portal page when the flag is on" cannot find `portal subscriptions page` (today's component always renders the iframe). The two iframe tests pass already.

- [ ] **Step 3: Move the iframe** — `src/pages/ManageSubscriptions/components/HostedManagerFrame.tsx`

```tsx
import { useState } from 'react';
import { Box } from '@mui/material';

import B3Spin from '@/components/spin/B3Spin';
import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';

const SUBSCRIPTION_MANAGER_URL = `${BigCommerceStorefrontAPIBaseURL}/subscriptions?hideLayout=true`;

/** The pre-Phase-2 page, kept as the fallback while BC_CONTEXT.subscriptions.customManager is off. */
function HostedManagerFrame() {
  const [loading, setLoading] = useState(true);

  const handleIframeLoad = () => {
    setLoading(false);

    // Same-origin only: hide the theme chrome so the manager fills the frame. A cross-origin
    // frame throws here and keeps its chrome, which is acceptable for a fallback.
    try {
      const iframe = document.getElementById('subscriptions-iframe') as HTMLIFrameElement;
      const iframeDoc = iframe?.contentWindow?.document;
      if (iframeDoc) {
        const header = iframeDoc.querySelector('header');
        const footer = iframeDoc.querySelector('footer');

        if (header) (header as HTMLElement).style.display = 'none';
        if (footer) (footer as HTMLElement).style.display = 'none';
      }
    } catch {
      // cross-origin frame: leave it as it is
    }
  };

  return (
    <B3Spin isSpinning={loading}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: '800px',
          position: 'relative',
        }}
      >
        <div id="og-msi" />
        <iframe
          id="subscriptions-iframe"
          src={SUBSCRIPTION_MANAGER_URL}
          style={{ width: '100%', height: '100%', border: 'none', minHeight: '800px' }}
          title="Manage Subscriptions"
          onLoad={handleIframeLoad}
        />
      </Box>
    </B3Spin>
  );
}

export default HostedManagerFrame;
```

- [ ] **Step 4: Write the switch** — `src/pages/ManageSubscriptions/index.tsx` (replace the whole file)

```tsx
import { isCustomManagerAvailable } from '@/shared/service/ordergroove';
import { useAppSelector } from '@/store';

import HostedManagerFrame from './components/HostedManagerFrame';
import SubscriptionsManager from './SubscriptionsManager';

/**
 * Phase 2 switch. The Ordergroove credential is signed for the logged-in customer, so a
 * masquerading rep never gets the portal page; the hosted iframe keeps today's behaviour for
 * them and for stores that have not turned the flag on.
 */
export default function ManageSubscriptions() {
  const isAgenting = useAppSelector(
    ({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting,
  );

  return isCustomManagerAvailable() && !isAgenting ? (
    <SubscriptionsManager />
  ) : (
    <HostedManagerFrame />
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn vitest run src/pages/ManageSubscriptions`
Expected: PASS (all four switch tests plus every earlier file).

- [ ] **Step 6: Lint, type-check, commit**

Run: `yarn eslint --fix src/pages/ManageSubscriptions && yarn eslint --max-warnings 0 src/pages/ManageSubscriptions && yarn tsc --noEmit` — the second command proves the two pre-existing findings on this folder (`_props` unused, `console.warn`) are gone; all exit 0.

```bash
git add src/pages/ManageSubscriptions/index.tsx src/pages/ManageSubscriptions/index.test.tsx src/pages/ManageSubscriptions/components/HostedManagerFrame.tsx
git commit -m "feat: B2B-0000 Switch /manage-subscriptions to the portal page behind the host flag" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The mobile layout test

**Files:**
- Test: `src/pages/ManageSubscriptions/SubscriptionsManager.mobile.test.tsx`

**Interfaces:**
- Consumes: the page (Task 7); `useMobile()` reads `document.body.clientWidth <= 768`, which the repo's mobile tests drive with `vi.spyOn(document.body, 'clientWidth', 'get')`.

- [ ] **Step 1: Write the test**

```tsx
import {
  buildCompanyStateWith,
  buildOgItemWith,
  buildOgOrderWith,
  buildOgProductWith,
  buildOgSubscriptionWith,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
  within,
} from 'tests/test-utils';

import { displayFormat } from '@/utils/b3DateFormat';

import SubscriptionsManager from './SubscriptionsManager';

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

beforeEach(() => {
  // The repo's mobile-test convention: useMobile() treats a body narrower than 769px as a phone.
  vi.spyOn(document.body, 'clientWidth', 'get').mockReturnValue(500);
  window.BC_CONTEXT = {
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint,
      appClientId: 'ssw-app-client-id',
      customManager: true,
    },
  };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('stacks the schedule under the product title on a phone', async () => {
  const subscription = buildOgSubscriptionWith({ product: '9537_12118' });
  const order = buildOgOrderWith({ status: 1, place: '2026-10-03' });
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')),
    http.post(authEndpoint, () =>
      HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 }),
    ),
    http.get(`${ogBase}/subscriptions/`, () => HttpResponse.json(page([subscription]))),
    http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([]))),
    http.get(`${ogBase}/addresses/`, () => HttpResponse.json(page([]))),
    http.get(`${ogBase}/items/`, () =>
      HttpResponse.json(
        page([buildOgItemWith({ order: order.public_id, subscription: subscription.public_id })]),
      ),
    ),
    http.get(`${ogBase}/orders/`, ({ request }) =>
      HttpResponse.json(
        page(new URL(request.url).searchParams.get('status') === '1' ? [order] : []),
      ),
    ),
    http.get(`${ogBase}/products/9537_12118/`, () =>
      HttpResponse.json(buildOgProductWith({ name: 'Kraft Paper Shopping Bags' })),
    ),
  );

  renderWithProviders(<SubscriptionsManager />, {
    preloadedState: {
      company: buildCompanyStateWith({
        customer: { id: faker.number.int({ min: 1, max: 1_000_000 }) },
      }),
    },
  });

  const group = await screen.findByRole('group', { name: 'Kraft Paper Shopping Bags' });

  // On a phone the schedule sits inside the details group, right under the title; the desktop
  // card test asserts the inverse.
  expect(
    await within(group).findByText(`Next order ${String(displayFormat('2026-10-03', true))}`),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it — it must pass, then prove it can fail**

Run: `yarn vitest run src/pages/ManageSubscriptions/SubscriptionsManager.mobile.test.tsx` — PASS.

Negative control: temporarily change `mockReturnValue(500)` to `mockReturnValue(1200)` and re-run — the test must FAIL (the schedule is in the sibling column). Restore `500`, re-run, PASS.

- [ ] **Step 3: Lint and commit**

Run: `yarn eslint --fix src/pages/ManageSubscriptions/SubscriptionsManager.mobile.test.tsx` — exit 0.

```bash
git add src/pages/ManageSubscriptions/SubscriptionsManager.mobile.test.tsx
git commit -m "test: B2B-0000 Cover the subscriptions page phone layout" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Quality gate and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-ordergroove-phase2-subscriptions-page-design.md`
- Modify: `.memory/b2b-buyer-portal--ordergroove-custom-msp-architecture.md`
- Modify: this plan (tick the boxes; record the Task 0 findings if not done)

- [ ] **Step 1: Type-check and lint everything**

Run, from `apps/storefront/`:

```bash
yarn tsc --noEmit
yarn lint:dependencies
yarn lint:eslint
yarn lint:knip
```

Expected: `tsc` exit 0; dependency-cruiser "no dependency violations"; **`lint:eslint` exit 0 for
the first time on this branch** (the only findings on `dev` were the two in
`ManageSubscriptions/index.tsx`, retired by Task 8); knip reports exactly one item, the
pre-existing `BillingStateOption` in `src/pages/PaymentMethods/billingPrefill.ts` — anything else
is yours to fix (an export nothing in `src` consumes, or a file nothing imports).

- [ ] **Step 2: Run the scoped suites, then the full suite against the baseline**

```bash
yarn vitest run src/pages/ManageSubscriptions src/pages/PaymentMethods src/shared/service/ordergroove src/utils/hostFlag.test.ts
```

Expected: every file green. Then, with nothing else running on the machine:

```bash
yarn vitest run 2>&1 | grep -E "^ (×|❯) src/" | sort -u > /tmp/after-failing.txt
comm -13 /tmp/baseline-failing.txt /tmp/after-failing.txt
```

Expected: the `comm` output (files failing now that did not fail in the baseline) is empty, or
lists only files that pass when run alone — run each listed file by itself; a file that also
fails alone is a real regression to fix before continuing. The suite's own worker pool pushes this
machine's load average past 25, so ~20 timing-out files is the normal baseline, not a signal.

- [ ] **Step 3: Align the spec with what shipped** — edit the Phase 2 spec:

1. §2.1: the flag is on for `true` **or `"true"`** (any case) via `isHostFlagEnabled`; the helper
   was lifted from the payment-methods page.
2. §5.2 table: add the row *secondary query failed while subscriptions loaded* → the page-level
   error alert reads "Some subscription details couldn't be loaded." with Try again re-running the
   failed queries; cells read "Unavailable".
3. §6: add `subscriptions.partialLoadError`, remove `subscriptions.title` (the layout renders the
   route name), and change the totals sentence to `currencyFormat` from `@/utils/b3CurrencyFormat`
   (the store's active currency; `ordersCurrencyFormat` needs a per-order money format the
   Ordergroove record does not carry).
4. §5.1: note the card's details column is a named `group` (product name) and the image alt is the
   product name.
5. §3.3: replace the tick boxes with the recorded Task 0 findings.

- [ ] **Step 4: Record the outcome in the memory note** — append to the Ordergroove note in
`.memory/`, after the Phase 1 sections:

```
## Phase 2 implemented (YYYY-MM-DD)

- `/manage-subscriptions` renders the portal page when `BC_CONTEXT.subscriptions.customManager`
  is true/"true" and the shopper is not masquerading; otherwise the hosted iframe
  (`components/HostedManagerFrame.tsx`). Page: `SubscriptionsManager.tsx`; six queries in
  `hooks/useSubscriptionsData.ts`; pure join in `viewModel.ts`.
- Service additions: `listSubscriptions/Payments/Addresses`, `listUpcomingOrders`
  (`/orders/?status=1` + `/items/?status=1` — items are the only subscription→order link),
  `listOrdersPage` + `orderHistoryUrl` (`/orders/?place_end=<today>` paged by `next`).
- Task 0 findings: <paste A–D here>.
- Live check (Task 11): <paste the summary here>.
```

Replace `YYYY-MM-DD` and the two placeholders with the real values before committing.

- [ ] **Step 5: Commit the docs**

```bash
git add docs/superpowers/specs/2026-09-17-ordergroove-phase2-subscriptions-page-design.md docs/superpowers/plans/2026-09-17-ordergroove-phase2-subscriptions-page.md .memory/b2b-buyer-portal--ordergroove-custom-msp-architecture.md
git commit -m "docs: B2B-0000 Record the Ordergroove Phase 2 implementation" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Live check on sandbox (read-only; nothing is clicked that mutates)

**Files:** none in the repo. Script in your scratch directory.

**Interfaces:**
- Consumes: a deploy-flavour build of this branch; the Phase 1 recipe (request-level login, route interception of the deployed bundle, `BC_CONTEXT` setter injection); `playwright` with the system Chrome.

- [ ] **Step 1: Build the deploy flavour**

Run: `VITE_ASSETS_ABSOLUTE_PATH='https://sandbox.storesupply.com/content/b2bBuyerPortal/dist/' yarn build`
Expected: `apps/storefront/dist/` with hashed root entries (`index.<hash>.js`); the script below aliases the loader's unhashed names.

- [ ] **Step 2: Write the script** to `<scratch>/pw/phase2-live.mjs` (needs `npm i playwright` in `<scratch>/pw` once, or reuse the Phase 1 install)

```js
// Read-only live check of the Phase 2 page on sandbox. INJECT=0 runs the gate-off control.
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const DIST = process.env.DIST; // absolute path to apps/storefront/dist from Step 1
const ENV = process.env.ENV_FILE; // absolute path to apps/storefront/.env
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const ORIGIN = 'https://sandbox.storesupply.com';
const INJECT = process.env.INJECT !== '0';
const MERCHANT_ID = process.env.OG_PUBLIC_ID;

mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  readFileSync(ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
  }),
);
const contentType = (file) =>
  ({ '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' })[path.extname(file)] ?? 'application/octet-stream';

const summary = { inject: INJECT, ogRequestsFromPortal: [], ogRequestsFromFrames: 0, servedLocal: 0 };
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });

if (INJECT) {
  // The theme assigns window.BC_CONTEXT and then sets properties on it; a setter keeps our block.
  await context.addInitScript((merchantId) => {
    const subscriptions = {
      merchantId,
      authEndpoint: 'https://test-onlineservices.storesupply.com/products/productclient/ordergroove-auth',
      appClientId: 'cez294ivwtwiq0wjdo0hx9kbgjzaszl',
      customManager: true,
    };
    let store = { subscriptions };
    Object.defineProperty(window, 'BC_CONTEXT', {
      configurable: true,
      get: () => store,
      set: (v) => { store = Object.assign({}, v, { subscriptions }); },
    });
  }, MERCHANT_ID);
}

const page = await context.newPage();
await page.route(`${ORIGIN}/content/b2bBuyerPortal/dist/**`, async (route) => {
  const rel = new URL(route.request().url()).pathname.replace('/content/b2bBuyerPortal/dist/', '');
  let file = path.join(DIST, rel);
  if (!existsSync(file) && !rel.includes('/') && rel.endsWith('.js')) {
    const base = rel.slice(0, -3);
    const match = readdirSync(DIST).find((f) => new RegExp(`^${base}\\.[A-Za-z0-9_-]+\\.js$`).test(f));
    if (match) file = path.join(DIST, match);
  }
  if (existsSync(file)) {
    summary.servedLocal += 1;
    await route.fulfill({ status: 200, body: readFileSync(file), headers: { 'content-type': contentType(file), 'cache-control': 'no-store' } });
  } else {
    await route.continue();
  }
});
page.on('request', (req) => {
  if (!req.url().startsWith('https://restapi.ordergroove.com/')) return;
  // The hosted iframe's own manager also calls Ordergroove; only the portal's calls count here.
  if (req.frame() === page.mainFrame()) summary.ogRequestsFromPortal.push(`${req.method()} ${req.url().replace('https://restapi.ordergroove.com', '')}`);
  else summary.ogRequestsFromFrames += 1;
});

await page.goto(`${ORIGIN}/login.php`, { waitUntil: 'domcontentloaded' });
const login = await page.request.post(`${ORIGIN}/login.php?action=check_login`, {
  form: { login_email: env.VITE_TEST_ACCOUNT_EMAIL, login_pass: env.VITE_TEST_ACCOUNT_PASSWORD },
  maxRedirects: 0,
});
summary.loginStatus = login.status();

await page.goto(`${ORIGIN}/account.php#/manage-subscriptions`, { waitUntil: 'domcontentloaded' });

// The portal renders inside the ThemeFrame (document.write'd), so reach its document by hand.
const portalEval = (fn, arg) =>
  page.evaluate(({ src, arg }) => {
    const frames = Array.from(document.querySelectorAll('#bundle-container iframe, iframe.active-frame'));
    const doc = frames.map((f) => { try { return f.contentDocument; } catch { return null; } }).find((d) => d && d.body);
    // eslint-disable-next-line no-new-func
    return new Function('doc', 'arg', `return (${src})(doc, arg)`)(doc, arg);
  }, { src: fn.toString(), arg });

const waitFor = async (predicate, ms, label) => {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (await portalEval(predicate).catch(() => false)) return;
    await page.waitForTimeout(250);
  }
  summary.failure = `timeout waiting for ${label}`;
  await page.screenshot({ path: path.join(OUT, 'phase2-failure.png'), fullPage: true }).catch(() => {});
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
  process.exit(1);
};

if (INJECT) {
  await waitFor((doc) => !!doc && doc.querySelectorAll('.MuiCard-root').length >= 14, 60000, 'fourteen subscription cards');
  // textContent, not innerText: MUI uppercases button labels with CSS and innerText follows it.
  summary.cards = await portalEval((doc) => Array.from(doc.querySelectorAll('.MuiCard-root')).map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
  summary.cancelledToggle = await portalEval((doc) => (Array.from(doc.querySelectorAll('button')).find((b) => /cancelled subscription/i.test(b.textContent)) || {}).textContent ?? null);
  summary.escapeLink = await portalEval((doc) => { const a = Array.from(doc.querySelectorAll('a')).find((x) => /subscription manager/i.test(x.textContent)); return a ? { href: a.href, target: a.target } : null; });
  await waitFor((doc) => /Recent subscription orders/.test(doc.body.textContent) && !/No subscription orders yet/.test(doc.body.textContent) && doc.querySelectorAll('section a').length > 0, 30000, 'recent orders with a web order link');
  summary.recentOrders = await portalEval((doc) => Array.from(doc.querySelectorAll('section a')).map((a) => `${a.textContent} -> ${a.getAttribute('href')}`));
  summary.alerts = await portalEval((doc) => Array.from(doc.querySelectorAll('[role="alert"]')).map((a) => a.textContent));
  await page.screenshot({ path: path.join(OUT, 'phase2-live.png'), fullPage: true });
} else {
  await waitFor((doc) => !!doc && !!doc.querySelector('#subscriptions-iframe'), 60000, 'the hosted iframe');
  await page.waitForTimeout(8000);
  summary.iframePresent = true;
  await page.screenshot({ path: path.join(OUT, 'phase2-gate-off.png'), fullPage: true });
}

await browser.close();
console.log(JSON.stringify(summary, null, 2));
```

- [ ] **Step 3: Run with the flag injected**

Run: `DIST=<abs path to apps/storefront/dist> ENV_FILE=<abs path to apps/storefront/.env> OG_PUBLIC_ID=<merchant id> node <scratch>/pw/phase2-live.mjs`

Expected, for customer 80591:
- `cards.length` ≥ 14 and each card text contains a real product name, `Qty`, `every 4 weeks` or `every 2 weeks`, `Ships to`, `Paid with … ending in`, and `Next order`;
- `cancelledToggle` reads "4 cancelled subscriptions";
- `escapeLink.href` ends in `/subscriptions` and `escapeLink.target` is `_top`;
- `recentOrders` lists `Order <web number> -> /orderDetail/<id>` rows — open `/account.php#/orders` and confirm one of those web numbers appears there too;
- `alerts` is empty;
- `ogRequestsFromPortal` contains `GET /subscriptions/`, `GET /payments/`, `GET /addresses/`, `GET /orders/?status=1`, `GET /items/?status=1`, `GET /orders/?place_end=…`, and `GET /products/<id>/` for two ids only.
- Inspect `out/phase2-live.png`.

- [ ] **Step 4: Run the gate-off control**

Run: same command with `INJECT=0`.
Expected: `iframePresent: true`, `ogRequestsFromPortal` empty (the frame's own requests are counted separately in `ogRequestsFromFrames` and are expected), screenshot shows today's hosted manager.

- [ ] **Step 5: Record**

Paste the two summaries (with product names, never tokens or the merchant id) into the memory note section from Task 10 Step 4, and commit that note change with the Task 10 docs commit if it has not been made yet, else as `docs: B2B-0000 Record the Phase 2 live check`.

---

## Self-review against the spec

- §1 decisions 1–6: Task 1 (flag), Task 7 (escape link, cards, recent orders, no analytics call), Task 4 (per-resource queries). ✓
- §2.1–2.4 switch, route, iframe move, files: Tasks 1 and 8; the route list is untouched. ✓
- §3.1 service additions and types: Task 2. §3.2 six queries: Task 4. §3.3 probe: Task 0. ✓
- §4 view model, join rules, brand and status tables, ordering: Task 3 (tests cover every listed code and the `live:false` without a date case). ✓
- §5.1 layout and mobile: Tasks 5, 7, 9. §5.2 states: Tasks 5 (skeleton/fallback), 6 (history states), 7 (alerts, empty, Try again, masquerade via Task 8). ✓
- §6 copy: Tasks 5, 6, 7 (plus the two amendments recorded in Global Constraints and written back in Task 10). ✓
- §7 error handling: Tasks 4 (`retry: false`), 7 (sessionExpired vs Try again, secondary degradation). ✓
- §8 analytics: nothing to build; decision stands. ✓
- §9 tests: unit (Task 3), service (Task 2), hook (Task 4), page 1–7 (Task 7), switch (Task 8), mobile (Task 9), live (Task 11). ✓
- Type consistency: `SubscriptionLookups`/`buildSubscriptionCards`/`buildRecentOrders` (Task 3) are what Task 7 calls; `CellLoading` (Task 5) is what Tasks 7 and 8 pass; `listOrdersPage`/`orderHistoryUrl` (Task 2) are what Task 4 calls; `isCustomManagerAvailable` (Task 1) is what Task 8 calls. ✓
