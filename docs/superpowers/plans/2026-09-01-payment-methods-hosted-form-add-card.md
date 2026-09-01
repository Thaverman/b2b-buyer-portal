# Payment Methods Hosted-Form Add-Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In-portal add-a-saved-card using BigCommerce's stored-card hosted form (provider-iframe card fields, no new PCI scope), with a native-page link-out fallback — replacing the merged-but-superseded Braintree Drop-in implementation.

**Architecture:** A parent-DOM MUI dialog (the SDK only initializes in the top realm with containers in the top document; the portal renders in the ThemeFrame, so the dialog deliberately escapes it via MUI's default portal target plus its own emotion cache). Vault access (VAT token + shopperId + storeHash) is scraped same-origin from the native add-payment-method page context behind a `vaultAccess.ts` seam. Billing address prefills from the BigCommerce address book, editable. Gating is tri-state: dialog / hidden (Preferred) / link-out.

**Tech Stack:** React 18, MUI, @tanstack/react-query, `@bigcommerce/checkout-sdk` **pinned 1.967.0** (dynamic import), Vitest + Testing Library + MSW.

**Spec:** `docs/superpowers/specs/2026-09-01-payment-methods-add-card-hosted-form-design.md` — read it first; §2 is spike-verified fact, §5 the design. It SUPERSEDES the 2026-08-26 Braintree spec whose implementation is currently merged on dev and gets removed in Task 1.

## Global Constraints

- **Working directory for every command:** `apps/storefront/`. Run a test file once with `yarn test --run <path>` (`yarn test` alone is watch mode and hangs an agent).
- **Never log** the vault token, PAN, or CVV. Card data never touches our DOM — only BigCommerce's iframes.
- Constants (exact values): payments host `https://payments.bigcommerce.com`; provider id `braintree`; currency `USD`; native add page path `/account.php?action=add_payment_method&provider=braintree&method_type=CARD`.
- `submitStoredCard(fields, data)`: `fields` is **FLAT** — `defaultInstrument` plus billing keys (`email`, `address1`, `address2?`, `city`, `postalCode`, `countryCode`, `company?`, `firstName`, `lastName`, `phone?`, `stateOrProvinceCode?`); everything except `defaultInstrument` becomes the attach's `billing_address`. `data` needs `currencyCode`, `paymentsUrl`, `providerId`, `shopperId` (**string**), `storeHash`, `vaultToken`. Resolves with no body → always re-fetch `StoredInstruments`.
- Failure carries no detail (`STORED_CARD_FAILED`, empty payload) — one generic failure message; never wording that blames the card or our systems specifically.
- Our API stays PascalCase (`Jwt`, `Token`); `source` stays on the DTO; list/set-default/delete untouched.
- Dev baseline is red: diff failures vs baseline, never expect a green full suite; do not patch pre-existing redness. TDD: every behavior's test must be seen failing first; the red run is the negative control (revert-and-rerun for omission tests).
- Commit subject: `type: B2B-0000 Short description`.
- Import via `@/` / `tests/` aliases; test utilities only from `tests/test-utils`; builders for test data; named MUI imports; no new Redux slices/Contexts/web-storage.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/pages/PaymentMethods/dropin.ts` + `dropin.test.ts` | **Delete** | Superseded Braintree loader |
| `src/pages/PaymentMethods/api.ts` | Modify | Remove `getVaultClientToken`/`vaultInstrument`/`declined` kind; keep PascalCase, `source`, `fetchJson`/`post` split |
| `src/pages/PaymentMethods/vaultAccess.ts` (+test) | Create | Scrape VAT/shopperId/storeHash from native page; tri-state result |
| `src/pages/PaymentMethods/hostedForm.ts` (+test) | Create | checkout-sdk wrapper: init hosted fields, submit, teardown |
| `src/pages/PaymentMethods/billingPrefill.ts` (+test) | Create | Address-book prefill incl. state-name→code mapping |
| `src/pages/PaymentMethods/components/AddPaymentMethodDialog.tsx` | Create (replaces `AddPaymentMethod.tsx`, deleted) | Parent-DOM dialog: hosted fields + editable billing + save flow |
| `src/pages/PaymentMethods/index.tsx` | Modify | `['vaultAccess']` gating query, tri-state affordance, empty-copy branch, refresh-on-added |
| `src/shared/routeList.ts` + `src/shared/routes/index.tsx` | Modify | Native payment-methods takeover carve-out |
| `src/lib/lang/locales/en.json` | Modify | Rework `paymentMethods.addCard.*` keys |
| `src/pages/PaymentMethods/index.test.tsx` | Modify | Gating/dialog/save-flow tests |
| `apps/storefront/package.json` | Modify | `@bigcommerce/checkout-sdk@1.967.0` (exact) |

---

### Task 1: Remove the superseded Braintree add-card implementation

**Files:**
- Delete: `src/pages/PaymentMethods/dropin.ts`, `src/pages/PaymentMethods/dropin.test.ts`, `src/pages/PaymentMethods/components/AddPaymentMethod.tsx`
- Modify: `src/pages/PaymentMethods/api.ts`, `src/pages/PaymentMethods/index.tsx`, `src/pages/PaymentMethods/api.test.ts`, `src/pages/PaymentMethods/index.test.tsx`, `src/lib/lang/locales/en.json`

**Interfaces:**
- Produces: `api.ts` back to exactly four exports used by the page (`isPaymentMethodsAvailable`, `listStoredInstruments`, `setDefaultStoredInstrument`, `deleteStoredInstrument`) plus `PaymentMethodsError` (kinds `sessionExpired | notFound | rateLimited | upstream`, no `declineReason`) and `StoredInstrument` (WITH `source`). `index.tsx` renders exactly the pre-add-card page. The PascalCase bodies, `source` field, and the `fetchJson`/`post` transport split all REMAIN.

- [ ] **Step 1: Delete the dead files.**

```bash
git rm src/pages/PaymentMethods/dropin.ts src/pages/PaymentMethods/dropin.test.ts src/pages/PaymentMethods/components/AddPaymentMethod.tsx
```

- [ ] **Step 2: Strip `api.ts`.**

Remove: the `getVaultClientToken` and `vaultInstrument` exported functions (bottom of file); the `'declined'` member of `PaymentMethodsErrorKind`; the `declineReason` property and constructor parameter of `PaymentMethodsError` (back to `constructor(kind: PaymentMethodsErrorKind)`); the whole `if (response.status === 422) { … }` block in `fetchJson`. Keep everything else (incl. `normalizeInstrument` — `normalize` uses it).

- [ ] **Step 3: Strip `index.tsx`.**

Remove: the `AddPaymentMethod` and `getVaultClientToken` imports; the `['vaultClientToken', customerId]` `useQuery` block and its comment; `handleAdded`; the `{vaultClientToken && <AddPaymentMethod …/>}` JSX; revert the empty-state to the original single line:

```tsx
        {data && data.instruments.length === 0 && (
          <Typography>{b3Lang('paymentMethods.empty')}</Typography>
        )}
```

- [ ] **Step 4: Strip the tests and lang keys.**

- `api.test.ts`: delete the `describe('getVaultClientToken', …)` and `describe('vaultInstrument', …)` blocks and remove `getVaultClientToken, vaultInstrument` from the `./api` import. Keep the PascalCase and `source` tests.
- `index.test.tsx`: delete the `vi.mock('./dropin', …)` block and its import line, `fakeDropinInstance`, `fakeThemeFrame`, `mockClientToken`, `mockClientTokenUnavailable`, the `vi.mocked(createDropin)…` line inside `beforeEach`, and the three describes `add card gating`, `add card form`, `saving a card`. Keep everything else (incl. the `source` line in `buildStoredInstrumentWith`).
- `en.json`: delete all nine `paymentMethods.addCard.*` lines (Task 5 re-adds the reworked set).

- [ ] **Step 5: Verify green + types.**

Run: `yarn test --run src/pages/PaymentMethods && yarn tsc --noEmit`
Expected: PASS — `api.test.ts` (PascalCase + source tests intact), `index.test.tsx` (original page tests), `index.platform.test.tsx`; tsc clean. (This is a pure-removal task; the guard is the surviving suite staying green, not a new red test.)

- [ ] **Step 6: Commit.**

```bash
git add -A src/pages/PaymentMethods src/lib/lang/locales/en.json
git commit -m "refactor: B2B-0000 Remove superseded Braintree add-card implementation"
```

---

### Task 2: `vaultAccess.ts` — scrape the vault token from the native page

**Files:**
- Create: `src/pages/PaymentMethods/vaultAccess.ts`
- Test: `src/pages/PaymentMethods/vaultAccess.test.ts`

**Interfaces:**
- Consumes: `PaymentMethodsError` from `./api`.
- Produces (Tasks 5–6 depend on these exact names):

```ts
export const NATIVE_ADD_PAYMENT_METHOD_PATH =
  '/account.php?action=add_payment_method&provider=braintree&method_type=CARD';

export type VaultAccess =
  | { state: 'available'; vaultToken: string; shopperId: string; storeHash: string }
  | { state: 'unavailable' };

export const getVaultAccess: () => Promise<VaultAccess>; // throws PaymentMethodsError('upstream')
```

- [ ] **Step 1: Write the failing tests.**

Create `src/pages/PaymentMethods/vaultAccess.test.ts`. The fixtures mirror the real page: the theme calls `window.stencilBootstrap("account_addpaymentmethod", "<JSON string>")`, so the context arrives **JSON-escaped** (`\"vaultToken\":\"VAT …\"`). The spike's first scrape captured a trailing backslash with a naive `[^"]+` — the token charset test below pins the fix.

```ts
import { http, HttpResponse, startMockServer } from 'tests/test-utils';

import { getVaultAccess, NATIVE_ADD_PAYMENT_METHOD_PATH } from './vaultAccess';

const { server } = startMockServer();

// Escaped exactly like the live page: stencilBootstrap's second argument is a JSON *string*.
const availablePage = `<html><body><script>
window.stencilBootstrap("account_addpaymentmethod", "{\\"paymentsUrl\\":\\"https://payments.bigcommerce.com\\",\\"storeHash\\":\\"24erkpw9h6\\",\\"vaultToken\\":\\"VAT abc.DEF_12-3\\",\\"shopperId\\":\\"80591\\"}");
</script></body></html>`;

const noGatewayPage = `<html><body><script>
window.stencilBootstrap("account_addpaymentmethod", "{\\"paymentsUrl\\":\\"https://payments.bigcommerce.com\\"}");
</script></body></html>`;

const challengePage = '<html><head><title>Just a moment...</title></head><body>Verifying</body></html>';

const mockNativePage = (body: string, status = 200) =>
  server.use(http.get('*/account.php', () => new HttpResponse(body, { status, headers: { 'Content-Type': 'text/html' } })));

it('extracts the token, shopper id and store hash from the escaped page context', async () => {
  mockNativePage(availablePage);

  await expect(getVaultAccess()).resolves.toEqual({
    state: 'available',
    vaultToken: 'VAT abc.DEF_12-3', // exact — no trailing backslash from the JSON escaping
    shopperId: '80591',
    storeHash: '24erkpw9h6',
  });
});

it('reports unavailable when the theme page renders without a vault token (no gateway)', async () => {
  mockNativePage(noGatewayPage);

  await expect(getVaultAccess()).resolves.toEqual({ state: 'unavailable' });
});

it('throws upstream for a bot-challenge page (200 but not a theme page)', async () => {
  mockNativePage(challengePage);

  await expect(getVaultAccess()).rejects.toMatchObject({ kind: 'upstream' });
});

it('throws upstream on a non-200 response', async () => {
  mockNativePage('forbidden', 403);

  await expect(getVaultAccess()).rejects.toMatchObject({ kind: 'upstream' });
});

it('throws upstream on a network failure', async () => {
  server.use(http.get('*/account.php', () => HttpResponse.error()));

  await expect(getVaultAccess()).rejects.toMatchObject({ kind: 'upstream' });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `yarn test --run src/pages/PaymentMethods/vaultAccess.test.ts`
Expected: FAIL — module `./vaultAccess` does not exist.

- [ ] **Step 3: Implement `vaultAccess.ts`.**

```ts
import { PaymentMethodsError } from './api';

// The BigCommerce storefront mints the vault access token (VAT, ~30 min TTL) into the
// native add-payment-method page context; checkout-sdk's stored-card hosted form only
// accepts that token flavor (it has NO code path for our backend's IAT — spike-verified
// 2026-09-01, see the spec §2.3). This module is the seam: if the SDK ever accepts IATs,
// swap the scrape for a VaultInstrumentToken call and delete the regexes.
export const NATIVE_ADD_PAYMENT_METHOD_PATH =
  '/account.php?action=add_payment_method&provider=braintree&method_type=CARD';

export type VaultAccess =
  | { state: 'available'; vaultToken: string; shopperId: string; storeHash: string }
  | { state: 'unavailable' };

// The page context is a JSON *string* argument to stencilBootstrap, so quotes arrive
// escaped (\"vaultToken\":\"VAT …\"). Match the escaped and plain forms; the token
// charset is explicit because [^"]+ would swallow the escape backslash before the
// closing quote and poison the Authorization header.
const VAULT_TOKEN_PATTERN = /vaultToken\\?":\\?"(VAT [A-Za-z0-9._-]+)/;
const SHOPPER_ID_PATTERN = /shopperId\\?":\\?"?(\d+)/;
const STORE_HASH_PATTERN = /storeHash\\?":\\?"([a-z0-9]+)/;
// Present on every rendered theme page; a bot-challenge or outage page lacks it.
const THEME_PAGE_MARKER = 'stencilBootstrap';

export const getVaultAccess = async (): Promise<VaultAccess> => {
  let response: Response;
  try {
    response = await fetch(NATIVE_ADD_PAYMENT_METHOD_PATH, { credentials: 'include' });
  } catch {
    throw new PaymentMethodsError('upstream');
  }
  if (!response.ok) {
    throw new PaymentMethodsError('upstream');
  }

  const html = await response.text();
  if (!html.includes(THEME_PAGE_MARKER)) {
    throw new PaymentMethodsError('upstream');
  }

  const vaultToken = html.match(VAULT_TOKEN_PATTERN)?.[1];
  const shopperId = html.match(SHOPPER_ID_PATTERN)?.[1];
  const storeHash = html.match(STORE_HASH_PATTERN)?.[1];
  if (!vaultToken || !shopperId || !storeHash) {
    // A real theme page without a token = no configured gateway on this store.
    return { state: 'unavailable' };
  }

  return { state: 'available', vaultToken, shopperId, storeHash };
};
```

- [ ] **Step 4: Run to verify pass.**

Run: `yarn test --run src/pages/PaymentMethods/vaultAccess.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/pages/PaymentMethods/vaultAccess.ts src/pages/PaymentMethods/vaultAccess.test.ts
git commit -m "feat: B2B-0000 Add vault-access scrape for the hosted-form add-card flow"
```

---

### Task 3: `hostedForm.ts` — checkout-sdk wrapper + pinned dependency

**Files:**
- Modify: `package.json` (dependency)
- Create: `src/pages/PaymentMethods/hostedForm.ts`
- Test: `src/pages/PaymentMethods/hostedForm.test.ts`

**Interfaces:**
- Produces (Tasks 5–6 depend on these exact names):

```ts
export interface StoredCardFormContainers { number: string; expiry: string; name: string; cvv: string }
export interface StoredCardBillingFields {
  defaultInstrument: boolean;
  email: string; firstName: string; lastName: string; address1: string; city: string;
  postalCode: string; countryCode: string;
  address2?: string; company?: string; phone?: string; stateOrProvinceCode?: string;
}
export interface StoredCardSubmitData { shopperId: string; storeHash: string; vaultToken: string }
export interface StoredCardForm {
  submit(fields: StoredCardBillingFields, data: StoredCardSubmitData): Promise<void>;
  teardown(): void;
}
export const createStoredCardForm: (containers: StoredCardFormContainers) => Promise<StoredCardForm>;
```

- [ ] **Step 1: Add the dependency (exact pin — this is the version the spike verified via the CDN loader).**

```bash
yarn add --exact @bigcommerce/checkout-sdk@1.967.0
```

- [ ] **Step 2: Write the failing tests.**

Create `src/pages/PaymentMethods/hostedForm.test.ts`:

```ts
import { createStoredCardForm } from './hostedForm';

const initialize = vi.fn().mockResolvedValue(undefined);
const deinitialize = vi.fn();
const submitStoredCard = vi.fn().mockResolvedValue(undefined);

vi.mock('@bigcommerce/checkout-sdk', () => ({
  createStoredCardHostedFormService: vi.fn(() => ({ initialize, deinitialize, submitStoredCard })),
}));

const containers = { number: 'cc-number', expiry: 'cc-expiry', name: 'cc-name', cvv: 'cc-cvv' };

it('initializes the hosted form against the payments host with our container ids', async () => {
  const { createStoredCardHostedFormService } = await import('@bigcommerce/checkout-sdk');

  await createStoredCardForm(containers);

  expect(vi.mocked(createStoredCardHostedFormService)).toHaveBeenCalledWith(
    'https://payments.bigcommerce.com',
  );
  expect(initialize).toHaveBeenCalledWith({
    fields: {
      cardNumber: { containerId: 'cc-number' },
      cardExpiry: { containerId: 'cc-expiry' },
      cardName: { containerId: 'cc-name' },
      cardCode: { containerId: 'cc-cvv' },
    },
  });
});

it('submits with the flat billing fields and fills in the constant data values', async () => {
  const form = await createStoredCardForm(containers);

  await form.submit(
    {
      defaultInstrument: false,
      email: 'c@example.com',
      firstName: 'Cass',
      lastName: 'Doe',
      address1: '1 Main St',
      city: 'Nashville',
      postalCode: '37201',
      countryCode: 'US',
      stateOrProvinceCode: 'TN',
    },
    { shopperId: '80591', storeHash: '24erkpw9h6', vaultToken: 'VAT abc' },
  );

  expect(submitStoredCard).toHaveBeenCalledWith(
    {
      defaultInstrument: false,
      email: 'c@example.com',
      firstName: 'Cass',
      lastName: 'Doe',
      address1: '1 Main St',
      city: 'Nashville',
      postalCode: '37201',
      countryCode: 'US',
      stateOrProvinceCode: 'TN',
    },
    {
      currencyCode: 'USD',
      paymentsUrl: 'https://payments.bigcommerce.com',
      providerId: 'braintree',
      shopperId: '80591',
      storeHash: '24erkpw9h6',
      vaultToken: 'VAT abc',
    },
  );
});

it('tears down via deinitialize', async () => {
  const form = await createStoredCardForm(containers);

  form.teardown();

  expect(deinitialize).toHaveBeenCalled();
});
```

- [ ] **Step 3: Run to verify failure.**

Run: `yarn test --run src/pages/PaymentMethods/hostedForm.test.ts`
Expected: FAIL — module `./hostedForm` does not exist.

- [ ] **Step 4: Implement `hostedForm.ts`.**

```ts
// The stored-card hosted form only works from the TOP realm with containers in the TOP
// document — driven from the ThemeFrame realm the field handshake deadlocks (mirror image
// of the old Braintree finding; spike-verified 2026-09-01, spec §2.1). Our bundle already
// executes in the top realm, so a pinned npm dependency is fine; the dynamic import keeps
// the ~1.4 MB SDK out of the main chunk.
const PAYMENTS_URL = 'https://payments.bigcommerce.com';
const PROVIDER_ID = 'braintree';
const CURRENCY_CODE = 'USD';

export interface StoredCardFormContainers {
  number: string;
  expiry: string;
  name: string;
  cvv: string;
}

export interface StoredCardBillingFields {
  defaultInstrument: boolean;
  email: string;
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  postalCode: string;
  countryCode: string;
  address2?: string;
  company?: string;
  phone?: string;
  stateOrProvinceCode?: string;
}

export interface StoredCardSubmitData {
  shopperId: string;
  storeHash: string;
  vaultToken: string;
}

export interface StoredCardForm {
  submit(fields: StoredCardBillingFields, data: StoredCardSubmitData): Promise<void>;
  teardown(): void;
}

export const createStoredCardForm = async (
  containers: StoredCardFormContainers,
): Promise<StoredCardForm> => {
  const { createStoredCardHostedFormService } = await import('@bigcommerce/checkout-sdk');
  const service = createStoredCardHostedFormService(PAYMENTS_URL);

  await service.initialize({
    fields: {
      cardNumber: { containerId: containers.number },
      cardExpiry: { containerId: containers.expiry },
      cardName: { containerId: containers.name },
      cardCode: { containerId: containers.cvv },
    },
  });

  return {
    submit: (fields, data) =>
      service.submitStoredCard(fields, {
        currencyCode: CURRENCY_CODE,
        paymentsUrl: PAYMENTS_URL,
        providerId: PROVIDER_ID,
        ...data,
      }),
    teardown: () => service.deinitialize(),
  };
};
```

If the SDK's TypeScript types reject the flat `fields` object or the option names differ
(`deinitialize` vs another name), consult
`node_modules/@bigcommerce/checkout-sdk/dist/checkout-sdk.d.ts` for
`StoredCardHostedFormService` and adapt the wrapper's internals — the wrapper's OWN
exported interface stays as specified (that is its purpose). Do not use `as any`.

- [ ] **Step 5: Run to verify pass, plus a type-check (the SDK's real types compile here).**

Run: `yarn test --run src/pages/PaymentMethods/hostedForm.test.ts && yarn tsc --noEmit`
Expected: PASS (3 tests), tsc clean.

- [ ] **Step 6: Commit.**

```bash
git add package.json ../../yarn.lock src/pages/PaymentMethods/hostedForm.ts src/pages/PaymentMethods/hostedForm.test.ts
git commit -m "feat: B2B-0000 Wrap the checkout-sdk stored-card hosted form"
```

---

### Task 4: `billingPrefill.ts` — address-book prefill with state-code mapping

**Files:**
- Create: `src/pages/PaymentMethods/billingPrefill.ts`
- Test: `src/pages/PaymentMethods/billingPrefill.test.ts`

**Interfaces:**
- Consumes: `getBCCustomerAddress`, `getB2BCountries` from `@/shared/service/b2b` (both already exported; `getBCCustomerAddress({ offset: 0, first: 1 })` resolves `{ edges: [{ node }] }` with `firstName,lastName,company,address1,address2,city,stateOrProvince,postalCode,countryCode,phone`; `getB2BCountries(false)` resolves `{ countries: [{ countryCode, states: [{ stateCode, stateName }] }] }` — the boolean only affects a state-required flag we don't read).
- Produces (Task 5 depends on):

```ts
export interface BillingFormValues {
  firstName: string; lastName: string; company: string; address1: string; address2: string;
  city: string; stateOrProvinceCode: string; postalCode: string; countryCode: string; phone: string;
}
export const emptyBillingValues: BillingFormValues;
export const getBillingPrefill: () => Promise<BillingFormValues>; // never throws
```

- [ ] **Step 1: Write the failing tests.**

```ts
import { when } from 'vitest-when';

import { getB2BCountries, getBCCustomerAddress } from '@/shared/service/b2b';

import { emptyBillingValues, getBillingPrefill } from './billingPrefill';

vi.mock('@/shared/service/b2b', () => ({
  getBCCustomerAddress: vi.fn(),
  getB2BCountries: vi.fn(),
}));

const address = {
  firstName: 'Cass',
  lastName: 'Doe',
  company: 'Acme',
  address1: '1 Main St',
  address2: 'Suite 2',
  city: 'Bridgeton',
  stateOrProvince: 'Missouri',
  postalCode: '63044',
  countryCode: 'US',
  phone: '555-0100',
};

it('prefills from the first address-book entry and maps the state name to its code', async () => {
  when(vi.mocked(getBCCustomerAddress))
    .calledWith({ offset: 0, first: 1 })
    .thenResolve({ edges: [{ node: address }], totalCount: 1 });
  when(vi.mocked(getB2BCountries))
    .calledWith(false)
    .thenResolve({
      countries: [
        { countryCode: 'US', countryName: 'United States', id: 1, states: [{ stateCode: 'MO', stateName: 'Missouri' }] },
      ],
    });

  await expect(getBillingPrefill()).resolves.toEqual({
    firstName: 'Cass',
    lastName: 'Doe',
    company: 'Acme',
    address1: '1 Main St',
    address2: 'Suite 2',
    city: 'Bridgeton',
    stateOrProvinceCode: 'MO',
    postalCode: '63044',
    countryCode: 'US',
    phone: '555-0100',
  });
});

it('passes a state that already looks like a code through unmapped', async () => {
  when(vi.mocked(getBCCustomerAddress))
    .calledWith({ offset: 0, first: 1 })
    .thenResolve({ edges: [{ node: { ...address, stateOrProvince: 'MO' } }], totalCount: 1 });
  when(vi.mocked(getB2BCountries))
    .calledWith(false)
    .thenResolve({
      countries: [
        { countryCode: 'US', countryName: 'United States', id: 1, states: [{ stateCode: 'MO', stateName: 'Missouri' }] },
      ],
    });

  await expect(getBillingPrefill()).resolves.toMatchObject({ stateOrProvinceCode: 'MO' });
});

it('returns empty values when the customer has no addresses', async () => {
  when(vi.mocked(getBCCustomerAddress))
    .calledWith({ offset: 0, first: 1 })
    .thenResolve({ edges: [], totalCount: 0 });

  await expect(getBillingPrefill()).resolves.toEqual(emptyBillingValues);
});

it('returns empty values when the address fetch fails (prefill is a convenience, never a blocker)', async () => {
  vi.mocked(getBCCustomerAddress).mockRejectedValue(new Error('boom'));

  await expect(getBillingPrefill()).resolves.toEqual(emptyBillingValues);
});

it('keeps the raw state value when the countries lookup fails', async () => {
  when(vi.mocked(getBCCustomerAddress))
    .calledWith({ offset: 0, first: 1 })
    .thenResolve({ edges: [{ node: address }], totalCount: 1 });
  vi.mocked(getB2BCountries).mockRejectedValue(new Error('boom'));

  await expect(getBillingPrefill()).resolves.toMatchObject({ stateOrProvinceCode: 'Missouri' });
});
```

(`vitest-when` is already a repo test convention; import from `'vitest-when'` as other tests do — check an existing usage if the import path differs.)

- [ ] **Step 2: Run to verify failure.**

Run: `yarn test --run src/pages/PaymentMethods/billingPrefill.test.ts`
Expected: FAIL — module `./billingPrefill` does not exist.

- [ ] **Step 3: Implement `billingPrefill.ts`.**

```ts
import { getB2BCountries, getBCCustomerAddress } from '@/shared/service/b2b';

export interface BillingFormValues {
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  stateOrProvinceCode: string;
  postalCode: string;
  countryCode: string;
  phone: string;
}

export const emptyBillingValues: BillingFormValues = {
  firstName: '',
  lastName: '',
  company: '',
  address1: '',
  address2: '',
  city: '',
  stateOrProvinceCode: '',
  postalCode: '',
  countryCode: '',
  phone: '',
};

// The address book stores the state's display name ("Missouri"); the attach body wants
// the code ("MO"). The boolean on getB2BCountries only toggles a state-required flag we
// don't read.
const toStateCode = async (countryCode: string, stateOrProvince: string): Promise<string> => {
  if (!stateOrProvince) {
    return '';
  }
  try {
    const { countries } = await getB2BCountries(false);
    const states = countries.find((c: { countryCode: string }) => c.countryCode === countryCode)?.states ?? [];
    const match = states.find(
      (s: { stateCode: string; stateName: string }) =>
        s.stateName === stateOrProvince || s.stateCode === stateOrProvince,
    );
    return match?.stateCode ?? stateOrProvince;
  } catch {
    return stateOrProvince;
  }
};

export const getBillingPrefill = async (): Promise<BillingFormValues> => {
  try {
    const { edges = [] } = await getBCCustomerAddress({ offset: 0, first: 1 });
    const node = edges[0]?.node;
    if (!node) {
      return emptyBillingValues;
    }

    return {
      firstName: node.firstName ?? '',
      lastName: node.lastName ?? '',
      company: node.company ?? '',
      address1: node.address1 ?? '',
      address2: node.address2 ?? '',
      city: node.city ?? '',
      stateOrProvinceCode: await toStateCode(node.countryCode ?? '', node.stateOrProvince ?? ''),
      postalCode: node.postalCode ?? '',
      countryCode: node.countryCode ?? '',
      phone: node.phone ?? '',
    };
  } catch {
    return emptyBillingValues;
  }
};
```

- [ ] **Step 4: Run to verify pass.**

Run: `yarn test --run src/pages/PaymentMethods/billingPrefill.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/pages/PaymentMethods/billingPrefill.ts src/pages/PaymentMethods/billingPrefill.test.ts
git commit -m "feat: B2B-0000 Prefill billing address from the BigCommerce address book"
```

---

### Task 5: Dialog shell, gating, and lang keys

**Files:**
- Create: `src/pages/PaymentMethods/components/AddPaymentMethodDialog.tsx`
- Modify: `src/pages/PaymentMethods/index.tsx`, `src/lib/lang/locales/en.json`
- Test: `src/pages/PaymentMethods/index.test.tsx`

**Interfaces:**
- Consumes: `getVaultAccess`/`NATIVE_ADD_PAYMENT_METHOD_PATH`/`VaultAccess` (Task 2), `createStoredCardForm`/`StoredCardForm` (Task 3), `getBillingPrefill`/`emptyBillingValues`/`BillingFormValues` (Task 4).
- Produces: `AddPaymentMethodDialog` with props `{ onClose: () => void; onAdded: () => void; customerEmail: string }`; `index.tsx` gating query keyed `['vaultAccess', customerId]`. Save behavior lands in Task 6 — this task delivers open/gate/prefill/cancel.

- [ ] **Step 1: Add the lang keys.**

In `src/lib/lang/locales/en.json`, immediately after `"paymentMethods.deleted"`:

```json
  "paymentMethods.addCard.button": "Add card",
  "paymentMethods.addCard.dialogTitle": "Add a card",
  "paymentMethods.addCard.save": "Save card",
  "paymentMethods.addCard.cancel": "Cancel",
  "paymentMethods.addCard.success": "Card added",
  "paymentMethods.addCard.failed": "We couldn't save this card. Check the card details and billing address, or try a different card.",
  "paymentMethods.addCard.formError": "The card form couldn't be loaded. Please try again, or add your card on the payment methods page.",
  "paymentMethods.addCard.emptyList": "You have no saved cards. Add your first card and it will become your default.",
  "paymentMethods.addCard.billingTitle": "Billing address",
  "paymentMethods.addCard.cardNumber": "Card number",
  "paymentMethods.addCard.expiry": "Expiration date",
  "paymentMethods.addCard.nameOnCard": "Name on card",
  "paymentMethods.addCard.cvv": "CVV",
  "paymentMethods.addCard.billing.email": "Email",
  "paymentMethods.addCard.billing.firstName": "First name",
  "paymentMethods.addCard.billing.lastName": "Last name",
  "paymentMethods.addCard.billing.company": "Company (optional)",
  "paymentMethods.addCard.billing.address1": "Address",
  "paymentMethods.addCard.billing.address2": "Address line 2 (optional)",
  "paymentMethods.addCard.billing.city": "City",
  "paymentMethods.addCard.billing.state": "State/Province code",
  "paymentMethods.addCard.billing.postalCode": "ZIP/Postal code",
  "paymentMethods.addCard.billing.country": "Country code",
  "paymentMethods.addCard.billing.phone": "Phone (optional)",
  "paymentMethods.addCard.requiredField": "Required",
```

- [ ] **Step 2: Write the failing tests.**

In `src/pages/PaymentMethods/index.test.tsx` add, after the existing helper definitions:

```ts
import { createStoredCardForm, StoredCardForm } from './hostedForm';
import { emptyBillingValues, getBillingPrefill } from './billingPrefill';

vi.mock('./hostedForm', () => ({
  createStoredCardForm: vi.fn(),
}));

vi.mock('./billingPrefill', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./billingPrefill')>()),
  getBillingPrefill: vi.fn(),
}));

const fakeStoredCardForm = (): StoredCardForm => ({
  submit: vi.fn().mockResolvedValue(undefined),
  teardown: vi.fn(),
});

// Mirrors the live page: the context is a JSON string, so quotes arrive escaped.
const availableNativePage = `<script>window.stencilBootstrap("account_addpaymentmethod", "{\\"storeHash\\":\\"24erkpw9h6\\",\\"vaultToken\\":\\"VAT test-token\\",\\"shopperId\\":\\"80591\\"}")</script>`;
const noGatewayNativePage = `<script>window.stencilBootstrap("account_addpaymentmethod", "{}")</script>`;

const mockNativePage = (body: string, status = 200) =>
  server.use(http.get('*/account.php', () => new HttpResponse(body, { status, headers: { 'Content-Type': 'text/html' } })));
```

and in the existing `beforeEach`:

```ts
  vi.mocked(createStoredCardForm).mockResolvedValue(fakeStoredCardForm());
  vi.mocked(getBillingPrefill).mockResolvedValue({
    firstName: 'Cass',
    lastName: 'Doe',
    company: '',
    address1: '1 Main St',
    address2: '',
    city: 'Bridgeton',
    stateOrProvinceCode: 'MO',
    postalCode: '63044',
    countryCode: 'US',
    phone: '',
  });
```

Then the tests:

```ts
describe('add card gating', () => {
  it('shows the add-card button when the native page carries a vault token', async () => {
    mockJwt();
    mockList([]);
    mockNativePage(availableNativePage);

    renderWithProviders(<PaymentMethods />);

    expect(await screen.findByRole('button', { name: 'Add card' })).toBeInTheDocument();
    expect(
      await screen.findByText(
        'You have no saved cards. Add your first card and it will become your default.',
      ),
    ).toBeInTheDocument();
  });

  it('hides the affordance entirely when the store has no gateway', async () => {
    mockJwt();
    mockList([buildStoredInstrumentWith({ brand: 'VISA', last4: '4242' })]);
    mockNativePage(noGatewayNativePage);

    renderWithProviders(<PaymentMethods />);

    expect(await screen.findByText('VISA •••• 4242')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add card' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add card' })).not.toBeInTheDocument();
  });

  it('falls back to a top-frame link to the native page when vault access cannot be read', async () => {
    mockJwt();
    mockList([]);
    mockNativePage('<html>challenge</html>', 200);

    renderWithProviders(<PaymentMethods />);

    const link = await screen.findByRole('link', { name: 'Add card' });
    expect(link).toHaveAttribute(
      'href',
      '/account.php?action=add_payment_method&provider=braintree&method_type=CARD',
    );
    // the portal renders inside an iframe — a plain anchor would navigate the frame
    expect(link).toHaveAttribute('target', '_top');
    // fallback keeps today's empty-state copy
    expect(
      await screen.findByText('You have no saved cards. Cards can be saved during checkout.'),
    ).toBeInTheDocument();
  });
});

describe('add card dialog', () => {
  const openDialog = async () => {
    mockJwt();
    mockList([]);
    mockNativePage(availableNativePage);

    const utils = renderWithProviders(<PaymentMethods />, {
      // the dialog's email field prefills from Redux and is REQUIRED at submit time
      preloadedState: {
        company: buildCompanyStateWith({ customer: { emailAddress: 'cass@example.com' } }),
      },
    });

    await utils.user.click(await screen.findByRole('button', { name: 'Add card' }));

    return utils;
  };

  it('opens with hosted-field containers wired and billing prefilled and editable', async () => {
    await openDialog();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => {
      expect(createStoredCardForm).toHaveBeenCalledWith({
        number: 'bpm-card-number',
        expiry: 'bpm-card-expiry',
        name: 'bpm-card-name',
        cvv: 'bpm-card-cvv',
      });
    });
    // containers exist in the document for the SDK to mount into
    expect(document.getElementById('bpm-card-number')).toBeInTheDocument();

    // prefilled and editable
    const first = await screen.findByLabelText('First name');
    expect(first).toHaveValue('Cass');
    expect(screen.getByLabelText('State/Province code')).toHaveValue('MO');
  });

  it('tears the hosted form down on cancel', async () => {
    const form = fakeStoredCardForm();
    vi.mocked(createStoredCardForm).mockResolvedValue(form);

    const { user } = await openDialog();

    await screen.findByRole('dialog');
    await waitFor(() => expect(createStoredCardForm).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(form.teardown).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the form error with a native-page link when the hosted form fails to initialize', async () => {
    vi.mocked(createStoredCardForm).mockRejectedValue(new Error('sdk failed'));

    await openDialog();

    expect(
      await screen.findByText(
        "The card form couldn't be loaded. Please try again, or add your card on the payment methods page.",
      ),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify failure.**

Run: `yarn test --run src/pages/PaymentMethods/index.test.tsx`
Expected: the new describes FAIL ("Unable to find an accessible element with the role button and name 'Add card'"); the pre-existing tests still pass (the unmocked `*/account.php` GET is held forever by the MSW catch-all, so old tests never see the affordance).

- [ ] **Step 4: Create `components/AddPaymentMethodDialog.tsx`.**

```tsx
import { useEffect, useRef, useState } from 'react';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Link,
  TextField,
  Typography,
} from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { BillingFormValues, emptyBillingValues, getBillingPrefill } from '../billingPrefill';
import { createStoredCardForm, StoredCardForm } from '../hostedForm';
import { getVaultAccess, NATIVE_ADD_PAYMENT_METHOD_PATH, VaultAccess } from '../vaultAccess';

interface AddPaymentMethodDialogProps {
  onClose: () => void;
  onAdded: () => void;
  customerEmail: string;
}

// This dialog deliberately renders in the PARENT document, not the ThemeFrame: the
// stored-card hosted form only initializes from the top realm with containers in the top
// document (spec §2.1). MUI's Dialog portals to the component realm's document.body — the
// parent document — by default (B3Dialog passes an in-iframe container to opt OUT of
// that; here the default is exactly what we need). Styles must follow the DOM: the app's
// CacheProvider targets the iframe head, so this subtree carries its own cache bound to
// the parent head.
const parentDocumentCache = createCache({ key: 'bpm-add-card', container: document.head, prepend: true });

export const CARD_FIELD_CONTAINERS = {
  number: 'bpm-card-number',
  expiry: 'bpm-card-expiry',
  name: 'bpm-card-name',
  cvv: 'bpm-card-cvv',
};

const cardFieldSx = {
  height: '44px',
  border: '1px solid',
  borderColor: 'grey.400',
  borderRadius: 1,
  px: 1,
};

function AddPaymentMethodDialog({ onClose, onAdded, customerEmail }: AddPaymentMethodDialogProps) {
  const b3Lang = useB3Lang();
  const [access, setAccess] = useState<Extract<VaultAccess, { state: 'available' }> | null>(null);
  const [isFormReady, setIsFormReady] = useState(false);
  const [hasInitError, setHasInitError] = useState(false);
  const [billing, setBilling] = useState<BillingFormValues>(emptyBillingValues);
  const [email, setEmail] = useState(customerEmail);
  const formRef = useRef<StoredCardForm | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Mint-fresh access on every open: the vault token lives ~30 minutes, so the page-load
    // gating result may be stale by the time the customer gets here.
    Promise.all([getVaultAccess(), createStoredCardForm(CARD_FIELD_CONTAINERS), getBillingPrefill()])
      .then(([vaultAccess, form, prefill]) => {
        if (cancelled) {
          form.teardown();
          return;
        }
        if (vaultAccess.state !== 'available') {
          form.teardown();
          setHasInitError(true);
          return;
        }
        formRef.current = form;
        setAccess(vaultAccess);
        setBilling(prefill);
        setIsFormReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setHasInitError(true);
        }
      });

    return () => {
      cancelled = true;
      formRef.current?.teardown();
      formRef.current = null;
    };
    // mount-only by design: the dialog is unmounted on close
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const billingField = (key: keyof BillingFormValues, labelId: string) => (
    <TextField
      fullWidth
      size="small"
      label={b3Lang(labelId)}
      value={billing[key]}
      onChange={(e) => setBilling((prev) => ({ ...prev, [key]: e.target.value }))}
    />
  );

  return (
    <CacheProvider value={parentDocumentCache}>
      <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
        <DialogTitle>{b3Lang('paymentMethods.addCard.dialogTitle')}</DialogTitle>
        <DialogContent>
          {hasInitError ? (
            <Alert severity="error">
              {b3Lang('paymentMethods.addCard.formError')}{' '}
              <Link href={NATIVE_ADD_PAYMENT_METHOD_PATH} target="_top">
                {b3Lang('paymentMethods.addCard.button')}
              </Link>
            </Alert>
          ) : (
            <>
              {!isFormReady && (
                <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              )}
              <Grid container spacing={2} sx={{ mt: 0 }}>
                <Grid item xs={12}>
                  <Typography variant="body2">{b3Lang('paymentMethods.addCard.cardNumber')}</Typography>
                  <Box id={CARD_FIELD_CONTAINERS.number} sx={cardFieldSx} />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">{b3Lang('paymentMethods.addCard.expiry')}</Typography>
                  <Box id={CARD_FIELD_CONTAINERS.expiry} sx={cardFieldSx} />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">{b3Lang('paymentMethods.addCard.cvv')}</Typography>
                  <Box id={CARD_FIELD_CONTAINERS.cvv} sx={cardFieldSx} />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2">{b3Lang('paymentMethods.addCard.nameOnCard')}</Typography>
                  <Box id={CARD_FIELD_CONTAINERS.name} sx={cardFieldSx} />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2">
                    {b3Lang('paymentMethods.addCard.billingTitle')}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    size="small"
                    label={b3Lang('paymentMethods.addCard.billing.email')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Grid>
                <Grid item xs={6}>{billingField('firstName', 'paymentMethods.addCard.billing.firstName')}</Grid>
                <Grid item xs={6}>{billingField('lastName', 'paymentMethods.addCard.billing.lastName')}</Grid>
                <Grid item xs={12}>{billingField('company', 'paymentMethods.addCard.billing.company')}</Grid>
                <Grid item xs={12}>{billingField('address1', 'paymentMethods.addCard.billing.address1')}</Grid>
                <Grid item xs={12}>{billingField('address2', 'paymentMethods.addCard.billing.address2')}</Grid>
                <Grid item xs={6}>{billingField('city', 'paymentMethods.addCard.billing.city')}</Grid>
                <Grid item xs={6}>{billingField('stateOrProvinceCode', 'paymentMethods.addCard.billing.state')}</Grid>
                <Grid item xs={6}>{billingField('postalCode', 'paymentMethods.addCard.billing.postalCode')}</Grid>
                <Grid item xs={6}>{billingField('countryCode', 'paymentMethods.addCard.billing.country')}</Grid>
                <Grid item xs={12}>{billingField('phone', 'paymentMethods.addCard.billing.phone')}</Grid>
              </Grid>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{b3Lang('paymentMethods.addCard.cancel')}</Button>
          <Button variant="contained" disabled={!isFormReady || !access}>
            {b3Lang('paymentMethods.addCard.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </CacheProvider>
  );
}

export default AddPaymentMethodDialog;
```

Note: the Save button already reads `access` (`disabled={!isFormReady || !access}`) so no
state sits unused before Task 6 wires `handleSave`.

- [ ] **Step 5: Wire `index.tsx`.**

Add imports:

```tsx
import AddPaymentMethodDialog from './components/AddPaymentMethodDialog';
import { getVaultAccess, NATIVE_ADD_PAYMENT_METHOD_PATH } from './vaultAccess';
```

(also `Link` from `@mui/material` alongside the existing imports). In the component, after the list query:

```tsx
  const [isAddOpen, setIsAddOpen] = useState(false);
  const customerEmail = useAppSelector(({ company }) => company.customer.emailAddress);

  // Tri-state gate (spec §6): 'available' → in-portal dialog; 'unavailable' (theme page
  // without a token = no gateway, i.e. Preferred) → no affordance at all; error (scrape
  // broken / challenge / outage) → link out to the native page instead.
  const vaultAccess = useQuery({
    queryKey: ['vaultAccess', customerId],
    queryFn: getVaultAccess,
    enabled: isAvailable,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const handleAdded = () => {
    setIsAddOpen(false);
    queryClient.invalidateQueries({ queryKey: ['storedInstruments', customerId] });
    snackbar.success(b3Lang('paymentMethods.addCard.success'));
  };
```

In the JSX, directly above the empty-state block:

```tsx
        {vaultAccess.data?.state === 'available' && (
          <Box sx={{ mb: 2 }}>
            <Button variant="outlined" onClick={() => setIsAddOpen(true)}>
              {b3Lang('paymentMethods.addCard.button')}
            </Button>
          </Box>
        )}
        {vaultAccess.isError && (
          <Box sx={{ mb: 2 }}>
            {/* The portal renders inside the ThemeFrame; a plain anchor would navigate the frame. */}
            <Link href={NATIVE_ADD_PAYMENT_METHOD_PATH} target="_top">
              {b3Lang('paymentMethods.addCard.button')}
            </Link>
          </Box>
        )}
        {isAddOpen && (
          <AddPaymentMethodDialog
            onClose={() => setIsAddOpen(false)}
            onAdded={handleAdded}
            customerEmail={customerEmail}
          />
        )}
```

and branch the empty-state copy:

```tsx
        {data && data.instruments.length === 0 && (
          <Typography>
            {vaultAccess.data?.state === 'available'
              ? b3Lang('paymentMethods.addCard.emptyList')
              : b3Lang('paymentMethods.empty')}
          </Typography>
        )}
```

- [ ] **Step 6: Run to verify pass.**

Run: `yarn test --run src/pages/PaymentMethods/index.test.tsx && yarn tsc --noEmit`
Expected: PASS — new describes and all pre-existing tests; tsc clean.

- [ ] **Step 7: Commit.**

```bash
git add src/pages/PaymentMethods/components/AddPaymentMethodDialog.tsx src/pages/PaymentMethods/index.tsx src/pages/PaymentMethods/index.test.tsx src/lib/lang/locales/en.json
git commit -m "feat: B2B-0000 Add gated hosted-form add-card dialog shell"
```

---

### Task 6: Save flow — validate, submit, refresh

**Files:**
- Modify: `src/pages/PaymentMethods/components/AddPaymentMethodDialog.tsx`
- Test: `src/pages/PaymentMethods/index.test.tsx`

**Interfaces:**
- Consumes: `StoredCardForm.submit(fields, data)` (Task 3 signature), `access` state and `email`/`billing` values (Task 5).
- Produces: the complete §5.5 flow.

- [ ] **Step 1: Write the failing tests** (inside the `add card dialog` describe, reusing `openDialog`, `fakeStoredCardForm`, `mockNativePage`, `availableNativePage`):

```ts
  it('submits flat billing fields with the scraped access data and refreshes the list', async () => {
    const form = fakeStoredCardForm();
    vi.mocked(createStoredCardForm).mockResolvedValue(form);
    const newCard = buildStoredInstrumentWith({ brand: 'Visa', last4: '4242', isDefault: true });

    const { user } = await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled());

    mockList([newCard]); // the refetch after success returns the new card
    await user.click(screen.getByRole('button', { name: 'Save card' }));

    await waitFor(() => {
      expect(form.submit).toHaveBeenCalledWith(
        {
          defaultInstrument: false,
          email: 'cass@example.com',
          firstName: 'Cass',
          lastName: 'Doe',
          address1: '1 Main St',
          city: 'Bridgeton',
          postalCode: '63044',
          countryCode: 'US',
          stateOrProvinceCode: 'MO',
        },
        { shopperId: '80591', storeHash: '24erkpw9h6', vaultToken: 'VAT test-token' },
      );
    });
    expect(await screen.findByText('Visa •••• 4242')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(snackbar.success).toHaveBeenCalledWith('Card added');
  });

  it('omits empty optional billing fields from the submit payload', async () => {
    const form = fakeStoredCardForm();
    vi.mocked(createStoredCardForm).mockResolvedValue(form);

    const { user } = await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save card' }));

    await waitFor(() => expect(form.submit).toHaveBeenCalled());
    const [fields] = vi.mocked(form.submit).mock.calls[0];
    expect(fields).not.toHaveProperty('company');
    expect(fields).not.toHaveProperty('address2');
    expect(fields).not.toHaveProperty('phone');
  });

  it('shows one honest generic message on failure and keeps the dialog open', async () => {
    const form = fakeStoredCardForm();
    vi.mocked(form.submit).mockRejectedValue(new Error('STORED_CARD_FAILED'));
    vi.mocked(createStoredCardForm).mockResolvedValue(form);

    const { user } = await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save card' }));

    expect(
      await screen.findByText(
        "We couldn't save this card. Check the card details and billing address, or try a different card.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled();
  });

  it('blocks submit and marks the missing required billing fields', async () => {
    const form = fakeStoredCardForm();
    vi.mocked(createStoredCardForm).mockResolvedValue(form);
    // the vi.mock spreads importOriginal, so emptyBillingValues is the real export
    vi.mocked(getBillingPrefill).mockResolvedValue({ ...emptyBillingValues });

    const { user } = await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save card' }));

    expect(form.submit).not.toHaveBeenCalled();
    expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(4);
  });

  it('disables save while the submit is in flight', async () => {
    const form = fakeStoredCardForm();
    let resolveSubmit: () => void = () => {};
    vi.mocked(form.submit).mockImplementation(
      () => new Promise<void>((resolve) => { resolveSubmit = resolve; }),
    );
    vi.mocked(createStoredCardForm).mockResolvedValue(form);

    const { user } = await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save card' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save card' })).toBeDisabled());
    resolveSubmit();
  });
```

- [ ] **Step 2: Run to verify failure.**

Run: `yarn test --run src/pages/PaymentMethods/index.test.tsx`
Expected: the five new tests FAIL (Save does nothing yet); everything else passes.

- [ ] **Step 3: Implement the save flow in `AddPaymentMethodDialog.tsx`.**

Add state and the handler (below the existing state):

```tsx
  const [isSaving, setIsSaving] = useState(false);
  const [hasSubmitError, setHasSubmitError] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  // Everything the attach body sends unconditionally must be present (spec §5.4).
  const REQUIRED_FIELDS: (keyof BillingFormValues)[] = [
    'firstName',
    'lastName',
    'address1',
    'city',
    'postalCode',
    'countryCode',
  ];

  const handleSave = async () => {
    const form = formRef.current;
    if (!form || !access || isSaving) {
      return;
    }

    const missing = REQUIRED_FIELDS.filter((key) => !billing[key].trim());
    if (!email.trim()) {
      missing.push('email');
    }
    setMissingFields(missing);
    if (missing.length > 0) {
      return;
    }

    setHasSubmitError(false);
    setIsSaving(true);
    try {
      await form.submit(
        {
          defaultInstrument: false,
          email: email.trim(),
          firstName: billing.firstName.trim(),
          lastName: billing.lastName.trim(),
          address1: billing.address1.trim(),
          city: billing.city.trim(),
          postalCode: billing.postalCode.trim(),
          countryCode: billing.countryCode.trim(),
          ...(billing.address2.trim() && { address2: billing.address2.trim() }),
          ...(billing.company.trim() && { company: billing.company.trim() }),
          ...(billing.phone.trim() && { phone: billing.phone.trim() }),
          ...(billing.stateOrProvinceCode.trim() && {
            stateOrProvinceCode: billing.stateOrProvinceCode.trim(),
          }),
        },
        {
          shopperId: access.shopperId,
          storeHash: access.storeHash,
          vaultToken: access.vaultToken,
        },
      );
      // Resolves with no body (spec §2.5) — the parent refetches the list.
      onAdded();
    } catch {
      // The SDK reports failure with no detail — decline and system error are
      // indistinguishable (spec §2.6). One honest message; never blame the card.
      setHasSubmitError(true);
    } finally {
      setIsSaving(false);
    }
  };
```

Wire the UI: the submit-failure alert renders above the grid (inside the non-init-error branch):

```tsx
              {hasSubmitError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {b3Lang('paymentMethods.addCard.failed')}
                </Alert>
              )}
```

Give the email and required billing `TextField`s validation props — extend `billingField`:

```tsx
  const billingField = (key: keyof BillingFormValues, labelId: string) => (
    <TextField
      fullWidth
      size="small"
      label={b3Lang(labelId)}
      value={billing[key]}
      error={missingFields.includes(key)}
      helperText={missingFields.includes(key) ? b3Lang('paymentMethods.addCard.requiredField') : undefined}
      onChange={(e) => setBilling((prev) => ({ ...prev, [key]: e.target.value }))}
    />
  );
```

and on the email field add `error={missingFields.includes('email')}` with the same
helperText pattern. Wire the buttons:

```tsx
          <Button disabled={isSaving} onClick={onClose}>
            {b3Lang('paymentMethods.addCard.cancel')}
          </Button>
          <Button variant="contained" disabled={!isFormReady || !access || isSaving} onClick={handleSave}>
            {b3Lang('paymentMethods.addCard.save')}
          </Button>
```

- [ ] **Step 4: Run to verify pass.**

Run: `yarn test --run src/pages/PaymentMethods/index.test.tsx && yarn tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit.**

```bash
git add src/pages/PaymentMethods/components/AddPaymentMethodDialog.tsx src/pages/PaymentMethods/index.test.tsx
git commit -m "feat: B2B-0000 Submit the hosted card form and refresh the stored list"
```

---

### Task 7: Native payment-methods takeover carve-out

**Files:**
- Modify: `src/shared/routeList.ts`, `src/shared/routes/index.tsx`
- Test: `src/shared/routeList.test.ts`

**Interfaces:**
- Produces: `isNativePaymentMethodsPage(): boolean` exported from `@/shared/routeList`.

The portal redirects every hash-less `account.php` URL into `#/orders` for logged-in
customers (`src/shared/routes/index.tsx` — the condition around line 165 checks only
`pathname.includes('account.php')`, never the query). The fallback link (Task 5) and any
direct native navigation need the native payment pages left alone.

- [ ] **Step 1: Write the failing test** (append to `src/shared/routeList.test.ts`, matching that file's existing conventions for imports):

```ts
describe('isNativePaymentMethodsPage', () => {
  const setUrl = (url: string) => window.history.replaceState(null, '', url);

  afterEach(() => setUrl('/'));

  it('matches the native payment-methods list and add pages', () => {
    setUrl('/account.php?action=payment_methods');
    expect(isNativePaymentMethodsPage()).toBe(true);

    setUrl('/account.php?action=add_payment_method&provider=braintree&method_type=CARD');
    expect(isNativePaymentMethodsPage()).toBe(true);
  });

  it('does not match other account pages', () => {
    setUrl('/account.php?action=order_status');
    expect(isNativePaymentMethodsPage()).toBe(false);

    setUrl('/account.php');
    expect(isNativePaymentMethodsPage()).toBe(false);
  });
});
```

(add `isNativePaymentMethodsPage` to the file's import from `'./routeList'` /
`'@/shared/routeList'` — match the existing import path in that test file.)

- [ ] **Step 2: Run to verify failure.**

Run: `yarn test --run src/shared/routeList.test.ts`
Expected: the new describe FAILS (`isNativePaymentMethodsPage` is not exported); pre-existing tests unaffected.

- [ ] **Step 3: Implement.**

In `src/shared/routeList.ts` (near the other exported helpers):

```ts
// The native BigCommerce payment-method pages must render un-hijacked: the portal's
// own add-card fallback links to them, and the add page is where the storefront mints
// the vault token. Everything else under account.php keeps redirecting into the portal.
export const isNativePaymentMethodsPage = () =>
  /[?&]action=(payment_methods|add_payment_method)(&|$)/.test(window.location.search);
```

In `src/shared/routes/index.tsx`, import it (extend the existing import from
`../routeList` / `@/shared/routeList` — match the file's current import of routeList
symbols) and change the takeover condition:

```ts
  if (
    (!url &&
      role !== CustomerRole.GUEST &&
      pathname.includes('account.php') &&
      !isNativePaymentMethodsPage()) ||
    isAccountEnter
  ) {
```

Directly before that `if`, clear the theme's body-hide style so the native page paints
immediately instead of waiting for the theme's delayed reveal:

```ts
  if (isNativePaymentMethodsPage()) {
    // The theme hides the native body on account.php expecting the portal to take over;
    // we're deliberately NOT taking over here, so reveal it.
    const hideBodyStyle = document.getElementById('b2b-account-page-hide-body');
    if (hideBodyStyle) {
      hideBodyStyle.innerHTML = '';
    }
  }
```

- [ ] **Step 4: Run to verify pass.**

Run: `yarn test --run src/shared/routeList.test.ts && yarn tsc --noEmit`
Expected: PASS, tsc clean. Also run `yarn test --run src/shared` and compare any failures against the dev baseline (shared-route tests may have pre-existing redness; introduce none).

- [ ] **Step 5: Commit.**

```bash
git add src/shared/routeList.ts src/shared/routeList.test.ts src/shared/routes/index.tsx
git commit -m "feat: B2B-0000 Leave native payment-method pages out of the account takeover"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Suite diff vs the dev baseline.**

Run `yarn test --run 2>&1 | tail -40` and compare failing files against the known dev
baseline (recorded in session notes / a prior baseline log). Requirement: **every failure
at HEAD must also fail on dev before this feature**. Full-suite runs on this machine
produce load flakes (5s timeouts under parallel collection) — re-run any *new* failing
file in a focused `yarn test --run <files…>` batch before treating it as a regression.
Do not check out or reset anything to obtain a baseline.

- [ ] **Step 2: Linters and types.**

```bash
yarn tsc --noEmit
yarn lint
```

Expected pre-existing findings that are NOT ours to fix: dependency-cruiser `no-orphans`
on `src/utils/analytics.ts`; eslint errors in `src/pages/ManageSubscriptions/index.tsx`.
Anything else must be clean — knip in particular: new exports
(`getVaultAccess`, `NATIVE_ADD_PAYMENT_METHOD_PATH`, `VaultAccess`, `createStoredCardForm`
and its types, `getBillingPrefill`, `emptyBillingValues`, `BillingFormValues`,
`AddPaymentMethodDialog`, `CARD_FIELD_CONTAINERS`, `isNativePaymentMethodsPage`) each need
a real consumer or test; wire or remove rather than suppress. Verify knip/dep-cruiser
accept the dynamic `import('@bigcommerce/checkout-sdk')` (it is a declared dependency;
if dependency-cruiser flags the dynamic import, check `.dependency-cruiser.cjs` for how
other dynamic imports are treated before touching config — config changes belong to the
infra owner).

- [ ] **Step 3: Build sanity (new heavy dependency).**

```bash
yarn build
```

Expected: succeeds; the checkout-sdk lands in an async chunk (look for a separate
`checkout-sdk`-ish chunk in the output, not a main-bundle size explosion).

- [ ] **Step 4: Live sandbox checklist (real browser, logged-in customer — jsdom cannot cover these).**

1. `#/payment-methods` on `sandbox.storesupply.com`: Add card button renders; dialog
   opens **styled** (the parent-document emotion cache — unstyled content means the cache
   wiring is wrong); hosted fields render inside the dialog with brand detection.
2. Add `4111 1111 1111 1111`, `12/30`, any name, CVV `123`, prefilled billing: list
   refreshes with the card; delete it afterward via the portal UI.
3. Submit with an empty expiry: the hosted field shows its own inline validation and our
   generic alert does NOT claim a decline.
4. Keyboard: tab from our billing fields into the hosted-field iframes and back (spec §11
   focus-management checkpoint).
5. Navigate directly to `/account.php?action=payment_methods` while logged in: the native
   page renders and is NOT hijacked into `#/orders` (carve-out) and is not left hidden.
6. If a Preferred sandbox is reachable: no Add affordance at all.
7. Confirm the token is absent from all console/network logging we own.

If any step fails, use superpowers:systematic-debugging — and remember the spike toolkit
in the session scratchpad (`native-pm/*.js`) shows how to drive all of this headlessly.

- [ ] **Step 5: Wrap up.**

Squad protocol: `log_decision` anything that changed during implementation;
`update_status: done` with a summary; message the backend owner that
`VaultInstrumentToken` is unconsumed (spec §4) and relay the §2.8 compliance note. Then
use superpowers:finishing-a-development-branch.
