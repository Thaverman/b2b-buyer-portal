# Payment Methods Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/payment-methods` buyer-portal page where a logged-in customer can view their saved cards, set one as default, and delete one, against the already-built CustomerServices endpoints.

**Architecture:** Frontend-only (see spec `docs/superpowers/specs/2026-06-11-payment-methods-page-design.md`). A page-local `fetch` API module fetches a fresh BigCommerce Current Customer JWT (~15 s TTL) before every call and POSTs it to `{apiBase}/customers/Customer/*`. react-query owns server state; mutations return the refreshed list which is written straight into the query cache. The feature is gated on host-set `window.BC_CONTEXT.paymentMethods`.

**Tech Stack:** React 18, TypeScript, @tanstack/react-query v5 (`isPending`, object syntax), MUI, Vitest + Testing Library + MSW (REST handlers), react-intl via `useB3Lang`.

---

## Context for the implementer

- **Working directory: `apps/storefront/` — every command below runs from there.**
- Run a single test file non-interactively: `yarn vitest run <path>` (plain `yarn test` is watch mode).
- In tests, `window.B3.setting.platform` is `'bigcommerce'` (see `tests/setup-test-environment.ts`), so `BigCommerceStorefrontAPIBaseURL` resolves to `window.origin` = `http://localhost:3000`. The JWT fetch therefore hits `http://localhost:3000/customer/current.jwt`.
- `renderWithProviders` (from `tests/test-utils`) already wraps Redux, Router, `QueryClientProvider` (retry disabled), and `LangProvider` — locale strings from `src/lib/lang/locales/en.json` render for real in tests.
- `tests/mockServer.ts` starts MSW with `onUnhandledRequest: 'error'` and a hanging catch-all; register handlers per-test with `server.use(...)`.
- Backend contract (already deployed — do not change): all endpoints are `POST` JSON.
  - `POST {apiBase}/customers/Customer/StoredInstruments` body `{ jwt }` → `200 { customerId, instruments: [{ token, last4, brand, expiryMonth, expiryYear, type, isDefault }] }`
  - `POST .../SetDefaultStoredInstrument` body `{ jwt, token }` → `200` refreshed list (same shape)
  - `POST .../DeleteStoredInstrument` body `{ jwt, token }` → `200` refreshed list
  - Errors: `400 { error: "missing_jwt"|"missing_token" }`, `401 { error: "invalid_token" }`, `404 { error: "instrument_not_found" }`, `429` (empty), `502 { error: "upstream_unavailable" }`.
- Commit messages in this fork use plain conventional prefixes without a ticket (`feat: …`, `docs: …`) — match that.

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/index.d.ts` | Modify | Add `paymentMethods` to the `BC_CONTEXT` window type |
| `src/pages/PaymentMethods/api.ts` | Create | Config reader, typed error, three endpoint functions (fresh JWT per call) |
| `src/pages/PaymentMethods/api.test.ts` | Create | MSW tests for the API module |
| `src/pages/PaymentMethods/components/PaymentMethodRow.tsx` | Create | One card row: label, expiry, chips, actions |
| `src/pages/PaymentMethods/index.tsx` | Create | Page: query, states, mutations, delete dialog |
| `src/pages/PaymentMethods/index.test.tsx` | Create | Page tests (list, states, mutations, dialog, agenting) |
| `src/pages/PaymentMethods/index.platform.test.tsx` | Create | Platform-gate test (file-level `vi.mock` of basicConfig) |
| `src/lib/lang/locales/en.json` | Modify | `paymentMethods.*` + `global.navMenu.paymentMethods` keys |
| `src/shared/routeList.ts` | Modify | Route entry + three-way gate (platform / `BC_CONTEXT` / agenting) in `getAllowedRoutesWithoutComponent` |
| `src/shared/routes/index.tsx` | Modify | Lazy import + `routesMap` entry |

---

## Task 1: BC_CONTEXT type + API module (TDD)

**Files:**
- Modify: `src/index.d.ts` (the `BC_CONTEXT` block, currently lines 60–63)
- Create: `src/pages/PaymentMethods/api.ts`
- Create: `src/pages/PaymentMethods/api.test.ts`

- [ ] **Step 1: Extend the `BC_CONTEXT` window type**

In `src/index.d.ts`, replace:

```ts
    /** BigCommerce storefront context set by the host project; `storeSuffix` gates order-id obfuscation. */
    BC_CONTEXT?: {
      storeSuffix?: string;
    };
```

with:

```ts
    /** BigCommerce storefront context set by the host project; `storeSuffix` gates order-id obfuscation. */
    BC_CONTEXT?: {
      storeSuffix?: string;
      /** Gates the /payment-methods page; absent = feature off. */
      paymentMethods?: {
        apiBase: string;
        appClientId: string;
      };
    };
```

- [ ] **Step 2: Write the failing API tests**

Create `src/pages/PaymentMethods/api.test.ts`:

```ts
import { assertQueryParams, http, HttpResponse, startMockServer } from 'tests/test-utils';

import {
  deleteStoredInstrument,
  listStoredInstruments,
  PaymentMethodsError,
  setDefaultStoredInstrument,
} from './api';

vi.mock('@/utils/b3Logger');

const { server } = startMockServer();

const apiBase = 'https://api.example.com';
const appClientId = 'ssw-app-client-id';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

beforeEach(() => {
  window.BC_CONTEXT = { paymentMethods: { apiBase, appClientId } };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

const mockJwt = (jwt = 'fresh-jwt') =>
  server.use(http.get(currentJwtUrl, () => HttpResponse.text(jwt)));

const emptyList = { customerId: 999, instruments: [] };

it('listStoredInstruments posts the fresh jwt and returns the instrument list', async () => {
  const requestBody = vi.fn();

  server.use(
    http.get(currentJwtUrl, ({ request }) => {
      assertQueryParams(request, { app_client_id: appClientId });

      return HttpResponse.text('fresh-jwt');
    }),
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, async ({ request }) => {
      requestBody(await request.json());

      return HttpResponse.json(emptyList);
    }),
  );

  const result = await listStoredInstruments();

  expect(requestBody).toHaveBeenCalledWith({ jwt: 'fresh-jwt' });
  expect(result).toEqual(emptyList);
});

it('setDefaultStoredInstrument posts the jwt and token', async () => {
  const requestBody = vi.fn();

  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/SetDefaultStoredInstrument`, async ({ request }) => {
      requestBody(await request.json());

      return HttpResponse.json(emptyList);
    }),
  );

  const result = await setDefaultStoredInstrument('tok-1');

  expect(requestBody).toHaveBeenCalledWith({ jwt: 'fresh-jwt', token: 'tok-1' });
  expect(result).toEqual(emptyList);
});

it('deleteStoredInstrument posts the jwt and token', async () => {
  const requestBody = vi.fn();

  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/DeleteStoredInstrument`, async ({ request }) => {
      requestBody(await request.json());

      return HttpResponse.json(emptyList);
    }),
  );

  const result = await deleteStoredInstrument('tok-2');

  expect(requestBody).toHaveBeenCalledWith({ jwt: 'fresh-jwt', token: 'tok-2' });
  expect(result).toEqual(emptyList);
});

it('maps a failed jwt fetch to sessionExpired', async () => {
  // getCurrentCustomerJWT returns undefined when the response body contains "errors"
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('{"errors":[]}', { status: 401 })),
  );

  const error = await listStoredInstruments().catch((e) => e);

  expect(error).toBeInstanceOf(PaymentMethodsError);
  expect(error.kind).toBe('sessionExpired');
});

it('maps a thrown jwt fetch to sessionExpired', async () => {
  // non-ok response without "errors" makes getCurrentCustomerJWT throw
  server.use(http.get(currentJwtUrl, () => HttpResponse.text('nope', { status: 500 })));

  const error = await listStoredInstruments().catch((e) => e);

  expect(error).toBeInstanceOf(PaymentMethodsError);
  expect(error.kind).toBe('sessionExpired');
});

it.each([
  [401, 'sessionExpired'],
  [404, 'notFound'],
  [429, 'rateLimited'],
  [500, 'upstream'],
  [502, 'upstream'],
])('maps API status %i to %s', async (status, kind) => {
  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () =>
      HttpResponse.json({ error: 'whatever' }, { status }),
    ),
  );

  const error = await listStoredInstruments().catch((e) => e);

  expect(error).toBeInstanceOf(PaymentMethodsError);
  expect(error.kind).toBe(kind);
});

it('maps a network failure to upstream', async () => {
  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () => HttpResponse.error()),
  );

  const error = await listStoredInstruments().catch((e) => e);

  expect(error).toBeInstanceOf(PaymentMethodsError);
  expect(error.kind).toBe('upstream');
});
```

- [ ] **Step 3: Run the tests — expect compile failure**

Run: `yarn vitest run src/pages/PaymentMethods/api.test.ts`

Expected: FAIL — `./api` does not exist.

- [ ] **Step 4: Implement the API module**

Create `src/pages/PaymentMethods/api.ts`:

```ts
import { getCurrentCustomerJWT } from '@/shared/service/bc';
import b2bLogger from '@/utils/b3Logger';
import { platform } from '@/utils/basicConfig';

export interface StoredInstrument {
  token: string;
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  type: string;
  isDefault: boolean;
}

interface StoredInstrumentsResponse {
  customerId: number;
  instruments: StoredInstrument[];
}

type PaymentMethodsErrorKind = 'sessionExpired' | 'notFound' | 'rateLimited' | 'upstream';

export class PaymentMethodsError extends Error {
  kind: PaymentMethodsErrorKind;

  constructor(kind: PaymentMethodsErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

const getPaymentMethodsConfig = () => window.BC_CONTEXT?.paymentMethods;

// Stencil-only: getCurrentCustomerJWT early-returns undefined on every other platform,
// which would misrender as "session expired"; gate the feature out instead.
export const isPaymentMethodsAvailable = () =>
  platform === 'bigcommerce' && Boolean(getPaymentMethodsConfig());

const post = async (
  action: string,
  body: Record<string, string>,
): Promise<StoredInstrumentsResponse> => {
  const config = getPaymentMethodsConfig();
  if (!config) {
    throw new Error('Payment methods are not configured on this store');
  }

  // The Current Customer JWT lives ~15s; fetch a fresh one for every call.
  const jwt = await getCurrentCustomerJWT(config.appClientId).catch(() => undefined);
  if (!jwt) {
    // Also fires when the SSW app is not installed / appClientId is wrong — without this
    // line a pure config error is indistinguishable from a real expired session.
    b2bLogger.error(
      'Payment methods: /customer/current.jwt returned no token — expired storefront session, or BC_CONTEXT.paymentMethods.appClientId does not belong to an app installed on this store',
    );
    throw new PaymentMethodsError('sessionExpired');
  }

  let response: Response;
  try {
    response = await fetch(`${config.apiBase}/customers/Customer/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jwt, ...body }),
    });
  } catch {
    throw new PaymentMethodsError('upstream');
  }

  if (response.ok) {
    return response.json();
  }
  if (response.status === 401) {
    b2bLogger.error(
      'Payment methods: API rejected the JWT (401) — expired session, or BC_CONTEXT.paymentMethods.appClientId does not match the backend StoreSecrets ClientId',
    );
    throw new PaymentMethodsError('sessionExpired');
  }
  if (response.status === 404) {
    throw new PaymentMethodsError('notFound');
  }
  if (response.status === 429) {
    throw new PaymentMethodsError('rateLimited');
  }
  throw new PaymentMethodsError('upstream');
};

export const listStoredInstruments = () => post('StoredInstruments', {});

export const setDefaultStoredInstrument = (token: string) =>
  post('SetDefaultStoredInstrument', { token });

export const deleteStoredInstrument = (token: string) =>
  post('DeleteStoredInstrument', { token });
```

- [ ] **Step 5: Run the tests — expect pass**

Run: `yarn vitest run src/pages/PaymentMethods/api.test.ts`

Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add src/index.d.ts src/pages/PaymentMethods/api.ts src/pages/PaymentMethods/api.test.ts
git commit -m "feat: add payment methods API module with Current Customer JWT auth"
```

---

## Task 2: Page shell — list rendering and query states (TDD)

**Files:**
- Create: `src/pages/PaymentMethods/components/PaymentMethodRow.tsx`
- Create: `src/pages/PaymentMethods/index.tsx`
- Create: `src/pages/PaymentMethods/index.test.tsx`
- Create: `src/pages/PaymentMethods/index.platform.test.tsx`
- Modify: `src/lib/lang/locales/en.json`

- [ ] **Step 1: Add the page locale keys**

In `src/lib/lang/locales/en.json`, add these entries (keep the file's existing alphabetical-ish grouping; place them together after the `orders.*` block or wherever other page namespaces sit):

```json
"paymentMethods.title": "Payment methods",
"paymentMethods.cardLabel": "{brand} •••• {last4}",
"paymentMethods.expires": "Expires {month}/{year}",
"paymentMethods.default": "Default",
"paymentMethods.expired": "Expired",
"paymentMethods.empty": "You have no saved cards. Cards can be saved during checkout.",
"paymentMethods.unavailable": "Payment methods are not available.",
"paymentMethods.sessionExpired": "Your session has expired — please sign in again.",
"paymentMethods.loadError": "We couldn't load your saved cards.",
"paymentMethods.retry": "Try again",
```

- [ ] **Step 2: Write the failing page tests**

Create `src/pages/PaymentMethods/index.test.tsx`:

```tsx
import {
  buildB2BFeaturesStateWith,
  builder,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
} from 'tests/test-utils';

import { StoredInstrument } from './api';

import PaymentMethods from '.';

vi.mock('@/utils/b3Logger');

const { server } = startMockServer();

const apiBase = 'https://api.example.com';
const appClientId = 'ssw-app-client-id';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const buildStoredInstrumentWith = builder<StoredInstrument>(() => ({
  token: faker.string.uuid(),
  last4: faker.string.numeric(4),
  brand: faker.helpers.arrayElement(['VISA', 'MASTERCARD', 'AMEX']),
  expiryMonth: faker.number.int({ min: 1, max: 12 }),
  expiryYear: faker.number.int({ min: 2030, max: 2035 }),
  type: 'card',
  isDefault: false,
}));

const mockJwt = () => server.use(http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')));

const mockList = (instruments: StoredInstrument[]) =>
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () =>
      HttpResponse.json({ customerId: 999, instruments }),
    ),
  );

beforeEach(() => {
  window.BC_CONTEXT = { paymentMethods: { apiBase, appClientId } };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('renders a saved card with brand, last4, expiry and default chip', async () => {
  mockJwt();
  mockList([
    buildStoredInstrumentWith({
      brand: 'VISA',
      last4: '4242',
      expiryMonth: 12,
      expiryYear: 2030,
      isDefault: true,
    }),
  ]);

  renderWithProviders(<PaymentMethods />);

  expect(await screen.findByText('VISA •••• 4242')).toBeInTheDocument();
  expect(screen.getByText('Expires 12/2030')).toBeInTheDocument();
  expect(screen.getByText('Default')).toBeInTheDocument();
  expect(screen.queryByText('Expired')).not.toBeInTheDocument();
});

it('marks a card whose expiry is in the past as expired', async () => {
  mockJwt();
  mockList([buildStoredInstrumentWith({ expiryMonth: 1, expiryYear: 2020 })]);

  renderWithProviders(<PaymentMethods />);

  expect(await screen.findByText('Expired')).toBeInTheDocument();
});

it('shows the empty state when the customer has no saved cards', async () => {
  mockJwt();
  mockList([]);

  renderWithProviders(<PaymentMethods />);

  expect(
    await screen.findByText('You have no saved cards. Cards can be saved during checkout.'),
  ).toBeInTheDocument();
});

it('shows the session-expired state when the jwt fetch fails', async () => {
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('{"errors":[]}', { status: 401 })),
  );

  renderWithProviders(<PaymentMethods />);

  expect(
    await screen.findByText('Your session has expired — please sign in again.'),
  ).toBeInTheDocument();
});

it('shows the load error with a working retry button', async () => {
  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () =>
      HttpResponse.json({ error: 'upstream_unavailable' }, { status: 502 }),
    ),
  );

  const { user } = renderWithProviders(<PaymentMethods />);

  expect(await screen.findByText("We couldn't load your saved cards.")).toBeInTheDocument();

  mockList([buildStoredInstrumentWith({ brand: 'AMEX', last4: '0005' })]);

  await user.click(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByText('AMEX •••• 0005')).toBeInTheDocument();
});

it('shows the unavailable state when BC_CONTEXT is not configured', () => {
  delete window.BC_CONTEXT;

  renderWithProviders(<PaymentMethods />);

  expect(screen.getByText('Payment methods are not available.')).toBeInTheDocument();
});

it('shows the unavailable state while a sales rep is masquerading', () => {
  renderWithProviders(<PaymentMethods />, {
    preloadedState: {
      b2bFeatures: buildB2BFeaturesStateWith({ masqueradeCompany: { isAgenting: true } }),
    },
  });

  expect(screen.getByText('Payment methods are not available.')).toBeInTheDocument();
});
```

Also create `src/pages/PaymentMethods/index.platform.test.tsx` (separate file because
the platform mock is file-level; pattern from `AccountSetting/index.test.tsx`):

```tsx
import { renderWithProviders, screen } from 'tests/test-utils';

import PaymentMethods from '.';

vi.mock('@/utils/basicConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/basicConfig')>()),
  platform: 'catalyst',
}));

beforeEach(() => {
  window.BC_CONTEXT = {
    paymentMethods: { apiBase: 'https://api.example.com', appClientId: 'ssw-app-client-id' },
  };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('shows the unavailable state on non-bigcommerce platforms even when configured', () => {
  renderWithProviders(<PaymentMethods />);

  expect(screen.getByText('Payment methods are not available.')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the tests — expect compile failure**

Run: `yarn vitest run src/pages/PaymentMethods/index.test.tsx`

Expected: FAIL — `.` (index) and `./components/PaymentMethodRow` do not exist.

- [ ] **Step 4: Implement the row component**

Create `src/pages/PaymentMethods/components/PaymentMethodRow.tsx`:

```tsx
import { Box, Card, CardContent, Chip, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { StoredInstrument } from '../api';

interface PaymentMethodRowProps {
  instrument: StoredInstrument;
}

// A card is valid through the last day of its expiry month.
const isExpired = ({ expiryYear, expiryMonth }: StoredInstrument) =>
  new Date(expiryYear, expiryMonth, 1) <= new Date();

function PaymentMethodRow({ instrument }: PaymentMethodRowProps) {
  const b3Lang = useB3Lang();

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: '12rem' }}>
          <Typography variant="subtitle1">
            {b3Lang('paymentMethods.cardLabel', {
              brand: instrument.brand,
              last4: instrument.last4,
            })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('paymentMethods.expires', {
              month: String(instrument.expiryMonth).padStart(2, '0'),
              year: instrument.expiryYear,
            })}
          </Typography>
        </Box>
        {instrument.isDefault && (
          <Chip label={b3Lang('paymentMethods.default')} color="primary" size="small" />
        )}
        {isExpired(instrument) && (
          <Chip label={b3Lang('paymentMethods.expired')} color="warning" size="small" />
        )}
      </CardContent>
    </Card>
  );
}

export default PaymentMethodRow;
```

- [ ] **Step 5: Implement the page**

Create `src/pages/PaymentMethods/index.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Typography } from '@mui/material';

import B3Spin from '@/components/spin/B3Spin';
import { useB3Lang } from '@/lib/lang';
import { useAppSelector } from '@/store';

import { isPaymentMethodsAvailable, listStoredInstruments, PaymentMethodsError } from './api';
import PaymentMethodRow from './components/PaymentMethodRow';

function PaymentMethods() {
  const b3Lang = useB3Lang();
  const customerId = useAppSelector(({ company }) => company.customer.id);
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  // The JWT identifies the logged-in customer, so a masquerading rep must not manage cards here.
  const isAvailable = isPaymentMethodsAvailable() && !isAgenting;

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['storedInstruments', customerId],
    queryFn: listStoredInstruments,
    enabled: isAvailable,
  });

  if (!isAvailable) {
    return (
      <Box>
        <Typography variant="h4">{b3Lang('paymentMethods.title')}</Typography>
        <Typography sx={{ mt: 2 }}>{b3Lang('paymentMethods.unavailable')}</Typography>
      </Box>
    );
  }

  const isSessionExpired = error instanceof PaymentMethodsError && error.kind === 'sessionExpired';

  return (
    <B3Spin isSpinning={isFetching}>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%' }}>
        <Typography variant="h4" sx={{ mb: 3 }}>
          {b3Lang('paymentMethods.title')}
        </Typography>
        {isSessionExpired && (
          <Alert severity="warning">{b3Lang('paymentMethods.sessionExpired')}</Alert>
        )}
        {isError && !isSessionExpired && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                {b3Lang('paymentMethods.retry')}
              </Button>
            }
          >
            {b3Lang('paymentMethods.loadError')}
          </Alert>
        )}
        {data && data.instruments.length === 0 && (
          <Typography>{b3Lang('paymentMethods.empty')}</Typography>
        )}
        {data &&
          data.instruments.map((instrument) => (
            <PaymentMethodRow key={instrument.token} instrument={instrument} />
          ))}
      </Box>
    </B3Spin>
  );
}

export default PaymentMethods;
```

- [ ] **Step 6: Run the tests — expect pass**

Run: `yarn vitest run src/pages/PaymentMethods`

Expected: PASS — 7 tests in `index.test.tsx`, 1 in `index.platform.test.tsx` (plus the 11 API tests from Task 1).

- [ ] **Step 7: Commit**

```bash
git add src/pages/PaymentMethods src/lib/lang/locales/en.json
git commit -m "feat: add payment methods page with saved card list and states"
```

---

## Task 3: Set-as-default mutation (TDD)

**Files:**
- Modify: `src/pages/PaymentMethods/components/PaymentMethodRow.tsx`
- Modify: `src/pages/PaymentMethods/index.tsx`
- Modify: `src/pages/PaymentMethods/index.test.tsx`
- Modify: `src/lib/lang/locales/en.json`

- [ ] **Step 1: Add the locale keys**

In `src/lib/lang/locales/en.json`, add next to the existing `paymentMethods.*` keys:

```json
"paymentMethods.setAsDefault": "Set as default",
"paymentMethods.defaultUpdated": "Default card updated",
"paymentMethods.errors.notFound": "That card no longer exists.",
"paymentMethods.errors.rateLimited": "Too many requests — please try again in a minute.",
"paymentMethods.errors.generic": "Something went wrong. Please try again.",
```

- [ ] **Step 2: Add failing tests**

In `src/pages/PaymentMethods/index.test.tsx`:

(a) Add the snackbar mock directly below the existing imports (vi.mock is hoisted, so placement near the top keeps it readable):

```tsx
import { snackbar } from '@/utils/b3Tip';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
```

(b) Append these tests:

```tsx
it('sets a card as default and re-renders from the refreshed list', async () => {
  const visa = buildStoredInstrumentWith({ brand: 'VISA', last4: '4242', isDefault: true });
  const amex = buildStoredInstrumentWith({ brand: 'AMEX', last4: '0005', isDefault: false });

  mockJwt();
  mockList([visa, amex]);

  const requestBody = vi.fn();

  server.use(
    http.post(
      `${apiBase}/customers/Customer/SetDefaultStoredInstrument`,
      async ({ request }) => {
        requestBody(await request.json());

        return HttpResponse.json({
          customerId: 999,
          instruments: [
            { ...visa, isDefault: false },
            { ...amex, isDefault: true },
          ],
        });
      },
    ),
  );

  const { user } = renderWithProviders(<PaymentMethods />);

  // only the non-default AMEX row offers the action
  await user.click(await screen.findByRole('button', { name: 'Set as default' }));

  expect(requestBody).toHaveBeenCalledWith({ jwt: 'fresh-jwt', token: amex.token });
  expect(await screen.findByText('AMEX •••• 0005')).toBeInTheDocument();
  expect(snackbar.success).toHaveBeenCalledWith('Default card updated');
  // refreshed list flips the chip: still exactly one Default chip
  expect(screen.getAllByText('Default')).toHaveLength(1);
});

it('does not offer set-as-default on the default card', async () => {
  mockJwt();
  mockList([buildStoredInstrumentWith({ isDefault: true })]);

  renderWithProviders(<PaymentMethods />);

  expect(await screen.findByText('Default')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Set as default' })).not.toBeInTheDocument();
});

it('disables row actions while a mutation is pending', async () => {
  mockJwt();
  mockList([
    buildStoredInstrumentWith({ isDefault: false }),
    buildStoredInstrumentWith({ isDefault: false }),
  ]);
  server.use(
    http.post(`${apiBase}/customers/Customer/SetDefaultStoredInstrument`, async () => {
      await delay('infinite');

      return HttpResponse.json({ customerId: 999, instruments: [] });
    }),
  );

  const { user } = renderWithProviders(<PaymentMethods />);

  const buttons = await screen.findAllByRole('button', { name: 'Set as default' });

  await user.click(buttons[0]);

  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: 'Set as default' })[1]).toBeDisabled();
  });
});

it('refetches the list when set-as-default reports the card no longer exists', async () => {
  const card = buildStoredInstrumentWith({ isDefault: false });
  const listRequests = vi.fn();

  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () => {
      listRequests();

      return HttpResponse.json({ customerId: 999, instruments: [card] });
    }),
    http.post(`${apiBase}/customers/Customer/SetDefaultStoredInstrument`, () =>
      HttpResponse.json({ error: 'instrument_not_found' }, { status: 404 }),
    ),
  );

  const { user } = renderWithProviders(<PaymentMethods />);

  await user.click(await screen.findByRole('button', { name: 'Set as default' }));

  await waitFor(() => {
    expect(snackbar.error).toHaveBeenCalledWith('That card no longer exists.');
  });
  await waitFor(() => {
    expect(listRequests).toHaveBeenCalledTimes(2);
  });
});
```

(c) Add `delay` and `waitFor` to the `tests/test-utils` import list at the top of the file.

- [ ] **Step 3: Run the tests — expect failure**

Run: `yarn vitest run src/pages/PaymentMethods/index.test.tsx`

Expected: the four new tests FAIL (no 'Set as default' button exists yet); the seven existing tests still pass.

- [ ] **Step 4: Add the action to the row component**

Replace the full contents of `src/pages/PaymentMethods/components/PaymentMethodRow.tsx` with:

```tsx
import { Box, Button, Card, CardContent, Chip, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { StoredInstrument } from '../api';

interface PaymentMethodRowProps {
  instrument: StoredInstrument;
  disableActions: boolean;
  onSetDefault: () => void;
}

// A card is valid through the last day of its expiry month.
const isExpired = ({ expiryYear, expiryMonth }: StoredInstrument) =>
  new Date(expiryYear, expiryMonth, 1) <= new Date();

function PaymentMethodRow({ instrument, disableActions, onSetDefault }: PaymentMethodRowProps) {
  const b3Lang = useB3Lang();

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: '12rem' }}>
          <Typography variant="subtitle1">
            {b3Lang('paymentMethods.cardLabel', {
              brand: instrument.brand,
              last4: instrument.last4,
            })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('paymentMethods.expires', {
              month: String(instrument.expiryMonth).padStart(2, '0'),
              year: instrument.expiryYear,
            })}
          </Typography>
        </Box>
        {instrument.isDefault && (
          <Chip label={b3Lang('paymentMethods.default')} color="primary" size="small" />
        )}
        {isExpired(instrument) && (
          <Chip label={b3Lang('paymentMethods.expired')} color="warning" size="small" />
        )}
        {!instrument.isDefault && (
          <Button size="small" disabled={disableActions} onClick={onSetDefault}>
            {b3Lang('paymentMethods.setAsDefault')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default PaymentMethodRow;
```

- [ ] **Step 5: Wire the mutation in the page**

Replace the full contents of `src/pages/PaymentMethods/index.tsx` with:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Typography } from '@mui/material';

import B3Spin from '@/components/spin/B3Spin';
import { useB3Lang } from '@/lib/lang';
import { useAppSelector } from '@/store';
import { snackbar } from '@/utils/b3Tip';

import {
  isPaymentMethodsAvailable,
  listStoredInstruments,
  PaymentMethodsError,
  setDefaultStoredInstrument,
} from './api';
import PaymentMethodRow from './components/PaymentMethodRow';

function PaymentMethods() {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();
  const customerId = useAppSelector(({ company }) => company.customer.id);
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  // The JWT identifies the logged-in customer, so a masquerading rep must not manage cards here.
  const isAvailable = isPaymentMethodsAvailable() && !isAgenting;

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['storedInstruments', customerId],
    queryFn: listStoredInstruments,
    enabled: isAvailable,
  });

  const handleMutationError = (err: unknown) => {
    if (err instanceof PaymentMethodsError) {
      if (err.kind === 'notFound') {
        snackbar.error(b3Lang('paymentMethods.errors.notFound'));
        queryClient.invalidateQueries({ queryKey: ['storedInstruments', customerId] });
        return;
      }
      if (err.kind === 'rateLimited') {
        snackbar.error(b3Lang('paymentMethods.errors.rateLimited'));
        return;
      }
      if (err.kind === 'sessionExpired') {
        snackbar.error(b3Lang('paymentMethods.sessionExpired'));
        return;
      }
    }
    snackbar.error(b3Lang('paymentMethods.errors.generic'));
  };

  const setDefaultMutation = useMutation({
    mutationFn: setDefaultStoredInstrument,
    onSuccess: (refreshed) => {
      queryClient.setQueryData(['storedInstruments', customerId], refreshed);
      snackbar.success(b3Lang('paymentMethods.defaultUpdated'));
    },
    onError: handleMutationError,
  });

  if (!isAvailable) {
    return (
      <Box>
        <Typography variant="h4">{b3Lang('paymentMethods.title')}</Typography>
        <Typography sx={{ mt: 2 }}>{b3Lang('paymentMethods.unavailable')}</Typography>
      </Box>
    );
  }

  const isSessionExpired = error instanceof PaymentMethodsError && error.kind === 'sessionExpired';
  const isMutating = setDefaultMutation.isPending;

  return (
    <B3Spin isSpinning={isFetching}>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%' }}>
        <Typography variant="h4" sx={{ mb: 3 }}>
          {b3Lang('paymentMethods.title')}
        </Typography>
        {isSessionExpired && (
          <Alert severity="warning">{b3Lang('paymentMethods.sessionExpired')}</Alert>
        )}
        {isError && !isSessionExpired && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                {b3Lang('paymentMethods.retry')}
              </Button>
            }
          >
            {b3Lang('paymentMethods.loadError')}
          </Alert>
        )}
        {data && data.instruments.length === 0 && (
          <Typography>{b3Lang('paymentMethods.empty')}</Typography>
        )}
        {data &&
          data.instruments.map((instrument) => (
            <PaymentMethodRow
              key={instrument.token}
              instrument={instrument}
              disableActions={isMutating}
              onSetDefault={() => setDefaultMutation.mutate(instrument.token)}
            />
          ))}
      </Box>
    </B3Spin>
  );
}

export default PaymentMethods;
```

- [ ] **Step 6: Run the tests — expect pass**

Run: `yarn vitest run src/pages/PaymentMethods/index.test.tsx`

Expected: PASS, 11 tests.

- [ ] **Step 7: Commit**

```bash
git add src/pages/PaymentMethods src/lib/lang/locales/en.json
git commit -m "feat: add set-as-default action to payment methods page"
```

---

## Task 4: Delete with confirmation dialog (TDD)

**Files:**
- Modify: `src/pages/PaymentMethods/components/PaymentMethodRow.tsx`
- Modify: `src/pages/PaymentMethods/index.tsx`
- Modify: `src/pages/PaymentMethods/index.test.tsx`
- Modify: `src/lib/lang/locales/en.json`

- [ ] **Step 1: Add the locale keys**

In `src/lib/lang/locales/en.json`, add next to the existing `paymentMethods.*` keys:

```json
"paymentMethods.delete": "Delete",
"paymentMethods.deleteDialog.title": "Delete card?",
"paymentMethods.deleteDialog.content": "{card} will be permanently removed from your saved cards and from your payment provider, and will no longer be available at checkout. This cannot be undone.",
"paymentMethods.deleteDialog.cancel": "Cancel",
"paymentMethods.deleteDialog.confirm": "Delete",
"paymentMethods.deleted": "Card deleted",
```

- [ ] **Step 2: Add failing tests**

Append to `src/pages/PaymentMethods/index.test.tsx`:

```tsx
it('deletes a card after confirmation and re-renders from the refreshed list', async () => {
  const visa = buildStoredInstrumentWith({ brand: 'VISA', last4: '4242', isDefault: true });
  const amex = buildStoredInstrumentWith({ brand: 'AMEX', last4: '0005', isDefault: false });

  mockJwt();
  mockList([visa, amex]);

  const requestBody = vi.fn();

  server.use(
    http.post(`${apiBase}/customers/Customer/DeleteStoredInstrument`, async ({ request }) => {
      requestBody(await request.json());

      return HttpResponse.json({ customerId: 999, instruments: [visa] });
    }),
  );

  const { user } = renderWithProviders(<PaymentMethods />);

  await screen.findByText('AMEX •••• 0005');

  // each row has a Delete button; the second belongs to the AMEX row
  await user.click(screen.getAllByRole('button', { name: 'Delete' })[1]);

  expect(
    await screen.findByText(
      'AMEX •••• 0005 will be permanently removed from your saved cards and from your payment provider, and will no longer be available at checkout. This cannot be undone.',
    ),
  ).toBeInTheDocument();

  // the dialog's confirm button is the last "Delete" button in the document
  const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
  await user.click(deleteButtons[deleteButtons.length - 1]);

  expect(requestBody).toHaveBeenCalledWith({ jwt: 'fresh-jwt', token: amex.token });
  await waitFor(() => {
    expect(screen.queryByText('AMEX •••• 0005')).not.toBeInTheDocument();
  });
  expect(snackbar.success).toHaveBeenCalledWith('Card deleted');
});

it('does not delete when the confirmation dialog is cancelled', async () => {
  const deleteRequests = vi.fn();

  mockJwt();
  mockList([buildStoredInstrumentWith({ brand: 'VISA', last4: '4242' })]);
  server.use(
    http.post(`${apiBase}/customers/Customer/DeleteStoredInstrument`, () => {
      deleteRequests();

      return HttpResponse.json({ customerId: 999, instruments: [] });
    }),
  );

  const { user } = renderWithProviders(<PaymentMethods />);

  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  await user.click(await screen.findByRole('button', { name: 'Cancel' }));

  expect(deleteRequests).not.toHaveBeenCalled();
  expect(screen.getByText('VISA •••• 4242')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the tests — expect failure**

Run: `yarn vitest run src/pages/PaymentMethods/index.test.tsx`

Expected: the two new tests FAIL (no 'Delete' button exists yet); the eleven existing tests still pass.

- [ ] **Step 4: Add the delete button to the row component**

Replace the full contents of `src/pages/PaymentMethods/components/PaymentMethodRow.tsx` with:

```tsx
import { Box, Button, Card, CardContent, Chip, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { StoredInstrument } from '../api';

interface PaymentMethodRowProps {
  instrument: StoredInstrument;
  disableActions: boolean;
  onSetDefault: () => void;
  onDelete: () => void;
}

// A card is valid through the last day of its expiry month.
const isExpired = ({ expiryYear, expiryMonth }: StoredInstrument) =>
  new Date(expiryYear, expiryMonth, 1) <= new Date();

function PaymentMethodRow({
  instrument,
  disableActions,
  onSetDefault,
  onDelete,
}: PaymentMethodRowProps) {
  const b3Lang = useB3Lang();

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: '12rem' }}>
          <Typography variant="subtitle1">
            {b3Lang('paymentMethods.cardLabel', {
              brand: instrument.brand,
              last4: instrument.last4,
            })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('paymentMethods.expires', {
              month: String(instrument.expiryMonth).padStart(2, '0'),
              year: instrument.expiryYear,
            })}
          </Typography>
        </Box>
        {instrument.isDefault && (
          <Chip label={b3Lang('paymentMethods.default')} color="primary" size="small" />
        )}
        {isExpired(instrument) && (
          <Chip label={b3Lang('paymentMethods.expired')} color="warning" size="small" />
        )}
        {!instrument.isDefault && (
          <Button size="small" disabled={disableActions} onClick={onSetDefault}>
            {b3Lang('paymentMethods.setAsDefault')}
          </Button>
        )}
        <Button size="small" color="error" disabled={disableActions} onClick={onDelete}>
          {b3Lang('paymentMethods.delete')}
        </Button>
      </CardContent>
    </Card>
  );
}

export default PaymentMethodRow;
```

- [ ] **Step 5: Wire the dialog and mutation in the page**

Replace the full contents of `src/pages/PaymentMethods/index.tsx` with:

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Typography } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import B3Spin from '@/components/spin/B3Spin';
import { useB3Lang } from '@/lib/lang';
import { useAppSelector } from '@/store';
import { snackbar } from '@/utils/b3Tip';

import {
  deleteStoredInstrument,
  isPaymentMethodsAvailable,
  listStoredInstruments,
  PaymentMethodsError,
  setDefaultStoredInstrument,
  StoredInstrument,
} from './api';
import PaymentMethodRow from './components/PaymentMethodRow';

function PaymentMethods() {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<StoredInstrument | null>(null);
  const customerId = useAppSelector(({ company }) => company.customer.id);
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  // The JWT identifies the logged-in customer, so a masquerading rep must not manage cards here.
  const isAvailable = isPaymentMethodsAvailable() && !isAgenting;

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['storedInstruments', customerId],
    queryFn: listStoredInstruments,
    enabled: isAvailable,
  });

  const handleMutationError = (err: unknown) => {
    if (err instanceof PaymentMethodsError) {
      if (err.kind === 'notFound') {
        snackbar.error(b3Lang('paymentMethods.errors.notFound'));
        queryClient.invalidateQueries({ queryKey: ['storedInstruments', customerId] });
        return;
      }
      if (err.kind === 'rateLimited') {
        snackbar.error(b3Lang('paymentMethods.errors.rateLimited'));
        return;
      }
      if (err.kind === 'sessionExpired') {
        snackbar.error(b3Lang('paymentMethods.sessionExpired'));
        return;
      }
    }
    snackbar.error(b3Lang('paymentMethods.errors.generic'));
  };

  const setDefaultMutation = useMutation({
    mutationFn: setDefaultStoredInstrument,
    onSuccess: (refreshed) => {
      queryClient.setQueryData(['storedInstruments', customerId], refreshed);
      snackbar.success(b3Lang('paymentMethods.defaultUpdated'));
    },
    onError: handleMutationError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStoredInstrument,
    onSuccess: (refreshed) => {
      queryClient.setQueryData(['storedInstruments', customerId], refreshed);
      setPendingDelete(null);
      snackbar.success(b3Lang('paymentMethods.deleted'));
    },
    onError: (err) => {
      setPendingDelete(null);
      handleMutationError(err);
    },
  });

  if (!isAvailable) {
    return (
      <Box>
        <Typography variant="h4">{b3Lang('paymentMethods.title')}</Typography>
        <Typography sx={{ mt: 2 }}>{b3Lang('paymentMethods.unavailable')}</Typography>
      </Box>
    );
  }

  const isSessionExpired = error instanceof PaymentMethodsError && error.kind === 'sessionExpired';
  const isMutating = setDefaultMutation.isPending || deleteMutation.isPending;

  return (
    <B3Spin isSpinning={isFetching}>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%' }}>
        <Typography variant="h4" sx={{ mb: 3 }}>
          {b3Lang('paymentMethods.title')}
        </Typography>
        {isSessionExpired && (
          <Alert severity="warning">{b3Lang('paymentMethods.sessionExpired')}</Alert>
        )}
        {isError && !isSessionExpired && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                {b3Lang('paymentMethods.retry')}
              </Button>
            }
          >
            {b3Lang('paymentMethods.loadError')}
          </Alert>
        )}
        {data && data.instruments.length === 0 && (
          <Typography>{b3Lang('paymentMethods.empty')}</Typography>
        )}
        {data &&
          data.instruments.map((instrument) => (
            <PaymentMethodRow
              key={instrument.token}
              instrument={instrument}
              disableActions={isMutating}
              onSetDefault={() => setDefaultMutation.mutate(instrument.token)}
              onDelete={() => setPendingDelete(instrument)}
            />
          ))}
        <B3Dialog
          isOpen={Boolean(pendingDelete)}
          title={b3Lang('paymentMethods.deleteDialog.title')}
          leftSizeBtn={b3Lang('paymentMethods.deleteDialog.cancel')}
          rightSizeBtn={b3Lang('paymentMethods.deleteDialog.confirm')}
          loading={deleteMutation.isPending}
          handleLeftClick={() => setPendingDelete(null)}
          handRightClick={() => {
            if (pendingDelete) {
              deleteMutation.mutate(pendingDelete.token);
            }
          }}
        >
          <Box>
            {pendingDelete &&
              b3Lang('paymentMethods.deleteDialog.content', {
                card: b3Lang('paymentMethods.cardLabel', {
                  brand: pendingDelete.brand,
                  last4: pendingDelete.last4,
                }),
              })}
          </Box>
        </B3Dialog>
      </Box>
    </B3Spin>
  );
}

export default PaymentMethods;
```

- [ ] **Step 6: Run the tests — expect pass**

Run: `yarn vitest run src/pages/PaymentMethods/index.test.tsx`

Expected: PASS, 13 tests. If the dialog-button selection in the first new test is ambiguous (B3Dialog may render its confirm button differently), inspect with `screen.logTestingPlaygroundURL()` and select the confirm button within the dialog via `within(screen.getByRole('dialog'))` instead — `within` is exported from `tests/test-utils`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/PaymentMethods src/lib/lang/locales/en.json
git commit -m "feat: add delete-with-confirmation to payment methods page"
```

---

## Task 5: Route registration, nav gating, and final verification

**Files:**
- Modify: `src/shared/routeList.ts`
- Modify: `src/shared/routes/index.tsx`
- Modify: `src/lib/lang/locales/en.json`

- [ ] **Step 1: Add the nav locale key**

In `src/lib/lang/locales/en.json`, next to `"global.navMenu.manageSubscriptions"`:

```json
"global.navMenu.paymentMethods": "Payment methods",
```

- [ ] **Step 2: Add the route entry**

In `src/shared/routeList.ts`, immediately after the `/manage-subscriptions` entry (which is the model for this route — `accountSettingPermissions`, no `configKey`), add:

```ts
  {
    path: '/payment-methods',
    name: 'Payment methods',
    wsKey: 'paymentMethods',
    isMenuItem: true,
    permissions: accountSettingPermissions,
    isTokenLogin: true,
    idLang: 'global.navMenu.paymentMethods',
  },
```

- [ ] **Step 3: Gate the route on platform + BC_CONTEXT + agenting**

In `src/shared/routeList.ts`:

(a) Add to the imports (alongside the existing `@/utils/...` import):

```ts
import { platform } from '@/utils/basicConfig';
```

(b) Inside `getAllowedRoutesWithoutComponent`, directly after the line

```ts
    const { permissions = [], permissionCodes, path } = item;
```

add (`isAgenting` is already destructured at the top of this function):

```ts
    // /payment-methods is Stencil-only, host-configured, and hidden while agenting —
    // the Current Customer JWT identifies the logged-in rep, not the masqueraded buyer.
    if (
      path === '/payment-methods' &&
      (platform !== 'bigcommerce' || !window.BC_CONTEXT?.paymentMethods || isAgenting)
    ) {
      return false;
    }
```

- [ ] **Step 4: Register the lazy component**

In `src/shared/routes/index.tsx`:

(a) Add to the lazy-import block (alphabetical placement next to `PDP`):

```ts
const PaymentMethods = lazy(() => import('@/pages/PaymentMethods'));
```

(b) Add to `routesMap`:

```ts
  '/payment-methods': PaymentMethods,
```

- [ ] **Step 5: Type-check**

Run: `yarn tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Run the page tests and the full suite**

Run: `yarn vitest run src/pages/PaymentMethods`

Expected: PASS — 11 tests in `api.test.ts` + 13 in `index.test.tsx` + 1 in `index.platform.test.tsx` (25 total).

Run: `yarn vitest run`

Expected: full suite passes (pre-existing failures, if any, must match a clean checkout — compare with `git stash` if unsure).

- [ ] **Step 7: Lint**

Run: `yarn lint`

Expected: dependency-cruiser, ESLint (`--max-warnings 0`), and knip all pass. If knip flags an unused export in `src/pages/PaymentMethods/api.ts`, remove the `export` keyword from anything not imported elsewhere (only `StoredInstrument`, `PaymentMethodsError`, `isPaymentMethodsAvailable`, and the three endpoint functions should be exported).

- [ ] **Step 8: Commit**

```bash
git add src/shared/routeList.ts src/shared/routes/index.tsx src/lib/lang/locales/en.json
git commit -m "feat: register gated /payment-methods route and nav entry"
```

---

## Out of scope reminders (do not build)

- No add-card flow, no card editing, no use of the `GetStoredInstrument` endpoint.
- No Redux slice, Context provider, or storage state.
- No backend/gateway changes. CORS for `/customers/Customer/*` from the storefront origin is a **backend prerequisite** tracked in the spec's rollout list — the page cannot work in a real browser until it's confirmed.
- Host-page delivery of `BC_CONTEXT.paymentMethods` (apiBase + the SSW app's client id) happens in the host project, not this repo.
