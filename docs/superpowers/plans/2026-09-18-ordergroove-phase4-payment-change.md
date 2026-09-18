# Ordergroove Phase 4 — Change the Card on a Subscription: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer move a subscription onto a different saved card, from the subscription itself and from the dialog that warns them before they delete the card their subscriptions charge.

**Architecture:** Two entry points share one rule: look up the customer's BigCommerce saved cards, find the live Ordergroove payment record that already holds the chosen card's token, and only create a record when there is none. The subscription card repoints one subscription with `change_payment`; the delete dialog repoints everything with `use_for_all`. Both go through the Phase 3a write helper, so the transport stays the single seam the auth proxy will later swap.

**Tech Stack:** React 18, TypeScript, `@tanstack/react-query` v5 (`useMutation`, `useQueryClient`), MUI, dayjs, Vitest + jsdom + MSW v2 + Testing Library, `tests/builder.ts` builders, ICU messages via `useB3Lang`.

**Spec:** `docs/superpowers/specs/2026-09-17-ordergroove-phase4-payment-change-design.md`. Its companion `docs/superpowers/specs/2026-09-17-ordergroove-auth-path-design.md` explains why this is built on today's transport; the program spec `docs/superpowers/specs/2026-09-15-ordergroove-subscriptions-custom-manager-design.md` §2 carries the token findings this plan relies on.

## Global Constraints

- All commands run from `apps/storefront/` (`cd apps/storefront` first). Node `>=22.16.0`, Yarn `1.22.22`.
- No new Redux slices, Context providers, `localStorage`/`sessionStorage`. Redux is read once at the top of a page and passed down.
- Mutations: `useMutation`, never a client-side retry, never an optimistic update. The change-card success invalidates `['ordergroove', customerId, 'subscriptions']`, `…'upcoming'` and `…'payments'`. The delete-dialog move invalidates `['subscriptionsUsingToken', customerId, token]`.
- Write deadline **10 000 ms**, read deadline **5 000 ms**, both already in `api.ts`. Status mapping unchanged: 401/403 after the re-mint → `sessionExpired`, 429 → `rateLimited`, everything else non-2xx (400 and 423 included) → `upstream`.
- Endpoints exactly as spec §3.2: `POST /payments/create/`, `PATCH /subscriptions/{id}/change_payment/ { payment }`, `PATCH /orders/{id}/change_payment/ { payment }`, `POST /payments/{id}/use_for_all/` (no body, **200 with an empty response**).
- **`POST /payments/create/` is one-way.** Ordergroove has no delete for payment records; `PATCH /payments/{id}` only deactivates. Task 0 must never call it. Task 7 calls it at most once.
- Reuse only a record that is **`live`** and whose `token_id` equals the chosen instrument's token. A dead record with the same token is not reusable and does not mark an option as current (spec §5).
- Imports: `@/` alias, `lodash-es` only, named MUI imports. Import groups separated by blank lines: externals, then `@/…`, then relative.
- ESLint airbnb is on: no `for…of`, no `await` in loops, **no nested ternaries**, no `console`. Do not add violations of the disabled-rule list in CLAUDE.md (no `any`, no `!` assertions, no JSX prop spreading). Testing-library rules forbid reaching for DOM nodes — query by role, and name a render result `view`, never `rendered`.
- knip fails on unused exports: **export only what another `src` file consumes.** `yarn lint` runs at Task 6; a module landed one task before its consumer shows as an orphan until then.
- Commit subject format: `type: B2B-0000 Short description`; end every commit message with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Stage by explicit path — this tree carries other sessions' uncommitted work.
- Copy is fixed by spec §7. Any wording change is recorded back into the spec at Task 6.
- **Live writes are reversible only.** Task 0 repoints between records the account already holds and restores. Task 7 repoints one subscription and restores it, and **never clicks the live Delete confirm**.
- Every planned test must be seen **failing** before its implementation step.
- Test gotchas carried from Phases 2 and 3a: the test store's date format is blank, so seed `storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } })` when asserting dates; never draw a random id inside a `renderHook`/render callback; `B3Dialog` only opens on a **re-render** after its container ref is set, so a dialog test renders closed then re-renders open, and a row keeps its dialogs mounted and toggles `isOpen`; one test case that opens and closes several MUI dialogs crosses the 5 s per-test limit under load — keep each case to one dialog.

## Before you start

1. Work in a worktree: `EnterWorktree` lands on `origin/dev`, not local `dev` — run `git reset --hard dev` in it first, then symlink `node_modules` from the main checkout (repo root and `apps/storefront/`). The worktree guard refuses `$VAR` expansions, heredocs and compound `cd`/redirect chains; use the Edit/Write tools and literal paths there.
2. `git status`. Other sessions leave uncommitted work in this tree. Never `git add` a path you did not change; never `git add -A`.
3. Baseline: `yarn vitest run 2>&1 | grep -E "^ ❯ src/.*\.test\.tsx? \(" | sed -E 's/^ ❯ //; s/ \(.*//' | sort -u > /tmp/baseline-failing.txt` once. The dev branch has a known red baseline of roughly 21 files that time out under the suite's own load, and the set **shuffles run to run**; only files that also fail when run alone are regressions.
4. Sandbox fixture for Tasks 0 and 7: customer **80591** (credentials in `apps/storefront/.env` as `VITE_TEST_ACCOUNT_EMAIL` / `VITE_TEST_ACCOUNT_PASSWORD` — never print them). 3 BigCommerce stored instruments, 14 active subscriptions all on one Ordergroove payment record, 4 distinct Ordergroove token ids across 8 records. `OG_PUBLIC_ID` (the merchant id) is in the session scratchpad's `og.env`; never commit or print it.
5. Sandbox talks to Ordergroove **production**. Every write in Tasks 0 and 7 is restored in the same run; if a run aborts half-way, restore by hand with the probe's `change_payment` step before doing anything else.
6. Phase 3a's tooling is in the session scratchpad under `pw/` (`playwright` installed, system Chrome at `/usr/bin/google-chrome`, `og-write-probe.mjs`, `phase3a-live.mjs`). Tasks 0 and 7 copy those recipes. The store's display format is `M jS Y`, so a scraper must strip the ordinal ("Nov 20th 2026") before `Date.parse`.

## File structure

| File | Responsibility |
|---|---|
| `src/shared/service/ssw/customerClient.ts` | **new** — the SSW customer-middleware transport: config, `PaymentMethodsError`, `fetchJson`, `post`, `StoredInstrument`, `listStoredInstruments` |
| `src/pages/PaymentMethods/api.ts` | keeps the page's own actions (`setDefault`, `delete`, Braintree), importing the transport |
| `src/shared/service/ordergroove/api.ts` | `assertOk`, `ogMutateNoContent`, `createPayment`, `changeSubscriptionPayment`, `changeOrderPayment`, `usePaymentForAll` |
| `src/shared/service/ordergroove/index.ts` | barrel: the four calls and `NewPaymentInput` |
| `src/pages/ManageSubscriptions/viewModel.ts` | `CardOption`, `buildCardOptions`, `ccTypeFor`, `formatExpiry` |
| `src/pages/ManageSubscriptions/hooks/useSubscriptionActions.ts` | the `changeCard` mutation and its resolve-or-create |
| `src/pages/ManageSubscriptions/components/actions/ChangeCardDialog.tsx` | **new** — the picker |
| `src/pages/ManageSubscriptions/components/actions/SubscriptionActions.tsx` | the Change card button and dialog |
| `src/pages/PaymentMethods/hooks/useMoveSubscriptions.ts` | **new** — resolve-or-create then `use_for_all` |
| `src/pages/PaymentMethods/components/DeleteSubscriptionWarning.tsx` | the move offer and its moved state |
| `src/pages/PaymentMethods/index.tsx` | wires the offer into the delete dialog |
| `src/lib/lang/locales/en.json` | `subscriptions.actions.changeCard.*`, `paymentMethods.deleteDialog.move.*` |

---

### Task 0: Live probe — does an upcoming order follow its subscription's new card? (reversible, creates nothing)

**Files:** none in the repo. Script lives in your scratch directory and is not committed.

**Interfaces:**
- Produces: findings A–C below, which Tasks 2, 4 and 5 read.

- [ ] **Step 1: Write the probe script** to `<scratch>/og-payment-probe.mjs`

```js
// Phase 4 Task 0. Reversible probe for customer 80591: repoints ONE subscription between two
// payment records the account ALREADY holds, reads back the subscription and its upcoming order,
// then restores. NEVER calls /payments/create/ (Ordergroove cannot delete a payment record).
import { readFileSync } from 'node:fs';

const MINT = 'https://test-onlineservices.storesupply.com/products/productclient/ordergroove-auth';
const OG = 'https://restapi.ordergroove.com';
const CUSTOMER = '80591';
// Only these two write paths are permitted; anything else throws before it is sent.
const ALLOWED = /^\/(subscriptions\/[0-9a-f]{32}\/change_payment\/|payments\/[0-9a-f]{32}\/use_for_all\/)$/;

const publicId =
  process.env.OG_PUBLIC_ID ??
  readFileSync(new URL('./og.env', import.meta.url), 'utf8')
    .match(/^OG_PUBLIC_ID=(.*)$/m)?.[1]
    ?.trim()
    .replace(/^['"]|['"]$/g, '');
if (!publicId) throw new Error('OG_PUBLIC_ID is not set and og.env has no OG_PUBLIC_ID line');

const mint = await (
  await fetch(MINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId: CUSTOMER, storeHash: '24erkpw9h6' }),
  })
).json();
const [sigField, ts, sig] = mint.cookieValue.split('|');
const headers = {
  Authorization: JSON.stringify({ public_id: publicId, sig_field: sigField, ts: Number(ts), sig }),
  'Content-Type': 'application/json',
};

const redact = (v) =>
  JSON.stringify(v).replace(/[0-9a-f]{64}/g, '<tok64>').replace(/[0-9a-f]{32}/g, '<id32>');
const listAll = async (path, acc = []) => {
  const body = await (await fetch(`${OG}${path}`, { headers })).json();
  const all = [...acc, ...body.results];
  return body.next ? listAll(body.next.replace(OG, ''), all) : all;
};
const write = async (path, body) => {
  if (!ALLOWED.test(path)) throw new Error(`refusing to write ${path}`);
  const response = await fetch(`${OG}${path}`, {
    method: path.includes('use_for_all') ? 'POST' : 'PATCH',
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await response.text();
  return { status: response.status, empty: text === '', body: text ? JSON.parse(text) : null };
};

const payments = await listAll('/payments/');
const subs = (await listAll('/subscriptions/')).filter((s) => s.cancelled === null && s.live);
const orders = await listAll('/orders/?status=1');
const items = await listAll('/items/?status=1');

// B. Record inventory — the reuse rule in spec §5 needs live and dead records to exist.
const byToken = new Map();
payments.forEach((p) => byToken.set(p.token_id, [...(byToken.get(p.token_id) ?? []), p]));
console.log('B records:', payments.length, '| distinct tokens:', byToken.size,
  '| live:', payments.filter((p) => p.live).length,
  '| dead:', payments.filter((p) => !p.live).length,
  '| tokens with >1 record:', [...byToken.values()].filter((g) => g.length > 1).length);

// A. Does the upcoming order follow the subscription?
const placeByOrder = new Map(orders.map((o) => [o.public_id, o.place.slice(0, 10)]));
const withOrder = subs
  .map((s) => ({ s, item: items.find((i) => i.subscription === s.public_id && placeByOrder.has(i.order)) }))
  .filter((x) => x.item)
  .sort((a, b) => placeByOrder.get(b.item.order).localeCompare(placeByOrder.get(a.item.order)));
if (withOrder.length === 0) throw new Error('no active subscription has an upcoming order');
const { s: subject, item } = withOrder[0];
const order = orders.find((o) => o.public_id === item.order);
const original = subject.payment;
const target = payments.find((p) => p.live && p.public_id !== original);
if (!target) throw new Error('no second live payment record on the account — cannot probe without creating one');
console.log('A subject', redact({ sub: subject.public_id, place: order.place.slice(0, 10), subPayment: original, orderPayment: order.payment, target: target.public_id }));

const changed = await write(`/subscriptions/${subject.public_id}/change_payment/`, { payment: target.public_id });
const afterOrders = await listAll('/orders/?status=1');
const afterOrder = afterOrders.find((o) => o.public_id === order.public_id);
const afterSub = (await listAll('/subscriptions/')).find((x) => x.public_id === subject.public_id);
console.log('A change_payment ->', changed.status,
  '| subscription.payment moved:', afterSub?.payment === target.public_id,
  '| ORDER.payment moved:', afterOrder ? afterOrder.payment === target.public_id : '(order gone)',
  '| order still upcoming:', Boolean(afterOrder));

const restored = await write(`/subscriptions/${subject.public_id}/change_payment/`, { payment: original });
const back = (await listAll('/subscriptions/')).find((x) => x.public_id === subject.public_id);
console.log('A restore ->', restored.status, '| back on the original record:', back?.payment === original);

// C. use_for_all round trip. Every active subscription currently shares one record, so calling it
// with a second record and then with the original returns the account exactly where it started.
const beforeAll = new Map(subs.map((x) => [x.public_id, x.payment]));
const distinctBefore = new Set(beforeAll.values());
console.log('C distinct payment records across active subscriptions before:', distinctBefore.size);
if (distinctBefore.size !== 1) {
  console.log('C SKIPPED — subscriptions are spread across records; restoring would need per-subscription writes');
} else {
  const used = await write(`/payments/${target.public_id}/use_for_all/`, undefined);
  const afterUse = (await listAll('/subscriptions/')).filter((x) => x.cancelled === null && x.live);
  const ordersAfterUse = await listAll('/orders/?status=1');
  console.log('C use_for_all ->', used.status, '| empty body:', used.empty,
    '| active subscriptions on target:', afterUse.filter((x) => x.payment === target.public_id).length, 'of', afterUse.length,
    '| upcoming orders on target:', ordersAfterUse.filter((o) => o.payment === target.public_id).length, 'of', ordersAfterUse.length);
  const restoreAll = await write(`/payments/${[...distinctBefore][0]}/use_for_all/`, undefined);
  const final = (await listAll('/subscriptions/')).filter((x) => x.cancelled === null && x.live);
  console.log('C restore ->', restoreAll.status,
    '| every active subscription back on the original record:',
    final.every((x) => x.payment === [...distinctBefore][0]));
}
```

- [ ] **Step 2: Run it**

Run: `OG_PUBLIC_ID=<merchant id> node <scratch>/og-payment-probe.mjs`
Expected: every `->` shows `200`; both restore lines report `true`. If a restore reports `false`, re-run the matching `change_payment` or `use_for_all` by hand before doing anything else.

- [ ] **Step 3: Record the findings here** (edit this file; Tasks 2, 4 and 5 read these lines)

- Finding A — **does the already-generated upcoming order follow the subscription?** `[ ] yes, order.payment moved` / `[ ] no, order.payment unchanged`.
  - **yes** → delete `changeOrderPayment` from Task 2 entirely, and drop the order step from Task 4's mutation and its test.
  - **no** → keep both; the change-card flow repoints the upcoming order after the subscription.
- Finding B — record inventory: ___ records, ___ distinct tokens, ___ live, ___ dead, ___ tokens carrying more than one record. Task 3's reuse tests mirror these shapes.
- Finding C — `use_for_all`: status ___, empty body `[ ] yes` / `[ ] no`, moved ___ of ___ active subscriptions and ___ of ___ upcoming orders, restored `[ ] yes` / `[ ] no`. The empty-body answer is what Task 2's no-content helper exists for; if the body is **not** empty, simplify `usePaymentForAll` to a normal `ogMutate` and say so at Task 6.

- [ ] **Step 4: Delete nothing, commit nothing.** The script stays in scratch.

---

### Task 1: Lift the SSW customer-middleware client into a shared service

**Files:**
- Create: `apps/storefront/src/shared/service/ssw/customerClient.ts`
- Modify: `apps/storefront/src/pages/PaymentMethods/api.ts` (keep only the page's own actions)
- Modify: the files that import `StoredInstrument` / `listStoredInstruments` / `PaymentMethodsError` / `isPaymentMethodsAvailable` from `./api`
- Test: `apps/storefront/src/pages/PaymentMethods/api.test.ts` (imports move; assertions unchanged)

**Interfaces:**
- Produces, all from `@/shared/service/ssw/customerClient`:
  - `interface StoredInstrument { token, last4, brand, expiryMonth, expiryYear, type, isDefault, source }`
  - `class PaymentMethodsError extends Error { kind: 'sessionExpired'|'notFound'|'rateLimited'|'declined'|'upstream' }`
  - `isPaymentMethodsAvailable(): boolean`
  - `fetchJson(action: string, body: Record<string, unknown>): Promise<any>`
  - `post(action: string, body: Record<string, unknown>): Promise<StoredInstrumentsResponse>`
  - `listStoredInstruments(): Promise<StoredInstrumentsResponse>`

This task moves code without changing behaviour, so it has no new test of its own: the existing
payment-methods suites are the test, and they must pass unchanged.

- [ ] **Step 1: Create the shared module** by moving lines 1–149 of `src/pages/PaymentMethods/api.ts` verbatim into `src/shared/service/ssw/customerClient.ts`, with two edits:

- drop `import { BillingFormValues } from './billingPrefill';` (only the Braintree vault uses it, which stays in the page)
- change `import { getCurrentCustomerJWT } from '@/shared/service/bc';` and the other `@/` imports — they are already alias imports and need no change
- export `post` (it was module-private; the page's own actions need it)

The moved surface is exactly: `StoredInstrument`, `StoredInstrumentsResponse`, `RawInstrument`,
`RawStoredInstrumentsResponse`, `normalizeInstrument`, `normalize`, `PaymentMethodsErrorKind`,
`PaymentMethodsError`, `getPaymentMethodsConfig`, `isPaymentMethodsAvailable`, `fetchJson`, `post`,
`listStoredInstruments`. Keep every comment — they record why the casing is tolerated and why a 422
carries no detail.

- [ ] **Step 2: Reduce the page's `api.ts`** to its own actions:

```ts
import {
  fetchJson,
  post,
} from '@/shared/service/ssw/customerClient';

import { BillingFormValues } from './billingPrefill';

export const setDefaultStoredInstrument = (token: string) =>
  post('SetDefaultStoredInstrument', { Token: token });

export const deleteStoredInstrument = (token: string) =>
  post('DeleteStoredInstrument', { Token: token });

export const getBraintreeClientToken = async (): Promise<string> => {
  const { clientToken } = await fetchJson('BraintreeClientToken', {});

  return clientToken;
};

export const vaultBraintreeInstrument = ({ … }) => post('VaultBraintreeInstrument', { … });
```

Keep `vaultBraintreeInstrument` exactly as it is today, body and comments included; only its
`post` now comes from the shared module.

- [ ] **Step 3: Repoint the importers.** Find them:

Run: `grep -rn "StoredInstrument\|listStoredInstruments\|PaymentMethodsError\|isPaymentMethodsAvailable" src --include=*.ts --include=*.tsx | grep "from './api'\|from '../api'\|from '../../api'"`

For each hit, import those four names from `@/shared/service/ssw/customerClient` instead, leaving
`setDefaultStoredInstrument`, `deleteStoredInstrument`, `getBraintreeClientToken` and
`vaultBraintreeInstrument` coming from the page's `./api`. Expected files: `index.tsx`,
`components/PaymentMethodRow.tsx`, `components/AddPaymentMethodBraintreeDialog.tsx`,
`vaultAccess.ts`, and the four test files. Do **not** re-export from `./api` — one canonical path.

- [ ] **Step 4: Run the payment-methods and shared suites**

Run: `yarn vitest run src/pages/PaymentMethods src/shared/service`
Expected: every file green, with the same test counts as before the move. A failure here is a
missed import, not a behaviour change.

- [ ] **Step 5: Type-check and lint**

Run: `yarn tsc --noEmit` then `yarn eslint --fix src/shared/service/ssw/customerClient.ts src/pages/PaymentMethods`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/shared/service/ssw/customerClient.ts apps/storefront/src/pages/PaymentMethods
git commit -m "refactor: B2B-0000 Lift the SSW customer middleware client into a shared service" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Service — the no-content helper and the four payment calls

**Files:**
- Modify: `apps/storefront/src/shared/service/ordergroove/api.ts`
- Modify: `apps/storefront/src/shared/service/ordergroove/index.ts`
- Test: `apps/storefront/src/shared/service/ordergroove/api.test.ts`

**Interfaces:**
- Consumes: `request`, `OrdergrooveError`, `OgOrder`, `OgPayment`, `OgSubscription` (existing).
- Produces:
  - `interface NewPaymentInput { tokenId: string; last4: string; expiry: string; ccType?: number; billingAddress?: string }`
  - `createPayment(customerId: string, input: NewPaymentInput): Promise<OgPayment>`
  - `changeSubscriptionPayment(customerId: string, subscriptionId: string, paymentId: string): Promise<OgSubscription>`
  - `changeOrderPayment(customerId: string, orderId: string, paymentId: string): Promise<OgOrder>` — **omit entirely if Task 0 finding A is "yes"**
  - `usePaymentForAll(customerId: string, paymentId: string): Promise<void>`

- [ ] **Step 1: Write the failing tests** — append to `api.test.ts`, adding `changeOrderPayment`, `changeSubscriptionPayment`, `createPayment`, `usePaymentForAll` to the existing `from './api'` import list (alphabetical), and `buildOgSubscriptionWith` is already imported.

```ts
describe('payment changes', () => {
  it('creates a payment record from a stored instrument', async () => {
    const received = vi.fn();
    const payment = buildOgPaymentWith({ public_id: 'pay-new' });
    server.use(
      http.post(`${ogBase}/payments/create/`, async ({ request }) => {
        received(await request.json());

        return HttpResponse.json(payment);
      }),
    );

    const result = await createPayment('80591', {
      tokenId: 'tok-1',
      last4: '4242',
      expiry: '03/2028',
      ccType: 1,
      billingAddress: 'addr-1',
    });

    expect(result).toEqual(payment);
    expect(received).toHaveBeenCalledWith({
      customer: '80591',
      token_id: 'tok-1',
      cc_number_ending: '4242',
      cc_exp_date: '03/2028',
      cc_type: 1,
      billing_address: 'addr-1',
    });
  });

  it('omits the optional fields it was not given', async () => {
    const received = vi.fn();
    server.use(
      http.post(`${ogBase}/payments/create/`, async ({ request }) => {
        received(await request.json());

        return HttpResponse.json(buildOgPaymentWith('WHATEVER_VALUES'));
      }),
    );

    await createPayment('80591', { tokenId: 'tok-1', last4: '4242', expiry: '03/2028' });

    expect(received).toHaveBeenCalledWith({
      customer: '80591',
      token_id: 'tok-1',
      cc_number_ending: '4242',
      cc_exp_date: '03/2028',
    });
  });

  it('repoints one subscription at a payment record', async () => {
    const received = vi.fn();
    const subscription = buildOgSubscriptionWith({ payment: 'pay-2' });
    server.use(
      http.patch(`${ogBase}/subscriptions/sub-1/change_payment/`, async ({ request }) => {
        received(await request.json());

        return HttpResponse.json(subscription);
      }),
    );

    expect(await changeSubscriptionPayment(someCustomerId(), 'sub-1', 'pay-2')).toEqual(
      subscription,
    );
    expect(received).toHaveBeenCalledWith({ payment: 'pay-2' });
  });

  it('repoints one upcoming order at a payment record', async () => {
    const received = vi.fn();
    const order = buildOgOrderWith({ status: 1, payment: 'pay-2' });
    server.use(
      http.patch(`${ogBase}/orders/order-1/change_payment/`, async ({ request }) => {
        received(await request.json());

        return HttpResponse.json(order);
      }),
    );

    expect(await changeOrderPayment(someCustomerId(), 'order-1', 'pay-2')).toEqual(order);
    expect(received).toHaveBeenCalledWith({ payment: 'pay-2' });
  });

  it('uses a payment for everything and tolerates the empty 200 body', async () => {
    const calls = vi.fn();
    server.use(
      http.post(`${ogBase}/payments/pay-2/use_for_all/`, async ({ request }) => {
        calls(request.method, await request.text());

        // Ordergroove answers 200 with no body at all — parsing it as JSON would throw.
        return new HttpResponse(null, { status: 200 });
      }),
    );

    await expect(usePaymentForAll(someCustomerId(), 'pay-2')).resolves.toBeUndefined();
    expect(calls).toHaveBeenCalledWith('POST', '');
  });

  it('still maps failures on the no-content call', async () => {
    server.use(
      http.post(`${ogBase}/payments/pay-2/use_for_all/`, () => new HttpResponse(null, { status: 500 })),
    );
    await expect(usePaymentForAll(someCustomerId(), 'pay-2')).rejects.toMatchObject({
      kind: 'upstream',
    });

    server.use(
      http.post(`${ogBase}/payments/pay-2/use_for_all/`, () =>
        HttpResponse.json({ detail: 'Authentication Failed' }, { status: 403 }),
      ),
    );
    await expect(usePaymentForAll(someCustomerId(), 'pay-2')).rejects.toMatchObject({
      kind: 'sessionExpired',
    });
  });
});
```

If Task 0 finding A is "yes", delete the `repoints one upcoming order` case along with the function.

- [ ] **Step 2: Run the file to verify the new tests fail**

Run: `yarn vitest run src/shared/service/ordergroove/api.test.ts`
Expected: the new cases fail — `createPayment is not a function` and siblings. The existing cases stay green.

- [ ] **Step 3: Split the status mapping out of `parse`** in `api.ts` — replace the existing `parse` with:

```ts
const assertOk = (response: Response) => {
  if (response.ok) {
    return;
  }
  if (response.status === 401 || response.status === 403) {
    throw new OrdergrooveError('sessionExpired');
  }
  if (response.status === 429) {
    throw new OrdergrooveError('rateLimited');
  }
  throw new OrdergrooveError('upstream');
};

const parse = async <T>(response: Response): Promise<T> => {
  assertOk(response);

  return response.json() as Promise<T>;
};

/**
 * For endpoints that answer 200 with no body — `use_for_all` is the only one today. Parsing an
 * empty body as JSON throws, and that rejection would escape as a SyntaxError rather than an
 * OrdergrooveError, so a successful call would report a failure to the customer.
 */
const ogMutateNoContent = async (
  customerId: string,
  url: string,
  method: Write['method'],
  body?: object,
): Promise<void> => {
  assertOk(await request(customerId, url, true, { method, body }));
};
```

`ogFetch` and `ogMutate` keep their bodies; only the mapping moved.

- [ ] **Step 4: Add the four calls** at the end of `api.ts`, beside the Phase 3a actions:

```ts
const paymentUrl = (paymentId: string, action: string) =>
  `${API_BASE}/payments/${encodeURIComponent(paymentId)}/${action}/`;

/** A BigCommerce stored instrument, in the shape Ordergroove's create endpoint wants. */
export interface NewPaymentInput {
  /** the BigCommerce stored-instrument token — Ordergroove's token_id, byte for byte (spec §11.2) */
  tokenId: string;
  last4: string;
  /** "MM/YYYY", zero-padded */
  expiry: string;
  /** Ordergroove credit-card type code; omitted for a brand we do not map */
  ccType?: number;
  /** the billing address of the subscription's current record, when known */
  billingAddress?: string;
}

/**
 * Registers a card Ordergroove does not hold yet. One-way: Ordergroove has no delete for payment
 * records, so callers must look for a live record with the same token first (spec §5).
 */
export const createPayment = (customerId: string, input: NewPaymentInput) =>
  ogMutate<OgPayment>(customerId, `${API_BASE}/payments/create/`, 'POST', {
    customer: customerId,
    token_id: input.tokenId,
    cc_number_ending: input.last4,
    cc_exp_date: input.expiry,
    ...(input.ccType === undefined ? {} : { cc_type: input.ccType }),
    ...(input.billingAddress === undefined ? {} : { billing_address: input.billingAddress }),
  });

export const changeSubscriptionPayment = (
  customerId: string,
  subscriptionId: string,
  paymentId: string,
) =>
  ogMutate<OgSubscription>(
    customerId,
    subscriptionUrl(subscriptionId, 'change_payment'),
    'PATCH',
    { payment: paymentId },
  );

/** An order already generated keeps its own payment; repoint it too (Task 0 finding A). */
export const changeOrderPayment = (customerId: string, orderId: string, paymentId: string) =>
  ogMutate<OgOrder>(customerId, orderUrl(orderId, 'change_payment'), 'PATCH', {
    payment: paymentId,
  });

/** Moves every subscription AND every order of the customer onto this record. 200, empty body. */
export const usePaymentForAll = (customerId: string, paymentId: string) =>
  ogMutateNoContent(customerId, paymentUrl(paymentId, 'use_for_all'), 'POST');
```

- [ ] **Step 5: Export from the barrel** — in `index.ts` add `changeOrderPayment`, `changeSubscriptionPayment`, `createPayment`, `usePaymentForAll` to the `from './api'` list (alphabetical) and `NewPaymentInput` to the `export type` list.

- [ ] **Step 6: Run the file to verify it passes**

Run: `yarn vitest run src/shared/service/ordergroove/api.test.ts`
Expected: every case passes, the pre-existing ones included.

- [ ] **Step 7: Type-check** — `yarn tsc --noEmit`. Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/storefront/src/shared/service/ordergroove/api.ts apps/storefront/src/shared/service/ordergroove/index.ts apps/storefront/src/shared/service/ordergroove/api.test.ts
git commit -m "feat: B2B-0000 Add the Ordergroove payment create, repoint and use-for-all calls" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: View model — card options, card-type codes, expiry

**Files:**
- Modify: `apps/storefront/src/pages/ManageSubscriptions/viewModel.ts`
- Test: `apps/storefront/src/pages/ManageSubscriptions/viewModel.test.ts`

**Interfaces:**
- Consumes: `OgPayment` (existing), `StoredInstrument` from `@/shared/service/ssw/customerClient` (Task 1).
- Produces:
  - `interface CardOption { token: string; brand: string; last4: string; expiry: string; isCurrent: boolean; paymentId: string | null }`
  - `buildCardOptions(instruments: StoredInstrument[], payments: OgPayment[] | undefined, currentPaymentId: string): CardOption[]`
  - `ccTypeFor(brand: string): number | undefined`
  - `formatExpiry(month: number, year: number): string`

- [ ] **Step 1: Write the failing tests** — append to `viewModel.test.ts`, adding `buildCardOptions`, `ccTypeFor`, `formatExpiry` to the `./viewModel` import and `StoredInstrument` from `@/shared/service/ssw/customerClient` if you annotate.

```ts
describe('card options', () => {
  const instrument = (over: Partial<StoredInstrument> = {}): StoredInstrument => ({
    token: 'tok-a',
    last4: '4242',
    brand: 'VISA',
    expiryMonth: 3,
    expiryYear: 2028,
    type: 'card',
    isDefault: true,
    source: 'bigcommerce',
    ...over,
  });

  it('joins each saved card to the live Ordergroove record holding its token', () => {
    const live = buildOgPaymentWith({ public_id: 'pay-a', token_id: 'tok-a', live: true });
    const other = buildOgPaymentWith({ public_id: 'pay-b', token_id: 'tok-b', live: true });

    const options = buildCardOptions(
      [instrument(), instrument({ token: 'tok-b', last4: '1881', brand: 'AMEX', isDefault: false })],
      [live, other],
      'pay-a',
    );

    expect(options).toEqual([
      {
        token: 'tok-a',
        brand: 'VISA',
        last4: '4242',
        expiry: '03/2028',
        isCurrent: true,
        paymentId: 'pay-a',
      },
      {
        token: 'tok-b',
        brand: 'AMEX',
        last4: '1881',
        expiry: '03/2028',
        isCurrent: false,
        paymentId: 'pay-b',
      },
    ]);
  });

  it('will not reuse a dead record, and a dead record never marks a card current', () => {
    // Ordergroove keeps records for cards BigCommerce no longer has, and mints a new record per
    // checkout, so several records share a token and only the live one is reusable (spec §11.2).
    const dead = buildOgPaymentWith({ public_id: 'pay-old', token_id: 'tok-a', live: false });

    const [option] = buildCardOptions([instrument()], [dead], 'pay-old');

    expect(option.paymentId).toBeNull();
    expect(option.isCurrent).toBe(false);
  });

  it('prefers the live record when a token carries both', () => {
    const dead = buildOgPaymentWith({ public_id: 'pay-old', token_id: 'tok-a', live: false });
    const live = buildOgPaymentWith({ public_id: 'pay-new', token_id: 'tok-a', live: true });

    const [option] = buildCardOptions([instrument()], [dead, live], 'pay-new');

    expect(option).toMatchObject({ paymentId: 'pay-new', isCurrent: true });
  });

  it('leaves the record unknown while payments have not loaded', () => {
    const [option] = buildCardOptions([instrument()], undefined, 'pay-a');

    expect(option).toMatchObject({ paymentId: null, isCurrent: false });
  });
});

describe('card type and expiry', () => {
  it('maps the brands Ordergroove names and ignores the rest', () => {
    expect(ccTypeFor('VISA')).toBe(1);
    expect(ccTypeFor('MASTERCARD')).toBe(2);
    expect(ccTypeFor('AMEX')).toBe(3);
    expect(ccTypeFor('American Express')).toBe(3);
    expect(ccTypeFor('DISCOVER')).toBe(4);
    expect(ccTypeFor(' diners club ')).toBe(5);
    expect(ccTypeFor('JCB')).toBe(6);
    // Optional on Ordergroove's side, so an unmapped brand simply omits the field.
    expect(ccTypeFor('SOLO')).toBeUndefined();
    expect(ccTypeFor('')).toBeUndefined();
  });

  it('formats expiry as zero-padded MM/YYYY', () => {
    expect(formatExpiry(3, 2028)).toBe('03/2028');
    expect(formatExpiry(12, 2030)).toBe('12/2030');
  });
});
```

- [ ] **Step 2: Run the file to verify the new tests fail**

Run: `yarn vitest run src/pages/ManageSubscriptions/viewModel.test.ts`
Expected: compile errors — `buildCardOptions`, `ccTypeFor` and `formatExpiry` are not exported.

- [ ] **Step 3: Implement** — in `viewModel.ts`, add `StoredInstrument` to the imports and append:

```ts
export interface CardOption {
  /** BigCommerce stored-instrument token */
  token: string;
  brand: string;
  last4: string;
  /** "MM/YYYY" */
  expiry: string;
  /** true when the live record holding this token is the subscription's current payment */
  isCurrent: boolean;
  /** the live Ordergroove record already holding this token, else null — the reuse-or-create answer */
  paymentId: string | null;
}

// Ordergroove reference "Credit Card Types" — the inverse of CARD_BRANDS above. BigCommerce sends
// upper-case names; anything unmapped is left out because Ordergroove marks the field optional.
const CC_TYPES: Record<string, number> = {
  VISA: 1,
  MASTERCARD: 2,
  AMEX: 3,
  'AMERICAN EXPRESS': 3,
  DISCOVER: 4,
  DINERS: 5,
  'DINERS CLUB': 5,
  JCB: 6,
};

export const ccTypeFor = (brand: string) => CC_TYPES[brand.trim().toUpperCase()];

export const formatExpiry = (month: number, year: number) =>
  `${String(month).padStart(2, '0')}/${year}`;

/**
 * One option per saved BigCommerce card, in the order the middleware returns them (default first),
 * each joined to the LIVE Ordergroove record holding its token. `paymentId === null` is the signal
 * to create a record; a dead record with the same token is neither reusable nor current.
 */
export const buildCardOptions = (
  instruments: StoredInstrument[],
  payments: OgPayment[] | undefined,
  currentPaymentId: string,
): CardOption[] => {
  const liveByToken = new Map(
    (payments ?? []).filter((payment) => payment.live).map((payment) => [payment.token_id, payment]),
  );

  return instruments.map((instrument) => {
    const payment = liveByToken.get(instrument.token);

    return {
      token: instrument.token,
      brand: instrument.brand,
      last4: instrument.last4,
      expiry: formatExpiry(instrument.expiryMonth, instrument.expiryYear),
      isCurrent: payment?.public_id === currentPaymentId,
      paymentId: payment?.public_id ?? null,
    };
  });
};
```

- [ ] **Step 4: Run the file to verify it passes**

Run: `yarn vitest run src/pages/ManageSubscriptions/viewModel.test.ts`
Expected: every case passes.

- [ ] **Step 5: Type-check and lint** — `yarn tsc --noEmit`; `yarn eslint --fix src/pages/ManageSubscriptions/viewModel.ts src/pages/ManageSubscriptions/viewModel.test.ts`. Both exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/pages/ManageSubscriptions/viewModel.ts apps/storefront/src/pages/ManageSubscriptions/viewModel.test.ts
git commit -m "feat: B2B-0000 Build saved-card options joined to their Ordergroove payment records" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Change card on a subscription — mutation, dialog, row

**Files:**
- Modify: `apps/storefront/src/lib/lang/locales/en.json`
- Modify: `apps/storefront/src/pages/ManageSubscriptions/hooks/useSubscriptionActions.ts`
- Create: `apps/storefront/src/pages/ManageSubscriptions/components/actions/ChangeCardDialog.tsx`
- Modify: `apps/storefront/src/pages/ManageSubscriptions/components/actions/SubscriptionActions.tsx`
- Test: `hooks/useSubscriptionActions.test.tsx`, `components/actions/ChangeCardDialog.test.tsx`, `components/actions/SubscriptionActions.test.tsx`

**Interfaces:**
- Consumes: `createPayment`, `changeSubscriptionPayment`, `changeOrderPayment`, `NewPaymentInput` (Task 2); `CardOption`, `ccTypeFor` (Task 3); `listStoredInstruments`, `StoredInstrument` (Task 1).
- Produces:
  - `useSubscriptionActions(customerId)` gains `changeCard: UseMutationResult<void, Error, ChangeCardVariables>` where
    `interface ChangeCardVariables { subscriptionId: string; orderId: string | null; option: CardOption; billingAddress: string | null }`
  - `ChangeCardDialog` props `{ options: CardOption[]; isOpen: boolean; isPending: boolean; onClose: () => void; onConfirm: (option: CardOption) => void }`
  - `SubscriptionActions` renders the `Change card` button on every active card.

- [ ] **Step 1: Add the copy** — in `en.json`, after the `subscriptions.actions.changeDate.success` line:

```json
  "subscriptions.actions.changeCard": "Change card",
  "subscriptions.actions.changeCard.title": "Change card",
  "subscriptions.actions.changeCard.option": "{brand} ending in {last4} · exp {expiry}",
  "subscriptions.actions.changeCard.current": "{card} (current)",
  "subscriptions.actions.changeCard.onlyCard": "This is your only saved card. To use a different one, add it on the {link}.",
  "subscriptions.actions.changeCard.onlyCardLink": "payment methods page",
  "subscriptions.actions.changeCard.confirm": "Save",
  "subscriptions.actions.changeCard.success": "Card updated.",
```

(Do not run eslint on `en.json` — it reports a bogus error on JSON.)

- [ ] **Step 2: Write the failing hook test** — append to `useSubscriptionActions.test.tsx`:

```ts
describe('changeCard', () => {
  const option = (over: Partial<CardOption> = {}): CardOption => ({
    token: 'tok-b',
    brand: 'VISA',
    last4: '4242',
    expiry: '03/2028',
    isCurrent: false,
    paymentId: null,
    ...over,
  });

  it('reuses an existing record without creating one', async () => {
    const created = vi.fn();
    const repointed = vi.fn();
    server.use(
      http.post(`${ogBase}/payments/create/`, () => {
        created();

        return HttpResponse.json(buildOgPaymentWith('WHATEVER_VALUES'));
      }),
      http.patch(`${ogBase}/subscriptions/s-1/change_payment/`, async ({ request }) => {
        repointed(await request.json());

        return HttpResponse.json(buildOgSubscriptionWith('WHATEVER_VALUES'));
      }),
      http.patch(`${ogBase}/orders/o-1/change_payment/`, () =>
        HttpResponse.json(buildOgOrderWith('WHATEVER_VALUES')),
      ),
    );
    const { customerId } = renderActions();

    actions().changeCard.mutate({
      subscriptionId: 's-1',
      orderId: 'o-1',
      option: option({ paymentId: 'pay-b' }),
      billingAddress: 'addr-1',
    });

    await waitFor(() => expect(actions().changeCard.isSuccess).toBe(true));
    expect(created).not.toHaveBeenCalled();
    expect(repointed).toHaveBeenCalledWith({ payment: 'pay-b' });
    expect(invalidatedKeys()).toEqual([
      ['ordergroove', customerId, 'subscriptions'],
      ['ordergroove', customerId, 'upcoming'],
      ['ordergroove', customerId, 'payments'],
    ]);
    expect(snackbar.success).toHaveBeenCalledWith('Card updated.');
  });

  it('creates a record from the card when Ordergroove has none, then repoints', async () => {
    const created = vi.fn();
    const repointed = vi.fn();
    server.use(
      http.post(`${ogBase}/payments/create/`, async ({ request }) => {
        created(await request.json());

        return HttpResponse.json(buildOgPaymentWith({ public_id: 'pay-new' }));
      }),
      http.patch(`${ogBase}/subscriptions/s-1/change_payment/`, async ({ request }) => {
        repointed(await request.json());

        return HttpResponse.json(buildOgSubscriptionWith('WHATEVER_VALUES'));
      }),
      http.patch(`${ogBase}/orders/o-1/change_payment/`, () =>
        HttpResponse.json(buildOgOrderWith('WHATEVER_VALUES')),
      ),
    );
    const { customerId } = renderActions();

    actions().changeCard.mutate({
      subscriptionId: 's-1',
      orderId: 'o-1',
      option: option(),
      billingAddress: 'addr-1',
    });

    await waitFor(() => expect(actions().changeCard.isSuccess).toBe(true));
    expect(created).toHaveBeenCalledWith({
      customer: String(customerId),
      token_id: 'tok-b',
      cc_number_ending: '4242',
      cc_exp_date: '03/2028',
      cc_type: 1,
      billing_address: 'addr-1',
    });
    expect(repointed).toHaveBeenCalledWith({ payment: 'pay-new' });
  });

  it('repoints the upcoming order too, and skips it when nothing is scheduled', async () => {
    const orderRepointed = vi.fn();
    server.use(
      http.patch(`${ogBase}/subscriptions/s-1/change_payment/`, () =>
        HttpResponse.json(buildOgSubscriptionWith('WHATEVER_VALUES')),
      ),
      http.patch(`${ogBase}/orders/o-1/change_payment/`, async ({ request }) => {
        orderRepointed(await request.json());

        return HttpResponse.json(buildOgOrderWith('WHATEVER_VALUES'));
      }),
    );
    renderActions();

    actions().changeCard.mutate({
      subscriptionId: 's-1',
      orderId: 'o-1',
      option: option({ paymentId: 'pay-b' }),
      billingAddress: null,
    });
    await waitFor(() => expect(actions().changeCard.isSuccess).toBe(true));
    expect(orderRepointed).toHaveBeenCalledWith({ payment: 'pay-b' });

    orderRepointed.mockClear();
    actions().changeCard.mutate({
      subscriptionId: 's-1',
      orderId: null,
      option: option({ paymentId: 'pay-b' }),
      billingAddress: null,
    });
    await waitFor(() => expect(actions().changeCard.isSuccess).toBe(true));
    expect(orderRepointed).not.toHaveBeenCalled();
  });

  it('reports a failed repoint and leaves the cache alone', async () => {
    server.use(
      http.patch(
        `${ogBase}/subscriptions/s-1/change_payment/`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderActions();

    actions().changeCard.mutate({
      subscriptionId: 's-1',
      orderId: null,
      option: option({ paymentId: 'pay-b' }),
      billingAddress: null,
    });

    await waitFor(() => expect(actions().changeCard.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
    expect(snackbar.error).toHaveBeenCalledWith("We couldn't apply that change. Please try again.");
  });
});
```

Add `CardOption` to the `../viewModel` import and `buildOgPaymentWith` to the `tests/test-utils`
import. If Task 0 finding A is "yes", delete the third case's order assertions and the
`orders/o-1/change_payment` handlers, and drop `orderId` from the variables everywhere.

- [ ] **Step 3: Run it to verify it fails**

Run: `yarn vitest run src/pages/ManageSubscriptions/hooks/useSubscriptionActions.test.tsx`
Expected: `actions().changeCard` is undefined — "Cannot read properties of undefined (reading 'mutate')".

- [ ] **Step 4: Implement the mutation** — in `useSubscriptionActions.ts`, extend the imports and add before the `return`:

```ts
export interface ChangeCardVariables {
  subscriptionId: string;
  /** the subscription's upcoming order, when it has one */
  orderId: string | null;
  option: CardOption;
  /** billing address of the subscription's current record, carried onto a new one */
  billingAddress: string | null;
}

const changeCard = useMutation({
  mutationFn: async ({ subscriptionId, orderId, option, billingAddress }: ChangeCardVariables) => {
    // Reuse before create: Ordergroove cannot delete a payment record (spec §1 decision 3).
    const paymentId =
      option.paymentId ??
      (
        await createPayment(id, {
          tokenId: option.token,
          last4: option.last4,
          expiry: option.expiry,
          ccType: ccTypeFor(option.brand),
          ...(billingAddress === null ? {} : { billingAddress }),
        })
      ).public_id;

    await changeSubscriptionPayment(id, subscriptionId, paymentId);
    // An order already generated keeps its own payment (Task 0 finding A).
    if (orderId) {
      await changeOrderPayment(id, orderId, paymentId);
    }
  },
  onSuccess: () =>
    succeed('subscriptions.actions.changeCard.success', ['subscriptions', 'upcoming', 'payments']),
  onError,
});
```

and return it: `return { skip, sendNow, changeDate, changeCard };`

- [ ] **Step 5: Run the hook test to verify it passes**

Run: `yarn vitest run src/pages/ManageSubscriptions/hooks/useSubscriptionActions.test.tsx`
Expected: all cases pass.

- [ ] **Step 6: Write the failing dialog test** — `components/actions/ChangeCardDialog.test.tsx`:

```tsx
import { ReactElement } from 'react';
import { renderWithProviders, screen } from 'tests/test-utils';

import { CardOption } from '../../viewModel';

import ChangeCardDialog from './ChangeCardDialog';

const visa: CardOption = {
  token: 'tok-a',
  brand: 'VISA',
  last4: '4242',
  expiry: '03/2028',
  isCurrent: true,
  paymentId: 'pay-a',
};
const amex: CardOption = {
  token: 'tok-b',
  brand: 'AMEX',
  last4: '1881',
  expiry: '11/2029',
  isCurrent: false,
  paymentId: null,
};

// B3Dialog opens only on a re-render after its container ref exists: render closed, then open.
const renderOpen = (dialog: (isOpen: boolean) => ReactElement) => {
  const view = renderWithProviders(dialog(false));
  view.result.rerender(dialog(true));

  return view;
};

it('lists the saved cards, marks the current one and saves the chosen one', async () => {
  const onConfirm = vi.fn();

  const { user } = renderOpen((isOpen) => (
    <ChangeCardDialog
      options={[visa, amex]}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  expect(
    screen.getByRole('radio', { name: 'VISA ending in 4242 · exp 03/2028 (current)' }),
  ).toBeChecked();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

  await user.click(screen.getByRole('radio', { name: 'AMEX ending in 1881 · exp 11/2029' }));
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(onConfirm).toHaveBeenCalledWith(amex);
});

it('explains itself when the only saved card is the one in use', () => {
  renderOpen((isOpen) => (
    <ChangeCardDialog
      options={[visa]}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('dialog')).toHaveTextContent('This is your only saved card.');
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  // The payment methods page is outside the SPA, so the link must leave the ThemeFrame.
  expect(screen.getByRole('link', { name: 'payment methods page' })).toHaveAttribute(
    'target',
    '_top',
  );
});

it('disables Save while the write is pending', () => {
  renderOpen((isOpen) => (
    <ChangeCardDialog
      options={[visa, amex]}
      isOpen={isOpen}
      isPending
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `yarn vitest run src/pages/ManageSubscriptions/components/actions/ChangeCardDialog.test.tsx`
Expected: fails to resolve `./ChangeCardDialog`.

- [ ] **Step 8: Create the dialog** — `ChangeCardDialog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { FormControlLabel, Link, Radio, RadioGroup, Typography } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';
import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';

import { CardOption } from '../../viewModel';

interface ChangeCardDialogProps {
  options: CardOption[];
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (option: CardOption) => void;
}

function ChangeCardDialog({
  options,
  isOpen,
  isPending,
  onClose,
  onConfirm,
}: ChangeCardDialogProps) {
  const b3Lang = useB3Lang();
  const current = options.find((option) => option.isCurrent);
  const [token, setToken] = useState('');

  // Every opening starts from the card in use, whatever was picked last time.
  useEffect(() => {
    if (isOpen) {
      setToken(current?.token ?? '');
    }
  }, [isOpen, current?.token]);

  const label = (option: CardOption) => {
    const card = b3Lang('subscriptions.actions.changeCard.option', {
      brand: option.brand,
      last4: option.last4,
      expiry: option.expiry,
    });

    return option.isCurrent ? b3Lang('subscriptions.actions.changeCard.current', { card }) : card;
  };

  const chosen = options.find((option) => option.token === token);
  const canSave = Boolean(chosen) && !chosen?.isCurrent;
  const hasChoice = options.length > 1;

  return (
    <B3Dialog
      isOpen={isOpen}
      title={b3Lang('subscriptions.actions.changeCard.title')}
      rightSizeBtn={b3Lang('subscriptions.actions.changeCard.confirm')}
      showRightBtn={hasChoice}
      loading={isPending}
      disabledSaveBtn={!canSave}
      handleLeftClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
      handRightClick={() => {
        if (chosen) {
          onConfirm(chosen);
        }
      }}
    >
      {hasChoice ? (
        <RadioGroup value={token} onChange={(event) => setToken(event.target.value)}>
          {options.map((option) => (
            <FormControlLabel
              key={option.token}
              value={option.token}
              control={<Radio />}
              label={label(option)}
            />
          ))}
        </RadioGroup>
      ) : (
        <Typography>
          {b3Lang('subscriptions.actions.changeCard.onlyCard', {
            link: (
              // A storefront page outside the SPA: open it in the top window, not the ThemeFrame.
              <Link href={`${BigCommerceStorefrontAPIBaseURL}/account.php?action=payment_methods`} target="_top">
                {b3Lang('subscriptions.actions.changeCard.onlyCardLink')}
              </Link>
            ),
          })}
        </Typography>
      )}
    </B3Dialog>
  );
}

export default ChangeCardDialog;
```

If `b3Lang` will not accept a React node for `{link}` (its values are typed
`string | number | Date`), render the sentence as two `Typography` children instead: the copy up to
`{link}` as plain text, then the `Link`. Keep the copy key text identical and note the split at
Task 6.

- [ ] **Step 9: Run the dialog test to verify it passes**

Run: `yarn vitest run src/pages/ManageSubscriptions/components/actions/ChangeCardDialog.test.tsx`
Expected: three cases pass.

- [ ] **Step 10: Write the failing row test** — append to `SubscriptionActions.test.tsx`:

```tsx
it('offers Change card even when nothing is scheduled', async () => {
  server.use(
    http.get(`${ogBase}/payments/`, () =>
      HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
    ),
  );

  const { user } = renderRow(buildCardWith({ nextOrder: null, nextOrderDate: null }));

  await user.click(screen.getByRole('button', { name: 'Change card' }));

  expect(screen.getByRole('dialog')).toHaveTextContent('Change card');
  expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
});
```

- [ ] **Step 11: Run it to verify it fails**

Run: `yarn vitest run src/pages/ManageSubscriptions/components/actions/SubscriptionActions.test.tsx`
Expected: the new case fails — no `Change card` button, and the row renders nothing at all for a card with no upcoming order.

- [ ] **Step 12: Wire the row** — in `SubscriptionActions.tsx`:

1. Add `'changeCard'` to `OpenDialog`.
2. Replace the early `return null` so the row renders whenever the card is active, and gate only the three order actions:

```tsx
  const upcoming = card.nextOrder;
  const isPending =
    skip.isPending || sendNow.isPending || changeDate.isPending || changeCard.isPending;
```

Wrap the Skip, Send now and Change date buttons in `{upcoming && (<>…</>)}`, and render the
`Change card` button unconditionally. Render `SkipDialog`, `SendNowDialog` and `ChangeDateDialog`
only when `upcoming` exists, since each needs its order id.

3. Load the data the picker needs, beside the row's mutations:

```tsx
  const instruments = useQuery({
    queryKey: ['storedInstruments', customerId],
    queryFn: listStoredInstruments,
    enabled: open === 'changeCard',
    retry: false,
  });
  const payments = useQuery({
    queryKey: ['ordergroove', customerId, 'payments'],
    queryFn: () => listPayments(String(customerId)),
    enabled: open === 'changeCard',
    retry: false,
  });
  const cardOptions = buildCardOptions(
    instruments.data?.instruments ?? [],
    payments.data,
    card.paymentId,
  );
```

4. Render the dialog:

```tsx
      <ChangeCardDialog
        options={cardOptions}
        isOpen={open === 'changeCard'}
        isPending={changeCard.isPending}
        onClose={close}
        onConfirm={(option) =>
          changeCard.mutate(
            {
              subscriptionId: card.publicId,
              orderId: upcoming?.orderId ?? null,
              option,
              billingAddress: card.billingAddressId,
            },
            { onSuccess: close },
          )
        }
      />
```

`card.paymentId` and `card.billingAddressId` do not exist yet — add them in `viewModel.ts`
alongside `shippingAddressId`, taking `subscription.payment` and the current payment record's
`billing_address` (null when the record has not loaded), and extend the card builders in
`SubscriptionCard.test.tsx`, `SkipDialog.test.tsx`, `SendNowDialog.test.tsx`,
`ChangeDateDialog.test.tsx` and `SubscriptionActions.test.tsx` with both fields.

- [ ] **Step 13: Run the ManageSubscriptions suite**

Run: `yarn vitest run src/pages/ManageSubscriptions`
Expected: every file green.

- [ ] **Step 14: Type-check and lint** — `yarn tsc --noEmit`; `yarn eslint --fix src/pages/ManageSubscriptions`. Both exit 0.

- [ ] **Step 15: Commit**

```bash
git add apps/storefront/src/lib/lang/locales/en.json apps/storefront/src/pages/ManageSubscriptions
git commit -m "feat: B2B-0000 Let a customer move a subscription onto another saved card" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Move before delete, in the payment-methods dialog

**Files:**
- Modify: `apps/storefront/src/lib/lang/locales/en.json`
- Create: `apps/storefront/src/pages/PaymentMethods/hooks/useMoveSubscriptions.ts`
- Modify: `apps/storefront/src/pages/PaymentMethods/components/DeleteSubscriptionWarning.tsx`
- Modify: `apps/storefront/src/pages/PaymentMethods/index.tsx`
- Test: `hooks/useMoveSubscriptions.test.tsx`, `index.subscriptions.test.tsx`

**Interfaces:**
- Consumes: `createPayment`, `usePaymentForAll` (Task 2); `CardOption`, `buildCardOptions`, `ccTypeFor` (Task 3); `listPayments` (existing); `StoredInstrument` (Task 1); `AffectedSubscription`, `SubscriptionCheckStatus` (existing).
- Produces:
  - `useMoveSubscriptions(customerId: number, token: string | undefined, enabled: boolean)` returning `{ options: CardOption[]; move: UseMutationResult<void, Error, CardOption> }`
  - `DeleteSubscriptionWarning` gains props `{ moveOptions: CardOption[]; isMoving: boolean; onMove: (option: CardOption) => void }`

- [ ] **Step 1: Add the copy** — in `en.json`, after `paymentMethods.deleteDialog.subscriptions.checkFailed`:

```json
  "paymentMethods.deleteDialog.move.title": "Use this card for all my subscriptions",
  "paymentMethods.deleteDialog.move.confirm": "Move subscriptions",
  "paymentMethods.deleteDialog.move.success": "Subscriptions moved to {card}.",
  "paymentMethods.deleteDialog.move.none": "No subscriptions use this card.",
  "paymentMethods.deleteDialog.move.option": "{brand} ending in {last4} · exp {expiry}",
```

- [ ] **Step 2: Write the failing hook test** — `hooks/useMoveSubscriptions.test.tsx`. It follows the
`useSubscriptionActions` harness: a probe component, `renderWithProviders`, and a spy on
`QueryClient.prototype.invalidateQueries`.

```tsx
import { QueryClient } from '@tanstack/react-query';
import {
  buildOgPaymentWith,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  startMockServer,
  waitFor,
} from 'tests/test-utils';
import type { MockInstance } from 'vitest';

import { snackbar } from '@/utils/b3Tip';

import { useMoveSubscriptions } from './useMoveSubscriptions';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const { server } = startMockServer();

const apiBase = 'https://api.example.com';
const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = `${apiBase}/products/productclient/ordergroove-auth`;
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

type Hook = ReturnType<typeof useMoveSubscriptions>;
let latest: Hook | undefined;
let invalidate: MockInstance;

function Probe({ customerId, token }: { customerId: number; token: string }) {
  latest = useMoveSubscriptions(customerId, token, true);

  return null;
}

const hook = () => {
  if (!latest) {
    throw new Error('the probe has not rendered');
  }

  return latest;
};

const renderHookProbe = () => {
  const customerId = faker.number.int({ min: 1, max: 1_000_000 });
  renderWithProviders(<Probe customerId={customerId} token="tok-a" />);

  return { customerId };
};

beforeEach(() => {
  window.BC_CONTEXT = {
    paymentMethods: { apiBase, appClientId: 'ssw-app-client-id' },
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint,
      appClientId: 'ssw-app-client-id',
    },
  };
  invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')),
    http.post(authEndpoint, () =>
      HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 }),
    ),
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () =>
      HttpResponse.json({
        customerId: 80591,
        instruments: [
          { token: 'tok-a', last4: '4242', brand: 'VISA', expiryMonth: 3, expiryYear: 2028, type: 'card', isDefault: true, source: 'bigcommerce' },
          { token: 'tok-b', last4: '1881', brand: 'AMEX', expiryMonth: 11, expiryYear: 2029, type: 'card', isDefault: false, source: 'bigcommerce' },
        ],
      }),
    ),
    http.get(`${ogBase}/payments/`, () =>
      HttpResponse.json({
        count: 1,
        next: null,
        previous: null,
        results: [buildOgPaymentWith({ public_id: 'pay-b', token_id: 'tok-b', live: true })],
      }),
    ),
  );
});

afterEach(() => {
  delete window.BC_CONTEXT;
  latest = undefined;
  invalidate.mockRestore();
  vi.clearAllMocks();
});

it('offers every saved card except the one being deleted', async () => {
  renderHookProbe();

  await waitFor(() => expect(hook().options).toHaveLength(1));
  expect(hook().options[0]).toMatchObject({ token: 'tok-b', paymentId: 'pay-b' });
});

it('moves every subscription onto the chosen card and refreshes the check', async () => {
  const used = vi.fn();
  server.use(
    http.post(`${ogBase}/payments/pay-b/use_for_all/`, () => {
      used();

      return new HttpResponse(null, { status: 200 });
    }),
  );
  const { customerId } = renderHookProbe();
  await waitFor(() => expect(hook().options).toHaveLength(1));

  hook().move.mutate(hook().options[0]);

  await waitFor(() => expect(hook().move.isSuccess).toBe(true));
  expect(used).toHaveBeenCalled();
  expect(
    invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown[] }).queryKey),
  ).toContainEqual(['subscriptionsUsingToken', customerId, 'tok-a']);
  expect(snackbar.success).toHaveBeenCalledWith('Subscriptions moved to AMEX ending in 1881 · exp 11/2029.');
});

it('creates a record first when Ordergroove does not hold the chosen card', async () => {
  const created = vi.fn();
  server.use(
    http.get(`${ogBase}/payments/`, () =>
      HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
    ),
    http.post(`${ogBase}/payments/create/`, async ({ request }) => {
      created(await request.json());

      return HttpResponse.json(buildOgPaymentWith({ public_id: 'pay-made' }));
    }),
    http.post(`${ogBase}/payments/pay-made/use_for_all/`, () => new HttpResponse(null, { status: 200 })),
  );
  renderHookProbe();
  await waitFor(() => expect(hook().options).toHaveLength(1));

  hook().move.mutate(hook().options[0]);

  await waitFor(() => expect(hook().move.isSuccess).toBe(true));
  expect(created).toHaveBeenCalledWith(
    expect.objectContaining({ token_id: 'tok-b', cc_number_ending: '1881', cc_type: 3 }),
  );
});

it('reports a failed move', async () => {
  server.use(
    http.post(`${ogBase}/payments/pay-b/use_for_all/`, () => new HttpResponse(null, { status: 500 })),
  );
  renderHookProbe();
  await waitFor(() => expect(hook().options).toHaveLength(1));

  hook().move.mutate(hook().options[0]);

  await waitFor(() => expect(hook().move.isError).toBe(true));
  expect(snackbar.error).toHaveBeenCalledWith("We couldn't apply that change. Please try again.");
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `yarn vitest run src/pages/PaymentMethods/hooks/useMoveSubscriptions.test.tsx`
Expected: fails to resolve `./useMoveSubscriptions`.

- [ ] **Step 4: Implement the hook** — `hooks/useMoveSubscriptions.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import {
  createPayment,
  listPayments,
  OrdergrooveError,
  usePaymentForAll,
} from '@/shared/service/ordergroove';
import { listStoredInstruments } from '@/shared/service/ssw/customerClient';
import { snackbar } from '@/utils/b3Tip';

import { buildCardOptions, CardOption, ccTypeFor } from '@/pages/ManageSubscriptions/viewModel';

/**
 * The cards a customer can move their subscriptions to before deleting one, and the move itself.
 * `use_for_all` moves every subscription AND every order the customer has, which is why the copy
 * says "all my subscriptions" rather than "these" (spec §1 decision 4).
 */
export const useMoveSubscriptions = (
  customerId: number,
  token: string | undefined,
  enabled: boolean,
) => {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();

  const instruments = useQuery({
    queryKey: ['storedInstruments', customerId],
    queryFn: listStoredInstruments,
    enabled,
    retry: false,
  });
  const payments = useQuery({
    queryKey: ['ordergroove', customerId, 'payments'],
    queryFn: () => listPayments(String(customerId)),
    enabled,
    retry: false,
  });

  // Never offer the card being deleted. `currentPaymentId` is irrelevant here, so pass a value no
  // record can have: nothing in this list should render as "current".
  const options = buildCardOptions(
    (instruments.data?.instruments ?? []).filter((instrument) => instrument.token !== token),
    payments.data,
    '',
  );

  const move = useMutation({
    mutationFn: async (option: CardOption) => {
      const paymentId =
        option.paymentId ??
        (
          await createPayment(String(customerId), {
            tokenId: option.token,
            last4: option.last4,
            expiry: option.expiry,
            ccType: ccTypeFor(option.brand),
          })
        ).public_id;

      await usePaymentForAll(String(customerId), paymentId);
    },
    onSuccess: async (_result, option) => {
      snackbar.success(
        b3Lang('paymentMethods.deleteDialog.move.success', {
          card: b3Lang('paymentMethods.deleteDialog.move.option', {
            brand: option.brand,
            last4: option.last4,
            expiry: option.expiry,
          }),
        }),
      );
      // Re-read rather than assume: the endpoint's atomicity is undocumented (spec §8).
      await queryClient.invalidateQueries({
        queryKey: ['subscriptionsUsingToken', customerId, token],
      });
    },
    onError: (error: unknown) => {
      const expired = error instanceof OrdergrooveError && error.kind === 'sessionExpired';
      snackbar.error(
        b3Lang(expired ? 'subscriptions.sessionExpired' : 'subscriptions.actions.error'),
      );
    },
  });

  return { options, move };
};
```

Importing `buildCardOptions` from another page is a cross-page import. If dependency-cruiser
rejects it at Task 6, move `CardOption`, `buildCardOptions`, `ccTypeFor` and `formatExpiry` into
`src/shared/service/ssw/cardOptions.ts` (they depend only on `OgPayment` and `StoredInstrument`,
both already shared) and re-point both consumers. Record the move at Task 6.

- [ ] **Step 5: Run the hook test to verify it passes**

Run: `yarn vitest run src/pages/PaymentMethods/hooks/useMoveSubscriptions.test.tsx`
Expected: four cases pass.

- [ ] **Step 6: Write the failing dialog test** — append to `index.subscriptions.test.tsx`:

```tsx
it('offers to move the subscriptions, then shows the card is clear without deleting it', async () => {
  const deleted = vi.fn();
  const visa = buildStoredInstrumentWith({ token: 'tok-a', brand: 'VISA', last4: '4242', isDefault: true });
  const amex = buildStoredInstrumentWith({ token: 'tok-b', brand: 'AMEX', last4: '1881', isDefault: false });
  const payment = buildOgPaymentWith({ token_id: 'tok-a', live: true });
  let moved = false;
  mockInstruments([visa, amex]);
  server.use(
    http.get(`${ogBase}/payments/`, () =>
      HttpResponse.json(page([payment, buildOgPaymentWith({ public_id: 'pay-b', token_id: 'tok-b', live: true })])),
    ),
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json(page(moved ? [] : [buildOgSubscriptionWith({ payment: payment.public_id })])),
    ),
    http.post(`${ogBase}/payments/pay-b/use_for_all/`, () => {
      moved = true;

      return new HttpResponse(null, { status: 200 });
    }),
    http.post(`${apiBase}/customers/Customer/DeleteStoredInstrument`, () => {
      deleted();

      return HttpResponse.json({ customerId: 80591, instruments: [] });
    }),
  );

  const { user } = renderPage();

  await user.click((await screen.findAllByRole('button', { name: 'Delete' }))[0]);
  expect(await screen.findByText(/This card is used by 1 active subscription/)).toBeInTheDocument();

  await user.click(screen.getByRole('radio', { name: 'AMEX ending in 1881 · exp 11/2029' }));
  await user.click(screen.getByRole('button', { name: 'Move subscriptions' }));

  expect(await screen.findByText('No subscriptions use this card.')).toBeInTheDocument();
  expect(screen.queryByText(/This card is used by/)).not.toBeInTheDocument();
  // Moving is not deleting: the customer still has to choose.
  expect(deleted).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
});

it('does not offer a move when there is nowhere to move to', async () => {
  const visa = buildStoredInstrumentWith({ token: 'tok-a', isDefault: true });
  const payment = buildOgPaymentWith({ token_id: 'tok-a', live: true });
  mockInstruments([visa]);
  server.use(
    http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([payment]))),
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json(page([buildOgSubscriptionWith({ payment: payment.public_id })])),
    ),
  );

  const { user } = renderPage();

  await user.click((await screen.findAllByRole('button', { name: 'Delete' }))[0]);

  expect(await screen.findByText(/This card is used by 1 active subscription/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Move subscriptions' })).not.toBeInTheDocument();
});
```

Reuse the file's existing `mockInstruments`, `page` and `renderPage` helpers; if a helper has a
different name in that file, use the one that is there rather than adding another.

- [ ] **Step 7: Run it to verify it fails**

Run: `yarn vitest run src/pages/PaymentMethods/index.subscriptions.test.tsx`
Expected: both new cases fail — there is no `Move subscriptions` button.

- [ ] **Step 8: Extend the warning component** — in `DeleteSubscriptionWarning.tsx` add the props and render the offer inside the existing `Alert`, after the consequence line and before the manage button:

```tsx
interface DeleteSubscriptionWarningProps {
  status: SubscriptionCheckStatus;
  subscriptions: AffectedSubscription[];
  onManageSubscriptions: () => void;
  /** saved cards other than the one being deleted; empty means no offer */
  moveOptions: CardOption[];
  isMoving: boolean;
  onMove: (option: CardOption) => void;
}
```

```tsx
  const [token, setToken] = useState('');
  const chosen = moveOptions.find((option) => option.token === token);

  // …inside the affected branch, after the consequence Typography:
  {moveOptions.length > 0 && (
    <Box sx={{ mt: 2 }}>
      <Typography variant="body2">{b3Lang('paymentMethods.deleteDialog.move.title')}</Typography>
      <RadioGroup value={token} onChange={(event) => setToken(event.target.value)}>
        {moveOptions.map((option) => (
          <FormControlLabel
            key={option.token}
            value={option.token}
            control={<Radio size="small" />}
            label={b3Lang('paymentMethods.deleteDialog.move.option', {
              brand: option.brand,
              last4: option.last4,
              expiry: option.expiry,
            })}
          />
        ))}
      </RadioGroup>
      <Button
        variant="text"
        size="small"
        disabled={!chosen || isMoving}
        onClick={() => {
          if (chosen) {
            onMove(chosen);
          }
        }}
        sx={{ px: 0 }}
      >
        {b3Lang('paymentMethods.deleteDialog.move.confirm')}
      </Button>
    </Box>
  )}
```

Add a `clear` branch that renders the moved confirmation instead of `null` **only when the check
ran and found nothing after a move**. The simplest form that does not change today's behaviour: a
new prop is not needed — `status === 'clear'` still returns `null` on first open because the query
has not run; after a successful move the query re-runs and returns an empty array, so render

```tsx
  if (status === 'clear') {
    return hasMoved ? (
      <Alert severity="success" sx={{ mt: 2 }}>
        {b3Lang('paymentMethods.deleteDialog.move.none')}
      </Alert>
    ) : null;
  }
```

with `hasMoved: boolean` as a seventh prop, true once the page's move mutation has succeeded.

- [ ] **Step 9: Wire the page** — in `PaymentMethods/index.tsx`:

```tsx
  const moveSubscriptions = useMoveSubscriptions(
    customerId,
    pendingDelete?.token,
    isSubscriptionCheckEnabled,
  );
```

and pass the four new props to `DeleteSubscriptionWarning`:

```tsx
            <DeleteSubscriptionWarning
              status={subscriptionCheckStatus}
              subscriptions={affectedSubscriptions.data ?? []}
              onManageSubscriptions={() => navigate('/manage-subscriptions')}
              moveOptions={moveSubscriptions.options}
              isMoving={moveSubscriptions.move.isPending}
              hasMoved={moveSubscriptions.move.isSuccess}
              onMove={(option) => moveSubscriptions.move.mutate(option)}
            />
```

Also disable the dialog's Delete and Cancel while `moveSubscriptions.move.isPending`, by extending
the existing `disabledSaveBtn` expression and the left-click guard. Reset nothing else: closing the
dialog clears `pendingDelete`, and the hook's queries are keyed on the token.

- [ ] **Step 10: Run the payment-methods suites**

Run: `yarn vitest run src/pages/PaymentMethods`
Expected: every file green, the two new cases included.

- [ ] **Step 11: Type-check and lint** — `yarn tsc --noEmit`; `yarn eslint --fix src/pages/PaymentMethods`. Both exit 0.

- [ ] **Step 12: Commit**

```bash
git add apps/storefront/src/lib/lang/locales/en.json apps/storefront/src/pages/PaymentMethods
git commit -m "feat: B2B-0000 Offer to move subscriptions to another card before deleting one" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Quality gate and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-ordergroove-phase4-payment-change-design.md`
- Modify: `.memory/b2b-buyer-portal--ordergroove-custom-msp-architecture.md`
- Modify: this plan (tick the boxes; record the Task 0 findings if not done)

- [ ] **Step 1: Type-check and lint everything**

```bash
yarn tsc --noEmit
yarn lint:dependencies
yarn lint:eslint
yarn lint:knip
```

Expected: `tsc` exit 0; dependency-cruiser "no dependency violations" — if it rejects the
`PaymentMethods → ManageSubscriptions/viewModel` import, carry out the fallback named in Task 5
Step 4 and re-run; `lint:eslint` exit 0; knip reports only the pre-existing `BillingStateOption` in
`src/pages/PaymentMethods/billingPrefill.ts`.

- [ ] **Step 2: Run the scoped suites, then the full suite against the baseline**

```bash
yarn vitest run src/pages/ManageSubscriptions src/pages/PaymentMethods src/shared/service
```

Expected: every file green. Then, with nothing else running on the machine:

```bash
yarn vitest run 2>&1 | grep -E "^ ❯ src/.*\.test\.tsx? \(" | sed -E 's/^ ❯ //; s/ \(.*//' | sort -u > /tmp/after-failing.txt
comm -13 /tmp/baseline-failing.txt /tmp/after-failing.txt
```

Expected: every name the `comm` prints passes when run on its own. Run each one alone; a file that
also fails alone is a real regression to fix before continuing. The timing-out set shuffles run to
run, so names appearing and disappearing is normal.

- [ ] **Step 3: Align the spec with what shipped** — edit the Phase 4 spec:

1. §3.2 and §9.1: record Task 0 finding A, and if orders follow their subscription, strike
   `changeOrderPayment` from the table and say the probe removed it.
2. §3.1: if Task 0 finding C shows `use_for_all` returns a body after all, record that
   `ogMutateNoContent` was not needed and `usePaymentForAll` uses `ogMutate`.
3. §5: if `CardOption` and friends moved to `src/shared/service/ssw/cardOptions.ts`, say so and why.
4. §6.1: if the only-one-card sentence had to be split into two nodes because `b3Lang` takes no
   React values, record the split.
5. §11.2: replace the spike's remembered inventory with Task 0 finding B's live numbers.

- [ ] **Step 4: Record the outcome in the memory note** — append to the Ordergroove note in
`.memory/`, after the Phase 3a sections:

```
## Phase 4 implemented (YYYY-MM-DD)

- A customer can move a subscription onto another saved card from its card, and move every
  subscription off a card from the delete dialog before deleting it. Service:
  `createPayment` / `changeSubscriptionPayment` / `changeOrderPayment` / `usePaymentForAll` in
  `shared/service/ordergroove/api.ts`; `use_for_all` answers 200 with an EMPTY BODY, so
  `ogMutateNoContent` exists (parsing it as JSON would surface a success as a SyntaxError, miss the
  OrdergrooveError branch and show the customer a failure).
- Reuse before create: only a LIVE record whose token_id matches is reusable, because Ordergroove
  mints a record per checkout and keeps records for cards BigCommerce no longer has. Creating is
  ONE-WAY — there is no delete, only deactivate — so the live probe never creates one.
- The SSW customer middleware client now lives at `shared/service/ssw/customerClient.ts`; the
  payment-methods page keeps only its own actions.
- Task 0 findings: <paste A–C here>.
- Live check (Task 7): <paste the summary here>.
```

Replace `YYYY-MM-DD` and both placeholders with the real values. Mirror the note to the Obsidian
vault copy (same filename under `/mnt/c/Users/thaverman/Documents/Obsidian/Programing/Platform/Memory/`,
keeping its trailing `Related board:` line) and append the same section to the Mongo entry
`memory.entries` `_id 6a982e6f24e380927044ba89` (`body` field) as the earlier phases did. The Mongo
command uses a runtime credential variable, so run it from the main checkout, not a worktree.

- [ ] **Step 5: Commit the docs**

```bash
git add docs/superpowers/specs/2026-09-17-ordergroove-phase4-payment-change-design.md docs/superpowers/plans/2026-09-18-ordergroove-phase4-payment-change.md .memory/b2b-buyer-portal--ordergroove-custom-msp-architecture.md
git commit -m "docs: B2B-0000 Record the Ordergroove Phase 4 implementation" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Live check on sandbox (reversible; the Delete confirm is never clicked)

**Files:** none in the repo. Script in your scratch directory under `pw/`.

**Interfaces:**
- Consumes: a deploy-flavour build of this branch; the Phase 3a recipe (request-level login, route interception of `/content/b2bBuyerPortal/dist/`, `portalEval` into the ThemeFrame).

- [ ] **Step 1: Build the deploy flavour**

Run: `VITE_ASSETS_ABSOLUTE_PATH='https://sandbox.storesupply.com/content/b2bBuyerPortal/dist/' yarn build`
Expected: `apps/storefront/dist/` with hashed root entries.

- [ ] **Step 2: Write the script** to `<scratch>/pw/phase4-live.mjs`, copying `phase3a-live.mjs`
wholesale and replacing everything after the "settled cards" wait with:

```js
// Subject: the LAST card (farthest out, least disruptive). Repoint it to another saved card and
// back. Records every non-GET request. Never opens the delete dialog's confirm.
const lastIndex = (await portalEval((doc) => doc.querySelectorAll('.MuiCard-root').length)) - 1;
const cardPaidWith = (i) => portalEval((doc, n) => {
  const m = doc.querySelectorAll('.MuiCard-root')[n].textContent.replace(/\s+/g, ' ').match(/Paid with ([^]*?)(?:Skip|Send now|Change date|Change card|Next order|$)/);
  return m ? m[1].trim() : null;
}, i);
summary.before = await cardPaidWith(lastIndex);

const clickInCard = (i, label) => portalEval((doc, { n, label }) => {
  const btn = Array.from(doc.querySelectorAll('.MuiCard-root')[n].querySelectorAll('button')).find((b) => b.textContent.trim() === label);
  if (!btn) return false;
  btn.click();
  return true;
}, { n: i, label });
const dialogRadios = () => portalEval((doc) => Array.from(doc.querySelectorAll('[role="dialog"] label')).map((l) => l.textContent.trim()));
const pickRadio = (text) => portalEval((doc, t) => {
  const label = Array.from(doc.querySelectorAll('[role="dialog"] label')).find((l) => l.textContent.includes(t));
  if (!label) return false;
  label.click();
  return true;
}, text);
const clickInDialog = (label) => portalEval((doc, l) => {
  const dlg = doc.querySelector('[role="dialog"]');
  const btn = dlg && Array.from(dlg.querySelectorAll('button')).find((b) => b.textContent.trim() === l);
  if (!btn) return false;
  btn.click();
  return true;
}, label);

if (!(await clickInCard(lastIndex, 'Change card'))) await fail('no Change card button');
await waitFor((doc) => !!doc.querySelector('[role="dialog"] input[type="radio"]'), 15000, 'the card picker');
summary.options = await dialogRadios();
const other = summary.options.find((o) => !o.includes('(current)'));
if (!other) await fail(`only one saved card offered: ${JSON.stringify(summary.options)}`);
await pickRadio(other);
await clickInDialog('Save');
await waitFor((doc, { n, was }) => !doc.querySelector('[role="dialog"]') && !doc.querySelectorAll('.MuiCard-root')[n].textContent.includes(was), 30000, 'the card line to change', { n: lastIndex, was: summary.before });
await collectAlerts();
summary.after = await cardPaidWith(lastIndex);
await page.screenshot({ path: path.join(OUT, 'phase4-2-changed.png'), fullPage: true });

// Restore.
if (!(await clickInCard(lastIndex, 'Change card'))) await fail('no Change card button for the restore');
await waitFor((doc) => !!doc.querySelector('[role="dialog"] input[type="radio"]'), 15000, 'the picker again');
if (!(await pickRadio(summary.before))) await fail('the original card is no longer offered — restore by hand');
await clickInDialog('Save');
await waitFor((doc, { n, want }) => !doc.querySelector('[role="dialog"]') && doc.querySelectorAll('.MuiCard-root')[n].textContent.includes(want), 30000, 'the original card again', { n: lastIndex, want: summary.before });
await collectAlerts();
summary.restored = await cardPaidWith(lastIndex);

// The delete dialog: read the move offer, then CANCEL. Never click Delete.
await page.goto(`${ORIGIN}/account.php#/payment-methods`, { waitUntil: 'domcontentloaded' });
await waitFor((doc) => !!doc && /••••/.test(doc.body.innerText), 60000, 'the saved cards');
await portalEval((doc) => {
  const card = Array.from(doc.querySelectorAll('.MuiCard-root')).find((c) => c.textContent.includes('Default'));
  const btn = card && Array.from(card.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Delete');
  if (btn) btn.click();
});
await waitFor((doc) => /active subscription|couldn't check/.test(doc.querySelector('[role="dialog"]')?.innerText ?? ''), 30000, 'the warning');
summary.deleteDialog = await portalEval((doc) => doc.querySelector('[role="dialog"]').innerText.replace(/\s+/g, ' ').slice(0, 420));
await page.screenshot({ path: path.join(OUT, 'phase4-3-delete-dialog.png'), fullPage: true });
await clickInDialog('Cancel');

await browser.close();
summary.ok =
  summary.restored === summary.before &&
  summary.failedRequests.length === 0 &&
  !summary.writes.some((w) => /use_for_all|DeleteStoredInstrument/.test(w));
console.log(JSON.stringify(summary, null, 2));
```

- [ ] **Step 3: Run it**

Run: `DIST=<abs path to apps/storefront/dist> ENV_FILE=<abs path to apps/storefront/.env> node <scratch>/pw/phase4-live.mjs`

Expected, for customer 80591:
- `options` lists all three saved cards, exactly one suffixed `(current)`;
- `after` names the other card and `restored` equals `before`;
- `alerts` contains "Card updated." twice;
- `writes` holds the repoints only — `PATCH /subscriptions/<id32>/change_payment/` (and
  `PATCH /orders/<id32>/change_payment/` if Task 0 finding A said orders do not follow), plus at
  most one `POST /payments/create/` the first time a card has no record;
- **no** `use_for_all` and **no** `DeleteStoredInstrument`;
- `deleteDialog` shows the warning and the "Use this card for all my subscriptions" offer;
- `ok: true`.

If a `POST /payments/create/` fired, note in the record that one spare record now exists on the
fixture account and that it cannot be deleted.

If the run aborts between the two repoints, restore by hand with the Task 0 probe's
`change_payment` step using the ids in `writes`.

- [ ] **Step 4: Record**

Paste the summary (card brands and last four digits only — never tokens, never the merchant id)
into the memory-note section from Task 6 Step 4, mirror to the vault and Mongo as there, and commit
as `docs: B2B-0000 Record the Phase 4 live check` if the Task 6 docs commit is already made.

---

## Self-review against the spec

- §1 decisions 1–7: Task 4 (card action) and Task 5 (delete-dialog offer) for decision 1; Task 3 and
  Task 5's picker for decision 2 (saved cards only, no add-card path anywhere); Task 3's
  `buildCardOptions` plus Task 4/5 `mutationFn` for decision 3 (live record or create); Task 5's
  copy and hook comment for decision 4 (`use_for_all` moves everything, and says so); Task 5 Step 6
  asserts the delete mutation never fired for decision 5; Task 0's `ALLOWED` regex enforces decision
  6; Task 2 leaves `request()` untouched for decision 7. ✓
- §2.1 where things render: Task 4 Step 12 (Change card needs no upcoming order; the three order
  actions still do) and Task 5 Step 9 (offer only when affected **and** another card exists —
  `moveOptions` is empty otherwise, tested in Task 5 Step 6's second case). ✓
- §2.2 files and §2.3 one delivery: the file table above matches, and every file appears in a task. ✓
- §3.1 no-content helper: Task 2 Steps 1, 3 and 4, with the empty-body case and the failure mapping
  both tested. §3.2 four endpoints: Task 2. §3.3 `NewPaymentInput` and the optional fields: Task 2
  Steps 1 and 4. §3.4 transport untouched: Task 2 Step 3 changes only the mapping. ✓
- §4 shared client: Task 1, including the one-canonical-path rule and keeping the error's name. ✓
- §5 view model: Task 3 — the three reuse shapes, current marking, `ccTypeFor` including an unmapped
  brand, `formatExpiry`. ✓
- §6.1 change-card dialog: Task 4 Steps 6 and 8 (preselect, disabled Save, one-card message with a
  `target="_top"` link, pending). §6.2 move flow: Task 5 Steps 6 and 8 (offer, moving, moved,
  failed). ✓
- §7 copy: Task 4 Step 1 and Task 5 Step 1 add every key; `move.option` is added beyond the spec's
  list because the success sentence and the radio labels need one card wording — recorded at Task 6.
- §8 error handling: the generic snackbar in both hooks; the spare-record case is what Task 4's
  "reuses an existing record" test pins (a retry finds it and does not create a second); the
  partial-move case is why Task 5 re-reads instead of assuming. ✓
- §9.1 probe: Task 0, which never creates a record. §9.2 tests: service (Task 2), view model (Task
  3), hook (Tasks 4 and 5), dialogs and page (Tasks 4 and 5). §9.3 live check: Task 7, asserting no
  `use_for_all` and no delete. ✓
- Placeholder scan: the only blanks are Task 0's finding lines and Task 6's two paste markers, both
  filled during execution as in Phases 2 and 3a. ✓
- Type consistency: `CardOption` (Task 3) is what `ChangeCardVariables` (Task 4), `ChangeCardDialog`
  (Task 4) and `useMoveSubscriptions` (Task 5) all carry; `NewPaymentInput` (Task 2) is what both
  `mutationFn`s build; `listStoredInstruments` returns `StoredInstrumentsResponse` so both consumers
  read `.instruments` (Task 4 Step 12, Task 5 Step 4). ✓
