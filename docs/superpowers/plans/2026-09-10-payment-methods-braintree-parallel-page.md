# Parallel Braintree Add-Card Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, flag-gated, nav-hidden route `/payment-methods-braintree` that adds a saved card through Braintree Drop-in with **no cart required**, so it can be compared side by side with the shipped cart-gated hosted-form page.

**Architecture:** Both routes render the same `PaymentMethods` page component behind a `variant` prop, so the list, rows, delete, set-default and billing form are shared and provably identical. Only the add-card dialog and its gating differ. The Braintree variant runs no cart query and no VAT scrape; it gates on a client-token probe. Braintree's SDK must execute **inside** the ThemeFrame iframe realm, the exact inverse of checkout-sdk's hosted form, so the Drop-in container element lives in the ThemeFrame document. The card never touches our page: Drop-in returns a nonce, our backend vaults it and imports the resulting token into BigCommerce.

**Tech Stack:** React 18 + TypeScript, MUI v5, `@tanstack/react-query`, Vitest + jsdom + Testing Library + MSW, Braintree Drop-in 1.44.1 via pinned CDN script injection (no npm dependency possible: bundled code executes in the parent realm).

**Spec:** `docs/superpowers/specs/2026-09-10-payment-methods-braintree-parallel-page-design.md`

**Backend:** out of scope for this plan. The two endpoints this plan consumes are specified in `docs/handoffs/2026-09-10-braintree-account-vault-backend-prompt.md` and are **mocked with MSW throughout**. Nothing here requires a deployed backend until Task 8's live checks.

**Prerequisite already satisfied:** the spec's §2 go/no-go gate passed on 2026-09-10. BigCommerce's own `braintree` method on the SSW sandbox tokenizes against merchant `7p3bsm9pq3dccypd`, merchant account `storesupplywarehouse`, which is the same merchant the backend holds credentials for in Testing. Do not re-run that check. Production remains unverified and is a go-live gate, not a build gate.

## Global Constraints

- All commands run from `apps/storefront/`, never the repo root. `cd apps/storefront` first.
- Commit subject format: `type: B2B-0000 Short description`. Every commit ends with the trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **The dev branch test baseline is RED.** Diff failures against the baseline; never expect a green full suite and never fix pre-existing redness in this work.
- Import from `tests/test-utils`, never directly from `@testing-library/*` or `msw`.
- Always use builders for test data. Hardcoded test data is a review blocker.
- `renderWithProviders` wires Redux + Router; pass `preloadedState` and `initialEntries`.
- Never put a real jsdom `Document` into `preloadedState` (e.g. `theme.themeFrame`). RTK's `immutableCheck` walks it and blows the stack. Use a stub: `{ body: { style: {} } } as unknown as Document`.
- `vitest-location-mock` ignores `history.replaceState`; drive URLs with `window.location.assign`.
- Fake timers must use `{ shouldAdvanceTime: true }`.
- ESLint enforces: `lodash-es` only, named imports from `@mui/icons-material`, `@/` and `tests/` aliases over long relative paths, `simple-import-sort` ordering, no nested ternaries. `yarn lint` runs three linters and all must pass with `--max-warnings 0`.
- Do NOT add new Redux slices, new Context providers, or new `localStorage`/`sessionStorage` state.
- **Never log the nonce, device data, PAN or CVV.** Anywhere, including test fixtures echoed to console.
- Braintree Drop-in version is pinned to exactly `1.44.1`. Do not float it.
- `paymentMethods.addCard.failed` is the copy for **every** server-side card failure. Never surface a processor decline reason to the customer (spec §9: it turns the endpoint into a card-testing oracle).
- **Negative control on every new test:** after it passes, revert the production change, re-run, confirm it fails, restore. Planned tests on this page went vacuous three times in one session.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/pages/PaymentMethods/dropin.ts` | Create | ThemeFrame-realm Drop-in loader + 20s init timeout. Only file that touches the Braintree global. |
| `src/pages/PaymentMethods/dropin.test.ts` | Create | Loader tests: realm, reuse, error, timeout. |
| `src/pages/PaymentMethods/api.ts` | Modify | `declined` error kind; widened transport; two new endpoint functions. |
| `src/pages/PaymentMethods/api.test.ts` | Modify | Tests for the above. |
| `src/pages/PaymentMethods/components/BillingAddressFields.tsx` | Create | Billing form extracted from the shipped dialog so both dialogs share one implementation. |
| `src/pages/PaymentMethods/components/AddPaymentMethodDialog.tsx` | Modify | Consume the extracted billing fields; no behavior change. |
| `src/pages/PaymentMethods/components/AddPaymentMethodBraintreeDialog.tsx` | Create | In-frame dialog: Drop-in + billing fields + submit to the new endpoint. |
| `src/pages/PaymentMethods/components/AddPaymentMethodBraintreeDialog.test.tsx` | Create | Dialog tests. |
| `src/pages/PaymentMethods/index.tsx` | Modify | `variant` prop; Braintree gating that skips cart and VAT. |
| `src/pages/PaymentMethods/index.test.tsx` | Modify | Variant behavior tests. |
| `src/pages/PaymentMethods/braintreeRoute.tsx` | Create | Four-line route wrapper pinning `variant="braintree"`. |
| `src/index.d.ts` | Modify | `BC_CONTEXT.paymentMethodsBraintree`. |
| `src/shared/routeList.ts` | Modify | Route entry + flag gate. |
| `src/shared/routeList.test.ts` | Modify | Gate tests. |
| `src/shared/routes/index.tsx` | Modify | Lazy import + `routesMap` entry. |
| `src/lib/lang/locales/en.json` | Modify | Two new keys. |

Dependency order: leaves first (`dropin.ts`, `api.ts`), then the shared billing extraction, then the dialog, then the page wiring, then the route.

---

## Task 1: Drop-in loader with init timeout

**Files:**
- Create: `src/pages/PaymentMethods/dropin.ts`
- Test: `src/pages/PaymentMethods/dropin.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DROPIN_SCRIPT_URL: string`, `DROPIN_INIT_TIMEOUT_MS: number` (20000), `interface DropinPayload { nonce: string; deviceData?: string }`, `interface DropinInstance { requestPaymentMethod(): Promise<DropinPayload>; teardown(): Promise<void> }`, `createDropin(iframeDocument: Document, container: HTMLElement, clientToken: string): Promise<DropinInstance>`, `createDropinWithTimeout(iframeDocument: Document, container: HTMLElement, clientToken: string): Promise<DropinInstance>`.

Background the implementer needs: `createDropin` already exists in git history at commit `e434e41d` and was spike-proven against a real SSW sandbox client token. Recover it rather than rewriting it. The realm comment in it is load-bearing documentation; keep it verbatim.

- [ ] **Step 1: Recover the proven loader from history**

```bash
cd apps/storefront
git show e434e41d:apps/storefront/src/pages/PaymentMethods/dropin.ts \
  > src/pages/PaymentMethods/dropin.ts
```

Read the recovered file. It must contain `DROPIN_SCRIPT_URL` pinned to
`https://js.braintreegateway.com/web/dropin/1.44.1/js/dropin.min.js`, a `loadDropinScript`
that appends to `iframeDocument.head` and reuses an existing tag, and a `createDropin` that
calls `iframeDocument.defaultView.braintree.dropin.create({ authorization, container, dataCollector: true })`.
If any of that is missing, stop and report: the wrong commit was used.

- [ ] **Step 2: Write the failing tests**

Create `src/pages/PaymentMethods/dropin.test.ts`:

```ts
import { waitFor } from 'tests/test-utils';

import {
  createDropin,
  createDropinWithTimeout,
  DROPIN_INIT_TIMEOUT_MS,
  DROPIN_SCRIPT_URL,
} from './dropin';

const buildThemeFrameDocument = () => {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);

  return iframe.contentDocument as Document;
};

const buildDropinInstance = () => ({
  requestPaymentMethod: vi.fn().mockResolvedValue({ nonce: 'fake-nonce' }),
  teardown: vi.fn().mockResolvedValue(undefined),
});

// Stand in for the CDN script finishing: publish the global on the FRAME's window, then
// fire the load event the loader is waiting on.
const satisfyScriptLoad = (
  iframeDocument: Document,
  script: HTMLScriptElement,
  create: ReturnType<typeof vi.fn>,
) => {
  Object.assign(iframeDocument.defaultView as Window, { braintree: { dropin: { create } } });
  script.dispatchEvent(new Event('load'));
};

const findInjectedScript = (iframeDocument: Document) =>
  waitFor(() => {
    const script = iframeDocument.head.querySelector<HTMLScriptElement>(
      `script[src="${DROPIN_SCRIPT_URL}"]`,
    );
    expect(script).not.toBeNull();

    return script as HTMLScriptElement;
  });

afterEach(() => {
  document.body.innerHTML = '';
});

it('injects the pinned script into the ThemeFrame document and not the parent document', async () => {
  const iframeDocument = buildThemeFrameDocument();
  const container = iframeDocument.createElement('div');
  const create = vi.fn().mockResolvedValue(buildDropinInstance());

  const pending = createDropin(iframeDocument, container, 'client-token');
  const script = await findInjectedScript(iframeDocument);

  expect(document.head.querySelector(`script[src="${DROPIN_SCRIPT_URL}"]`)).toBeNull();

  satisfyScriptLoad(iframeDocument, script, create);
  await pending;

  expect(create).toHaveBeenCalledWith({
    authorization: 'client-token',
    container,
    dataCollector: true,
  });
});

it('reuses an already-injected script instead of adding a second one', async () => {
  const iframeDocument = buildThemeFrameDocument();
  const container = iframeDocument.createElement('div');
  const create = vi.fn().mockResolvedValue(buildDropinInstance());

  const first = createDropin(iframeDocument, container, 'client-token');
  const script = await findInjectedScript(iframeDocument);
  satisfyScriptLoad(iframeDocument, script, create);
  await first;

  await createDropin(iframeDocument, container, 'client-token');

  expect(
    iframeDocument.head.querySelectorAll(`script[src="${DROPIN_SCRIPT_URL}"]`),
  ).toHaveLength(1);
});

it('rejects when the script fails to load', async () => {
  const iframeDocument = buildThemeFrameDocument();
  const container = iframeDocument.createElement('div');

  const pending = createDropin(iframeDocument, container, 'client-token');
  const script = await findInjectedScript(iframeDocument);
  script.dispatchEvent(new Event('error'));

  await expect(pending).rejects.toThrow('Failed to load the Braintree Drop-in script');
});

describe('createDropinWithTimeout', () => {
  it('rejects once the init budget elapses and tears down a late arrival', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const iframeDocument = buildThemeFrameDocument();
    const container = iframeDocument.createElement('div');
    const instance = buildDropinInstance();
    let releaseCreate: (value: unknown) => void = () => undefined;
    const create = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        releaseCreate = resolve;
      }),
    );

    const pending = createDropinWithTimeout(iframeDocument, container, 'client-token');
    const script = await findInjectedScript(iframeDocument);
    satisfyScriptLoad(iframeDocument, script, create);

    const assertion = expect(pending).rejects.toThrow(
      'Braintree Drop-in did not initialize in time',
    );
    await vi.advanceTimersByTimeAsync(DROPIN_INIT_TIMEOUT_MS);
    await assertion;

    // The SDK answering after we gave up must not leave live hosted fields behind.
    releaseCreate(instance);
    await waitFor(() => expect(instance.teardown).toHaveBeenCalled());

    vi.useRealTimers();
  });

  it('resolves with the instance when init finishes inside the budget', async () => {
    const iframeDocument = buildThemeFrameDocument();
    const container = iframeDocument.createElement('div');
    const instance = buildDropinInstance();
    const create = vi.fn().mockResolvedValue(instance);

    const pending = createDropinWithTimeout(iframeDocument, container, 'client-token');
    const script = await findInjectedScript(iframeDocument);
    satisfyScriptLoad(iframeDocument, script, create);

    await expect(pending).resolves.toBe(instance);
    expect(instance.teardown).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/storefront && yarn test --run src/pages/PaymentMethods/dropin.test.ts`

Expected: the three `createDropin` tests PASS (that code was recovered in Step 1), and both
`createDropinWithTimeout` tests FAIL with a module-resolution style error naming
`createDropinWithTimeout` / `DROPIN_INIT_TIMEOUT_MS` as not exported.

If the first three fail instead, the recovery in Step 1 is wrong. Stop and report.

- [ ] **Step 4: Add the timeout wrapper**

Append to `src/pages/PaymentMethods/dropin.ts`:

```ts
// Drop-in's create() has no timeout of its own. A stalled CDN fetch or a wedged
// handshake would otherwise spin forever with nothing in the console — the exact
// failure mode the hosted-form path hit on sandbox in September 2026.
export const DROPIN_INIT_TIMEOUT_MS = 20_000;

export const createDropinWithTimeout = (
  iframeDocument: Document,
  container: HTMLElement,
  clientToken: string,
): Promise<DropinInstance> =>
  new Promise<DropinInstance>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('Braintree Drop-in did not initialize in time'));
    }, DROPIN_INIT_TIMEOUT_MS);

    createDropin(iframeDocument, container, clientToken).then(
      (instance) => {
        clearTimeout(timer);
        if (settled) {
          // Arrived after we gave up: tear it down so it cannot mount hosted fields
          // into a dialog the customer has already dismissed.
          instance.teardown().catch(() => undefined);

          return;
        }
        settled = true;
        resolve(instance);
      },
      (error) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(error);
        }
      },
    );
  });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/storefront && yarn test --run src/pages/PaymentMethods/dropin.test.ts`

Expected: 5 passed.

- [ ] **Step 6: Negative control**

Temporarily change `DROPIN_INIT_TIMEOUT_MS` to `20_000_000`, re-run, and confirm the timeout
test fails. Restore `20_000` and re-run to green.

- [ ] **Step 7: Settle the subresource-integrity question and record the answer**

PCI DSS v4 requirements 6.4.3 and 11.6.1 cover scripts on pages that host card fields, so a
runtime-injected third-party script needs an answer here either way (spec §8 item 3).

```bash
curl -sI https://js.braintreegateway.com/web/dropin/1.44.1/js/dropin.min.js | grep -i -E 'etag|digest|integrity'
```

Braintree does not publish SRI hashes for this bundle in its docs. If the response carries no
integrity or digest header, **do not** compute and pin your own hash: Braintree serves this
path mutably and a self-computed hash would break the page silently on their next patch
release. In that case leave the tag without `integrity` and add one line to the file's realm
comment recording that SRI was evaluated on this date and is unavailable upstream, so the next
reader does not re-litigate it. If Braintree does publish a hash, add
`integrity` and `crossOrigin = 'anonymous'` to the created script element in `loadDropinScript`
and extend the first test to assert both attributes.

- [ ] **Step 8: Commit**

```bash
cd apps/storefront
git add src/pages/PaymentMethods/dropin.ts src/pages/PaymentMethods/dropin.test.ts
git commit -m "$(cat <<'EOF'
feat: B2B-0000 Restore the ThemeFrame-realm Drop-in loader with an init timeout

Recovers the spike-proven loader from e434e41d and bounds initialization at
20s, tearing down a late arrival so a stalled SDK cannot mount hosted fields
into a dismissed dialog.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `declined` error kind for HTTP 422

**Files:**
- Modify: `src/pages/PaymentMethods/api.ts:67` (the `PaymentMethodsErrorKind` union) and the status ladder in `fetchJson` (`src/pages/PaymentMethods/api.ts:113-128`)
- Test: `src/pages/PaymentMethods/api.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PaymentMethodsErrorKind` gains the member `'declined'`. `PaymentMethodsError` instances thrown for a 422 carry `kind === 'declined'`. No new fields: the backend sends no decline detail by design.

- [ ] **Step 1: Write the failing test**

Append to `src/pages/PaymentMethods/api.test.ts`. Reuse the file's existing `apiBase`,
`appClientId`, `currentJwtUrl` constants and its JWT handler setup; this test only needs a new
handler override.

```ts
it('maps a 422 to the declined kind', async () => {
  server.use(
    http.post(`${apiBase}/customers/Customer/SetDefaultStoredInstrument`, () =>
      HttpResponse.json({}, { status: 422 }),
    ),
  );

  await expect(setDefaultStoredInstrument('card-token')).rejects.toMatchObject({
    kind: 'declined',
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/storefront && yarn test --run src/pages/PaymentMethods/api.test.ts -t "declined kind"`

Expected: FAIL, because a 422 currently falls through to the final `throw` and reports
`kind: 'upstream'`.

- [ ] **Step 3: Add the kind and the mapping**

In `src/pages/PaymentMethods/api.ts`, extend the union:

```ts
type PaymentMethodsErrorKind =
  | 'sessionExpired'
  | 'notFound'
  | 'rateLimited'
  | 'declined'
  | 'upstream';
```

And insert this branch in `fetchJson`, immediately after the `404` branch:

```ts
  if (response.status === 422) {
    // The card itself failed verification. The response deliberately carries no
    // detail: a verification endpoint that explains its declines is a card-testing
    // oracle (spec §9). One generic message, never wording that blames the card.
    throw new PaymentMethodsError('declined');
  }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/storefront && yarn test --run src/pages/PaymentMethods/api.test.ts`

Expected: all pass, including the new test.

- [ ] **Step 5: Negative control**

Comment out the new `422` branch, re-run, confirm the new test fails with `kind: 'upstream'`.
Restore and re-run to green.

- [ ] **Step 6: Commit**

```bash
cd apps/storefront
git add src/pages/PaymentMethods/api.ts src/pages/PaymentMethods/api.test.ts
git commit -m "$(cat <<'EOF'
feat: B2B-0000 Map a 422 payment-methods response to a declined error kind

Lets the add-card dialogs separate a card problem from a system problem
without the backend ever sending a decline reason.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Braintree endpoint functions

**Files:**
- Modify: `src/pages/PaymentMethods/api.ts` (`fetchJson` and `post` signatures at lines 85 and 131-134; new exports at the end)
- Test: `src/pages/PaymentMethods/api.test.ts`

**Interfaces:**
- Consumes: `PaymentMethodsError` with kind `'declined'` (Task 2).
- Produces:
  - `getBraintreeClientToken(): Promise<string>`
  - `vaultBraintreeInstrument(payload: { nonce: string; deviceData?: string; billing: BillingFormValues; email: string; makeDefault?: boolean }): Promise<{ customerId: number; instruments: StoredInstrument[] }>` — the return type is **inferred** from the module-private `post`, so do not annotate it and do not export the `StoredInstrumentsResponse` interface.
  - `BillingFormValues` is the existing exported interface from `./billingPrefill` with fields `firstName`, `lastName`, `company`, `address1`, `address2`, `city`, `stateOrProvinceCode`, `postalCode`, `countryCode`, `phone`.

Note the spec §5.5 calls this type `BillingValues`; the real exported name is
**`BillingFormValues`**. Use the real name.

- [ ] **Step 1: Widen the transport signature and commit that alone**

`fetchJson` and `post` currently take `body: Record<string, string>`, which cannot express a
nested `Billing` object or a boolean `MakeDefault`. Change both to `Record<string, unknown>`:

```ts
const fetchJson = async (action: string, body: Record<string, unknown>) => {
```

```ts
const post = async (
  action: string,
  body: Record<string, unknown>,
): Promise<StoredInstrumentsResponse> => normalize(await fetchJson(action, body));
```

Run: `cd apps/storefront && yarn test --run src/pages/PaymentMethods && yarn tsc --noEmit`

Expected: unchanged pass/fail counts and a clean tsc. The three existing callers pass string
maps, which remain assignable. This is a pure signature widening with no behavior change, so
it gets its own commit:

```bash
cd apps/storefront
git add src/pages/PaymentMethods/api.ts
git commit -m "$(cat <<'EOF'
refactor: B2B-0000 Widen the payment-methods request body type

Record<string, string> cannot carry the nested billing object or the boolean
flag the Braintree vault endpoint needs. No behavior change.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Write the failing tests**

Add to `src/pages/PaymentMethods/api.test.ts`, extending the existing import from `./api` with
`getBraintreeClientToken` and `vaultBraintreeInstrument`, and importing
`emptyBillingValues` from `./billingPrefill`:

```ts
describe('getBraintreeClientToken', () => {
  it('returns the client token', async () => {
    server.use(
      http.post(`${apiBase}/customers/Customer/BraintreeClientToken`, async ({ request }) => {
        expect(await request.json()).toEqual({ Jwt: mockJwt });

        return HttpResponse.json({ clientToken: 'bt-client-token' });
      }),
    );

    expect(await getBraintreeClientToken()).toBe('bt-client-token');
  });

  it('surfaces an upstream failure', async () => {
    server.use(
      http.post(`${apiBase}/customers/Customer/BraintreeClientToken`, () =>
        HttpResponse.json({}, { status: 502 }),
      ),
    );

    await expect(getBraintreeClientToken()).rejects.toMatchObject({ kind: 'upstream' });
  });
});

describe('vaultBraintreeInstrument', () => {
  const billing = {
    ...emptyBillingValues,
    firstName: 'Ada',
    lastName: 'Lovelace',
    address1: '1 Analytical Way',
    city: 'Austin',
    stateOrProvinceCode: 'TX',
    postalCode: '78701',
    countryCode: 'US',
  };

  it('sends a PascalCase body with nested billing and returns the refreshed list', async () => {
    const refreshed = buildStoredInstrumentWith({ last4: '4242' });
    let received: unknown;

    server.use(
      http.post(`${apiBase}/customers/Customer/VaultBraintreeInstrument`, async ({ request }) => {
        received = await request.json();

        return HttpResponse.json({ CustomerId: 42, Instruments: [{ Last4: refreshed.last4 }] });
      }),
    );

    const result = await vaultBraintreeInstrument({
      nonce: 'fake-nonce',
      deviceData: '{"d":1}',
      billing,
      email: 'ada@example.com',
      makeDefault: true,
    });

    expect(received).toEqual({
      Jwt: mockJwt,
      Nonce: 'fake-nonce',
      DeviceData: '{"d":1}',
      MakeDefault: true,
      Billing: {
        FirstName: 'Ada',
        LastName: 'Lovelace',
        Company: null,
        Address1: '1 Analytical Way',
        Address2: null,
        City: 'Austin',
        StateOrProvinceCode: 'TX',
        PostalCode: '78701',
        CountryCode: 'US',
        Phone: null,
        Email: 'ada@example.com',
      },
    });
    expect(result.customerId).toBe(42);
    expect(result.instruments[0].last4).toBe('4242');
  });

  it('omits DeviceData entirely when collection failed', async () => {
    let received: Record<string, unknown> = {};

    server.use(
      http.post(`${apiBase}/customers/Customer/VaultBraintreeInstrument`, async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;

        return HttpResponse.json({ CustomerId: 42, Instruments: [] });
      }),
    );

    await vaultBraintreeInstrument({ nonce: 'fake-nonce', billing, email: 'ada@example.com' });

    expect(received).not.toHaveProperty('DeviceData');
    expect(received.MakeDefault).toBe(false);
  });

  it('reports a declined card', async () => {
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultBraintreeInstrument`, () =>
        HttpResponse.json({}, { status: 422 }),
      ),
    );

    await expect(
      vaultBraintreeInstrument({ nonce: 'fake-nonce', billing, email: 'ada@example.com' }),
    ).rejects.toMatchObject({ kind: 'declined' });
  });
});
```

If the existing file names its JWT fixture something other than `mockJwt`, use that name;
check the top of `api.test.ts` before running.

- [ ] **Step 3: Run them to verify they fail**

Run: `cd apps/storefront && yarn test --run src/pages/PaymentMethods/api.test.ts`

Expected: the four new tests FAIL because `getBraintreeClientToken` and
`vaultBraintreeInstrument` are not exported from `./api`.

- [ ] **Step 4: Implement the two functions**

Add to the end of `src/pages/PaymentMethods/api.ts`, and add
`import { BillingFormValues } from './billingPrefill';` to the import block (sorted by
`simple-import-sort`):

```ts
export const getBraintreeClientToken = async (): Promise<string> => {
  const { clientToken } = await fetchJson('BraintreeClientToken', {});

  return clientToken;
};

export const vaultBraintreeInstrument = ({
  nonce,
  deviceData,
  billing,
  email,
  makeDefault = false,
}: {
  nonce: string;
  deviceData?: string;
  billing: BillingFormValues;
  email: string;
  makeDefault?: boolean;
}) =>
  post('VaultBraintreeInstrument', {
    Nonce: nonce,
    // Omit the key entirely when collection failed; an empty string is not the same
    // thing to the backend, and device data must never block a vault.
    ...(deviceData ? { DeviceData: deviceData } : {}),
    MakeDefault: makeDefault,
    Billing: {
      FirstName: billing.firstName.trim(),
      LastName: billing.lastName.trim(),
      Company: billing.company.trim() || null,
      Address1: billing.address1.trim(),
      Address2: billing.address2.trim() || null,
      City: billing.city.trim(),
      StateOrProvinceCode: billing.stateOrProvinceCode.trim(),
      PostalCode: billing.postalCode.trim(),
      CountryCode: billing.countryCode.trim(),
      Phone: billing.phone.trim() || null,
      Email: email.trim(),
    },
  });
```

- [ ] **Step 5: Run them to verify they pass**

Run: `cd apps/storefront && yarn test --run src/pages/PaymentMethods/api.test.ts`

Expected: all pass.

- [ ] **Step 6: Negative control**

Change `Address1` to `Address_1` in the body, re-run, confirm the body-shape test fails.
Restore and re-run to green.

- [ ] **Step 7: Commit**

```bash
cd apps/storefront
git add src/pages/PaymentMethods/api.ts src/pages/PaymentMethods/api.test.ts
git commit -m "$(cat <<'EOF'
feat: B2B-0000 Add the Braintree client-token and vault API calls

BraintreeClientToken doubles as the gating probe; VaultBraintreeInstrument
sends the nonce plus a nested PascalCase billing address and returns the
refreshed BigCommerce list.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extract the billing address fields

**Files:**
- Create: `src/pages/PaymentMethods/components/BillingAddressFields.tsx`
- Modify: `src/pages/PaymentMethods/components/AddPaymentMethodDialog.tsx`
- Test: `src/pages/PaymentMethods/index.test.tsx` (existing tests are the regression net; no new tests)

**Interfaces:**
- Consumes: `BillingFormValues`, `BillingCountryOption` from `./billingPrefill`.
- Produces:
  - `REQUIRED_BILLING_FIELDS: (keyof BillingFormValues)[]` = `['firstName', 'lastName', 'address1', 'city', 'postalCode', 'countryCode']`
  - default export `BillingAddressFields` with props
    `{ values: BillingFormValues; countries: BillingCountryOption[]; email: string; missingFields: string[]; disabled: boolean; onFieldChange: (key: keyof BillingFormValues, value: string) => void; onEmailChange: (email: string) => void }`

This is a pure refactor. The shipped dialog's billing markup and the new dialog's must not
drift, especially the country/state dropdown behavior and the floating-label fix that were
fixed by hand in September. **No behavior change is permitted**: the existing
`index.test.tsx` suite is the proof.

- [ ] **Step 1: Record the current green baseline**

Run: `cd apps/storefront && yarn test --run src/pages/PaymentMethods 2>&1 | tail -5`

Write down the exact passed/failed counts. This number must not change in this task.

- [ ] **Step 2: Create the component**

Move the billing markup out of `AddPaymentMethodDialog.tsx` verbatim, parameterized. Create
`src/pages/PaymentMethods/components/BillingAddressFields.tsx`:

```tsx
import { Grid, MenuItem, TextField } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { BillingCountryOption, BillingFormValues } from '../billingPrefill';

// Everything the vault/attach body sends unconditionally must be present.
export const REQUIRED_BILLING_FIELDS: (keyof BillingFormValues)[] = [
  'firstName',
  'lastName',
  'address1',
  'city',
  'postalCode',
  'countryCode',
];

interface BillingAddressFieldsProps {
  values: BillingFormValues;
  countries: BillingCountryOption[];
  email: string;
  missingFields: string[];
  disabled: boolean;
  onFieldChange: (key: keyof BillingFormValues, value: string) => void;
  onEmailChange: (email: string) => void;
}

function BillingAddressFields({
  values,
  countries,
  email,
  missingFields,
  disabled,
  onFieldChange,
  onEmailChange,
}: BillingAddressFieldsProps) {
  const b3Lang = useB3Lang();

  const field = (key: keyof BillingFormValues, labelId: string) => (
    <TextField
      fullWidth
      size="small"
      disabled={disabled}
      label={b3Lang(labelId)}
      value={values[key]}
      error={missingFields.includes(key)}
      helperText={
        missingFields.includes(key) ? b3Lang('paymentMethods.addCard.requiredField') : undefined
      }
      onChange={(e) => onFieldChange(key, e.target.value)}
    />
  );

  // The body wants ISO codes the customer will not know, and a bad code surfaces as an
  // undiagnosable generic failure — so country and state display names and submit codes,
  // falling back to free text when the address-book lookup returned nothing.
  const selectedCountry = countries.find((c) => c.countryCode === values.countryCode);
  const stateOptions = selectedCountry?.states ?? [];

  const countryField =
    countries.length > 0 ? (
      <TextField
        select
        fullWidth
        size="small"
        disabled={disabled}
        label={b3Lang('paymentMethods.addCard.billing.country')}
        value={selectedCountry ? values.countryCode : ''}
        error={missingFields.includes('countryCode')}
        helperText={
          missingFields.includes('countryCode')
            ? b3Lang('paymentMethods.addCard.requiredField')
            : undefined
        }
        onChange={(e) => {
          onFieldChange('countryCode', e.target.value);
          onFieldChange('stateOrProvinceCode', '');
        }}
      >
        {countries.map((c) => (
          <MenuItem key={c.countryCode} value={c.countryCode}>
            {c.countryName}
          </MenuItem>
        ))}
      </TextField>
    ) : (
      field('countryCode', 'paymentMethods.addCard.billing.country')
    );

  const stateField =
    stateOptions.length > 0 ? (
      <TextField
        select
        fullWidth
        size="small"
        disabled={disabled}
        label={b3Lang('paymentMethods.addCard.billing.state')}
        value={
          stateOptions.some((s) => s.stateCode === values.stateOrProvinceCode)
            ? values.stateOrProvinceCode
            : ''
        }
        onChange={(e) => onFieldChange('stateOrProvinceCode', e.target.value)}
      >
        {stateOptions.map((s) => (
          <MenuItem key={s.stateCode} value={s.stateCode}>
            {s.stateName}
          </MenuItem>
        ))}
      </TextField>
    ) : (
      field('stateOrProvinceCode', 'paymentMethods.addCard.billing.state')
    );

  return (
    <Grid container spacing={2} sx={{ mt: 0 }}>
      <Grid item xs={6}>
        {field('firstName', 'paymentMethods.addCard.billing.firstName')}
      </Grid>
      <Grid item xs={6}>
        {field('lastName', 'paymentMethods.addCard.billing.lastName')}
      </Grid>
      <Grid item xs={12}>
        {field('company', 'paymentMethods.addCard.billing.company')}
      </Grid>
      <Grid item xs={12}>
        {field('address1', 'paymentMethods.addCard.billing.address1')}
      </Grid>
      <Grid item xs={12}>
        {field('address2', 'paymentMethods.addCard.billing.address2')}
      </Grid>
      <Grid item xs={6}>
        {field('city', 'paymentMethods.addCard.billing.city')}
      </Grid>
      <Grid item xs={6}>
        {countryField}
      </Grid>
      <Grid item xs={6}>
        {stateField}
      </Grid>
      <Grid item xs={6}>
        {field('postalCode', 'paymentMethods.addCard.billing.postalCode')}
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          size="small"
          disabled={disabled}
          label={b3Lang('paymentMethods.addCard.billing.email')}
          value={email}
          error={missingFields.includes('email')}
          helperText={
            missingFields.includes('email')
              ? b3Lang('paymentMethods.addCard.requiredField')
              : undefined
          }
          onChange={(e) => onEmailChange(e.target.value)}
        />
      </Grid>
      <Grid item xs={12}>
        {field('phone', 'paymentMethods.addCard.billing.phone')}
      </Grid>
    </Grid>
  );
}

export default BillingAddressFields;
```

Before writing this file, **read the existing `AddPaymentMethodDialog.tsx` billing markup and
match its field order and Grid widths exactly.** Where this snippet differs from what is
there, the existing file wins: the goal is zero visual change.

- [ ] **Step 3: Consume it from the shipped dialog**

In `AddPaymentMethodDialog.tsx`: delete the local `REQUIRED_FIELDS`, `billingField`,
`countryField` and `stateField` definitions and the billing `<Grid container>` block; import
the new component and `REQUIRED_BILLING_FIELDS`; render

```tsx
<BillingAddressFields
  values={billing}
  countries={countries}
  email={email}
  missingFields={missingFields}
  disabled={isSaving}
  onFieldChange={(key, value) => setBilling((prev) => ({ ...prev, [key]: value }))}
  onEmailChange={setEmail}
/>
```

and replace the `REQUIRED_FIELDS` reference in `handleSave` with `REQUIRED_BILLING_FIELDS`.
Remove any `Grid`, `MenuItem` or `TextField` imports that are now unused.

- [ ] **Step 4: Run the suite to verify the baseline is unchanged**

Run: `cd apps/storefront && yarn test --run src/pages/PaymentMethods 2>&1 | tail -5`

Expected: exactly the counts recorded in Step 1. If any test that passed before now fails, the
extraction changed behavior. Fix the extraction, not the test.

- [ ] **Step 5: Type-check**

Run: `cd apps/storefront && yarn tsc --noEmit`

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd apps/storefront
git add src/pages/PaymentMethods/components/BillingAddressFields.tsx \
        src/pages/PaymentMethods/components/AddPaymentMethodDialog.tsx
git commit -m "$(cat <<'EOF'
refactor: B2B-0000 Extract the add-card billing address fields

Both add-card dialogs need the same billing form, including the country and
state dropdowns and the label fix. One implementation so they cannot drift.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Braintree add-card dialog

**Files:**
- Create: `src/pages/PaymentMethods/components/AddPaymentMethodBraintreeDialog.tsx`
- Test: `src/pages/PaymentMethods/components/AddPaymentMethodBraintreeDialog.test.tsx`
- Modify: `src/lib/lang/locales/en.json`

**Interfaces:**
- Consumes: `createDropinWithTimeout`, `DropinInstance` (Task 1); `vaultBraintreeInstrument`, `PaymentMethodsError` (Task 3); `BillingAddressFields`, `REQUIRED_BILLING_FIELDS` (Task 4); `getBillingCountries`, `getBillingPrefill`, `emptyBillingValues` from `../billingPrefill`; `themeFrameSelector` from `@/store/selectors`.
- Produces: default export `AddPaymentMethodBraintreeDialog` with props
  `{ onClose: () => void; onAdded: () => void; customerEmail: string; clientToken: string }`
  — the same shape as the hosted-form dialog plus `clientToken`, which the page already has
  from its gating probe so the dialog does not refetch it.

- [ ] **Step 1: Add the i18n key**

In `src/lib/lang/locales/en.json`, add alongside the other `paymentMethods.addCard.*` keys:

```json
"paymentMethods.addCard.braintree.formError": "The card form couldn't be loaded. Please try again."
```

The existing `paymentMethods.addCard.formError` ends with native-page link-out wording that
does not apply on this route, which is why this is a separate key.

- [ ] **Step 2: Write the failing tests**

Create `src/pages/PaymentMethods/components/AddPaymentMethodBraintreeDialog.test.tsx`:

```tsx
import { act, renderWithProviders, screen, userEvent, waitFor } from 'tests/test-utils';

import { emptyBillingValues, getBillingCountries, getBillingPrefill } from '../billingPrefill';
import { createDropinWithTimeout } from '../dropin';
import { vaultBraintreeInstrument } from '../api';
import AddPaymentMethodBraintreeDialog from './AddPaymentMethodBraintreeDialog';

vi.mock('../dropin', () => ({
  createDropinWithTimeout: vi.fn(),
  DROPIN_INIT_TIMEOUT_MS: 20_000,
}));

vi.mock('../api', () => ({
  vaultBraintreeInstrument: vi.fn(),
  PaymentMethodsError: class extends Error {
    kind: string;

    constructor(kind: string) {
      super(kind);
      this.kind = kind;
    }
  },
}));

vi.mock('../billingPrefill', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../billingPrefill')>()),
  getBillingCountries: vi.fn(),
  getBillingPrefill: vi.fn(),
}));

const themeFrame = { body: { style: {} } } as unknown as Document;

const filledBilling = {
  ...emptyBillingValues,
  firstName: 'Ada',
  lastName: 'Lovelace',
  address1: '1 Analytical Way',
  city: 'Austin',
  postalCode: '78701',
  countryCode: 'US',
};

const buildDropin = (payload = { nonce: 'fake-nonce', deviceData: '{"d":1}' }) => ({
  requestPaymentMethod: vi.fn().mockResolvedValue(payload),
  teardown: vi.fn().mockResolvedValue(undefined),
});

const renderDialog = (props: Partial<{ onAdded: () => void; onClose: () => void }> = {}) =>
  renderWithProviders(
    <AddPaymentMethodBraintreeDialog
      clientToken="bt-client-token"
      customerEmail="ada@example.com"
      onAdded={props.onAdded ?? vi.fn()}
      onClose={props.onClose ?? vi.fn()}
    />,
    { preloadedState: { theme: { themeFrame } } },
  );

beforeEach(() => {
  vi.mocked(getBillingCountries).mockResolvedValue([]);
  vi.mocked(getBillingPrefill).mockResolvedValue(filledBilling);
});

it('mounts Drop-in into the ThemeFrame document', async () => {
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());

  renderDialog();

  await waitFor(() => expect(createDropinWithTimeout).toHaveBeenCalled());
  const [passedDocument, container] = vi.mocked(createDropinWithTimeout).mock.calls[0];
  expect(passedDocument).toBe(themeFrame);
  expect(container).toBeInstanceOf(HTMLElement);
});

it('vaults the nonce and reports success', async () => {
  const dropin = buildDropin();
  vi.mocked(createDropinWithTimeout).mockResolvedValue(dropin);
  vi.mocked(vaultBraintreeInstrument).mockResolvedValue({ customerId: 1, instruments: [] });
  const onAdded = vi.fn();

  renderDialog({ onAdded });

  const save = await screen.findByRole('button', { name: 'Save card' });
  await userEvent.click(save);

  await waitFor(() =>
    expect(vaultBraintreeInstrument).toHaveBeenCalledWith({
      nonce: 'fake-nonce',
      deviceData: '{"d":1}',
      billing: filledBilling,
      email: 'ada@example.com',
      makeDefault: false,
    }),
  );
  expect(onAdded).toHaveBeenCalled();
});

it('shows the generic card failure copy on a decline and keeps the dialog open', async () => {
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());
  const { PaymentMethodsError } = await import('../api');
  vi.mocked(vaultBraintreeInstrument).mockRejectedValue(new PaymentMethodsError('declined'));
  const onAdded = vi.fn();

  renderDialog({ onAdded });

  await userEvent.click(await screen.findByRole('button', { name: 'Save card' }));

  expect(
    await screen.findByText(
      "We couldn't save this card. Check the card details and billing address, or try a different card.",
    ),
  ).toBeInTheDocument();
  expect(onAdded).not.toHaveBeenCalled();
});

it('shows the rate-limit copy when the endpoint throttles', async () => {
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());
  const { PaymentMethodsError } = await import('../api');
  vi.mocked(vaultBraintreeInstrument).mockRejectedValue(new PaymentMethodsError('rateLimited'));

  renderDialog();

  await userEvent.click(await screen.findByRole('button', { name: 'Save card' }));

  expect(
    await screen.findByText('Too many requests — please try again in a minute.'),
  ).toBeInTheDocument();
});

it('shows the generic system copy when the vault call fails upstream', async () => {
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());
  const { PaymentMethodsError } = await import('../api');
  vi.mocked(vaultBraintreeInstrument).mockRejectedValue(new PaymentMethodsError('upstream'));

  renderDialog();

  await userEvent.click(await screen.findByRole('button', { name: 'Save card' }));

  expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
});

it('shows the form error when Drop-in cannot initialize', async () => {
  vi.mocked(createDropinWithTimeout).mockRejectedValue(new Error('timed out'));

  renderDialog();

  expect(
    await screen.findByText("The card form couldn't be loaded. Please try again."),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save card' })).not.toBeInTheDocument();
});

it('blocks submission and flags required fields when billing is incomplete', async () => {
  vi.mocked(getBillingPrefill).mockResolvedValue(emptyBillingValues);
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());

  renderDialog();

  await userEvent.click(await screen.findByRole('button', { name: 'Save card' }));

  expect(await screen.findAllByText('Required')).not.toHaveLength(0);
  expect(vaultBraintreeInstrument).not.toHaveBeenCalled();
});

it('tears Drop-in down on unmount', async () => {
  const dropin = buildDropin();
  vi.mocked(createDropinWithTimeout).mockResolvedValue(dropin);

  const { unmount } = renderDialog();
  await waitFor(() => expect(createDropinWithTimeout).toHaveBeenCalled());

  await act(async () => {
    unmount();
  });

  expect(dropin.teardown).toHaveBeenCalled();
});
```

Check `tests/test-utils` exports `userEvent`; if it does not, use the `fireEvent` equivalent
that the existing `index.test.tsx` uses and match that style.

- [ ] **Step 3: Run them to verify they fail**

Run: `cd apps/storefront && yarn test --run src/pages/PaymentMethods/components/AddPaymentMethodBraintreeDialog.test.tsx`

Expected: FAIL, cannot resolve `./AddPaymentMethodBraintreeDialog`.

- [ ] **Step 4: Implement the dialog**

Create `src/pages/PaymentMethods/components/AddPaymentMethodBraintreeDialog.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { useAppSelector } from '@/store';
import { themeFrameSelector } from '@/store/selectors';

import { PaymentMethodsError, vaultBraintreeInstrument } from '../api';
import {
  BillingFormValues,
  BillingCountryOption,
  emptyBillingValues,
  getBillingCountries,
  getBillingPrefill,
} from '../billingPrefill';
import { createDropinWithTimeout, DropinInstance } from '../dropin';
import BillingAddressFields, { REQUIRED_BILLING_FIELDS } from './BillingAddressFields';

// Spec §9: a card problem and a system problem read differently, but no variant of a
// decline ever explains itself. Anything unmapped is a system problem.
const SUBMIT_ERROR_MESSAGE_IDS: Record<string, string> = {
  declined: 'paymentMethods.addCard.failed',
  rateLimited: 'paymentMethods.errors.rateLimited',
  sessionExpired: 'paymentMethods.sessionExpired',
};

const submitErrorMessageId = (error: unknown) => {
  if (error instanceof PaymentMethodsError) {
    return SUBMIT_ERROR_MESSAGE_IDS[error.kind] ?? 'paymentMethods.errors.generic';
  }

  // Drop-in refused to tokenize: blank or invalid card fields, which is a card problem.
  return 'paymentMethods.addCard.failed';
};

interface AddPaymentMethodBraintreeDialogProps {
  onClose: () => void;
  onAdded: () => void;
  customerEmail: string;
  clientToken: string;
}

function AddPaymentMethodBraintreeDialog({
  onClose,
  onAdded,
  customerEmail,
  clientToken,
}: AddPaymentMethodBraintreeDialogProps) {
  const b3Lang = useB3Lang();
  const themeFrame = useAppSelector(themeFrameSelector);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dropinRef = useRef<DropinInstance | null>(null);
  const [isFormReady, setIsFormReady] = useState(false);
  const [hasInitError, setHasInitError] = useState(false);
  const [billing, setBilling] = useState<BillingFormValues>(emptyBillingValues);
  const [countries, setCountries] = useState<BillingCountryOption[]>([]);
  const [email, setEmail] = useState(customerEmail);
  const [isSaving, setIsSaving] = useState(false);
  const [submitErrorId, setSubmitErrorId] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const container = containerRef.current;
      // Braintree deadlocks unless its fields live in the ThemeFrame realm, so both the
      // document and the container must come from inside the frame.
      if (!themeFrame || !container) {
        throw new Error('The ThemeFrame document is not available');
      }

      const [dropin, countryList] = await Promise.all([
        createDropinWithTimeout(themeFrame, container, clientToken),
        getBillingCountries(),
      ]);
      const prefill = await getBillingPrefill(countryList);

      if (cancelled) {
        dropin.teardown().catch(() => undefined);

        return;
      }

      dropinRef.current = dropin;
      setCountries(countryList);
      setBilling(prefill);
      setIsFormReady(true);
    };

    init().catch(() => {
      if (!cancelled) {
        setHasInitError(true);
      }
    });

    return () => {
      cancelled = true;
      dropinRef.current?.teardown().catch(() => undefined);
      dropinRef.current = null;
    };
    // mount-only by design: the dialog is unmounted on close
  }, []);

  const handleSave = async () => {
    const dropin = dropinRef.current;
    if (!dropin || isSaving) {
      return;
    }

    const missing: string[] = REQUIRED_BILLING_FIELDS.filter((key) => !billing[key].trim());
    if (!email.trim()) {
      missing.push('email');
    }
    setMissingFields(missing);
    if (missing.length > 0) {
      return;
    }

    setSubmitErrorId(null);
    setIsSaving(true);
    try {
      // A fresh nonce per attempt, so a retry after any failure is always clean and an
      // expired or consumed nonce can never be resubmitted.
      const { nonce, deviceData } = await dropin.requestPaymentMethod();
      await vaultBraintreeInstrument({
        nonce,
        deviceData,
        billing,
        email: email.trim(),
        makeDefault: false,
      });
      onAdded();
    } catch (error) {
      // Every decline reads the same regardless of processor reason: a verification
      // endpoint that explains itself is a card-testing oracle (spec §9).
      setSubmitErrorId(submitErrorMessageId(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={isSaving ? undefined : onClose}>
      <DialogTitle>{b3Lang('paymentMethods.addCard.dialogTitle')}</DialogTitle>
      <DialogContent>
        {hasInitError ? (
          <Alert severity="error">{b3Lang('paymentMethods.addCard.braintree.formError')}</Alert>
        ) : (
          <>
            {!isFormReady && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            )}
            <Box ref={containerRef} sx={{ display: isFormReady ? 'block' : 'none' }} />
            {isFormReady && (
              <>
                <Typography sx={{ mt: 2, fontWeight: 500 }}>
                  {b3Lang('paymentMethods.addCard.billingTitle')}
                </Typography>
                <BillingAddressFields
                  values={billing}
                  countries={countries}
                  email={email}
                  missingFields={missingFields}
                  disabled={isSaving}
                  onFieldChange={(key, value) =>
                    setBilling((prev) => ({ ...prev, [key]: value }))
                  }
                  onEmailChange={setEmail}
                />
              </>
            )}
            {submitErrorId && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {b3Lang(submitErrorId)}
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={isSaving} onClick={onClose}>
          {b3Lang('paymentMethods.addCard.cancel')}
        </Button>
        {isFormReady && !hasInitError && (
          <Button variant="contained" disabled={isSaving} onClick={handleSave}>
            {b3Lang('paymentMethods.addCard.save')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default AddPaymentMethodBraintreeDialog;
```

Note there is deliberately **no** `zIndex: Z_INDEX.MODAL` here. That override exists on the
hosted-form dialog because it escapes into the parent document and must clear the ThemeFrame
overlay at 12000. This dialog renders inside the frame, where MUI's default stacking is
correct.

- [ ] **Step 5: Run them to verify they pass**

Run: `cd apps/storefront && yarn test --run src/pages/PaymentMethods/components/AddPaymentMethodBraintreeDialog.test.tsx`

Expected: 8 passed.

If the "mounts Drop-in into the ThemeFrame document" test fails because the container ref is
null at init time, the `display: none` wrapper is the cause: keep the container mounted (as
written above it always renders) rather than gating it behind `isFormReady`.

- [ ] **Step 6: Negative control**

Change `createDropinWithTimeout(themeFrame, ...)` to `createDropinWithTimeout(document, ...)`,
re-run, and confirm the realm test fails. Restore and re-run to green.

- [ ] **Step 7: Commit**

```bash
cd apps/storefront
git add src/pages/PaymentMethods/components/AddPaymentMethodBraintreeDialog.tsx \
        src/pages/PaymentMethods/components/AddPaymentMethodBraintreeDialog.test.tsx \
        src/lib/lang/locales/en.json
git commit -m "$(cat <<'EOF'
feat: B2B-0000 Add the in-frame Braintree add-card dialog

Mounts Drop-in in the ThemeFrame realm, reuses the shared billing fields,
and vaults the nonce through the new endpoint. Declines and system errors
share one message so the endpoint cannot be used to probe cards.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Page variant prop and Braintree gating

**Files:**
- Modify: `src/pages/PaymentMethods/index.tsx`
- Test: `src/pages/PaymentMethods/index.test.tsx`

**Interfaces:**
- Consumes: `getBraintreeClientToken` (Task 3), `AddPaymentMethodBraintreeDialog` (Task 5).
- Produces: `export type AddCardVariant = 'hostedForm' | 'braintree';` and the page's props
  become `{ variant?: AddCardVariant }`, defaulting to `'hostedForm'` so the existing route
  and every existing test are untouched.

- [ ] **Step 1: Write the failing tests**

Add to `src/pages/PaymentMethods/index.test.tsx`. Extend the existing mock of `./api` if there
is one, or add `getBraintreeClientToken` to the mocked module list, and mock the dialog so
this task tests gating rather than Drop-in:

```tsx
vi.mock('./dropin', () => ({
  createDropinWithTimeout: vi.fn(),
  DROPIN_INIT_TIMEOUT_MS: 20_000,
}));
```

```tsx
describe('braintree variant', () => {
  it('offers Add card without ever asking about the cart', async () => {
    server.use(
      http.post(`${apiBase}/customers/Customer/BraintreeClientToken`, () =>
        HttpResponse.json({ clientToken: 'bt-client-token' }),
      ),
    );

    renderWithProviders(<PaymentMethods variant="braintree" />, {
      preloadedState: buildPreloadedState(),
    });

    expect(await screen.findByRole('button', { name: 'Add card' })).toBeInTheDocument();
    expect(hasActiveCart).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/To add a card here, add an item to your cart first/),
    ).not.toBeInTheDocument();
  });

  it('renders no add affordance when the client-token probe fails', async () => {
    server.use(
      http.post(`${apiBase}/customers/Customer/BraintreeClientToken`, () =>
        HttpResponse.json({}, { status: 502 }),
      ),
    );

    renderWithProviders(<PaymentMethods variant="braintree" />, {
      preloadedState: buildPreloadedState(),
    });

    await waitFor(() => expect(screen.getByText('Payment methods')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Add card' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add card' })).not.toBeInTheDocument();
  });

  it('still gates the hosted-form variant on the cart', async () => {
    vi.mocked(hasActiveCart).mockResolvedValue(false);

    renderWithProviders(<PaymentMethods variant="hostedForm" />, {
      preloadedState: buildPreloadedState(),
    });

    expect(
      await screen.findByText(/To add a card here, add an item to your cart first/),
    ).toBeInTheDocument();
  });
});
```

Use whatever the file already calls its preloaded-state helper instead of
`buildPreloadedState()`; read the existing tests and match. The waited-for assertion in the
second test should key off a string the page renders unconditionally in that file's setup, so
substitute one that exists there.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/storefront && yarn test --run src/pages/PaymentMethods/index.test.tsx -t "braintree variant"`

Expected: FAIL — the component takes no `variant` prop, so the Braintree tests see the
hosted-form gating and the cart query does run.

- [ ] **Step 3: Implement the variant**

In `src/pages/PaymentMethods/index.tsx`:

```tsx
export type AddCardVariant = 'hostedForm' | 'braintree';

interface PaymentMethodsProps {
  variant?: AddCardVariant;
}

function PaymentMethods({ variant = 'hostedForm' }: PaymentMethodsProps) {
```

Add the import and the probe, and scope the two existing queries to the hosted-form variant:

```tsx
  const isBraintree = variant === 'braintree';

  const vaultAccess = useQuery({
    queryKey: ['vaultAccess', customerId],
    queryFn: getVaultAccess,
    enabled: isAvailable && !isBraintree,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const activeCart = useQuery({
    queryKey: ['activeCart', customerId],
    queryFn: hasActiveCart,
    enabled: isAvailable && !isBraintree,
  });

  // Braintree needs no cart and no VAT: gate on whether a client token can be minted,
  // which also self-gates brands with no Braintree gateway (spec §6.1).
  const braintreeClientToken = useQuery({
    queryKey: ['braintreeClientToken', customerId],
    queryFn: getBraintreeClientToken,
    enabled: isAvailable && isBraintree,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
```

Replace the three derived flags:

```tsx
  const isVaultAvailable = vaultAccess.data?.state === 'available';
  const canAddInPortal = isBraintree
    ? Boolean(braintreeClientToken.data)
    : isVaultAvailable && activeCart.data === true;
  const needsCart = !isBraintree && isVaultAvailable && activeCart.data === false;
```

Guard the existing link-out so it stays a hosted-form-only affordance:

```tsx
        {!isBraintree && vaultAccess.isError && (
```

And render the right dialog:

```tsx
        {isAddOpen &&
          (isBraintree && braintreeClientToken.data ? (
            <AddPaymentMethodBraintreeDialog
              clientToken={braintreeClientToken.data}
              customerEmail={customerEmail}
              onAdded={handleAdded}
              onClose={() => setIsAddOpen(false)}
            />
          ) : (
            <AddPaymentMethodDialog
              customerEmail={customerEmail}
              onAdded={handleAdded}
              onClose={() => setIsAddOpen(false)}
            />
          ))}
```

Add to the imports: `getBraintreeClientToken` from `./api` and
`AddPaymentMethodBraintreeDialog` from `./components/AddPaymentMethodBraintreeDialog`.

- [ ] **Step 4: Run the whole page suite**

Run: `cd apps/storefront && yarn test --run src/pages/PaymentMethods`

Expected: the three new tests pass and every pre-existing test still passes. The defaulted
`variant` is what preserves them; if existing tests broke, the default is wrong.

- [ ] **Step 5: Negative control**

Change `enabled: isAvailable && !isBraintree` on the `activeCart` query back to
`enabled: isAvailable`, re-run, and confirm the "without ever asking about the cart" test
fails. Restore and re-run to green.

- [ ] **Step 6: Commit**

```bash
cd apps/storefront
git add src/pages/PaymentMethods/index.tsx src/pages/PaymentMethods/index.test.tsx
git commit -m "$(cat <<'EOF'
feat: B2B-0000 Add the Braintree add-card variant to the payment methods page

The braintree variant skips the cart query and the VAT scrape entirely and
gates on a client-token probe instead. The hosted-form variant is the
default, so the shipped route is unchanged.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Route, flag and gate

**Files:**
- Create: `src/pages/PaymentMethods/braintreeRoute.tsx`
- Modify: `src/index.d.ts`, `src/shared/routeList.ts`, `src/shared/routes/index.tsx`, `src/lib/lang/locales/en.json`
- Test: `src/shared/routeList.test.ts`

**Interfaces:**
- Consumes: `PaymentMethods` and `AddCardVariant` (Task 6).
- Produces: route `/payment-methods-braintree` with `wsKey: 'paymentMethodsBraintree'` and `isMenuItem: false`; `window.BC_CONTEXT.paymentMethodsBraintree?: { enabled: boolean }`.

- [ ] **Step 1: Write the failing tests**

Add to `src/shared/routeList.test.ts`:

```ts
const hasBraintreePaymentRoute = () =>
  getAllowedRoutesWithoutComponent(buildGlobalStateWith({})).some(
    (route) => route.path === '/payment-methods-braintree',
  );

const paymentMethodsConfig = {
  apiBase: 'https://api.example.com',
  appClientId: 'app-client-id',
};

describe('braintree payment-methods route', () => {
  it('is offered when the flag is enabled alongside the payment-methods config', () => {
    window.BC_CONTEXT = {
      paymentMethods: paymentMethodsConfig,
      paymentMethodsBraintree: { enabled: true },
    };
    primeCustomer(false);

    expect(hasBraintreePaymentRoute()).toBe(true);
  });

  it('is withheld when the flag is absent', () => {
    window.BC_CONTEXT = { paymentMethods: paymentMethodsConfig };
    primeCustomer(false);

    expect(hasBraintreePaymentRoute()).toBe(false);
  });

  it('is withheld when payment methods themselves are not configured', () => {
    window.BC_CONTEXT = { paymentMethodsBraintree: { enabled: true } };
    primeCustomer(false);

    expect(hasBraintreePaymentRoute()).toBe(false);
  });

  it('is never a nav menu item', () => {
    expect(
      routeList.find((route) => route.path === '/payment-methods-braintree')?.isMenuItem,
    ).toBe(false);
  });
});
```

The last test needs `routeList` in the import from `./routeList`; add it. `primeCustomer` and
`buildGlobalStateWith` already exist in this file.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/storefront && yarn test --run src/shared/routeList.test.ts -t "braintree payment-methods route"`

Expected: FAIL — the route does not exist, so all four assertions miss.

- [ ] **Step 3: Type the flag**

In `src/index.d.ts`, inside the `BC_CONTEXT` type and directly after the `paymentMethods`
member:

```ts
      /** Gates the parallel Braintree add-card route; absent = route does not exist. */
      paymentMethodsBraintree?: { enabled: boolean };
```

- [ ] **Step 4: Add the route entry and the gate**

In `src/shared/routeList.ts`, add immediately after the `/payment-methods` entry:

```ts
  {
    path: '/payment-methods-braintree',
    name: 'Payment methods (Braintree)',
    wsKey: 'paymentMethodsBraintree',
    // Reachable for side-by-side testing, deliberately never listed in the nav.
    isMenuItem: false,
    permissions: accountSettingPermissions,
    isTokenLogin: true,
    idLang: 'global.navMenu.paymentMethodsBraintree',
  },
```

And inside `getAllowedRoutesWithoutComponent`'s filter, directly after the existing
`/payment-methods` gate:

```ts
    // The Braintree variant needs everything /payment-methods needs, plus its own flag,
    // so customers cannot reach it before the theme turns it on.
    if (
      path === '/payment-methods-braintree' &&
      (platform !== 'bigcommerce' ||
        !window.BC_CONTEXT?.paymentMethods ||
        !window.BC_CONTEXT?.paymentMethodsBraintree?.enabled ||
        isAgenting)
    ) {
      return false;
    }
```

- [ ] **Step 5: Add the nav label**

In `src/lib/lang/locales/en.json`, alongside the other `global.navMenu.*` keys:

```json
"global.navMenu.paymentMethodsBraintree": "Payment methods (Braintree)"
```

The route shape requires an `idLang` even though it is not a menu item.

- [ ] **Step 6: Create the route wrapper and register it**

Create `src/pages/PaymentMethods/braintreeRoute.tsx`:

```tsx
import PaymentMethods from '.';

// A wrapper rather than a prop threaded through routesMap: the map is typed as
// components taking PageProps, and this keeps the page decoupled from route strings.
function PaymentMethodsBraintree() {
  return <PaymentMethods variant="braintree" />;
}

export default PaymentMethodsBraintree;
```

In `src/shared/routes/index.tsx`, add the lazy import next to the existing `PaymentMethods`
one (respecting `simple-import-sort` and the file's alphabetical grouping):

```tsx
const PaymentMethodsBraintree = lazy(() => import('@/pages/PaymentMethods/braintreeRoute'));
```

and the `routesMap` entry after `'/payment-methods'`:

```tsx
  '/payment-methods-braintree': PaymentMethodsBraintree,
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/storefront && yarn test --run src/shared/routeList.test.ts src/shared/routeList.platform.test.ts`

Expected: all pass, including the four new ones.

- [ ] **Step 8: Negative control**

Remove `!window.BC_CONTEXT?.paymentMethodsBraintree?.enabled ||` from the gate, re-run, and
confirm the "withheld when the flag is absent" test fails. Restore and re-run to green.

- [ ] **Step 9: Commit**

```bash
cd apps/storefront
git add src/index.d.ts src/shared/routeList.ts src/shared/routeList.test.ts \
        src/shared/routes/index.tsx src/pages/PaymentMethods/braintreeRoute.tsx \
        src/lib/lang/locales/en.json
git commit -m "$(cat <<'EOF'
feat: B2B-0000 Add the flag-gated Braintree payment-methods route

Hidden from the nav and gated on BC_CONTEXT.paymentMethodsBraintree.enabled
on top of everything /payment-methods already requires, so the route does
not exist for customers until the theme turns it on.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Verification and records

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-payment-methods-braintree-parallel-page-design.md` (status line)
- No source changes.

**Interfaces:**
- Consumes: everything above.
- Produces: a verification record, a memory note, and a coordinator decision.

- [ ] **Step 1: Scoped suites**

```bash
cd apps/storefront
yarn test --run src/pages/PaymentMethods src/shared/routeList.test.ts src/shared/routeList.platform.test.ts
```

Expected: all green. Record the counts.

- [ ] **Step 2: Type-check**

```bash
cd apps/storefront && yarn tsc --noEmit
```

Expected: clean. A failure here most likely means `routesMap`'s
`LazyExoticComponent<(props: PageProps) => ReactElement>` is rejecting the page's new props
type. If so, type the page as `PageProps & { variant?: AddCardVariant }` and import `PageProps`
from `@/pages/PageProps`.

- [ ] **Step 3: Lint, diffed against the dev baseline**

```bash
cd apps/storefront
git stash && yarn lint > /tmp/lint-baseline.txt 2>&1; git stash pop
yarn lint > /tmp/lint-after.txt 2>&1
diff /tmp/lint-baseline.txt /tmp/lint-after.txt
```

Expected: no NEW findings. Knip in particular must not report an unused export; every new
export here has a consumer or a test. If knip flags one, wire it or remove it rather than
suppressing.

- [ ] **Step 4: Build**

```bash
cd apps/storefront && yarn build
```

Expected: succeeds. Confirm `dropin.ts` did not pull Braintree into the main bundle: there is
no npm dependency, only a runtime CDN injection, so bundle size should be essentially
unchanged.

- [ ] **Step 5: Full-suite baseline diff**

```bash
cd apps/storefront
yarn test --run 2>&1 | tail -20
```

Expected: the same failures the dev baseline already has and no others. Do not fix
pre-existing redness.

- [ ] **Step 6: Deploy and run the live checks**

Deployment is the user's responsibility. Ask them to deploy and to set
`BC_CONTEXT.paymentMethodsBraintree = { enabled: true }` on the sandbox theme, then verify in
this order. **The backend endpoints must exist for steps b onward**; if the handoff has not
been implemented yet, stop after step a and report.

a. With the flag off, `/#/payment-methods-braintree` does not resolve and no new nav item
   appears.
b. With the flag on and an **empty cart**, the route renders, shows an Add card button, and
   the dialog mounts Braintree's card fields. Confirm in devtools that no cart request is
   made and that the field iframes are children of the ThemeFrame document. Also confirm the
   store's CSP allows both `js.braintreegateway.com` and `assets.braintreegateway.com`: a CSP
   refusal shows as a console `Refused to load the script` and looks identical to a stalled
   init from the outside.
c. Add a real sandbox test card. It appears in the list after the success snackbar.
d. **Place a sandbox order paying with that newly added card.** This is the real success
   criterion. Until it passes, the design is unproven.
e. Side by side: same customer, both routes, compare load time, failure copy and the
   resulting list entries.

- [ ] **Step 7: Record the outcome**

Update the spec's status line to `Implemented (portal side) YYYY-MM-DD` with a short
verification subsection recording the results of step 6, including anything that failed.

Write a memory note through the repo's three-sink `memory-write` process covering whatever was
genuinely surprising, and log a coordinator decision:

```
project: b2b-buyer-portal
category: architecture
agent: <your session name>
summary: parallel Braintree add-card route shipped/blocked, with the live verification result
```

- [ ] **Step 8: Commit the records**

```bash
cd apps/storefront
git add ../../docs/superpowers/specs/2026-09-10-payment-methods-braintree-parallel-page-design.md
git commit -m "$(cat <<'EOF'
docs: B2B-0000 Record the Braintree parallel page verification result

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Notes for the implementer

- **The realm rule is the one thing that will silently waste an afternoon.** Braintree must run
  inside the ThemeFrame; checkout-sdk must run in the top realm. Both failure modes are an
  infinite spinner with an empty console. If Drop-in never mounts, check which document the
  container belongs to before anything else.
- The working tree on this repo is sometimes shared with a concurrent session. Before every
  `git add`, run `git status --porcelain` and stage only the files your task names. Never
  `git add -u` or `git add .`.
- `paymentMethods.addCard.cardNumber`, `.expiry`, `.cvv` and `.nameOnCard` are **not** used on
  this route. Drop-in renders its own field labels. Leave those keys alone; the hosted-form
  dialog still uses them.
- If the backend is not deployed when you reach Task 8, everything through Task 7 is still
  independently verifiable with MSW. Do not stub the backend in production code to work around
  its absence.
