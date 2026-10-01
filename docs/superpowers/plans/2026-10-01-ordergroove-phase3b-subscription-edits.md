# Ordergroove Phase 3b — Subscription Edits (Frequency, Quantity, Cancel, Reactivate, Address): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish self-service parity on `/manage-subscriptions`: a customer changes a subscription's quantity and frequency inline, moves it to another saved address, cancels it with an optional reason, and reactivates a cancelled one — the five actions the hosted manager still owns today.

**Architecture:** The service module gains five write functions on the existing `ogMutate` path (same mint, same one-shot 403 re-mint, 10 s deadline). The per-card hook gains five mutations with the same success/error contract as 3a. The view model gains the pure pieces the controls need — SSW's frequency list, quantity options, the manager's cancel-reason codes and body format, and an address dedupe — and the card learns its true schedule (`every`/`every_period`, so "every 300 days" becomes "every 10 months"). Because the new controls sit in three places on one card (the schedule line, the address line, the actions row) and share one pending state and one open dialog, a new per-card owner, `ActiveSubscriptionCard`, holds the hook and the dialog state and fills the card's slots; the 3a `SubscriptionActions` row becomes a presentational button row. Cancelled cards get a `Reactivate` button with its own small owner.

**Tech Stack:** React 18, TypeScript, `@tanstack/react-query` v5 (`useMutation`, `useQueryClient`), MUI (`TextField select`, `MenuItem`, `RadioGroup`, `TextField type="date"`, `CircularProgress`), dayjs, Vitest + jsdom + MSW v2 + Testing Library, `tests/builder.ts` builders, ICU messages via `useB3Lang`.

**Spec:** `docs/superpowers/specs/2026-09-17-ordergroove-phase3-subscription-actions-design.md` — this plan implements the **3b** row of §2.2 (§3.2 rows 4–8, §4.3–§4.6, §5, §6.1–§6.4 3b items, §7 3b copy, §10.1 steps 4–6, §10.3 3b live checks). Program spec: `docs/superpowers/specs/2026-09-15-ordergroove-subscriptions-custom-manager-design.md` §8. The 3a plan (`docs/superpowers/plans/2026-09-17-ordergroove-phase3a-order-actions.md`) built the foundation this plan extends; its Task 0 findings A–D hold.

## Global Constraints

- All commands run from `apps/storefront/` (`cd apps/storefront` first). Node `>=22.16.0`, Yarn `1.22.22`.
- No new Redux slices, Context providers, `localStorage`/`sessionStorage`. Redux is read once at the top of the page (`company.customer.id`) and passed down as a prop.
- Mutations: `useMutation`, never a client-side retry, never an optimistic update. Every 3b success invalidates `['ordergroove', customerId, 'subscriptions']` and `['ordergroove', customerId, 'upcoming']` and nothing else (spec §5.2). The inline selects always render the card's current value, so a failed save snaps back by itself (spec §6.3).
- Write deadline **10 000 ms**; status mapping unchanged (401/403 after the re-mint → `sessionExpired`, 429 → `rateLimited`, everything else non-2xx → `upstream`). Nothing here changes `api.ts`'s `request()`/`parse()`.
- Endpoints exactly as spec §3.2, all `PATCH /subscriptions/{id}/<action>/` with the trailing slash (3a finding A): `change_frequency/ { every, every_period }`, `change_quantity/ { quantity }`, `cancel/ { cancel_reason }`, `reactivate/ { start_date, every, every_period, next_order_date }`, `change_shipping/ { shipping_address }`. Service names: `changeSubscriptionFrequency`, `changeSubscriptionQuantity`, `cancelSubscription`, `reactivateSubscription`, `changeShippingAddress` — the first two follow Phase 4's `changeSubscriptionPayment` so the hook's `changeFrequency`/`changeQuantity` keys do not collide with their imports (Task 8 records this against spec §3.2).
- Period codes: `1` = days, `2` = weeks, `3` = months. Schedule text everywhere comes from `every`/`every_period` through `describeFrequency`, never from `frequency_days`.
- **Frequency list is a constant** (spec §4.3, decision 9) in the manager's order; the card's current schedule is appended as the last option when it is not in the list. **Quantity** options are `1…20` plus the current value when greater (spec §4.4).
- **Cancel body** (spec §4.5): a listed reason sends `"{code} | {canonical English label}"` (spaces around the pipe); Other with details sends `"1 | {details trimmed}"`; Other with no details sends `"1"`; no selection sends `114|Cancelled without exit survey response` **verbatim, no spaces**. The body always carries the English labels of §4.5 whatever the radios show.
- **Address options** (spec §4.6, amended by Task 0 finding J): live records plus the current one even when retired; deduplicated on the lower-cased, whitespace-collapsed **street line (`address`) alone** — the hosted manager collapses this customer's 24 live records to its 10 "Ship to" choices on exactly that key, where the spec's nine-field identity leaves 22; the current record wins its duplicate group, otherwise the first live record; current first, then by name. Task 8 records the amendment against §4.6.
- Imports: `@/` alias, `lodash-es` only, named MUI imports. Import groups separated by blank lines: externals, then `@/…`, then relative. ESLint airbnb is on: no `for…of`, no `await` in loops, **no nested ternaries**, no `console`, braces on every `if`. Do not add violations of the disabled-rule list in CLAUDE.md (no `any`, no `!` assertions, no JSX prop spreading, no new `eslint-disable`).
- knip fails on unused exports: **export only what another `src` file consumes.** A module landed one task before its consumer shows as an orphan to `lint:dependencies` until then; `yarn lint` runs in full at Task 8.
- Commit subject format: `type: B2B-0000 Short description`; end every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Stage by explicit path — this tree carries other sessions' uncommitted work (`HeadlessController/`, `Login/`, `b3Fetch.ts`, `b3Login.ts` were dirty on 2026-10-01; never touch or stage them).
- Copy is fixed by spec §7 with four amendments made here (Task 8 writes them back): `everyMonths` lives at `subscriptions.card.everyMonths` beside `everyWeeks`/`everyDays` because the card line uses it too; `subscriptions.actions.reactivate.dateHint` is added for the date validation message; `subscriptions.actions.changeAddress` is the `Change` button label on the address line; the Reactivate dialog's "else the first option" branch is unreachable because §4.3 always appends the current schedule, so the current one is always preselected.
- **Date inputs are native** `TextField type="date"` with `min`, as 3a decided for Change date (no test in this repo drives the MUI x-date-pickers input; the native input enforces `min` for free and `fireEvent.change` tests it reliably). The Reactivate dialog follows; spec §6.2 says `B3Picker` and Task 8 corrects it.
- **Live writes are reversible only** (spec decision 3). Task 0 and Task 9 change frequency, quantity and address on one subscription and restore each; they reactivate **one already-cancelled** subscription and cancel it again in the same run. **No script or test run in this plan may call `send_now`, `orders/{id}/cancel/`, `items/{id}/delete/`, `addresses/create/`, `payments/create/` or `use_for_all` against Ordergroove**, and `cancel/` may only ever target the subscription the same run reactivated. The probe refuses every other path by construction; Task 9 asserts zero such requests.
- Every planned test must be seen **failing** before its implementation step (the "verify it fails" steps are the negative control — do not skip them).
- Test gotchas carried from 3a and Phase 4: the test store's date display format is blank, so pass `storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } })` in `preloadedState` and assert literal dates such as `3 Oct 2026`; never draw a random id inside a render callback; fixtures that share a builder default collide in `getBy*` queries — give each its own value; `B3Dialog` only opens on a **re-render** after its container ref is set, so a dialog test renders closed first and re-renders open (`renderOpen`), and owners keep their dialogs mounted and toggle `isOpen`; MUI `Select` names its combobox from the label **and** the shown value, so query it with `getByRole('combobox', { name: /^Quantity/ })`, open it with a click and pick `getByRole('option', { name: '3' })`.

## Review Focus

The five inputs the spec implies but no 3a test exercises, most likely to bite first; each has a test pinned to the task that owns the code:

1. **A schedule SSW does not offer** (this customer has `every: 10, every_period: 3` and `every: 12, every_period: 3`): the card must read "every 10 months", the Frequency select must list it as the last option *and* show it selected, and Reactivate must preselect it — not render a blank select. Tests: Task 2 (`frequencyOptions`, card text), Task 5 (select), Task 4 (Reactivate).
2. **A quantity above 20** (`32` on one SSW subscription): the Quantity select must show 32 selected, offer 1–20 and 32, and send `{ quantity: 20 }` when 20 is picked. Tests: Task 2 (`quantityOptions(32)`), Task 5 (select).
3. **"Other" with whitespace-only details** sends the manager's bare `"1"`, not `"1 | "`. Tests: Task 2 (`cancelReasonBody`), Task 4 (dialog).
4. **A subscription whose current address record is retired** (`live: false`) or duplicated under several ids: the dialog must still offer and preselect the id Ordergroove holds, so Save stays disabled until a real change. Tests: Task 2 (`buildAddressOptions`), Task 4 (dialog preselect).
5. **The addresses lookup failed or is still loading**: the address line shows no `Change` control rather than a dialog with nothing to pick. Test: Task 6.

## Before you start

1. Work in a worktree: `EnterWorktree` lands on `origin/dev`, not local `dev` — run `git reset --hard dev` in it first, then symlink `node_modules` from the main checkout (repo root and `apps/storefront/`). The worktree guard refuses heredocs, `$VAR` expansions and compound `cd`/redirect chains; use the Edit/Write tools for file edits and literal paths in commands.
2. `git status`. Other sessions leave uncommitted work in this tree. Never `git add` a path you did not change; never `git add -A`.
3. Baseline: `yarn vitest run 2>&1 | grep -E "^ (×|❯) src/" | sort -u > /tmp/baseline-failing.txt` once. The dev branch has a known red baseline of ~20 files that time out under the suite's own load; only *new* failing files are yours, and every one must pass when run alone. `yarn lint:knip` already reports `BillingStateOption` in `src/pages/PaymentMethods/billingPrefill.ts` on `dev` — pre-existing, leave it.
4. Sandbox fixture for Tasks 0 and 9: customer **80591** (credentials in `apps/storefront/.env` as `VITE_TEST_ACCOUNT_EMAIL` / `VITE_TEST_ACCOUNT_PASSWORD` — never print them). On 2026-09-30: 14 active subscriptions, 4 cancelled, 12 upcoming orders, 3 saved cards. The Ordergroove merchant id is **read off the sandbox login page** (`window.BC_CONTEXT.subscriptions.merchantId`) by the scripts; never commit or print it.
5. Sandbox talks to Ordergroove **production**, and production's own storefront is already on the custom page. Every write in Tasks 0 and 9 is restored in the same run; if a run aborts half-way, restore by hand with the probe's own helpers before doing anything else (each script prints the exact restore call on failure).
6. The session scratch directory was wiped between 3a and this plan. Rebuild the tooling: `mkdir -p <scratch>/pw && cd <scratch>/pw && npm init -y && npm i playwright@1.63` (system Chrome at `/usr/bin/google-chrome`; no browser download needed). Task 9 re-creates the Playwright recipe from the 3a plan's Task 7.
7. Ordergroove rate-limits this fixture after a few full page loads in a row (observed 2026-09-18: later requests never answered, the page shows "We couldn't load your subscriptions"). Space live runs minutes apart and re-run the deployed bundle as the control before blaming a build.
8. `dev` is 19 commits ahead of `origin/dev` and unpushed; that is the owner's call, not this plan's.

## File structure

| File | Responsibility |
|---|---|
| `src/shared/service/ordergroove/api.ts` | five subscription writes on `ogMutate`; `ReactivationInput` |
| `src/shared/service/ordergroove/index.ts` | barrel: the five functions and `ReactivationInput` |
| `src/pages/ManageSubscriptions/viewModel.ts` | `frequencyOptions`, `quantityOptions`, `CANCEL_REASONS`, `OTHER_REASON_CODE`, `cancelReasonBody`, `buildAddressOptions`; exports `AddressSummary`, `FrequencyOption`, `AddressOption`, `CancelReasonSelection`; drops `frequencyDays` from the card |
| `src/pages/ManageSubscriptions/format.ts` | `describeFrequency`, `describeAddress`, `HOSTED_MANAGER_URL` — shared by card, selects and dialogs |
| `src/pages/ManageSubscriptions/hooks/useSubscriptionActions.ts` | five more mutations with the 3a contract |
| `src/pages/ManageSubscriptions/components/actions/CancelDialog.tsx` | skip nudge, optional reason, error-coloured confirm |
| `src/pages/ManageSubscriptions/components/actions/ReactivateDialog.tsx` | frequency select + first-order date |
| `src/pages/ManageSubscriptions/components/actions/ChangeAddressDialog.tsx` | address radios, add-new footer link |
| `src/pages/ManageSubscriptions/components/actions/QuantityFrequencySelects.tsx` | two inline selects that save on change |
| `src/pages/ManageSubscriptions/components/actions/ActiveSubscriptionCard.tsx` | per-card owner: hook, open dialog, card-option queries, slots, all dialogs |
| `src/pages/ManageSubscriptions/components/actions/SubscriptionActions.tsx` | presentational button row (was the owner in 3a) |
| `src/pages/ManageSubscriptions/components/actions/ReactivateAction.tsx` | Reactivate button + dialog for a cancelled card |
| `src/pages/ManageSubscriptions/components/SubscriptionCard.tsx` | `scheduleControls` and `shippingAction` slots; schedule text from `describeFrequency` |
| `src/pages/ManageSubscriptions/components/CancelledSubscriptions.tsx` | takes `customerId`, renders `ReactivateAction` per card |
| `src/pages/ManageSubscriptions/SubscriptionsManager.tsx` | renders `ActiveSubscriptionCard` per active card; passes `addresses.data` down |
| `src/lib/lang/locales/en.json` | `subscriptions.actions.*` 3b keys, `subscriptions.card.everyMonths` |

---

### Task 0: Reversible live probe of the five write endpoints (throwaway)

**Files:** none in the repo. Script lives in your scratch directory and is not committed.

**Interfaces:**
- Produces: findings E–J (below) that Tasks 1, 2, 4 and 8 read.

- [x] **Step 1: Write the probe script** to `<scratch>/og-edit-probe.mjs`

```js
// Reversible write probe of Ordergroove for customer 80591 (Phase 3b Task 0).
// Writes ONLY change_frequency / change_quantity / change_shipping on ONE active subscription and
// restores each, then reactivate + cancel on ONE already-cancelled subscription. Refuses every other
// write path by construction; `cancel/` is refused for any id but the one this run reactivated.
// Mints the way the portal does (Jwt + customerId) so it works before and after the API hardening,
// and reads the merchant id off the sandbox page. Run: ENV_FILE=<abs path to apps/storefront/.env> node og-edit-probe.mjs
import { readFileSync } from 'node:fs';

const ORIGIN = 'https://sandbox.storesupply.com';
const OG = 'https://restapi.ordergroove.com';
const CUSTOMER = '80591';
const STORE_HASH = '24erkpw9h6';
const WRITABLE = /^\/subscriptions\/([0-9a-f]{32})\/(change_frequency|change_quantity|change_shipping|change_next_order_date|reactivate|cancel)\/$/;

const env = Object.fromEntries(
  readFileSync(process.env.ENV_FILE, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
  }),
);
const redact = (value) =>
  JSON.stringify(value).replace(/[0-9a-f]{64}/g, '<tok64>').replace(/[0-9a-f]{32}/g, '<id32>');

// --- a storefront session, then the Ordergroove header exactly as the portal mints it -----------
const jar = new Map();
const cookieHeader = () => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
const remember = (response) => {
  (response.headers.getSetCookie?.() ?? []).forEach((line) => {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  });
};
const loginPage = await fetch(`${ORIGIN}/login.php`);
remember(loginPage);
const html = await loginPage.text();
const merchantId = html.match(/merchantId:\s*'([0-9a-f]{32})'/)?.[1];
const authEndpoint = html.match(/authEndpoint:\s*'([^']+)'/)?.[1];
const appClientId = html.match(/appClientId:\s*'([^']+)'/)?.[1];
if (!merchantId || !authEndpoint || !appClientId) throw new Error('BC_CONTEXT.subscriptions not on the login page');
const login = await fetch(`${ORIGIN}/login.php?action=check_login`, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() },
  body: new URLSearchParams({ login_email: env.VITE_TEST_ACCOUNT_EMAIL, login_pass: env.VITE_TEST_ACCOUNT_PASSWORD }),
});
remember(login);
if (login.status !== 302) throw new Error(`login answered ${login.status}`);
const jwtResponse = await fetch(`${ORIGIN}/customer/current.jwt?app_client_id=${appClientId}`, { headers: { Cookie: cookieHeader() } });
if (!jwtResponse.ok) throw new Error(`current.jwt answered ${jwtResponse.status}`);
const jwt = await jwtResponse.text();
const mint = await (
  await fetch(authEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Jwt: jwt, customerId: CUSTOMER, storeHash: STORE_HASH }),
  })
).json();
const [sigField, ts, sig] = (mint.cookieValue ?? '').split('|');
if (!mint.success || !sig) throw new Error(`mint failed: ${redact(mint)}`);
const headers = {
  Authorization: JSON.stringify({ public_id: merchantId, sig_field: sigField, ts: Number(ts), sig }),
  'Content-Type': 'application/json',
};
console.log('mint ok; auth endpoint host', new URL(authEndpoint).host);

// --- helpers ------------------------------------------------------------------------------------
const listAll = async (path, acc = []) => {
  const body = await (await fetch(`${OG}${path}`, { headers })).json();
  const all = [...acc, ...body.results];
  return body.next ? listAll(body.next.replace(OG, ''), all) : all;
};
const getOne = async (path) => (await fetch(`${OG}${path}`, { headers })).json();
let reactivatedId = null; // the ONLY subscription cancel/ may target
const patch = async (path, body) => {
  const match = WRITABLE.exec(path);
  if (!match) throw new Error(`refusing to write ${path}`);
  if (match[2] === 'cancel' && match[1] !== reactivatedId) throw new Error(`refusing to cancel ${redact(match[1])}: not the subscription this run reactivated`);
  const response = await fetch(`${OG}${path}`, { method: 'PATCH', headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const snapshot = async () => {
  const orders = await listAll('/orders/?status=1');
  const items = await listAll('/items/?status=1');
  const placeByOrder = new Map(orders.map((o) => [o.public_id, o.place.slice(0, 10)]));
  const orderById = new Map(orders.map((o) => [o.public_id, o]));
  const nextFor = (subId) =>
    items.filter((i) => i.subscription === subId)
      .map((i) => ({ order: i.order, date: placeByOrder.get(i.order), itemQuantity: i.quantity, orderAddress: orderById.get(i.order)?.shipping_address }))
      .filter((x) => x.date)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  return { orders, items, nextFor };
};
const normalise = (v) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const identity = (a) => [a.first_name, a.last_name, a.company_name, a.address, a.address2, a.city, a.state_province_code, a.zip_postal_code, a.country_code].map(normalise).join('|');
const restoreHint = (path, body) => console.log(`!! RESTORE BY HAND: PATCH ${OG}${redact(path)} ${redact(body)}`);

const today = new Date().toISOString().slice(0, 10);
const subs = await listAll('/subscriptions/');
const active = subs.filter((s) => s.cancelled === null && s.live);
const cancelled = subs.filter((s) => s.cancelled !== null);
let snap = await snapshot();

// Subject S: active, scheduled at least 3 days out, farthest in the future (least disruptive).
const S = active
  .map((s) => ({ s, next: snap.nextFor(s.public_id) }))
  .filter(({ next }) => next && next.date >= addDays(today, 3))
  .sort((a, b) => b.next.date.localeCompare(a.next.date))[0]?.s;
if (!S) throw new Error('no active subscription scheduled 3+ days out — pick one by hand');
const original = { every: S.every, every_period: S.every_period, quantity: S.quantity, shipping_address: S.shipping_address, next: snap.nextFor(S.public_id) };
console.log('subject S', redact(original));
const base = `/subscriptions/${S.public_id}/`;
const readS = () => getOne(base);

// E. change_frequency, then restore (and restore the next-order date if the schedule change moved it).
const other = original.every === 6 && original.every_period === 2 ? { every: 8, every_period: 2 } : { every: 6, every_period: 2 };
const e = await patch(`${base}change_frequency/`, other);
let s1 = await readS();
snap = await snapshot();
console.log('E change_frequency ->', e.status, '| record now', s1.every, s1.every_period, 'frequency_days', s1.frequency_days, '| next order now', snap.nextFor(S.public_id)?.date, '(was', original.next.date, ') | response keys', Object.keys(e.body ?? {}).length);
const eRestore = await patch(`${base}change_frequency/`, { every: original.every, every_period: original.every_period });
s1 = await readS();
snap = await snapshot();
let next = snap.nextFor(S.public_id);
console.log('E restore ->', eRestore.status, '| record now', s1.every, s1.every_period, '| next order now', next?.date);
if (next?.date !== original.next.date) {
  const fix = await patch(`${base}change_next_order_date/`, { order_date: original.next.date });
  snap = await snapshot();
  next = snap.nextFor(S.public_id);
  console.log('E date restore ->', fix.status, '| next order now', next?.date, '(expected', original.next.date, ')');
  if (next?.date !== original.next.date) restoreHint(`${base}change_next_order_date/`, { order_date: original.next.date });
}

// F. change_quantity, then restore. Does the upcoming order line follow?
const f = await patch(`${base}change_quantity/`, { quantity: original.quantity + 1 });
s1 = await readS();
snap = await snapshot();
console.log('F change_quantity ->', f.status, '| record quantity', s1.quantity, '| item quantity on upcoming order', snap.nextFor(S.public_id)?.itemQuantity);
const fRestore = await patch(`${base}change_quantity/`, { quantity: original.quantity });
s1 = await readS();
snap = await snapshot();
console.log('F restore ->', fRestore.status, '| record quantity', s1.quantity, '| item quantity', snap.nextFor(S.public_id)?.itemQuantity);
if (s1.quantity !== original.quantity) restoreHint(`${base}change_quantity/`, { quantity: original.quantity });

// G. change_shipping to a different live address (different identity), then restore.
const addresses = await listAll('/addresses/');
const current = addresses.find((a) => a.public_id === original.shipping_address);
const target = addresses.find((a) => a.live && current && identity(a) !== identity(current));
if (!target) throw new Error('no second live address to move to');
const g = await patch(`${base}change_shipping/`, { shipping_address: target.public_id });
s1 = await readS();
snap = await snapshot();
console.log('G change_shipping ->', g.status, '| record address moved:', s1.shipping_address === target.public_id, '| upcoming order address moved:', snap.nextFor(S.public_id)?.orderAddress === target.public_id);
const gRestore = await patch(`${base}change_shipping/`, { shipping_address: original.shipping_address });
s1 = await readS();
console.log('G restore ->', gRestore.status, '| record address restored:', s1.shipping_address === original.shipping_address);
if (s1.shipping_address !== original.shipping_address) restoreHint(`${base}change_shipping/`, { shipping_address: original.shipping_address });

// J. The §4.6 dedupe offline: the hosted manager offered 10 "Ship to" choices on 2026-09-17.
const byIdentity = new Map();
addresses.filter((a) => a.live).forEach((a) => { if (!byIdentity.has(identity(a))) byIdentity.set(identity(a), a); });
console.log('J addresses', addresses.length, 'live', addresses.filter((a) => a.live).length, 'distinct live identities', byIdentity.size, '(manager showed 10) | current is live:', Boolean(current?.live));

// H + I. Reactivate ONE already-cancelled subscription with tomorrow, then cancel it again.
const C = cancelled.sort((a, b) => (a.cancelled < b.cancelled ? 1 : -1))[0];
if (!C) throw new Error('no cancelled subscription to reactivate');
console.log('subject C', redact({ every: C.every, every_period: C.every_period, quantity: C.quantity, cancelled: C.cancelled, live: C.live, cancel_reason: C.cancel_reason, cancel_reason_code: C.cancel_reason_code }));
const cBase = `/subscriptions/${C.public_id}/`;
const reactivateBody = { start_date: today, every: C.every, every_period: C.every_period, next_order_date: addDays(today, 1) };
let h = await patch(`${cBase}reactivate/`, reactivateBody);
let minDays = 1;
if (h.status !== 200) {
  console.log('H reactivate with tomorrow ->', h.status, redact(h.body).slice(0, 200));
  reactivateBody.next_order_date = addDays(today, 2);
  h = await patch(`${cBase}reactivate/`, reactivateBody);
  minDays = 2;
}
reactivatedId = h.status === 200 ? C.public_id : null;
let c1 = await getOne(cBase);
snap = await snapshot();
console.log('H reactivate ->', h.status, '| accepted min days', minDays, '| live', c1.live, '| cancelled', c1.cancelled, '| start_date', c1.start_date, '| upcoming order for C', snap.nextFor(C.public_id)?.date ?? 'none', '| response keys', Object.keys(h.body ?? {}).length);
if (!reactivatedId) throw new Error('reactivate failed twice; nothing to cancel');
const cancelBody = { cancel_reason: '114|Cancelled without exit survey response' };
let i = await patch(`${cBase}cancel/`, cancelBody);
for (let attempt = 1; attempt < 4 && i.status !== 200; attempt += 1) {
  await new Promise((resolve) => { setTimeout(resolve, 2000 * attempt); });
  i = await patch(`${cBase}cancel/`, cancelBody);
}
c1 = await getOne(cBase);
snap = await snapshot();
console.log('I cancel ->', i.status, '| live', c1.live, '| cancelled', c1.cancelled, '| cancel_reason', JSON.stringify(c1.cancel_reason), '| cancel_reason_code', c1.cancel_reason_code, '| upcoming order for C after cancel:', snap.nextFor(C.public_id)?.date ?? 'none');
if (c1.cancelled === null || snap.nextFor(C.public_id)) {
  restoreHint(`${cBase}cancel/`, cancelBody);
  console.log('!! C is still active or still has an upcoming order — cancel it from the hosted manager before leaving.');
}
```

- [x] **Step 2: Run it**

Run: `ENV_FILE=/home/thaverman/repos/customb2baccount/b2b-buyer-portal/apps/storefront/.env node <scratch>/og-edit-probe.mjs 2>&1 | tee <scratch>/og-edit-probe.log`
Expected: `mint ok`; every `->` status `200`; every restore line reads the original value; `H` shows `live true, cancelled null` and an upcoming order; `I` shows `cancelled` set and `upcoming order for C after cancel: none`. If any `!! RESTORE BY HAND` line prints, do exactly that before anything else.

- [x] **Step 3: Record the findings here** (edit this file; later tasks read these lines)

- Finding E — `change_frequency`: status `200`; the record's `every`/`every_period`/`frequency_days` after the change `6` / `2` / `42` (sent `{ every: 6, every_period: 2 }` to a subscription that was `10` / `3`); whether the upcoming order **moved** when the schedule changed `no` (next order `2027-08-01` before the change, after it, and after the restore; one subscription, 10 months to 6 weeks; if yes, the hook's invalidation of `upcoming` is what redraws the date, and Task 9 must expect the date to move; since no, Task 9 should expect it not to move). Whether the response is the subscription `likely: 33 top-level keys (reactivate returned 33 too), but only the key count was logged, so the shape is unconfirmed`. Restore read back `10` / `3`.
- Finding F — `change_quantity`: status `200`; whether the upcoming order's **item quantity follows** the subscription `yes` (sent `quantity + 1`: record `2`, item quantity on the upcoming order `2`; after the restore both `1`) (the card shows the subscription's quantity either way).
- Finding G — `change_shipping`: status `200`; whether the upcoming order's `shipping_address` **follows** `yes` (record moved `true`, upcoming order's address moved `true`; the restore put the record back, `true`, but the order's address after the restore was not logged) (not displayed; recorded for the cutover).
- Finding H — `reactivate`: accepted `next_order_date` = **tomorrow** `[x] yes` → `FIRST_ORDER_MIN_DAYS = 1` in Task 4 (`200` on the first attempt, no retry needed; today itself was not tried); `[ ] no, needed today + 2` → `FIRST_ORDER_MIN_DAYS = 2` and the hint copy in Task 3 reads "Choose a date at least two days from today."; `live`/`cancelled`/`start_date` after `true` / `null` / `2026-10-01`; an upcoming order appeared dated `2026-10-02`.
- Finding I — `cancel` after reactivate: status `200`; `cancel_reason` stored as `"114|Cancelled without exit survey response"` (verbatim: the string sent, code prefix included), `cancel_reason_code` `114` (parsed from the prefix); the upcoming order **disappeared** `yes` (none after the cancel). Side effect the API will not undo: that subscription's `cancelled` is now `2026-10-01 15:33:49` (was `2026-03-08 07:38:28`) and its reason was overwritten (was `"113|Disengaged"` / `113`).
- Finding J — addresses: total `24`, live `24`, distinct live identities `22` (the manager showed **10**; a mismatch means the §4.6 normalisation differs from the manager's and Task 2's fixture must be re-derived from the log before coding). **MISMATCH, 22 vs 10:** the log holds counts only, no identities, so it cannot supply that fixture; the subscription's current address is live (`true`).
  - **Resolution (controller, 2026-10-01, read-only dump of the 24 live records):** distinct counts by candidate identity — nine fields 22; name + street + address2 + ZIP 18; street + address2 + city + state + ZIP 18; street + ZIP 14; **street line alone 10**, the manager's count. Ruling: the picker's identity is the normalised street line (Global Constraints and Task 2 amended). The same dump re-read the account: 14 active / 4 cancelled / 12 upcoming orders, and every upcoming-order line's address equals its subscription's — the G restore reached the order.
- Auth: the mint went through `test-onlineservices.storesupply.com` host with `Jwt` + `customerId` — `test-onlineservices` still accepted it (`mint ok`).

- [x] **Step 4: Delete nothing, commit nothing.** The script stays in scratch.

---

### Task 1: Service — five subscription writes

**Files:**
- Modify: `apps/storefront/src/shared/service/ordergroove/api.ts` (after `changeNextOrderDate`, before `paymentUrl`)
- Modify: `apps/storefront/src/shared/service/ordergroove/index.ts`
- Test: `apps/storefront/src/shared/service/ordergroove/api.test.ts`

**Interfaces:**
- Consumes: `ogMutate`, `subscriptionUrl`, `OgSubscription`, `FrequencyPeriod` (all already in `api.ts`/`types.ts`).
- Produces (exported from the barrel `@/shared/service/ordergroove`):
  - `changeSubscriptionFrequency(customerId: string, subscriptionId: string, every: number, everyPeriod: FrequencyPeriod): Promise<OgSubscription>`
  - `changeSubscriptionQuantity(customerId: string, subscriptionId: string, quantity: number): Promise<OgSubscription>`
  - `cancelSubscription(customerId: string, subscriptionId: string, cancelReason: string): Promise<OgSubscription>`
  - `interface ReactivationInput { startDate: string; every: number; everyPeriod: FrequencyPeriod; nextOrderDate: string }`
  - `reactivateSubscription(customerId: string, subscriptionId: string, input: ReactivationInput): Promise<OgSubscription>`
  - `changeShippingAddress(customerId: string, subscriptionId: string, addressId: string): Promise<OgSubscription>`

- [ ] **Step 1: Write the failing tests** — append a new `describe` to `api.test.ts` after the `writes` block, and add the five functions to the `./api` import list at the top of the file:

```ts
describe('subscription edits', () => {
  // The write path (mint, 403 re-mint, 10 s deadline, status mapping) is covered by `writes`;
  // these pin each endpoint's method, path and JSON body.
  const subscription = buildOgSubscriptionWith('WHATEVER_VALUES');
  const edit = (action: string, received: ReturnType<typeof vi.fn>) =>
    server.use(
      http.patch(`${ogBase}/subscriptions/${subscription.public_id}/${action}/`, async ({ request }) => {
        received(await request.json());

        return HttpResponse.json(subscription);
      }),
    );

  it('changes the frequency with Ordergroove field names', async () => {
    const received = vi.fn();
    edit('change_frequency', received);

    expect(
      await changeSubscriptionFrequency(someCustomerId(), subscription.public_id, 6, 2),
    ).toEqual(subscription);
    expect(received).toHaveBeenCalledWith({ every: 6, every_period: 2 });
  });

  it('changes the quantity', async () => {
    const received = vi.fn();
    edit('change_quantity', received);

    expect(await changeSubscriptionQuantity(someCustomerId(), subscription.public_id, 3)).toEqual(
      subscription,
    );
    expect(received).toHaveBeenCalledWith({ quantity: 3 });
  });

  it('cancels with the reason body exactly as given', async () => {
    const received = vi.fn();
    edit('cancel', received);

    await cancelSubscription(
      someCustomerId(),
      subscription.public_id,
      '114|Cancelled without exit survey response',
    );

    expect(received).toHaveBeenCalledWith({
      cancel_reason: '114|Cancelled without exit survey response',
    });
  });

  it('reactivates with a start date, a schedule and a first order date', async () => {
    const received = vi.fn();
    edit('reactivate', received);

    await reactivateSubscription(someCustomerId(), subscription.public_id, {
      startDate: '2026-10-01',
      every: 4,
      everyPeriod: 2,
      nextOrderDate: '2026-10-02',
    });

    expect(received).toHaveBeenCalledWith({
      start_date: '2026-10-01',
      every: 4,
      every_period: 2,
      next_order_date: '2026-10-02',
    });
  });

  it('changes the shipping address by Ordergroove address id', async () => {
    const received = vi.fn();
    edit('change_shipping', received);

    await changeShippingAddress(someCustomerId(), subscription.public_id, 'addr-2');

    expect(received).toHaveBeenCalledWith({ shipping_address: 'addr-2' });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `yarn vitest run src/shared/service/ordergroove/api.test.ts`
Expected: the five new tests fail with `is not a function` / "No export named"; every other test in the file still passes.

- [ ] **Step 3: Implement** — in `api.ts`, add `FrequencyPeriod` to the `./types` import, then insert after `changeNextOrderDate`:

```ts
/** In the Phase 3b probe a schedule change left the upcoming order's date alone (Task 0 finding E). */
export const changeSubscriptionFrequency = (
  customerId: string,
  subscriptionId: string,
  every: number,
  everyPeriod: FrequencyPeriod,
) =>
  ogMutate<OgSubscription>(customerId, subscriptionUrl(subscriptionId, 'change_frequency'), 'PATCH', {
    every,
    every_period: everyPeriod,
  });

export const changeSubscriptionQuantity = (
  customerId: string,
  subscriptionId: string,
  quantity: number,
) =>
  ogMutate<OgSubscription>(customerId, subscriptionUrl(subscriptionId, 'change_quantity'), 'PATCH', {
    quantity,
  });

/** `cancelReason` is the manager's "{code} | {label}" string or its no-survey default (spec §4.5). */
export const cancelSubscription = (
  customerId: string,
  subscriptionId: string,
  cancelReason: string,
) =>
  ogMutate<OgSubscription>(customerId, subscriptionUrl(subscriptionId, 'cancel'), 'PATCH', {
    cancel_reason: cancelReason,
  });

export interface ReactivationInput {
  /** "YYYY-MM-DD", today */
  startDate: string;
  every: number;
  everyPeriod: FrequencyPeriod;
  /** "YYYY-MM-DD"; Ordergroove rejects a date in the past (reference "Reactivate") */
  nextOrderDate: string;
}

export const reactivateSubscription = (
  customerId: string,
  subscriptionId: string,
  input: ReactivationInput,
) =>
  ogMutate<OgSubscription>(customerId, subscriptionUrl(subscriptionId, 'reactivate'), 'PATCH', {
    start_date: input.startDate,
    every: input.every,
    every_period: input.everyPeriod,
    next_order_date: input.nextOrderDate,
  });

export const changeShippingAddress = (
  customerId: string,
  subscriptionId: string,
  addressId: string,
) =>
  ogMutate<OgSubscription>(customerId, subscriptionUrl(subscriptionId, 'change_shipping'), 'PATCH', {
    shipping_address: addressId,
  });
```

Then in `index.ts` add `cancelSubscription`, `changeShippingAddress`, `changeSubscriptionFrequency`, `changeSubscriptionQuantity`, `reactivateSubscription` to the `./api` export list (keep it alphabetical) and add `export type { ReactivationInput } from './api';`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn vitest run src/shared/service/ordergroove/api.test.ts && yarn tsc --noEmit`
Expected: all tests pass; `tsc` exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/shared/service/ordergroove/api.ts src/shared/service/ordergroove/index.ts src/shared/service/ordergroove/api.test.ts
git commit -m "feat: B2B-0000 Add the five Ordergroove subscription edit writes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: View model and formatting — schedule options, cancel reasons, address options, true frequency text

**Files:**
- Modify: `apps/storefront/src/pages/ManageSubscriptions/viewModel.ts`
- Modify: `apps/storefront/src/pages/ManageSubscriptions/format.ts`
- Modify: `apps/storefront/src/pages/ManageSubscriptions/components/SubscriptionCard.tsx:39-54`
- Modify: `apps/storefront/src/pages/ManageSubscriptions/SubscriptionsManager.tsx:7,16-17,54`
- Modify: `apps/storefront/src/lib/lang/locales/en.json` (one key, beside `subscriptions.card.everyDays`)
- Test: `apps/storefront/src/pages/ManageSubscriptions/viewModel.test.ts`, `components/SubscriptionCard.test.tsx`, and every card fixture that sets `frequencyDays`

**Interfaces:**
- Consumes: `OgAddress`, `FrequencyPeriod` from `@/shared/service/ordergroove`; `summarizeAddress` (private, already in `viewModel.ts`).
- Produces (from `viewModel.ts`): `export interface AddressSummary` (was private); `SubscriptionCard` **loses** `frequencyDays`; `interface FrequencyOption { every: number; period: FrequencyPeriod }`; `frequencyOptions(every, period): FrequencyOption[]`; `frequencyKey(option: FrequencyOption): string` ("{every}-{period}", the select value); `quantityOptions(current: number): number[]`; `CANCEL_REASONS` (readonly `{ code, label }[]`); `OTHER_REASON_CODE = 1`; `interface CancelReasonSelection { code: number; details?: string }`; `cancelReasonBody(selection: CancelReasonSelection | null): string`; `interface AddressOption { publicId: string; summary: AddressSummary; isCurrent: boolean }`; `buildAddressOptions(addresses: OgAddress[] | undefined, currentId: string): AddressOption[]`.
- Produces (from `format.ts`): `describeFrequency(every, period, b3Lang): string`; `describeAddress(summary: AddressSummary): string`; `HOSTED_MANAGER_URL`.
- Copy: `subscriptions.card.everyMonths`.

- [ ] **Step 1: Write the failing view-model tests** — append to `viewModel.test.ts` (add `buildAddressOptions`, `cancelReasonBody`, `frequencyKey`, `frequencyOptions`, `quantityOptions` to the `./viewModel` import and `OgAddress` to a new `@/shared/service/ordergroove` import):

```ts
describe('schedule options', () => {
  // Ordergroove merchant configuration captured from SSW's manager bundle (spec §4.3, §12.2).
  const sswList = [
    { every: 2, period: 1 },
    { every: 4, period: 1 },
    { every: 6, period: 1 },
    { every: 8, period: 1 },
    { every: 10, period: 1 },
    { every: 12, period: 1 },
    { every: 1, period: 1 },
    { every: 2, period: 2 },
    { every: 4, period: 2 },
    { every: 6, period: 2 },
    { every: 8, period: 2 },
    { every: 10, period: 2 },
    { every: 12, period: 2 },
  ];

  it("offers SSW's frequency list in the manager's order when the current schedule is on it", () => {
    expect(frequencyOptions(4, 2)).toEqual(sswList);
  });

  it('appends a schedule SSW does not offer as the last option, exactly once', () => {
    expect(frequencyOptions(10, 3)).toEqual([...sswList, { every: 10, period: 3 }]);
    expect(frequencyOptions(4, 3)).toHaveLength(14);
  });

  it('keys a schedule for a select as every-period', () => {
    expect(frequencyKey({ every: 4, period: 2 })).toBe('4-2');
  });

  it('offers quantities 1 to 20, plus the current one when it is larger', () => {
    const oneToTwenty = Array.from({ length: 20 }, (_, index) => index + 1);

    expect(quantityOptions(2)).toEqual(oneToTwenty);
    expect(quantityOptions(20)).toEqual(oneToTwenty);
    expect(quantityOptions(32)).toEqual([...oneToTwenty, 32]);
  });
});

describe('cancel reason body', () => {
  it("sends the manager's own values: listed reason, Other with and without details, no survey", () => {
    expect(cancelReasonBody({ code: 8 })).toBe('8 | This product is too expensive');
    expect(cancelReasonBody({ code: 1, details: '  Moving house  ' })).toBe('1 | Moving house');
    expect(cancelReasonBody({ code: 1, details: '   ' })).toBe('1');
    expect(cancelReasonBody({ code: 1 })).toBe('1');
    expect(cancelReasonBody(null)).toBe('114|Cancelled without exit survey response');
  });
});

describe('address options', () => {
  const address = (over: Partial<OgAddress>) =>
    buildOgAddressWith({
      first_name: 'Jane',
      last_name: 'Doe',
      company_name: 'Acme Co',
      address: '1 Main St',
      address2: null,
      city: 'Springfield',
      state_province_code: 'IL',
      zip_postal_code: '62701',
      country_code: 'US',
      live: true,
      ...over,
    });

  it('collapses records that differ only in case and spacing, keeping the first live one', () => {
    const first = address({});
    const shouting = address({ first_name: 'JANE', address: '1  main   st' });
    const elsewhere = address({ address: '2 Oak Ave' });

    const options = buildAddressOptions([first, shouting, elsewhere], elsewhere.public_id);

    expect(options.map((option) => option.publicId)).toEqual([elsewhere.public_id, first.public_id]);
    expect(options[0].isCurrent).toBe(true);
    expect(options[1].summary.line1).toBe('1 Main St');
  });

  it('collapses one street entered with a different company, suite, city spelling or ZIP+4, as the hosted manager does', () => {
    // Task 0 finding J: 24 live records, 22 nine-field identities, 10 distinct street lines — and the
    // manager offered exactly 10. Ordergroove mints a record per checkout, so these are one place.
    const first = address({});
    const variants = [
      address({ company_name: 'Store Supply', address2: 'Suite 4' }),
      address({ city: 'Springfeild', zip_postal_code: '62701-1206' }),
      address({ first_name: 'Tim', last_name: 'Test', company_name: null }),
    ];

    const options = buildAddressOptions([first, ...variants], first.public_id);

    expect(options).toHaveLength(1);
    expect(options[0].publicId).toBe(first.public_id);
  });

  it('lets the current record win its duplicate group so the preselected id is the one Ordergroove holds', () => {
    const twin = address({});
    const current = address({});

    expect(buildAddressOptions([twin, current], current.public_id)).toEqual([
      { publicId: current.public_id, summary: expect.objectContaining({ name: 'Jane Doe' }), isCurrent: true },
    ]);
  });

  it('drops retired records except the current one', () => {
    const current = address({ live: false });
    const retired = address({ live: false, address: '9 Old Rd' });
    const live = address({ address: '2 Oak Ave' });

    expect(
      buildAddressOptions([retired, live, current], current.public_id).map((option) => option.publicId),
    ).toEqual([current.public_id, live.public_id]);
  });

  it('sorts the current address first, then by name', () => {
    const zed = address({ first_name: 'Zed', last_name: 'Young', address: '3 Pine Ct' });
    const amy = address({ first_name: 'Amy', last_name: 'Adams', address: '4 Elm Rd' });
    const current = address({ first_name: 'Mia', last_name: 'Moss', address: '5 Birch Ln' });

    expect(
      buildAddressOptions([zed, amy, current], current.public_id).map((option) => option.summary.name),
    ).toEqual(['Mia Moss', 'Amy Adams', 'Zed Young']);
  });

  it('has nothing to offer while addresses have not loaded', () => {
    expect(buildAddressOptions(undefined, 'addr-1')).toEqual([]);
  });
});
```

Also in the existing `summarises the product, address and payment records` test, delete the `frequencyDays: 28,` line from the `toMatchObject` expectation and the `frequency_days: 28,` line from its subscription fixture — the card no longer carries `frequencyDays`. Search the file for any other `frequencyDays` and remove it the same way.

- [ ] **Step 2: Write the failing card tests** — in `components/SubscriptionCard.test.tsx`: remove `frequencyDays: 28,` from `buildCardWith`'s defaults and from the `renders every field` fixture; change the daily case in `describes an unbranded card and a daily frequency` from `frequencyDays: 3` to `every: 3, everyPeriod: 1`; then add:

```ts
it('reads a monthly schedule from the configured period, not from frequency days', () => {
  // SSW sells 10- and 12-month subscriptions; frequency_days (300, 360) is not what the customer chose.
  const card = buildCardWith({ quantity: 1, every: 10, everyPeriod: 3 });

  renderWithProviders(<SubscriptionCard card={card} variant="active" loading={settled} />, withDateFormat);

  expect(screen.getByText('Qty 1 · every 10 months')).toBeInTheDocument();
  expect(screen.queryByText(/days/)).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run both files to verify they fail**

Run: `yarn vitest run src/pages/ManageSubscriptions/viewModel.test.ts src/pages/ManageSubscriptions/components/SubscriptionCard.test.tsx`
Expected: the new `schedule options`, `cancel reason body` and `address options` tests fail (`is not a function`); the monthly card test fails showing `every 300 days`-style text or a missing `everyMonths` message. The `frequencyDays` removals alone fail nothing yet.

- [ ] **Step 4: Implement the view model** — in `viewModel.ts`:

1. `export interface AddressSummary` (add `export`).
2. In `SubscriptionCard`, delete `frequencyDays: number;`; in `toCard`, delete `frequencyDays: subscription.frequency_days,`.
3. Append after `changeDatePresets`:

```ts
export interface FrequencyOption {
  every: number;
  period: FrequencyPeriod;
}

// Ordergroove merchant configuration as baked into SSW's manager bundle, captured 2026-09-17
// (spec §12.2): days, then "1 day", then weeks. Not readable from the REST API; revisit here if
// SSW changes the offer in Ordergroove.
const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { every: 2, period: 1 },
  { every: 4, period: 1 },
  { every: 6, period: 1 },
  { every: 8, period: 1 },
  { every: 10, period: 1 },
  { every: 12, period: 1 },
  { every: 1, period: 1 },
  { every: 2, period: 2 },
  { every: 4, period: 2 },
  { every: 6, period: 2 },
  { every: 8, period: 2 },
  { every: 10, period: 2 },
  { every: 12, period: 2 },
];

/** SSW's list, with the card's own schedule appended when it is not offered (the manager does the same). */
export const frequencyOptions = (every: number, period: FrequencyPeriod): FrequencyOption[] =>
  FREQUENCY_OPTIONS.some((option) => option.every === every && option.period === period)
    ? FREQUENCY_OPTIONS
    : [...FREQUENCY_OPTIONS, { every, period }];

/** The select value for a schedule, "{every}-{period}" — the same key in every select that offers one. */
export const frequencyKey = ({ every, period }: FrequencyOption) => `${every}-${period}`;

const MAX_QUANTITY = 20;

/** 1…20, plus the current quantity when it is larger (the manager shows 32 for one SSW subscription). */
export const quantityOptions = (current: number): number[] => {
  const options = Array.from({ length: MAX_QUANTITY }, (_, index) => index + 1);

  return current > MAX_QUANTITY ? [...options, current] : options;
};

// Codes and canonical English labels the manager sends. Ordergroove's reporting keys on them, so
// the body carries THESE labels whatever language the radios show (spec §4.5).
export const CANCEL_REASONS = [
  { code: 2, label: 'I have too many of this product' },
  { code: 8, label: 'This product is too expensive' },
  { code: 31, label: 'I had trouble managing my subscription' },
  {
    code: 70,
    label: 'I no longer have any use for this product and I will not need it in the near future',
  },
  { code: 3, label: 'I stopped using this product' },
  { code: 22, label: 'I wanted to switch to a different product/flavor' },
  { code: 15, label: "I don't like this product" },
] as const;
export const OTHER_REASON_CODE = 1;
// The manager's hidden default — no spaces, unlike the radio values.
const NO_SURVEY_REASON = '114|Cancelled without exit survey response';

export interface CancelReasonSelection {
  code: number;
  /** free text; Other only */
  details?: string;
}

/** The `cancel_reason` body: a listed reason, Other with or without details, or the no-survey value. */
export const cancelReasonBody = (selection: CancelReasonSelection | null): string => {
  if (!selection) {
    return NO_SURVEY_REASON;
  }
  if (selection.code === OTHER_REASON_CODE) {
    const details = selection.details?.trim() ?? '';

    return details ? `${OTHER_REASON_CODE} | ${details}` : String(OTHER_REASON_CODE);
  }
  const reason = CANCEL_REASONS.find((candidate) => candidate.code === selection.code);

  return reason ? `${reason.code} | ${reason.label}` : NO_SURVEY_REASON;
};

export interface AddressOption {
  publicId: string;
  summary: AddressSummary;
  isCurrent: boolean;
}

const normalise = (value: string | null) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// Ordergroove mints an address record per checkout and carries no address type, so one place
// accumulates records that differ in company, suite line, city spelling or ZIP+4, and billing
// records sit beside their shipping twins. The hosted manager collapses them on the street line
// alone (24 live records → its 10 "Ship to" choices for the fixture customer, Task 0 finding J);
// the picker does the same so both screens offer the same list.
const addressIdentity = (address: OgAddress) => normalise(address.address);

/**
 * One choice per distinct street line: live records plus the current one even when retired. The
 * current record wins its duplicate group so the preselected radio is the id Ordergroove already
 * holds; otherwise the first live record. Current first, then by name (spec §4.6 as amended).
 */
export const buildAddressOptions = (
  addresses: OgAddress[] | undefined,
  currentId: string,
): AddressOption[] => {
  const byIdentity = new Map<string, OgAddress>();
  (addresses ?? [])
    .filter((address) => address.live || address.public_id === currentId)
    .forEach((address) => {
      const identity = addressIdentity(address);
      if (!byIdentity.has(identity) || address.public_id === currentId) {
        byIdentity.set(identity, address);
      }
    });

  return Array.from(byIdentity.values())
    .map((address) => ({
      publicId: address.public_id,
      summary: summarizeAddress(address),
      isCurrent: address.public_id === currentId,
    }))
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) {
        return a.isCurrent ? -1 : 1;
      }

      return a.summary.name.localeCompare(b.summary.name);
    });
};
```

- [ ] **Step 5: Implement the formatting helpers and the card text** — replace `format.ts` with:

```ts
import { LangFormatFunction } from '@/lib/lang';
import { FrequencyPeriod } from '@/shared/service/ordergroove';
import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';

import { AddressSummary, PaymentSummary } from './viewModel';

/**
 * Every date this page shows — next order, cancellation, order history — is an Ordergroove
 * calendar date, so it must not be shifted by the store's timezone offset.
 */
export { displayCalendarDate as formatDate } from '@/utils/b3DateFormat';

/** The theme's hosted manager — still the only home for swap product and add address (spec decision 7). */
export const HOSTED_MANAGER_URL = `${BigCommerceStorefrontAPIBaseURL}/subscriptions`;

const FREQUENCY_KEYS: Record<FrequencyPeriod, string> = {
  1: 'subscriptions.card.everyDays',
  2: 'subscriptions.card.everyWeeks',
  3: 'subscriptions.card.everyMonths',
};

/** "every 10 months" from the schedule as configured — `frequency_days` would say "every 300 days". */
export const describeFrequency = (
  every: number,
  period: FrequencyPeriod,
  b3Lang: LangFormatFunction,
) => b3Lang(FREQUENCY_KEYS[period], { count: every });

/** "Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701" — the card's line, reused by the address picker. */
export const describeAddress = (address: AddressSummary) =>
  [address.name, address.company, address.line1, address.line2, address.locality]
    .filter(Boolean)
    .join(', ');

/** "Visa ending in 1111 · exp 03/2028", or the unbranded form for a card type the table does not name. */
export const describePayment = (payment: PaymentSummary, b3Lang: LangFormatFunction) =>
  payment.brand
    ? b3Lang('subscriptions.card.payment', {
        brand: payment.brand,
        last4: payment.last4,
        expiry: payment.expiry,
      })
    : b3Lang('subscriptions.card.paymentUnbranded', {
        last4: payment.last4,
        expiry: payment.expiry,
      });
```

In `components/SubscriptionCard.tsx`: import `describeAddress, describeFrequency, describePayment, formatDate` from `'../format'`; replace the `frequency` and `shipping` computations (lines 39–54) with:

```ts
  const frequency = describeFrequency(card.every, card.everyPeriod, b3Lang);
  const shipping = card.shippingAddress && describeAddress(card.shippingAddress);
```

In `SubscriptionsManager.tsx`: delete the `BigCommerceStorefrontAPIBaseURL` import and the `HOSTED_MANAGER_URL` constant with its comment (lines 7, 16–17); add `import { HOSTED_MANAGER_URL } from './format';` in the relative import group (alphabetically before `./hooks/useSubscriptionsData`).

In `en.json`, after `"subscriptions.card.everyDays"`:

```json
  "subscriptions.card.everyMonths": "every {count, plural, one {month} other {# months}}",
```

- [ ] **Step 6: Remove `frequencyDays` from every remaining card fixture**

Run: `grep -rn "frequencyDays" src/pages/ManageSubscriptions`
Expected hits: the `buildCardWith` builders in `components/actions/SkipDialog.test.tsx`, `SendNowDialog.test.tsx`, `ChangeDateDialog.test.tsx`, `SubscriptionActions.test.tsx` (and any other). Delete the `frequencyDays: 28,` line from each. `grep` again: the only remaining hits must be in `pages/PaymentMethods/` (its own model) — none in `ManageSubscriptions`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `yarn vitest run src/pages/ManageSubscriptions && yarn tsc --noEmit`
Expected: every file green; `tsc` exit 0 (a leftover `frequencyDays` anywhere fails here).

- [ ] **Step 8: Commit**

```bash
git add src/pages/ManageSubscriptions/viewModel.ts src/pages/ManageSubscriptions/viewModel.test.ts src/pages/ManageSubscriptions/format.ts src/pages/ManageSubscriptions/components/SubscriptionCard.tsx src/pages/ManageSubscriptions/components/SubscriptionCard.test.tsx src/pages/ManageSubscriptions/SubscriptionsManager.tsx src/pages/ManageSubscriptions/components/actions/SkipDialog.test.tsx src/pages/ManageSubscriptions/components/actions/SendNowDialog.test.tsx src/pages/ManageSubscriptions/components/actions/ChangeDateDialog.test.tsx src/pages/ManageSubscriptions/components/actions/SubscriptionActions.test.tsx src/lib/lang/locales/en.json
git commit -m "feat: B2B-0000 Add schedule, cancel-reason and address options to the subscriptions view model

The card now reads its schedule from every/every_period, so a 10-month
subscription says \"every 10 months\" instead of \"every 300 days\".

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The actions hook and its copy

**Files:**
- Modify: `apps/storefront/src/pages/ManageSubscriptions/hooks/useSubscriptionActions.ts`
- Modify: `apps/storefront/src/lib/lang/locales/en.json` (after `subscriptions.actions.changeCard.success`)
- Test: `apps/storefront/src/pages/ManageSubscriptions/hooks/useSubscriptionActions.test.tsx`

**Interfaces:**
- Consumes: Task 1's five functions and `ReactivationInput`; `FrequencyPeriod`.
- Produces: `useSubscriptionActions(customerId)` additionally returns
  - `changeFrequency: UseMutationResult<OgSubscription, Error, { subscriptionId: string; every: number; everyPeriod: FrequencyPeriod }>`
  - `changeQuantity: … { subscriptionId: string; quantity: number }`
  - `cancel: … { subscriptionId: string; cancelReason: string }`
  - `reactivate: … ReactivationInput & { subscriptionId: string }`
  - `changeAddress: … { subscriptionId: string; addressId: string }`
  All five: success → snackbar (keys below) and invalidate `subscriptions` + `upcoming`; error → the 3a `onError`.
- Copy keys: `subscriptions.actions.{cancel,reactivate,changeAddress,quantityLabel,frequencyLabel}`, `subscriptions.actions.frequency.success`, `subscriptions.actions.quantity.success`, `subscriptions.actions.cancel.*`, `subscriptions.actions.reactivate.*`, `subscriptions.actions.address.*` (full list in Step 4).

- [ ] **Step 1: Write the failing hook tests** — append to `useSubscriptionActions.test.tsx` (add `buildOgSubscriptionWith` to the `tests/test-utils` import if it is not there; it is):

```ts
describe('subscription edits', () => {
  // All five share the 3a contract: PATCH the subscription, refresh subscriptions and upcoming
  // orders, confirm with the action's own copy.
  const mockEdit = (action: string) => {
    const received = vi.fn();
    server.use(
      http.patch(`${ogBase}/subscriptions/s-1/${action}/`, async ({ request }) => {
        received(await request.json());

        return HttpResponse.json(buildOgSubscriptionWith('WHATEVER_VALUES'));
      }),
    );

    return received;
  };
  const subscriptionKeys = (customerId: number) => [
    ['ordergroove', customerId, 'subscriptions'],
    ['ordergroove', customerId, 'upcoming'],
  ];

  it('changes the frequency with Ordergroove field names', async () => {
    const received = mockEdit('change_frequency');
    const { customerId } = renderActions();

    actions().changeFrequency.mutate({ subscriptionId: 's-1', every: 6, everyPeriod: 2 });

    await waitFor(() => expect(actions().changeFrequency.isSuccess).toBe(true));
    expect(received).toHaveBeenCalledWith({ every: 6, every_period: 2 });
    expect(invalidatedKeys()).toEqual(subscriptionKeys(customerId));
    expect(snackbar.success).toHaveBeenCalledWith('Frequency updated.');
  });

  it('changes the quantity', async () => {
    const received = mockEdit('change_quantity');
    const { customerId } = renderActions();

    actions().changeQuantity.mutate({ subscriptionId: 's-1', quantity: 3 });

    await waitFor(() => expect(actions().changeQuantity.isSuccess).toBe(true));
    expect(received).toHaveBeenCalledWith({ quantity: 3 });
    expect(invalidatedKeys()).toEqual(subscriptionKeys(customerId));
    expect(snackbar.success).toHaveBeenCalledWith('Quantity updated.');
  });

  it('cancels with the reason body it is handed', async () => {
    const received = mockEdit('cancel');
    const { customerId } = renderActions();

    actions().cancel.mutate({
      subscriptionId: 's-1',
      cancelReason: '114|Cancelled without exit survey response',
    });

    await waitFor(() => expect(actions().cancel.isSuccess).toBe(true));
    expect(received).toHaveBeenCalledWith({
      cancel_reason: '114|Cancelled without exit survey response',
    });
    expect(invalidatedKeys()).toEqual(subscriptionKeys(customerId));
    expect(snackbar.success).toHaveBeenCalledWith('Subscription cancelled.');
  });

  it('reactivates with the schedule and the first order date', async () => {
    const received = mockEdit('reactivate');
    const { customerId } = renderActions();

    actions().reactivate.mutate({
      subscriptionId: 's-1',
      startDate: '2026-10-01',
      every: 4,
      everyPeriod: 2,
      nextOrderDate: '2026-10-02',
    });

    await waitFor(() => expect(actions().reactivate.isSuccess).toBe(true));
    expect(received).toHaveBeenCalledWith({
      start_date: '2026-10-01',
      every: 4,
      every_period: 2,
      next_order_date: '2026-10-02',
    });
    expect(invalidatedKeys()).toEqual(subscriptionKeys(customerId));
    expect(snackbar.success).toHaveBeenCalledWith('Subscription reactivated.');
  });

  it('changes the shipping address', async () => {
    const received = mockEdit('change_shipping');
    const { customerId } = renderActions();

    actions().changeAddress.mutate({ subscriptionId: 's-1', addressId: 'addr-2' });

    await waitFor(() => expect(actions().changeAddress.isSuccess).toBe(true));
    expect(received).toHaveBeenCalledWith({ shipping_address: 'addr-2' });
    expect(invalidatedKeys()).toEqual(subscriptionKeys(customerId));
    expect(snackbar.success).toHaveBeenCalledWith('Shipping address updated.');
  });

  it('reports a failed cancel and leaves the cache alone', async () => {
    server.use(
      http.patch(`${ogBase}/subscriptions/s-1/cancel/`, () =>
        HttpResponse.json({ detail: 'locked' }, { status: 423 }),
      ),
    );
    renderActions();

    actions().cancel.mutate({ subscriptionId: 's-1', cancelReason: '1' });

    await waitFor(() => expect(actions().cancel.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
    expect(snackbar.error).toHaveBeenCalledWith("We couldn't apply that change. Please try again.");
    expect(snackbar.success).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `yarn vitest run src/pages/ManageSubscriptions/hooks/useSubscriptionActions.test.tsx`
Expected: the six new tests fail (`Cannot read properties of undefined (reading 'mutate')`); the 3a and Phase 4 tests still pass.

- [ ] **Step 3: Implement the hook** — in `useSubscriptionActions.ts`, extend the `@/shared/service/ordergroove` import to

```ts
import {
  cancelSubscription,
  changeNextOrderDate,
  changeShippingAddress,
  changeSubscriptionFrequency,
  changeSubscriptionPayment,
  changeSubscriptionQuantity,
  createPayment,
  FrequencyPeriod,
  OrdergrooveError,
  ReactivationInput,
  reactivateSubscription,
  sendOrderNow,
  skipSubscription,
} from '@/shared/service/ordergroove';
```

change the doc comment's first words from "The three 3a writes as mutations." to "Every subscription write as a mutation.", and insert before the `return`:

```ts
  const changeFrequency = useMutation({
    mutationFn: ({
      subscriptionId,
      every,
      everyPeriod,
    }: {
      subscriptionId: string;
      every: number;
      everyPeriod: FrequencyPeriod;
    }) => changeSubscriptionFrequency(id, subscriptionId, every, everyPeriod),
    // The probe saw a schedule change leave the upcoming order's date alone (Task 0 finding E);
    // 'upcoming' is refreshed regardless (spec §5.2) so the card can never show a stale order.
    onSuccess: () =>
      succeed('subscriptions.actions.frequency.success', ['subscriptions', 'upcoming']),
    onError,
  });

  const changeQuantity = useMutation({
    mutationFn: ({ subscriptionId, quantity }: { subscriptionId: string; quantity: number }) =>
      changeSubscriptionQuantity(id, subscriptionId, quantity),
    onSuccess: () =>
      succeed('subscriptions.actions.quantity.success', ['subscriptions', 'upcoming']),
    onError,
  });

  const cancel = useMutation({
    mutationFn: ({
      subscriptionId,
      cancelReason,
    }: {
      subscriptionId: string;
      cancelReason: string;
    }) => cancelSubscription(id, subscriptionId, cancelReason),
    // Cancelling removes the subscription's items from its upcoming order (Task 0 finding I).
    onSuccess: () => succeed('subscriptions.actions.cancel.success', ['subscriptions', 'upcoming']),
    onError,
  });

  const reactivate = useMutation({
    mutationFn: ({ subscriptionId, ...input }: ReactivationInput & { subscriptionId: string }) =>
      reactivateSubscription(id, subscriptionId, input),
    onSuccess: () =>
      succeed('subscriptions.actions.reactivate.success', ['subscriptions', 'upcoming']),
    onError,
  });

  const changeAddress = useMutation({
    mutationFn: ({ subscriptionId, addressId }: { subscriptionId: string; addressId: string }) =>
      changeShippingAddress(id, subscriptionId, addressId),
    onSuccess: () => succeed('subscriptions.actions.address.success', ['subscriptions', 'upcoming']),
    onError,
  });
```

and make the return

```ts
  return {
    skip,
    sendNow,
    changeDate,
    changeCard,
    changeFrequency,
    changeQuantity,
    cancel,
    reactivate,
    changeAddress,
  };
```

- [ ] **Step 4: Add the copy** — in `en.json`, insert after the `"subscriptions.actions.changeCard.success"` line (every line ends with a comma; the file continues):

```json
  "subscriptions.actions.cancel": "Cancel subscription",
  "subscriptions.actions.reactivate": "Reactivate",
  "subscriptions.actions.changeAddress": "Change",
  "subscriptions.actions.quantityLabel": "Quantity",
  "subscriptions.actions.frequencyLabel": "Frequency",
  "subscriptions.actions.frequency.success": "Frequency updated.",
  "subscriptions.actions.quantity.success": "Quantity updated.",
  "subscriptions.actions.cancel.title": "Cancel subscription",
  "subscriptions.actions.cancel.skipInstead": "Want to skip the next order instead?",
  "subscriptions.actions.cancel.skipInsteadLink": "Skip next order",
  "subscriptions.actions.cancel.reasonsTitle": "Tell us why (optional)",
  "subscriptions.actions.cancel.reason.2": "I have too many of this product",
  "subscriptions.actions.cancel.reason.8": "This product is too expensive",
  "subscriptions.actions.cancel.reason.31": "I had trouble managing my subscription",
  "subscriptions.actions.cancel.reason.70": "I no longer have any use for this product and I will not need it in the near future",
  "subscriptions.actions.cancel.reason.3": "I stopped using this product",
  "subscriptions.actions.cancel.reason.22": "I wanted to switch to a different product/flavor",
  "subscriptions.actions.cancel.reason.15": "I don't like this product",
  "subscriptions.actions.cancel.reason.other": "Other (please specify)",
  "subscriptions.actions.cancel.otherPlaceholder": "Tell us more",
  "subscriptions.actions.cancel.keep": "Keep subscription",
  "subscriptions.actions.cancel.confirm": "Cancel subscription",
  "subscriptions.actions.cancel.success": "Subscription cancelled.",
  "subscriptions.actions.reactivate.title": "Reactivate subscription",
  "subscriptions.actions.reactivate.body": "You'll receive {product} again in an upcoming order.",
  "subscriptions.actions.reactivate.dateLabel": "First order date",
  "subscriptions.actions.reactivate.dateHint": "Choose a date after today.",
  "subscriptions.actions.reactivate.confirm": "Reactivate",
  "subscriptions.actions.reactivate.success": "Subscription reactivated.",
  "subscriptions.actions.address.title": "Change shipping address",
  "subscriptions.actions.address.addNew": "To add a new address, use the {link}.",
  "subscriptions.actions.address.addNewLink": "subscription manager",
  "subscriptions.actions.address.confirm": "Save",
  "subscriptions.actions.address.success": "Shipping address updated.",
```

If Task 0 finding H recorded `FIRST_ORDER_MIN_DAYS = 2`, `subscriptions.actions.reactivate.dateHint` reads `"Choose a date at least two days from today."` instead.

- [ ] **Step 5: Run to verify they pass**

Run: `yarn vitest run src/pages/ManageSubscriptions/hooks && yarn tsc --noEmit`
Expected: all green; `tsc` exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ManageSubscriptions/hooks/useSubscriptionActions.ts src/pages/ManageSubscriptions/hooks/useSubscriptionActions.test.tsx src/lib/lang/locales/en.json
git commit -m "feat: B2B-0000 Add the five subscription edit mutations and their copy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The three dialogs — Cancel, Reactivate, Change address

**Files:**
- Create: `apps/storefront/src/pages/ManageSubscriptions/components/actions/CancelDialog.tsx`
- Create: `apps/storefront/src/pages/ManageSubscriptions/components/actions/ReactivateDialog.tsx`
- Create: `apps/storefront/src/pages/ManageSubscriptions/components/actions/ChangeAddressDialog.tsx`
- Test: one `*.test.tsx` beside each

**Interfaces:**
- Consumes: `CANCEL_REASONS`, `OTHER_REASON_CODE`, `cancelReasonBody`, `CancelReasonSelection`, `frequencyOptions`, `frequencyKey`, `FrequencyOption`, `AddressOption`, `SubscriptionCard` (Task 2); `describeFrequency`, `describeAddress`, `HOSTED_MANAGER_URL` (Task 2); `ReactivationInput` (Task 1); Task 3's copy.
- Produces (default exports):
  - `CancelDialog({ card, isOpen, isPending, onClose, onSkipInstead: () => void, onConfirm: (cancelReason: string) => void })`
  - `ReactivateDialog({ card, isOpen, isPending, onClose, onConfirm: (input: ReactivationInput) => void })`
  - `ChangeAddressDialog({ options: AddressOption[], isOpen, isPending, onClose, onConfirm: (addressId: string) => void })`
- The dialogs stay mounted and toggle `isOpen`; they reset their state on every opening. These modules have no `src` consumer until Task 6/7, so `lint:dependencies` reports them as orphans until then — expected.

- [ ] **Step 1: Write the failing Cancel dialog tests** — `CancelDialog.test.tsx`:

```tsx
import { ReactElement } from 'react';
import { builder, faker, renderWithProviders, screen, within } from 'tests/test-utils';

import { SubscriptionCard as SubscriptionCardModel } from '../../viewModel';

import CancelDialog from './CancelDialog';

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  externalProductId: '9537_12118',
  product: { name: faker.commerce.productName(), imageUrl: null, detailUrl: null, sku: null },
  quantity: 1,
  every: 4,
  everyPeriod: 2,
  nextOrderDate: '2026-10-03',
  nextOrder: { orderId: faker.string.hexadecimal({ length: 32, prefix: '' }), otherProducts: [] },
  shippingAddress: null,
  shippingAddressId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  payment: null,
  paymentId: 'pay-a',
  billingAddressId: 'addr-1',
  cancelledOn: null,
}));

// B3Dialog opens only on a re-render after its container ref exists: render closed, then open.
const renderOpen = (dialog: (isOpen: boolean) => ReactElement) => {
  const view = renderWithProviders(dialog(false));
  view.result.rerender(dialog(true));

  return view;
};

type CancelDialogProps = Parameters<typeof CancelDialog>[0];

// Explicit props with defaults, not a JSX spread: CLAUDE.md forbids new jsx-props-no-spreading violations.
const dialog = (
  isOpen: boolean,
  {
    card = buildCardWith('WHATEVER_VALUES'),
    isPending = false,
    onClose = vi.fn(),
    onSkipInstead = vi.fn(),
    onConfirm = vi.fn(),
  }: Partial<Omit<CancelDialogProps, 'isOpen'>> = {},
): ReactElement => (
  <CancelDialog
    card={card}
    isOpen={isOpen}
    isPending={isPending}
    onClose={onClose}
    onSkipInstead={onSkipInstead}
    onConfirm={onConfirm}
  />
);

it("sends the manager's no-survey value when no reason is chosen", async () => {
  const onConfirm = vi.fn();
  const { user } = renderOpen((isOpen) => dialog(isOpen, { onConfirm }));

  expect(screen.getByRole('dialog')).toHaveTextContent('Tell us why (optional)');
  expect(screen.getAllByRole('radio')).toHaveLength(8);
  expect(screen.getByRole('radio', { name: 'Other (please specify)' })).not.toBeChecked();

  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));

  expect(onConfirm).toHaveBeenCalledWith('114|Cancelled without exit survey response');
});

it('sends a listed reason with its canonical label', async () => {
  const onConfirm = vi.fn();
  const { user } = renderOpen((isOpen) => dialog(isOpen, { onConfirm }));

  await user.click(screen.getByRole('radio', { name: 'This product is too expensive' }));
  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));

  expect(onConfirm).toHaveBeenCalledWith('8 | This product is too expensive');
});

it('sends Other with the trimmed details', async () => {
  const onConfirm = vi.fn();
  const { user } = renderOpen((isOpen) => dialog(isOpen, { onConfirm }));

  expect(screen.queryByLabelText('Tell us more')).not.toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: 'Other (please specify)' }));
  await user.type(screen.getByLabelText('Tell us more'), '  Moving house  ');
  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));

  expect(onConfirm).toHaveBeenCalledWith('1 | Moving house');
});

it('sends the bare Other code when the details are blank', async () => {
  const onConfirm = vi.fn();
  const { user } = renderOpen((isOpen) => dialog(isOpen, { onConfirm }));

  await user.click(screen.getByRole('radio', { name: 'Other (please specify)' }));
  await user.type(screen.getByLabelText('Tell us more'), '   ');
  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));

  expect(onConfirm).toHaveBeenCalledWith('1');
});

it('offers to skip the next order instead, only while one is scheduled', async () => {
  const onSkipInstead = vi.fn();
  const { user } = renderOpen((isOpen) => dialog(isOpen, { onSkipInstead }));

  expect(screen.getByRole('dialog')).toHaveTextContent('Want to skip the next order instead?');
  await user.click(screen.getByRole('button', { name: 'Skip next order' }));
  expect(onSkipInstead).toHaveBeenCalledTimes(1);

  renderOpen((isOpen) =>
    dialog(isOpen, { card: buildCardWith({ nextOrder: null, nextOrderDate: null }) }),
  );
  const [, unscheduled] = screen.getAllByRole('dialog');
  expect(within(unscheduled).queryByRole('button', { name: 'Skip next order' })).not.toBeInTheDocument();
});

it('keeps the subscription from the left button and holds everything while pending', async () => {
  const onClose = vi.fn();
  const { user, result } = renderOpen((isOpen) => dialog(isOpen, { onClose }));

  await user.click(screen.getByRole('button', { name: 'Keep subscription' }));
  expect(onClose).toHaveBeenCalledTimes(1);

  result.rerender(dialog(true, { onClose, isPending: true }));
  expect(screen.getByRole('button', { name: 'Cancel subscription' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Keep subscription' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('forgets the previous choice when reopened', async () => {
  const { user, result } = renderOpen((isOpen) => dialog(isOpen));

  await user.click(screen.getByRole('radio', { name: 'I stopped using this product' }));
  result.rerender(dialog(false));
  result.rerender(dialog(true));

  expect(screen.getByRole('radio', { name: 'I stopped using this product' })).not.toBeChecked();
});
```

- [ ] **Step 2: Write the failing Reactivate dialog tests** — `ReactivateDialog.test.tsx`:

```tsx
import { ReactElement } from 'react';
import dayjs from 'dayjs';
import { builder, faker, fireEvent, renderWithProviders, screen } from 'tests/test-utils';

import { SubscriptionCard as SubscriptionCardModel } from '../../viewModel';

import ReactivateDialog from './ReactivateDialog';

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  externalProductId: '9537_12118',
  product: { name: 'Kraft Paper Shopping Bags', imageUrl: null, detailUrl: null, sku: null },
  quantity: 1,
  every: 4,
  everyPeriod: 2,
  nextOrderDate: null,
  nextOrder: null,
  shippingAddress: null,
  shippingAddressId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  payment: null,
  paymentId: 'pay-a',
  billingAddressId: 'addr-1',
  cancelledOn: '2026-08-01 10:00:00',
}));

const renderOpen = (dialog: (isOpen: boolean) => ReactElement) => {
  const view = renderWithProviders(dialog(false));
  view.result.rerender(dialog(true));

  return view;
};

const today = () => dayjs().format('YYYY-MM-DD');
const tomorrow = () => dayjs().add(1, 'day').format('YYYY-MM-DD');

it('names the product, preselects the old schedule, defaults to tomorrow and confirms', async () => {
  const onConfirm = vi.fn();
  const { user } = renderOpen((isOpen) => (
    <ReactivateDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  expect(screen.getByRole('dialog')).toHaveTextContent(
    "You'll receive Kraft Paper Shopping Bags again in an upcoming order.",
  );
  expect(screen.getByRole('combobox', { name: /^Frequency/ })).toHaveTextContent('every 4 weeks');
  const date = screen.getByLabelText('First order date');
  expect(date).toHaveValue(tomorrow());
  expect(date).toHaveAttribute('min', tomorrow());

  await user.click(screen.getByRole('button', { name: 'Reactivate' }));

  expect(onConfirm).toHaveBeenCalledWith({
    startDate: today(),
    every: 4,
    everyPeriod: 2,
    nextOrderDate: tomorrow(),
  });
});

it('lists a schedule SSW does not sell as the last option and keeps it selected', async () => {
  const { user } = renderOpen((isOpen) => (
    <ReactivateDialog
      card={buildCardWith({ every: 10, everyPeriod: 3 })}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('combobox', { name: /^Frequency/ })).toHaveTextContent('every 10 months');
  await user.click(screen.getByRole('combobox', { name: /^Frequency/ }));
  const options = screen.getAllByRole('option');
  expect(options).toHaveLength(14);
  expect(options[13]).toHaveTextContent('every 10 months');
  expect(options[0]).toHaveTextContent('every 2 days');
});

it('lets the customer pick another frequency', async () => {
  const onConfirm = vi.fn();
  const { user } = renderOpen((isOpen) => (
    <ReactivateDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  await user.click(screen.getByRole('combobox', { name: /^Frequency/ }));
  await user.click(screen.getByRole('option', { name: 'every 6 weeks' }));
  await user.click(screen.getByRole('button', { name: 'Reactivate' }));

  expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ every: 6, everyPeriod: 2 }));
});

it('refuses a first order date before the minimum', async () => {
  const { user } = renderOpen((isOpen) => (
    <ReactivateDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));
  const date = screen.getByLabelText('First order date');

  fireEvent.change(date, { target: { value: today() } });
  expect(screen.getByRole('button', { name: 'Reactivate' })).toBeDisabled();
  expect(screen.getByText('Choose a date after today.')).toBeInTheDocument();

  fireEvent.change(date, { target: { value: dayjs().add(30, 'day').format('YYYY-MM-DD') } });
  expect(screen.getByRole('button', { name: 'Reactivate' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
});

it('disables Reactivate while the write is pending', () => {
  renderOpen((isOpen) => (
    <ReactivateDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('button', { name: 'Reactivate' })).toBeDisabled();
});
```

If Task 0 finding H set `FIRST_ORDER_MIN_DAYS = 2`, replace `tomorrow()` in the first test's three assertions with `dayjs().add(2, 'day')…`, make the refusal test change the date to `tomorrow()` instead of `today()`, and assert the hint "Choose a date at least two days from today.".

- [ ] **Step 3: Write the failing Change address dialog tests** — `ChangeAddressDialog.test.tsx`:

```tsx
import { ReactElement } from 'react';
import { builder, faker, renderWithProviders, screen } from 'tests/test-utils';

import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';

import { AddressOption } from '../../viewModel';

import ChangeAddressDialog from './ChangeAddressDialog';

const buildOptionWith = builder<AddressOption>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  summary: {
    name: faker.person.fullName(),
    company: null,
    line1: faker.location.streetAddress(),
    line2: null,
    locality: 'Springfield, IL 62701',
  },
  isCurrent: false,
}));

const renderOpen = (dialog: (isOpen: boolean) => ReactElement) => {
  const view = renderWithProviders(dialog(false));
  view.result.rerender(dialog(true));

  return view;
};

const home = buildOptionWith({
  summary: { name: 'Jane Doe', company: 'Acme Co', line1: '1 Main St', line2: null, locality: 'Springfield, IL 62701' },
  isCurrent: true,
});
const office = buildOptionWith({
  summary: { name: 'Jane Doe', company: null, line1: '2 Oak Ave', line2: 'Suite 4', locality: 'Springfield, IL 62702' },
});

it('preselects the current address and saves only once another one is chosen', async () => {
  const onConfirm = vi.fn();
  const { user } = renderOpen((isOpen) => (
    <ChangeAddressDialog
      options={[home, office]}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  expect(
    screen.getByRole('radio', { name: 'Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701' }),
  ).toBeChecked();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

  await user.click(
    screen.getByRole('radio', { name: 'Jane Doe, 2 Oak Ave, Suite 4, Springfield, IL 62702' }),
  );
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(onConfirm).toHaveBeenCalledWith(office.publicId);
});

it('points at the hosted manager for a new address, in the top window', () => {
  renderOpen((isOpen) => (
    <ChangeAddressDialog
      options={[home]}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('dialog')).toHaveTextContent(
    'To add a new address, use the subscription manager.',
  );
  const link = screen.getByRole('link', { name: 'subscription manager' });
  expect(link).toHaveAttribute('href', `${BigCommerceStorefrontAPIBaseURL}/subscriptions`);
  expect(link).toHaveAttribute('target', '_top');
});

it('returns to the current address when reopened', async () => {
  const dialog = (isOpen: boolean) => (
    <ChangeAddressDialog
      options={[home, office]}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  );
  const { user, result } = renderOpen(dialog);

  await user.click(
    screen.getByRole('radio', { name: 'Jane Doe, 2 Oak Ave, Suite 4, Springfield, IL 62702' }),
  );
  result.rerender(dialog(false));
  result.rerender(dialog(true));

  expect(
    screen.getByRole('radio', { name: 'Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701' }),
  ).toBeChecked();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

it('disables Save while the write is pending', () => {
  renderOpen((isOpen) => (
    <ChangeAddressDialog
      options={[home, office]}
      isOpen={isOpen}
      isPending
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});
```

- [ ] **Step 4: Run the three files to verify they fail**

Run: `yarn vitest run src/pages/ManageSubscriptions/components/actions/CancelDialog.test.tsx src/pages/ManageSubscriptions/components/actions/ReactivateDialog.test.tsx src/pages/ManageSubscriptions/components/actions/ChangeAddressDialog.test.tsx`
Expected: each file fails to import its component ("Failed to resolve import").

- [ ] **Step 5: Implement `CancelDialog.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Button, FormControlLabel, Radio, RadioGroup, TextField, Typography } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';

import {
  CANCEL_REASONS,
  cancelReasonBody,
  CancelReasonSelection,
  OTHER_REASON_CODE,
  SubscriptionCard,
} from '../../viewModel';

interface CancelDialogProps {
  card: SubscriptionCard;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  /** closes this dialog and opens Skip; offered only while an order is scheduled */
  onSkipInstead: () => void;
  /** receives the `cancel_reason` body (spec §4.5) */
  onConfirm: (cancelReason: string) => void;
}

const OTHER = String(OTHER_REASON_CODE);

function CancelDialog({
  card,
  isOpen,
  isPending,
  onClose,
  onSkipInstead,
  onConfirm,
}: CancelDialogProps) {
  const b3Lang = useB3Lang();
  // A reason code as a string, OTHER, or '' — nothing chosen, the manager's no-survey default.
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');

  // Every opening starts clean, whatever the customer picked last time.
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setDetails('');
    }
  }, [isOpen]);

  const selection = (): CancelReasonSelection | null => {
    if (!reason) {
      return null;
    }
    if (reason === OTHER) {
      return { code: OTHER_REASON_CODE, details };
    }

    return { code: Number(reason) };
  };

  return (
    <B3Dialog
      isOpen={isOpen}
      title={b3Lang('subscriptions.actions.cancel.title')}
      leftSizeBtn={b3Lang('subscriptions.actions.cancel.keep')}
      rightSizeBtn={b3Lang('subscriptions.actions.cancel.confirm')}
      rightStyleBtn={{ color: 'error.main' }}
      loading={isPending}
      handleLeftClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
      handRightClick={() => onConfirm(cancelReasonBody(selection()))}
    >
      {/* The manager's whole retention flow for SSW is this one nudge (spec §6.2). */}
      {card.nextOrder && (
        <Typography sx={{ mb: 2 }}>
          {b3Lang('subscriptions.actions.cancel.skipInstead')}{' '}
          <Button
            variant="text"
            size="small"
            onClick={onSkipInstead}
            sx={{ px: 0, verticalAlign: 'baseline' }}
          >
            {b3Lang('subscriptions.actions.cancel.skipInsteadLink')}
          </Button>
        </Typography>
      )}
      <Typography>{b3Lang('subscriptions.actions.cancel.reasonsTitle')}</Typography>
      <RadioGroup value={reason} onChange={(event) => setReason(event.target.value)}>
        {CANCEL_REASONS.map(({ code }) => (
          <FormControlLabel
            key={code}
            value={String(code)}
            control={<Radio />}
            label={b3Lang(`subscriptions.actions.cancel.reason.${code}`)}
          />
        ))}
        <FormControlLabel
          value={OTHER}
          control={<Radio />}
          label={b3Lang('subscriptions.actions.cancel.reason.other')}
        />
      </RadioGroup>
      {reason === OTHER && (
        <TextField
          id="subscription-cancel-details"
          size="small"
          fullWidth
          label={b3Lang('subscriptions.actions.cancel.otherPlaceholder')}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          sx={{ mt: 1 }}
        />
      )}
    </B3Dialog>
  );
}

export default CancelDialog;
```

- [ ] **Step 6: Implement `ReactivateDialog.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { MenuItem, TextField, Typography } from '@mui/material';
import dayjs from 'dayjs';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';
import { ReactivationInput } from '@/shared/service/ordergroove';

import { describeFrequency } from '../../format';
import { frequencyKey, frequencyOptions, SubscriptionCard } from '../../viewModel';

interface ReactivateDialogProps {
  card: SubscriptionCard;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (input: ReactivationInput) => void;
}

// Task 0 finding H: Ordergroove accepted tomorrow as the first order date.
const FIRST_ORDER_MIN_DAYS = 1;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function ReactivateDialog({ card, isOpen, isPending, onClose, onConfirm }: ReactivateDialogProps) {
  const b3Lang = useB3Lang();
  const options = frequencyOptions(card.every, card.everyPeriod);
  // Always on the list: frequencyOptions appends a schedule SSW does not offer.
  const currentKey = frequencyKey({ every: card.every, period: card.everyPeriod });
  const earliest = dayjs().add(FIRST_ORDER_MIN_DAYS, 'day').format('YYYY-MM-DD');
  const [frequency, setFrequency] = useState(currentKey);
  const [date, setDate] = useState(earliest);

  // Every opening starts from the old schedule and the earliest allowed date.
  useEffect(() => {
    if (isOpen) {
      setFrequency(currentKey);
      setDate(earliest);
    }
  }, [isOpen, currentKey, earliest]);

  const product =
    card.product?.name ??
    b3Lang('subscriptions.card.unnamedProduct', { id: card.externalProductId });
  const dateIsValid =
    ISO_DATE.test(date) && dayjs(date).isValid() && !dayjs(date).isBefore(dayjs(earliest), 'day');
  const chosen = options.find((option) => frequencyKey(option) === frequency);

  return (
    <B3Dialog
      isOpen={isOpen}
      title={b3Lang('subscriptions.actions.reactivate.title')}
      rightSizeBtn={b3Lang('subscriptions.actions.reactivate.confirm')}
      loading={isPending}
      disabledSaveBtn={!dateIsValid || !chosen}
      handleLeftClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
      handRightClick={() => {
        if (chosen && dateIsValid) {
          onConfirm({
            startDate: dayjs().format('YYYY-MM-DD'),
            every: chosen.every,
            everyPeriod: chosen.period,
            nextOrderDate: date,
          });
        }
      }}
    >
      <Typography sx={{ mb: 2 }}>
        {b3Lang('subscriptions.actions.reactivate.body', { product })}
      </Typography>
      <TextField
        id="subscription-reactivate-frequency"
        select
        size="small"
        fullWidth
        label={b3Lang('subscriptions.actions.frequencyLabel')}
        value={frequency}
        onChange={(event) => setFrequency(event.target.value)}
        sx={{ mb: 2 }}
      >
        {options.map((option) => (
          <MenuItem key={frequencyKey(option)} value={frequencyKey(option)}>
            {describeFrequency(option.every, option.period, b3Lang)}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        id="subscription-reactivate-date"
        type="date"
        size="small"
        fullWidth
        label={b3Lang('subscriptions.actions.reactivate.dateLabel')}
        value={date}
        onChange={(event) => setDate(event.target.value)}
        error={!dateIsValid}
        helperText={dateIsValid ? ' ' : b3Lang('subscriptions.actions.reactivate.dateHint')}
        inputProps={{ min: earliest }}
        InputLabelProps={{ shrink: true }}
      />
    </B3Dialog>
  );
}

export default ReactivateDialog;
```

Set `FIRST_ORDER_MIN_DAYS` to the value Task 0 finding H recorded.

- [ ] **Step 7: Implement `ChangeAddressDialog.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { FormControlLabel, Link, Radio, RadioGroup, Typography } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';

import { describeAddress, HOSTED_MANAGER_URL } from '../../format';
import { AddressOption } from '../../viewModel';

interface ChangeAddressDialogProps {
  options: AddressOption[];
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  /** receives the Ordergroove address public_id */
  onConfirm: (addressId: string) => void;
}

// Stands in for the link inside the translated sentence so the words around it keep their order.
const LINK = '%LINK%';

function ChangeAddressDialog({
  options,
  isOpen,
  isPending,
  onClose,
  onConfirm,
}: ChangeAddressDialogProps) {
  const b3Lang = useB3Lang();
  const current = options.find((option) => option.isCurrent);
  const [choice, setChoice] = useState('');

  // Every opening starts from the address in use, whatever was picked last time.
  useEffect(() => {
    if (isOpen) {
      setChoice(current?.publicId ?? '');
    }
  }, [isOpen, current?.publicId]);

  const canSave = Boolean(choice) && choice !== current?.publicId;
  const [before, after] = b3Lang('subscriptions.actions.address.addNew', { link: LINK }).split(LINK);

  return (
    <B3Dialog
      isOpen={isOpen}
      title={b3Lang('subscriptions.actions.address.title')}
      rightSizeBtn={b3Lang('subscriptions.actions.address.confirm')}
      loading={isPending}
      disabledSaveBtn={!canSave}
      handleLeftClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
      handRightClick={() => {
        if (canSave) {
          onConfirm(choice);
        }
      }}
    >
      <RadioGroup value={choice} onChange={(event) => setChoice(event.target.value)}>
        {options.map((option) => (
          <FormControlLabel
            key={option.publicId}
            value={option.publicId}
            control={<Radio />}
            label={describeAddress(option.summary)}
          />
        ))}
      </RadioGroup>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {before}
        {/* The hosted manager is a theme page outside the SPA: open it in the top window, not in the ThemeFrame. */}
        <Link href={HOSTED_MANAGER_URL} target="_top">
          {b3Lang('subscriptions.actions.address.addNewLink')}
        </Link>
        {after}
      </Typography>
    </B3Dialog>
  );
}

export default ChangeAddressDialog;
```

- [ ] **Step 8: Run the three files to verify they pass**

Run: `yarn vitest run src/pages/ManageSubscriptions/components/actions && yarn tsc --noEmit && yarn eslint src/pages/ManageSubscriptions/components/actions --max-warnings 0`
Expected: all green; `tsc` exit 0; eslint clean (run `yarn eslint --fix` on the three new files for prettier reflow if needed).

- [ ] **Step 9: Commit**

```bash
git add src/pages/ManageSubscriptions/components/actions/CancelDialog.tsx src/pages/ManageSubscriptions/components/actions/CancelDialog.test.tsx src/pages/ManageSubscriptions/components/actions/ReactivateDialog.tsx src/pages/ManageSubscriptions/components/actions/ReactivateDialog.test.tsx src/pages/ManageSubscriptions/components/actions/ChangeAddressDialog.tsx src/pages/ManageSubscriptions/components/actions/ChangeAddressDialog.test.tsx
git commit -m "feat: B2B-0000 Add the cancel, reactivate and change-address dialogs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Inline quantity and frequency selects, and the card's new slots

**Files:**
- Create: `apps/storefront/src/pages/ManageSubscriptions/components/actions/QuantityFrequencySelects.tsx`
- Modify: `apps/storefront/src/pages/ManageSubscriptions/components/SubscriptionCard.tsx`
- Test: `components/actions/QuantityFrequencySelects.test.tsx` (new), `components/SubscriptionCard.test.tsx`

**Interfaces:**
- Consumes: `frequencyOptions`, `frequencyKey`, `quantityOptions`, `FrequencyOption`, `SubscriptionCard` (Task 2); `describeFrequency` (Task 2); `useMobile` from `@/hooks/useMobile`.
- Produces:
  - `QuantityFrequencySelects({ card: SubscriptionCard; disabled: boolean; quantityPending: boolean; frequencyPending: boolean; onChangeQuantity: (quantity: number) => void; onChangeFrequency: (option: FrequencyOption) => void })` — default export. Both selects always show the card's current value; `disabled` holds both; the pending flag swaps that select's arrow for a 16 px `CircularProgress`.
  - `SubscriptionCard` gains `scheduleControls?: ReactNode` (replaces the "Qty 2 · every 4 weeks" line when given) and `shippingAction?: ReactNode` (rendered after the address, separated by " · ").

- [ ] **Step 1: Write the failing selects tests** — `QuantityFrequencySelects.test.tsx`:

```tsx
import { builder, faker, renderWithProviders, screen } from 'tests/test-utils';

import { SubscriptionCard as SubscriptionCardModel } from '../../viewModel';

import QuantityFrequencySelects from './QuantityFrequencySelects';

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  externalProductId: '9537_12118',
  product: { name: faker.commerce.productName(), imageUrl: null, detailUrl: null, sku: null },
  quantity: 2,
  every: 4,
  everyPeriod: 2,
  nextOrderDate: '2026-10-03',
  nextOrder: { orderId: faker.string.hexadecimal({ length: 32, prefix: '' }), otherProducts: [] },
  shippingAddress: null,
  shippingAddressId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  payment: null,
  paymentId: 'pay-a',
  billingAddressId: 'addr-1',
  cancelledOn: null,
}));

type SelectsProps = Parameters<typeof QuantityFrequencySelects>[0];

// Explicit props with defaults, not a JSX spread: CLAUDE.md forbids new jsx-props-no-spreading violations.
const renderSelects = ({
  card = buildCardWith('WHATEVER_VALUES'),
  disabled = false,
  quantityPending = false,
  frequencyPending = false,
  onChangeQuantity = vi.fn(),
  onChangeFrequency = vi.fn(),
}: Partial<SelectsProps> = {}) =>
  renderWithProviders(
    <QuantityFrequencySelects
      card={card}
      disabled={disabled}
      quantityPending={quantityPending}
      frequencyPending={frequencyPending}
      onChangeQuantity={onChangeQuantity}
      onChangeFrequency={onChangeFrequency}
    />,
  );

// MUI names a select's combobox from its label and its shown value: "Quantity 2".
const quantity = () => screen.getByRole('combobox', { name: /^Quantity/ });
const frequency = () => screen.getByRole('combobox', { name: /^Frequency/ });

it("shows the card's quantity and schedule and saves a new quantity as soon as it is picked", async () => {
  const onChangeQuantity = vi.fn();
  const { user } = renderSelects({ onChangeQuantity });

  expect(quantity()).toHaveTextContent('2');
  expect(frequency()).toHaveTextContent('every 4 weeks');

  await user.click(quantity());
  expect(screen.getAllByRole('option')).toHaveLength(20);
  await user.click(screen.getByRole('option', { name: '3' }));

  expect(onChangeQuantity).toHaveBeenCalledWith(3);
});

it('saves a new frequency as the option the customer picked', async () => {
  const onChangeFrequency = vi.fn();
  const { user } = renderSelects({ onChangeFrequency });

  await user.click(frequency());
  await user.click(screen.getByRole('option', { name: 'every 6 weeks' }));

  expect(onChangeFrequency).toHaveBeenCalledWith({ every: 6, period: 2 });
});

it('offers a quantity above 20 and a schedule SSW does not sell, both selected', async () => {
  const { user } = renderSelects({ card: buildCardWith({ quantity: 32, every: 10, everyPeriod: 3 }) });

  expect(quantity()).toHaveTextContent('32');
  expect(frequency()).toHaveTextContent('every 10 months');

  await user.click(quantity());
  const quantities = screen.getAllByRole('option');
  expect(quantities).toHaveLength(21);
  expect(quantities[20]).toHaveTextContent('32');
  expect(screen.getByRole('option', { name: '32' })).toHaveAttribute('aria-selected', 'true');
});

it('holds both selects while the row is busy and marks the one that is saving', () => {
  renderSelects({ disabled: true, quantityPending: true });

  expect(quantity()).toHaveAttribute('aria-disabled', 'true');
  expect(frequency()).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getAllByRole('progressbar')).toHaveLength(1);
});

it('stretches both selects to full width on a phone', () => {
  // The repo's mobile-test convention: useMobile() treats a body narrower than 769px as a phone.
  vi.spyOn(document.body, 'clientWidth', 'get').mockReturnValue(500);

  renderSelects();

  expect(quantity().closest('.MuiFormControl-root')).toHaveClass('MuiFormControl-fullWidth');
  expect(frequency().closest('.MuiFormControl-root')).toHaveClass('MuiFormControl-fullWidth');
});
```

- [ ] **Step 2: Write the failing card slot test** — append to `components/SubscriptionCard.test.tsx`:

```tsx
it('renders the schedule controls in place of the quantity line and the shipping action after the address', () => {
  renderWithProviders(
    <SubscriptionCard
      card={buildCardWith({ quantity: 2 })}
      variant="active"
      loading={settled}
      scheduleControls={<div>schedule controls</div>}
      shippingAction={<button type="button">Change</button>}
    />,
    withDateFormat,
  );

  expect(screen.getByText('schedule controls')).toBeInTheDocument();
  expect(screen.queryByText(/^Qty 2/)).not.toBeInTheDocument();
  expect(screen.getByText(/Ships to/)).toHaveTextContent(
    'Ships to Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701 · Change',
  );
});
```

- [ ] **Step 3: Run both files to verify they fail**

Run: `yarn vitest run src/pages/ManageSubscriptions/components/actions/QuantityFrequencySelects.test.tsx src/pages/ManageSubscriptions/components/SubscriptionCard.test.tsx`
Expected: the selects file fails to import; the slot test fails on `schedule controls` not found (and `tsc` would reject the unknown props).

- [ ] **Step 4: Implement `QuantityFrequencySelects.tsx`**

```tsx
import { Box, CircularProgress, MenuItem, TextField } from '@mui/material';

import { useMobile } from '@/hooks/useMobile';
import { useB3Lang } from '@/lib/lang';

import { describeFrequency } from '../../format';
import {
  FrequencyOption,
  frequencyKey,
  frequencyOptions,
  quantityOptions,
  SubscriptionCard,
} from '../../viewModel';

interface QuantityFrequencySelectsProps {
  card: SubscriptionCard;
  /** every control of the row is held while any of its writes is in flight */
  disabled: boolean;
  quantityPending: boolean;
  frequencyPending: boolean;
  onChangeQuantity: (quantity: number) => void;
  onChangeFrequency: (option: FrequencyOption) => void;
}

// Takes the dropdown arrow's place while the write is in flight. The value stays the card's until
// the refetch lands, so a failed save visibly snaps back (spec §6.3).
function Saving() {
  return (
    <CircularProgress size={16} sx={{ position: 'absolute', right: 12, pointerEvents: 'none' }} />
  );
}

function QuantityFrequencySelects({
  card,
  disabled,
  quantityPending,
  frequencyPending,
  onChangeQuantity,
  onChangeFrequency,
}: QuantityFrequencySelectsProps) {
  const b3Lang = useB3Lang();
  const [isMobile] = useMobile();
  const frequencies = frequencyOptions(card.every, card.everyPeriod);

  return (
    <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 1, my: 0.5 }}>
      <TextField
        id={`subscription-quantity-${card.publicId}`}
        select
        size="small"
        fullWidth={isMobile}
        label={b3Lang('subscriptions.actions.quantityLabel')}
        value={card.quantity}
        disabled={disabled}
        onChange={(event) => onChangeQuantity(Number(event.target.value))}
        SelectProps={quantityPending ? { IconComponent: Saving } : undefined}
        sx={{ minWidth: '6rem' }}
      >
        {quantityOptions(card.quantity).map((quantity) => (
          <MenuItem key={quantity} value={quantity}>
            {quantity}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        id={`subscription-frequency-${card.publicId}`}
        select
        size="small"
        fullWidth={isMobile}
        label={b3Lang('subscriptions.actions.frequencyLabel')}
        value={frequencyKey({ every: card.every, period: card.everyPeriod })}
        disabled={disabled}
        onChange={(event) => {
          const option = frequencies.find((candidate) => frequencyKey(candidate) === event.target.value);
          if (option) {
            onChangeFrequency(option);
          }
        }}
        SelectProps={frequencyPending ? { IconComponent: Saving } : undefined}
        sx={{ minWidth: '11rem' }}
      >
        {frequencies.map((option) => (
          <MenuItem key={frequencyKey(option)} value={frequencyKey(option)}>
            {describeFrequency(option.every, option.period, b3Lang)}
          </MenuItem>
        ))}
      </TextField>
    </Box>
  );
}

export default QuantityFrequencySelects;
```

- [ ] **Step 5: Add the slots to `SubscriptionCard.tsx`** — extend the props:

```tsx
interface SubscriptionCardProps {
  card: SubscriptionCardModel;
  variant: 'active' | 'cancelled';
  loading: CellLoading;
  /** the inline quantity and frequency controls (3b); replaces the "Qty · every" line when given */
  scheduleControls?: ReactNode;
  /** rendered after the shipping address, e.g. the Change control (3b) */
  shippingAction?: ReactNode;
  /** the actions row (Phase 3); rendered at the end of the details group */
  actions?: ReactNode;
}

function SubscriptionCard({
  card,
  variant,
  loading,
  scheduleControls,
  shippingAction,
  actions,
}: SubscriptionCardProps) {
```

and replace the quantity line and the shipping paragraph with:

```tsx
          {scheduleControls ?? (
            <Typography variant="body2">
              {b3Lang('subscriptions.card.quantity', { count: card.quantity })} · {frequency}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            {b3Lang('subscriptions.card.shipsTo')}{' '}
            {cell(loading.shipping, shipping, b3Lang('subscriptions.card.unavailable'))}
            {shippingAction && (
              <>
                {' · '}
                {shippingAction}
              </>
            )}
          </Typography>
```

- [ ] **Step 6: Run to verify they pass**

Run: `yarn vitest run src/pages/ManageSubscriptions/components && yarn tsc --noEmit && yarn eslint src/pages/ManageSubscriptions/components --max-warnings 0`
Expected: all green; `tsc` exit 0; eslint clean.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ManageSubscriptions/components/actions/QuantityFrequencySelects.tsx src/pages/ManageSubscriptions/components/actions/QuantityFrequencySelects.test.tsx src/pages/ManageSubscriptions/components/SubscriptionCard.tsx src/pages/ManageSubscriptions/components/SubscriptionCard.test.tsx
git commit -m "feat: B2B-0000 Add inline quantity and frequency selects and the card slots they fill

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: One owner per active card — `ActiveSubscriptionCard`, the presentational row, the page

**Files:**
- Create: `apps/storefront/src/pages/ManageSubscriptions/components/actions/ActiveSubscriptionCard.tsx`
- Modify: `apps/storefront/src/pages/ManageSubscriptions/components/actions/SubscriptionActions.tsx` (becomes presentational)
- Modify: `apps/storefront/src/pages/ManageSubscriptions/SubscriptionsManager.tsx:9-14,78-86`
- Test: `components/actions/ActiveSubscriptionCard.test.tsx` (new), `components/actions/SubscriptionActions.test.tsx` (rewritten), `SubscriptionsManager.test.tsx`, `SubscriptionsManager.mobile.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–5; `ChangeCardDialog`, `SkipDialog`, `SendNowDialog`, `ChangeDateDialog` (3a/Phase 4); `buildCardOptions`, `listStoredInstruments`, `listPayments` (Phase 4).
- Produces:
  - `export type SubscriptionDialog = 'skip' | 'sendNow' | 'changeDate' | 'changeCard' | 'cancel' | 'address'` (from `SubscriptionActions.tsx`).
  - `SubscriptionActions({ hasUpcomingOrder: boolean; disabled: boolean; onOpen: (dialog: SubscriptionDialog) => void })` — default export; no hook, no dialogs, no queries.
  - `ActiveSubscriptionCard({ card: SubscriptionCard; loading: CellLoading; customerId: number; addresses: OgAddress[] | undefined })` — default export; the only place that calls `useSubscriptionActions` for an active card.
- Why the inversion: 3a's `SubscriptionActions` owned the hook and the dialogs and was rendered into the card's `actions` slot. 3b puts controls in three slots of one card (schedule line, address line, actions row) that must share one pending state and one open dialog, and the Cancel dialog must be able to open the Skip dialog. One owner above the card is the only shape that does that without lifting the hook into the page (which would make every card's spinner shared). Task 8 records this against spec §2.3.

- [ ] **Step 1: Rewrite the row test** — replace `SubscriptionActions.test.tsx` with:

```tsx
import { renderWithProviders, screen } from 'tests/test-utils';

import SubscriptionActions from './SubscriptionActions';

it('offers the order actions only while an order is scheduled, and always Change card and Cancel', () => {
  const { result } = renderWithProviders(
    <SubscriptionActions hasUpcomingOrder disabled={false} onOpen={vi.fn()} />,
  );

  expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
    'Skip',
    'Send now',
    'Change date',
    'Change card',
    'Cancel subscription',
  ]);

  result.rerender(<SubscriptionActions hasUpcomingOrder={false} disabled={false} onOpen={vi.fn()} />);

  expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
    'Change card',
    'Cancel subscription',
  ]);
});

it('tells its owner which dialog to open', async () => {
  const onOpen = vi.fn();
  const { user } = renderWithProviders(
    <SubscriptionActions hasUpcomingOrder disabled={false} onOpen={onOpen} />,
  );

  await user.click(screen.getByRole('button', { name: 'Skip' }));
  await user.click(screen.getByRole('button', { name: 'Send now' }));
  await user.click(screen.getByRole('button', { name: 'Change date' }));
  await user.click(screen.getByRole('button', { name: 'Change card' }));
  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));

  expect(onOpen.mock.calls.map(([dialog]) => dialog)).toEqual([
    'skip',
    'sendNow',
    'changeDate',
    'changeCard',
    'cancel',
  ]);
});

it('holds every button while a write is in flight', () => {
  renderWithProviders(<SubscriptionActions hasUpcomingOrder disabled onOpen={vi.fn()} />);

  screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
});
```

- [ ] **Step 2: Write the failing owner tests** — `ActiveSubscriptionCard.test.tsx` (the 3a integration cases move here from the old row test, plus the 3b ones):

```tsx
import {
  builder,
  buildOgAddressWith,
  buildStoreInfoStateWith,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
  waitFor,
  within,
} from 'tests/test-utils';

import { OgAddress } from '@/shared/service/ordergroove';

import { SubscriptionCard as SubscriptionCardModel } from '../../viewModel';

import ActiveSubscriptionCard from './ActiveSubscriptionCard';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const homeId = faker.string.hexadecimal({ length: 32, prefix: '' });

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: 's-1',
  externalProductId: '9537_12118',
  product: { name: 'Kraft Paper Shopping Bags', imageUrl: null, detailUrl: null, sku: null },
  quantity: 2,
  every: 4,
  everyPeriod: 2,
  nextOrderDate: '2026-10-03',
  nextOrder: { orderId: 'o-1', otherProducts: [] },
  shippingAddress: {
    name: 'Jane Doe',
    company: 'Acme Co',
    line1: '1 Main St',
    line2: null,
    locality: 'Springfield, IL 62701',
  },
  shippingAddressId: homeId,
  payment: null,
  paymentId: 'pay-a',
  billingAddressId: 'addr-1',
  cancelledOn: null,
}));

const settled = { product: false, shipping: false, payment: false, nextOrder: false };
const home = buildOgAddressWith({
  public_id: homeId,
  first_name: 'Jane',
  last_name: 'Doe',
  company_name: 'Acme Co',
  address: '1 Main St',
  address2: null,
  city: 'Springfield',
  state_province_code: 'IL',
  zip_postal_code: '62701',
});
const office = buildOgAddressWith({
  first_name: 'Jane',
  last_name: 'Doe',
  company_name: null,
  address: '2 Oak Ave',
  address2: null,
  city: 'Springfield',
  state_province_code: 'IL',
  zip_postal_code: '62702',
});

const renderCard = (card: SubscriptionCardModel, addresses: OgAddress[] | undefined = [home, office]) =>
  renderWithProviders(
    <ActiveSubscriptionCard card={card} loading={settled} customerId={80591} addresses={addresses} />,
    {
      preloadedState: { storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } }) },
    },
  );

beforeEach(() => {
  window.BC_CONTEXT = {
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint,
      appClientId: 'ssw-app-client-id',
    },
  };
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')),
    http.post(authEndpoint, () =>
      HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 }),
    ),
    http.get(`${ogBase}/payments/`, () =>
      HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
    ),
  );
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

// One dialog per case: opening and closing MUI dialogs costs real time, and a case that cycles
// through all of them crosses the 5 s per-test limit whenever the suite runs under load.
it.each([
  ['Skip', 'Skip next order'],
  ['Send now', 'Send order now'],
  ['Change date', 'Change next order date'],
  ['Change card', 'Change card'],
  ['Cancel subscription', 'Cancel subscription'],
  ['Change', 'Change shipping address'],
])('opens only the %s dialog', async (button, title) => {
  const { user } = renderCard(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('button', { name: button }));

  expect(screen.getByRole('dialog')).toHaveTextContent(title);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

it('hides the three order actions, and nothing else, when no order is scheduled', () => {
  renderCard(buildCardWith({ nextOrder: null, nextOrderDate: null }));

  expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Send now' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Change date' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Change card' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel subscription' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /^Quantity/ })).toBeInTheDocument();
});

it('offers no address change until the addresses have loaded', () => {
  const { result } = renderCard(buildCardWith('WHATEVER_VALUES'), undefined);

  expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();

  result.rerender(
    <ActiveSubscriptionCard
      card={buildCardWith('WHATEVER_VALUES')}
      loading={settled}
      customerId={80591}
      addresses={[home, office]}
    />,
  );

  expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
});

it('offers the deduplicated addresses with the current one preselected', async () => {
  const { user } = renderCard(buildCardWith('WHATEVER_VALUES'), [
    home,
    office,
    buildOgAddressWith({ ...office, public_id: faker.string.hexadecimal({ length: 32, prefix: '' }) }),
  ]);

  await user.click(screen.getByRole('button', { name: 'Change' }));

  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getAllByRole('radio')).toHaveLength(2);
  expect(
    dialog.getByRole('radio', { name: 'Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701' }),
  ).toBeChecked();
});

it('moves from the cancel dialog to the skip dialog', async () => {
  const { user } = renderCard(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Skip next order' }));

  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Skip next order'));
  expect(screen.getByRole('dialog')).not.toHaveTextContent('Tell us why');
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

it('saves a quantity straight from the select and holds every control meanwhile', async () => {
  let release: () => void = () => {};
  const received = vi.fn();
  server.use(
    http.patch(`${ogBase}/subscriptions/s-1/change_quantity/`, async ({ request }) => {
      received(await request.json());
      await new Promise<void>((resolve) => {
        release = resolve;
      });

      return HttpResponse.json({});
    }),
  );
  const { user } = renderCard(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('combobox', { name: /^Quantity/ }));
  await user.click(screen.getByRole('option', { name: '3' }));

  await waitFor(() => expect(received).toHaveBeenCalledWith({ quantity: 3 }));
  expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel subscription' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: /^Frequency/ })).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('progressbar')).toBeInTheDocument();

  release();

  await waitFor(() => expect(screen.getByRole('button', { name: 'Skip' })).toBeEnabled());
  // The select never moved on its own: the card still says 2 until the refetched card says otherwise.
  expect(screen.getByRole('combobox', { name: /^Quantity/ })).toHaveTextContent('2');
});

it('keeps a dialog open after a failed write so the customer can retry or leave', async () => {
  server.use(
    http.patch(`${ogBase}/subscriptions/s-1/cancel/`, () => new HttpResponse(null, { status: 500 })),
  );
  const { user } = renderCard(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel subscription' }));

  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel subscription' }),
    ).toBeEnabled(),
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
```

- [ ] **Step 3: Write the failing page tests** — in `SubscriptionsManager.test.tsx`, extend the test `offers actions only on active cards with an upcoming order`: after the existing `unscheduledGroup` assertions add

```tsx
  expect(unscheduledGroup.getByRole('button', { name: 'Cancel subscription' })).toBeInTheDocument();
  expect(unscheduledGroup.getByRole('combobox', { name: /^Quantity/ })).toBeInTheDocument();
  // Addresses were mocked empty, so there is nothing to move to and no Change control.
  expect(unscheduledGroup.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
```

and append two end-to-end cases:

```tsx
it('changes the quantity from the card and shows the new value once Ordergroove has it', async () => {
  const subscription = buildOgSubscriptionWith({ product: '9537_12118', quantity: 2 });
  const received = vi.fn();
  let changed = false;
  mockResources({
    subscriptions: [subscription],
    products: { '9537_12118': buildOgProductWith({ name: 'Kraft Paper Shopping Bags' }) },
  });
  // Later handlers win in MSW: the list answers the new quantity once the write has landed.
  server.use(
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json(page([{ ...subscription, quantity: changed ? 3 : 2 }])),
    ),
    http.patch(`${ogBase}/subscriptions/${subscription.public_id}/change_quantity/`, async ({ request }) => {
      received(await request.json());
      changed = true;

      return HttpResponse.json({ ...subscription, quantity: 3 });
    }),
  );

  const { user } = renderPage();

  const group = await screen.findByRole('group', { name: 'Kraft Paper Shopping Bags' });
  expect(within(group).getByRole('combobox', { name: /^Quantity/ })).toHaveTextContent('2');
  await user.click(within(group).getByRole('combobox', { name: /^Quantity/ }));
  await user.click(screen.getByRole('option', { name: '3' }));

  await waitFor(() =>
    expect(within(group).getByRole('combobox', { name: /^Quantity/ })).toHaveTextContent('3'),
  );
  expect(received).toHaveBeenCalledWith({ quantity: 3 });
  expect(snackbar.success).toHaveBeenCalledWith('Quantity updated.');
});

it('cancels a subscription without a reason and moves it to the cancelled list', async () => {
  const subscription = buildOgSubscriptionWith({ product: '9537_12118' });
  const received = vi.fn();
  let cancelled = false;
  mockResources({
    subscriptions: [subscription],
    products: { '9537_12118': buildOgProductWith({ name: 'Kraft Paper Shopping Bags' }) },
  });
  server.use(
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json(
        page([
          cancelled
            ? { ...subscription, cancelled: '2026-10-01 10:00:00', live: false }
            : subscription,
        ]),
      ),
    ),
    http.patch(`${ogBase}/subscriptions/${subscription.public_id}/cancel/`, async ({ request }) => {
      received(await request.json());
      cancelled = true;

      return HttpResponse.json({ ...subscription, cancelled: '2026-10-01 10:00:00', live: false });
    }),
  );

  const { user } = renderPage();

  await screen.findByRole('group', { name: 'Kraft Paper Shopping Bags' });
  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel subscription' }),
  );

  expect(await screen.findByText("You don't have any active subscriptions.")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '1 cancelled subscription' })).toBeInTheDocument();
  expect(received).toHaveBeenCalledWith({
    cancel_reason: '114|Cancelled without exit survey response',
  });
  expect(snackbar.success).toHaveBeenCalledWith('Subscription cancelled.');
});
```

In `SubscriptionsManager.mobile.test.tsx`, append (the `beforeEach` already narrows the body):

```tsx
it('stretches the quantity and frequency selects to full width on a phone', async () => {
  const subscription = buildOgSubscriptionWith({ product: '9537_12118' });
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')),
    http.post(authEndpoint, () =>
      HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 }),
    ),
    http.get(`${ogBase}/subscriptions/`, () => HttpResponse.json(page([subscription]))),
    http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([]))),
    http.get(`${ogBase}/addresses/`, () => HttpResponse.json(page([]))),
    http.get(`${ogBase}/items/`, () => HttpResponse.json(page([]))),
    http.get(`${ogBase}/orders/`, () => HttpResponse.json(page([]))),
    http.get(`${ogBase}/products/9537_12118/`, () =>
      HttpResponse.json(buildOgProductWith({ name: 'Kraft Paper Shopping Bags' })),
    ),
  );

  renderWithProviders(<SubscriptionsManager />, {
    preloadedState: {
      company: buildCompanyStateWith({
        customer: { id: faker.number.int({ min: 1, max: 1_000_000 }) },
      }),
      storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } }),
    },
  });

  const group = await screen.findByRole('group', { name: 'Kraft Paper Shopping Bags' });
  const quantity = within(group).getByRole('combobox', { name: /^Quantity/ });
  const frequency = within(group).getByRole('combobox', { name: /^Frequency/ });

  expect(quantity.closest('.MuiFormControl-root')).toHaveClass('MuiFormControl-fullWidth');
  expect(frequency.closest('.MuiFormControl-root')).toHaveClass('MuiFormControl-fullWidth');
});
```

- [ ] **Step 4: Run the four files to verify they fail**

Run: `yarn vitest run src/pages/ManageSubscriptions/components/actions/SubscriptionActions.test.tsx src/pages/ManageSubscriptions/components/actions/ActiveSubscriptionCard.test.tsx src/pages/ManageSubscriptions/SubscriptionsManager.test.tsx src/pages/ManageSubscriptions/SubscriptionsManager.mobile.test.tsx`
Expected: the owner file fails to import; the row tests fail (the old row still takes `card`/`customerId`); the three page cases and the phone case fail on missing comboboxes/buttons.

- [ ] **Step 5: Make `SubscriptionActions.tsx` presentational** — replace the file with:

```tsx
import { Box, Button } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

export type SubscriptionDialog =
  | 'skip'
  | 'sendNow'
  | 'changeDate'
  | 'changeCard'
  | 'cancel'
  | 'address';

interface SubscriptionActionsProps {
  hasUpcomingOrder: boolean;
  /** every button is held while any of the card's writes is in flight */
  disabled: boolean;
  onOpen: (dialog: SubscriptionDialog) => void;
}

/**
 * The button row of one active card. Skip, Send now and Change date all need the upcoming order,
 * so they render only when one exists; Change card and Cancel do not (spec §6.4). The owner
 * (`ActiveSubscriptionCard`) holds the dialogs and the pending state.
 */
function SubscriptionActions({ hasUpcomingOrder, disabled, onOpen }: SubscriptionActionsProps) {
  const b3Lang = useB3Lang();

  const action = (dialog: SubscriptionDialog, labelKey: string) => (
    <Button size="small" variant="outlined" disabled={disabled} onClick={() => onOpen(dialog)}>
      {b3Lang(labelKey)}
    </Button>
  );

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1 }}>
      {hasUpcomingOrder && (
        <>
          {action('skip', 'subscriptions.actions.skip')}
          {action('sendNow', 'subscriptions.actions.sendNow')}
          {action('changeDate', 'subscriptions.actions.changeDate')}
        </>
      )}
      {action('changeCard', 'subscriptions.actions.changeCard')}
      {/* Text style, right-aligned on desktop, wrapping under the others on phones (spec §6.1). */}
      <Button
        size="small"
        variant="text"
        disabled={disabled}
        onClick={() => onOpen('cancel')}
        sx={{ ml: { xs: 0, md: 'auto' } }}
      >
        {b3Lang('subscriptions.actions.cancel')}
      </Button>
    </Box>
  );
}

export default SubscriptionActions;
```

- [ ] **Step 6: Implement `ActiveSubscriptionCard.tsx`**

```tsx
import { useState } from 'react';
import { Button } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import { listPayments, OgAddress } from '@/shared/service/ordergroove';
import { buildCardOptions } from '@/shared/service/ssw/cardOptions';
import { listStoredInstruments } from '@/shared/service/ssw/customerClient';

import { useSubscriptionActions } from '../../hooks/useSubscriptionActions';
import { buildAddressOptions, SubscriptionCard as SubscriptionCardModel } from '../../viewModel';
import SubscriptionCard, { CellLoading } from '../SubscriptionCard';

import CancelDialog from './CancelDialog';
import ChangeAddressDialog from './ChangeAddressDialog';
import ChangeCardDialog from './ChangeCardDialog';
import ChangeDateDialog from './ChangeDateDialog';
import QuantityFrequencySelects from './QuantityFrequencySelects';
import SendNowDialog from './SendNowDialog';
import SkipDialog from './SkipDialog';
import SubscriptionActions, { SubscriptionDialog } from './SubscriptionActions';

interface ActiveSubscriptionCardProps {
  card: SubscriptionCardModel;
  loading: CellLoading;
  customerId: number;
  /** the page's addresses lookup; undefined while pending or failed */
  addresses: OgAddress[] | undefined;
}

/**
 * One active card with every control wired. This is the only place that instantiates the actions
 * hook for the card, so pending state is per card and exactly one dialog is open at a time. The
 * dialogs stay mounted and toggle `isOpen`: B3Dialog only opens on a re-render after its container
 * ref exists.
 */
function ActiveSubscriptionCard({
  card,
  loading,
  customerId,
  addresses,
}: ActiveSubscriptionCardProps) {
  const b3Lang = useB3Lang();
  const [open, setOpen] = useState<SubscriptionDialog | null>(null);
  const {
    skip,
    sendNow,
    changeDate,
    changeCard,
    changeFrequency,
    changeQuantity,
    cancel,
    changeAddress,
  } = useSubscriptionActions(customerId);

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
  const addressOptions = buildAddressOptions(addresses, card.shippingAddressId);

  const subscriptionId = card.publicId;
  const upcoming = card.nextOrder;
  const isPending = [
    skip,
    sendNow,
    changeDate,
    changeCard,
    changeFrequency,
    changeQuantity,
    cancel,
    changeAddress,
  ].some((mutation) => mutation.isPending);
  const close = () => setOpen(null);

  return (
    <>
      <SubscriptionCard
        card={card}
        variant="active"
        loading={loading}
        scheduleControls={
          <QuantityFrequencySelects
            card={card}
            disabled={isPending}
            quantityPending={changeQuantity.isPending}
            frequencyPending={changeFrequency.isPending}
            onChangeQuantity={(quantity) => changeQuantity.mutate({ subscriptionId, quantity })}
            onChangeFrequency={({ every, period }) =>
              changeFrequency.mutate({ subscriptionId, every, everyPeriod: period })
            }
          />
        }
        shippingAction={
          // Nothing to move to while the addresses are unknown — no control rather than an empty dialog.
          addressOptions.length > 0 && (
            <Button
              variant="text"
              size="small"
              disabled={isPending}
              onClick={() => setOpen('address')}
              sx={{ p: 0, minWidth: 0, verticalAlign: 'baseline' }}
            >
              {b3Lang('subscriptions.actions.changeAddress')}
            </Button>
          )
        }
        actions={
          <SubscriptionActions
            hasUpcomingOrder={Boolean(upcoming)}
            disabled={isPending}
            onOpen={setOpen}
          />
        }
      />
      {/* The per-call onSuccess runs after the hook's refresh resolves, so the card is already current. */}
      {upcoming && (
        <>
          <SkipDialog
            card={card}
            isOpen={open === 'skip'}
            isPending={skip.isPending}
            onClose={close}
            onConfirm={() =>
              skip.mutate({ orderId: upcoming.orderId, subscriptionId }, { onSuccess: close })
            }
          />
          <SendNowDialog
            card={card}
            isOpen={open === 'sendNow'}
            isPending={sendNow.isPending}
            onClose={close}
            onConfirm={() => sendNow.mutate({ orderId: upcoming.orderId }, { onSuccess: close })}
          />
          <ChangeDateDialog
            card={card}
            isOpen={open === 'changeDate'}
            isPending={changeDate.isPending}
            onClose={close}
            onConfirm={(orderDate) =>
              changeDate.mutate({ subscriptionId, orderDate }, { onSuccess: close })
            }
          />
        </>
      )}
      <ChangeCardDialog
        options={cardOptions}
        isOpen={open === 'changeCard'}
        isPending={changeCard.isPending}
        onClose={close}
        onConfirm={(option) =>
          changeCard.mutate(
            { subscriptionId, option, billingAddress: card.billingAddressId },
            { onSuccess: close },
          )
        }
      />
      <CancelDialog
        card={card}
        isOpen={open === 'cancel'}
        isPending={cancel.isPending}
        onClose={close}
        onSkipInstead={() => setOpen('skip')}
        onConfirm={(cancelReason) =>
          cancel.mutate({ subscriptionId, cancelReason }, { onSuccess: close })
        }
      />
      <ChangeAddressDialog
        options={addressOptions}
        isOpen={open === 'address'}
        isPending={changeAddress.isPending}
        onClose={close}
        onConfirm={(addressId) =>
          changeAddress.mutate({ subscriptionId, addressId }, { onSuccess: close })
        }
      />
    </>
  );
}

export default ActiveSubscriptionCard;
```

- [ ] **Step 7: Wire the page** — in `SubscriptionsManager.tsx` replace the `SubscriptionActions` and `SubscriptionCard` imports with

```tsx
import ActiveSubscriptionCard from './components/actions/ActiveSubscriptionCard';
import CancelledSubscriptions from './components/CancelledSubscriptions';
import RecentOrders from './components/RecentOrders';
import { CellLoading } from './components/SubscriptionCard';
```

and the `active.map` with

```tsx
        {active.map((card) => (
          <ActiveSubscriptionCard
            key={card.publicId}
            card={card}
            loading={loading}
            customerId={customerId}
            addresses={addresses.data}
          />
        ))}
```

- [ ] **Step 8: Run to verify they pass**

Run: `yarn vitest run src/pages/ManageSubscriptions && yarn tsc --noEmit && yarn eslint src/pages/ManageSubscriptions --max-warnings 0`
Expected: every file green (the 3a `skips a subscription…` page case included); `tsc` exit 0; eslint clean. If `ActiveSubscriptionCard.test.tsx` trips the 5 s per-test limit under load, split the `it.each` further rather than raising the timeout.

- [ ] **Step 9: Commit**

```bash
git add src/pages/ManageSubscriptions/components/actions/ActiveSubscriptionCard.tsx src/pages/ManageSubscriptions/components/actions/ActiveSubscriptionCard.test.tsx src/pages/ManageSubscriptions/components/actions/SubscriptionActions.tsx src/pages/ManageSubscriptions/components/actions/SubscriptionActions.test.tsx src/pages/ManageSubscriptions/SubscriptionsManager.tsx src/pages/ManageSubscriptions/SubscriptionsManager.test.tsx src/pages/ManageSubscriptions/SubscriptionsManager.mobile.test.tsx
git commit -m "feat: B2B-0000 Wire quantity, frequency, address and cancel onto every active subscription card

One owner per card now holds the actions hook and the open dialog, so the
schedule selects, the address line and the button row share one pending
state, and the cancel dialog can hand off to skip.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Reactivate on cancelled cards

**Files:**
- Create: `apps/storefront/src/pages/ManageSubscriptions/components/actions/ReactivateAction.tsx`
- Modify: `apps/storefront/src/pages/ManageSubscriptions/components/CancelledSubscriptions.tsx`
- Modify: `apps/storefront/src/pages/ManageSubscriptions/SubscriptionsManager.tsx:87`
- Test: `components/actions/ReactivateAction.test.tsx` (new), `SubscriptionsManager.test.tsx`

**Interfaces:**
- Consumes: `ReactivateDialog` (Task 4); `useSubscriptionActions().reactivate` (Task 3); `SubscriptionCard`'s `actions` slot.
- Produces: `ReactivateAction({ card: SubscriptionCard; customerId: number })` — default export; `CancelledSubscriptions` gains `customerId: number`.

- [ ] **Step 1: Write the failing action test** — `ReactivateAction.test.tsx`:

```tsx
import dayjs from 'dayjs';
import {
  builder,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
  waitFor,
  within,
} from 'tests/test-utils';

import { SubscriptionCard as SubscriptionCardModel } from '../../viewModel';

import ReactivateAction from './ReactivateAction';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: 'c-1',
  externalProductId: '9537_12118',
  product: { name: 'Kraft Paper Shopping Bags', imageUrl: null, detailUrl: null, sku: null },
  quantity: 1,
  every: 4,
  everyPeriod: 2,
  nextOrderDate: null,
  nextOrder: null,
  shippingAddress: null,
  shippingAddressId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  payment: null,
  paymentId: 'pay-a',
  billingAddressId: 'addr-1',
  cancelledOn: '2026-08-01 10:00:00',
}));

beforeEach(() => {
  window.BC_CONTEXT = {
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint,
      appClientId: 'ssw-app-client-id',
    },
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

it('reactivates with the old schedule from tomorrow and closes once Ordergroove has it', async () => {
  const received = vi.fn();
  server.use(
    http.patch(`${ogBase}/subscriptions/c-1/reactivate/`, async ({ request }) => {
      received(await request.json());

      return HttpResponse.json({});
    }),
  );
  const { user } = renderWithProviders(
    <ReactivateAction card={buildCardWith('WHATEVER_VALUES')} customerId={80591} />,
  );

  await user.click(screen.getByRole('button', { name: 'Reactivate' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Reactivate subscription');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivate' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(received).toHaveBeenCalledWith({
    start_date: dayjs().format('YYYY-MM-DD'),
    every: 4,
    every_period: 2,
    next_order_date: dayjs().add(1, 'day').format('YYYY-MM-DD'),
  });
});

it('holds the button while the write is in flight', async () => {
  let release: () => void = () => {};
  server.use(
    http.patch(`${ogBase}/subscriptions/c-1/reactivate/`, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });

      return HttpResponse.json({});
    }),
  );
  const { user } = renderWithProviders(
    <ReactivateAction card={buildCardWith('WHATEVER_VALUES')} customerId={80591} />,
  );

  await user.click(screen.getByRole('button', { name: 'Reactivate' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivate' }));

  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivate' }),
    ).toBeDisabled(),
  );

  release();

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Reactivate' })).toBeEnabled();
});
```

If Task 0 finding H set `FIRST_ORDER_MIN_DAYS = 2`, the expected `next_order_date` is `dayjs().add(2, 'day')…`.

- [ ] **Step 2: Write the failing page tests** — in `SubscriptionsManager.test.tsx`, in `offers actions only on active cards with an upcoming order`, replace the final cancelled-card assertion

```tsx
  expect(
    within(screen.getByRole('group', { name: 'Cancelled one' })).queryByRole('button'),
  ).not.toBeInTheDocument();
```

with

```tsx
  const cancelledGroup = within(screen.getByRole('group', { name: 'Cancelled one' }));
  expect(cancelledGroup.getAllByRole('button').map((button) => button.textContent)).toEqual([
    'Reactivate',
  ]);
  expect(cancelledGroup.queryByRole('combobox')).not.toBeInTheDocument();
```

and append:

```tsx
it('reactivates a cancelled subscription and lists it among the active ones', async () => {
  const subscription = buildOgSubscriptionWith({
    product: '9537_12118',
    cancelled: '2026-08-01 10:00:00',
    live: false,
  });
  const received = vi.fn();
  let reactivated = false;
  mockResources({
    subscriptions: [subscription],
    products: { '9537_12118': buildOgProductWith({ name: 'Kraft Paper Shopping Bags' }) },
  });
  server.use(
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json(
        page([reactivated ? { ...subscription, cancelled: null, live: true } : subscription]),
      ),
    ),
    http.patch(`${ogBase}/subscriptions/${subscription.public_id}/reactivate/`, async ({ request }) => {
      received(await request.json());
      reactivated = true;

      return HttpResponse.json({ ...subscription, cancelled: null, live: true });
    }),
  );

  const { user } = renderPage();

  await user.click(await screen.findByRole('button', { name: '1 cancelled subscription' }));
  const group = await screen.findByRole('group', { name: 'Kraft Paper Shopping Bags' });
  await user.click(within(group).getByRole('button', { name: 'Reactivate' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivate' }));

  await waitFor(() =>
    expect(screen.queryByRole('button', { name: '1 cancelled subscription' })).not.toBeInTheDocument(),
  );
  expect(
    within(screen.getByRole('group', { name: 'Kraft Paper Shopping Bags' })).getByRole('button', {
      name: 'Cancel subscription',
    }),
  ).toBeInTheDocument();
  expect(received).toHaveBeenCalledWith(
    expect.objectContaining({ every: subscription.every, every_period: subscription.every_period }),
  );
  expect(snackbar.success).toHaveBeenCalledWith('Subscription reactivated.');
});
```

- [ ] **Step 3: Run both files to verify they fail**

Run: `yarn vitest run src/pages/ManageSubscriptions/components/actions/ReactivateAction.test.tsx src/pages/ManageSubscriptions/SubscriptionsManager.test.tsx`
Expected: the action file fails to import; the two page cases fail on a missing `Reactivate` button.

- [ ] **Step 4: Implement `ReactivateAction.tsx`**

```tsx
import { useState } from 'react';
import { Button } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { useSubscriptionActions } from '../../hooks/useSubscriptionActions';
import { SubscriptionCard } from '../../viewModel';

import ReactivateDialog from './ReactivateDialog';

interface ReactivateActionProps {
  card: SubscriptionCard;
  customerId: number;
}

/** The one control of a cancelled card: its button and dialog, with their own mutation instance. */
function ReactivateAction({ card, customerId }: ReactivateActionProps) {
  const b3Lang = useB3Lang();
  const [isOpen, setIsOpen] = useState(false);
  const { reactivate } = useSubscriptionActions(customerId);
  const close = () => setIsOpen(false);

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        disabled={reactivate.isPending}
        onClick={() => setIsOpen(true)}
        sx={{ mt: 1, alignSelf: 'flex-start' }}
      >
        {b3Lang('subscriptions.actions.reactivate')}
      </Button>
      <ReactivateDialog
        card={card}
        isOpen={isOpen}
        isPending={reactivate.isPending}
        onClose={close}
        onConfirm={(input) =>
          reactivate.mutate({ subscriptionId: card.publicId, ...input }, { onSuccess: close })
        }
      />
    </>
  );
}

export default ReactivateAction;
```

- [ ] **Step 5: Give cancelled cards the action** — in `CancelledSubscriptions.tsx`:

```tsx
import ReactivateAction from './actions/ReactivateAction';
import SubscriptionCard, { CellLoading } from './SubscriptionCard';

interface CancelledSubscriptionsProps {
  cards: SubscriptionCardModel[];
  loading: CellLoading;
  customerId: number;
}

function CancelledSubscriptions({ cards, loading, customerId }: CancelledSubscriptionsProps) {
```

and

```tsx
            <SubscriptionCard
              key={card.publicId}
              card={card}
              variant="cancelled"
              loading={loading}
              actions={<ReactivateAction card={card} customerId={customerId} />}
            />
```

In `SubscriptionsManager.tsx`: `<CancelledSubscriptions cards={cancelled} loading={loading} customerId={customerId} />`.

- [ ] **Step 6: Run to verify they pass**

Run: `yarn vitest run src/pages/ManageSubscriptions && yarn tsc --noEmit && yarn eslint src/pages/ManageSubscriptions --max-warnings 0`
Expected: all green; `tsc` exit 0; eslint clean.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ManageSubscriptions/components/actions/ReactivateAction.tsx src/pages/ManageSubscriptions/components/actions/ReactivateAction.test.tsx src/pages/ManageSubscriptions/components/CancelledSubscriptions.tsx src/pages/ManageSubscriptions/SubscriptionsManager.tsx src/pages/ManageSubscriptions/SubscriptionsManager.test.tsx
git commit -m "feat: B2B-0000 Let a customer reactivate a cancelled subscription from its card

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Quality gate and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-ordergroove-phase3-subscription-actions-design.md`
- Modify: `.memory/b2b-buyer-portal--ordergroove-custom-msp-architecture.md`
- Modify: this plan (tick the boxes; the Task 0 findings must already be recorded)

- [ ] **Step 1: Type-check and lint everything**

```bash
yarn tsc --noEmit
yarn lint:dependencies
yarn lint:eslint
yarn lint:knip
```

Expected: `tsc` exit 0; dependency-cruiser "no dependency violations" (every new module now has its `src` consumer); `lint:eslint` exit 0 (run `yarn eslint --fix` on the files you touched for prettier reflow, never on `en.json`); knip reports only the pre-existing `BillingStateOption` in `src/pages/PaymentMethods/billingPrefill.ts`. Anything else is yours: an export nothing in `src` consumes (`FrequencyOption`, `frequencyKey`, `CancelReasonSelection`, `AddressOption`, `AddressSummary`, `describeAddress`, `HOSTED_MANAGER_URL`, `ReactivationInput`, `SubscriptionDialog` are each consumed by a component or hook — check before un-exporting) or a file nothing imports.

- [ ] **Step 2: Run the scoped suites, then the full suite against the baseline**

```bash
yarn vitest run src/pages/ManageSubscriptions src/shared/service/ordergroove
```

Expected: every file green. Then, with nothing else running on the machine:

```bash
yarn vitest run 2>&1 | grep -E "^ (×|❯) src/" | sort -u > /tmp/after-failing.txt
comm -13 /tmp/baseline-failing.txt /tmp/after-failing.txt
```

Expected: the `comm` output is empty, or lists only files that pass when run alone — run each listed file by itself; a file that also fails alone is a real regression to fix before continuing. Record the counts here (files/tests in the scoped suites; the full-suite delta and what each listed file did alone).

- [ ] **Step 3: Align the spec with what shipped** — edit the Phase 3 spec:

1. §2.3 file list: add `components/actions/ActiveSubscriptionCard.tsx` (per-card owner: hook, open dialog, slots, dialogs) and `components/actions/ReactivateAction.tsx`; mark `SubscriptionActions.tsx` as the presentational button row; `CancelledSubscriptions.tsx` takes `customerId`; `SubscriptionCard.tsx` has `scheduleControls` and `shippingAction` slots. State why (Task 6's "Why the inversion").
2. §3.2: the service functions are `changeSubscriptionFrequency` and `changeSubscriptionQuantity` (Phase 4's `changeSubscriptionPayment` pattern; the hook keeps `changeFrequency`/`changeQuantity`). Record findings E–G beside their rows.
3. §4.1: `frequencyDays` is gone from the card; every schedule text comes from `every`/`every_period` via `describeFrequency` — and note that this fixed a Phase 2 display defect ("every 300 days" for a 10-month subscription). Add `frequencyKey`.
4. §4.6: as built (`buildAddressOptions`), plus finding J's counts.
5. §6.2 Reactivate row: native `TextField type="date"` with `min` = today + `FIRST_ORDER_MIN_DAYS` (finding H), not `B3Picker`; the "else the first option" branch is unreachable because §4.3 always appends the current schedule. Cancel row: the error colour is on the dialog's confirm (`rightStyleBtn`), the row's link is plain text.
6. §6.3: the pending spinner replaces the select's dropdown arrow (`SelectProps.IconComponent`) rather than sitting in an end adornment.
7. §7: `everyMonths` is `subscriptions.card.everyMonths`; `subscriptions.actions.reactivate.dateHint` added; `subscriptions.actions.changeAddress` labels the address-line button.
8. §10.1: replace steps 4–6 with the recorded findings E–J.
9. §10.2: the phone case asserts the selects' `MuiFormControl-fullWidth` class (the repo's tests already reach for `closest()`); the cancelled-card case now expects exactly one `Reactivate` button.

- [ ] **Step 4: Record the outcome in the memory note** — append to the Ordergroove note in `.memory/`, after the Phase 4 sections:

```
## Phase 3b implemented (YYYY-MM-DD)
- Parity reached minus swap product and add-new-address (hosted-only by design; the escape link
  stays). A customer changes quantity and frequency inline (QuantityFrequencySelects, save on
  change, value always the card's so a failed save snaps back), moves a subscription to another
  saved address (ChangeAddressDialog, §4.6 dedupe in buildAddressOptions), cancels with an optional
  reason (CancelDialog; body "{code} | {label}", Other "1 | text" or bare "1", none →
  "114|Cancelled without exit survey response" verbatim), and reactivates a cancelled one
  (ReactivateDialog: frequency select + native date input from today + FIRST_ORDER_MIN_DAYS).
- SHAPE: ActiveSubscriptionCard is the per-card owner (hook instance, open dialog, card-option
  queries) filling SubscriptionCard's three slots; SubscriptionActions is now only the button row;
  ReactivateAction owns the cancelled card's one control. One hook instance per card keeps spinners
  per card and lets the Cancel dialog hand off to Skip.
- The card's schedule text now comes from every/every_period (describeFrequency), which fixed
  Phase 2's "every 300 days" for 10-month subscriptions; frequencyDays left the card model.
- Service names: changeSubscriptionFrequency / changeSubscriptionQuantity / cancelSubscription /
  reactivateSubscription / changeShippingAddress, all PATCH /subscriptions/{id}/<action>/ with the
  trailing slash.
- Task 0 findings E–J: <one line each, from the plan>.
- Live check (Task 9): <what was changed and restored; the reactivated-then-cancelled id matched;
  zero forbidden requests>.
```

Mirror the note to the Obsidian vault copy (`/mnt/c/Users/thaverman/Documents/Obsidian/Programing/Platform/Memory/`, same filename) and, if the Mongo sink is reachable, append the same section there as the earlier phases did.

- [ ] **Step 5: Commit the documentation**

```bash
git add docs/superpowers/specs/2026-09-17-ordergroove-phase3-subscription-actions-design.md docs/superpowers/plans/2026-10-01-ordergroove-phase3b-subscription-edits.md .memory/b2b-buyer-portal--ordergroove-custom-msp-architecture.md
git commit -m "docs: B2B-0000 Record the Ordergroove Phase 3b implementation and align the spec

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Live check on sandbox through the real UI (reversible: quantity, frequency, address, reactivate-then-cancel)

**Files:** none in the repo. Script in your scratch directory under `pw/` (tooling rebuilt per "Before you start" item 6).

**Interfaces:**
- Consumes: a deploy-flavour build of this branch; the 3a recipe (request-level login, route interception of the deployed bundle path, `portalEval` into the ThemeFrame); `playwright` with the system Chrome. The sandbox theme emits `customManager: true`, so **no `BC_CONTEXT` injection**.
- Safety by construction: the script never clicks `Send now`, `Delete`, `Move subscriptions` or `Save` in the card picker; it counts every request whose path contains `send_now`, `use_for_all`, `payments/create`, `DeleteStoredInstrument`, `orders/…/cancel`, `items/…/delete` or `addresses/create` and fails if any fired. It only reactivates a cancelled subscription whose product name no active card shares, so the card it later cancels can be told apart, and it checks the cancel request's id against the reactivate request's id.

- [ ] **Step 1: Build the deploy flavour**

Run: `VITE_ASSETS_ABSOLUTE_PATH='https://sandbox.storesupply.com/content/b2bBuyerPortal/dist/' yarn build`
Expected: `apps/storefront/dist/` with hashed chunks; the script aliases the loader's unhashed names.

- [ ] **Step 2: Write the script** to `<scratch>/pw/phase3b-live.mjs`

```js
// Live check of Phase 3b on sandbox as customer 80591, through the real UI. REVERSIBLE ONLY:
// changes the last card's quantity, frequency and address and puts each back; reactivates ONE
// cancelled subscription whose product no active card shares, then cancels it again with no
// reason. Never clicks Send now, Delete, Move subscriptions or the card picker's Save.
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const DIST = process.env.DIST; // absolute path to apps/storefront/dist from Step 1
const ENV = process.env.ENV_FILE; // absolute path to apps/storefront/.env
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const ORIGIN = 'https://sandbox.storesupply.com';
const FORBIDDEN = /send_now|use_for_all|payments\/create|DeleteStoredInstrument|orders\/[0-9a-f]{32}\/cancel|items\/[0-9a-f]{32}\/delete|addresses\/create/;
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  readFileSync(ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
  }),
);
const contentType = (file) =>
  ({ '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' })[path.extname(file)] ?? 'application/octet-stream';
const redact = (s) => String(s).replace(/[0-9a-f]{64}/g, '<tok64>').replace(/[0-9a-f]{32}/g, '<id32>');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// The store prints "Sep 22nd 2026" (or "22 Sep 2026"); the Change date dialog wants "YYYY-MM-DD".
const toIso = (text) => {
  const a = text.match(/([A-Z][a-z]{2}) (\d{1,2})(?:st|nd|rd|th)? (\d{4})/);
  const b = text.match(/(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/);
  const [month, day, year] = a ? [a[1], a[2], a[3]] : b ? [b[2], b[1], b[3]] : [];
  return month ? `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}-${day.padStart(2, '0')}` : null;
};

const summary = { ogRequests: [], writes: [], forbidden: [], failedRequests: [], alerts: [], authMints: 0, servedLocal: 0 };
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 2200 } });
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
  const url = req.url();
  if (/ordergroove-auth/.test(url)) summary.authMints += 1;
  if (FORBIDDEN.test(url) && req.method() !== 'GET') summary.forbidden.push(`${req.method()} ${redact(url)}`);
  if (!url.startsWith('https://restapi.ordergroove.com/') || req.frame() !== page.mainFrame()) return;
  const line = `${req.method()} ${redact(url.replace('https://restapi.ordergroove.com', ''))}`;
  summary.ogRequests.push(line);
  if (req.method() !== 'GET') summary.writes.push({ url: url.replace('https://restapi.ordergroove.com', ''), line: `${line} ${redact(req.postData() ?? '')}` });
});
page.on('requestfailed', (req) => {
  if (/restapi\.ordergroove\.com|ordergroove-auth/.test(req.url())) summary.failedRequests.push(`${req.method()} ${redact(req.url()).slice(0, 100)} :: ${req.failure()?.errorText}`);
});

await page.goto(`${ORIGIN}/login.php`, { waitUntil: 'domcontentloaded' });
summary.loginStatus = (await page.request.post(`${ORIGIN}/login.php?action=check_login`, {
  form: { login_email: env.VITE_TEST_ACCOUNT_EMAIL, login_pass: env.VITE_TEST_ACCOUNT_PASSWORD },
  maxRedirects: 0,
})).status();

const portalEval = (fn, arg) =>
  page.evaluate(({ src, arg }) => {
    const frames = Array.from(document.querySelectorAll('#bundle-container iframe, iframe.active-frame'));
    const doc = frames.map((f) => { try { return f.contentDocument; } catch { return null; } }).find((d) => d && d.body);
    // eslint-disable-next-line no-new-func
    return new Function('doc', 'arg', `return (${src})(doc, arg)`)(doc, arg);
  }, { src: fn.toString(), arg });

const fail = async (why) => {
  summary.failure = why;
  summary.writesMade = summary.writes.map((w) => w.line);
  await page.screenshot({ path: path.join(OUT, 'phase3b-failure.png'), fullPage: true }).catch(() => {});
  console.log(JSON.stringify(summary, null, 2));
  console.log('!! A write may be un-restored. Re-read the account before anything else.');
  await browser.close();
  process.exit(1);
};
const collectAlerts = async () => {
  const alerts = await portalEval((doc) => Array.from(doc.querySelectorAll('[role="alert"]')).map((a) => a.textContent.trim())).catch(() => []);
  alerts.forEach((a) => { if (a && !summary.alerts.includes(a)) summary.alerts.push(a); });
};
const waitFor = async (predicate, ms, label, arg) => {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (await portalEval(predicate, arg).catch(() => false)) return;
    await collectAlerts();
    await page.waitForTimeout(250);
  }
  await fail(`timeout waiting for ${label}`);
};
const settled = (doc) => !!doc && doc.querySelectorAll('.MuiCard-root').length >= 14 && doc.querySelectorAll('.MuiSkeleton-root').length === 0 && !doc.querySelector('[role="dialog"]');

// --- card readers and clickers (all inside the ThemeFrame) ---------------------------------------
const cardText = (n) => portalEval((doc, i) => doc.querySelectorAll('.MuiCard-root')[i].textContent.replace(/\s+/g, ' '), n);
const comboText = (n, label) => portalEval((doc, { i, label }) => {
  const card = doc.querySelectorAll('.MuiCard-root')[i];
  const combo = Array.from(card.querySelectorAll('[role="combobox"]')).find((c) =>
    (c.getAttribute('aria-labelledby') || '').split(' ').some((id) => doc.getElementById(id)?.textContent.trim() === label));
  return combo ? combo.textContent.trim() : null;
}, { i: n, label });
const pickOption = async (n, label, optionText) => {
  const opened = await portalEval((doc, { i, label }) => {
    const card = doc.querySelectorAll('.MuiCard-root')[i];
    const combo = Array.from(card.querySelectorAll('[role="combobox"]')).find((c) =>
      (c.getAttribute('aria-labelledby') || '').split(' ').some((id) => doc.getElementById(id)?.textContent.trim() === label));
    if (!combo) return false;
    combo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); // MUI Select opens on mousedown
    return true;
  }, { i: n, label });
  if (!opened) await fail(`no ${label} select on card ${n}`);
  await waitFor((doc) => !!doc.querySelector('[role="listbox"] [role="option"]'), 10000, `the ${label} menu`);
  const picked = await portalEval((doc, text) => {
    const option = Array.from(doc.querySelectorAll('[role="listbox"] [role="option"]')).find((o) => o.textContent.trim() === text);
    if (!option) return false;
    option.click();
    return true;
  }, optionText);
  if (!picked) await fail(`no option "${optionText}" in the ${label} menu`);
};
const clickInCard = (n, label) => portalEval((doc, { i, label }) => {
  const btn = Array.from(doc.querySelectorAll('.MuiCard-root')[i].querySelectorAll('button')).find((b) => b.textContent.trim() === label);
  if (!btn) return false;
  btn.click();
  return true;
}, { i: n, label });
const dialogRadios = () => portalEval((doc) => Array.from(doc.querySelectorAll('[role="dialog"] label')).map((l) => ({ text: l.textContent.trim(), checked: !!l.querySelector('input:checked') })));
const pickRadio = (text) => portalEval((doc, t) => {
  const label = Array.from(doc.querySelectorAll('[role="dialog"] label')).find((l) => l.textContent.trim() === t);
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
const setDateInput = (value) => portalEval((doc, v) => {
  const input = doc.querySelector('[role="dialog"] input[type="date"]');
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}, value);
const noDialog = (doc) => !doc.querySelector('[role="dialog"]');
const shipsTo = (text) => text.match(/Ships to (.*?) · Change/)?.[1] ?? null;
const nextOrder = (text) => text.match(/Next order ([^]*?)$/)?.[1]?.trim() ?? null;

await page.goto(`${ORIGIN}/account.php#/manage-subscriptions`, { waitUntil: 'domcontentloaded' });
await waitFor(settled, 60000, 'fourteen settled cards');
const activeCount = await portalEval((doc) => doc.querySelectorAll('.MuiCard-root').length);
const n = activeCount - 1; // the last card: farthest-out next order, least disruptive to touch
const before = { text: await cardText(n) };
before.quantity = await comboText(n, 'Quantity');
before.frequency = await comboText(n, 'Frequency');
before.shipsTo = shipsTo(before.text);
before.nextOrder = nextOrder(before.text);
before.nextOrderIso = before.nextOrder && toIso(before.nextOrder);
summary.before = before;
if (!before.quantity || !before.frequency || !before.shipsTo || !before.nextOrderIso) await fail('could not read the subject card — no write was made');

// 1. Quantity +1, then back.
const plusOne = String(Number(before.quantity) + 1);
await pickOption(n, 'Quantity', plusOne);
await (async () => { const started = Date.now(); while (Date.now() - started < 40000) { if ((await comboText(n, 'Quantity')) === plusOne) return; await collectAlerts(); await page.waitForTimeout(250); } await fail('quantity did not change'); })();
summary.quantityChanged = await comboText(n, 'Quantity');
await pickOption(n, 'Quantity', before.quantity);
await (async () => { const started = Date.now(); while (Date.now() - started < 40000) { if ((await comboText(n, 'Quantity')) === before.quantity) return; await collectAlerts(); await page.waitForTimeout(250); } await fail('quantity did not restore — restore by hand'); })();
summary.quantityRestored = await comboText(n, 'Quantity');

// 2. Frequency to another option, then back; put the next-order date back if the schedule moved it.
const otherFrequency = before.frequency === 'every 6 weeks' ? 'every 8 weeks' : 'every 6 weeks';
await pickOption(n, 'Frequency', otherFrequency);
await (async () => { const started = Date.now(); while (Date.now() - started < 40000) { if ((await comboText(n, 'Frequency')) === otherFrequency) return; await collectAlerts(); await page.waitForTimeout(250); } await fail('frequency did not change'); })();
summary.frequencyChanged = await comboText(n, 'Frequency');
summary.nextOrderAfterFrequencyChange = nextOrder(await cardText(n));
await pickOption(n, 'Frequency', before.frequency);
await (async () => { const started = Date.now(); while (Date.now() - started < 40000) { if ((await comboText(n, 'Frequency')) === before.frequency) return; await collectAlerts(); await page.waitForTimeout(250); } await fail('frequency did not restore — restore by hand'); })();
summary.frequencyRestored = await comboText(n, 'Frequency');
if (nextOrder(await cardText(n)) !== before.nextOrder) {
  // Finding E saw the date stay put; this branch is insurance in case Ordergroove ever regenerates it.
  if (!(await clickInCard(n, 'Change date'))) await fail('no Change date button for the date restore — restore by hand');
  await waitFor((doc) => !!doc.querySelector('[role="dialog"] input[type="radio"]'), 15000, 'the change-date dialog');
  await pickRadio('Pick a date');
  await waitFor((doc) => !!doc.querySelector('[role="dialog"] input[type="date"]'), 10000, 'the date input');
  await setDateInput(before.nextOrderIso);
  await clickInDialog('Save');
  await waitFor((doc, { i, want }) => noDialog(doc) && doc.querySelectorAll('.MuiCard-root')[i].textContent.includes(want), 40000, 'the original next order date', { i: n, want: before.nextOrder });
}
summary.nextOrderRestored = nextOrder(await cardText(n));

// 3. Address to another saved address, then back.
if (!(await clickInCard(n, 'Change'))) await fail('no Change control on the address line');
await waitFor((doc) => !!doc.querySelector('[role="dialog"] input[type="radio"]'), 15000, 'the address picker');
summary.addressOptions = await dialogRadios();
const current = summary.addressOptions.find((o) => o.checked);
const other = summary.addressOptions.find((o) => !o.checked);
if (!current || current.text !== before.shipsTo) await fail(`the picker's current address "${current?.text}" is not the card's "${before.shipsTo}"`);
if (!other) await fail('only one address offered — nothing reversible to do');
await pickRadio(other.text);
await clickInDialog('Save');
await waitFor((doc, { i, want }) => noDialog(doc) && doc.querySelectorAll('.MuiCard-root')[i].textContent.replace(/\s+/g, ' ').includes(`Ships to ${want}`), 40000, 'the new address on the card', { i: n, want: other.text });
summary.addressChanged = shipsTo(await cardText(n));
if (!(await clickInCard(n, 'Change'))) await fail('no Change control for the address restore — restore by hand');
await waitFor((doc) => !!doc.querySelector('[role="dialog"] input[type="radio"]'), 15000, 'the address picker again');
if (!(await pickRadio(before.shipsTo))) await fail(`the original address "${before.shipsTo}" is not offered — restore by hand`);
await clickInDialog('Save');
await waitFor((doc, { i, want }) => noDialog(doc) && doc.querySelectorAll('.MuiCard-root')[i].textContent.replace(/\s+/g, ' ').includes(`Ships to ${want}`), 40000, 'the original address on the card', { i: n, want: before.shipsTo });
summary.addressRestored = shipsTo(await cardText(n));

// 4. Reactivate one cancelled subscription whose product no active card shares, then cancel it again.
const activeNames = await portalEval((doc) => Array.from(doc.querySelectorAll('.MuiCard-root [role="group"]')).map((g) => g.getAttribute('aria-label')));
const toggle = await portalEval((doc) => { const b = Array.from(doc.querySelectorAll('button')).find((x) => /cancelled subscription/.test(x.textContent)); if (!b) return null; const t = b.textContent.trim(); b.click(); return t; });
if (!toggle) await fail('no cancelled subscriptions toggle');
summary.cancelledToggle = toggle;
await waitFor((doc) => Array.from(doc.querySelectorAll('button')).some((b) => b.textContent.trim() === 'Reactivate'), 15000, 'the cancelled cards');
const candidate = await portalEval((doc, active) => {
  const groups = Array.from(doc.querySelectorAll('.MuiCard-root [role="group"]')).slice(active.length);
  const unique = groups.find((g) => !active.includes(g.getAttribute('aria-label')));
  return unique ? { name: unique.getAttribute('aria-label'), index: groups.indexOf(unique) + active.length } : null;
}, activeNames);
if (!candidate) await fail('every cancelled product is also active — cannot tell the cards apart; reactivate by hand or skip step 4');
summary.reactivateSubject = candidate.name;
if (!(await clickInCard(candidate.index, 'Reactivate'))) await fail('no Reactivate button');
await waitFor((doc) => !!doc.querySelector('[role="dialog"] input[type="date"]'), 15000, 'the reactivate dialog');
summary.reactivateDialog = await portalEval((doc) => doc.querySelector('[role="dialog"]').innerText.replace(/\s+/g, ' ').slice(0, 300));
await clickInDialog('Reactivate');
await waitFor((doc, name) => noDialog(doc) && Array.from(doc.querySelectorAll('.MuiCard-root [role="group"]')).some((g) => g.getAttribute('aria-label') === name && g.querySelector('button') && Array.from(g.querySelectorAll('button')).some((b) => b.textContent.trim() === 'Cancel subscription')), 40000, 'the reactivated card among the active ones', candidate.name);
const reactivateWrite = summary.writes.find((w) => /\/reactivate\/$/.test(w.url));
const reactivatedId = reactivateWrite?.url.match(/subscriptions\/([0-9a-f]{32})\//)?.[1];
if (!reactivatedId) await fail('no reactivate request was seen — cancel the card by hand if it moved');
const reactivatedIndex = await portalEval((doc, name) => Array.from(doc.querySelectorAll('.MuiCard-root [role="group"]')).findIndex((g) => g.getAttribute('aria-label') === name), candidate.name);
if (!(await clickInCard(reactivatedIndex, 'Cancel subscription'))) await fail('no Cancel subscription on the reactivated card — cancel it by hand');
await waitFor((doc) => !!doc.querySelector('[role="dialog"] input[type="radio"]'), 15000, 'the cancel dialog');
summary.cancelDialog = await portalEval((doc) => doc.querySelector('[role="dialog"]').innerText.replace(/\s+/g, ' ').slice(0, 300));
await clickInDialog('Cancel subscription'); // no reason chosen: the 114 body
await waitFor((doc, name) => noDialog(doc) && !Array.from(doc.querySelectorAll('.MuiCard-root [role="group"]')).some((g) => g.getAttribute('aria-label') === name && Array.from(g.querySelectorAll('button')).some((b) => b.textContent.trim() === 'Cancel subscription')), 40000, 'the card back out of the active list', candidate.name);
const cancelWrite = summary.writes.find((w) => /\/cancel\/$/.test(w.url));
summary.cancelTargetedTheReactivatedOne = cancelWrite?.url.includes(reactivatedId) ?? false;
summary.cancelBody = cancelWrite?.line.split(' ').slice(2).join(' ');
await collectAlerts();
await page.screenshot({ path: path.join(OUT, 'phase3b-final.png'), fullPage: true });

await browser.close();
summary.writesMade = summary.writes.map((w) => w.line);
delete summary.writes;
summary.ok =
  summary.quantityRestored === before.quantity &&
  summary.frequencyRestored === before.frequency &&
  summary.nextOrderRestored === before.nextOrder &&
  summary.addressRestored === before.shipsTo &&
  summary.cancelTargetedTheReactivatedOne &&
  summary.forbidden.length === 0 &&
  summary.failedRequests.length === 0 &&
  summary.authMints === 1;
console.log(JSON.stringify(summary, null, 2));
```

- [ ] **Step 3: Run it, spaced from any other live run by a few minutes**

Run: `cd <scratch>/pw && DIST=/home/thaverman/repos/customb2baccount/b2b-buyer-portal/apps/storefront/dist ENV_FILE=/home/thaverman/repos/customb2baccount/b2b-buyer-portal/apps/storefront/.env node phase3b-live.mjs 2>&1 | tee out/phase3b-live.log`
Expected: `"ok": true`; `quantityRestored`, `frequencyRestored`, `nextOrderRestored`, `addressRestored` equal their `before` values; `cancelTargetedTheReactivatedOne: true`; `cancelBody` carries `114|Cancelled without exit survey response`; `forbidden: []`; `failedRequests: []`; `authMints: 1`; `alerts` lists the five success snackbars. If it fails part-way, the printed `writesMade` says exactly what changed; restore with the probe's helpers or the UI before anything else, then re-read the account.

- [ ] **Step 4: Record the outcome** in this plan (below) and in the memory note's Phase 3b section (Task 8 Step 4 — amend that commit or add a docs commit).

**Recorded YYYY-MM-DD:** `[ ]`

---

## Self-review against the spec

- **Spec coverage.** §2.1 3b items: selects on the schedule line (Task 5/6), `Change` on the address line (Task 6), text-style `Cancel subscription` at the row's end (Task 6), `Reactivate` alone on a cancelled card (Task 7), phones (Task 5/6 tests). §2.2 3b row: five functions (Task 1), five mutations (Task 3), `QuantityFrequencySelects` (Task 5), three dialogs (Task 4), address options (Task 2), copy (Task 3). §3.2 rows 4–8 (Task 1). §4.3–§4.6 (Task 2). §5 (Task 3; per-card instances via Task 6/7). §6.1–§6.4 (Tasks 4–7; the "any mutation pending" state is pinned in Task 6's quantity test). §7 3b keys (Task 3). §8 safety properties: no double submit (Task 6 holds every control), truth after timeout (Task 3's error test plus the selects rendering from the query value). §10.1 steps 4–6 → Task 0; §10.2 → Tasks 1–7; §10.3 3b → Task 9. Not in this plan, by spec §11: swap, add/edit/delete address, retention discounts, exit survey, prepaid, one-time items, failed-order retry, the cutover.
- **Placeholder scan.** Every code step carries its code. The Task 0 findings and the Task 8/9 "Recorded" lines are tick boxes the executor fills — that is their purpose, not a gap.
- **Type consistency.** `FrequencyOption { every; period }` and `frequencyKey` (Task 2) are what Task 4's Reactivate dialog and Task 5's selects use; `onChangeFrequency(option: FrequencyOption)` in Task 5 is what Task 6 destructures as `({ every, period })` and maps onto the hook's `{ every, everyPeriod }` (Task 3). `ReactivationInput { startDate; every; everyPeriod; nextOrderDate }` (Task 1) is what Task 4's dialog emits, Task 3's `reactivate` takes with `subscriptionId`, and Task 7 spreads. `AddressOption { publicId; summary; isCurrent }` (Task 2) is what Task 4's dialog lists and Task 6 builds with `buildAddressOptions(addresses, card.shippingAddressId)`. `SubscriptionDialog` (Task 6) covers every `open` value including `'address'`, which only the owner sets. `CellLoading` keeps its 3a shape. `describeAddress` output is the card line and the radio label, so Task 9 can match them as strings.
- **Review Focus.** (1) off-list schedule: Task 2 `frequencyOptions`/card text, Task 4 Reactivate, Task 5 selects; (2) quantity 32: Task 2, Task 5; (3) Other + blank details: Task 2, Task 4; (4) retired or duplicated current address: Task 2 (two tests), Task 4 preselect, Task 6 dedupe; (5) addresses unknown: Task 6 "offers no address change until the addresses have loaded". All five pinned.
