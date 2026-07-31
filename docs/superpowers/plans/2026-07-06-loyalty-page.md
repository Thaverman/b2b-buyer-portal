# Loyalty Page (Influence.io) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the gated `/#/loyalty` buyer-portal page per the approved spec `docs/superpowers/specs/2026-07-06-loyalty-page-design.md`, built on the Influence.io Launcher API with a theme-set `window.BC_CONTEXT.loyalty` gate.

**Architecture:** Matroska page at `src/pages/Loyalty/` owning a raw-`fetch` API client (`api.ts`). Customer-scoped Launcher calls authenticate with an HMAC digest fetched once from the SSW backend (Current Customer JWT auth); shop-level calls use only the public shop key. react-query v5 for all server state; URL search param for tab state; route gated by an inline predicate in `routeList.ts`. The `/payment-methods` page (`src/pages/PaymentMethods/`) is the template for every pattern used here — when in doubt, read it.

**Tech Stack:** React 18, TypeScript, MUI, @tanstack/react-query v5, react-router v6 (HashRouter; MemoryRouter in tests), Vitest + Testing Library + MSW + faker builders.

## Global Constraints

- **Run every command from `apps/storefront/`** (repo is a Turborepo monorepo; root commands only delegate `dev`/`test`).
- **Backend dependency:** the SSW digest endpoint (`POST {apiBase}/loyalty/digest`) does not exist yet — MSW mocks stand in for it and for the Launcher API in every test. Nothing in this plan calls a live service.
- **Commit format** (enforced): `type: B2B-0000 Description` — replace `B2B-0000` with the real JIRA ticket in every commit below before running it.
- **Test data:** builders + faker only; hardcoded test data is a review blocker.
- **No new violations** of the disabled-ESLint-rule list: no `any`, no `console.*` (use `b2bLogger`), no props spreading, destructure props.
- **Imports:** `@/` and `tests/` aliases only; `lodash-es` only; named `@mui/icons-material` imports.
- **State rules:** no new Redux slice/Context/localStorage; Redux read only at the top of `index.tsx` via `useAppSelector`, passed down as props.
- **Strings:** every user-facing string through `useB3Lang()` with a key in `src/lib/lang/locales/en.json`.
- **Red baseline:** the `dev` branch has pre-existing test failures. Never expect the full suite green; verify with scoped runs (`yarn test --run src/pages/Loyalty`) plus `yarn tsc --noEmit` and `yarn lint:eslint`, and diff any broader failures against a pre-change baseline.
- All Influence.io response enums (`earnType`, `templateName`, `status`) are **undocumented strings** — never write an exhaustive switch on them; always fall back gracefully.

---

## File map (end state)

```
apps/storefront/src/
├── index.d.ts                          # MODIFY: add BC_CONTEXT.loyalty type
├── shared/
│   ├── routeList.ts                    # MODIFY: route entry + inline gate
│   └── routes/index.tsx                # MODIFY: lazy import + routesMap entry
├── lib/lang/locales/en.json            # MODIFY: nav key + loyalty.* strings
└── pages/Loyalty/
    ├── index.tsx                       # page shell: gate, queries, hero, tabs
    ├── api.ts                          # config, LoyaltyError, digest + Launcher clients, DTOs
    ├── api.test.ts
    ├── index.test.tsx
    ├── index.mobile.test.tsx
    ├── index.platform.test.tsx
    └── components/
        ├── LoyaltyHero.tsx
        ├── OverviewTab.tsx
        ├── EarnPointsTab.tsx
        ├── RewardsTab.tsx
        ├── TiersTab.tsx
        └── HistoryTab.tsx
```

---

### Task 1: Gate, route registration, and page shell

**Files:**
- Modify: `apps/storefront/src/index.d.ts` (BC_CONTEXT block, ~line 61)
- Modify: `apps/storefront/src/shared/routeList.ts` (route entry after `/payment-methods` at ~line 234; gate predicate beside the payment-methods gate at ~line 279)
- Modify: `apps/storefront/src/shared/routes/index.tsx` (lazy import ~line 35, routesMap ~line 66)
- Modify: `apps/storefront/src/lib/lang/locales/en.json`
- Create: `apps/storefront/src/pages/Loyalty/api.ts` (config + availability only)
- Create: `apps/storefront/src/pages/Loyalty/index.tsx` (shell)
- Test: `apps/storefront/src/pages/Loyalty/index.test.tsx`, `apps/storefront/src/pages/Loyalty/index.platform.test.tsx`

**Interfaces:**
- Consumes: `platform` from `@/utils/basicConfig`; `accountSettingPermissions` from `legacyPermissions` (already destructured in `routeList.ts:37-53`).
- Produces (later tasks rely on these exact names):
  - `interface LoyaltyConfig { shopKey: string; apiBase: string; appClientId: string }` (module-internal — knip fails on unused exports, so `api.ts` only exports what other files import)
  - `getLoyaltyConfig(): LoyaltyConfig | undefined` (module-internal)
  - `isLoyaltyAvailable(): boolean` (exported — used by `index.tsx`)
  - Test convention: `window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } }` in `beforeEach`, `delete window.BC_CONTEXT` in `afterEach`.

- [ ] **Step 1: Write the failing tests**

Create `apps/storefront/src/pages/Loyalty/index.test.tsx`:

```tsx
import {
  buildB2BFeaturesStateWith,
  renderWithProviders,
  screen,
  startMockServer,
} from 'tests/test-utils';

import Loyalty from '.';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/utils/b3Logger');

startMockServer();

const shopKey = 'store-key';
const apiBase = 'https://ssw.example.com/customers';
const appClientId = 'ssw-app-client-id';

beforeEach(() => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('shows the unavailable state when BC_CONTEXT is not configured', () => {
  delete window.BC_CONTEXT;

  renderWithProviders(<Loyalty />);

  expect(screen.getByText('Rewards are not available.')).toBeInTheDocument();
});

it('shows the unavailable state when the loyalty config is incomplete', () => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId: '' } };

  renderWithProviders(<Loyalty />);

  expect(screen.getByText('Rewards are not available.')).toBeInTheDocument();
});

it('shows the unavailable state while a sales rep is masquerading', () => {
  renderWithProviders(<Loyalty />, {
    preloadedState: {
      b2bFeatures: buildB2BFeaturesStateWith({ masqueradeCompany: { isAgenting: true } }),
    },
  });

  expect(screen.getByText('Rewards are not available.')).toBeInTheDocument();
});
```

Create `apps/storefront/src/pages/Loyalty/index.platform.test.tsx`:

```tsx
import { renderWithProviders, screen } from 'tests/test-utils';

import Loyalty from '.';

vi.mock('@/utils/basicConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/basicConfig')>()),
  platform: 'catalyst',
}));

beforeEach(() => {
  window.BC_CONTEXT = {
    loyalty: {
      shopKey: 'store-key',
      apiBase: 'https://ssw.example.com/customers',
      appClientId: 'ssw-app-client-id',
    },
  };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('shows the unavailable state on non-bigcommerce platforms even when configured', () => {
  renderWithProviders(<Loyalty />);

  expect(screen.getByText('Rewards are not available.')).toBeInTheDocument();
});
```

Note: the loyalty type is added to `BC_CONTEXT` in Step 3; until then these files won't compile — that's the expected failure mode.

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty`
Expected: FAIL — cannot resolve `.` (no `index.tsx`) / type errors.

- [ ] **Step 3: Add the BC_CONTEXT.loyalty type**

In `apps/storefront/src/index.d.ts`, replace the existing `BC_CONTEXT` block:

```ts
    /** BigCommerce storefront context set by the host project; `storeSuffix` gates order-id obfuscation. */
    BC_CONTEXT?: {
      storeSuffix?: string;
      /** Gates the /payment-methods page; absent = feature off. */
      paymentMethods?: {
        apiBase: string;
        appClientId: string;
      };
      /** Gates the /loyalty page; absent (or any field missing) = feature off. */
      loyalty?: {
        /** Influence.io shop key (public). */
        shopKey: string;
        /** SSW digest-endpoint host, e.g. https://<gateway>/customers */
        apiBase: string;
        /** SSW app client id used to mint the Current Customer JWT. */
        appClientId: string;
      };
    };
```

- [ ] **Step 4: Create the minimal api.ts (config + availability)**

Create `apps/storefront/src/pages/Loyalty/api.ts`:

```ts
import { platform } from '@/utils/basicConfig';

// Module-internal: knip fails the build on unused exports, so this file only
// exports what other files actually import.
interface LoyaltyConfig {
  shopKey: string;
  apiBase: string;
  appClientId: string;
}

const getLoyaltyConfig = (): LoyaltyConfig | undefined => {
  const config = window.BC_CONTEXT?.loyalty;
  if (!config?.shopKey || !config?.apiBase || !config?.appClientId) {
    return undefined;
  }
  return config;
};

// Stencil-only: getCurrentCustomerJWT early-returns undefined on every other platform,
// which would misrender as "session expired"; gate the feature out instead.
export const isLoyaltyAvailable = () => platform === 'bigcommerce' && Boolean(getLoyaltyConfig());
```

- [ ] **Step 5: Create the page shell**

Create `apps/storefront/src/pages/Loyalty/index.tsx`:

```tsx
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { useAppSelector } from '@/store';

import { isLoyaltyAvailable } from './api';

function Loyalty() {
  const b3Lang = useB3Lang();
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  // The digest identifies the logged-in customer, so a masquerading rep must not see points here.
  const isAvailable = isLoyaltyAvailable() && !isAgenting;

  if (!isAvailable) {
    return (
      <Box>
        <Typography sx={{ mt: 2 }}>{b3Lang('loyalty.unavailable')}</Typography>
      </Box>
    );
  }

  return <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%' }} />;
}

export default Loyalty;
```

- [ ] **Step 6: Register the route**

In `apps/storefront/src/shared/routes/index.tsx`, add the lazy import in the alphabetized block (after `Login`, ~line 32):

```ts
const Loyalty = lazy(() => import('@/pages/Loyalty'));
```

and add to `routesMap` (after `'/payment-methods': PaymentMethods,`):

```ts
  '/loyalty': Loyalty,
```

In `apps/storefront/src/shared/routeList.ts`, add the route entry immediately after the `/payment-methods` entry (~line 234):

```ts
  {
    path: '/loyalty',
    name: 'Rewards',
    wsKey: 'loyalty',
    isMenuItem: true,
    permissions: accountSettingPermissions,
    isTokenLogin: true,
    idLang: 'global.navMenu.loyalty',
  },
```

and add the gate inside `getAllowedRoutesWithoutComponent`, immediately after the `/payment-methods` predicate (after its closing `}` at ~line 286):

```ts
    // /loyalty is Stencil-only, host-configured, and hidden while agenting —
    // the loyalty digest identifies the logged-in rep, not the masqueraded buyer.
    if (
      path === '/loyalty' &&
      (platform !== 'bigcommerce' || !window.BC_CONTEXT?.loyalty || isAgenting)
    ) {
      return false;
    }
```

(Do NOT import anything from `@/pages/Loyalty` in `routeList.ts` — the inline `window` check keeps `shared/` from depending on `pages/` and keeps the page chunk lazy.)

- [ ] **Step 7: Add the i18n keys**

In `apps/storefront/src/lib/lang/locales/en.json`, after `"global.navMenu.paymentMethods": "Payment methods",` add:

```json
  "global.navMenu.loyalty": "Rewards",
```

and start the loyalty block immediately after the `paymentMethods.*` block (mind the JSON commas — if `"paymentMethods.deleted"` has no trailing comma, add one):

```json
  "loyalty.unavailable": "Rewards are not available."
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty`
Expected: PASS (4 tests).

Run: `yarn tsc --noEmit`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/storefront/src/index.d.ts apps/storefront/src/shared/routeList.ts apps/storefront/src/shared/routes/index.tsx apps/storefront/src/lib/lang/locales/en.json apps/storefront/src/pages/Loyalty
git commit -m "feat: B2B-0000 Add gated /loyalty route and page shell"
```

---

### Task 2: Digest client and error taxonomy

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/api.ts`
- Test: `apps/storefront/src/pages/Loyalty/api.test.ts` (create)

**Interfaces:**
- Consumes: `getCurrentCustomerJWT` from `@/shared/service/bc` (signature: `(appClientId: string) => Promise<string | undefined>`, throws on some failures — always `.catch(() => undefined)`); `b2bLogger` default export from `@/utils/b3Logger`.
- Produces:
  - `class LoyaltyError extends Error { kind: 'sessionExpired' | 'notEnrolled' | 'misconfigured' | 'rateLimited' | 'upstream' }`
  - `interface LoyaltyIdentity { digest: string; customerId: string; email: string }`
  - `getLoyaltyDigest(): Promise<LoyaltyIdentity>`
  - `LAUNCHER_API_BASE = 'https://launcher.api.influence.io/launcher/v1'` (module-internal `const`, NOT exported — tests hardcode absolute URLs)
  - Test helper convention used by every later task: `mockJwt()` + `mockDigest()` as written below.

- [ ] **Step 1: Write the failing tests**

Create `apps/storefront/src/pages/Loyalty/api.test.ts`:

```ts
import { assertQueryParams, http, HttpResponse, startMockServer } from 'tests/test-utils';

import { getLoyaltyDigest, LoyaltyError } from './api';

vi.mock('@/utils/b3Logger');

const { server } = startMockServer();

const shopKey = 'store-key';
const apiBase = 'https://ssw.example.com/customers';
const appClientId = 'ssw-app-client-id';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';
const digestUrl = `${apiBase}/loyalty/digest`;

const identity = { digest: 'digest-abc', customerId: '123', email: 'buyer@example.com' };

beforeEach(() => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

const mockJwt = (jwt = 'fresh-jwt') =>
  server.use(
    http.get(currentJwtUrl, ({ request }) => {
      assertQueryParams(request, { app_client_id: appClientId });

      return HttpResponse.text(jwt);
    }),
  );

describe('getLoyaltyDigest', () => {
  it('posts the fresh jwt and returns the identity', async () => {
    const requestBody = vi.fn();

    mockJwt();
    server.use(
      http.post(digestUrl, async ({ request }) => {
        requestBody(await request.json());

        return HttpResponse.json(identity);
      }),
    );

    const result = await getLoyaltyDigest();

    expect(requestBody).toHaveBeenCalledWith({ jwt: 'fresh-jwt' });
    expect(result).toEqual(identity);
  });

  it('normalizes a PascalCase backend response (.NET serialization)', async () => {
    mockJwt();
    server.use(
      http.post(digestUrl, () =>
        HttpResponse.json({ Digest: 'digest-abc', CustomerId: 123, Email: 'buyer@example.com' }),
      ),
    );

    const result = await getLoyaltyDigest();

    expect(result).toEqual(identity);
  });

  it('maps a failed jwt fetch to sessionExpired', async () => {
    // getCurrentCustomerJWT returns undefined when the response body contains "errors"
    server.use(http.get(currentJwtUrl, () => HttpResponse.text('{"errors":[]}', { status: 401 })));

    const error = await getLoyaltyDigest().catch((e) => e);

    expect(error).toBeInstanceOf(LoyaltyError);
    expect(error.kind).toBe('sessionExpired');
  });

  it.each([
    [401, 'sessionExpired'],
    [429, 'rateLimited'],
    [500, 'upstream'],
    [502, 'upstream'],
  ])('maps digest-endpoint status %i to %s', async (status, kind) => {
    mockJwt();
    server.use(http.post(digestUrl, () => HttpResponse.json({}, { status })));

    const error = await getLoyaltyDigest().catch((e) => e);

    expect(error).toBeInstanceOf(LoyaltyError);
    expect(error.kind).toBe(kind);
  });

  it('maps a network failure to upstream', async () => {
    mockJwt();
    server.use(http.post(digestUrl, () => HttpResponse.error()));

    const error = await getLoyaltyDigest().catch((e) => e);

    expect(error).toBeInstanceOf(LoyaltyError);
    expect(error.kind).toBe('upstream');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty/api.test.ts`
Expected: FAIL — `getLoyaltyDigest`/`LoyaltyError` not exported.

- [ ] **Step 3: Implement**

Add to `apps/storefront/src/pages/Loyalty/api.ts` (imports go at the top of the file):

```ts
import { getCurrentCustomerJWT } from '@/shared/service/bc';
import b2bLogger from '@/utils/b3Logger';
```

```ts
const LAUNCHER_API_BASE = 'https://launcher.api.influence.io/launcher/v1';

type LoyaltyErrorKind = 'sessionExpired' | 'notEnrolled' | 'misconfigured' | 'rateLimited' | 'upstream';

export class LoyaltyError extends Error {
  kind: LoyaltyErrorKind;

  constructor(kind: LoyaltyErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

export interface LoyaltyIdentity {
  digest: string;
  customerId: string;
  email: string;
}

// The SSW backend (.NET/Newtonsoft) may serialize PascalCase keys; accept either casing.
interface RawDigestResponse {
  digest?: string;
  Digest?: string;
  customerId?: number | string;
  CustomerId?: number | string;
  email?: string;
  Email?: string;
}

const requireConfig = (): LoyaltyConfig => {
  const config = getLoyaltyConfig();
  if (!config) {
    throw new Error('Loyalty is not configured on this store');
  }
  return config;
};

export const getLoyaltyDigest = async (): Promise<LoyaltyIdentity> => {
  const config = requireConfig();

  // The Current Customer JWT lives ~15s; fetch a fresh one for every call.
  const jwt = await getCurrentCustomerJWT(config.appClientId).catch(() => undefined);
  if (!jwt) {
    // Also fires when the SSW app is not installed / appClientId is wrong — without this
    // line a pure config error is indistinguishable from a real expired session.
    b2bLogger.error(
      'Loyalty: /customer/current.jwt returned no token — expired storefront session, or BC_CONTEXT.loyalty.appClientId does not belong to an app installed on this store',
    );
    throw new LoyaltyError('sessionExpired');
  }

  let response: Response;
  try {
    response = await fetch(`${config.apiBase}/loyalty/digest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jwt }),
    });
  } catch {
    throw new LoyaltyError('upstream');
  }

  if (response.ok) {
    const raw: RawDigestResponse = await response.json();
    return {
      digest: raw.digest ?? raw.Digest ?? '',
      customerId: String(raw.customerId ?? raw.CustomerId ?? ''),
      email: raw.email ?? raw.Email ?? '',
    };
  }
  if (response.status === 401) {
    b2bLogger.error(
      'Loyalty: digest endpoint rejected the JWT (401) — expired session, or BC_CONTEXT.loyalty.appClientId does not match the backend configuration',
    );
    throw new LoyaltyError('sessionExpired');
  }
  if (response.status === 429) {
    throw new LoyaltyError('rateLimited');
  }
  throw new LoyaltyError('upstream');
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty/api.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/pages/Loyalty/api.ts apps/storefront/src/pages/Loyalty/api.test.ts
git commit -m "feat: B2B-0000 Add loyalty digest client and error taxonomy"
```

---

### Task 3: Launcher customer read + hero + page states

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/api.ts`
- Create: `apps/storefront/src/pages/Loyalty/components/LoyaltyHero.tsx`
- Modify: `apps/storefront/src/pages/Loyalty/index.tsx`
- Modify: `apps/storefront/src/lib/lang/locales/en.json`
- Test: extend `api.test.ts` and `index.test.tsx`

**Interfaces:**
- Consumes: `getLoyaltyDigest`, `LoyaltyError`, `LoyaltyIdentity`, `LAUNCHER_API_BASE`, `requireConfig` (Task 2).
- Produces:
  - `interface LoyaltyCustomer { pointBalance: number; currentLoyaltyTierId: string | null; currentLoyaltyTierProgress: number | null; createdAt: string; followInstagram: boolean; followTikTok: boolean; followTwitter: boolean; likeFacebook: boolean }`
  - `fetchLoyaltyCustomer(identity: LoyaltyIdentity): Promise<LoyaltyCustomer>` — Launcher GET, identity trio + digest as **query params**; 401 → `misconfigured`, 404 → `notEnrolled` (both logged).
  - Module-internal helpers later tasks reuse: `identityParams(config, identity)`, `launcherGet(path, params, notFoundKind)`.
  - `LoyaltyHero` props: `{ companyName: string; memberSince: string | null; tierTitle: string | null; pointBalance: number | null }`.
  - `index.tsx` owns queries `['loyaltyDigest', customerId]` (staleTime Infinity) and `['loyaltyCustomer', customerId]` and passes `identity`/`customer` down.

- [ ] **Step 1: Write the failing api tests**

Append to `apps/storefront/src/pages/Loyalty/api.test.ts` (update the import to add `fetchLoyaltyCustomer`):

```ts
import { fetchLoyaltyCustomer, getLoyaltyDigest, LoyaltyError } from './api';
```

```ts
const launcherCustomerUrl = 'https://launcher.api.influence.io/launcher/v1/customer';

describe('fetchLoyaltyCustomer', () => {
  it('sends the identity trio and digest as query params and normalizes the response', async () => {
    server.use(
      http.get(launcherCustomerUrl, ({ request }) => {
        assertQueryParams(request, {
          shop: shopKey,
          customer_id: identity.customerId,
          customer_email: identity.email,
          digest: identity.digest,
        });

        return HttpResponse.json({
          pointBalance: 2465,
          currentLoyaltyTierId: 'tier-2',
          currentLoyaltyTierProgress: 240,
          createdAt: '2026-01-15T00:00:00.000Z',
          followInstagram: true,
        });
      }),
    );

    const result = await fetchLoyaltyCustomer(identity);

    expect(result).toEqual({
      pointBalance: 2465,
      currentLoyaltyTierId: 'tier-2',
      currentLoyaltyTierProgress: 240,
      createdAt: '2026-01-15T00:00:00.000Z',
      followInstagram: true,
      followTikTok: false,
      followTwitter: false,
      likeFacebook: false,
    });
  });

  it.each([
    [401, 'misconfigured'],
    [404, 'notEnrolled'],
    [429, 'rateLimited'],
    [500, 'upstream'],
  ])('maps Launcher status %i to %s', async (status, kind) => {
    server.use(http.get(launcherCustomerUrl, () => HttpResponse.json({}, { status })));

    const error = await fetchLoyaltyCustomer(identity).catch((e) => e);

    expect(error).toBeInstanceOf(LoyaltyError);
    expect(error.kind).toBe(kind);
  });
});
```

- [ ] **Step 2: Write the failing page tests**

Append to `apps/storefront/src/pages/Loyalty/index.test.tsx` (extend the existing imports from `tests/test-utils` with `buildCompanyStateWith`, `builder`, `faker`, `http`, `HttpResponse`; change `startMockServer()` to `const { server } = startMockServer();`):

```tsx
import { LoyaltyCustomer } from './api';

const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';
const digestUrl = `${apiBase}/loyalty/digest`;
const launcherBase = 'https://launcher.api.influence.io/launcher/v1';

const identity = { digest: 'digest-abc', customerId: '123', email: 'buyer@example.com' };

const buildLoyaltyCustomerWith = builder<LoyaltyCustomer>(() => ({
  pointBalance: faker.number.int({ min: 0, max: 9999 }),
  currentLoyaltyTierId: faker.string.uuid(),
  currentLoyaltyTierProgress: faker.number.int({ min: 0, max: 500 }),
  createdAt: faker.date.past().toISOString(),
  followInstagram: faker.datatype.boolean(),
  followTikTok: faker.datatype.boolean(),
  followTwitter: faker.datatype.boolean(),
  likeFacebook: faker.datatype.boolean(),
}));

const mockJwt = () => server.use(http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')));

const mockDigest = () => server.use(http.post(digestUrl, () => HttpResponse.json(identity)));

const mockCustomer = (customer: LoyaltyCustomer) =>
  server.use(http.get(`${launcherBase}/customer`, () => HttpResponse.json(customer)));

const mockLoyaltyApis = (customer: LoyaltyCustomer) => {
  mockJwt();
  mockDigest();
  mockCustomer(customer);
};

it('renders the hero with company name, member-since, and points balance', async () => {
  mockLoyaltyApis(
    buildLoyaltyCustomerWith({ pointBalance: 2465, createdAt: '2026-01-15T00:00:00.000Z' }),
  );

  renderWithProviders(<Loyalty />, {
    preloadedState: {
      company: buildCompanyStateWith({
        customer: { id: 123 },
        companyInfo: { companyName: 'Riverside Hardware Co.' },
      }),
    },
  });

  expect(await screen.findByText('Riverside Hardware Co.')).toBeInTheDocument();
  expect(screen.getByText('Member since Jan 2026')).toBeInTheDocument();
  expect(screen.getByText('You have 2,465 points')).toBeInTheDocument();
});

it('shows the session-expired state when the jwt fetch fails', async () => {
  server.use(http.get(currentJwtUrl, () => HttpResponse.text('{"errors":[]}', { status: 401 })));

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByText('Your session has expired — please sign in again.'),
  ).toBeInTheDocument();
});

it('shows a generic error without a re-login prompt when the Launcher API rejects the digest', async () => {
  mockJwt();
  mockDigest();
  server.use(http.get(`${launcherBase}/customer`, () => HttpResponse.json({}, { status: 401 })));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText("We couldn't load your rewards.")).toBeInTheDocument();
  expect(
    screen.queryByText('Your session has expired — please sign in again.'),
  ).not.toBeInTheDocument();
});

it('shows the not-enrolled invite when the customer is unknown to Influence.io', async () => {
  mockJwt();
  mockDigest();
  server.use(http.get(`${launcherBase}/customer`, () => HttpResponse.json({}, { status: 404 })));

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByText('Start earning points with your first order.'),
  ).toBeInTheDocument();
});

it('recovers from a load error via the retry button', async () => {
  mockJwt();
  mockDigest();
  server.use(http.get(`${launcherBase}/customer`, () => HttpResponse.json({}, { status: 502 })));

  const { user } = renderWithProviders(<Loyalty />);

  expect(await screen.findByText("We couldn't load your rewards.")).toBeInTheDocument();

  mockCustomer(buildLoyaltyCustomerWith({ pointBalance: 100 }));

  await user.click(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByText('You have 100 points')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty`
Expected: FAIL — `fetchLoyaltyCustomer`/`LoyaltyCustomer` not exported; hero texts not found.

- [ ] **Step 4: Implement the api additions**

Append to `apps/storefront/src/pages/Loyalty/api.ts`:

```ts
export interface LoyaltyCustomer {
  pointBalance: number;
  currentLoyaltyTierId: string | null;
  currentLoyaltyTierProgress: number | null;
  createdAt: string;
  followInstagram: boolean;
  followTikTok: boolean;
  followTwitter: boolean;
  likeFacebook: boolean;
}

interface RawLoyaltyCustomer {
  pointBalance?: number;
  currentLoyaltyTierId?: string;
  currentLoyaltyTierProgress?: number;
  createdAt?: string;
  followInstagram?: boolean;
  followTikTok?: boolean;
  followTwitter?: boolean;
  likeFacebook?: boolean;
}

const identityParams = (config: LoyaltyConfig, identity: LoyaltyIdentity) => ({
  shop: config.shopKey,
  customer_id: identity.customerId,
  customer_email: identity.email,
  digest: identity.digest,
});

const launcherStatusToError = (
  status: number,
  notFoundKind: 'notEnrolled' | 'upstream',
): LoyaltyError => {
  if (status === 401) {
    // The digest is a timeless HMAC of stable inputs — a Launcher 401 means the identity
    // keying or shop key is wrong, never an expired session; re-login cannot fix it.
    b2bLogger.error(
      'Loyalty: Launcher API rejected the digest (401) — identity keying or shop key mismatch',
    );
    return new LoyaltyError('misconfigured');
  }
  if (status === 404) {
    if (notFoundKind === 'notEnrolled') {
      // Ambiguous upstream: genuinely unknown customer OR a digest identity that does not
      // match Influence.io records (see spec S1/Q3) — log so a systemic bug is visible.
      b2bLogger.error(
        'Loyalty: Launcher API returned 404 for this customer — not enrolled, or digest identity does not match Influence.io records',
      );
    }
    return new LoyaltyError(notFoundKind);
  }
  if (status === 429) {
    return new LoyaltyError('rateLimited');
  }
  return new LoyaltyError('upstream');
};

const launcherGet = async (
  path: string,
  params: Record<string, string>,
  notFoundKind: 'notEnrolled' | 'upstream',
): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(`${LAUNCHER_API_BASE}${path}?${new URLSearchParams(params)}`);
  } catch {
    throw new LoyaltyError('upstream');
  }
  if (!response.ok) {
    throw launcherStatusToError(response.status, notFoundKind);
  }
  return response.json();
};

export const fetchLoyaltyCustomer = async (identity: LoyaltyIdentity): Promise<LoyaltyCustomer> => {
  const config = requireConfig();
  const raw = (await launcherGet(
    '/customer',
    identityParams(config, identity),
    'notEnrolled',
  )) as RawLoyaltyCustomer;

  return {
    pointBalance: raw.pointBalance ?? 0,
    currentLoyaltyTierId: raw.currentLoyaltyTierId ?? null,
    currentLoyaltyTierProgress: raw.currentLoyaltyTierProgress ?? null,
    createdAt: raw.createdAt ?? '',
    followInstagram: raw.followInstagram ?? false,
    followTikTok: raw.followTikTok ?? false,
    followTwitter: raw.followTwitter ?? false,
    likeFacebook: raw.likeFacebook ?? false,
  };
};
```

- [ ] **Step 5: Implement the hero component**

Create `apps/storefront/src/pages/Loyalty/components/LoyaltyHero.tsx`:

```tsx
import { Box, Chip, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

interface LoyaltyHeroProps {
  companyName: string;
  memberSince: string | null;
  tierTitle: string | null;
  pointBalance: number | null;
}

function LoyaltyHero({ companyName, memberSince, tierTitle, pointBalance }: LoyaltyHeroProps) {
  const b3Lang = useB3Lang();

  return (
    <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 1, p: 3, mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h5">{b3Lang('loyalty.hero.welcome')}</Typography>
        {memberSince && (
          <Chip
            label={b3Lang('loyalty.hero.memberSince', { date: memberSince })}
            sx={{ bgcolor: 'common.black', color: 'common.white' }}
          />
        )}
      </Box>
      <Typography variant="h6">{companyName}</Typography>
      {tierTitle && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2">{b3Lang('loyalty.hero.currentTier')}</Typography>
          <Chip label={tierTitle} sx={{ mt: 1, bgcolor: 'common.black', color: 'common.white' }} />
        </Box>
      )}
      {pointBalance !== null && (
        <Typography sx={{ mt: 2 }}>
          {b3Lang('loyalty.hero.points', { points: pointBalance.toLocaleString() })}
        </Typography>
      )}
    </Box>
  );
}

export default LoyaltyHero;
```

- [ ] **Step 6: Wire the page**

Replace `apps/storefront/src/pages/Loyalty/index.tsx` with:

```tsx
import { Alert, Box, Button, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import B3Spin from '@/components/spin/B3Spin';
import { useB3Lang } from '@/lib/lang';
import { useAppSelector } from '@/store';

import LoyaltyHero from './components/LoyaltyHero';
import { fetchLoyaltyCustomer, getLoyaltyDigest, isLoyaltyAvailable, LoyaltyError } from './api';

const formatMemberSince = (createdAt: string): string | null => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

function Loyalty() {
  const b3Lang = useB3Lang();
  const customerId = useAppSelector(({ company }) => company.customer.id);
  const companyName = useAppSelector(({ company }) => company.companyInfo.companyName);
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  // The digest identifies the logged-in customer, so a masquerading rep must not see points here.
  const isAvailable = isLoyaltyAvailable() && !isAgenting;

  const digestQuery = useQuery({
    queryKey: ['loyaltyDigest', customerId],
    queryFn: getLoyaltyDigest,
    enabled: isAvailable,
    staleTime: Infinity,
  });
  const identity = digestQuery.data;

  const customerQuery = useQuery({
    queryKey: ['loyaltyCustomer', customerId],
    queryFn: () => {
      // The enabled guard means this branch never runs; it satisfies the type
      // system without a non-null assertion (banned by the disabled-rule list).
      if (!identity) {
        return Promise.reject(new Error('identity not loaded'));
      }
      return fetchLoyaltyCustomer(identity);
    },
    enabled: Boolean(identity),
  });
  const customer = customerQuery.data;

  if (!isAvailable) {
    return (
      <Box>
        <Typography sx={{ mt: 2 }}>{b3Lang('loyalty.unavailable')}</Typography>
      </Box>
    );
  }

  const error = digestQuery.error ?? customerQuery.error;
  const errorKind = error instanceof LoyaltyError ? error.kind : error ? 'upstream' : null;
  const isNotEnrolled = errorKind === 'notEnrolled';
  const isSessionExpired = errorKind === 'sessionExpired';
  const isLoadError = Boolean(errorKind) && !isNotEnrolled && !isSessionExpired;

  return (
    <B3Spin isSpinning={digestQuery.isFetching || customerQuery.isFetching}>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%' }}>
        <LoyaltyHero
          companyName={companyName}
          memberSince={customer ? formatMemberSince(customer.createdAt) : null}
          tierTitle={null}
          pointBalance={customer ? customer.pointBalance : null}
        />
        {isSessionExpired && <Alert severity="warning">{b3Lang('loyalty.sessionExpired')}</Alert>}
        {isNotEnrolled && <Alert severity="info">{b3Lang('loyalty.notEnrolled')}</Alert>}
        {isLoadError && (
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => (digestQuery.error ? digestQuery.refetch() : customerQuery.refetch())}
              >
                {b3Lang('loyalty.retry')}
              </Button>
            }
          >
            {b3Lang('loyalty.loadError')}
          </Alert>
        )}
      </Box>
    </B3Spin>
  );
}

export default Loyalty;
```

- [ ] **Step 7: Add the i18n keys**

In `en.json`, extend the loyalty block (comma-separate; keep `loyalty.unavailable`):

```json
  "loyalty.unavailable": "Rewards are not available.",
  "loyalty.sessionExpired": "Your session has expired — please sign in again.",
  "loyalty.notEnrolled": "Start earning points with your first order.",
  "loyalty.loadError": "We couldn't load your rewards.",
  "loyalty.retry": "Try again",
  "loyalty.hero.welcome": "Welcome",
  "loyalty.hero.memberSince": "Member since {date}",
  "loyalty.hero.currentTier": "Current tier",
  "loyalty.hero.points": "You have {points} points"
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty`
Expected: PASS. Also run `yarn tsc --noEmit` — exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/storefront/src/pages/Loyalty apps/storefront/src/lib/lang/locales/en.json
git commit -m "feat: B2B-0000 Add loyalty customer fetch, hero, and page states"
```

---

### Task 4: Tab navigation via URL search param

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/index.tsx`
- Modify: `apps/storefront/src/lib/lang/locales/en.json`
- Test: extend `index.test.tsx`

**Interfaces:**
- Produces: `type LoyaltyTab = 'overview' | 'earn' | 'redeem' | 'tiers' | 'history'` (module-local to `index.tsx`); tab panels render placeholder `<Box>` per tab that Tasks 5-10 fill. Tab labels come from `loyalty.tabs.*` keys and MUST read: Your rewards / Earn points / Rewards / Tiers / History.

- [ ] **Step 1: Write the failing tests**

Append to `index.test.tsx`:

```tsx
it('renders the five tabs with mockup labels and defaults to Your rewards', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByRole('tab', { name: 'Your rewards', selected: true })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Earn points' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Rewards' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Tiers' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument();
});

it('selects the tab named by the URL search param', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=history' }] });

  expect(await screen.findByRole('tab', { name: 'History', selected: true })).toBeInTheDocument();
});

it('falls back to Your rewards for an unknown tab param', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=bogus' }] });

  expect(await screen.findByRole('tab', { name: 'Your rewards', selected: true })).toBeInTheDocument();
});

it('switches tabs on click', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Tiers' }));

  expect(screen.getByRole('tab', { name: 'Tiers', selected: true })).toBeInTheDocument();
});
```

Note `bulk`/`'WHATEVER_VALUES'`: passing `'WHATEVER_VALUES'` to a builder is the repo's semantic marker for "any values will do".

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx`
Expected: FAIL — no tabs rendered.

- [ ] **Step 3: Implement**

In `index.tsx`, add imports:

```tsx
import { useSearchParams } from 'react-router-dom';
import { Tab, Tabs } from '@mui/material';
```

Add above the component:

```tsx
const LOYALTY_TABS = ['overview', 'earn', 'redeem', 'tiers', 'history'] as const;
type LoyaltyTab = (typeof LOYALTY_TABS)[number];

const toLoyaltyTab = (value: string | null): LoyaltyTab =>
  LOYALTY_TABS.includes(value as LoyaltyTab) ? (value as LoyaltyTab) : 'overview';
```

Inside the component (after the selectors):

```tsx
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = toLoyaltyTab(searchParams.get('tab'));
```

Below the error alerts in the JSX, add:

```tsx
        <Tabs
          value={tab}
          onChange={(_, newTab: LoyaltyTab) => setSearchParams({ tab: newTab })}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ mb: 2 }}
        >
          <Tab value="overview" label={b3Lang('loyalty.tabs.overview')} />
          <Tab value="earn" label={b3Lang('loyalty.tabs.earn')} />
          <Tab value="redeem" label={b3Lang('loyalty.tabs.redeem')} />
          <Tab value="tiers" label={b3Lang('loyalty.tabs.tiers')} />
          <Tab value="history" label={b3Lang('loyalty.tabs.history')} />
        </Tabs>
        {tab === 'overview' && <Box data-testid="loyalty-tab-overview" />}
        {tab === 'earn' && <Box data-testid="loyalty-tab-earn" />}
        {tab === 'redeem' && <Box data-testid="loyalty-tab-redeem" />}
        {tab === 'tiers' && <Box data-testid="loyalty-tab-tiers" />}
        {tab === 'history' && <Box data-testid="loyalty-tab-history" />}
```

Add to the `loyalty.*` block in `en.json`:

```json
  "loyalty.tabs.overview": "Your rewards",
  "loyalty.tabs.earn": "Earn points",
  "loyalty.tabs.redeem": "Rewards",
  "loyalty.tabs.tiers": "Tiers",
  "loyalty.tabs.history": "History"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/pages/Loyalty/index.tsx apps/storefront/src/pages/Loyalty/index.test.tsx apps/storefront/src/lib/lang/locales/en.json
git commit -m "feat: B2B-0000 Add URL-driven tab navigation to loyalty page"
```

---

### Task 5: Shop-level clients + Tiers tab

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/api.ts`
- Create: `apps/storefront/src/pages/Loyalty/components/TiersTab.tsx`
- Modify: `apps/storefront/src/pages/Loyalty/index.tsx`
- Modify: `apps/storefront/src/lib/lang/locales/en.json`
- Test: extend `api.test.ts` and `index.test.tsx`

**Interfaces:**
- Produces:
  - `interface LoyaltyTier { id: string; title: string; threshold: string; perks: string[] }`
  - `fetchTiers(): Promise<LoyaltyTier[]>` — `GET /shop/tiers?shop=<key>` (no digest), response `{ rules: [...] }`; 404 → `upstream`.
  - `parseThreshold(threshold: string): number | null` (exported — OverviewTab reuses it).
  - `TiersTab` props: `{ tiers: LoyaltyTier[]; currentTierId: string | null; currentTierProgress: number | null }`.
  - `index.tsx` query `['loyaltyTiers']` (staleTime Infinity), and the hero now resolves `tierTitle` from tiers + `customer.currentLoyaltyTierId`.

- [ ] **Step 1: Write the failing api tests**

Append to `api.test.ts` (add `fetchTiers`, `parseThreshold` to the `./api` import):

```ts
describe('fetchTiers', () => {
  it('fetches shop tiers with only the shop key and normalizes them', async () => {
    server.use(
      http.get('https://launcher.api.influence.io/launcher/v1/shop/tiers', ({ request }) => {
        assertQueryParams(request, { shop: shopKey });

        return HttpResponse.json({
          rules: [
            { id: 't1', title: 'Select', threshold: '0', perks: ['5% credit on every order'] },
            { id: 't2', title: 'Elite', threshold: '300' },
          ],
        });
      }),
    );

    const result = await fetchTiers();

    expect(result).toEqual([
      { id: 't1', title: 'Select', threshold: '0', perks: ['5% credit on every order'] },
      { id: 't2', title: 'Elite', threshold: '300', perks: [] },
    ]);
  });
});

describe('parseThreshold', () => {
  it.each([
    ['300', 300],
    ['0', 0],
    ['not-a-number', null],
    ['', null],
  ])('parses %j to %j', (input, expected) => {
    expect(parseThreshold(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Write the failing page tests**

Append to `index.test.tsx` (add `LoyaltyTier` to the `./api` import, `within` to the test-utils import):

```tsx
const buildTierWith = builder<LoyaltyTier>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productAdjective(),
  threshold: String(faker.number.int({ min: 0, max: 1000 })),
  perks: [faker.company.catchPhrase()],
}));

const mockTiers = (tiers: LoyaltyTier[]) =>
  server.use(
    http.get(`${launcherBase}/shop/tiers`, () => HttpResponse.json({ rules: tiers })),
  );

it('renders the tier list with the current tier highlighted and its title in the hero', async () => {
  const select = buildTierWith({ id: 't1', title: 'Select', threshold: '0' });
  const elite = buildTierWith({ id: 't2', title: 'Elite', threshold: '300' });

  mockLoyaltyApis(
    buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1', currentLoyaltyTierProgress: 240 }),
  );
  mockTiers([select, elite]);

  const { user } = renderWithProviders(<Loyalty />);

  // hero shows the resolved tier title
  expect(await screen.findByText('Current tier')).toBeInTheDocument();
  expect(await screen.findByText('Select')).toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: 'Tiers' }));

  const currentCard = (await screen.findByText('Current tier: Select')).closest(
    '.MuiCard-root',
  ) as HTMLElement;
  expect(within(currentCard).getByText(select.perks[0])).toBeInTheDocument();
  expect(screen.getByText('Elite')).toBeInTheDocument();
  // progress toward Elite: 240 of 300
  expect(screen.getByText('240 / 300')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
});

it('hides the tier progress bar when a threshold is not numeric', async () => {
  mockLoyaltyApis(
    buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1', currentLoyaltyTierProgress: 240 }),
  );
  mockTiers([
    buildTierWith({ id: 't1', title: 'Select', threshold: '0' }),
    buildTierWith({ id: 't2', title: 'Elite', threshold: 'Gold Status' }),
  ]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Tiers' }));

  // wait for the tier list to render, then confirm no progress bar was attempted
  expect(await screen.findByText('Current tier: Select')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty`
Expected: FAIL — `fetchTiers`/`parseThreshold`/`LoyaltyTier` missing; tier UI absent.

- [ ] **Step 4: Implement the api additions**

Append to `api.ts`:

```ts
export interface LoyaltyTier {
  id: string;
  title: string;
  threshold: string;
  perks: string[];
}

interface RawTier {
  id?: string | number;
  title?: string;
  threshold?: string | number;
  perks?: string[];
}

// Tier thresholds are strings with no documented unit (spec S3) — parse defensively.
export const parseThreshold = (threshold: string): number | null => {
  if (threshold.trim() === '') {
    return null;
  }
  const value = Number(threshold);
  return Number.isFinite(value) ? value : null;
};

export const fetchTiers = async (): Promise<LoyaltyTier[]> => {
  const config = requireConfig();
  const raw = (await launcherGet('/shop/tiers', { shop: config.shopKey }, 'upstream')) as {
    rules?: RawTier[];
  };

  return (raw.rules ?? []).map((tier) => ({
    id: String(tier.id ?? ''),
    title: tier.title ?? '',
    threshold: String(tier.threshold ?? ''),
    perks: tier.perks ?? [],
  }));
};
```

- [ ] **Step 5: Implement TiersTab**

Create `apps/storefront/src/pages/Loyalty/components/TiersTab.tsx`:

```tsx
import { Box, Card, CardContent, LinearProgress, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyTier, parseThreshold } from '../api';

interface TiersTabProps {
  tiers: LoyaltyTier[];
  currentTierId: string | null;
  currentTierProgress: number | null;
}

const findNextTier = (
  tiers: LoyaltyTier[],
  progress: number,
): { tier: LoyaltyTier; threshold: number } | null => {
  const parsed = tiers
    .map((tier) => ({ tier, threshold: parseThreshold(tier.threshold) }))
    .filter((entry): entry is { tier: LoyaltyTier; threshold: number } => entry.threshold !== null)
    .sort((a, b) => a.threshold - b.threshold);

  // Defensive: if ANY tier threshold fails to parse, the units are suspect — hide progress.
  if (parsed.length !== tiers.length) {
    return null;
  }

  return parsed.find((entry) => entry.threshold > progress) ?? null;
};

function TiersTab({ tiers, currentTierId, currentTierProgress }: TiersTabProps) {
  const b3Lang = useB3Lang();
  const next = currentTierProgress === null ? null : findNextTier(tiers, currentTierProgress);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {next && currentTierProgress !== null && (
        <Card>
          <CardContent>
            <Typography variant="subtitle2">
              {b3Lang('loyalty.tiers.progressTo', { tier: next.tier.title })}
            </Typography>
            <Typography variant="h6">{`${currentTierProgress.toLocaleString()} / ${next.threshold.toLocaleString()}`}</Typography>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, (currentTierProgress / next.threshold) * 100)}
              sx={{ mt: 1 }}
            />
          </CardContent>
        </Card>
      )}
      {tiers.map((tier) => (
        <Card key={tier.id}>
          <CardContent>
            <Typography variant="h6">
              {tier.id === currentTierId
                ? b3Lang('loyalty.tiers.currentTier', { tier: tier.title })
                : tier.title}
            </Typography>
            {tier.perks.map((perk) => (
              <Typography key={perk} variant="body2">
                {perk}
              </Typography>
            ))}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

export default TiersTab;
```

- [ ] **Step 6: Wire into the page**

In `index.tsx`:

```tsx
import TiersTab from './components/TiersTab';
import {
  fetchLoyaltyCustomer,
  fetchTiers,
  getLoyaltyDigest,
  isLoyaltyAvailable,
  LoyaltyError,
} from './api';
```

Add the query after `customerQuery`:

```tsx
  const tiersQuery = useQuery({
    queryKey: ['loyaltyTiers'],
    queryFn: fetchTiers,
    enabled: isAvailable,
    staleTime: Infinity,
  });
  const tiers = tiersQuery.data ?? [];
```

Resolve the hero tier title (replace `tierTitle={null}`):

```tsx
  const tierTitle =
    (customer?.currentLoyaltyTierId &&
      tiers.find((tier) => tier.id === customer.currentLoyaltyTierId)?.title) ||
    null;
```

```tsx
          tierTitle={tierTitle}
```

Replace the tiers placeholder:

```tsx
        {tab === 'tiers' && (
          <TiersTab
            tiers={tiers}
            currentTierId={customer?.currentLoyaltyTierId ?? null}
            currentTierProgress={customer?.currentLoyaltyTierProgress ?? null}
          />
        )}
```

Add to `en.json` loyalty block:

```json
  "loyalty.tiers.currentTier": "Current tier: {tier}",
  "loyalty.tiers.progressTo": "Progress to {tier}"
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/storefront/src/pages/Loyalty apps/storefront/src/lib/lang/locales/en.json
git commit -m "feat: B2B-0000 Add loyalty tiers fetch, tiers tab, and hero tier chip"
```

---

### Task 6: Overview tab (benefits + progress summary)

**Files:**
- Create: `apps/storefront/src/pages/Loyalty/components/OverviewTab.tsx`
- Modify: `apps/storefront/src/pages/Loyalty/index.tsx`
- Modify: `apps/storefront/src/lib/lang/locales/en.json`
- Test: extend `index.test.tsx`

**Interfaces:**
- Consumes: `LoyaltyTier`, `parseThreshold` (Task 5); `LoyaltyCustomer` (Task 3).
- Produces: `OverviewTab` props `{ customer: LoyaltyCustomer | undefined; tiers: LoyaltyTier[] }`. Renders the current tier's benefits card ("Your {TIER} benefits" + `perks[]`) and a compact points/next-tier summary (spec: interim content so the default tab isn't sparse).

- [ ] **Step 1: Write the failing tests**

Append to `index.test.tsx`:

```tsx
it('shows the current tier benefits and points summary on the Your rewards tab', async () => {
  const select = buildTierWith({
    id: 't1',
    title: 'Select',
    threshold: '0',
    perks: ['5% credit on every order', 'Free ground shipping over $300'],
  });

  mockLoyaltyApis(
    buildLoyaltyCustomerWith({
      pointBalance: 2465,
      currentLoyaltyTierId: 't1',
      currentLoyaltyTierProgress: 240,
    }),
  );
  mockTiers([select, buildTierWith({ id: 't2', title: 'Elite', threshold: '300' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Your Select benefits')).toBeInTheDocument();
  expect(screen.getByText('5% credit on every order')).toBeInTheDocument();
  expect(screen.getByText('Free ground shipping over $300')).toBeInTheDocument();
  expect(screen.getByText('240 / 300')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx`
Expected: FAIL — benefits card absent.

- [ ] **Step 3: Implement**

Create `apps/storefront/src/pages/Loyalty/components/OverviewTab.tsx`:

```tsx
import { Box, Card, CardContent, LinearProgress, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyCustomer, LoyaltyTier, parseThreshold } from '../api';

interface OverviewTabProps {
  customer: LoyaltyCustomer | undefined;
  tiers: LoyaltyTier[];
}

function OverviewTab({ customer, tiers }: OverviewTabProps) {
  const b3Lang = useB3Lang();

  if (!customer) {
    return null;
  }

  const currentTier = tiers.find((tier) => tier.id === customer.currentLoyaltyTierId);
  const progress = customer.currentLoyaltyTierProgress;
  const sortedThresholds = tiers
    .map((tier) => ({ tier, threshold: parseThreshold(tier.threshold) }))
    .filter((entry): entry is { tier: LoyaltyTier; threshold: number } => entry.threshold !== null)
    .sort((a, b) => a.threshold - b.threshold);
  const nextTier =
    progress !== null && sortedThresholds.length === tiers.length
      ? sortedThresholds.find((entry) => entry.threshold > progress)
      : undefined;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {currentTier && (
        <Card>
          <CardContent>
            <Typography variant="h6">
              {b3Lang('loyalty.overview.benefitsTitle', { tier: currentTier.title })}
            </Typography>
            {currentTier.perks.map((perk) => (
              <Typography key={perk} variant="body2">
                {perk}
              </Typography>
            ))}
          </CardContent>
        </Card>
      )}
      {nextTier && progress !== null && (
        <Card>
          <CardContent>
            <Typography variant="subtitle2">
              {b3Lang('loyalty.tiers.progressTo', { tier: nextTier.tier.title })}
            </Typography>
            <Typography variant="h6">{`${progress.toLocaleString()} / ${nextTier.threshold.toLocaleString()}`}</Typography>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, (progress / nextTier.threshold) * 100)}
              sx={{ mt: 1 }}
            />
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

export default OverviewTab;
```

In `index.tsx`, import and replace the overview placeholder:

```tsx
import OverviewTab from './components/OverviewTab';
```

```tsx
        {tab === 'overview' && <OverviewTab customer={customer} tiers={tiers} />}
```

Add to `en.json`:

```json
  "loyalty.overview.benefitsTitle": "Your {tier} benefits"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/pages/Loyalty apps/storefront/src/lib/lang/locales/en.json
git commit -m "feat: B2B-0000 Add loyalty overview tab with tier benefits"
```

---

### Task 7: Earn-points tab with social-follow action

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/api.ts`
- Create: `apps/storefront/src/pages/Loyalty/components/EarnPointsTab.tsx`
- Modify: `apps/storefront/src/pages/Loyalty/index.tsx`
- Modify: `apps/storefront/src/lib/lang/locales/en.json`
- Test: extend `api.test.ts` and `index.test.tsx`

**Interfaces:**
- Produces:
  - `interface EarnRule { id: string; title: string; summary: string; earnType: string; templateName: string; socialUrl: string }` (`title` mapped from upstream `customTitle` — earn rules have no `title` field upstream)
  - `fetchEarnRules(): Promise<EarnRule[]>` — `GET /shop/rules/earn?shop=<key>`, response `{ rules: [...] }`.
  - `interface SocialResult { success: boolean; points: number; updatedBalance: number }` (module-internal — nothing outside `api.ts` imports it)
  - `completeSocialRule(identity: LoyaltyIdentity, ruleId: string): Promise<SocialResult>` — `POST /customer/social` with body `{ customer: { id, email }, shop, digest, ruleId }`.
  - `getSocialCompletionFlag(rule: EarnRule): keyof Pick<LoyaltyCustomer, 'followInstagram' | 'followTikTok' | 'followTwitter' | 'likeFacebook'> | null` — heuristic matcher (enums are undocumented; spec S4).
  - `EarnPointsTab` props: `{ identity: LoyaltyIdentity | undefined; customer: LoyaltyCustomer | undefined; customerQueryKey: (string | number)[] }`.

- [ ] **Step 1: Write the failing api tests**

Append to `api.test.ts` (extend the `./api` import with `completeSocialRule`, `fetchEarnRules`, `getSocialCompletionFlag`):

```ts
describe('fetchEarnRules', () => {
  it('fetches earn rules with only the shop key and maps customTitle to title', async () => {
    server.use(
      http.get('https://launcher.api.influence.io/launcher/v1/shop/rules/earn', ({ request }) => {
        assertQueryParams(request, { shop: shopKey });

        return HttpResponse.json({
          rules: [
            {
              id: 'r1',
              customTitle: 'Make a purchase',
              summary: '2 points per $1',
              earnType: 'order',
              templateName: 'purchase',
            },
          ],
        });
      }),
    );

    const result = await fetchEarnRules();

    expect(result).toEqual([
      {
        id: 'r1',
        title: 'Make a purchase',
        summary: '2 points per $1',
        earnType: 'order',
        templateName: 'purchase',
        socialUrl: '',
      },
    ]);
  });
});

describe('completeSocialRule', () => {
  it('posts identity, shop, digest and ruleId in the body', async () => {
    const requestBody = vi.fn();

    server.use(
      http.post(
        'https://launcher.api.influence.io/launcher/v1/customer/social',
        async ({ request }) => {
          requestBody(await request.json());

          return HttpResponse.json({ success: true, points: 100, updatedBalance: 2565 });
        },
      ),
    );

    const result = await completeSocialRule(identity, 'r-social');

    expect(requestBody).toHaveBeenCalledWith({
      customer: { id: identity.customerId, email: identity.email },
      shop: shopKey,
      digest: identity.digest,
      ruleId: 'r-social',
    });
    expect(result).toEqual({ success: true, points: 100, updatedBalance: 2565 });
  });
});

describe('getSocialCompletionFlag', () => {
  it.each([
    ['instagram_follow', '', 'followInstagram'],
    ['', 'https://instagram.com/LoyaltyLionHQ', 'followInstagram'],
    ['tiktok_follow', '', 'followTikTok'],
    ['twitter_follow', '', 'followTwitter'],
    ['facebook_like', '', 'likeFacebook'],
    ['purchase', '', null],
  ])('maps templateName %j / socialUrl %j to %j', (templateName, socialUrl, expected) => {
    const rule = { id: 'r', title: '', summary: '', earnType: '', templateName, socialUrl };

    expect(getSocialCompletionFlag(rule)).toBe(expected);
  });
});
```

- [ ] **Step 2: Write the failing page tests**

Append to `index.test.tsx` (add `EarnRule` to the `./api` import; add `waitFor` to the test-utils import; import `snackbar` from `@/utils/b3Tip`):

```tsx
const buildEarnRuleWith = builder<EarnRule>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productName(),
  summary: faker.company.catchPhrase(),
  earnType: 'custom',
  templateName: 'custom',
  socialUrl: '',
}));

const mockEarnRules = (rules: EarnRule[]) =>
  server.use(
    http.get(`${launcherBase}/shop/rules/earn`, () =>
      HttpResponse.json({
        rules: rules.map(({ title, ...rest }) => ({ ...rest, customTitle: title })),
      }),
    ),
  );

it('renders earn rules with title and summary', async () => {
  const rule = buildEarnRuleWith({ title: 'Make a purchase', summary: '2 points per $1' });

  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockEarnRules([rule]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));

  expect(await screen.findByText('Make a purchase')).toBeInTheDocument();
  expect(screen.getByText('2 points per $1')).toBeInTheDocument();
});

it('shows a completed chip on a social rule the customer already did', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ followInstagram: true }));
  mockEarnRules([buildEarnRuleWith({ templateName: 'instagram_follow', title: 'Follow us' })]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));

  expect(await screen.findByText('Completed')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument();
});

it('awards points through the social follow button', async () => {
  const requestBody = vi.fn();

  mockLoyaltyApis(buildLoyaltyCustomerWith({ followInstagram: false, pointBalance: 100 }));
  mockEarnRules([
    buildEarnRuleWith({
      id: 'r-ig',
      templateName: 'instagram_follow',
      socialUrl: 'https://instagram.com/example',
      title: 'Follow us on Instagram',
    }),
  ]);
  server.use(
    http.post(`${launcherBase}/customer/social`, async ({ request }) => {
      requestBody(await request.json());

      return HttpResponse.json({ success: true, points: 100, updatedBalance: 200 });
    }),
  );

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));
  await user.click(await screen.findByRole('button', { name: 'Follow' }));

  await waitFor(() => {
    expect(snackbar.success).toHaveBeenCalledWith('You earned 100 points!');
  });
  expect(requestBody).toHaveBeenCalledWith({
    customer: { id: identity.customerId, email: identity.email },
    shop: 'store-key',
    digest: identity.digest,
    ruleId: 'r-ig',
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty`
Expected: FAIL — missing exports / UI.

- [ ] **Step 4: Implement the api additions**

Append to `api.ts`:

```ts
export interface EarnRule {
  id: string;
  title: string;
  summary: string;
  earnType: string;
  templateName: string;
  socialUrl: string;
}

interface RawEarnRule {
  id?: string | number;
  customTitle?: string;
  summary?: string;
  earnType?: string;
  templateName?: string;
  socialUrl?: string;
}

export const fetchEarnRules = async (): Promise<EarnRule[]> => {
  const config = requireConfig();
  const raw = (await launcherGet('/shop/rules/earn', { shop: config.shopKey }, 'upstream')) as {
    rules?: RawEarnRule[];
  };

  return (raw.rules ?? []).map((rule) => ({
    id: String(rule.id ?? ''),
    title: rule.customTitle ?? '',
    summary: rule.summary ?? '',
    earnType: rule.earnType ?? '',
    templateName: rule.templateName ?? '',
    socialUrl: rule.socialUrl ?? '',
  }));
};

type SocialFlag = keyof Pick<
  LoyaltyCustomer,
  'followInstagram' | 'followTikTok' | 'followTwitter' | 'likeFacebook'
>;

const SOCIAL_MATCHERS: { match: string; flag: SocialFlag }[] = [
  { match: 'instagram', flag: 'followInstagram' },
  { match: 'tiktok', flag: 'followTikTok' },
  { match: 'twitter', flag: 'followTwitter' },
  { match: 'facebook', flag: 'likeFacebook' },
];

// earnType/templateName enums are undocumented upstream (spec S4) — match heuristically
// on the rule's template name or social URL; unmatched rules render informational-only.
export const getSocialCompletionFlag = (rule: EarnRule): SocialFlag | null => {
  const haystack = `${rule.templateName} ${rule.socialUrl}`.toLowerCase();
  return SOCIAL_MATCHERS.find((matcher) => haystack.includes(matcher.match))?.flag ?? null;
};

interface SocialResult {
  success: boolean;
  points: number;
  updatedBalance: number;
}

const launcherPost = async (path: string, body: Record<string, unknown>): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(`${LAUNCHER_API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LoyaltyError('upstream');
  }
  if (!response.ok) {
    throw launcherStatusToError(response.status, 'upstream');
  }
  return response.json();
};

const identityBody = (config: LoyaltyConfig, identity: LoyaltyIdentity) => ({
  customer: { id: identity.customerId, email: identity.email },
  shop: config.shopKey,
  digest: identity.digest,
});

export const completeSocialRule = async (
  identity: LoyaltyIdentity,
  ruleId: string,
): Promise<SocialResult> => {
  const config = requireConfig();
  const raw = (await launcherPost('/customer/social', {
    ...identityBody(config, identity),
    ruleId,
  })) as { success?: boolean; points?: number; updatedBalance?: number };

  return {
    success: raw.success ?? false,
    points: raw.points ?? 0,
    updatedBalance: raw.updatedBalance ?? 0,
  };
};
```

- [ ] **Step 5: Implement EarnPointsTab**

Create `apps/storefront/src/pages/Loyalty/components/EarnPointsTab.tsx`:

```tsx
import { Box, Button, Card, CardContent, Chip, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import { snackbar } from '@/utils/b3Tip';

import {
  completeSocialRule,
  EarnRule,
  fetchEarnRules,
  getSocialCompletionFlag,
  LoyaltyCustomer,
  LoyaltyError,
  LoyaltyIdentity,
} from '../api';

interface EarnPointsTabProps {
  identity: LoyaltyIdentity | undefined;
  customer: LoyaltyCustomer | undefined;
  customerQueryKey: (string | number)[];
}

function EarnPointsTab({ identity, customer, customerQueryKey }: EarnPointsTabProps) {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();

  const rulesQuery = useQuery({
    queryKey: ['loyaltyEarnRules'],
    queryFn: fetchEarnRules,
    staleTime: Infinity,
  });
  const rules = rulesQuery.data ?? [];

  const socialMutation = useMutation({
    mutationFn: (ruleId: string) => {
      if (!identity) {
        return Promise.reject(new Error('identity not loaded'));
      }
      return completeSocialRule(identity, ruleId);
    },
    onSuccess: (result) => {
      snackbar.success(b3Lang('loyalty.earn.followSuccess', { points: result.points }));
      queryClient.invalidateQueries({ queryKey: customerQueryKey });
    },
    onError: (err) => {
      if (err instanceof LoyaltyError && err.kind === 'rateLimited') {
        snackbar.error(b3Lang('loyalty.errors.rateLimited'));
        return;
      }
      snackbar.error(b3Lang('loyalty.errors.generic'));
    },
  });

  const renderAction = (rule: EarnRule) => {
    const flag = getSocialCompletionFlag(rule);
    if (!flag || !customer || !identity) {
      // Non-social rules (purchase, mailing list, review) are informational-only in v1;
      // their earning happens through integrations, not this page.
      return null;
    }
    if (customer[flag]) {
      return <Chip label={b3Lang('loyalty.earn.completed')} size="small" />;
    }
    return (
      <Button
        variant="outlined"
        size="small"
        disabled={socialMutation.isPending}
        onClick={() => socialMutation.mutate(rule.id)}
      >
        {b3Lang('loyalty.earn.follow')}
      </Button>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {rules.map((rule) => (
        <Card key={rule.id} sx={{ minWidth: 240, flex: '1 1 40%' }}>
          <CardContent sx={{ textAlign: 'center' }}>
            <Typography variant="subtitle1">{rule.title}</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {rule.summary}
            </Typography>
            {renderAction(rule)}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

export default EarnPointsTab;
```

- [ ] **Step 6: Wire into the page**

In `index.tsx`:

```tsx
import EarnPointsTab from './components/EarnPointsTab';
```

```tsx
        {tab === 'earn' && (
          <EarnPointsTab
            identity={identity}
            customer={customer}
            customerQueryKey={['loyaltyCustomer', customerId]}
          />
        )}
```

Add to `en.json`:

```json
  "loyalty.earn.completed": "Completed",
  "loyalty.earn.follow": "Follow",
  "loyalty.earn.followSuccess": "You earned {points} points!",
  "loyalty.errors.rateLimited": "Too many requests — please try again in a minute.",
  "loyalty.errors.generic": "Something went wrong. Please try again."
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/storefront/src/pages/Loyalty apps/storefront/src/lib/lang/locales/en.json
git commit -m "feat: B2B-0000 Add loyalty earn-points tab with social follow action"
```

---

### Task 8: Rewards catalog + redeem flow

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/api.ts`
- Create: `apps/storefront/src/pages/Loyalty/components/RewardsTab.tsx`
- Modify: `apps/storefront/src/pages/Loyalty/index.tsx`
- Modify: `apps/storefront/src/lib/lang/locales/en.json`
- Test: extend `api.test.ts` and `index.test.tsx`

**Interfaces:**
- Consumes: `launcherGet`, `launcherPost`, `identityBody`, `requireConfig` (module-internal, Tasks 3/7); `B3Dialog` from `@/components/B3Dialog` (props: `isOpen`, `title`, `leftSizeBtn`, `rightSizeBtn`, `loading`, `handleLeftClick`, `handRightClick`, children).
- Produces:
  - `interface RedeemRule { id: string; title: string; pointCost: number | null; redeemType: string; status: string; minRedeemablePoints: number | null; maxRedeemablePoints: number | null }` (`title` = upstream `customTitle ?? title`)
  - `fetchRedeemRules(): Promise<RedeemRule[]>` — `GET /shop/rules/redeem?shop=<key>`.
  - `isRedeemableCatalogRule(rule: RedeemRule): boolean` — fixed-cost + recognized-active filter (spec: increment-type and unknown-status rules are logged and hidden).
  - `interface RedeemResult { success: boolean; couponCode: string }` (module-internal)
  - `redeemReward(identity: LoyaltyIdentity, ruleId: string): Promise<RedeemResult>` — `POST /customer/redeem`, body `{ customer: { id, email }, shop, digest, ruleId, redemptionSource: 'buyer-portal' }`.
  - `RewardsTab` props: `{ identity: LoyaltyIdentity | undefined; pointBalance: number; customerQueryKey: (string | number)[] }`.

- [ ] **Step 1: Write the failing api tests**

Append to `api.test.ts` (extend the `./api` import with `fetchRedeemRules`, `isRedeemableCatalogRule`, `redeemReward`):

```ts
describe('fetchRedeemRules and isRedeemableCatalogRule', () => {
  it('normalizes redeem rules preferring customTitle', async () => {
    server.use(
      http.get(
        'https://launcher.api.influence.io/launcher/v1/shop/rules/redeem',
        ({ request }) => {
          assertQueryParams(request, { shop: shopKey });

          return HttpResponse.json({
            rules: [
              { id: 'rr1', title: 'Free shipping', pointCost: 1000, redeemType: 'freeshipping' },
              { id: 'rr2', customTitle: '$5 gift card', title: 'Gift card', pointCost: 500, redeemType: 'giftcard', status: 'active' },
            ],
          });
        },
      ),
    );

    const result = await fetchRedeemRules();

    expect(result).toEqual([
      {
        id: 'rr1',
        title: 'Free shipping',
        pointCost: 1000,
        redeemType: 'freeshipping',
        status: '',
        minRedeemablePoints: null,
        maxRedeemablePoints: null,
      },
      {
        id: 'rr2',
        title: '$5 gift card',
        pointCost: 500,
        redeemType: 'giftcard',
        status: 'active',
        minRedeemablePoints: null,
        maxRedeemablePoints: null,
      },
    ]);
  });

  it.each([
    [{ pointCost: 500, minRedeemablePoints: null, maxRedeemablePoints: null, status: '' }, true],
    [{ pointCost: 500, minRedeemablePoints: null, maxRedeemablePoints: null, status: 'active' }, true],
    [{ pointCost: 500, minRedeemablePoints: null, maxRedeemablePoints: null, status: 'ACTIVE' }, true],
    [{ pointCost: null, minRedeemablePoints: null, maxRedeemablePoints: null, status: '' }, false],
    [{ pointCost: 500, minRedeemablePoints: 100, maxRedeemablePoints: null, status: '' }, false],
    [{ pointCost: 500, minRedeemablePoints: null, maxRedeemablePoints: 900, status: '' }, false],
    [{ pointCost: 500, minRedeemablePoints: null, maxRedeemablePoints: null, status: 'paused' }, false],
  ])('filters catalog rules: %j -> %j', (partial, expected) => {
    const rule = { id: 'r', title: 't', redeemType: 'x', ...partial };

    expect(isRedeemableCatalogRule(rule)).toBe(expected);
  });
});

describe('redeemReward', () => {
  it('posts identity, shop, digest, ruleId and redemptionSource in the body', async () => {
    const requestBody = vi.fn();

    server.use(
      http.post(
        'https://launcher.api.influence.io/launcher/v1/customer/redeem',
        async ({ request }) => {
          requestBody(await request.json());

          return HttpResponse.json({ success: true, couponCode: 'SAVE-123' });
        },
      ),
    );

    const result = await redeemReward(identity, 'rr1');

    expect(requestBody).toHaveBeenCalledWith({
      customer: { id: identity.customerId, email: identity.email },
      shop: shopKey,
      digest: identity.digest,
      ruleId: 'rr1',
      redemptionSource: 'buyer-portal',
    });
    expect(result).toEqual({ success: true, couponCode: 'SAVE-123' });
  });
});
```

- [ ] **Step 2: Write the failing page tests**

Append to `index.test.tsx` (add `RedeemRule` to the `./api` import):

```tsx
const buildRedeemRuleWith = builder<RedeemRule>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productName(),
  pointCost: faker.number.int({ min: 100, max: 1000 }),
  redeemType: faker.helpers.arrayElement(['freeshipping', 'fixedamountdiscount', 'percentageoff']),
  status: 'active',
  minRedeemablePoints: null,
  maxRedeemablePoints: null,
}));

const mockRedeemRules = (rules: RedeemRule[]) =>
  server.use(http.get(`${launcherBase}/shop/rules/redeem`, () => HttpResponse.json({ rules })));

it('lists redeemable rewards and disables ones costing more than the balance', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 600 }));
  mockRedeemRules([
    buildRedeemRuleWith({ title: '$5 discount', pointCost: 500 }),
    buildRedeemRuleWith({ title: 'Free shipping', pointCost: 1000 }),
  ]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Rewards' }));

  const cheap = (await screen.findByText('$5 discount')).closest('.MuiCard-root') as HTMLElement;
  const dear = screen.getByText('Free shipping').closest('.MuiCard-root') as HTMLElement;
  expect(within(cheap).getByRole('button', { name: 'Get reward' })).toBeEnabled();
  expect(within(dear).getByRole('button', { name: 'Get reward' })).toBeDisabled();
});

it('hides increment-type and unknown-status rules from the catalog', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 5000 }));
  mockRedeemRules([
    buildRedeemRuleWith({ title: 'Point donation', minRedeemablePoints: 100 }),
    buildRedeemRuleWith({ title: 'Paused reward', status: 'paused' }),
    buildRedeemRuleWith({ title: '$5 discount' }),
  ]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Rewards' }));

  expect(await screen.findByText('$5 discount')).toBeInTheDocument();
  expect(screen.queryByText('Point donation')).not.toBeInTheDocument();
  expect(screen.queryByText('Paused reward')).not.toBeInTheDocument();
});

it('redeems a reward after confirmation and shows the coupon code', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 600 }));
  mockRedeemRules([buildRedeemRuleWith({ id: 'rr1', title: '$5 discount', pointCost: 500 })]);
  server.use(
    http.post(`${launcherBase}/customer/redeem`, () =>
      HttpResponse.json({ success: true, couponCode: 'SAVE-123' }),
    ),
  );

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Rewards' }));
  await user.click(await screen.findByRole('button', { name: 'Get reward' }));

  expect(await screen.findByText('Redeem $5 discount for 500 points?')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Redeem' }));

  expect(await screen.findByText('SAVE-123')).toBeInTheDocument();
  expect(screen.getByText('Apply this code at checkout.')).toBeInTheDocument();
});

it('does not redeem when the confirmation is cancelled', async () => {
  const redeemRequests = vi.fn();

  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 600 }));
  mockRedeemRules([buildRedeemRuleWith({ title: '$5 discount', pointCost: 500 })]);
  server.use(
    http.post(`${launcherBase}/customer/redeem`, () => {
      redeemRequests();

      return HttpResponse.json({ success: true, couponCode: 'SAVE-123' });
    }),
  );

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Rewards' }));
  await user.click(await screen.findByRole('button', { name: 'Get reward' }));
  await user.click(await screen.findByRole('button', { name: 'Cancel' }));

  expect(redeemRequests).not.toHaveBeenCalled();
});

it('shows an error snackbar when the redemption fails', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 600 }));
  mockRedeemRules([buildRedeemRuleWith({ title: '$5 discount', pointCost: 500 })]);
  server.use(
    http.post(`${launcherBase}/customer/redeem`, () => HttpResponse.json({}, { status: 500 })),
  );

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Rewards' }));
  await user.click(await screen.findByRole('button', { name: 'Get reward' }));
  await user.click(await screen.findByRole('button', { name: 'Redeem' }));

  await waitFor(() => {
    expect(snackbar.error).toHaveBeenCalledWith('Something went wrong. Please try again.');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty`
Expected: FAIL.

- [ ] **Step 4: Implement the api additions**

Append to `api.ts`:

```ts
export interface RedeemRule {
  id: string;
  title: string;
  pointCost: number | null;
  redeemType: string;
  status: string;
  minRedeemablePoints: number | null;
  maxRedeemablePoints: number | null;
}

interface RawRedeemRule {
  id?: string | number;
  title?: string;
  customTitle?: string;
  pointCost?: number;
  redeemType?: string;
  status?: string;
  minRedeemablePoints?: number;
  maxRedeemablePoints?: number;
}

export const fetchRedeemRules = async (): Promise<RedeemRule[]> => {
  const config = requireConfig();
  const raw = (await launcherGet('/shop/rules/redeem', { shop: config.shopKey }, 'upstream')) as {
    rules?: RawRedeemRule[];
  };

  return (raw.rules ?? []).map((rule) => ({
    id: String(rule.id ?? ''),
    title: rule.customTitle ?? rule.title ?? '',
    pointCost: rule.pointCost ?? null,
    redeemType: rule.redeemType ?? '',
    status: rule.status ?? '',
    minRedeemablePoints: rule.minRedeemablePoints ?? null,
    maxRedeemablePoints: rule.maxRedeemablePoints ?? null,
  }));
};

// v1 handles fixed-cost rules only (spec): increment-type rules (min/max redeemable
// points) and rules with an unrecognized status are logged and hidden. status enum is
// undocumented upstream; '' (absent) and 'active' are treated as showable (spec S4).
export const isRedeemableCatalogRule = (rule: RedeemRule): boolean => {
  if (rule.pointCost === null) {
    return false;
  }
  if (rule.minRedeemablePoints !== null || rule.maxRedeemablePoints !== null) {
    b2bLogger.error(
      `Loyalty: hiding increment-type redeem rule ${rule.id} — variable-amount redemption is not supported in v1`,
    );
    return false;
  }
  if (rule.status !== '' && rule.status.toLowerCase() !== 'active') {
    b2bLogger.error(`Loyalty: hiding redeem rule ${rule.id} with unrecognized status "${rule.status}"`);
    return false;
  }
  return true;
};

interface RedeemResult {
  success: boolean;
  couponCode: string;
}

export const redeemReward = async (
  identity: LoyaltyIdentity,
  ruleId: string,
): Promise<RedeemResult> => {
  const config = requireConfig();
  const raw = (await launcherPost('/customer/redeem', {
    ...identityBody(config, identity),
    ruleId,
    redemptionSource: 'buyer-portal',
  })) as { success?: boolean; couponCode?: string };

  return { success: raw.success ?? false, couponCode: raw.couponCode ?? '' };
};
```

- [ ] **Step 5: Implement RewardsTab**

Create `apps/storefront/src/pages/Loyalty/components/RewardsTab.tsx`:

```tsx
import { useState } from 'react';
import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';
import { snackbar } from '@/utils/b3Tip';

import {
  fetchRedeemRules,
  isRedeemableCatalogRule,
  LoyaltyError,
  LoyaltyIdentity,
  RedeemRule,
  redeemReward,
} from '../api';

interface RewardsTabProps {
  identity: LoyaltyIdentity | undefined;
  pointBalance: number;
  customerQueryKey: (string | number)[];
}

function RewardsTab({ identity, pointBalance, customerQueryKey }: RewardsTabProps) {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();
  const [pendingRedeem, setPendingRedeem] = useState<RedeemRule | null>(null);
  const [couponCode, setCouponCode] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey: ['loyaltyRedeemRules'],
    queryFn: fetchRedeemRules,
    staleTime: Infinity,
  });
  const catalog = (rulesQuery.data ?? []).filter(isRedeemableCatalogRule);

  const redeemMutation = useMutation({
    mutationFn: (ruleId: string) => {
      if (!identity) {
        return Promise.reject(new Error('identity not loaded'));
      }
      return redeemReward(identity, ruleId);
    },
    onSuccess: (result) => {
      setPendingRedeem(null);
      setCouponCode(result.couponCode);
      queryClient.invalidateQueries({ queryKey: customerQueryKey });
      queryClient.invalidateQueries({ queryKey: ['loyaltyHistory'] });
      queryClient.invalidateQueries({ queryKey: ['loyaltyRewards'] });
    },
    onError: (err) => {
      setPendingRedeem(null);
      if (err instanceof LoyaltyError && err.kind === 'rateLimited') {
        snackbar.error(b3Lang('loyalty.errors.rateLimited'));
        return;
      }
      snackbar.error(b3Lang('loyalty.errors.generic'));
    },
  });

  const handleCopy = async () => {
    if (couponCode) {
      await navigator.clipboard.writeText(couponCode);
      snackbar.success(b3Lang('loyalty.redeem.copied'));
    }
  };

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {catalog.map((rule) => (
        <Card key={rule.id} sx={{ minWidth: 240, flex: '1 1 40%' }}>
          <CardContent sx={{ textAlign: 'center' }}>
            <Typography variant="subtitle1">{rule.title}</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {b3Lang('loyalty.redeem.pointCost', {
                points: (rule.pointCost ?? 0).toLocaleString(),
              })}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              disabled={redeemMutation.isPending || (rule.pointCost ?? 0) > pointBalance}
              onClick={() => setPendingRedeem(rule)}
            >
              {b3Lang('loyalty.redeem.getReward')}
            </Button>
          </CardContent>
        </Card>
      ))}
      <B3Dialog
        isOpen={Boolean(pendingRedeem)}
        title={b3Lang('loyalty.redeem.confirmTitle')}
        leftSizeBtn={b3Lang('loyalty.redeem.cancel')}
        rightSizeBtn={b3Lang('loyalty.redeem.confirm')}
        loading={redeemMutation.isPending}
        handleLeftClick={() => {
          if (!redeemMutation.isPending) {
            setPendingRedeem(null);
          }
        }}
        handRightClick={() => {
          if (pendingRedeem) {
            redeemMutation.mutate(pendingRedeem.id);
          }
        }}
      >
        <Box>
          {pendingRedeem &&
            b3Lang('loyalty.redeem.confirmContent', {
              reward: pendingRedeem.title,
              points: (pendingRedeem.pointCost ?? 0).toLocaleString(),
            })}
        </Box>
      </B3Dialog>
      <B3Dialog
        isOpen={Boolean(couponCode)}
        title={b3Lang('loyalty.redeem.couponTitle')}
        leftSizeBtn={b3Lang('loyalty.redeem.copy')}
        rightSizeBtn={b3Lang('loyalty.redeem.close')}
        handleLeftClick={handleCopy}
        handRightClick={() => setCouponCode(null)}
      >
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h5" sx={{ mb: 1 }}>
            {couponCode}
          </Typography>
          <Typography variant="body2">{b3Lang('loyalty.redeem.applyAtCheckout')}</Typography>
        </Box>
      </B3Dialog>
    </Box>
  );
}

export default RewardsTab;
```

- [ ] **Step 6: Wire into the page**

In `index.tsx`:

```tsx
import RewardsTab from './components/RewardsTab';
```

```tsx
        {tab === 'redeem' && (
          <RewardsTab
            identity={identity}
            pointBalance={customer?.pointBalance ?? 0}
            customerQueryKey={['loyaltyCustomer', customerId]}
          />
        )}
```

Add to `en.json`:

```json
  "loyalty.redeem.pointCost": "{points} points",
  "loyalty.redeem.getReward": "Get reward",
  "loyalty.redeem.confirmTitle": "Redeem reward?",
  "loyalty.redeem.confirmContent": "Redeem {reward} for {points} points?",
  "loyalty.redeem.cancel": "Cancel",
  "loyalty.redeem.confirm": "Redeem",
  "loyalty.redeem.couponTitle": "Your reward",
  "loyalty.redeem.copy": "Copy code",
  "loyalty.redeem.close": "Close",
  "loyalty.redeem.copied": "Code copied",
  "loyalty.redeem.applyAtCheckout": "Apply this code at checkout."
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/storefront/src/pages/Loyalty apps/storefront/src/lib/lang/locales/en.json
git commit -m "feat: B2B-0000 Add loyalty rewards catalog and redeem flow"
```

---

### Task 9: Earned-rewards list (first useInfiniteQuery)

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/api.ts`
- Modify: `apps/storefront/src/pages/Loyalty/components/RewardsTab.tsx`
- Modify: `apps/storefront/src/lib/lang/locales/en.json`
- Test: extend `api.test.ts` and `index.test.tsx`

**Interfaces:**
- Produces:
  - `interface EarnedReward { id: string; couponCode: string; title: string; createdAt: string }`
  - `interface EarnedRewardPage { items: EarnedReward[]; nextToken: string | null }` (module-internal)
  - `fetchEarnedRewards(identity: LoyaltyIdentity, nextToken?: string): Promise<EarnedRewardPage>` — `GET /customer/all-rewards`, identity trio + digest as query params, 404 → `notEnrolled`.
  - Query key `['loyaltyRewards', identity.customerId]` via `useInfiniteQuery` with `initialPageParam: undefined`, `getNextPageParam: (last) => last.nextToken ?? undefined`. Upstream provides no used/expired status — codes list as-issued (spec).

- [ ] **Step 1: Write the failing api test**

Append to `api.test.ts` (add `fetchEarnedRewards` to the `./api` import):

```ts
describe('fetchEarnedRewards', () => {
  it('sends identity as query params, forwards nextToken, and normalizes the page', async () => {
    server.use(
      http.get(
        'https://launcher.api.influence.io/launcher/v1/customer/all-rewards',
        ({ request }) => {
          assertQueryParams(request, {
            shop: shopKey,
            customer_id: identity.customerId,
            customer_email: identity.email,
            digest: identity.digest,
            nextToken: 'page-2',
          });

          return HttpResponse.json({
            items: [{ id: 'w1', couponCode: 'SAVE-123', title: '$5 discount', createdAt: '2026-06-01' }],
            nextToken: null,
          });
        },
      ),
    );

    const result = await fetchEarnedRewards(identity, 'page-2');

    expect(result).toEqual({
      items: [{ id: 'w1', couponCode: 'SAVE-123', title: '$5 discount', createdAt: '2026-06-01' }],
      nextToken: null,
    });
  });
});
```

- [ ] **Step 2: Write the failing page test**

Append to `index.test.tsx` (add `EarnedReward` to the `./api` import):

```tsx
const buildEarnedRewardWith = builder<EarnedReward>(() => ({
  id: faker.string.uuid(),
  couponCode: faker.string.alphanumeric(8).toUpperCase(),
  title: faker.commerce.productName(),
  createdAt: faker.date.past().toISOString(),
}));

it('lists previously earned coupon codes and loads more pages', async () => {
  const first = buildEarnedRewardWith({ couponCode: 'FIRST-CODE' });
  const second = buildEarnedRewardWith({ couponCode: 'SECOND-CODE' });

  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, ({ request }) => {
      const token = new URL(request.url).searchParams.get('nextToken');
      if (token === 'page-2') {
        return HttpResponse.json({ items: [second], nextToken: null });
      }
      return HttpResponse.json({ items: [first], nextToken: 'page-2' });
    }),
  );

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Rewards' }));

  expect(await screen.findByText('FIRST-CODE')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Load more' }));

  expect(await screen.findByText('SECOND-CODE')).toBeInTheDocument();
  expect(screen.getByText('FIRST-CODE')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty`
Expected: FAIL.

- [ ] **Step 4: Implement**

Append to `api.ts`:

```ts
export interface EarnedReward {
  id: string;
  couponCode: string;
  title: string;
  createdAt: string;
}

interface EarnedRewardPage {
  items: EarnedReward[];
  nextToken: string | null;
}

interface RawEarnedReward {
  id?: string | number;
  couponCode?: string;
  title?: string;
  createdAt?: string;
}

export const fetchEarnedRewards = async (
  identity: LoyaltyIdentity,
  nextToken?: string,
): Promise<EarnedRewardPage> => {
  const config = requireConfig();
  const params: Record<string, string> = identityParams(config, identity);
  if (nextToken) {
    params.nextToken = nextToken;
  }
  const raw = (await launcherGet('/customer/all-rewards', params, 'notEnrolled')) as {
    items?: RawEarnedReward[];
    nextToken?: string | null;
  };

  return {
    items: (raw.items ?? []).map((item) => ({
      id: String(item.id ?? ''),
      couponCode: item.couponCode ?? '',
      title: item.title ?? '',
      createdAt: item.createdAt ?? '',
    })),
    nextToken: raw.nextToken ?? null,
  };
};
```

In `RewardsTab.tsx`, add the earned-rewards section. Imports:

```tsx
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EarnedReward, fetchEarnedRewards } from '../api';
```

(merge into the existing import lists). Inside the component, after `redeemMutation`:

```tsx
  const earnedQuery = useInfiniteQuery({
    queryKey: ['loyaltyRewards', identity?.customerId ?? ''],
    queryFn: ({ pageParam }) => {
      if (!identity) {
        return Promise.reject(new Error('identity not loaded'));
      }
      return fetchEarnedRewards(identity, pageParam);
    },
    // v5 requires initialPageParam; undefined = first page (no nextToken param sent).
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextToken ?? undefined,
    enabled: Boolean(identity),
  });
  const earnedRewards: EarnedReward[] =
    earnedQuery.data?.pages.flatMap((page) => page.items) ?? [];
```

And at the bottom of the returned JSX (inside the outer `<Box>`, after the coupon dialog):

```tsx
      {earnedRewards.length > 0 && (
        <Box sx={{ width: '100%', mt: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {b3Lang('loyalty.redeem.earnedTitle')}
          </Typography>
          {earnedRewards.map((reward) => (
            <Card key={reward.id} sx={{ mb: 1 }}>
              <CardContent sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <Typography variant="body2">{reward.title}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {reward.couponCode}
                </Typography>
              </CardContent>
            </Card>
          ))}
          {earnedQuery.hasNextPage && (
            <Button
              size="small"
              disabled={earnedQuery.isFetchingNextPage}
              onClick={() => earnedQuery.fetchNextPage()}
            >
              {b3Lang('loyalty.loadMore')}
            </Button>
          )}
        </Box>
      )}
```

Add to `en.json`:

```json
  "loyalty.redeem.earnedTitle": "Your earned rewards",
  "loyalty.loadMore": "Load more"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/pages/Loyalty apps/storefront/src/lib/lang/locales/en.json
git commit -m "feat: B2B-0000 Add earned-rewards list to loyalty rewards tab"
```

---

### Task 10: History tab

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/api.ts`
- Create: `apps/storefront/src/pages/Loyalty/components/HistoryTab.tsx`
- Modify: `apps/storefront/src/pages/Loyalty/index.tsx`
- Modify: `apps/storefront/src/lib/lang/locales/en.json`
- Test: extend `api.test.ts` and `index.test.tsx`

**Interfaces:**
- Produces:
  - `interface PointActivity { id: string; action: string; status: string; points: number; createdAt: string; customDescription: string }`
  - `interface PointActivityPage { items: PointActivity[]; nextToken: string | null }` (module-internal)
  - `fetchPointsHistory(identity: LoyaltyIdentity, nextToken?: string): Promise<PointActivityPage>` — `GET /customer/points`, identity trio + digest + `limit: '10'` as query params, 404 → `notEnrolled`.
  - `HistoryTab` props: `{ identity: LoyaltyIdentity | undefined }`.

- [ ] **Step 1: Write the failing api test**

Append to `api.test.ts` (add `fetchPointsHistory` to the `./api` import):

```ts
describe('fetchPointsHistory', () => {
  it('sends identity and limit as query params and normalizes the page', async () => {
    server.use(
      http.get('https://launcher.api.influence.io/launcher/v1/customer/points', ({ request }) => {
        assertQueryParams(request, {
          shop: shopKey,
          customer_id: identity.customerId,
          customer_email: identity.email,
          digest: identity.digest,
          limit: '10',
        });

        return HttpResponse.json({
          items: [
            {
              id: 'a1',
              action: 'earned',
              status: 'approved',
              points: 50,
              createdAt: '2026-06-20',
              customDescription: 'Order #1001',
            },
          ],
          nextToken: 'page-2',
        });
      }),
    );

    const result = await fetchPointsHistory(identity);

    expect(result).toEqual({
      items: [
        {
          id: 'a1',
          action: 'earned',
          status: 'approved',
          points: 50,
          createdAt: '2026-06-20',
          customDescription: 'Order #1001',
        },
      ],
      nextToken: 'page-2',
    });
  });
});
```

- [ ] **Step 2: Write the failing page test**

Append to `index.test.tsx` (add `PointActivity` to the `./api` import):

```tsx
const buildPointActivityWith = builder<PointActivity>(() => ({
  id: faker.string.uuid(),
  action: faker.helpers.arrayElement(['earned', 'redeemed']),
  status: 'approved',
  points: faker.number.int({ min: -500, max: 500 }),
  createdAt: faker.date.past().toISOString(),
  customDescription: faker.company.catchPhrase(),
}));

it('lists points history and loads more pages', async () => {
  const first = buildPointActivityWith({ customDescription: 'Order #1001', points: 50 });
  const second = buildPointActivityWith({ customDescription: 'Order #1002', points: 80 });

  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  server.use(
    http.get(`${launcherBase}/customer/points`, ({ request }) => {
      const token = new URL(request.url).searchParams.get('nextToken');
      if (token === 'page-2') {
        return HttpResponse.json({ items: [second], nextToken: null });
      }
      return HttpResponse.json({ items: [first], nextToken: 'page-2' });
    }),
  );

  const { user } = renderWithProviders(<Loyalty />, {
    initialEntries: [{ search: '?tab=history' }],
  });

  expect(await screen.findByText('Order #1001')).toBeInTheDocument();
  expect(screen.getByText('+50')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Load more' }));

  expect(await screen.findByText('Order #1002')).toBeInTheDocument();
});

it('shows the empty history state', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  server.use(
    http.get(`${launcherBase}/customer/points`, () =>
      HttpResponse.json({ items: [], nextToken: null }),
    ),
  );

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=history' }] });

  expect(await screen.findByText('No points activity yet.')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty`
Expected: FAIL.

- [ ] **Step 4: Implement**

Append to `api.ts`:

```ts
export interface PointActivity {
  id: string;
  action: string;
  status: string;
  points: number;
  createdAt: string;
  customDescription: string;
}

interface PointActivityPage {
  items: PointActivity[];
  nextToken: string | null;
}

interface RawPointActivity {
  id?: string | number;
  action?: string;
  status?: string;
  points?: number;
  createdAt?: string;
  customDescription?: string;
}

export const fetchPointsHistory = async (
  identity: LoyaltyIdentity,
  nextToken?: string,
): Promise<PointActivityPage> => {
  const config = requireConfig();
  const params: Record<string, string> = { ...identityParams(config, identity), limit: '10' };
  if (nextToken) {
    params.nextToken = nextToken;
  }
  const raw = (await launcherGet('/customer/points', params, 'notEnrolled')) as {
    items?: RawPointActivity[];
    nextToken?: string | null;
  };

  return {
    items: (raw.items ?? []).map((item) => ({
      id: String(item.id ?? ''),
      action: item.action ?? '',
      status: item.status ?? '',
      points: item.points ?? 0,
      createdAt: item.createdAt ?? '',
      customDescription: item.customDescription ?? '',
    })),
    nextToken: raw.nextToken ?? null,
  };
};
```

Create `apps/storefront/src/pages/Loyalty/components/HistoryTab.tsx`:

```tsx
import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { useInfiniteQuery } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';

import { fetchPointsHistory, LoyaltyIdentity, PointActivity } from '../api';

interface HistoryTabProps {
  identity: LoyaltyIdentity | undefined;
}

const formatPoints = (points: number): string => (points > 0 ? `+${points}` : String(points));

const formatDate = (createdAt: string): string => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

function HistoryTab({ identity }: HistoryTabProps) {
  const b3Lang = useB3Lang();

  const historyQuery = useInfiniteQuery({
    queryKey: ['loyaltyHistory', identity?.customerId ?? ''],
    queryFn: ({ pageParam }) => {
      if (!identity) {
        return Promise.reject(new Error('identity not loaded'));
      }
      return fetchPointsHistory(identity, pageParam);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextToken ?? undefined,
    enabled: Boolean(identity),
  });
  const activities: PointActivity[] =
    historyQuery.data?.pages.flatMap((page) => page.items) ?? [];

  if (historyQuery.isSuccess && activities.length === 0) {
    return <Typography>{b3Lang('loyalty.history.empty')}</Typography>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {activities.map((activity) => (
        <Card key={activity.id}>
          <CardContent sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="body2">
                {activity.customDescription || activity.action}
              </Typography>
              <Typography variant="caption">{formatDate(activity.createdAt)}</Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {formatPoints(activity.points)}
            </Typography>
          </CardContent>
        </Card>
      ))}
      {historyQuery.hasNextPage && (
        <Button
          size="small"
          disabled={historyQuery.isFetchingNextPage}
          onClick={() => historyQuery.fetchNextPage()}
        >
          {b3Lang('loyalty.loadMore')}
        </Button>
      )}
    </Box>
  );
}

export default HistoryTab;
```

In `index.tsx`:

```tsx
import HistoryTab from './components/HistoryTab';
```

```tsx
        {tab === 'history' && <HistoryTab identity={identity} />}
```

Add to `en.json`:

```json
  "loyalty.history.empty": "No points activity yet."
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/pages/Loyalty apps/storefront/src/lib/lang/locales/en.json
git commit -m "feat: B2B-0000 Add loyalty points history tab"
```

---

### Task 11: Mobile pass, full verification gate

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/index.tsx` (only if the mobile test exposes layout problems)
- Test: `apps/storefront/src/pages/Loyalty/index.mobile.test.tsx` (create)

**Interfaces:** none new. The `.mobile.test.tsx` suffix means one thing in this repo: re-mock the viewport to 500px (global setup pins 1000px).

- [ ] **Step 1: Write the mobile test**

Create `apps/storefront/src/pages/Loyalty/index.mobile.test.tsx`:

```tsx
import {
  buildCompanyStateWith,
  builder,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
} from 'tests/test-utils';

import { LoyaltyCustomer } from './api';
import Loyalty from '.';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/utils/b3Logger');

const { server } = startMockServer();

const shopKey = 'store-key';
const apiBase = 'https://ssw.example.com/customers';
const appClientId = 'ssw-app-client-id';
const launcherBase = 'https://launcher.api.influence.io/launcher/v1';
const identity = { digest: 'digest-abc', customerId: '123', email: 'buyer@example.com' };

const buildLoyaltyCustomerWith = builder<LoyaltyCustomer>(() => ({
  pointBalance: faker.number.int({ min: 0, max: 9999 }),
  currentLoyaltyTierId: faker.string.uuid(),
  currentLoyaltyTierProgress: faker.number.int({ min: 0, max: 500 }),
  createdAt: faker.date.past().toISOString(),
  followInstagram: faker.datatype.boolean(),
  followTikTok: faker.datatype.boolean(),
  followTwitter: faker.datatype.boolean(),
  likeFacebook: faker.datatype.boolean(),
}));

beforeEach(() => {
  vi.spyOn(document.body, 'clientWidth', 'get').mockReturnValue(500);
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('renders the hero and scrollable tabs on a mobile viewport', async () => {
  server.use(
    http.get('http://localhost:3000/customer/current.jwt', () => HttpResponse.text('fresh-jwt')),
    http.post(`${apiBase}/loyalty/digest`, () => HttpResponse.json(identity)),
    http.get(`${launcherBase}/customer`, () =>
      HttpResponse.json(buildLoyaltyCustomerWith({ pointBalance: 2465 })),
    ),
  );

  renderWithProviders(<Loyalty />, {
    preloadedState: {
      company: buildCompanyStateWith({
        customer: { id: 123 },
        companyInfo: { companyName: 'Riverside Hardware Co.' },
      }),
    },
  });

  expect(await screen.findByText('Riverside Hardware Co.')).toBeInTheDocument();
  expect(screen.getByText('You have 2,465 points')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Your rewards' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it; fix layout only if it fails**

Run: `yarn test --run src/pages/Loyalty/index.mobile.test.tsx`
Expected: PASS (the layout already uses wrapping flex and `variant="scrollable"` tabs). If it fails, fix with `useMobile()` + `sx` branching in `index.tsx` — do not create a separate mobile page.

- [ ] **Step 3: Full verification gate**

```bash
yarn test --run src/pages/Loyalty
yarn tsc --noEmit
yarn lint:eslint
```

Expected: Loyalty tests all PASS; tsc exit 0; eslint exit 0 (zero warnings — the repo runs `--max-warnings 0`). If `yarn lint` (full, incl. knip/dependency-cruiser) is run: every new export in `api.ts` must be consumed or knip fails — Tasks 2–10 consume everything listed; remove any export you did not end up using.

- [ ] **Step 4: Verify the i18n block is complete**

Every `b3Lang('loyalty.*')` call must have a key in `en.json`. Grep to confirm:

```bash
grep -oh "b3Lang('loyalty[^']*'" -r apps/storefront/src/pages/Loyalty | sort -u
grep -o '"loyalty[^"]*"' apps/storefront/src/lib/lang/locales/en.json | sort -u
```

Expected: every key from the first list appears in the second (remember `useB3Lang` renders the raw key when missing — a missed key ships as literal `loyalty.foo` text).

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/pages/Loyalty
git commit -m "feat: B2B-0000 Add loyalty mobile test and finalize verification"
```

---

## Post-implementation (not code tasks)

1. **Sandbox/support checklist S1–S6 + Q1–Q4** from the spec — in particular Q1 (who creates the BC coupon) gates go-live of the Rewards tab, and S1 may turn the not-enrolled state into dead code (remove it then, don't leave it).
2. **SSW backend**: implement `POST /loyalty/digest` per the spec's normative contract (validate JWT, lowercase email, HMAC-SHA256(shopKey + email + customerId, platformApiKey), return `{ digest, customerId, email }`, CORS for storefront origins).
3. **Influence.io dashboard**: configure tiers/perks/earn rules/redeem rules for the pilot store to match the approved mockup (the page is fully data-driven).
4. **Theme**: add the `BC_CONTEXT.loyalty` inline-script snippet from the spec to the pilot store's Stencil theme.
5. Run the reviewer agent against the branch before merging (AGENTS.md gate).
