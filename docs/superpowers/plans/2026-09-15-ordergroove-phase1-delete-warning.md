# Ordergroove Phase 1 — Subscription Warning on Card Delete: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a customer opens the "Delete card?" dialog on `/payment-methods`, look up the active Ordergroove subscriptions that charge that card and list them in the dialog, with the confirm button disabled until the check resolves.

**Architecture:** A new `src/shared/service/ordergroove/` module (third backend beside `b2b`/`bc`) mints the Ordergroove storefront-auth header from the SSW middleware (JWT → signed triplet, cached in module memory), calls `restapi.ordergroove.com` directly from the browser, and exposes one cross-page mapping: BC stored-instrument token → active subscriptions (the token **is** Ordergroove's `payment.token_id`). A page-local react-query hook wraps it and a presentational component renders four states inside the existing `B3Dialog`. Gated by a new host config `BC_CONTEXT.subscriptions`; absent = the dialog is byte-for-byte what it is today.

**Tech Stack:** React 18, TypeScript, `@tanstack/react-query` v5, MUI, react-router-dom v6, Vitest + jsdom + MSW v2 + Testing Library, `tests/builder.ts` builders, ICU messages via `useB3Lang`.

**Spec:** `docs/superpowers/specs/2026-09-15-ordergroove-subscriptions-custom-manager-design.md` — §5 (shared foundation) and §6 (Phase 1). Read §2 and §4 too: they explain *why* the token match is exact and why the auth body carries both `Jwt` and `customerId`.

## Global Constraints

- All commands run from `apps/storefront/` (`cd apps/storefront` first). Node `>=22.16.0`, Yarn `1.22.22`.
- No new Redux slices, Context providers, `localStorage`/`sessionStorage`. The auth cache is **module memory only** (spec §5.2).
- `useQuery`/`useMutation` for data; Redux read only at the top of the page and passed down.
- Imports: `@/` alias, `lodash-es` only, named MUI icon imports. Import groups separated by blank lines: externals, then `@/…`, then relative.
- ESLint airbnb is on: no `for…of`/`for await` (`no-restricted-syntax`), no `await` in loops, no nested ternaries, no `console`. Do not add violations of the disabled-rule list in CLAUDE.md.
- knip fails on unused exports: **export only what another `src` file consumes.** Test-only helpers are not exported; tests go through the public functions.
- Commit subject format: `type: B2B-0000 Short description`; end every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Copy is fixed by spec §6.3 — use the exact strings in Task 4.
- Ordergroove endpoints: base `https://restapi.ordergroove.com`; lists are paginated with an absolute `next` URL or `null`; request timeout 5 s; rate limit 6000 req/IP/min (not a concern).
- Auth body sent to the middleware: `{ Jwt, customerId, storeHash }` — all three, always (spec §4 forward-compat contract).
- Every planned test must be seen **failing** before its implementation step (the plan's "verify it fails" steps are the negative control — do not skip them).

## Before you start

1. `git status` — this tree often carries another session's uncommitted work. **`src/index.d.ts` is known to have an unrelated `bodl` hunk pending.** Task 1 edits that file. If the hunk is still uncommitted when you get there, stash just that file first (`git stash push -- apps/storefront/src/index.d.ts`), make and commit your edit, then `git stash pop` — the hunks are ~25 lines apart and merge cleanly. Never `git add` a file whose diff contains lines you did not write.
2. Baseline: run `yarn test --run 2>&1 | tail -20` once and note any pre-existing failures (the dev branch has a known red baseline; only *new* failures are yours).
3. Sandbox fixture for the manual check in Task 8: customer **80591** (credentials in `apps/storefront/.env` as `VITE_TEST_ACCOUNT_EMAIL` / `VITE_TEST_ACCOUNT_PASSWORD` — never print them), 3 stored instruments, 14 active subscriptions on the **default** card across 2 products, 0 on the other two cards.

## File structure

| File | Responsibility |
|---|---|
| `src/index.d.ts` | add `BC_CONTEXT.subscriptions` host-config type |
| `src/shared/service/ordergroove/config.ts` | read host config; `isSubscriptionsAvailable()` platform + config gate |
| `src/shared/service/ordergroove/errors.ts` | `OrdergrooveError` with `kind` |
| `src/shared/service/ordergroove/types.ts` | `OgPayment`, `OgSubscription`, `OgProduct` (snake_case, as the API returns them) |
| `src/shared/service/ordergroove/auth.ts` | JWT → middleware → `Authorization` header; module-memory cache; invalidation |
| `src/shared/service/ordergroove/api.ts` | `ogFetch` (timeout, 403 retry-once, status → kind), pagination, `getSubscriptionsUsingToken`, `getProduct` |
| `src/shared/service/ordergroove/index.ts` | barrel: exactly the surface the page consumes |
| `tests/ordergrooveBuilders/index.ts` + `tests/test-utils.tsx` | `buildOgPaymentWith` / `buildOgSubscriptionWith` / `buildOgProductWith` |
| `src/lib/lang/locales/en.json` | the ten `paymentMethods.deleteDialog.subscriptions.*` strings |
| `src/pages/PaymentMethods/hooks/useSubscriptionsUsingInstrument.ts` | react-query hook; resolves product names best-effort |
| `src/pages/PaymentMethods/components/DeleteSubscriptionWarning.tsx` | presentational: status + list → markup |
| `src/pages/PaymentMethods/index.tsx` | wire hook + component into the existing dialog; `disabledSaveBtn` while checking |

---

### Task 1: Host config type and availability gate

**Files:**
- Modify: `src/index.d.ts` (inside `BC_CONTEXT?: { … }`, after `paymentMethodsBraintree`)
- Create: `src/shared/service/ordergroove/config.ts`
- Create: `src/shared/service/ordergroove/errors.ts`
- Create: `src/shared/service/ordergroove/types.ts`
- Test: `src/shared/service/ordergroove/config.test.ts`, `src/shared/service/ordergroove/config.platform.test.ts`

**Interfaces:**
- Produces: `getSubscriptionsConfig(): { merchantId: string; authEndpoint: string; appClientId: string } | undefined`; `isSubscriptionsAvailable(): boolean`; `class OrdergrooveError extends Error { kind: 'unavailable' | 'sessionExpired' | 'rateLimited' | 'timeout' | 'upstream' }`; types `OgPayment`, `OgSubscription`, `OgProduct`.

- [ ] **Step 1: Write the failing tests**

`src/shared/service/ordergroove/config.test.ts`:

```ts
import { isSubscriptionsAvailable } from './config';

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('is unavailable when the host has not configured subscriptions', () => {
  window.BC_CONTEXT = { paymentMethods: { apiBase: 'https://api.example.com', appClientId: 'x' } };

  expect(isSubscriptionsAvailable()).toBe(false);
});

it('is available on Stencil when the host configures subscriptions', () => {
  window.BC_CONTEXT = {
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint: 'https://api.example.com/products/productclient/ordergroove-auth',
      appClientId: 'ssw-app-client-id',
    },
  };

  expect(isSubscriptionsAvailable()).toBe(true);
});
```

`src/shared/service/ordergroove/config.platform.test.ts` (a separate file because `vi.mock` is file-scoped — same pattern as `pages/PaymentMethods/index.platform.test.tsx`):

```ts
import { isSubscriptionsAvailable } from './config';

vi.mock('@/utils/basicConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/basicConfig')>()),
  platform: 'catalyst',
}));

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('is unavailable off Stencil even when configured — there is no Current Customer JWT there', () => {
  window.BC_CONTEXT = {
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint: 'https://api.example.com/products/productclient/ordergroove-auth',
      appClientId: 'ssw-app-client-id',
    },
  };

  expect(isSubscriptionsAvailable()).toBe(false);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `yarn test --run src/shared/service/ordergroove/config`
Expected: FAIL — cannot resolve `./config`; also a type error on `subscriptions` not existing on `BC_CONTEXT`.

- [ ] **Step 3: Add the host-config type**

In `src/index.d.ts`, directly after the `paymentMethodsBraintree?: { enabled: boolean };` line inside `BC_CONTEXT`:

```ts
      /**
       * Gates every Ordergroove-backed feature (subscription warning on /payment-methods,
       * later the custom subscriptions page); absent = feature off.
       */
      subscriptions?: {
        /** Ordergroove "Your Merchant ID" — the REST API `public_id`. Public, not a secret. */
        merchantId: string;
        /** SSW middleware endpoint that mints the storefront-auth triplet (customerId|ts|sig). */
        authEndpoint: string;
        /** SSW app client id used to mint the Current Customer JWT sent to authEndpoint. */
        appClientId: string;
      };
```

- [ ] **Step 4: Create errors, types, and config**

`src/shared/service/ordergroove/errors.ts`:

```ts
type OrdergrooveErrorKind = 'unavailable' | 'sessionExpired' | 'rateLimited' | 'timeout' | 'upstream';

export class OrdergrooveError extends Error {
  kind: OrdergrooveErrorKind;

  constructor(kind: OrdergrooveErrorKind) {
    super(kind);
    this.kind = kind;
  }
}
```

`src/shared/service/ordergroove/types.ts` (field names are Ordergroove's snake_case, kept verbatim so payloads need no mapping):

```ts
/**
 * One Ordergroove payment record. Ordergroove mints a NEW record on every checkout, so several
 * records routinely share one `token_id`; `live` marks the current one. `token_id` is the
 * BigCommerce stored-instrument token, byte-for-byte (spec §2).
 */
export interface OgPayment {
  public_id: string;
  customer: string;
  token_id: string;
  cc_number_ending: string;
  /** "M/YYYY" */
  cc_exp_date: string;
  cc_type: number;
  cc_holder: string | null;
  /** Ordergroove address public_id */
  billing_address: string;
  live: boolean;
}

export interface OgSubscription {
  public_id: string;
  customer: string;
  /** "<bcProductId>_<variantId>" — also the id for GET /products/{id}/ */
  product: string;
  /** payment public_id */
  payment: string;
  shipping_address: string;
  quantity: number;
  frequency_days: number;
  start_date: string;
  /** ISO timestamp when cancelled, null while active */
  cancelled: string | null;
  /** BigCommerce order id of the enrolling order */
  merchant_order_id: string | null;
  live: boolean;
}

export interface OgProduct {
  external_product_id: string;
  name: string;
  image_url: string;
  detail_url: string;
  sku: string;
  price: string;
}
```

`src/shared/service/ordergroove/config.ts`:

```ts
import { platform } from '@/utils/basicConfig';

export const getSubscriptionsConfig = () => window.BC_CONTEXT?.subscriptions;

// Stencil-only: the Current Customer JWT the auth endpoint needs does not exist on other
// platforms, and the theme is what emits the config in the first place.
export const isSubscriptionsAvailable = () =>
  platform === 'bigcommerce' && Boolean(getSubscriptionsConfig());
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn test --run src/shared/service/ordergroove/config`
Expected: PASS (3 tests). Then `yarn tsc --noEmit` → no errors.

- [ ] **Step 6: Commit** (stash the unrelated `index.d.ts` hunk first if it is still there — see "Before you start")

```bash
git add src/index.d.ts src/shared/service/ordergroove/config.ts src/shared/service/ordergroove/config.test.ts src/shared/service/ordergroove/config.platform.test.ts src/shared/service/ordergroove/errors.ts src/shared/service/ordergroove/types.ts
git commit -m "feat: B2B-0000 Add the Ordergroove host-config gate and service types" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Ordergroove authorization header (mint + cache)

**Files:**
- Create: `src/shared/service/ordergroove/auth.ts`
- Test: `src/shared/service/ordergroove/auth.test.ts`

**Interfaces:**
- Consumes: `getSubscriptionsConfig` (Task 1), `OrdergrooveError` (Task 1), `getCurrentCustomerJWT` from `@/shared/service/bc` (`(appClientId: string) => Promise<string | undefined>`, throws on non-OK without an `errors` body), `storeHash` from `@/utils/basicConfig`.
- Produces: `getAuthorizationHeader(customerId: string): Promise<string>` — the JSON string for the `Authorization` header; `invalidateAuthorization(): void`.

- [ ] **Step 1: Write the failing tests**

`src/shared/service/ordergroove/auth.test.ts`:

```ts
import { faker, http, HttpResponse, startMockServer } from 'tests/test-utils';

import { getAuthorizationHeader, invalidateAuthorization } from './auth';

const { server } = startMockServer();

const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

// Each test uses a fresh customer id: the header cache is keyed by it and lives for the module.
const someCustomerId = () => String(faker.number.int({ min: 1, max: 1_000_000 }));

const mockJwt = () => server.use(http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')));

beforeEach(() => {
  window.BC_CONTEXT = {
    subscriptions: { merchantId: 'merchant-public-id', authEndpoint, appClientId: 'ssw-app-client-id' },
  };
  invalidateAuthorization();
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('mints the Ordergroove header from the middleware triplet', async () => {
  const requestBody = vi.fn();

  mockJwt();
  server.use(
    http.post(authEndpoint, async ({ request }) => {
      requestBody(await request.json());

      return HttpResponse.json({
        success: true,
        cookieValue: '80591|1789495813|UPC2kmuw/c77nskIaDZqwn/u//YFNj4jVcfVM42uQck=',
        expiresIn: 7200,
      });
    }),
  );

  const header = await getAuthorizationHeader('80591');

  expect(JSON.parse(header)).toEqual({
    public_id: 'merchant-public-id',
    sig_field: '80591',
    ts: 1789495813,
    sig: 'UPC2kmuw/c77nskIaDZqwn/u//YFNj4jVcfVM42uQck=',
  });
  // Forward-compatible contract (spec §4): today's endpoint reads customerId, the hardened one reads Jwt.
  expect(requestBody).toHaveBeenCalledWith({
    Jwt: 'fresh-jwt',
    customerId: '80591',
    storeHash: expect.any(String),
  });
});

it('reuses the header for the same customer instead of minting again', async () => {
  const mints = vi.fn();
  const customerId = someCustomerId();

  mockJwt();
  server.use(
    http.post(authEndpoint, () => {
      mints();

      return HttpResponse.json({ success: true, cookieValue: `${customerId}|1|sig`, expiresIn: 7200 });
    }),
  );

  const first = await getAuthorizationHeader(customerId);
  const second = await getAuthorizationHeader(customerId);

  expect(second).toBe(first);
  expect(mints).toHaveBeenCalledTimes(1);
});

it('mints again after the cache is invalidated', async () => {
  const mints = vi.fn();
  const customerId = someCustomerId();

  mockJwt();
  server.use(
    http.post(authEndpoint, () => {
      mints();

      return HttpResponse.json({ success: true, cookieValue: `${customerId}|1|sig`, expiresIn: 7200 });
    }),
  );

  await getAuthorizationHeader(customerId);
  invalidateAuthorization();
  await getAuthorizationHeader(customerId);

  expect(mints).toHaveBeenCalledTimes(2);
});

it('reports an expired session when there is no Current Customer JWT', async () => {
  server.use(http.get(currentJwtUrl, () => HttpResponse.text('{"errors":[]}', { status: 404 })));

  await expect(getAuthorizationHeader(someCustomerId())).rejects.toMatchObject({ kind: 'sessionExpired' });
});

it('reports an expired session when the middleware rejects the JWT', async () => {
  mockJwt();
  server.use(http.post(authEndpoint, () => new HttpResponse(null, { status: 401 })));

  await expect(getAuthorizationHeader(someCustomerId())).rejects.toMatchObject({ kind: 'sessionExpired' });
});

it('reports upstream when the middleware fails or returns a malformed triplet', async () => {
  mockJwt();
  server.use(http.post(authEndpoint, () => new HttpResponse(null, { status: 500 })));
  await expect(getAuthorizationHeader(someCustomerId())).rejects.toMatchObject({ kind: 'upstream' });

  server.use(http.post(authEndpoint, () => HttpResponse.json({ success: true, cookieValue: 'not-a-triplet' })));
  await expect(getAuthorizationHeader(someCustomerId())).rejects.toMatchObject({ kind: 'upstream' });
});

it('reports unavailable when the host config is missing', async () => {
  delete window.BC_CONTEXT;

  await expect(getAuthorizationHeader(someCustomerId())).rejects.toMatchObject({ kind: 'unavailable' });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `yarn test --run src/shared/service/ordergroove/auth.test.ts`
Expected: FAIL — cannot resolve `./auth`.

- [ ] **Step 3: Implement `auth.ts`**

```ts
import { getCurrentCustomerJWT } from '@/shared/service/bc';
import { storeHash } from '@/utils/basicConfig';

import { getSubscriptionsConfig } from './config';
import { OrdergrooveError } from './errors';

// The storefront signature is valid for 2h (the endpoint reports the TTL). Reuse it until it has
// less than this much life left so a request in flight never straddles the expiry.
const REFRESH_MARGIN_MS = 10 * 60 * 1000;
const DEFAULT_TTL_SECONDS = 7200;

interface CachedAuthorization {
  customerId: string;
  header: string;
  expiresAt: number;
}

interface AuthResponse {
  success?: boolean;
  /** "<customerId>|<epoch seconds>|<base64 HMAC>" — the value the theme stores as the og_auth cookie */
  cookieValue?: string;
  expiresIn?: number;
}

// Module memory only (spec §5.2): never storage, never Redux.
let cached: CachedAuthorization | undefined;

const mint = async (customerId: string): Promise<CachedAuthorization> => {
  const config = getSubscriptionsConfig();
  if (!config) {
    throw new OrdergrooveError('unavailable');
  }

  const jwt = await getCurrentCustomerJWT(config.appClientId).catch(() => undefined);
  if (!jwt) {
    throw new OrdergrooveError('sessionExpired');
  }

  let response: Response;
  try {
    // Both identifiers on purpose (spec §4): today's endpoint reads customerId and ignores Jwt;
    // the hardened endpoint reads Jwt and ignores customerId. No portal redeploy at cutover.
    response = await fetch(config.authEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Jwt: jwt, customerId, storeHash }),
    });
  } catch {
    throw new OrdergrooveError('upstream');
  }

  if (response.status === 401) {
    throw new OrdergrooveError('sessionExpired');
  }
  if (!response.ok) {
    throw new OrdergrooveError('upstream');
  }

  const body = (await response.json()) as AuthResponse;
  const [sigField, ts, sig] = (body.cookieValue ?? '').split('|');
  if (!body.success || !sigField || !ts || !sig) {
    throw new OrdergrooveError('upstream');
  }

  return {
    customerId,
    // Ordergroove's storefront-auth header is this JSON object as a string.
    header: JSON.stringify({ public_id: config.merchantId, sig_field: sigField, ts: Number(ts), sig }),
    expiresAt: Date.now() + (body.expiresIn ?? DEFAULT_TTL_SECONDS) * 1000,
  };
};

export const getAuthorizationHeader = async (customerId: string): Promise<string> => {
  const isFresh =
    cached?.customerId === customerId && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS;
  if (cached && isFresh) {
    return cached.header;
  }
  cached = await mint(customerId);

  return cached.header;
};

export const invalidateAuthorization = () => {
  cached = undefined;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test --run src/shared/service/ordergroove/auth.test.ts`
Expected: PASS (7 tests). `yarn tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/shared/service/ordergroove/auth.ts src/shared/service/ordergroove/auth.test.ts
git commit -m "feat: B2B-0000 Mint and cache the Ordergroove storefront-auth header" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Ordergroove API client, token → subscriptions mapping, barrel

**Files:**
- Create: `src/shared/service/ordergroove/api.ts`
- Create: `src/shared/service/ordergroove/index.ts`
- Create: `tests/ordergrooveBuilders/index.ts`; Modify: `tests/test-utils.tsx` (add one re-export line)
- Test: `src/shared/service/ordergroove/api.test.ts`

**Interfaces:**
- Consumes: `getAuthorizationHeader`, `invalidateAuthorization` (Task 2); `OrdergrooveError`, types (Task 1).
- Produces (via the barrel `@/shared/service/ordergroove`): `isSubscriptionsAvailable()`; `getSubscriptionsUsingToken(customerId: string, token: string): Promise<OgSubscription[]>`; `getProduct(customerId: string, externalProductId: string): Promise<OgProduct>`; types `OgPayment`, `OgSubscription`, `OgProduct`. Builders `buildOgPaymentWith`, `buildOgSubscriptionWith`, `buildOgProductWith` from `tests/test-utils`.

- [ ] **Step 1: Create the builders** (needed by this task's tests; follows `tests/favoritesBuilders`)

`tests/ordergrooveBuilders/index.ts`:

```ts
import { faker } from '@faker-js/faker';

import { OgPayment, OgProduct, OgSubscription } from '@/shared/service/ordergroove';
import { builder } from 'tests/builder';

const hex = (length: number) => faker.string.hexadecimal({ length, prefix: '' }).toLowerCase();

export const buildOgPaymentWith = builder<OgPayment>(() => ({
  public_id: hex(32),
  customer: '80591',
  token_id: hex(64),
  cc_number_ending: faker.string.numeric(4),
  cc_exp_date: '3/2028',
  cc_type: 1,
  cc_holder: null,
  billing_address: hex(32),
  live: true,
}));

export const buildOgSubscriptionWith = builder<OgSubscription>(() => ({
  public_id: hex(32),
  customer: '80591',
  product: `${faker.number.int({ min: 1000, max: 9999 })}_${faker.number.int({ min: 10000, max: 99999 })}`,
  payment: hex(32),
  shipping_address: hex(32),
  quantity: faker.number.int({ min: 1, max: 40 }),
  frequency_days: 28,
  start_date: '2026-08-25',
  cancelled: null,
  merchant_order_id: String(faker.number.int({ min: 250000, max: 259999 })),
  live: true,
}));

export const buildOgProductWith = builder<OgProduct>(() => ({
  external_product_id: `${faker.number.int({ min: 1000, max: 9999 })}_${faker.number.int({ min: 10000, max: 99999 })}`,
  name: faker.commerce.productName(),
  image_url: faker.image.url(),
  detail_url: faker.internet.url(),
  sku: faker.string.numeric(5),
  price: '81.50',
}));
```

In `tests/test-utils.tsx`, after `export * from 'tests/favoritesBuilders';` add:

```ts
export * from 'tests/ordergrooveBuilders';
```

- [ ] **Step 2: Write the failing tests**

`src/shared/service/ordergroove/api.test.ts`:

```ts
import {
  buildOgPaymentWith,
  buildOgProductWith,
  buildOgSubscriptionWith,
  delay,
  faker,
  http,
  HttpResponse,
  startMockServer,
} from 'tests/test-utils';

import { getProduct, getSubscriptionsUsingToken } from './api';
import { invalidateAuthorization } from './auth';

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const someCustomerId = () => String(faker.number.int({ min: 1, max: 1_000_000 }));

const page = <T>(results: T[], next: string | null = null) => ({
  count: results.length,
  next,
  previous: null,
  results,
});

const mockAuth = () =>
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')),
    http.post(authEndpoint, () =>
      HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 }),
    ),
  );

const mockPayments = (payments: ReturnType<typeof buildOgPaymentWith>[]) =>
  server.use(http.get(`${ogBase}/payments/`, () => HttpResponse.json(page(payments))));

const mockSubscriptions = (subscriptions: ReturnType<typeof buildOgSubscriptionWith>[]) =>
  server.use(http.get(`${ogBase}/subscriptions/`, () => HttpResponse.json(page(subscriptions))));

beforeEach(() => {
  window.BC_CONTEXT = {
    subscriptions: { merchantId: 'merchant-public-id', authEndpoint, appClientId: 'ssw-app-client-id' },
  };
  invalidateAuthorization();
  mockAuth();
});

afterEach(() => {
  delete window.BC_CONTEXT;
  vi.useRealTimers();
});

it('sends the Ordergroove header on every request', async () => {
  const authorization = vi.fn();

  server.use(
    http.get(`${ogBase}/payments/`, ({ request }) => {
      authorization(request.headers.get('Authorization'));

      return HttpResponse.json(page([]));
    }),
  );

  await getSubscriptionsUsingToken(someCustomerId(), 'tok');

  expect(JSON.parse(authorization.mock.calls[0][0])).toMatchObject({
    public_id: 'merchant-public-id',
    sig_field: '80591',
    sig: 'sig',
  });
});

it('returns only active subscriptions whose payment record carries the token', async () => {
  const token = faker.string.hexadecimal({ length: 64, prefix: '' }).toLowerCase();
  const livePayment = buildOgPaymentWith({ token_id: token, live: true });
  const otherPayment = buildOgPaymentWith({ live: true });
  const wanted = buildOgSubscriptionWith({ payment: livePayment.public_id });
  const cancelled = buildOgSubscriptionWith({ payment: livePayment.public_id, cancelled: '2026-01-01 00:00:00' });
  const dead = buildOgSubscriptionWith({ payment: livePayment.public_id, live: false });
  const otherCard = buildOgSubscriptionWith({ payment: otherPayment.public_id });

  mockPayments([livePayment, otherPayment]);
  mockSubscriptions([wanted, cancelled, dead, otherCard]);

  const result = await getSubscriptionsUsingToken(someCustomerId(), token);

  expect(result.map((s) => s.public_id)).toEqual([wanted.public_id]);
});

it('matches a live subscription through a dead payment record with the same token', async () => {
  // Ordergroove mints a payment record per checkout; a subscription can still point at an older,
  // no-longer-live record for the very same card.
  const token = faker.string.hexadecimal({ length: 64, prefix: '' }).toLowerCase();
  const deadRecord = buildOgPaymentWith({ token_id: token, live: false });
  const subscription = buildOgSubscriptionWith({ payment: deadRecord.public_id });

  mockPayments([deadRecord, buildOgPaymentWith({ token_id: token, live: true })]);
  mockSubscriptions([subscription]);

  const result = await getSubscriptionsUsingToken(someCustomerId(), token);

  expect(result.map((s) => s.public_id)).toEqual([subscription.public_id]);
});

it('does not fetch subscriptions when no payment record carries the token', async () => {
  const subscriptionRequests = vi.fn();

  mockPayments([buildOgPaymentWith()]);
  server.use(
    http.get(`${ogBase}/subscriptions/`, () => {
      subscriptionRequests();

      return HttpResponse.json(page([]));
    }),
  );

  expect(await getSubscriptionsUsingToken(someCustomerId(), 'unknown-token')).toEqual([]);
  expect(subscriptionRequests).not.toHaveBeenCalled();
});

it('follows pagination until next is null', async () => {
  const token = faker.string.hexadecimal({ length: 64, prefix: '' }).toLowerCase();
  const payment = buildOgPaymentWith({ token_id: token });
  const first = buildOgSubscriptionWith({ payment: payment.public_id });
  const second = buildOgSubscriptionWith({ payment: payment.public_id });

  mockPayments([payment]);
  server.use(
    http.get(`${ogBase}/subscriptions/`, ({ request }) =>
      new URL(request.url).searchParams.get('page') === '2'
        ? HttpResponse.json(page([second]))
        : HttpResponse.json(page([first], `${ogBase}/subscriptions/?page=2`)),
    ),
  );

  const result = await getSubscriptionsUsingToken(someCustomerId(), token);

  expect(result.map((s) => s.public_id)).toEqual([first.public_id, second.public_id]);
});

it('re-mints the header once on a 403 and retries', async () => {
  const mints = vi.fn();
  let paymentCalls = 0;

  server.use(
    http.post(authEndpoint, () => {
      mints();

      return HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 });
    }),
    http.get(`${ogBase}/payments/`, () => {
      paymentCalls += 1;

      return paymentCalls === 1
        ? HttpResponse.json({ detail: 'Authentication Failed' }, { status: 403 })
        : HttpResponse.json(page([]));
    }),
  );

  expect(await getSubscriptionsUsingToken(someCustomerId(), 'tok')).toEqual([]);
  expect(mints).toHaveBeenCalledTimes(2);
});

it('reports an expired session when the retry is also forbidden', async () => {
  server.use(
    http.get(`${ogBase}/payments/`, () =>
      HttpResponse.json({ detail: 'Authentication Failed' }, { status: 403 }),
    ),
  );

  await expect(getSubscriptionsUsingToken(someCustomerId(), 'tok')).rejects.toMatchObject({
    kind: 'sessionExpired',
  });
});

it('maps 429 to rateLimited and other failures to upstream', async () => {
  server.use(http.get(`${ogBase}/payments/`, () => new HttpResponse(null, { status: 429 })));
  await expect(getSubscriptionsUsingToken(someCustomerId(), 'tok')).rejects.toMatchObject({
    kind: 'rateLimited',
  });

  server.use(http.get(`${ogBase}/payments/`, () => new HttpResponse(null, { status: 500 })));
  await expect(getSubscriptionsUsingToken(someCustomerId(), 'tok')).rejects.toMatchObject({
    kind: 'upstream',
  });
});

it('gives up after five seconds', async () => {
  const customerId = someCustomerId();

  // Prime the header with real timers so only the Ordergroove call is under the fake clock.
  mockPayments([]);
  await getSubscriptionsUsingToken(customerId, 'tok');

  vi.useFakeTimers();
  server.use(
    http.get(`${ogBase}/payments/`, async () => {
      await delay('infinite');

      return HttpResponse.json(page([]));
    }),
  );

  const pending = getSubscriptionsUsingToken(customerId, 'tok');
  const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
  await vi.advanceTimersByTimeAsync(5000);

  await assertion;
});

it('fetches a product by its Ordergroove external id', async () => {
  const product = buildOgProductWith({ external_product_id: '9537_12118' });

  server.use(http.get(`${ogBase}/products/9537_12118/`, () => HttpResponse.json(product)));

  expect(await getProduct(someCustomerId(), '9537_12118')).toEqual(product);
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `yarn test --run src/shared/service/ordergroove/api.test.ts`
Expected: FAIL — cannot resolve `./api` (and `tests/test-utils` cannot resolve `@/shared/service/ordergroove` until the barrel exists).

- [ ] **Step 4: Implement `api.ts` and the barrel**

`src/shared/service/ordergroove/api.ts`:

```ts
import { getAuthorizationHeader, invalidateAuthorization } from './auth';
import { OrdergrooveError } from './errors';
import { OgPayment, OgProduct, OgSubscription } from './types';

const API_BASE = 'https://restapi.ordergroove.com';
// The warning is advisory; past this the dialog falls back to "we couldn't check" (spec §6.3).
const REQUEST_TIMEOUT_MS = 5000;

interface OgPage<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Promise.race rather than AbortSignal: nothing else in the portal passes signals to fetch, and
// the jsdom/undici pairing in tests has historically disagreed about AbortSignal identity.
const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new OrdergrooveError('timeout')), REQUEST_TIMEOUT_MS);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });

const request = async (customerId: string, url: string, retryOnForbidden: boolean): Promise<Response> => {
  const authorization = await getAuthorizationHeader(customerId);

  let response: Response;
  try {
    response = await withTimeout(
      fetch(url, { headers: { Authorization: authorization, 'Content-Type': 'application/json' } }),
    );
  } catch (error) {
    throw error instanceof OrdergrooveError ? error : new OrdergrooveError('upstream');
  }

  if (response.status === 403 && retryOnForbidden) {
    // The signature can be revoked or age out server-side; mint once more before giving up.
    invalidateAuthorization();

    return request(customerId, url, false);
  }

  return response;
};

const ogFetch = async <T>(customerId: string, url: string): Promise<T> => {
  const response = await request(customerId, url, true);

  if (response.ok) {
    return response.json() as Promise<T>;
  }
  if (response.status === 401 || response.status === 403) {
    throw new OrdergrooveError('sessionExpired');
  }
  if (response.status === 429) {
    throw new OrdergrooveError('rateLimited');
  }
  throw new OrdergrooveError('upstream');
};

// Every Ordergroove list is paginated; `next` is an absolute URL or null. Recursive rather than a
// loop so there is no await-in-loop; a customer has a handful of pages at most.
const listAll = async <T>(customerId: string, url: string | null, acc: T[] = []): Promise<T[]> => {
  if (!url) {
    return acc;
  }
  const current = await ogFetch<OgPage<T>>(customerId, url);

  return listAll(customerId, current.next, [...acc, ...current.results]);
};

const isActive = (subscription: OgSubscription) =>
  subscription.cancelled === null && subscription.live;

/**
 * Active subscriptions charged to a BigCommerce stored instrument. Ordergroove's payment
 * `token_id` IS the instrument token (verified live, spec §2). Several payment records can carry
 * one token and a live subscription can still reference a record that is no longer `live`, so
 * every record with the token counts.
 */
export const getSubscriptionsUsingToken = async (
  customerId: string,
  token: string,
): Promise<OgSubscription[]> => {
  const payments = await listAll<OgPayment>(customerId, `${API_BASE}/payments/`);
  const paymentIds = new Set(
    payments.filter((payment) => payment.token_id === token).map((payment) => payment.public_id),
  );
  if (paymentIds.size === 0) {
    return [];
  }

  const subscriptions = await listAll<OgSubscription>(customerId, `${API_BASE}/subscriptions/`);

  return subscriptions.filter((subscription) => isActive(subscription) && paymentIds.has(subscription.payment));
};

export const getProduct = (customerId: string, externalProductId: string) =>
  ogFetch<OgProduct>(customerId, `${API_BASE}/products/${encodeURIComponent(externalProductId)}/`);
```

`src/shared/service/ordergroove/index.ts` — exactly the surface the page uses (knip):

```ts
export { getProduct, getSubscriptionsUsingToken } from './api';
export { isSubscriptionsAvailable } from './config';
export type { OgPayment, OgProduct, OgSubscription } from './types';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn test --run src/shared/service/ordergroove`
Expected: PASS (all config, auth, api tests). `yarn tsc --noEmit` → clean. `yarn lint:dependencies` → no new violations (the barrel is not yet imported by a page, so `no-orphans` may flag `index.ts` until Task 6 — that is expected and resolves in Task 6; do not add an artificial import to silence it).

- [ ] **Step 6: Commit**

```bash
git add src/shared/service/ordergroove/api.ts src/shared/service/ordergroove/api.test.ts src/shared/service/ordergroove/index.ts tests/ordergrooveBuilders/index.ts tests/test-utils.tsx
git commit -m "feat: B2B-0000 Add the Ordergroove API client and token-to-subscriptions mapping" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Copy and the `DeleteSubscriptionWarning` component

**Files:**
- Modify: `src/lib/lang/locales/en.json` (after the `paymentMethods.deleteDialog.confirm` line)
- Create: `src/pages/PaymentMethods/hooks/useSubscriptionsUsingInstrument.ts` (**type only in this task** — the `AffectedSubscription` interface; the hook body lands in Task 5)
- Create: `src/pages/PaymentMethods/components/DeleteSubscriptionWarning.tsx`
- Test: `src/pages/PaymentMethods/components/DeleteSubscriptionWarning.test.tsx`

**Interfaces:**
- Produces: `interface AffectedSubscription { publicId: string; productName: string | null; frequencyDays: number }`; `type SubscriptionCheckStatus = 'checking' | 'clear' | 'failed' | 'affected'`; `DeleteSubscriptionWarning({ status, subscriptions, onManageSubscriptions })`.

- [ ] **Step 1: Add the copy** — insert into `en.json` directly after `"paymentMethods.deleteDialog.confirm": "Delete",`:

```json
  "paymentMethods.deleteDialog.subscriptions.checking": "Checking your subscriptions…",
  "paymentMethods.deleteDialog.subscriptions.title": "This card is used by {count, plural, one {# active subscription} other {# active subscriptions}}:",
  "paymentMethods.deleteDialog.subscriptions.item": "{product} — {frequency}",
  "paymentMethods.deleteDialog.subscriptions.itemUnnamed": "Subscription — {frequency}",
  "paymentMethods.deleteDialog.subscriptions.more": "and {count} more",
  "paymentMethods.deleteDialog.subscriptions.everyWeeks": "every {count, plural, one {week} other {# weeks}}",
  "paymentMethods.deleteDialog.subscriptions.everyDays": "every {count} days",
  "paymentMethods.deleteDialog.subscriptions.consequence": "If you delete it, these subscriptions can't be charged at their next order. Change their payment method first.",
  "paymentMethods.deleteDialog.subscriptions.manage": "Manage subscriptions",
  "paymentMethods.deleteDialog.subscriptions.checkFailed": "We couldn't check whether any subscriptions use this card.",
```

(`en.json` is the only locale file; ICU plural syntax is already used elsewhere in it.)

- [ ] **Step 2: Write the failing test**

`src/pages/PaymentMethods/components/DeleteSubscriptionWarning.test.tsx`:

```tsx
import { faker, renderWithProviders, screen } from 'tests/test-utils';

import { AffectedSubscription } from '../hooks/useSubscriptionsUsingInstrument';
import DeleteSubscriptionWarning from './DeleteSubscriptionWarning';

const affected = (overrides: Partial<AffectedSubscription> = {}): AffectedSubscription => ({
  publicId: faker.string.uuid(),
  productName: 'Kraft Paper Shopping Bags',
  frequencyDays: 28,
  ...overrides,
});

it('renders nothing when the card is clear', () => {
  const { result } = renderWithProviders(
    <DeleteSubscriptionWarning status="clear" subscriptions={[]} onManageSubscriptions={vi.fn()} />,
  );

  expect(result.container).toBeEmptyDOMElement();
});

it('says it is checking', () => {
  renderWithProviders(
    <DeleteSubscriptionWarning status="checking" subscriptions={[]} onManageSubscriptions={vi.fn()} />,
  );

  expect(screen.getByText('Checking your subscriptions…')).toBeInTheDocument();
});

it('discloses when the check failed', () => {
  renderWithProviders(
    <DeleteSubscriptionWarning status="failed" subscriptions={[]} onManageSubscriptions={vi.fn()} />,
  );

  expect(
    screen.getByText("We couldn't check whether any subscriptions use this card."),
  ).toBeInTheDocument();
});

it('lists the affected subscriptions with weekly or daily frequency and a manage link', async () => {
  const onManage = vi.fn();
  const { user } = renderWithProviders(
    <DeleteSubscriptionWarning
      status="affected"
      subscriptions={[
        affected({ productName: 'Kraft Paper Shopping Bags', frequencyDays: 28 }),
        affected({ productName: 'Tissue Paper', frequencyDays: 7 }),
        affected({ productName: null, frequencyDays: 10 }),
      ]}
      onManageSubscriptions={onManage}
    />,
  );

  expect(screen.getByText('This card is used by 3 active subscriptions:')).toBeInTheDocument();
  expect(screen.getByText('Kraft Paper Shopping Bags — every 4 weeks')).toBeInTheDocument();
  expect(screen.getByText('Tissue Paper — every week')).toBeInTheDocument();
  expect(screen.getByText('Subscription — every 10 days')).toBeInTheDocument();
  expect(
    screen.getByText(
      "If you delete it, these subscriptions can't be charged at their next order. Change their payment method first.",
    ),
  ).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Manage subscriptions' }));

  expect(onManage).toHaveBeenCalledTimes(1);
});

it('uses the singular and truncates the list after five entries', () => {
  renderWithProviders(
    <DeleteSubscriptionWarning
      status="affected"
      subscriptions={[affected()]}
      onManageSubscriptions={vi.fn()}
    />,
  );
  expect(screen.getByText('This card is used by 1 active subscription:')).toBeInTheDocument();

  renderWithProviders(
    <DeleteSubscriptionWarning
      status="affected"
      subscriptions={Array.from({ length: 14 }, () => affected())}
      onManageSubscriptions={vi.fn()}
    />,
  );
  expect(screen.getByText('This card is used by 14 active subscriptions:')).toBeInTheDocument();
  expect(screen.getAllByText('Kraft Paper Shopping Bags — every 4 weeks')).toHaveLength(5 + 1);
  expect(screen.getByText('and 9 more')).toBeInTheDocument();
});
```

(The `5 + 1` counts the five listed in the second render plus the single one from the first render, both still mounted in the same document.)

- [ ] **Step 3: Run it to verify it fails**

Run: `yarn test --run src/pages/PaymentMethods/components/DeleteSubscriptionWarning.test.tsx`
Expected: FAIL — cannot resolve `./DeleteSubscriptionWarning` / `../hooks/useSubscriptionsUsingInstrument`.

- [ ] **Step 4: Create the type file and the component**

`src/pages/PaymentMethods/hooks/useSubscriptionsUsingInstrument.ts` (type only for now; Task 5 fills in the hook):

```ts
/** One active subscription charged to the card being deleted, ready for display. */
export interface AffectedSubscription {
  publicId: string;
  /** null when the product lookup failed — the warning still counts it. */
  productName: string | null;
  frequencyDays: number;
}
```

`src/pages/PaymentMethods/components/DeleteSubscriptionWarning.tsx`:

```tsx
import { Alert, Box, Link, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { AffectedSubscription } from '../hooks/useSubscriptionsUsingInstrument';

export type SubscriptionCheckStatus = 'checking' | 'clear' | 'failed' | 'affected';

interface DeleteSubscriptionWarningProps {
  status: SubscriptionCheckStatus;
  subscriptions: AffectedSubscription[];
  onManageSubscriptions: () => void;
}

const MAX_LISTED = 5;

function DeleteSubscriptionWarning({
  status,
  subscriptions,
  onManageSubscriptions,
}: DeleteSubscriptionWarningProps) {
  const b3Lang = useB3Lang();

  if (status === 'clear') {
    return null;
  }
  if (status === 'checking') {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {b3Lang('paymentMethods.deleteDialog.subscriptions.checking')}
      </Typography>
    );
  }
  if (status === 'failed') {
    // The warning is advisory: say we could not check, and leave the decision to the customer.
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        {b3Lang('paymentMethods.deleteDialog.subscriptions.checkFailed')}
      </Alert>
    );
  }

  // Ordergroove reports frequency in days; whole weeks read better (spec §5.4).
  const frequency = (days: number) =>
    days % 7 === 0
      ? b3Lang('paymentMethods.deleteDialog.subscriptions.everyWeeks', { count: days / 7 })
      : b3Lang('paymentMethods.deleteDialog.subscriptions.everyDays', { count: days });

  const listed = subscriptions.slice(0, MAX_LISTED);
  const remaining = subscriptions.length - listed.length;

  return (
    <Alert severity="warning" sx={{ mt: 2 }}>
      <Typography variant="body2">
        {b3Lang('paymentMethods.deleteDialog.subscriptions.title', { count: subscriptions.length })}
      </Typography>
      <Box component="ul" sx={{ pl: 2, my: 1 }}>
        {listed.map((subscription) => (
          <li key={subscription.publicId}>
            {subscription.productName
              ? b3Lang('paymentMethods.deleteDialog.subscriptions.item', {
                  product: subscription.productName,
                  frequency: frequency(subscription.frequencyDays),
                })
              : b3Lang('paymentMethods.deleteDialog.subscriptions.itemUnnamed', {
                  frequency: frequency(subscription.frequencyDays),
                })}
          </li>
        ))}
        {remaining > 0 && (
          <li>{b3Lang('paymentMethods.deleteDialog.subscriptions.more', { count: remaining })}</li>
        )}
      </Box>
      <Typography variant="body2">
        {b3Lang('paymentMethods.deleteDialog.subscriptions.consequence')}
      </Typography>
      {/* A button-styled link: internal router navigation, never a plain anchor inside the ThemeFrame. */}
      <Link component="button" type="button" variant="body2" onClick={onManageSubscriptions} sx={{ mt: 1 }}>
        {b3Lang('paymentMethods.deleteDialog.subscriptions.manage')}
      </Link>
    </Alert>
  );
}

export default DeleteSubscriptionWarning;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test --run src/pages/PaymentMethods/components/DeleteSubscriptionWarning.test.tsx`
Expected: PASS (5 tests). `yarn tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lang/locales/en.json src/pages/PaymentMethods/hooks/useSubscriptionsUsingInstrument.ts src/pages/PaymentMethods/components/DeleteSubscriptionWarning.tsx src/pages/PaymentMethods/components/DeleteSubscriptionWarning.test.tsx
git commit -m "feat: B2B-0000 Add the delete-dialog subscription warning component and copy" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The `useSubscriptionsUsingInstrument` hook

**Files:**
- Modify: `src/pages/PaymentMethods/hooks/useSubscriptionsUsingInstrument.ts` (add the hook below the type from Task 4)
- Test: `src/pages/PaymentMethods/hooks/useSubscriptionsUsingInstrument.test.tsx`

**Interfaces:**
- Consumes: `getSubscriptionsUsingToken`, `getProduct`, `OgSubscription` from `@/shared/service/ordergroove` (Task 3); `AffectedSubscription` (Task 4).
- Produces: `useSubscriptionsUsingInstrument(customerId: number, token: string | undefined, enabled: boolean)` → the react-query result whose `data` is `AffectedSubscription[]`.

- [ ] **Step 1: Write the failing test**

`src/pages/PaymentMethods/hooks/useSubscriptionsUsingInstrument.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren } from 'react';

import {
  buildOgPaymentWith,
  buildOgProductWith,
  buildOgSubscriptionWith,
  http,
  HttpResponse,
  renderHook,
  startMockServer,
  waitFor,
} from 'tests/test-utils';

import { useSubscriptionsUsingInstrument } from './useSubscriptionsUsingInstrument';

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const page = <T>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

function Wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );
}
const wrapper = Wrapper;

beforeEach(() => {
  window.BC_CONTEXT = {
    subscriptions: { merchantId: 'merchant-public-id', authEndpoint, appClientId: 'ssw-app-client-id' },
  };
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')),
    http.post(authEndpoint, () =>
      HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 }),
    ),
  );
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('does nothing while disabled or without a token', () => {
  const requests = vi.fn();
  server.use(
    http.get(`${ogBase}/payments/`, () => {
      requests();

      return HttpResponse.json(page([]));
    }),
  );

  const disabled = renderHook(() => useSubscriptionsUsingInstrument(1, 'tok', false), { wrapper });
  const noToken = renderHook(() => useSubscriptionsUsingInstrument(1, undefined, true), { wrapper });

  expect(disabled.result.current.fetchStatus).toBe('idle');
  expect(noToken.result.current.fetchStatus).toBe('idle');
  expect(requests).not.toHaveBeenCalled();
});

it('resolves product names for the affected subscriptions', async () => {
  const payment = buildOgPaymentWith({ token_id: 'tok' });
  const bags = buildOgSubscriptionWith({ payment: payment.public_id, product: '9537_12118', frequency_days: 28 });
  const tissue = buildOgSubscriptionWith({ payment: payment.public_id, product: '7674_9534', frequency_days: 14 });

  server.use(
    http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([payment]))),
    http.get(`${ogBase}/subscriptions/`, () => HttpResponse.json(page([bags, tissue]))),
    http.get(`${ogBase}/products/9537_12118/`, () =>
      HttpResponse.json(buildOgProductWith({ name: 'Kraft Paper Shopping Bags' })),
    ),
    http.get(`${ogBase}/products/7674_9534/`, () =>
      HttpResponse.json(buildOgProductWith({ name: 'Tissue Paper' })),
    ),
  );

  const { result } = renderHook(() => useSubscriptionsUsingInstrument(80591, 'tok', true), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual([
    { publicId: bags.public_id, productName: 'Kraft Paper Shopping Bags', frequencyDays: 28 },
    { publicId: tissue.public_id, productName: 'Tissue Paper', frequencyDays: 14 },
  ]);
});

it('keeps the subscription with a null name when its product lookup fails', async () => {
  const payment = buildOgPaymentWith({ token_id: 'tok' });
  const subscription = buildOgSubscriptionWith({ payment: payment.public_id, product: '1_2' });

  server.use(
    http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([payment]))),
    http.get(`${ogBase}/subscriptions/`, () => HttpResponse.json(page([subscription]))),
    http.get(`${ogBase}/products/1_2/`, () => new HttpResponse(null, { status: 500 })),
  );

  const { result } = renderHook(() => useSubscriptionsUsingInstrument(80591, 'tok', true), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual([
    { publicId: subscription.public_id, productName: null, frequencyDays: 28 },
  ]);
});

it('surfaces an Ordergroove failure as an error', async () => {
  server.use(http.get(`${ogBase}/payments/`, () => new HttpResponse(null, { status: 500 })));

  const { result } = renderHook(() => useSubscriptionsUsingInstrument(80591, 'tok', true), { wrapper });

  await waitFor(() => expect(result.current.isError).toBe(true));
});
```

(`renderHook` comes from `@testing-library/react`, re-exported by `tests/test-utils`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn test --run src/pages/PaymentMethods/hooks/useSubscriptionsUsingInstrument.test.tsx`
Expected: FAIL — `useSubscriptionsUsingInstrument` is not exported.

- [ ] **Step 3: Implement the hook** — append to `src/pages/PaymentMethods/hooks/useSubscriptionsUsingInstrument.ts`:

```ts
import { useQuery } from '@tanstack/react-query';

import { getProduct, getSubscriptionsUsingToken, OgSubscription } from '@/shared/service/ordergroove';
```

(put the imports at the top of the file, above the interface) and then below the interface:

```ts
// Product names are best-effort (spec §6.3): a failed lookup keeps the subscription in the list
// with productName null rather than hiding a real warning behind a cosmetic failure.
const describeSubscriptions = async (
  customerId: string,
  subscriptions: OgSubscription[],
): Promise<AffectedSubscription[]> => {
  const productIds = [...new Set(subscriptions.map((subscription) => subscription.product))];
  const names = new Map<string, string | null>(
    await Promise.all(
      productIds.map(
        async (productId): Promise<[string, string | null]> => [
          productId,
          await getProduct(customerId, productId)
            .then((product) => product.name)
            .catch(() => null),
        ],
      ),
    ),
  );

  return subscriptions.map((subscription) => ({
    publicId: subscription.public_id,
    productName: names.get(subscription.product) ?? null,
    frequencyDays: subscription.frequency_days,
  }));
};

export const useSubscriptionsUsingInstrument = (
  customerId: number,
  token: string | undefined,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ['subscriptionsUsingToken', customerId, token],
    queryFn: async () => {
      if (!token) {
        return [];
      }
      const id = String(customerId);

      return describeSubscriptions(id, await getSubscriptionsUsingToken(id, token));
    },
    enabled: enabled && Boolean(token),
    // The check is advisory and already has its own 5s timeout; a retry would only prolong the wait.
    retry: false,
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test --run src/pages/PaymentMethods/hooks/useSubscriptionsUsingInstrument.test.tsx`
Expected: PASS (4 tests). `yarn tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PaymentMethods/hooks/useSubscriptionsUsingInstrument.ts src/pages/PaymentMethods/hooks/useSubscriptionsUsingInstrument.test.tsx
git commit -m "feat: B2B-0000 Look up subscriptions charged to a stored instrument" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Wire the warning into the delete dialog

**Files:**
- Modify: `src/pages/PaymentMethods/index.tsx`
- Test: `src/pages/PaymentMethods/index.test.tsx` (append a `describe` block at the end)

**Interfaces:**
- Consumes: `isSubscriptionsAvailable` (Task 3 barrel), `useSubscriptionsUsingInstrument` (Task 5), `DeleteSubscriptionWarning` + `SubscriptionCheckStatus` (Task 4), `B3Dialog`'s existing `disabledSaveBtn` prop, `useNavigate` from `react-router-dom`.

- [ ] **Step 1: Write the failing tests** — append to `src/pages/PaymentMethods/index.test.tsx`. Add `buildOgPaymentWith, buildOgProductWith, buildOgSubscriptionWith` to the existing `tests/test-utils` import.

```tsx
describe('subscription warning in the delete dialog', () => {
  const ogBase = 'https://restapi.ordergroove.com';
  const authEndpoint = `${apiBase}/products/productclient/ordergroove-auth`;

  const page = <T>(results: T[], next: string | null = null) => ({
    count: results.length,
    next,
    previous: null,
    results,
  });

  const configureSubscriptions = () => {
    window.BC_CONTEXT = {
      paymentMethods: { apiBase, appClientId },
      subscriptions: { merchantId: 'merchant-public-id', authEndpoint, appClientId },
    };
  };

  const mockOgAuth = () => {
    const mints = vi.fn();
    server.use(
      http.post(authEndpoint, () => {
        mints();

        return HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 });
      }),
    );

    return mints;
  };

  // Every test renders a distinct customer so the module-level header cache cannot leak between tests.
  const renderPage = () =>
    renderWithProviders(<PaymentMethods />, {
      preloadedState: {
        company: buildCompanyStateWith({
          customer: { id: faker.number.int({ min: 1, max: 1_000_000 }) },
        }),
      },
    });

  const openDeleteDialog = async (user: ReturnType<typeof renderWithProviders>['user']) => {
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await screen.findByText(/will be permanently removed from your saved cards/);
  };

  const confirmButton = () => {
    const buttons = screen.getAllByRole('button', { name: 'Delete' });

    return buttons[buttons.length - 1];
  };

  it('leaves the dialog untouched and calls nothing when the host has not configured subscriptions', async () => {
    const ogRequests = vi.fn();
    const authRequests = vi.fn();

    mockJwt();
    mockList([buildStoredInstrumentWith({ brand: 'VISA', last4: '4242' })]);
    server.use(
      http.get(`${ogBase}/*`, () => {
        ogRequests();

        return HttpResponse.json(page([]));
      }),
      http.post(authEndpoint, () => {
        authRequests();

        return HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 });
      }),
    );

    const { user } = renderPage();
    await openDeleteDialog(user);

    expect(confirmButton()).toBeEnabled();
    expect(screen.queryByText('Checking your subscriptions…')).not.toBeInTheDocument();
    expect(screen.queryByText(/active subscription/)).not.toBeInTheDocument();
    expect(ogRequests).not.toHaveBeenCalled();
    expect(authRequests).not.toHaveBeenCalled();
  });

  it('shows no warning for a card that no subscription uses', async () => {
    const card = buildStoredInstrumentWith({ brand: 'VISA', last4: '4242' });

    configureSubscriptions();
    mockJwt();
    mockList([card]);
    mockOgAuth();
    server.use(http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([buildOgPaymentWith()]))));

    const { user } = renderPage();
    await openDeleteDialog(user);

    await waitFor(() => expect(confirmButton()).toBeEnabled());
    expect(screen.queryByText(/active subscription/)).not.toBeInTheDocument();
    expect(screen.queryByText('Checking your subscriptions…')).not.toBeInTheDocument();
  });

  it('lists the affected subscriptions across pages and disables confirm until the check resolves', async () => {
    const card = buildStoredInstrumentWith({ brand: 'VISA', last4: '1111' });
    const payment = buildOgPaymentWith({ token_id: card.token });
    const bags = Array.from({ length: 12 }, () =>
      buildOgSubscriptionWith({ payment: payment.public_id, product: '9537_12118', frequency_days: 28 }),
    );
    const tissue = Array.from({ length: 2 }, () =>
      buildOgSubscriptionWith({ payment: payment.public_id, product: '7674_9534', frequency_days: 14 }),
    );

    configureSubscriptions();
    mockJwt();
    mockList([card]);
    mockOgAuth();
    server.use(
      // A short delay keeps the "checking" state observable before the chain resolves.
      http.get(`${ogBase}/payments/`, async () => {
        await delay(100);

        return HttpResponse.json(page([payment]));
      }),
      http.get(`${ogBase}/subscriptions/`, ({ request }) =>
        new URL(request.url).searchParams.get('page') === '2'
          ? HttpResponse.json(page(tissue))
          : HttpResponse.json(page(bags, `${ogBase}/subscriptions/?page=2`)),
      ),
      http.get(`${ogBase}/products/9537_12118/`, () =>
        HttpResponse.json(buildOgProductWith({ name: 'Kraft Paper Shopping Bags' })),
      ),
      http.get(`${ogBase}/products/7674_9534/`, () =>
        HttpResponse.json(buildOgProductWith({ name: 'Tissue Paper' })),
      ),
    );

    const { user } = renderPage();
    await openDeleteDialog(user);

    expect(screen.getByText('Checking your subscriptions…')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();

    expect(await screen.findByText('This card is used by 14 active subscriptions:')).toBeInTheDocument();
    expect(screen.getAllByText('Kraft Paper Shopping Bags — every 4 weeks')).toHaveLength(5);
    expect(screen.getByText('and 9 more')).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });

  it('falls back to a count-only list when a product lookup fails', async () => {
    const card = buildStoredInstrumentWith();
    const payment = buildOgPaymentWith({ token_id: card.token });

    configureSubscriptions();
    mockJwt();
    mockList([card]);
    mockOgAuth();
    server.use(
      http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([payment]))),
      http.get(`${ogBase}/subscriptions/`, () =>
        HttpResponse.json(page([buildOgSubscriptionWith({ payment: payment.public_id, frequency_days: 10 })])),
      ),
      http.get(`${ogBase}/products/*`, () => new HttpResponse(null, { status: 500 })),
    );

    const { user } = renderPage();
    await openDeleteDialog(user);

    expect(await screen.findByText('This card is used by 1 active subscription:')).toBeInTheDocument();
    expect(screen.getByText('Subscription — every 10 days')).toBeInTheDocument();
  });

  it('discloses a failed check and still allows deletion', async () => {
    configureSubscriptions();
    mockJwt();
    mockList([buildStoredInstrumentWith()]);
    mockOgAuth();
    server.use(
      http.get(`${ogBase}/payments/`, () =>
        HttpResponse.json({ detail: 'Authentication Failed' }, { status: 403 }),
      ),
    );

    const { user } = renderPage();
    await openDeleteDialog(user);

    expect(
      await screen.findByText("We couldn't check whether any subscriptions use this card."),
    ).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });

  it('discloses when the signature cannot be minted', async () => {
    configureSubscriptions();
    mockJwt();
    mockList([buildStoredInstrumentWith()]);
    server.use(http.post(authEndpoint, () => new HttpResponse(null, { status: 500 })));

    const { user } = renderPage();
    await openDeleteDialog(user);

    expect(
      await screen.findByText("We couldn't check whether any subscriptions use this card."),
    ).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });

  it('mints the signature once across two dialog opens', async () => {
    configureSubscriptions();
    mockJwt();
    mockList([buildStoredInstrumentWith()]);
    const mints = mockOgAuth();
    server.use(http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([]))));

    const { user } = renderPage();
    await openDeleteDialog(user);
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await openDeleteDialog(user);
    await waitFor(() => expect(confirmButton()).toBeEnabled());

    expect(mints).toHaveBeenCalledTimes(1);
  });

  it('navigates to the subscriptions page from the warning', async () => {
    const card = buildStoredInstrumentWith();
    const payment = buildOgPaymentWith({ token_id: card.token });

    configureSubscriptions();
    mockJwt();
    mockList([card]);
    mockOgAuth();
    server.use(
      http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([payment]))),
      http.get(`${ogBase}/subscriptions/`, () =>
        HttpResponse.json(page([buildOgSubscriptionWith({ payment: payment.public_id })])),
      ),
      http.get(`${ogBase}/products/*`, () => HttpResponse.json(buildOgProductWith())),
    );

    const { user, navigation } = renderPage();
    await openDeleteDialog(user);

    await user.click(await screen.findByRole('button', { name: 'Manage subscriptions' }));

    await waitFor(() => expect(navigation).toHaveBeenCalledWith('/manage-subscriptions'));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `yarn test --run src/pages/PaymentMethods/index.test.tsx -t "subscription warning"`
Expected: the "untouched" test PASSES (today's behaviour) and every other new test FAILS (no "Checking…" text, confirm never disabled, no warning). If the "untouched" test fails, fix the test, not the page.

- [ ] **Step 3: Wire the page** — edit `src/pages/PaymentMethods/index.tsx`:

Add to the imports (externals group gains `useNavigate`; `@/` group gains the barrel; relative group gains the component and hook):

```tsx
import { useNavigate } from 'react-router-dom';

import { isSubscriptionsAvailable } from '@/shared/service/ordergroove';

import DeleteSubscriptionWarning, {
  SubscriptionCheckStatus,
} from './components/DeleteSubscriptionWarning';
import { useSubscriptionsUsingInstrument } from './hooks/useSubscriptionsUsingInstrument';
```

Add this helper above the component (a function rather than a nested ternary):

```tsx
// Four dialog states (spec §6.3). `data` present means resolved even while a background refetch runs.
const deriveSubscriptionCheckStatus = (
  enabled: boolean,
  query: ReturnType<typeof useSubscriptionsUsingInstrument>,
): SubscriptionCheckStatus => {
  if (!enabled) {
    return 'clear';
  }
  if (query.isPending) {
    return 'checking';
  }
  if (query.isError) {
    return 'failed';
  }

  return query.data.length > 0 ? 'affected' : 'clear';
};
```

Inside `PaymentMethods`, after the `pendingDelete` state and the `customerId` selector:

```tsx
  const navigate = useNavigate();
  // Only while the dialog is open: the check is per card and the page shows no subscription data.
  const isSubscriptionCheckEnabled = isSubscriptionsAvailable() && Boolean(pendingDelete);
  const affectedSubscriptions = useSubscriptionsUsingInstrument(
    customerId,
    pendingDelete?.token,
    isSubscriptionCheckEnabled,
  );
  const subscriptionCheckStatus = deriveSubscriptionCheckStatus(
    isSubscriptionCheckEnabled,
    affectedSubscriptions,
  );
```

On the delete `B3Dialog`, add one prop:

```tsx
          disabledSaveBtn={subscriptionCheckStatus === 'checking'}
```

and inside its `<Box>` body, after the existing `{pendingDelete && b3Lang(...)}` expression:

```tsx
            <DeleteSubscriptionWarning
              status={subscriptionCheckStatus}
              subscriptions={affectedSubscriptions.data ?? []}
              onManageSubscriptions={() => navigate('/manage-subscriptions')}
            />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test --run src/pages/PaymentMethods/index.test.tsx`
Expected: PASS — all pre-existing PaymentMethods tests plus the 8 new ones. `yarn tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PaymentMethods/index.tsx src/pages/PaymentMethods/index.test.tsx
git commit -m "feat: B2B-0000 Warn about subscriptions charged to a card before deleting it" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Full verification gate

**Files:** none new.

- [ ] **Step 1: Type-check and lint**

Run: `yarn tsc --noEmit && yarn lint`
Expected: `tsc` clean; `lint:dependencies` clean (the barrel now has a consumer); `lint:eslint` clean on every file you touched (pre-existing warnings elsewhere are baseline — compare against `git stash`-free `dev` if unsure); `lint:knip` reports **no** unused exports/files under `src/shared/service/ordergroove/`, `src/pages/PaymentMethods/`, or `tests/ordergrooveBuilders/`. If knip flags an export you added, remove the export rather than adding a consumer.

- [ ] **Step 2: Full test run against the baseline**

Run: `yarn test --run 2>&1 | tail -30`
Expected: only the failures you recorded in "Before you start" (if any); every file under `src/shared/service/ordergroove/` and `src/pages/PaymentMethods/` green.

- [ ] **Step 3: Production build**

Run: `yarn build`
Expected: succeeds; no new large chunk (the module is a few KB and adds no dependency).

- [ ] **Step 4: Log the outcome** — via the squad coordinator (project `b2b-buyer-portal`, category `other`, tags `ordergroove,subscriptions,payment-methods`): "Phase 1 delete warning implemented on `<branch>`; commits `<first>..<last>`; spec §6 delivered; live check status: <done | pending Task 8>."

---

### Task 8: Live verification on sandbox (manual)

Phase 1 is host-gated, so the sandbox shows nothing until the theme emits the config. This task is a checklist, not code in this repo.

- [ ] **Step 1: Theme prerequisite (stencil repo)** — next to the existing `window.BC_CONTEXT.paymentMethods = {...}` block in the theme's head script, emit:

```js
window.BC_CONTEXT.subscriptions = {
    merchantId: '{{theme_settings.ordergroove_merchant_id}}',
    authEndpoint: '{{theme_settings.ordergroove_api_endpoint}}',
    appClientId: 'cez294ivwtwiq0wjdo0hx9kbgjzaszl'
};
```

with a new `ordergroove_merchant_id` theme setting holding the Ordergroove "Your Merchant ID" (from `rc3.ordergroove.com/keys/`), and `ordergroove_api_endpoint` the existing setting (`https://test-onlineservices.storesupply.com/products/productclient/ordergroove-auth` on sandbox). Until the theme change is deployed, inject the same object from the DevTools console before opening the dialog.

- [ ] **Step 2: Deploy or intercept the bundle** — either deploy `dist/` to the sandbox's `/content/b2bBuyerPortal/dist`, or route that prefix to your local build (memory note "Sandbox portal bundle path").

- [ ] **Step 3: Check the fixture** — sign in as customer 80591, open `/#/payment-methods`, click **Delete** on the **default** card (VISA •1111):
  - "Checking your subscriptions…" appears and the dialog's **Delete** is disabled, then
  - `This card is used by 14 active subscriptions:` with five `Large (Vogue) - Kraft Paper Shopping Bags … — every 4 weeks` lines (two distinct products across the 14), `and 9 more`, the consequence sentence, and a **Manage subscriptions** link that navigates to `/#/manage-subscriptions`.
  - Network tab: one `POST …/ordergroove-auth`, `GET restapi.ordergroove.com/payments/`, two `GET …/subscriptions/` pages, two `GET …/products/…/`. **Cancel** — do not delete the card.
- [ ] **Step 4: Check a clean card** — **Delete** on either of the other two cards → no warning line, confirm enabled immediately after the check.
- [ ] **Step 5: Check the gate** — in the console `delete window.BC_CONTEXT.subscriptions`, reload the route, open the dialog: identical to today, and **zero** requests to `restapi.ordergroove.com` or `…/ordergroove-auth`.
- [ ] **Step 6: Record** — note the result in the squad decision log (Task 7 step 4) and, if anything differed from the expectations above, in `.memory/b2b-buyer-portal--ordergroove-custom-msp-architecture.md`.
