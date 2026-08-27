# Payment Methods Add-a-Saved-Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in Stencil customers add a saved card (vaulted in Braintree) from the account Payment Methods page, with source-aware handling of the now-merged two-vault card list.

**Architecture:** Extend the existing `src/pages/PaymentMethods/` matroska page. The Braintree Drop-in SDK **must execute inside the ThemeFrame iframe realm** (spike-proven: parent-realm `dropin.create()` deadlocks silently), so a page-local `dropin.ts` injects a pinned CDN script into `iframeDocument.head` and calls `iframeDocument.defaultView.braintree.dropin.create(...)` — no npm dependency, no postMessage bridge (same-origin). Brand gating is a `VaultClientToken` probe at page load: error → the Add-card affordance never renders (Preferred returns a permanent 502).

**Tech Stack:** React 18, MUI, @tanstack/react-query, Braintree Drop-in v3 (pinned `1.44.1`, CDN), Vitest + Testing Library + MSW.

**Spec:** `docs/superpowers/specs/2026-08-26-payment-methods-add-card-design.md` — read it first; §3 is the fixed HTTP contract, §4 the iframe-realm constraint everything hangs on.

## Global Constraints

- **Working directory for every command:** `apps/storefront/` (not repo root).
- **Run a test file once:** `yarn test --run <path>` (`yarn test` alone is watch mode and will hang an agent).
- Request JSON fields are **PascalCase**: `Jwt`, `Token`, `Nonce`, `DeviceData`. Response card DTOs are PascalCase (normalize tolerantly, as the file already does); the inline wrappers `clientToken`, `error`, `declineReason` are camelCase exactly as written.
- Drop-in script URL is pinned: `https://js.braintreegateway.com/web/dropin/1.44.1/js/dropin.min.js`.
- **422 = card declined** (show `declineReason`, keep form open) vs **502/429 = our problem / slow down** (never imply the card was bad). Do not blur this.
- Never log the payment-method nonce.
- Commit subject format: `type: B2B-0000 Short description` (repo pattern for unticketed work).
- Import via `@/` and `tests/` aliases; all test utilities from `tests/test-utils`; builders for test data (hardcoded test data is a review blocker); named MUI imports.
- Do not add new Redux slices, Context providers, or web-storage state.
- The dev-branch baseline has pre-existing red tests: diff failures against baseline, never "expect green suite"; do not patch pre-existing redness.
- TDD: every behavior gets a test written and **seen failing** first — the red run is the negative control; record the actual failure message, and if a new test passes before its implementation exists, the test is vacuous — fix the test.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/pages/PaymentMethods/api.ts` | Modify | PascalCase bodies; `source` on DTO; shared `fetchJson` transport; `declined` error kind; `getVaultClientToken`, `vaultInstrument` |
| `src/pages/PaymentMethods/dropin.ts` | Create | Pinned script injection into the iframe + `createDropin` (iframe-realm create), `DropinInstance` type |
| `src/pages/PaymentMethods/components/AddPaymentMethod.tsx` | Create | Add-card button, inline Drop-in section, save/cancel, error UX |
| `src/pages/PaymentMethods/index.tsx` | Modify | `VaultClientToken` probe query, render `AddPaymentMethod`, empty-state copy branch, added-card refresh |
| `src/lib/lang/locales/en.json` | Modify | `paymentMethods.addCard.*` keys |
| `src/pages/PaymentMethods/api.test.ts` | Modify | Casing assertions; `source`; vault endpoint success/error mapping |
| `src/pages/PaymentMethods/dropin.test.ts` | Create | Script-injection + create-call tests (JSDOM, Captcha-test style) |
| `src/pages/PaymentMethods/index.test.tsx` | Modify | Gating, add-flow happy path, decline/429/502 UX, teardown |

Untouched: `PaymentMethodRow.tsx`, `index.platform.test.tsx`, routing, `isPaymentMethodsAvailable`, `BC_CONTEXT` shape.

---

### Task 1: Unify request bodies to PascalCase

**Files:**
- Modify: `src/pages/PaymentMethods/api.ts` (the `post` body construction and the `setDefaultStoredInstrument` / `deleteStoredInstrument` call sites)
- Test: `src/pages/PaymentMethods/api.test.ts`, `src/pages/PaymentMethods/index.test.tsx`

**Interfaces:**
- Consumes: existing `post(action, body)` helper.
- Produces: every request body sent by this file uses `Jwt` / `Token` keys. Later tasks build on this convention (`Nonce`, `DeviceData`).

The existing camelCase bodies only work because ASP.NET deserializes case-insensitively; the declared contract is PascalCase (spec §3, §5.1).

- [ ] **Step 1: Update body assertions in the existing tests to PascalCase.**

In `api.test.ts` and `index.test.tsx`, find every assertion of a captured request body of the form:

```ts
expect(requestBody).toHaveBeenCalledWith({ jwt: 'fresh-jwt', token: expect.any(String) });
```

(one in `index.test.tsx`'s set-as-default test asserts `{ jwt: 'fresh-jwt', token: amex.token }`; `api.test.ts` has equivalents for delete/set-default — check every `request.json()` capture in both files) and change the expected keys to:

```ts
expect(requestBody).toHaveBeenCalledWith({ Jwt: 'fresh-jwt', Token: amex.token });
```

If an existing test only mocks responses without asserting the body, leave it alone.

- [ ] **Step 2: Run the two files, verify the changed assertions fail with camelCase-vs-PascalCase diffs.**

Run: `yarn test --run src/pages/PaymentMethods/api.test.ts src/pages/PaymentMethods/index.test.tsx`
Expected: the edited tests FAIL showing received `{ jwt: ..., token: ... }` vs expected `{ Jwt: ..., Token: ... }`. Everything else in the files still passes.

- [ ] **Step 3: Change `api.ts` to send PascalCase.**

In `post()` change the body line:

```ts
      body: JSON.stringify({ jwt, ...body }),
```

to

```ts
      body: JSON.stringify({ Jwt: jwt, ...body }),
```

and the two call sites:

```ts
export const setDefaultStoredInstrument = (token: string) =>
  post('SetDefaultStoredInstrument', { Token: token });

export const deleteStoredInstrument = (token: string) => post('DeleteStoredInstrument', { Token: token });
```

- [ ] **Step 4: Run both files, verify everything passes.**

Run: `yarn test --run src/pages/PaymentMethods/api.test.ts src/pages/PaymentMethods/index.test.tsx`
Expected: PASS (all tests in both files).

- [ ] **Step 5: Commit.**

```bash
git add src/pages/PaymentMethods/api.ts src/pages/PaymentMethods/api.test.ts src/pages/PaymentMethods/index.test.tsx
git commit -m "fix: B2B-0000 Send PascalCase request bodies per the CustomerServices contract"
```

---

### Task 2: Add `source` to the card DTO and extract a single-card normalizer

**Files:**
- Modify: `src/pages/PaymentMethods/api.ts`
- Test: `src/pages/PaymentMethods/api.test.ts`

**Interfaces:**
- Produces: `StoredInstrument` gains `source: string`; `normalizeInstrument(raw: RawInstrument): StoredInstrument` exists at module scope (Task 3 reuses it for `VaultInstrument`'s single-card response). The list `normalize()` keeps its signature.

The list now merges two vaults; each card carries `Source: "bigcommerce" | "braintree"` (spec §3). No UI reads it in v1 (spec §5.4) — this is contract plumbing shared with Task 3.

- [ ] **Step 1: Write the failing test.**

In `api.test.ts`, extend the existing PascalCase-normalization test's instrument object with `Source: 'braintree'` and its expectation with `source: 'braintree'`. The existing test looks like the block in this file's first `it(...)` — add the field to both sides:

```ts
// in the mocked response instrument:
            Source: 'braintree',
// in the expected normalized instrument:
        source: 'braintree',
```

Also add one new test pinning the default:

```ts
it('defaults source to empty string when the backend omits it', async () => {
  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () =>
      HttpResponse.json({
        CustomerId: 999,
        Instruments: [{ Token: 'tok-1', Last4: '1111', Brand: 'VISA', ExpiryMonth: 3, ExpiryYear: 2028, Type: 'card', IsDefault: false }],
      }),
    ),
  );

  const result = await listStoredInstruments();

  expect(result.instruments[0].source).toBe('');
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `yarn test --run src/pages/PaymentMethods/api.test.ts`
Expected: FAIL — normalized objects have no `source` key (toEqual mismatch / `undefined` !== `''`).

- [ ] **Step 3: Implement.**

In `api.ts`:

```ts
export interface StoredInstrument {
  token: string;
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  type: string;
  isDefault: boolean;
  /** Which vault the card lives in: 'bigcommerce' | 'braintree'. Not displayed in v1. */
  source: string;
}
```

Add to `RawInstrument`:

```ts
  source?: string;
  Source?: string;
```

Extract the map callback in `normalize` into a module-scope function and use it:

```ts
const normalizeInstrument = (i: RawInstrument): StoredInstrument => ({
  token: i.token ?? i.Token ?? '',
  last4: i.last4 ?? i.Last4 ?? '',
  brand: i.brand ?? i.Brand ?? '',
  expiryMonth: i.expiryMonth ?? i.ExpiryMonth ?? 0,
  expiryYear: i.expiryYear ?? i.ExpiryYear ?? 0,
  type: i.type ?? i.Type ?? '',
  isDefault: i.isDefault ?? i.IsDefault ?? false,
  source: i.source ?? i.Source ?? '',
});

const normalize = (raw: RawStoredInstrumentsResponse): StoredInstrumentsResponse => ({
  customerId: raw.customerId ?? raw.CustomerId ?? 0,
  instruments: (raw.instruments ?? raw.Instruments ?? []).map(normalizeInstrument),
});
```

- [ ] **Step 4: Run to verify pass.**

Run: `yarn test --run src/pages/PaymentMethods/api.test.ts`
Expected: PASS. Also run `yarn test --run src/pages/PaymentMethods/index.test.tsx` — the page builder (`buildStoredInstrumentWith`) doesn't set `source`; TypeScript will demand it. Add to that builder in `index.test.tsx`:

```ts
  source: faker.helpers.arrayElement(['bigcommerce', 'braintree']),
```

- [ ] **Step 5: Type-check.**

Run: `yarn tsc --noEmit`
Expected: clean (no NEW errors vs before your change; the dev baseline note in Global Constraints applies to tests, tsc should be clean).

- [ ] **Step 6: Commit.**

```bash
git add src/pages/PaymentMethods/api.ts src/pages/PaymentMethods/api.test.ts src/pages/PaymentMethods/index.test.tsx
git commit -m "feat: B2B-0000 Normalize the vault source on stored instruments"
```

---

### Task 3: Vault API functions and the `declined` error kind

**Files:**
- Modify: `src/pages/PaymentMethods/api.ts`
- Test: `src/pages/PaymentMethods/api.test.ts`

**Interfaces:**
- Consumes: `normalizeInstrument` (Task 2), PascalCase convention (Task 1).
- Produces (Tasks 5–6 depend on these exact signatures):
  - `getVaultClientToken(): Promise<string>`
  - `vaultInstrument(payload: { nonce: string; deviceData?: string }): Promise<StoredInstrument>`
  - `PaymentMethodsError` gains kind `'declined'` and an optional `declineReason?: string` property.

Endpoint semantics (spec §3): `VaultClientToken` → `{clientToken}` (camelCase wrapper); `VaultInstrument` → single PascalCase card; 422 `{declineReason}` = declined; 429 = rate limit (5/min/IP); 400/502 = upstream. 401 stays `sessionExpired`, 404 stays `notFound`.

- [ ] **Step 1: Write the failing tests.**

Append to `api.test.ts` (reusing the file's existing `mockJwt`, `apiBase` and imports — add `getVaultClientToken, vaultInstrument` to the import from `./api`):

```ts
describe('getVaultClientToken', () => {
  it('POSTs the Jwt and returns the clientToken', async () => {
    mockJwt();
    const requestBody = vi.fn();
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultClientToken`, async ({ request }) => {
        requestBody(await request.json());

        return HttpResponse.json({ clientToken: 'bt-client-token' });
      }),
    );

    expect(await getVaultClientToken()).toBe('bt-client-token');
    expect(requestBody).toHaveBeenCalledWith({ Jwt: 'fresh-jwt' });
  });

  it('maps 502 to an upstream error', async () => {
    mockJwt();
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultClientToken`, () =>
        HttpResponse.json({ error: 'upstream_unavailable' }, { status: 502 }),
      ),
    );

    await expect(getVaultClientToken()).rejects.toMatchObject({ kind: 'upstream' });
  });
});

describe('vaultInstrument', () => {
  it('POSTs Jwt, Nonce and DeviceData and normalizes the returned card', async () => {
    mockJwt();
    const requestBody = vi.fn();
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultInstrument`, async ({ request }) => {
        requestBody(await request.json());

        return HttpResponse.json({
          Token: 'tok-new',
          Last4: '1111',
          Brand: 'Visa',
          ExpiryMonth: 12,
          ExpiryYear: 2030,
          Type: 'card',
          IsDefault: true,
          Source: 'braintree',
        });
      }),
    );

    const card = await vaultInstrument({ nonce: 'fake-nonce', deviceData: '{"d":1}' });

    expect(requestBody).toHaveBeenCalledWith({
      Jwt: 'fresh-jwt',
      Nonce: 'fake-nonce',
      DeviceData: '{"d":1}',
    });
    expect(card).toEqual({
      token: 'tok-new',
      last4: '1111',
      brand: 'Visa',
      expiryMonth: 12,
      expiryYear: 2030,
      type: 'card',
      isDefault: true,
      source: 'braintree',
    });
  });

  it('omits DeviceData from the body when collection failed', async () => {
    mockJwt();
    const requestBody = vi.fn();
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultInstrument`, async ({ request }) => {
        requestBody(await request.json());

        return HttpResponse.json({ Token: 'tok-new', IsDefault: true });
      }),
    );

    await vaultInstrument({ nonce: 'fake-nonce' });

    expect(requestBody).toHaveBeenCalledWith({ Jwt: 'fresh-jwt', Nonce: 'fake-nonce' });
  });

  it('maps 422 to a declined error carrying the declineReason', async () => {
    mockJwt();
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultInstrument`, () =>
        HttpResponse.json({ declineReason: 'CVV verification failed' }, { status: 422 }),
      ),
    );

    await expect(vaultInstrument({ nonce: 'fake-nonce' })).rejects.toMatchObject({
      kind: 'declined',
      declineReason: 'CVV verification failed',
    });
  });

  it('maps 429 to rateLimited and 502 to upstream — a decline is neither', async () => {
    mockJwt();
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultInstrument`, () =>
        HttpResponse.json({}, { status: 429 }),
      ),
    );
    await expect(vaultInstrument({ nonce: 'fake-nonce' })).rejects.toMatchObject({
      kind: 'rateLimited',
    });

    server.use(
      http.post(`${apiBase}/customers/Customer/VaultInstrument`, () =>
        HttpResponse.json({ error: 'upstream_unavailable' }, { status: 502 }),
      ),
    );
    await expect(vaultInstrument({ nonce: 'fake-nonce' })).rejects.toMatchObject({
      kind: 'upstream',
    });
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `yarn test --run src/pages/PaymentMethods/api.test.ts`
Expected: FAIL — `getVaultClientToken` / `vaultInstrument` are not exported.

- [ ] **Step 3: Implement in `api.ts`.**

Extend the error type:

```ts
type PaymentMethodsErrorKind = 'sessionExpired' | 'notFound' | 'rateLimited' | 'upstream' | 'declined';

export class PaymentMethodsError extends Error {
  kind: PaymentMethodsErrorKind;

  declineReason?: string;

  constructor(kind: PaymentMethodsErrorKind, declineReason?: string) {
    super(kind);
    this.kind = kind;
    this.declineReason = declineReason;
  }
}
```

Rename the transport so it returns raw parsed JSON, and rebuild the list-shaped `post` on top of it. Replace the current `post` with:

```ts
const fetchJson = async (action: string, body: Record<string, string>) => {
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
      body: JSON.stringify({ Jwt: jwt, ...body }),
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
  if (response.status === 422) {
    // The card itself was declined / failed verification — NOT a system error.
    const { declineReason } = await response.json().catch(() => ({ declineReason: undefined }));
    throw new PaymentMethodsError('declined', declineReason);
  }
  if (response.status === 429) {
    throw new PaymentMethodsError('rateLimited');
  }
  throw new PaymentMethodsError('upstream');
};

const post = async (
  action: string,
  body: Record<string, string>,
): Promise<StoredInstrumentsResponse> => normalize(await fetchJson(action, body));
```

(`listStoredInstruments`, `setDefaultStoredInstrument`, `deleteStoredInstrument` keep calling `post` unchanged.)

Add the new endpoints at the bottom of the file:

```ts
export const getVaultClientToken = async (): Promise<string> => {
  const { clientToken } = await fetchJson('VaultClientToken', {});

  return clientToken;
};

export const vaultInstrument = async ({
  nonce,
  deviceData,
}: {
  nonce: string;
  deviceData?: string;
}): Promise<StoredInstrument> =>
  normalizeInstrument(
    await fetchJson('VaultInstrument', deviceData ? { Nonce: nonce, DeviceData: deviceData } : { Nonce: nonce }),
  );
```

- [ ] **Step 4: Run to verify pass.**

Run: `yarn test --run src/pages/PaymentMethods/api.test.ts`
Expected: PASS — all pre-existing tests (the refactor must not change list-endpoint behavior) plus the new describes.

- [ ] **Step 5: Commit.**

```bash
git add src/pages/PaymentMethods/api.ts src/pages/PaymentMethods/api.test.ts
git commit -m "feat: B2B-0000 Add vault client-token and vault-instrument API calls"
```

---

### Task 4: `dropin.ts` — iframe-realm Drop-in loader

**Files:**
- Create: `src/pages/PaymentMethods/dropin.ts`
- Test: `src/pages/PaymentMethods/dropin.test.ts`

**Interfaces:**
- Produces (Task 5 depends on these exact names):
  - `DROPIN_SCRIPT_URL: string` (the pinned CDN URL)
  - `interface DropinPayload { nonce: string; deviceData?: string }`
  - `interface DropinInstance { requestPaymentMethod(): Promise<DropinPayload>; teardown(): Promise<void> }`
  - `createDropin(iframeDocument: Document, container: HTMLElement, clientToken: string): Promise<DropinInstance>`

This is the load-bearing module (spec §4): the SDK executes in the iframe realm; the script is injected Captcha-style (`src/components/captcha/Captcha.tsx` is the in-repo precedent, but here no postMessage bridge is needed — same-origin, direct `defaultView` call). jsdom can't run the real SDK, so tests fake the `braintree` global on a JSDOM window and only exercise our loader logic.

- [ ] **Step 1: Write the failing tests.**

Create `src/pages/PaymentMethods/dropin.test.ts`:

```ts
import { JSDOM } from 'jsdom';

import { createDropin, DROPIN_SCRIPT_URL, DropinInstance } from './dropin';

const fakeInstance: DropinInstance = {
  requestPaymentMethod: vi.fn(),
  teardown: vi.fn(),
};

const makeFrameDocument = () => {
  const { window } = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://store.example.com/',
  });

  return { window, document: window.document, container: window.document.createElement('div') };
};

it('creates the drop-in through the iframe realm global when it is already present', async () => {
  const { window, document, container } = makeFrameDocument();
  const create = vi.fn().mockResolvedValue(fakeInstance);
  (window as any).braintree = { dropin: { create } };

  const instance = await createDropin(document, container, 'bt-client-token');

  expect(instance).toBe(fakeInstance);
  expect(create).toHaveBeenCalledWith({
    authorization: 'bt-client-token',
    container,
    dataCollector: true,
  });
  // no script injected when the SDK is already loaded
  expect(document.head.querySelector('script')).toBeNull();
});

it('injects the pinned script into the iframe head when the SDK is absent', async () => {
  const { window, document, container } = makeFrameDocument();
  const create = vi.fn().mockResolvedValue(fakeInstance);

  const pending = createDropin(document, container, 'bt-client-token');

  const script = document.head.querySelector('script');
  expect(script).toMatchObject({ src: DROPIN_SCRIPT_URL });

  // simulate the CDN script arriving and defining the global in the iframe realm
  (window as any).braintree = { dropin: { create } };
  script?.dispatchEvent(new window.Event('load'));

  expect(await pending).toBe(fakeInstance);
});

it('reuses an in-flight script tag instead of injecting a second one', async () => {
  const { window, document, container } = makeFrameDocument();
  const create = vi.fn().mockResolvedValue(fakeInstance);

  const first = createDropin(document, container, 'bt-client-token');
  const second = createDropin(document, container, 'bt-client-token');

  expect(document.head.querySelectorAll('script')).toHaveLength(1);

  (window as any).braintree = { dropin: { create } };
  document.head.querySelector('script')?.dispatchEvent(new window.Event('load'));

  await expect(first).resolves.toBe(fakeInstance);
  await expect(second).resolves.toBe(fakeInstance);
});

it('rejects when the script fails to load', async () => {
  const { window, document, container } = makeFrameDocument();

  const pending = createDropin(document, container, 'bt-client-token');

  document.head.querySelector('script')?.dispatchEvent(new window.Event('error'));

  await expect(pending).rejects.toThrow('Failed to load the Braintree Drop-in script');
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `yarn test --run src/pages/PaymentMethods/dropin.test.ts`
Expected: FAIL — module `./dropin` does not exist.

- [ ] **Step 3: Implement `src/pages/PaymentMethods/dropin.ts`.**

```ts
// The Braintree SDK must execute in the ThemeFrame iframe realm. Driven from the
// parent realm, dropin.create() hangs forever with no error: the hosted-field
// frames postMessage to the iframe window while the SDK's framebus listens on the
// top window. Spike-verified 2026-08-26 — see
// docs/superpowers/specs/2026-08-26-payment-methods-add-card-design.md §4.
// That is also why this is a CDN script injection (Captcha-style) and not an npm
// dependency: bundled code executes in the parent realm.
export const DROPIN_SCRIPT_URL = 'https://js.braintreegateway.com/web/dropin/1.44.1/js/dropin.min.js';

export interface DropinPayload {
  nonce: string;
  deviceData?: string;
}

export interface DropinInstance {
  requestPaymentMethod(): Promise<DropinPayload>;
  teardown(): Promise<void>;
}

interface DropinWindow extends Window {
  braintree?: {
    dropin: {
      create(options: {
        authorization: string;
        container: HTMLElement;
        dataCollector: boolean;
      }): Promise<DropinInstance>;
    };
  };
}

const getDropinWindow = (iframeDocument: Document) =>
  iframeDocument.defaultView as DropinWindow | null;

const loadDropinScript = (iframeDocument: Document) =>
  new Promise<void>((resolve, reject) => {
    if (getDropinWindow(iframeDocument)?.braintree?.dropin) {
      resolve();
      return;
    }

    const existing = iframeDocument.head.querySelector<HTMLScriptElement>(
      `script[src="${DROPIN_SCRIPT_URL}"]`,
    );
    const script = existing ?? iframeDocument.createElement('script');

    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () =>
      reject(new Error('Failed to load the Braintree Drop-in script')),
    );

    if (!existing) {
      script.src = DROPIN_SCRIPT_URL;
      iframeDocument.head.appendChild(script);
    }
  });

export const createDropin = async (
  iframeDocument: Document,
  container: HTMLElement,
  clientToken: string,
): Promise<DropinInstance> => {
  await loadDropinScript(iframeDocument);

  const dropin = getDropinWindow(iframeDocument)?.braintree?.dropin;
  if (!dropin) {
    throw new Error('Braintree Drop-in script loaded but the braintree global is missing');
  }

  return dropin.create({ authorization: clientToken, container, dataCollector: true });
};
```

- [ ] **Step 4: Run to verify pass.**

Run: `yarn test --run src/pages/PaymentMethods/dropin.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/pages/PaymentMethods/dropin.ts src/pages/PaymentMethods/dropin.test.ts
git commit -m "feat: B2B-0000 Add iframe-realm Braintree Drop-in loader"
```

---

### Task 5: Add-card affordance, probe gating, Drop-in lifecycle

**Files:**
- Create: `src/pages/PaymentMethods/components/AddPaymentMethod.tsx`
- Modify: `src/pages/PaymentMethods/index.tsx`
- Modify: `src/lib/lang/locales/en.json`
- Test: `src/pages/PaymentMethods/index.test.tsx`

**Interfaces:**
- Consumes: `getVaultClientToken` (Task 3), `createDropin` / `DropinInstance` (Task 4), `themeFrameSelector` from `@/store`.
- Produces: `AddPaymentMethod` component with props `{ clientToken: string; onAdded: () => void }` (Task 6 fills in its save flow); `index.tsx` probe query keyed `['vaultClientToken', customerId]`.

Behavior in this task: probe gates the button; clicking the button opens an inline section that initializes Drop-in via `createDropin`; Cancel closes and tears down; empty-state copy switches when adding is available. Saving comes in Task 6.

Note on existing tests: the MSW catch-all holds unmocked requests forever, so in old tests the probe stays pending, the button never renders, and they pass unchanged — do not retrofit `mockClientToken` into them.

- [ ] **Step 1: Add the lang keys.**

In `src/lib/lang/locales/en.json`, immediately after the `"paymentMethods.deleted"` line, add:

```json
  "paymentMethods.addCard.button": "Add card",
  "paymentMethods.addCard.save": "Save card",
  "paymentMethods.addCard.cancel": "Cancel",
  "paymentMethods.addCard.success": "Card added",
  "paymentMethods.addCard.declined": "Your card was declined — please try a different card.",
  "paymentMethods.addCard.declinedWithReason": "Your card was declined: {reason}. Please try a different card.",
  "paymentMethods.addCard.rateLimited": "Too many attempts — please wait a minute and try again.",
  "paymentMethods.addCard.error": "Something went wrong on our end — your card was not saved. Please try again.",
  "paymentMethods.addCard.emptyList": "You have no saved cards. Add your first card and it will become your default.",
```

(Keys for Task 6's messages are included now so the locale file is touched once.)

- [ ] **Step 2: Write the failing tests.**

In `src/pages/PaymentMethods/index.test.tsx`, add at the top (after existing imports):

```ts
import { createDropin, DropinInstance } from './dropin';

vi.mock('./dropin', () => ({
  createDropin: vi.fn(),
}));

const fakeDropinInstance = (): DropinInstance => ({
  requestPaymentMethod: vi.fn().mockResolvedValue({ nonce: 'fake-nonce', deviceData: '{"d":1}' }),
  teardown: vi.fn().mockResolvedValue(undefined),
});

const mockClientToken = () =>
  server.use(
    http.post(`${apiBase}/customers/Customer/VaultClientToken`, () =>
      HttpResponse.json({ clientToken: 'bt-client-token' }),
    ),
  );

const mockClientTokenUnavailable = () =>
  server.use(
    http.post(`${apiBase}/customers/Customer/VaultClientToken`, () =>
      HttpResponse.json({ error: 'upstream_unavailable' }, { status: 502 }),
    ),
  );
```

and a `beforeEach` next to the existing one:

```ts
beforeEach(() => {
  vi.mocked(createDropin).mockResolvedValue(fakeDropinInstance());
});
```

Then the tests:

```ts
describe('add card gating', () => {
  it('shows the add-card button when the store supports vaulting', async () => {
    mockJwt();
    mockList([]);
    mockClientToken();

    renderWithProviders(<PaymentMethods />);

    expect(await screen.findByRole('button', { name: 'Add card' })).toBeInTheDocument();
  });

  it('hides the add-card button when the vault client token is unavailable (no Braintree on this brand)', async () => {
    mockJwt();
    mockList([buildStoredInstrumentWith({ brand: 'VISA', last4: '4242' })]);
    mockClientTokenUnavailable();

    renderWithProviders(<PaymentMethods />);

    // the list still renders — managing existing cards works everywhere
    expect(await screen.findByText('VISA •••• 4242')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add card' })).not.toBeInTheDocument();
  });

  it('invites adding a first card in the empty state when vaulting is available', async () => {
    mockJwt();
    mockList([]);
    mockClientToken();

    renderWithProviders(<PaymentMethods />);

    expect(
      await screen.findByText('You have no saved cards. Add your first card and it will become your default.'),
    ).toBeInTheDocument();
  });
});

describe('add card form', () => {
  it('opens the drop-in section with the fetched client token and closes on cancel with teardown', async () => {
    const instance = fakeDropinInstance();
    vi.mocked(createDropin).mockResolvedValue(instance);
    mockJwt();
    mockList([]);
    mockClientToken();

    const { user } = renderWithProviders(<PaymentMethods />);

    await user.click(await screen.findByRole('button', { name: 'Add card' }));

    await waitFor(() => {
      expect(createDropin).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'bt-client-token',
      );
    });
    expect(screen.getByRole('button', { name: 'Save card' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('button', { name: 'Save card' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(instance.teardown).toHaveBeenCalled();
    });
  });

  it('shows the system-error message when drop-in initialization fails', async () => {
    vi.mocked(createDropin).mockRejectedValue(new Error('script failed'));
    mockJwt();
    mockList([]);
    mockClientToken();

    const { user } = renderWithProviders(<PaymentMethods />);

    await user.click(await screen.findByRole('button', { name: 'Add card' }));

    expect(
      await screen.findByText(
        'Something went wrong on our end — your card was not saved. Please try again.',
      ),
    ).toBeInTheDocument();
  });
});
```

The component reads the theme frame; give it one in these tests by passing `preloadedState` where needed — `renderWithProviders(<PaymentMethods />, { preloadedState: { theme: { themeFrame: document } } })` for every test in the `add card form` describe (in jsdom the page document stands in for the iframe document).

- [ ] **Step 3: Run to verify failure.**

Run: `yarn test --run src/pages/PaymentMethods/index.test.tsx`
Expected: new tests FAIL with "Unable to find an accessible element with the role button and name 'Add card'" (and timed-out `waitFor`s). Pre-existing tests still pass.

- [ ] **Step 4: Create `src/pages/PaymentMethods/components/AddPaymentMethod.tsx`.**

```tsx
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { themeFrameSelector, useAppSelector } from '@/store';

import { createDropin, DropinInstance } from '../dropin';

interface AddPaymentMethodProps {
  clientToken: string;
  onAdded: () => void;
}

function AddPaymentMethod({ clientToken }: AddPaymentMethodProps) {
  const b3Lang = useB3Lang();
  const iframeDocument = useAppSelector(themeFrameSelector);
  const [isOpen, setIsOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasInitError, setHasInitError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<DropinInstance | null>(null);

  useEffect(() => {
    if (!isOpen || !iframeDocument || !containerRef.current) {
      return undefined;
    }

    let cancelled = false;
    createDropin(iframeDocument, containerRef.current, clientToken)
      .then((instance) => {
        if (cancelled) {
          instance.teardown();
          return;
        }
        instanceRef.current = instance;
        setIsReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setHasInitError(true);
        }
      });

    return () => {
      cancelled = true;
      instanceRef.current?.teardown();
      instanceRef.current = null;
      setIsReady(false);
    };
  }, [isOpen, iframeDocument, clientToken]);

  if (!isOpen) {
    return (
      <Box sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          onClick={() => {
            setHasInitError(false);
            setIsOpen(true);
          }}
        >
          {b3Lang('paymentMethods.addCard.button')}
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 2 }}>
      {hasInitError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {b3Lang('paymentMethods.addCard.error')}
        </Alert>
      )}
      <div ref={containerRef} />
      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
        <Button variant="contained" disabled={!isReady}>
          {b3Lang('paymentMethods.addCard.save')}
        </Button>
        <Button onClick={() => setIsOpen(false)}>{b3Lang('paymentMethods.addCard.cancel')}</Button>
      </Box>
    </Box>
  );
}

export default AddPaymentMethod;
```

(`onAdded` is unused until Task 6 wires the save flow — TypeScript allows the unused destructure omission above; keep the prop in the interface so `index.tsx` compiles once.)

- [ ] **Step 5: Wire `index.tsx`.**

Add imports:

```tsx
import AddPaymentMethod from './components/AddPaymentMethod';
```

and add `getVaultClientToken` to the existing `./api` import list.

Inside the component, after the existing list `useQuery`, add:

```tsx
  // Brand gate: only Braintree-enabled stores can add cards. On brands without a
  // Braintree merchant account (Preferred) this probe 502s and the add-card
  // affordance simply never renders. Deliberately a probe, not a theme flag —
  // prod themes lag sandbox and a theme gate would silently fail open/closed.
  const { data: vaultClientToken } = useQuery({
    queryKey: ['vaultClientToken', customerId],
    queryFn: getVaultClientToken,
    enabled: isAvailable,
    staleTime: Infinity,
  });

  const handleAdded = () => {
    queryClient.invalidateQueries({ queryKey: ['storedInstruments', customerId] });
    snackbar.success(b3Lang('paymentMethods.addCard.success'));
  };
```

In the JSX, directly above the empty-state line, render the affordance:

```tsx
        {vaultClientToken && <AddPaymentMethod clientToken={vaultClientToken} onAdded={handleAdded} />}
```

and change the empty-state line to branch the copy:

```tsx
        {data && data.instruments.length === 0 && (
          <Typography>
            {vaultClientToken
              ? b3Lang('paymentMethods.addCard.emptyList')
              : b3Lang('paymentMethods.empty')}
          </Typography>
        )}
```

- [ ] **Step 6: Run to verify pass.**

Run: `yarn test --run src/pages/PaymentMethods/index.test.tsx`
Expected: PASS — all new tests AND all pre-existing tests (probe left pending by the catch-all in old tests → button absent → unchanged behavior).

- [ ] **Step 7: Type-check and commit.**

Run: `yarn tsc --noEmit` — expected clean.

```bash
git add src/pages/PaymentMethods/components/AddPaymentMethod.tsx src/pages/PaymentMethods/index.tsx src/pages/PaymentMethods/index.test.tsx src/lib/lang/locales/en.json
git commit -m "feat: B2B-0000 Add gated add-card section with iframe-realm drop-in"
```

---

### Task 6: Save flow — vault the nonce, decline vs system-error UX

**Files:**
- Modify: `src/pages/PaymentMethods/components/AddPaymentMethod.tsx`
- Test: `src/pages/PaymentMethods/index.test.tsx`

**Interfaces:**
- Consumes: `vaultInstrument`, `PaymentMethodsError` (Task 3); `DropinPayload` (Task 4); `onAdded` prop (Task 5).
- Produces: the complete add-card flow of spec §5.3.

- [ ] **Step 1: Write the failing tests.**

Add to `index.test.tsx` (inside or after the `add card form` describe; all of these need the `preloadedState: { theme: { themeFrame: document } }` argument and the helpers from Task 5):

```ts
describe('saving a card', () => {
  const openAddCard = async () => {
    mockJwt();
    mockClientToken();

    const utils = renderWithProviders(<PaymentMethods />, {
      preloadedState: { theme: { themeFrame: document } },
    });

    await utils.user.click(await screen.findByRole('button', { name: 'Add card' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled();
    });

    return utils;
  };

  it('vaults the tokenized nonce with device data and re-renders the refreshed list', async () => {
    const newCard = buildStoredInstrumentWith({
      brand: 'Visa',
      last4: '1111',
      isDefault: true,
      source: 'braintree',
    });
    mockList([]);
    const requestBody = vi.fn();
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultInstrument`, async ({ request }) => {
        requestBody(await request.json());
        // subsequent list refetch returns the new card
        mockList([newCard]);

        return HttpResponse.json({
          Token: newCard.token,
          Last4: newCard.last4,
          Brand: newCard.brand,
          ExpiryMonth: newCard.expiryMonth,
          ExpiryYear: newCard.expiryYear,
          Type: newCard.type,
          IsDefault: true,
          Source: 'braintree',
        });
      }),
    );

    const { user } = await openAddCard();

    await user.click(screen.getByRole('button', { name: 'Save card' }));

    expect(await screen.findByText('Visa •••• 1111')).toBeInTheDocument();
    expect(requestBody).toHaveBeenCalledWith({
      Jwt: 'fresh-jwt',
      Nonce: 'fake-nonce',
      DeviceData: '{"d":1}',
    });
    // the form closed on success
    expect(screen.queryByRole('button', { name: 'Save card' })).not.toBeInTheDocument();
    expect(snackbar.success).toHaveBeenCalledWith('Card added');
  });

  it('shows the decline reason and keeps the form open on 422', async () => {
    mockList([]);
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultInstrument`, () =>
        HttpResponse.json({ declineReason: 'CVV verification failed' }, { status: 422 }),
      ),
    );

    const { user } = await openAddCard();

    await user.click(screen.getByRole('button', { name: 'Save card' }));

    expect(
      await screen.findByText('Your card was declined: CVV verification failed. Please try a different card.'),
    ).toBeInTheDocument();
    // still open — the shopper can try a different card
    expect(screen.getByRole('button', { name: 'Save card' })).toBeInTheDocument();
  });

  it('shows the slow-down message on 429 — not a decline', async () => {
    mockList([]);
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultInstrument`, () =>
        HttpResponse.json({}, { status: 429 }),
      ),
    );

    const { user } = await openAddCard();

    await user.click(screen.getByRole('button', { name: 'Save card' }));

    expect(
      await screen.findByText('Too many attempts — please wait a minute and try again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/declined/)).not.toBeInTheDocument();
  });

  it('shows the our-side error on 502 — never implies the card was bad', async () => {
    mockList([]);
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultInstrument`, () =>
        HttpResponse.json({ error: 'upstream_unavailable' }, { status: 502 }),
      ),
    );

    const { user } = await openAddCard();

    await user.click(screen.getByRole('button', { name: 'Save card' }));

    expect(
      await screen.findByText(
        'Something went wrong on our end — your card was not saved. Please try again.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/declined/)).not.toBeInTheDocument();
  });

  it('disables the save button while the vault call is in flight', async () => {
    mockList([]);
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultInstrument`, async () => {
        await delay('infinite');

        return HttpResponse.json({});
      }),
    );

    const { user } = await openAddCard();

    await user.click(screen.getByRole('button', { name: 'Save card' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save card' })).toBeDisabled();
    });
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `yarn test --run src/pages/PaymentMethods/index.test.tsx`
Expected: the new describe FAILS (save button does nothing yet — no vault request fires, so `findByText` times out). Task-5 tests still pass.

- [ ] **Step 3: Implement the save flow in `AddPaymentMethod.tsx`.**

Add imports:

```tsx
import { useMutation } from '@tanstack/react-query';

import { snackbar } from '@/utils/b3Tip';

import { PaymentMethodsError, vaultInstrument } from '../api';
```

Change the function signature to use `onAdded`:

```tsx
function AddPaymentMethod({ clientToken, onAdded }: AddPaymentMethodProps) {
```

Add state and the mutation (below the existing state declarations):

```tsx
  type AddCardAlert =
    | { kind: 'declined'; reason?: string }
    | { kind: 'rateLimited' }
    | { kind: 'generic' };
  const [alert, setAlert] = useState<AddCardAlert | null>(null);
  const [isTokenizing, setIsTokenizing] = useState(false);

  const vaultMutation = useMutation({
    mutationFn: vaultInstrument,
    onSuccess: () => {
      // closing unmounts the section; the effect cleanup tears the instance down
      setIsOpen(false);
      onAdded();
    },
    onError: (err) => {
      if (err instanceof PaymentMethodsError && err.kind === 'declined') {
        setAlert({ kind: 'declined', reason: err.declineReason });
        return;
      }
      if (err instanceof PaymentMethodsError && err.kind === 'rateLimited') {
        setAlert({ kind: 'rateLimited' });
        return;
      }
      if (err instanceof PaymentMethodsError && err.kind === 'sessionExpired') {
        snackbar.error(b3Lang('paymentMethods.sessionExpired'));
        return;
      }
      // 502 / network — OUR problem, never worded as a card problem
      setAlert({ kind: 'generic' });
    },
  });

  const isSaving = isTokenizing || vaultMutation.isPending;

  const handleSave = async () => {
    const instance = instanceRef.current;
    if (!instance || isSaving) {
      return;
    }
    setAlert(null);
    setIsTokenizing(true);
    try {
      // Card details never touch our code: they go from Braintree's iframes to
      // Braintree; we only ever see the nonce. Never log it.
      const { nonce, deviceData } = await instance.requestPaymentMethod();
      vaultMutation.mutate({ nonce, deviceData });
    } catch {
      // invalid/incomplete fields — Drop-in renders its own inline field errors
    } finally {
      setIsTokenizing(false);
    }
  };
```

Replace the alert/init-error block in the open-section JSX with one alert area:

```tsx
      {hasInitError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {b3Lang('paymentMethods.addCard.error')}
        </Alert>
      )}
      {alert && (
        <Alert severity={alert.kind === 'declined' ? 'warning' : 'error'} sx={{ mb: 2 }}>
          {alert.kind === 'declined' &&
            (alert.reason
              ? b3Lang('paymentMethods.addCard.declinedWithReason', { reason: alert.reason })
              : b3Lang('paymentMethods.addCard.declined'))}
          {alert.kind === 'rateLimited' && b3Lang('paymentMethods.addCard.rateLimited')}
          {alert.kind === 'generic' && b3Lang('paymentMethods.addCard.error')}
        </Alert>
      )}
```

and wire the buttons (Save gains `onClick` and the in-flight disable — this also debounces the 5/min rate limit's double-submit window; Cancel is disabled mid-save):

```tsx
        <Button variant="contained" disabled={!isReady || isSaving} onClick={handleSave}>
          {b3Lang('paymentMethods.addCard.save')}
        </Button>
        <Button disabled={isSaving} onClick={() => setIsOpen(false)}>
          {b3Lang('paymentMethods.addCard.cancel')}
        </Button>
```

Also clear the alert when reopening (the button's existing `onClick` in the collapsed branch):

```tsx
          onClick={() => {
            setHasInitError(false);
            setAlert(null);
            setIsOpen(true);
          }}
```

- [ ] **Step 4: Run to verify pass.**

Run: `yarn test --run src/pages/PaymentMethods/index.test.tsx`
Expected: PASS — the whole file.

- [ ] **Step 5: Type-check and commit.**

Run: `yarn tsc --noEmit` — expected clean.

```bash
git add src/pages/PaymentMethods/components/AddPaymentMethod.tsx src/pages/PaymentMethods/index.test.tsx
git commit -m "feat: B2B-0000 Vault the tokenized card with decline-aware error handling"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Diff the full suite against the dev baseline.**

The dev branch has pre-existing red tests — the requirement is **every failure at HEAD must also fail on dev before this feature**, never "green suite". Do not check out or reset anything to obtain the baseline; if no baseline failure list for this dev HEAD is already recorded in the session, run the suite once on a clean second worktree of dev (`git worktree add`) or accept the recorded baseline from the session notes.

```bash
yarn test --run 2>&1 | tail -40
```

Compare the failing file list against the baseline. Any NEW failure = fix before proceeding; do not patch pre-existing redness.

- [ ] **Step 2: Run the three linters and the type-check.**

```bash
yarn tsc --noEmit
yarn lint
```

Expected: tsc clean; lint (dependency-cruiser + eslint --max-warnings 0 + knip) introduces no NEW findings vs dev. Knip note: every new export (`getVaultClientToken`, `vaultInstrument`, `createDropin`, `DROPIN_SCRIPT_URL`, `DropinInstance`, `DropinPayload`, `AddPaymentMethod`) has a consumer or a test — if knip flags one, wire or remove it rather than suppressing.

- [ ] **Step 3: Confirm the PaymentMethods files pass in isolation.**

```bash
yarn test --run src/pages/PaymentMethods
```

Expected: PASS — all four test files (`api.test.ts`, `dropin.test.ts`, `index.test.tsx`, `index.platform.test.tsx`).

- [ ] **Step 4: Manual sandbox verification checklist (needs a browser on the SSW sandbox).**

Deferred items from spec §6 — verify live, since jsdom cannot:
1. Sign in on the sandbox storefront, open `#/payment-methods`; Add card button renders (probe 200).
2. Add a card with Braintree test number `4111 1111 1111 1111`, any future expiry, CVV `123`, postal `55112`: Drop-in renders inside the account panel; on Save the card appears in the list tagged default rules per backend.
3. Verify the `VaultInstrument` request body in devtools carries `DeviceData` (confirms `dataCollector: true` works with the real SDK; if it's absent the flow must still succeed — that path is unit-tested).
4. Add-card with Braintree's decline test setup (amount-independent: use the sandbox `processor declined` card `4000 1111 1111 1115` or a CVV mismatch per the sandbox merchant's verification rules) → decline alert shows the reason, form stays open.
5. On a non-Braintree brand (Preferred sandbox, if reachable): no Add card button; list/delete still work.

If any of these fail, debug with superpowers:systematic-debugging before declaring done — remember the spike finding: Drop-in's generic create error hides whether the cause is auth or realm.

- [ ] **Step 5: Wrap up.**

Squad protocol (CLAUDE.md): `log_decision` anything that changed during implementation, `update_status: done` with a summary, and if a reusable gotcha surfaced, add an agent-memory entry. Then use superpowers:finishing-a-development-branch.
