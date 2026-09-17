# Ordergroove Phase 3a — Order Actions (Skip, Send Now, Change Date): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every active subscription card on `/manage-subscriptions` three working actions — Skip, Send now and Change date (with pause presets) — the first writes the portal makes to Ordergroove.

**Architecture:** The Phase 1 service module gains a write helper (same auth mint, same one-shot 403 re-mint, a 10 s deadline) and three action functions that call the exact Storefront-scope endpoints Ordergroove's own manager uses. A per-card hook wraps them in `useMutation`, refreshes the subscriptions and upcoming-orders queries on success and speaks through the existing snackbar. Each card renders an actions row that owns which of three always-mounted `B3Dialog`s is open. The view model grows the fields the dialogs need (the upcoming order id, its sibling products, the raw `every`/`every_period` schedule) and two pure date helpers.

**Tech Stack:** React 18, TypeScript, `@tanstack/react-query` v5 (`useMutation`, `useQueryClient`), MUI (`Button`, `RadioGroup`, `TextField type="date"`), dayjs, Vitest + jsdom + MSW v2 + Testing Library, `tests/builder.ts` builders, ICU messages via `useB3Lang`.

**Spec:** `docs/superpowers/specs/2026-09-17-ordergroove-phase3-subscription-actions-design.md` (this plan implements §1–§8 for the 3a delivery: §2.2 row "3a") and the program spec `docs/superpowers/specs/2026-09-15-ordergroove-subscriptions-custom-manager-design.md` §5 (shared foundation). Phase 3b (frequency, quantity, cancel, reactivate, address) gets its own plan.

## Global Constraints

- All commands run from `apps/storefront/` (`cd apps/storefront` first). Node `>=22.16.0`, Yarn `1.22.22`.
- No new Redux slices, Context providers, `localStorage`/`sessionStorage`. Redux is read once at the top of the page (`company.customer.id`) and passed down as a prop.
- Mutations: `useMutation`, never a client-side retry, never an optimistic update. Success invalidates `['ordergroove', customerId, 'subscriptions']` and `['ordergroove', customerId, 'upcoming']`; Send now also `['ordergroove', customerId, 'orderHistory']`. Products, payments and addresses are never invalidated (spec §5.2).
- Write deadline **10 000 ms**; read deadline stays **5 000 ms** (spec §3.1). Status mapping unchanged: 401/403 after the re-mint → `sessionExpired`, 429 → `rateLimited`, everything else non-2xx (including 400 and 423) → `upstream`.
- Endpoints exactly as spec §3.2: `PATCH /orders/{orderId}/skip_subscription/ { subscription }`, `PATCH /orders/{orderId}/send_now/`, `PATCH /subscriptions/{id}/change_next_order_date/ { order_date: "YYYY-MM-DD" }`. Task 0 finding A decides whether the last path keeps its trailing slash.
- Period codes: `1` = days, `2` = weeks, `3` = months. Date arithmetic is **calendar** arithmetic with dayjs (`add(every × k, 'day' | 'week' | 'month')`), never `frequency_days` (spec §4.2).
- Imports: `@/` alias, `lodash-es` only, named MUI imports. Import groups separated by blank lines: externals, then `@/…`, then relative.
- ESLint airbnb is on: no `for…of`, no `await` in loops, **no nested ternaries**, no `console`. Do not add violations of the disabled-rule list in CLAUDE.md (no `any`, no `!` assertions, no JSX prop spreading).
- knip fails on unused exports: **export only what another `src` file consumes.** `lint:dependencies` treats a module with no `src` consumer as an orphan, so `yarn lint` is run at Task 6 — a module landed one task before its consumer is expected to show as an orphan until then.
- Commit subject format: `type: B2B-0000 Short description`; end every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Stage by explicit path — this tree carries other sessions' uncommitted work.
- Copy is fixed by spec §7 with two amendments made here (Task 6 writes them back): the skip success reads **"Next order skipped."** (one subscription moves, not the whole order), and `subscriptions.actions.changeDate.pickerHint` is added for the custom-date validation message.
- **Custom date input:** the Change date dialog uses MUI `TextField type="date"` (native date input, `min` = tomorrow) rather than `B3Picker`. No test in this repo drives the MUI x-date-pickers input, the native input gives `min` enforcement for free and `fireEvent.change` tests it reliably. Task 6 records this in spec §6.2.
- **Live writes are reversible only** (spec decision 3). Task 0 and Task 7 change a next-order date and skip one subscription, and restore both. **No script or test run in this plan may call `send_now`, `cancel`, `delete`, `create` or `use_for_all` against Ordergroove.** The probe refuses such paths by construction; Task 7 asserts zero `send_now` requests.
- Every planned test must be seen **failing** before its implementation step (the "verify it fails" steps are the negative control — do not skip them).
- Test gotchas carried from Phase 2: the test store's date display format is blank, so pass `storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } })` in `preloadedState` and assert literal dates such as `3 Oct 2026`; never draw a random id inside a `renderHook`/render callback; fixtures that share a builder default collide in `getBy*` queries — give each its own value. `B3Dialog` only opens on a **re-render** after its container ref is set, so a dialog test renders closed first and re-renders open (the `renderOpen` helper in Task 4), and the row keeps its three dialogs mounted and toggles `isOpen`.

## Before you start

1. Work in a worktree: `EnterWorktree` lands on `origin/dev`, not local `dev` — run `git reset --hard dev` in it first, then symlink `node_modules` from the main checkout (repo root and `apps/storefront/`). The worktree guard refuses `$VAR` expansions and compound `cd`/redirect chains; use the Edit tool for file edits and literal paths in commands.
2. `git status`. Other sessions leave uncommitted work in this tree. Never `git add` a path you did not change; never `git add -A`.
3. Baseline: `yarn vitest run 2>&1 | grep -E "^ (×|❯) src/" | sort -u > /tmp/baseline-failing.txt` once. The dev branch has a known red baseline of ~20 files that time out under the suite's own load; only *new* failing files are yours, and every one must pass when run alone.
4. Sandbox fixture for Tasks 0 and 7: customer **80591** (credentials in `apps/storefront/.env` as `VITE_TEST_ACCOUNT_EMAIL` / `VITE_TEST_ACCOUNT_PASSWORD` — never print them). 14 active subscriptions, 4 cancelled, 12 upcoming orders. The Ordergroove "Your Merchant ID" is the environment variable `OG_PUBLIC_ID` for the probe (the session scratchpad has it in `og.env`); never commit or print it.
5. Sandbox talks to Ordergroove **production**. Every write in Tasks 0 and 7 is restored in the same run; if a run aborts half-way, restore by hand with the probe's `change_next_order_date` step before doing anything else.
6. Phase 2's live-check tooling lives in the session scratchpad under `pw/` (`playwright` 1.63 installed, system Chrome at `/usr/bin/google-chrome`, `phase2-live.mjs`, `sandbox-state.mjs`). Task 7 copies its recipe.
7. `dev` is many commits ahead of `origin/dev` and unpushed; that is the owner's call, not this plan's.

## File structure

| File | Responsibility |
|---|---|
| `src/shared/service/ordergroove/types.ts` | `FrequencyPeriod`; `every` / `every_period` on `OgSubscription` |
| `src/shared/service/ordergroove/api.ts` | `request()` learns a write shape and the 10 s deadline; `parse()`; `ogMutate`; `skipSubscription`, `sendOrderNow`, `changeNextOrderDate` |
| `src/shared/service/ordergroove/index.ts` | barrel: the three functions and `FrequencyPeriod` |
| `tests/ordergrooveBuilders/index.ts` | `buildOgSubscriptionWith` defaults `every: 4, every_period: 2, frequency_days: 28` together |
| `src/pages/ManageSubscriptions/viewModel.ts` | card gains `every`, `everyPeriod`, `shippingAddressId`, `nextOrder`; `addIntervals`, `changeDatePresets`, `DatePreset`; `PaymentSummary` exported |
| `src/pages/ManageSubscriptions/format.ts` | `formatDate`, `describePayment` — shared by the card and the dialogs |
| `src/pages/ManageSubscriptions/hooks/useSubscriptionActions.ts` | the three mutations, invalidation, snackbars |
| `src/pages/ManageSubscriptions/components/actions/SkipDialog.tsx` | confirm with the projected date |
| `src/pages/ManageSubscriptions/components/actions/SendNowDialog.tsx` | confirm with the card and the sibling products |
| `src/pages/ManageSubscriptions/components/actions/ChangeDateDialog.tsx` | presets + custom date, Save gating |
| `src/pages/ManageSubscriptions/components/actions/SubscriptionActions.tsx` | the row: three buttons, one open dialog, per-card pending state |
| `src/pages/ManageSubscriptions/components/SubscriptionCard.tsx` | `actions` slot; uses `format.ts` |
| `src/pages/ManageSubscriptions/SubscriptionsManager.tsx` | renders the row on active cards |
| `src/lib/lang/locales/en.json` | `subscriptions.actions.*` |

---

### Task 0: Reversible live probe of the two write endpoints (throwaway)

**Files:** none in the repo. Script lives in your scratch directory and is not committed.

**Interfaces:**
- Produces: four recorded findings (below) that Tasks 1, 2 and 5 read.

- [x] **Step 1: Write the probe script** to `<scratch>/og-write-probe.mjs` (as run, the script reads `OG_PUBLIC_ID` from a sibling `og.env` when the variable is unset — the worktree guard refuses shell sourcing)

```js
// Reversible write probe of Ordergroove for customer 80591 (Phase 3a Task 0). Run with OG_PUBLIC_ID set.
// Writes ONLY change_next_order_date and skip_subscription, on ONE subscription, and restores every
// change it makes. Refuses any other write path by construction.
const MINT = 'https://test-onlineservices.storesupply.com/products/productclient/ordergroove-auth';
const OG = 'https://restapi.ordergroove.com';
const CUSTOMER = '80591';
const ALLOWED = /^\/(subscriptions\/[0-9a-f]{32}\/change_next_order_date\/?|orders\/[0-9a-f]{32}\/skip_subscription\/)$/;

const mint = await (
  await fetch(MINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId: CUSTOMER, storeHash: '24erkpw9h6' }),
  })
).json();
const [sigField, ts, sig] = mint.cookieValue.split('|');
const headers = {
  Authorization: JSON.stringify({ public_id: process.env.OG_PUBLIC_ID, sig_field: sigField, ts: Number(ts), sig }),
  'Content-Type': 'application/json',
};

const redact = (value) =>
  JSON.stringify(value).replace(/[0-9a-f]{64}/g, '<tok64>').replace(/[0-9a-f]{32}/g, '<id32>');
const listAll = async (path, acc = []) => {
  const body = await (await fetch(`${OG}${path}`, { headers })).json();
  const all = [...acc, ...body.results];
  return body.next ? listAll(body.next.replace(OG, ''), all) : all;
};
const patch = async (path, body) => {
  if (!ALLOWED.test(path)) throw new Error(`refusing to write ${path}`);
  const response = await fetch(`${OG}${path}`, {
    method: 'PATCH',
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual', // a 301/302 here means the path form is wrong for a PATCH
  });
  return { status: response.status, location: response.headers.get('location'), body: await response.json().catch(() => null) };
};
const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addIntervals = (date, every, period, k) => {
  const d = new Date(`${date}T00:00:00Z`);
  if (period === 3) d.setUTCMonth(d.getUTCMonth() + every * k);
  else d.setUTCDate(d.getUTCDate() + every * k * (period === 2 ? 7 : 1));
  return d.toISOString().slice(0, 10);
};
const snapshot = async () => {
  const orders = await listAll('/orders/?status=1');
  const items = await listAll('/items/?status=1');
  const placeByOrder = new Map(orders.map((o) => [o.public_id, o.place.slice(0, 10)]));
  const nextFor = (subId) =>
    items.filter((i) => i.subscription === subId)
      .map((i) => ({ order: i.order, date: placeByOrder.get(i.order) }))
      .filter((x) => x.date)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
  return { orders, items, nextFor };
};

const today = new Date().toISOString().slice(0, 10);
const subs = (await listAll('/subscriptions/')).filter((s) => s.cancelled === null && s.live);
let snap = await snapshot();
// Least disruptive subject: alone on its order, at least 3 days out, farthest in the future.
const candidates = subs
  .map((s) => ({ s, next: snap.nextFor(s.public_id) }))
  .filter(({ next }) => next && next.date >= addDays(today, 3) && snap.items.filter((i) => i.order === next.order).length === 1)
  .sort((a, b) => b.next.date.localeCompare(a.next.date));
if (candidates.length === 0) throw new Error('no subscription is alone on an order at least 3 days out — pick one by hand');
const { s, next } = candidates[0];
const original = next.date;
console.log('D subject', redact({ every: s.every, every_period: s.every_period, frequency_days: s.frequency_days, quantity: s.quantity, next }));
console.log('  subscription keys:', Object.keys(s).join(','));

// A. change_next_order_date — which path form does a PATCH accept?
const plusOne = addDays(original, 1);
const slashed = `/subscriptions/${s.public_id}/change_next_order_date/`;
const bare = `/subscriptions/${s.public_id}/change_next_order_date`;
let a = await patch(slashed, { order_date: plusOne });
let path = slashed;
if (a.status !== 200) {
  console.log('A with slash ->', a.status, a.location ?? '', redact(a.body).slice(0, 200));
  a = await patch(bare, { order_date: plusOne });
  path = bare;
}
snap = await snapshot();
console.log('A', path === slashed ? 'with slash' : 'WITHOUT slash', '->', a.status, '| next now', snap.nextFor(s.public_id)?.date, '(expected', plusOne, ') | response has every/every_period:', Boolean(a.body && 'every' in a.body && 'every_period' in a.body));
const restoreA = await patch(path, { order_date: original });
snap = await snapshot();
console.log('A restore ->', restoreA.status, '| next now', snap.nextFor(s.public_id)?.date, '(expected', original, ') | same order id as before:', snap.nextFor(s.public_id)?.order === next.order);

// B. skip_subscription, then restore the date.
const orderBefore = snap.nextFor(s.public_id).order;
const b = await patch(`/orders/${orderBefore}/skip_subscription/`, { subscription: s.public_id });
snap = await snapshot();
const afterSkip = snap.nextFor(s.public_id);
console.log('B skip ->', b.status, '| next now', afterSkip?.date, '(expected', addIntervals(original, s.every, s.every_period, 1), ') | old order still upcoming:', snap.orders.some((o) => o.public_id === orderBefore), '| response order status:', b.body?.status);
const restoreB = await patch(path, { order_date: original });
snap = await snapshot();
const restored = snap.nextFor(s.public_id);
console.log('C restore after skip ->', restoreB.status, '| next now', restored?.date, '(expected', original, ') | back on the original order:', restored?.order === orderBefore, '| upcoming orders dated', original + ':', snap.orders.filter((o) => o.place.slice(0, 10) === original).length);
```

- [x] **Step 2: Run it**

Run: `OG_PUBLIC_ID=<merchant id> node <scratch>/og-write-probe.mjs`
Expected: every `->` status `200`; both "next now" values match their "expected"; the final line shows the subscription back on `original`. If any restore line does not read `original`, run the script's restore by hand (`change_next_order_date` with `{ order_date: <original> }`) before anything else.

- [x] **Step 3: Record the findings here** (edit this file; later tasks read these lines)

- Finding A — path form for `change_next_order_date`: `[x] with trailing slash` (200 on the first try, so the bare form was never sent). Task 1 keeps `subscriptionUrl()` with the slash, as the reference documents.
- Finding B — skip arithmetic: subject was a 12-month subscription (`every: 12, every_period: 3, frequency_days: 360`) due 2026-11-20; after `skip_subscription` its item sat on an order dated **2027-11-20**, exactly `addIntervals(+1)` with calendar months (a `frequency_days` sum would have said 2027-11-15). The old, now-empty order **stayed** in `/orders/?status=1` (status 1, no items). The Phase 2 join derives dates from items, so an empty order never surfaces on a card; nothing to change. The skip response is the order object with `status: 1`.
- Finding C — restoring the date after a skip: `change_next_order_date` back to 2026-11-20 put the item **back on the original order id** (Ordergroove merges into the existing order on that date); exactly one upcoming order carried that date afterwards. Recorded for 3b.
- Finding D — `every` / `every_period` present on the list record **and** on the write response: `[x] yes` (every 12, every_period 3). The list record also carries `cancel_reason`, `cancel_reason_code`, `offer`, `subscription_type`, `price`, `reminder_days` — useful for 3b, unused here.
- Probe run 2026-09-17: every write returned 200 and the subject ended exactly where it started (2026-11-20, same order id). Log in the session scratchpad `og-write-probe.log` (ids redacted).

- [x] **Step 4: Delete nothing, commit nothing.** The script stays in scratch.

---

### Task 1: Service — write helper, three action functions, schedule fields, builders

**Files:**
- Modify: `src/shared/service/ordergroove/types.ts`
- Modify: `src/shared/service/ordergroove/api.ts`
- Modify: `src/shared/service/ordergroove/index.ts`
- Modify: `tests/ordergrooveBuilders/index.ts`
- Test: `src/shared/service/ordergroove/api.test.ts`

**Interfaces:**
- Consumes: `getAuthorizationHeader`, `invalidateAuthorization` (auth.ts), `OrdergrooveError` (errors.ts), `withTimeout` (api.ts) — all existing.
- Produces:
  - `type FrequencyPeriod = 1 | 2 | 3` and `OgSubscription.every: number`, `OgSubscription.every_period: FrequencyPeriod`;
  - `skipSubscription(customerId: string, orderId: string, subscriptionId: string): Promise<OgOrder>`;
  - `sendOrderNow(customerId: string, orderId: string): Promise<OgOrder>`;
  - `changeNextOrderDate(customerId: string, subscriptionId: string, orderDate: string): Promise<OgSubscription>`;
  - `buildOgSubscriptionWith` defaults `every: 4, every_period: 2, frequency_days: 28`.

- [x] **Step 1: Write the failing tests** — append to `api.test.ts`, and add `changeNextOrderDate`, `sendOrderNow`, `skipSubscription` to the existing `from './api'` import list (keep it alphabetical).

```ts
describe('writes', () => {
  it('skips one subscription on its upcoming order with a PATCH and a JSON body', async () => {
    const received = vi.fn();
    const order = buildOgOrderWith({ status: 1 });
    server.use(
      http.patch(`${ogBase}/orders/:orderId/skip_subscription/`, async ({ params, request }) => {
        received(params.orderId, await request.json(), request.headers.get('Content-Type'));

        return HttpResponse.json(order);
      }),
    );

    expect(await skipSubscription(someCustomerId(), order.public_id, 'sub-1')).toEqual(order);
    expect(received).toHaveBeenCalledWith(
      order.public_id,
      { subscription: 'sub-1' },
      'application/json',
    );
  });

  it('sends an order now with an empty PATCH', async () => {
    const bodies = vi.fn();
    const order = buildOgOrderWith({ status: 1 });
    server.use(
      http.patch(`${ogBase}/orders/${order.public_id}/send_now/`, async ({ request }) => {
        bodies(await request.text());

        return HttpResponse.json(order);
      }),
    );

    expect(await sendOrderNow(someCustomerId(), order.public_id)).toEqual(order);
    expect(bodies).toHaveBeenCalledWith('');
  });

  it("changes a subscription's next order date", async () => {
    const received = vi.fn();
    const subscription = buildOgSubscriptionWith('WHATEVER_VALUES');
    server.use(
      http.patch(
        `${ogBase}/subscriptions/${subscription.public_id}/change_next_order_date/`,
        async ({ request }) => {
          received(await request.json());

          return HttpResponse.json(subscription);
        },
      ),
    );

    expect(
      await changeNextOrderDate(someCustomerId(), subscription.public_id, '2026-10-31'),
    ).toEqual(subscription);
    expect(received).toHaveBeenCalledWith({ order_date: '2026-10-31' });
  });

  it('re-mints once on a 403 and repeats the same write', async () => {
    const mints = vi.fn();
    let calls = 0;
    server.use(
      http.post(authEndpoint, () => {
        mints();

        return HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 });
      }),
      http.patch(`${ogBase}/orders/o-1/send_now/`, () => {
        calls += 1;

        return calls === 1
          ? HttpResponse.json({ detail: 'Authentication Failed' }, { status: 403 })
          : HttpResponse.json(buildOgOrderWith('WHATEVER_VALUES'));
      }),
    );

    await sendOrderNow(someCustomerId(), 'o-1');

    expect(calls).toBe(2);
    expect(mints).toHaveBeenCalledTimes(2);
  });

  it('maps a 400 and a 423 to upstream', async () => {
    server.use(
      http.patch(`${ogBase}/orders/o-1/send_now/`, () =>
        HttpResponse.json({ detail: 'prepaid' }, { status: 400 }),
      ),
    );
    await expect(sendOrderNow(someCustomerId(), 'o-1')).rejects.toMatchObject({ kind: 'upstream' });

    server.use(
      http.patch(`${ogBase}/orders/o-1/send_now/`, () => new HttpResponse(null, { status: 423 })),
    );
    await expect(sendOrderNow(someCustomerId(), 'o-1')).rejects.toMatchObject({ kind: 'upstream' });
  });

  it('gives a write ten seconds, not five', async () => {
    const customerId = someCustomerId();

    // Prime the header with real timers so only the Ordergroove call is under the fake clock.
    mockPayments([]);
    await listPayments(customerId);

    vi.useFakeTimers();
    server.use(
      http.patch(`${ogBase}/orders/o-1/send_now/`, async () => {
        await delay('infinite');

        return HttpResponse.json({});
      }),
    );

    let settled = false;
    const pending = sendOrderNow(customerId, 'o-1').catch((error: unknown) => {
      settled = true;
      throw error;
    });
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });

    await vi.advanceTimersByTimeAsync(5000);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(settled).toBe(true);
  });
});
```

- [x] **Step 2: Run the file to verify the new tests fail**

Run: `yarn vitest run src/shared/service/ordergroove/api.test.ts`
Expected: the file fails to compile — `skipSubscription`, `sendOrderNow`, `changeNextOrderDate` are not exported from `./api` (TypeScript error, or "is not a function" at runtime). The existing tests stay untouched.

- [x] **Step 3: Add the schedule fields to the types**

In `types.ts`, add before `OgSubscription`:

```ts
/** Ordergroove period codes: 1 = days, 2 = weeks, 3 = months (reference "Reactivate"; manager bundle). */
export type FrequencyPeriod = 1 | 2 | 3;
```

and inside `OgSubscription`, after `frequency_days: number;`:

```ts
  /** the schedule as configured: `every` periods of `every_period`; the source of calendar date arithmetic */
  every: number;
  every_period: FrequencyPeriod;
```

- [x] **Step 4: Implement the write helper and the three functions** — replace the block from `const REQUEST_TIMEOUT_MS` through the end of `ogFetch` in `api.ts` with:

```ts
// The warning is advisory; past this the dialog falls back to "we couldn't check" (spec §6.3).
const REQUEST_TIMEOUT_MS = 5000;
// Writes get longer: a customer is watching a spinner, and a change that lands after we gave up
// still shows on the next read (Phase 3 spec §8).
const WRITE_TIMEOUT_MS = 10000;

interface Write {
  method: 'PATCH' | 'POST';
  body?: object;
}

// Promise.race rather than AbortSignal: nothing else in the portal passes signals to fetch, and
// the jsdom/undici pairing in tests has historically disagreed about AbortSignal identity.
export const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new OrdergrooveError('timeout')), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });

const request = async (
  customerId: string,
  url: string,
  retryOnForbidden: boolean,
  write?: Write,
): Promise<Response> => {
  const authorization = await getAuthorizationHeader(customerId);

  let response: Response;
  try {
    response = await withTimeout(
      fetch(url, {
        method: write?.method ?? 'GET',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: write?.body === undefined ? undefined : JSON.stringify(write.body),
      }),
      write ? WRITE_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
    );
  } catch (error) {
    throw error instanceof OrdergrooveError ? error : new OrdergrooveError('upstream');
  }

  if (response.status === 403 && retryOnForbidden) {
    // The signature can be revoked or age out server-side; mint once more before giving up.
    invalidateAuthorization();

    return request(customerId, url, false, write);
  }

  return response;
};

const parse = async <T>(response: Response): Promise<T> => {
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

const ogFetch = async <T>(customerId: string, url: string): Promise<T> =>
  parse<T>(await request(customerId, url, true));

const ogMutate = async <T>(
  customerId: string,
  url: string,
  method: Write['method'],
  body?: object,
): Promise<T> => parse<T>(await request(customerId, url, true, { method, body }));
```

Then append at the end of `api.ts`:

```ts
const orderUrl = (orderId: string, action: string) =>
  `${API_BASE}/orders/${encodeURIComponent(orderId)}/${action}/`;

// Task 0 finding A decides the trailing slash on change_next_order_date; the reference documents it.
const subscriptionUrl = (subscriptionId: string, action: string) =>
  `${API_BASE}/subscriptions/${encodeURIComponent(subscriptionId)}/${action}/`;

/** Removes this subscription's items from the order and generates its next order (spec §3.2). */
export const skipSubscription = (customerId: string, orderId: string, subscriptionId: string) =>
  ogMutate<OgOrder>(customerId, orderUrl(orderId, 'skip_subscription'), 'PATCH', {
    subscription: subscriptionId,
  });

/** Places the whole order within 24 hours — every subscription shipping on it, not just one. */
export const sendOrderNow = (customerId: string, orderId: string) =>
  ogMutate<OgOrder>(customerId, orderUrl(orderId, 'send_now'), 'PATCH');

/** `orderDate` is "YYYY-MM-DD" and must be in the future. */
export const changeNextOrderDate = (customerId: string, subscriptionId: string, orderDate: string) =>
  ogMutate<OgSubscription>(
    customerId,
    subscriptionUrl(subscriptionId, 'change_next_order_date'),
    'PATCH',
    { order_date: orderDate },
  );
```

If Task 0 finding A says **without** slash: make `subscriptionUrl` take a third parameter `trailingSlash: boolean` … no — simpler: give `changeNextOrderDate` its own literal URL without the slash, `${API_BASE}/subscriptions/${encodeURIComponent(subscriptionId)}/change_next_order_date`, delete `subscriptionUrl`, and drop the slash in the Step 1 test path.

- [x] **Step 5: Export from the barrel** — in `index.ts` add `changeNextOrderDate`, `sendOrderNow`, `skipSubscription` to the `from './api'` list (alphabetical) and `FrequencyPeriod` to the `export type` list.

- [x] **Step 6: Builder defaults** — in `tests/ordergrooveBuilders/index.ts` replace the `frequency_days` line of `buildOgSubscriptionWith` with three consistent lines:

```ts
  frequency_days: 28,
  every: 4,
  every_period: 2,
```

- [x] **Step 7: Run the file to verify everything passes**

Run: `yarn vitest run src/shared/service/ordergroove/api.test.ts`
Expected: all tests pass, including the pre-existing "gives up after five seconds" (reads keep their deadline).

- [x] **Step 8: Type-check the whole tree** — `yarn tsc --noEmit`. Expected: exit 0 (every `OgSubscription` literal in tests comes from the builder, so the two new required fields need no other edits; if a hand-written literal fails, add `every: 4, every_period: 2` to it).

- [x] **Step 9: Commit**

```bash
git add src/shared/service/ordergroove/types.ts src/shared/service/ordergroove/api.ts src/shared/service/ordergroove/index.ts src/shared/service/ordergroove/api.test.ts tests/ordergrooveBuilders/index.ts
git commit -m "feat: B2B-0000 Add Ordergroove write helper and the skip, send-now and change-date calls" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: View model — upcoming order, sibling products, schedule fields, date helpers

**Files:**
- Modify: `src/pages/ManageSubscriptions/viewModel.ts`
- Modify: `src/pages/ManageSubscriptions/components/SubscriptionCard.test.tsx:14-35` (the card builder gains the new fields)
- Test: `src/pages/ManageSubscriptions/viewModel.test.ts`

**Interfaces:**
- Consumes: `FrequencyPeriod`, `OgItem`, `OgSubscription` (Task 1).
- Produces:
  - `SubscriptionCard` gains `every: number`, `everyPeriod: FrequencyPeriod`, `shippingAddressId: string`, `nextOrder: { orderId: string; otherProducts: { externalProductId: string; name: string | null }[] } | null`;
  - `export interface PaymentSummary` (was private);
  - `addIntervals(date: string, every: number, period: FrequencyPeriod, multiplier: number): string` → "YYYY-MM-DD";
  - `export interface DatePreset { every: number; period: FrequencyPeriod; date: string }`;
  - `changeDatePresets(card: SubscriptionCard): DatePreset[]` — three presets, or `[]` without a next order.

- [x] **Step 1: Write the failing tests** — append to `viewModel.test.ts` (add `OgItem` to the `@/shared/service/ordergroove` type imports if you use the annotation; add `addIntervals`, `changeDatePresets` to the `./viewModel` import):

```ts
describe('upcoming order and schedule on a card', () => {
  it("names the upcoming order and the other subscriptions' products on it, once each", () => {
    const subscription = buildOgSubscriptionWith({ product: '9537_12118' });
    const sibling = buildOgSubscriptionWith({ product: '7674_9534' });
    const twin = buildOgSubscriptionWith({ product: '7674_9534' });
    const unnamed = buildOgSubscriptionWith({ product: '1_2' });
    const order = buildOgOrderWith({ status: 1, place: '2026-10-03 00:00:00' });
    const items = [
      buildOgItemWith({ order: order.public_id, subscription: subscription.public_id, product: '9537_12118' }),
      buildOgItemWith({ order: order.public_id, subscription: sibling.public_id, product: '7674_9534' }),
      buildOgItemWith({ order: order.public_id, subscription: twin.public_id, product: '7674_9534' }),
      buildOgItemWith({ order: order.public_id, subscription: unnamed.public_id, product: '1_2' }),
      // A one-time upsell line has no subscription and never counts as a sibling.
      buildOgItemWith({ order: order.public_id, subscription: null, product: '5_5' }),
    ];

    const [card] = buildSubscriptionCards([subscription], {
      ...nothingLoaded,
      products: new Map([['7674_9534', buildOgProductWith({ name: 'Kraft Bags' })]]),
      upcoming: { orders: [order], items },
    }).active;

    expect(card.nextOrderDate).toBe('2026-10-03');
    expect(card.nextOrder).toEqual({
      orderId: order.public_id,
      otherProducts: [
        { externalProductId: '7674_9534', name: 'Kraft Bags' },
        { externalProductId: '1_2', name: null },
      ],
    });
  });

  it('points at the earliest order when the subscription has items on several', () => {
    const subscription = buildOgSubscriptionWith('WHATEVER_VALUES');
    const later = buildOgOrderWith({ status: 1, place: '2026-11-07 00:00:00' });
    const sooner = buildOgOrderWith({ status: 1, place: '2026-10-10 00:00:00' });

    const [card] = buildSubscriptionCards([subscription], {
      ...nothingLoaded,
      upcoming: {
        orders: [later, sooner],
        items: [
          buildOgItemWith({ order: later.public_id, subscription: subscription.public_id }),
          buildOgItemWith({ order: sooner.public_id, subscription: subscription.public_id }),
        ],
      },
    }).active;

    expect(card.nextOrder?.orderId).toBe(sooner.public_id);
    expect(card.nextOrder?.otherProducts).toEqual([]);
  });

  it('carries the raw schedule and the address id, and no order while nothing is scheduled', () => {
    const subscription = buildOgSubscriptionWith({
      every: 6,
      every_period: 2,
      shipping_address: 'addr-1',
    });

    const [card] = buildSubscriptionCards([subscription], nothingLoaded).active;

    expect(card).toMatchObject({
      every: 6,
      everyPeriod: 2,
      shippingAddressId: 'addr-1',
      nextOrder: null,
    });
  });
});

describe('date arithmetic', () => {
  it('adds calendar intervals the way the hosted manager does', () => {
    // Observed on the manager 2026-09-17: Sep 19 + 10 months = Jul 19 2027; + 2 months = Nov 19.
    expect(addIntervals('2026-09-19', 10, 3, 1)).toBe('2027-07-19');
    expect(addIntervals('2026-09-19', 2, 3, 1)).toBe('2026-11-19');
    expect(addIntervals('2026-09-29', 2, 2, 1)).toBe('2026-10-13');
    expect(addIntervals('2026-09-29', 2, 2, 3)).toBe('2026-11-10');
    expect(addIntervals('2026-09-19', 12, 1, 2)).toBe('2026-10-13');
    // Month arithmetic clamps to the last day, as dayjs does.
    expect(addIntervals('2026-01-31', 1, 3, 1)).toBe('2026-02-28');
  });

  it('offers presets at one, two and three intervals after the next order', () => {
    const subscription = buildOgSubscriptionWith({ every: 10, every_period: 3 });
    const order = buildOgOrderWith({ status: 1, place: '2026-09-19 00:00:00' });
    const [card] = buildSubscriptionCards([subscription], {
      ...nothingLoaded,
      upcoming: {
        orders: [order],
        items: [buildOgItemWith({ order: order.public_id, subscription: subscription.public_id })],
      },
    }).active;

    expect(changeDatePresets(card)).toEqual([
      { every: 10, period: 3, date: '2027-07-19' },
      { every: 20, period: 3, date: '2028-05-19' },
      { every: 30, period: 3, date: '2029-03-19' },
    ]);
  });

  it('has no presets without an upcoming order', () => {
    const [card] = buildSubscriptionCards(
      [buildOgSubscriptionWith('WHATEVER_VALUES')],
      nothingLoaded,
    ).active;

    expect(changeDatePresets(card)).toEqual([]);
  });
});
```

- [x] **Step 2: Run the file to verify the new tests fail**

Run: `yarn vitest run src/pages/ManageSubscriptions/viewModel.test.ts`
Expected: compile errors — `addIntervals` and `changeDatePresets` are not exported; `nextOrder`, `every`, `everyPeriod`, `shippingAddressId` do not exist on `SubscriptionCard`.

- [x] **Step 3: Implement** — in `viewModel.ts`:

1. Imports: add `import dayjs from 'dayjs';` as the first (external) import group, and add `FrequencyPeriod` to the `@/shared/service/ordergroove` import list.

2. Make `PaymentSummary` exported (`export interface PaymentSummary`).

3. Add after `PaymentSummary`:

```ts
interface SiblingProduct {
  externalProductId: string;
  /** null until the product lookup names it (the component falls back to "Product {id}") */
  name: string | null;
}

interface NextOrder {
  /** Ordergroove order public_id — the target of skip and send now */
  orderId: string;
  /** the other subscriptions' products shipping on that order, one entry per product */
  otherProducts: SiblingProduct[];
}
```

4. Extend `SubscriptionCard`:

```ts
export interface SubscriptionCard {
  publicId: string;
  externalProductId: string;
  product: ProductSummary | null;
  quantity: number;
  frequencyDays: number;
  every: number;
  everyPeriod: FrequencyPeriod;
  /** "YYYY-MM-DD" of the earliest upcoming order holding one of its items */
  nextOrderDate: string | null;
  /** that order, with what else ships on it; null while nothing is scheduled */
  nextOrder: NextOrder | null;
  shippingAddress: AddressSummary | null;
  /** Ordergroove address public_id the subscription ships to */
  shippingAddressId: string;
  payment: PaymentSummary | null;
  /** Ordergroove timestamp when cancelled; null for active cards and for retired ones with no date */
  cancelledOn: string | null;
}
```

5. Replace `nextOrderDates` with an earliest-order join and a sibling lookup:

```ts
interface UpcomingOrder {
  orderId: string;
  date: string;
}

// subscription public_id → the earliest upcoming order holding one of its items.
const earliestOrders = (upcoming: SubscriptionLookups['upcoming']) => {
  const earliest = new Map<string, UpcomingOrder>();
  if (!upcoming) {
    return earliest;
  }
  const placeByOrder = new Map(
    upcoming.orders.map((order) => [order.public_id, placeDate(order.place)]),
  );
  upcoming.items.forEach((item) => {
    const date = item.subscription ? placeByOrder.get(item.order) : undefined;
    if (!item.subscription || !date) {
      return;
    }
    const current = earliest.get(item.subscription);
    // ISO dates compare correctly as strings.
    if (!current || date < current.date) {
      earliest.set(item.subscription, { orderId: item.order, date });
    }
  });

  return earliest;
};

// The other subscriptions' products on an order, once per product; one-time lines never count.
const otherProductsOn = (
  orderId: string,
  subscriptionId: string,
  items: OgItem[],
  products: SubscriptionLookups['products'],
): SiblingProduct[] => {
  const seen = new Set<string>();

  return items
    .filter(
      (item) =>
        item.order === orderId &&
        item.subscription !== null &&
        item.subscription !== subscriptionId,
    )
    .filter((item) => {
      if (seen.has(item.product)) {
        return false;
      }
      seen.add(item.product);

      return true;
    })
    .map((item) => ({
      externalProductId: item.product,
      name: products?.get(item.product)?.name ?? null,
    }));
};
```

6. In `buildSubscriptionCards`, replace `const nextDates = nextOrderDates(lookups.upcoming);` with `const earliest = earliestOrders(lookups.upcoming);` and rewrite `toCard`:

```ts
  const toCard = (subscription: OgSubscription): SubscriptionCard => {
    const product = lookups.products?.get(subscription.product) ?? null;
    const address = addressById.get(subscription.shipping_address);
    const payment = paymentById.get(subscription.payment);
    const upcomingOrder = earliest.get(subscription.public_id);

    return {
      publicId: subscription.public_id,
      externalProductId: subscription.product,
      product: product ? summarizeProduct(product) : null,
      quantity: subscription.quantity,
      frequencyDays: subscription.frequency_days,
      every: subscription.every,
      everyPeriod: subscription.every_period,
      nextOrderDate: upcomingOrder?.date ?? null,
      nextOrder: upcomingOrder
        ? {
            orderId: upcomingOrder.orderId,
            otherProducts: otherProductsOn(
              upcomingOrder.orderId,
              subscription.public_id,
              lookups.upcoming?.items ?? [],
              lookups.products,
            ),
          }
        : null,
      shippingAddress: address ? summarizeAddress(address) : null,
      shippingAddressId: subscription.shipping_address,
      payment: payment ? summarizePayment(payment) : null,
      cancelledOn: subscription.cancelled,
    };
  };
```

7. Add the date helpers after `buildSubscriptionCards`:

```ts
const PERIOD_UNITS: Record<FrequencyPeriod, 'day' | 'week' | 'month'> = {
  1: 'day',
  2: 'week',
  3: 'month',
};

/**
 * `date` plus `multiplier` intervals of the schedule, "YYYY-MM-DD". Calendar arithmetic, as the
 * hosted manager does it: Sep 19 + 10 months is Jul 19, which `frequency_days` would miss.
 */
export const addIntervals = (
  date: string,
  every: number,
  period: FrequencyPeriod,
  multiplier: number,
) => dayjs(date).add(every * multiplier, PERIOD_UNITS[period]).format('YYYY-MM-DD');

export interface DatePreset {
  /** the offset in the card's period unit, e.g. 20 (months) for the second preset */
  every: number;
  period: FrequencyPeriod;
  /** "YYYY-MM-DD" */
  date: string;
}

/** The manager's pause presets: one, two and three intervals after the next order (spec §4.2). */
export const changeDatePresets = (card: SubscriptionCard): DatePreset[] => {
  const from = card.nextOrderDate;
  if (!from) {
    return [];
  }

  return [1, 2, 3].map((multiplier) => ({
    every: card.every * multiplier,
    period: card.everyPeriod,
    date: addIntervals(from, card.every, card.everyPeriod, multiplier),
  }));
};
```

- [x] **Step 4: Update the card builder in `components/SubscriptionCard.test.tsx`** — add to the `buildCardWith` defaults, after `frequencyDays: 28,`:

```ts
  every: 4,
  everyPeriod: 2,
  nextOrder: null,
  shippingAddressId: faker.string.hexadecimal({ length: 32, prefix: '' }),
```

- [x] **Step 5: Run the view-model and card tests**

Run: `yarn vitest run src/pages/ManageSubscriptions/viewModel.test.ts src/pages/ManageSubscriptions/components/SubscriptionCard.test.tsx`
Expected: all pass (the existing view-model tests are unaffected: they assert `nextOrderDate`, which keeps its value).

- [x] **Step 6: Type-check** — `yarn tsc --noEmit`. Expected: exit 0.

- [x] **Step 7: Commit**

```bash
git add src/pages/ManageSubscriptions/viewModel.ts src/pages/ManageSubscriptions/viewModel.test.ts src/pages/ManageSubscriptions/components/SubscriptionCard.test.tsx
git commit -m "feat: B2B-0000 Carry the upcoming order, sibling products and calendar presets on subscription cards" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The actions hook and its copy

**Files:**
- Create: `src/pages/ManageSubscriptions/hooks/useSubscriptionActions.ts`
- Modify: `src/lib/lang/locales/en.json` (after the `subscriptions.cancelled.toggle` line)
- Test: `src/pages/ManageSubscriptions/hooks/useSubscriptionActions.test.tsx`

**Interfaces:**
- Consumes: `skipSubscription`, `sendOrderNow`, `changeNextOrderDate`, `OrdergrooveError` (Task 1); `snackbar` from `@/utils/b3Tip`; `useB3Lang`.
- Produces: `useSubscriptionActions(customerId: number)` returning
  `{ skip: UseMutationResult<OgOrder, Error, { orderId: string; subscriptionId: string }>, sendNow: UseMutationResult<OgOrder, Error, { orderId: string }>, changeDate: UseMutationResult<OgSubscription, Error, { subscriptionId: string; orderDate: string }> }`.

- [x] **Step 1: Add the copy** — in `en.json`, directly after the `"subscriptions.cancelled.toggle": …,` line:

```json
  "subscriptions.actions.skip": "Skip",
  "subscriptions.actions.sendNow": "Send now",
  "subscriptions.actions.changeDate": "Change date",
  "subscriptions.actions.error": "We couldn't apply that change. Please try again.",
  "subscriptions.actions.skip.title": "Skip next order",
  "subscriptions.actions.skip.body": "{product} will leave your order on {date}. Your next order will be on {nextDate}.",
  "subscriptions.actions.skip.confirm": "Skip",
  "subscriptions.actions.skip.success": "Next order skipped.",
  "subscriptions.actions.sendNow.title": "Send order now",
  "subscriptions.actions.sendNow.body": "Your order will be placed within 24 hours and charged to {card}.",
  "subscriptions.actions.sendNow.bodyNoCard": "Your order will be placed within 24 hours.",
  "subscriptions.actions.sendNow.alsoIncludes": "This order also includes:",
  "subscriptions.actions.sendNow.confirm": "Send now",
  "subscriptions.actions.sendNow.success": "Order on its way. It will be placed within 24 hours.",
  "subscriptions.actions.changeDate.title": "Change next order date",
  "subscriptions.actions.changeDate.preset": "In {offset} ({date})",
  "subscriptions.actions.changeDate.offsetDays": "{count, plural, one {# day} other {# days}}",
  "subscriptions.actions.changeDate.offsetWeeks": "{count, plural, one {# week} other {# weeks}}",
  "subscriptions.actions.changeDate.offsetMonths": "{count, plural, one {# month} other {# months}}",
  "subscriptions.actions.changeDate.pick": "Pick a date",
  "subscriptions.actions.changeDate.pickerLabel": "Next order date",
  "subscriptions.actions.changeDate.pickerHint": "Choose a date after today.",
  "subscriptions.actions.changeDate.confirm": "Save",
  "subscriptions.actions.changeDate.success": "Next order date updated.",
```

(Do not lint `en.json` directly with eslint — it reports a bogus error on JSON; `yarn lint:eslint` skips it.)

- [x] **Step 2: Write the failing test** — `hooks/useSubscriptionActions.test.tsx`. The hook needs react-intl (via `useB3Lang`), so it renders through `renderWithProviders` with a probe component; invalidation is observed on `QueryClient.prototype`, which every client instance shares.

```tsx
import { QueryClient } from '@tanstack/react-query';
import {
  buildOgOrderWith,
  buildOgSubscriptionWith,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  startMockServer,
  waitFor,
} from 'tests/test-utils';
import type { MockInstance } from 'vitest';

import { snackbar } from '@/utils/b3Tip';

import { useSubscriptionActions } from './useSubscriptionActions';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

type Actions = ReturnType<typeof useSubscriptionActions>;
let latest: Actions | undefined;
// Every QueryClient instance shares the prototype, so this sees renderWithProviders' private client.
let invalidate: MockInstance;

function Probe({ customerId }: { customerId: number }) {
  latest = useSubscriptionActions(customerId);

  return null;
}

const actions = () => {
  if (!latest) {
    throw new Error('the probe has not rendered');
  }

  return latest;
};

const renderActions = () => {
  // Drawn outside the render: a value generated per render would re-key every query each render.
  const customerId = faker.number.int({ min: 1, max: 1_000_000 });
  renderWithProviders(<Probe customerId={customerId} />);

  return { customerId };
};

const invalidatedKeys = () =>
  invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown[] }).queryKey);

beforeEach(() => {
  window.BC_CONTEXT = {
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
  );
});

afterEach(() => {
  delete window.BC_CONTEXT;
  latest = undefined;
  invalidate.mockRestore();
  vi.clearAllMocks();
});

it('skips, then refreshes subscriptions and upcoming orders, then confirms', async () => {
  const received = vi.fn();
  server.use(
    http.patch(`${ogBase}/orders/o-1/skip_subscription/`, async ({ request }) => {
      received(await request.json());

      return HttpResponse.json(buildOgOrderWith('WHATEVER_VALUES'));
    }),
  );
  const { customerId } = renderActions();

  actions().skip.mutate({ orderId: 'o-1', subscriptionId: 's-1' });

  await waitFor(() => expect(actions().skip.isSuccess).toBe(true));
  expect(received).toHaveBeenCalledWith({ subscription: 's-1' });
  expect(invalidatedKeys()).toEqual([
    ['ordergroove', customerId, 'subscriptions'],
    ['ordergroove', customerId, 'upcoming'],
  ]);
  expect(snackbar.success).toHaveBeenCalledWith('Next order skipped.');
  expect(snackbar.error).not.toHaveBeenCalled();
});

it('sends now and also refreshes order history', async () => {
  server.use(
    http.patch(`${ogBase}/orders/o-1/send_now/`, () =>
      HttpResponse.json(buildOgOrderWith('WHATEVER_VALUES')),
    ),
  );
  const { customerId } = renderActions();

  actions().sendNow.mutate({ orderId: 'o-1' });

  await waitFor(() => expect(actions().sendNow.isSuccess).toBe(true));
  expect(invalidatedKeys()).toEqual([
    ['ordergroove', customerId, 'subscriptions'],
    ['ordergroove', customerId, 'upcoming'],
    ['ordergroove', customerId, 'orderHistory'],
  ]);
  expect(snackbar.success).toHaveBeenCalledWith(
    'Order on its way. It will be placed within 24 hours.',
  );
});

it('changes the next order date', async () => {
  const received = vi.fn();
  server.use(
    http.patch(`${ogBase}/subscriptions/s-1/change_next_order_date/`, async ({ request }) => {
      received(await request.json());

      return HttpResponse.json(buildOgSubscriptionWith('WHATEVER_VALUES'));
    }),
  );
  const { customerId } = renderActions();

  actions().changeDate.mutate({ subscriptionId: 's-1', orderDate: '2026-10-31' });

  await waitFor(() => expect(actions().changeDate.isSuccess).toBe(true));
  expect(received).toHaveBeenCalledWith({ order_date: '2026-10-31' });
  expect(invalidatedKeys()).toEqual([
    ['ordergroove', customerId, 'subscriptions'],
    ['ordergroove', customerId, 'upcoming'],
  ]);
  expect(snackbar.success).toHaveBeenCalledWith('Next order date updated.');
});

it('reports a failed write and leaves the cache alone', async () => {
  server.use(
    http.patch(`${ogBase}/orders/o-1/send_now/`, () => new HttpResponse(null, { status: 500 })),
  );
  renderActions();

  actions().sendNow.mutate({ orderId: 'o-1' });

  await waitFor(() => expect(actions().sendNow.isError).toBe(true));
  expect(invalidate).not.toHaveBeenCalled();
  expect(snackbar.error).toHaveBeenCalledWith("We couldn't apply that change. Please try again.");
  expect(snackbar.success).not.toHaveBeenCalled();
});

it('uses the session copy when Ordergroove rejects the signature twice', async () => {
  server.use(
    http.patch(`${ogBase}/orders/o-1/send_now/`, () =>
      HttpResponse.json({ detail: 'Authentication Failed' }, { status: 403 }),
    ),
  );
  renderActions();

  actions().sendNow.mutate({ orderId: 'o-1' });

  await waitFor(() => expect(actions().sendNow.isError).toBe(true));
  expect(snackbar.error).toHaveBeenCalledWith('Your session has expired — please sign in again.');
});
```

- [x] **Step 3: Run it to verify it fails**

Run: `yarn vitest run src/pages/ManageSubscriptions/hooks/useSubscriptionActions.test.tsx`
Expected: fails — cannot resolve `./useSubscriptionActions`.

- [x] **Step 4: Implement the hook** — `hooks/useSubscriptionActions.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import {
  changeNextOrderDate,
  OrdergrooveError,
  sendOrderNow,
  skipSubscription,
} from '@/shared/service/ordergroove';
import { snackbar } from '@/utils/b3Tip';

/**
 * The three 3a writes as mutations. Success re-reads the resources a write changes and confirms
 * with a snackbar; failure reports and changes nothing locally (spec §5). Each card instantiates
 * this hook, so pending state is per card.
 */
export const useSubscriptionActions = (customerId: number) => {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();
  const id = String(customerId);

  // Awaited so the mutation stays pending until the cards show the new state (spec §5.2).
  const refresh = (resources: string[]) =>
    Promise.all(
      resources.map((resource) =>
        queryClient.invalidateQueries({ queryKey: ['ordergroove', customerId, resource] }),
      ),
    );

  const succeed = async (messageKey: string, resources: string[]) => {
    snackbar.success(b3Lang(messageKey));
    await refresh(resources);
  };

  const onError = (error: unknown) => {
    const expired = error instanceof OrdergrooveError && error.kind === 'sessionExpired';
    snackbar.error(
      b3Lang(expired ? 'subscriptions.sessionExpired' : 'subscriptions.actions.error'),
    );
  };

  const skip = useMutation({
    mutationFn: ({ orderId, subscriptionId }: { orderId: string; subscriptionId: string }) =>
      skipSubscription(id, orderId, subscriptionId),
    onSuccess: () => succeed('subscriptions.actions.skip.success', ['subscriptions', 'upcoming']),
    onError,
  });

  const sendNow = useMutation({
    mutationFn: ({ orderId }: { orderId: string }) => sendOrderNow(id, orderId),
    // The sent order leaves the upcoming set and appears in history.
    onSuccess: () =>
      succeed('subscriptions.actions.sendNow.success', [
        'subscriptions',
        'upcoming',
        'orderHistory',
      ]),
    onError,
  });

  const changeDate = useMutation({
    mutationFn: ({ subscriptionId, orderDate }: { subscriptionId: string; orderDate: string }) =>
      changeNextOrderDate(id, subscriptionId, orderDate),
    onSuccess: () =>
      succeed('subscriptions.actions.changeDate.success', ['subscriptions', 'upcoming']),
    onError,
  });

  return { skip, sendNow, changeDate };
};
```

- [x] **Step 5: Run it to verify it passes**

Run: `yarn vitest run src/pages/ManageSubscriptions/hooks/useSubscriptionActions.test.tsx`
Expected: 5 passed.

- [x] **Step 6: Commit**

```bash
git add src/pages/ManageSubscriptions/hooks/useSubscriptionActions.ts src/pages/ManageSubscriptions/hooks/useSubscriptionActions.test.tsx src/lib/lang/locales/en.json
git commit -m "feat: B2B-0000 Add the subscription actions hook with refresh and snackbar feedback" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The three dialogs and the shared formatting helpers

**Files:**
- Create: `src/pages/ManageSubscriptions/format.ts`
- Modify: `src/pages/ManageSubscriptions/components/SubscriptionCard.tsx` (use `format.ts`; add the `actions` slot)
- Create: `src/pages/ManageSubscriptions/components/actions/SkipDialog.tsx`
- Create: `src/pages/ManageSubscriptions/components/actions/SendNowDialog.tsx`
- Create: `src/pages/ManageSubscriptions/components/actions/ChangeDateDialog.tsx`
- Test: `src/pages/ManageSubscriptions/components/actions/SkipDialog.test.tsx`, `SendNowDialog.test.tsx`, `ChangeDateDialog.test.tsx`

**Interfaces:**
- Consumes: `SubscriptionCard`, `PaymentSummary`, `addIntervals`, `changeDatePresets`, `DatePreset` (Task 2); `B3Dialog` (`@/components/B3Dialog`); `useB3Lang`, `LangFormatFunction` (`@/lib/lang`); `displayFormat` (`@/utils/b3DateFormat`).
- Produces:
  - `formatDate(date: string): string`; `describePayment(payment: PaymentSummary, b3Lang: LangFormatFunction): string`;
  - `SkipDialog` props `{ card: SubscriptionCard; isOpen: boolean; isPending: boolean; onClose: () => void; onConfirm: () => void }`;
  - `SendNowDialog` props — same shape as `SkipDialog`;
  - `ChangeDateDialog` props `{ card; isOpen; isPending; onClose; onConfirm: (orderDate: string) => void }`;
  - `SubscriptionCard` prop `actions?: ReactNode` rendered at the end of the details group.

- [x] **Step 1: Write the failing dialog tests.** Each test file renders the dialog **closed, then open** (see Global Constraints on `B3Dialog`). Shared shape, in `SkipDialog.test.tsx`:

```tsx
import { ReactElement } from 'react';
import {
  builder,
  buildStoreInfoStateWith,
  faker,
  renderWithProviders,
  screen,
} from 'tests/test-utils';

import { SubscriptionCard as SubscriptionCardModel } from '../../viewModel';

import SkipDialog from './SkipDialog';

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  externalProductId: '9537_12118',
  product: {
    name: faker.commerce.productName(),
    imageUrl: null,
    detailUrl: null,
    sku: null,
  },
  quantity: 1,
  frequencyDays: 28,
  every: 4,
  everyPeriod: 2,
  nextOrderDate: '2026-10-03',
  nextOrder: { orderId: faker.string.hexadecimal({ length: 32, prefix: '' }), otherProducts: [] },
  shippingAddress: null,
  shippingAddressId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  payment: null,
  cancelledOn: null,
}));

// The store's date display format is blank by default; dates below render as "3 Oct 2026".
const withDateFormat = {
  preloadedState: { storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } }) },
};

// B3Dialog opens only on a re-render after its container ref exists: render closed, then open.
const renderOpen = (dialog: (isOpen: boolean) => ReactElement) => {
  // `view`, not `rendered`: the testing-library lint rule names render results.
  const view = renderWithProviders(dialog(false), withDateFormat);
  view.result.rerender(dialog(true));

  return view;
};

it('says what leaves which order and when it comes back, then confirms', async () => {
  const onConfirm = vi.fn();
  const card = buildCardWith({
    product: { name: 'Kraft Paper Shopping Bags', imageUrl: null, detailUrl: null, sku: null },
    nextOrderDate: '2026-09-19',
    every: 10,
    everyPeriod: 3,
  });

  const { user } = renderOpen((isOpen) => (
    <SkipDialog
      card={card}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  expect(screen.getByRole('dialog')).toHaveTextContent(
    'Kraft Paper Shopping Bags will leave your order on 19 Sep 2026. Your next order will be on 19 Jul 2027.',
  );
  await user.click(screen.getByRole('button', { name: 'Skip' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it('falls back to the product id while the name is unknown', () => {
  const card = buildCardWith({ product: null, externalProductId: '1_2' });

  renderOpen((isOpen) => (
    <SkipDialog card={card} isOpen={isOpen} isPending={false} onClose={vi.fn()} onConfirm={vi.fn()} />
  ));

  expect(screen.getByRole('dialog')).toHaveTextContent('Product 1_2 will leave your order');
});

it('disables Skip while the write is pending and does not close on Cancel', async () => {
  const onClose = vi.fn();

  const { user } = renderOpen((isOpen) => (
    <SkipDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending
      onClose={onClose}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).not.toHaveBeenCalled();
});

it('closes on Cancel when idle', async () => {
  const onClose = vi.fn();

  const { user } = renderOpen((isOpen) => (
    <SkipDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending={false}
      onClose={onClose}
      onConfirm={vi.fn()}
    />
  ));

  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
```

`SendNowDialog.test.tsx` — same imports, `buildCardWith`, `withDateFormat` and `renderOpen` as above (repeat them; each test file is self-contained), then:

```tsx
it('names the card and lists the other products shipping in the same order', async () => {
  const onConfirm = vi.fn();
  const card = buildCardWith({
    payment: { brand: 'Visa', last4: '1111', expiry: '3/2028' },
    nextOrder: {
      orderId: 'o-1',
      otherProducts: [
        { externalProductId: '7674_9534', name: 'Kraft Bags' },
        { externalProductId: '1_2', name: null },
      ],
    },
  });

  const { user } = renderOpen((isOpen) => (
    <SendNowDialog
      card={card}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent(
    'Your order will be placed within 24 hours and charged to Visa ending in 1111 · exp 3/2028.',
  );
  expect(dialog).toHaveTextContent('This order also includes:');
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Kraft Bags',
    'Product 1_2',
  ]);
  await user.click(screen.getByRole('button', { name: 'Send now' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it('omits the card when the payment is unknown and the list when the subscription ships alone', () => {
  const card = buildCardWith({ payment: null, nextOrder: { orderId: 'o-1', otherProducts: [] } });

  renderOpen((isOpen) => (
    <SendNowDialog card={card} isOpen={isOpen} isPending={false} onClose={vi.fn()} onConfirm={vi.fn()} />
  ));

  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('Your order will be placed within 24 hours.');
  expect(dialog).not.toHaveTextContent('charged to');
  expect(dialog).not.toHaveTextContent('This order also includes');
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

it('disables Send now while pending', () => {
  renderOpen((isOpen) => (
    <SendNowDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('button', { name: 'Send now' })).toBeDisabled();
});
```

`ChangeDateDialog.test.tsx` — same preamble (add `fireEvent` to the `tests/test-utils` import and `import dayjs from 'dayjs';`), then:

```tsx
it('offers three presets after the next order and saves the chosen one', async () => {
  const onConfirm = vi.fn();
  const card = buildCardWith({ nextOrderDate: '2026-09-19', every: 10, everyPeriod: 3 });

  const { user } = renderOpen((isOpen) => (
    <ChangeDateDialog
      card={card}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  // Role queries only: the testing-library lint rules forbid reaching for DOM nodes.
  expect(screen.getAllByRole('radio')).toHaveLength(4);
  expect(screen.getByRole('radio', { name: 'In 10 months (19 Jul 2027)' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'In 20 months (19 May 2028)' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'In 30 months (19 Mar 2029)' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Pick a date' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

  await user.click(screen.getByRole('radio', { name: 'In 20 months (19 May 2028)' }));
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(onConfirm).toHaveBeenCalledWith('2028-05-19');
});

it('labels week and day offsets in their own units', () => {
  const card = buildCardWith({ nextOrderDate: '2026-09-29', every: 2, everyPeriod: 2 });

  renderOpen((isOpen) => (
    <ChangeDateDialog card={card} isOpen={isOpen} isPending={false} onClose={vi.fn()} onConfirm={vi.fn()} />
  ));

  expect(screen.getByRole('radio', { name: 'In 2 weeks (13 Oct 2026)' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'In 6 weeks (10 Nov 2026)' })).toBeInTheDocument();
});

it('accepts a typed date only when it is after today', async () => {
  const onConfirm = vi.fn();
  const today = dayjs().format('YYYY-MM-DD');
  const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');

  const { user } = renderOpen((isOpen) => (
    <ChangeDateDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  await user.click(screen.getByRole('radio', { name: 'Pick a date' }));
  const input = screen.getByLabelText('Next order date');
  expect(input).toHaveAttribute('min', tomorrow);

  fireEvent.change(input, { target: { value: today } });
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.getByText('Choose a date after today.')).toBeInTheDocument();

  fireEvent.change(input, { target: { value: tomorrow } });
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(onConfirm).toHaveBeenCalledWith(tomorrow);
});

it('forgets the previous choice when reopened', async () => {
  const card = buildCardWith({ nextOrderDate: '2026-09-19', every: 10, everyPeriod: 3 });
  const dialog = (isOpen: boolean) => (
    <ChangeDateDialog card={card} isOpen={isOpen} isPending={false} onClose={vi.fn()} onConfirm={vi.fn()} />
  );

  const { user, result } = renderOpen(dialog);
  await user.click(screen.getByRole('radio', { name: 'In 10 months (19 Jul 2027)' }));
  result.rerender(dialog(false));
  result.rerender(dialog(true));

  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.getByRole('radio', { name: 'In 10 months (19 Jul 2027)' })).not.toBeChecked();
});
```

- [x] **Step 2: Run the three files to verify they fail**

Run: `yarn vitest run src/pages/ManageSubscriptions/components/actions`
Expected: three files fail to resolve their dialog module.

- [x] **Step 3: Create `format.ts`**

```ts
import { LangFormatFunction } from '@/lib/lang';
import { displayFormat } from '@/utils/b3DateFormat';

import { PaymentSummary } from './viewModel';

/** "YYYY-MM-DD" (or an Ordergroove timestamp) in the store's display date format. */
export const formatDate = (date: string) => String(displayFormat(date, true));

/** "Visa ending in 1111 · exp 3/2028", or the unbranded form for a card type the table does not name. */
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

- [x] **Step 4: Point the card at `format.ts` and add the `actions` slot** — in `SubscriptionCard.tsx`:

1. Replace `import { displayFormat } from '@/utils/b3DateFormat';` with nothing, and add after the `viewModel` import: `import { describePayment, formatDate } from '../format';`. Add `ReactNode` to the imports: `import { ReactNode } from 'react';` as the first import.
2. Delete the local `const formatDate = …` line.
3. Replace the `paymentText` function with:

```ts
  const paymentText = () => (card.payment ? describePayment(card.payment, b3Lang) : null);
```

4. Add `actions?: ReactNode;` to `SubscriptionCardProps` (with a doc comment: `/** the actions row (Phase 3); rendered at the end of the details group */`), destructure it in the component signature, and render `{actions}` as the last child of the `role="group"` box, after the "Paid with" `Typography`.

- [x] **Step 5: Create `SkipDialog.tsx`**

```tsx
import { Typography } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';

import { formatDate } from '../../format';
import { addIntervals, SubscriptionCard } from '../../viewModel';

interface SkipDialogProps {
  card: SubscriptionCard;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function SkipDialog({ card, isOpen, isPending, onClose, onConfirm }: SkipDialogProps) {
  const b3Lang = useB3Lang();

  const product =
    card.product?.name ??
    b3Lang('subscriptions.card.unnamedProduct', { id: card.externalProductId });
  // The manager shows the same projection: one interval after the order being skipped.
  const body =
    card.nextOrderDate &&
    b3Lang('subscriptions.actions.skip.body', {
      product,
      date: formatDate(card.nextOrderDate),
      nextDate: formatDate(addIntervals(card.nextOrderDate, card.every, card.everyPeriod, 1)),
    });

  return (
    <B3Dialog
      isOpen={isOpen}
      title={b3Lang('subscriptions.actions.skip.title')}
      rightSizeBtn={b3Lang('subscriptions.actions.skip.confirm')}
      loading={isPending}
      handleLeftClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
      handRightClick={onConfirm}
    >
      <Typography>{body}</Typography>
    </B3Dialog>
  );
}

export default SkipDialog;
```

- [x] **Step 6: Create `SendNowDialog.tsx`**

```tsx
import { Box, Typography } from '@mui/material';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';

import { describePayment } from '../../format';
import { SubscriptionCard } from '../../viewModel';

interface SendNowDialogProps {
  card: SubscriptionCard;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function SendNowDialog({ card, isOpen, isPending, onClose, onConfirm }: SendNowDialogProps) {
  const b3Lang = useB3Lang();

  const body = card.payment
    ? b3Lang('subscriptions.actions.sendNow.body', { card: describePayment(card.payment, b3Lang) })
    : b3Lang('subscriptions.actions.sendNow.bodyNoCard');
  // Send now is order-scoped: everything shipping on that date goes with it (spec decision 2).
  const others = card.nextOrder?.otherProducts ?? [];

  return (
    <B3Dialog
      isOpen={isOpen}
      title={b3Lang('subscriptions.actions.sendNow.title')}
      rightSizeBtn={b3Lang('subscriptions.actions.sendNow.confirm')}
      loading={isPending}
      handleLeftClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
      handRightClick={onConfirm}
    >
      <Typography>{body}</Typography>
      {others.length > 0 && (
        <>
          <Typography sx={{ mt: 2 }}>
            {b3Lang('subscriptions.actions.sendNow.alsoIncludes')}
          </Typography>
          <Box component="ul" sx={{ mt: 1, pl: 3 }}>
            {others.map((other) => (
              <li key={other.externalProductId}>
                {other.name ??
                  b3Lang('subscriptions.card.unnamedProduct', { id: other.externalProductId })}
              </li>
            ))}
          </Box>
        </>
      )}
    </B3Dialog>
  );
}

export default SendNowDialog;
```

- [x] **Step 7: Create `ChangeDateDialog.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { FormControlLabel, Radio, RadioGroup, TextField } from '@mui/material';
import dayjs from 'dayjs';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';
import { FrequencyPeriod } from '@/shared/service/ordergroove';

import { formatDate } from '../../format';
import { changeDatePresets, DatePreset, SubscriptionCard } from '../../viewModel';

interface ChangeDateDialogProps {
  card: SubscriptionCard;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  /** receives "YYYY-MM-DD" */
  onConfirm: (orderDate: string) => void;
}

const CUSTOM = 'custom';

const OFFSET_KEYS: Record<FrequencyPeriod, string> = {
  1: 'subscriptions.actions.changeDate.offsetDays',
  2: 'subscriptions.actions.changeDate.offsetWeeks',
  3: 'subscriptions.actions.changeDate.offsetMonths',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Ordergroove requires a future date (reference "Change Next Order Date").
const isAfterToday = (date: string) =>
  ISO_DATE.test(date) && dayjs(date).isValid() && dayjs(date).isAfter(dayjs(), 'day');

function ChangeDateDialog({ card, isOpen, isPending, onClose, onConfirm }: ChangeDateDialogProps) {
  const b3Lang = useB3Lang();
  // A preset's date, CUSTOM, or nothing chosen yet.
  const [choice, setChoice] = useState('');
  const [customDate, setCustomDate] = useState('');

  // Every opening starts clean, whatever the customer picked last time.
  useEffect(() => {
    if (isOpen) {
      setChoice('');
      setCustomDate('');
    }
  }, [isOpen]);

  const presets = changeDatePresets(card);
  const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
  const customIsValid = isAfterToday(customDate);

  const presetLabel = (preset: DatePreset) =>
    b3Lang('subscriptions.actions.changeDate.preset', {
      offset: b3Lang(OFFSET_KEYS[preset.period], { count: preset.every }),
      date: formatDate(preset.date),
    });

  const selectedDate = () => {
    if (choice === CUSTOM) {
      return customIsValid ? customDate : null;
    }

    return choice || null;
  };
  const selected = selectedDate();

  return (
    <B3Dialog
      isOpen={isOpen}
      title={b3Lang('subscriptions.actions.changeDate.title')}
      rightSizeBtn={b3Lang('subscriptions.actions.changeDate.confirm')}
      loading={isPending}
      disabledSaveBtn={selected === null}
      handleLeftClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
      handRightClick={() => {
        if (selected) {
          onConfirm(selected);
        }
      }}
    >
      <RadioGroup value={choice} onChange={(event) => setChoice(event.target.value)}>
        {presets.map((preset) => (
          <FormControlLabel
            key={preset.date}
            value={preset.date}
            control={<Radio />}
            label={presetLabel(preset)}
          />
        ))}
        <FormControlLabel
          value={CUSTOM}
          control={<Radio />}
          label={b3Lang('subscriptions.actions.changeDate.pick')}
        />
      </RadioGroup>
      {choice === CUSTOM && (
        <TextField
          id="subscription-next-order-date"
          type="date"
          size="small"
          label={b3Lang('subscriptions.actions.changeDate.pickerLabel')}
          value={customDate}
          onChange={(event) => setCustomDate(event.target.value)}
          error={customDate !== '' && !customIsValid}
          helperText={
            customDate !== '' && !customIsValid
              ? b3Lang('subscriptions.actions.changeDate.pickerHint')
              : ' '
          }
          inputProps={{ min: tomorrow }}
          InputLabelProps={{ shrink: true }}
          sx={{ mt: 1, ml: 4 }}
        />
      )}
    </B3Dialog>
  );
}

export default ChangeDateDialog;
```

- [x] **Step 8: Run the dialog tests and the card test**

Run: `yarn vitest run src/pages/ManageSubscriptions/components`
Expected: all pass. If a `RadioGroup` label lookup fails, check the label text against the ICU output (`In 10 months (19 Jul 2027)` needs the date format from `withDateFormat`).

- [x] **Step 9: Commit**

```bash
git add src/pages/ManageSubscriptions/format.ts src/pages/ManageSubscriptions/components/SubscriptionCard.tsx src/pages/ManageSubscriptions/components/actions/SkipDialog.tsx src/pages/ManageSubscriptions/components/actions/SkipDialog.test.tsx src/pages/ManageSubscriptions/components/actions/SendNowDialog.tsx src/pages/ManageSubscriptions/components/actions/SendNowDialog.test.tsx src/pages/ManageSubscriptions/components/actions/ChangeDateDialog.tsx src/pages/ManageSubscriptions/components/actions/ChangeDateDialog.test.tsx
git commit -m "feat: B2B-0000 Add the skip, send-now and change-date dialogs" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The actions row, wired into the card and the page

**Files:**
- Create: `src/pages/ManageSubscriptions/components/actions/SubscriptionActions.tsx`
- Modify: `src/pages/ManageSubscriptions/SubscriptionsManager.tsx:77-79`
- Test: `src/pages/ManageSubscriptions/components/actions/SubscriptionActions.test.tsx`
- Test: `src/pages/ManageSubscriptions/SubscriptionsManager.test.tsx` (two new cases)

**Interfaces:**
- Consumes: `useSubscriptionActions` (Task 3); the three dialogs (Task 4); `SubscriptionCard.actions` slot (Task 4).
- Produces: `SubscriptionActions` props `{ card: SubscriptionCard; customerId: number }`; renders `null` when `card.nextOrder` is null.

- [x] **Step 1: Write the failing row test** — `SubscriptionActions.test.tsx`:

```tsx
import {
  builder,
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

import { SubscriptionCard as SubscriptionCardModel } from '../../viewModel';

import SubscriptionActions from './SubscriptionActions';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  externalProductId: '9537_12118',
  product: { name: 'Kraft Paper Shopping Bags', imageUrl: null, detailUrl: null, sku: null },
  quantity: 1,
  frequencyDays: 28,
  every: 4,
  everyPeriod: 2,
  nextOrderDate: '2026-10-03',
  nextOrder: { orderId: 'o-1', otherProducts: [] },
  shippingAddress: null,
  shippingAddressId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  payment: null,
  cancelledOn: null,
}));

const renderRow = (card: SubscriptionCardModel) =>
  renderWithProviders(<SubscriptionActions card={card} customerId={80591} />, {
    preloadedState: { storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } }) },
  });

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

it('renders nothing for a card with no upcoming order', () => {
  renderRow(buildCardWith({ nextOrder: null, nextOrderDate: null }));

  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('opens one dialog per button and closes it again', async () => {
  const { user } = renderRow(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('button', { name: 'Skip' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Skip next order');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  await user.click(screen.getByRole('button', { name: 'Send now' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Send order now');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  await user.click(screen.getByRole('button', { name: 'Change date' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Change next order date');
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

it('disables every action while a write is in flight, then closes the dialog on success', async () => {
  let release: () => void = () => {};
  server.use(
    http.patch(`${ogBase}/orders/o-1/skip_subscription/`, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });

      return HttpResponse.json({});
    }),
  );
  const { user } = renderRow(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('button', { name: 'Skip' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Skip' }));

  await waitFor(() => expect(screen.getByRole('button', { name: 'Send now' })).toBeDisabled());
  expect(screen.getByRole('button', { name: 'Change date' })).toBeDisabled();
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Skip' })).toBeDisabled();

  release();

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Send now' })).toBeEnabled();
});

it('keeps the dialog open after a failed write so the customer can retry or leave', async () => {
  server.use(
    http.patch(`${ogBase}/orders/o-1/send_now/`, () => new HttpResponse(null, { status: 500 })),
  );
  const { user } = renderRow(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('button', { name: 'Send now' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send now' }));

  await waitFor(() =>
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send now' })).toBeEnabled(),
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
```

- [x] **Step 2: Write the failing page tests** — in `SubscriptionsManager.test.tsx`: add `within` to the `tests/test-utils` import, add `import { snackbar } from '@/utils/b3Tip';` in the `@/` group, add the `vi.mock('@/utils/b3Tip', …)` block (same as the row test) right after the imports, then append:

```tsx
it('skips a subscription from its card and shows the moved date', async () => {
  const subscription = buildOgSubscriptionWith({ product: '9537_12118', every: 4, every_period: 2 });
  const before = buildOgOrderWith({ status: 1, place: '2026-10-03 00:00:00' });
  const after = buildOgOrderWith({ status: 1, place: '2026-10-31 00:00:00' });
  const skipRequests = vi.fn();
  let skipped = false;
  mockResources({
    subscriptions: [subscription],
    products: { '9537_12118': buildOgProductWith({ name: 'Kraft Paper Shopping Bags' }) },
  });
  // Later handlers win in MSW: the upcoming order moves once the skip has landed.
  server.use(
    http.get(`${ogBase}/orders/`, ({ request }) =>
      new URL(request.url).searchParams.get('status') === '1'
        ? HttpResponse.json(page([skipped ? after : before]))
        : HttpResponse.json(page([])),
    ),
    http.get(`${ogBase}/items/`, () =>
      HttpResponse.json(
        page([
          buildOgItemWith({
            order: (skipped ? after : before).public_id,
            subscription: subscription.public_id,
            product: '9537_12118',
          }),
        ]),
      ),
    ),
    http.patch(`${ogBase}/orders/${before.public_id}/skip_subscription/`, async ({ request }) => {
      skipRequests(await request.json());
      skipped = true;

      return HttpResponse.json(after);
    }),
  );

  const { user } = renderPage();

  expect(await screen.findByText('Next order 3 Oct 2026')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Skip' }));
  expect(screen.getByRole('dialog')).toHaveTextContent(
    'Kraft Paper Shopping Bags will leave your order on 3 Oct 2026. Your next order will be on 31 Oct 2026.',
  );
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Skip' }));

  expect(await screen.findByText('Next order 31 Oct 2026')).toBeInTheDocument();
  expect(skipRequests).toHaveBeenCalledWith({ subscription: subscription.public_id });
  expect(snackbar.success).toHaveBeenCalledWith('Next order skipped.');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('offers actions only on active cards with an upcoming order', async () => {
  const scheduled = buildOgSubscriptionWith({ product: '9537_12118' });
  const unscheduled = buildOgSubscriptionWith({ product: '7674_9534' });
  const cancelled = buildOgSubscriptionWith({
    product: '9492_11808',
    cancelled: '2026-08-01 10:00:00',
    live: false,
  });
  const order = buildOgOrderWith({ status: 1, place: '2026-10-03 00:00:00' });
  mockResources({
    subscriptions: [scheduled, unscheduled, cancelled],
    upcomingOrders: [order],
    items: [buildOgItemWith({ order: order.public_id, subscription: scheduled.public_id })],
    products: {
      '9537_12118': buildOgProductWith({ name: 'Scheduled' }),
      '7674_9534': buildOgProductWith({ name: 'Unscheduled' }),
      '9492_11808': buildOgProductWith({ name: 'Cancelled one' }),
    },
  });

  const { user } = renderPage();

  expect(await screen.findByText('Next order 3 Oct 2026')).toBeInTheDocument();
  expect(within(screen.getByRole('group', { name: 'Scheduled' })).getByRole('button', { name: 'Skip' })).toBeInTheDocument();
  expect(within(screen.getByRole('group', { name: 'Unscheduled' })).queryByRole('button')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '1 cancelled subscription' }));
  expect(within(screen.getByRole('group', { name: 'Cancelled one' })).queryByRole('button')).not.toBeInTheDocument();
});
```

- [x] **Step 3: Run both files to verify they fail**

Run: `yarn vitest run src/pages/ManageSubscriptions/components/actions/SubscriptionActions.test.tsx src/pages/ManageSubscriptions/SubscriptionsManager.test.tsx`
Expected: the row test cannot resolve `./SubscriptionActions`; the two new page tests fail on `getByRole('button', { name: 'Skip' })` (no such button yet). The seven existing page tests still pass.

- [x] **Step 4: Create `SubscriptionActions.tsx`**

```tsx
import { useState } from 'react';
import { Box, Button } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { useSubscriptionActions } from '../../hooks/useSubscriptionActions';
import { SubscriptionCard } from '../../viewModel';

import ChangeDateDialog from './ChangeDateDialog';
import SendNowDialog from './SendNowDialog';
import SkipDialog from './SkipDialog';

interface SubscriptionActionsProps {
  card: SubscriptionCard;
  customerId: number;
}

type OpenDialog = 'skip' | 'sendNow' | 'changeDate' | null;

/**
 * The order actions of one active card. The three dialogs stay mounted and toggle `isOpen`:
 * B3Dialog only opens on a re-render after its container ref exists. Every 3a action needs the
 * upcoming order, so a card without one renders nothing (spec §6.4).
 */
function SubscriptionActions({ card, customerId }: SubscriptionActionsProps) {
  const b3Lang = useB3Lang();
  const [open, setOpen] = useState<OpenDialog>(null);
  const { skip, sendNow, changeDate } = useSubscriptionActions(customerId);

  if (!card.nextOrder) {
    return null;
  }
  const { orderId } = card.nextOrder;
  const isPending = skip.isPending || sendNow.isPending || changeDate.isPending;
  const close = () => setOpen(null);

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
        <Button size="small" variant="outlined" disabled={isPending} onClick={() => setOpen('skip')}>
          {b3Lang('subscriptions.actions.skip')}
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={isPending}
          onClick={() => setOpen('sendNow')}
        >
          {b3Lang('subscriptions.actions.sendNow')}
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={isPending}
          onClick={() => setOpen('changeDate')}
        >
          {b3Lang('subscriptions.actions.changeDate')}
        </Button>
      </Box>
      {/* The per-call onSuccess runs after the hook's refresh resolves, so the card is already current. */}
      <SkipDialog
        card={card}
        isOpen={open === 'skip'}
        isPending={skip.isPending}
        onClose={close}
        onConfirm={() =>
          skip.mutate({ orderId, subscriptionId: card.publicId }, { onSuccess: close })
        }
      />
      <SendNowDialog
        card={card}
        isOpen={open === 'sendNow'}
        isPending={sendNow.isPending}
        onClose={close}
        onConfirm={() => sendNow.mutate({ orderId }, { onSuccess: close })}
      />
      <ChangeDateDialog
        card={card}
        isOpen={open === 'changeDate'}
        isPending={changeDate.isPending}
        onClose={close}
        onConfirm={(orderDate) =>
          changeDate.mutate({ subscriptionId: card.publicId, orderDate }, { onSuccess: close })
        }
      />
    </>
  );
}

export default SubscriptionActions;
```

- [x] **Step 5: Wire the row into the page** — in `SubscriptionsManager.tsx`, add `import SubscriptionActions from './components/actions/SubscriptionActions';` (relative group, alphabetical among the `./components` imports) and replace the active-cards map with:

```tsx
        {active.map((card) => (
          <SubscriptionCard
            key={card.publicId}
            card={card}
            variant="active"
            loading={loading}
            actions={<SubscriptionActions card={card} customerId={customerId} />}
          />
        ))}
```

Cancelled cards (`CancelledSubscriptions`) get no `actions` in 3a.

- [x] **Step 6: Run the row, page and mobile tests**

Run: `yarn vitest run src/pages/ManageSubscriptions`
Expected: everything passes. There is no new phone-layout test in 3a: the row only wraps (`flexWrap`), which jsdom cannot observe, and nothing structural differs between layouts; 3b adds one when the selects go full width.

- [x] **Step 7: Commit**

```bash
git add src/pages/ManageSubscriptions/components/actions/SubscriptionActions.tsx src/pages/ManageSubscriptions/components/actions/SubscriptionActions.test.tsx src/pages/ManageSubscriptions/SubscriptionsManager.tsx src/pages/ManageSubscriptions/SubscriptionsManager.test.tsx
git commit -m "feat: B2B-0000 Add skip, send-now and change-date actions to subscription cards" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Quality gate and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-ordergroove-phase3-subscription-actions-design.md`
- Modify: `.memory/b2b-buyer-portal--ordergroove-custom-msp-architecture.md`
- Modify: this plan (tick the boxes; record the Task 0 findings if not done)

- [x] **Step 1: Type-check and lint everything**

```bash
yarn tsc --noEmit
yarn lint:dependencies
yarn lint:eslint
yarn lint:knip
```

Expected: `tsc` exit 0; dependency-cruiser "no dependency violations"; `lint:eslint` exit 0 (run `yarn eslint --fix` on the files you touched for prettier reflow, never on `en.json`); knip reports only the pre-existing `BillingStateOption` in `src/pages/PaymentMethods/billingPrefill.ts`. Anything else is yours: an export nothing in `src` consumes (`DatePreset`, `PaymentSummary`, `addIntervals`, `changeDatePresets`, `formatDate`, `describePayment` are each consumed by a component — check before un-exporting) or a file nothing imports.

- [x] **Step 2: Run the scoped suites, then the full suite against the baseline**

```bash
yarn vitest run src/pages/ManageSubscriptions src/shared/service/ordergroove
```

Expected: every file green. Then, with nothing else running on the machine:

```bash
yarn vitest run 2>&1 | grep -E "^ (×|❯) src/" | sort -u > /tmp/after-failing.txt
comm -13 /tmp/baseline-failing.txt /tmp/after-failing.txt
```

Expected: the `comm` output is empty, or lists only files that pass when run alone — run each listed file by itself; a file that also fails alone is a real regression to fix before continuing.

**Recorded 2026-09-17:** scoped suites green (ManageSubscriptions 12 files / 65 tests; ordergroove
service 4 files / 35 tests). Full suite: 23 failing files against the 21-file baseline. Two baseline
files now pass (`Invoice/index.mobile`, `PaymentMethods/index`) and four names are new:
`Dashboard/index`, `Login/index` and the two new action files. Every one of the four passes in
isolation — `ChangeDateDialog` 4 tests in 2099 ms, `SubscriptionActions` 4 tests in 2350 ms,
`Dashboard` 6130 ms, `Login` 5681 ms — and each action file lost exactly one test to the 5 s
per-test limit under full-suite load (the two cases that drive several `userEvent` clicks). That is
the documented load behaviour of this branch, not a regression: the timing-out set shuffles run to
run.

- [x] **Step 3: Align the spec with what shipped** — edit the Phase 3 spec:

1. §3.2: record Task 0 finding A next to the `change_next_order_date` row (slash or no slash) and delete the sentence deferring it.
2. §6.2 Change date row: the custom date is a native `TextField type="date"` with `min` = tomorrow and the hint "Choose a date after today." — not `B3Picker` — with the reason from Global Constraints.
3. §7: `subscriptions.actions.skip.success` is "Next order skipped."; add `subscriptions.actions.changeDate.pickerHint`.
4. §10.2: the 3a phone-layout case is dropped (nothing structural differs); 3b keeps one for the full-width selects.
5. §10.1: replace the tick boxes of steps 1–3 with the recorded Task 0 findings A–D.

- [x] **Step 4: Record the outcome in the memory note** — append to the Ordergroove note in `.memory/`, after the "Phase 3 designed" section:

```
## Phase 3a implemented (YYYY-MM-DD)

- Cards on `/manage-subscriptions` carry Skip, Send now and Change date (presets at 1x/2x/3x the
  frequency plus a native date input). Service: `ogMutate` beside `ogFetch` (10 s deadline, one
  403 re-mint), `skipSubscription` / `sendOrderNow` / `changeNextOrderDate`. Hook
  `hooks/useSubscriptionActions.ts` invalidates subscriptions + upcoming (+ orderHistory for send
  now) and speaks through `snackbar`. Row `components/actions/SubscriptionActions.tsx` keeps its
  three B3Dialogs mounted and toggles isOpen (B3Dialog only opens on a re-render).
- Task 0 findings: <paste A–D here>.
- Live check (Task 7): <paste the summary here>.
```

Replace `YYYY-MM-DD` and the two placeholders with the real values before committing. Mirror the note to the Obsidian vault copy (same path under `/mnt/c/Users/thaverman/Documents/Obsidian/Programing/Platform/Memory/`, keeping its trailing `Related board:` line) and append the same section to the Mongo entry `memory.entries` `_id 6a982e6f24e380927044ba89` (`body` field) as the Phase 3 design record was.

- [x] **Step 5: Commit the docs**

```bash
git add docs/superpowers/specs/2026-09-17-ordergroove-phase3-subscription-actions-design.md docs/superpowers/plans/2026-09-17-ordergroove-phase3a-order-actions.md .memory/b2b-buyer-portal--ordergroove-custom-msp-architecture.md
git commit -m "docs: B2B-0000 Record the Ordergroove Phase 3a implementation" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Live check on sandbox through the real dialogs (reversible: skip, then restore the date)

**Files:** none in the repo. Script in your scratch directory under `pw/`.

**Interfaces:**
- Consumes: a deploy-flavour build of this branch; the Phase 2 recipe (request-level login, route interception of the deployed bundle path, `portalEval` into the ThemeFrame); `playwright` with the system Chrome. The sandbox theme already emits `customManager: true`, so **no `BC_CONTEXT` injection**.

- [x] **Step 1: Build the deploy flavour**

Run: `VITE_ASSETS_ABSOLUTE_PATH='https://sandbox.storesupply.com/content/b2bBuyerPortal/dist/' yarn build`
Expected: `apps/storefront/dist/` with hashed root entries; the script aliases the loader's unhashed names.

- [x] **Step 2: Write the script** to `<scratch>/pw/phase3a-live.mjs`

```js
// Live check of Phase 3a on sandbox as customer 80591, through the real UI. REVERSIBLE ONLY:
// skips the last card's subscription, then moves its date back with the Change date dialog.
// Aborts before any write if it cannot parse the card's date. Never touches Send now.
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const DIST = process.env.DIST; // absolute path to apps/storefront/dist from Step 1
const ENV = process.env.ENV_FILE; // absolute path to apps/storefront/.env
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const ORIGIN = 'https://sandbox.storesupply.com';
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
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const summary = { ogRequests: [], writes: [], sendNowRequests: 0, failedRequests: [], alerts: [], servedLocal: 0 };
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
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
  if (!req.url().startsWith('https://restapi.ordergroove.com/') || req.frame() !== page.mainFrame()) return;
  const line = `${req.method()} ${redact(req.url().replace('https://restapi.ordergroove.com', ''))}`;
  summary.ogRequests.push(line);
  if (req.method() !== 'GET') summary.writes.push(`${line} ${redact(req.postData() ?? '')}`);
  if (/send_now/.test(req.url())) summary.sendNowRequests += 1;
});
page.on('requestfailed', (req) => {
  if (/restapi\.ordergroove\.com|ordergroove-auth/.test(req.url())) summary.failedRequests.push(`${req.method()} ${redact(req.url()).slice(0, 100)} :: ${req.failure()?.errorText}`);
});

await page.goto(`${ORIGIN}/login.php`, { waitUntil: 'domcontentloaded' });
const login = await page.request.post(`${ORIGIN}/login.php?action=check_login`, {
  form: { login_email: env.VITE_TEST_ACCOUNT_EMAIL, login_pass: env.VITE_TEST_ACCOUNT_PASSWORD },
  maxRedirects: 0,
});
summary.loginStatus = login.status();
await page.goto(`${ORIGIN}/account.php#/manage-subscriptions`, { waitUntil: 'domcontentloaded' });

// The portal renders inside the ThemeFrame (document.write'd): reach its document by hand.
const portalEval = (fn, arg) =>
  page.evaluate(({ src, arg }) => {
    const frames = Array.from(document.querySelectorAll('#bundle-container iframe, iframe.active-frame'));
    const doc = frames.map((f) => { try { return f.contentDocument; } catch { return null; } }).find((d) => d && d.body);
    // eslint-disable-next-line no-new-func
    return new Function('doc', 'arg', `return (${src})(doc, arg)`)(doc, arg);
  }, { src: fn.toString(), arg });

const fail = async (why) => {
  summary.failure = why;
  await page.screenshot({ path: path.join(OUT, 'phase3a-failure.png'), fullPage: true }).catch(() => {});
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
  process.exit(1);
};
const waitFor = async (predicate, ms, label, arg) => {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (await portalEval(predicate, arg).catch(() => false)) return;
    // Collect snackbars as they appear.
    const alerts = await portalEval((doc) => Array.from(doc.querySelectorAll('[role="alert"]')).map((a) => a.textContent.trim())).catch(() => []);
    alerts.forEach((a) => { if (!summary.alerts.includes(a)) summary.alerts.push(a); });
    await page.waitForTimeout(250);
  }
  await fail(`timeout waiting for ${label}`);
};

// Cards are sorted by next date; the last one is the farthest out and least disruptive to touch.
await waitFor((doc) => !!doc && doc.querySelectorAll('.MuiCard-root').length >= 14 && doc.querySelectorAll('.MuiSkeleton-root').length === 0, 60000, 'fourteen settled cards');
const cardText = (index) => portalEval((doc, i) => doc.querySelectorAll('.MuiCard-root')[i].textContent.replace(/\s+/g, ' ').trim(), index);
const lastIndex = (await portalEval((doc) => doc.querySelectorAll('.MuiCard-root').length)) - 1;
const before = await cardText(lastIndex);
const dateText = (text) => (text.match(/Next order (.+?)(?:Skip|Send now|Change date|$)/) || [])[1]?.trim();
const originalText = dateText(before);
const original = originalText && !Number.isNaN(Date.parse(originalText)) ? iso(new Date(Date.parse(originalText))) : null;
if (!original) await fail(`could not parse the card date from "${before.slice(0, 160)}" — no write was made`);
summary.subject = { index: lastIndex, before: before.slice(0, 200), originalDate: original };
await page.screenshot({ path: path.join(OUT, 'phase3a-1-before.png'), fullPage: true });

// 1. Skip through the card's dialog.
const clickInCard = (index, label) => portalEval((doc, { i, label }) => {
  const btn = Array.from(doc.querySelectorAll('.MuiCard-root')[i].querySelectorAll('button')).find((b) => b.textContent.trim() === label);
  if (!btn) return false;
  btn.click();
  return true;
}, { i: index, label });
const clickInDialog = (label) => portalEval((doc, label) => {
  const dlg = doc.querySelector('[role="dialog"]');
  const btn = dlg && Array.from(dlg.querySelectorAll('button')).find((b) => b.textContent.trim() === label);
  if (!btn) return false;
  btn.click();
  return true;
}, label);
if (!(await clickInCard(lastIndex, 'Skip'))) await fail('no Skip button on the last card');
await waitFor((doc) => !!doc.querySelector('[role="dialog"]'), 10000, 'the skip dialog');
summary.skipDialog = await portalEval((doc) => doc.querySelector('[role="dialog"]').textContent.replace(/\s+/g, ' ').trim());
await page.screenshot({ path: path.join(OUT, 'phase3a-2-skip-dialog.png'), fullPage: true });
if (!(await clickInDialog('Skip'))) await fail('no Skip confirm in the dialog');
await waitFor((doc, { i, was }) => !doc.querySelector('[role="dialog"]') && !doc.querySelectorAll('.MuiCard-root')[i].textContent.includes(was), 30000, 'the card to show a new date', { i: lastIndex, was: originalText });
const afterSkip = await cardText(lastIndex);
summary.afterSkip = { text: afterSkip.slice(0, 200), newDate: dateText(afterSkip) };
await page.screenshot({ path: path.join(OUT, 'phase3a-3-after-skip.png'), fullPage: true });

// 2. Restore through the Change date dialog with the original date.
if (!(await clickInCard(lastIndex, 'Change date'))) await fail('no Change date button after the skip — restore by hand with the probe');
await waitFor((doc) => !!doc.querySelector('[role="dialog"] input[type="radio"]'), 10000, 'the change-date dialog');
summary.changeDateDialog = await portalEval((doc) => Array.from(doc.querySelectorAll('[role="dialog"] label')).map((l) => l.textContent.trim()));
await portalEval((doc) => { Array.from(doc.querySelectorAll('[role="dialog"] label')).find((l) => /Pick a date/.test(l.textContent)).click(); });
await waitFor((doc) => !!doc.querySelector('[role="dialog"] input[type="date"]'), 5000, 'the date input');
// React listens for native input events; set the value through the native setter so it notices.
await portalEval((doc, value) => {
  const input = doc.querySelector('[role="dialog"] input[type="date"]');
  Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
}, original);
await page.screenshot({ path: path.join(OUT, 'phase3a-4-change-date-dialog.png'), fullPage: true });
if (!(await clickInDialog('Save'))) await fail('no Save in the change-date dialog — restore by hand with the probe');
await waitFor((doc, { i, want }) => !doc.querySelector('[role="dialog"]') && doc.querySelectorAll('.MuiCard-root')[i].textContent.includes(want), 30000, 'the card to show the original date again', { i: lastIndex, want: originalText });
summary.afterRestore = (await cardText(lastIndex)).slice(0, 200);
await page.screenshot({ path: path.join(OUT, 'phase3a-5-restored.png'), fullPage: true });

await browser.close();
summary.ok = summary.sendNowRequests === 0 && summary.failedRequests.length === 0 && summary.afterRestore.includes(originalText);
console.log(JSON.stringify(summary, null, 2));
```

- [x] **Step 3: Run it**

Run: `DIST=<abs path to apps/storefront/dist> ENV_FILE=<abs path to apps/storefront/.env> node <scratch>/pw/phase3a-live.mjs`

Expected, for customer 80591:
- `subject.originalDate` is a real date; `skipDialog` reads "Skip next order … will leave your order on <that date>. Your next order will be on <one interval later>." and the projected date matches Task 0 finding B's arithmetic;
- `afterSkip.newDate` is the projected date; `alerts` includes "Next order skipped." and later "Next order date updated.";
- `changeDateDialog` lists three "In … (…)" presets and "Pick a date";
- `afterRestore` shows the original date; `ok: true`;
- `writes` holds exactly two lines: `PATCH /orders/<id32>/skip_subscription/ {"subscription":"<id32>"}` and `PATCH /subscriptions/<id32>/change_next_order_date… {"order_date":"<original>"}`;
- `sendNowRequests` is `0`; `failedRequests` is empty; `ogRequests` shows the subscriptions and upcoming (orders?status=1, items?status=1) reads repeated after each write and **no** products, payments or addresses re-reads.
- Inspect the five screenshots.

If the run aborts after the skip and before the restore, restore by hand: run the Task 0 probe's `change_next_order_date` step with `{ order_date: <subject.originalDate> }` for that subscription (its id is in `writes`).

**Recorded 2026-09-17.** The first run aborted *before any write* on its own guard: the card date
could not be parsed. That was two real findings, not a script bug alone.

1. The store's display format is `M jS Y` ("Nov 20th 2026") and `Date.parse` cannot read the
   ordinal — the script now strips it.
2. Every date on the page was **one day early**. The read-only diagnostic showed cards at Sep 18,
   19, 21, 22, 28, 29, 30, Oct 4, 6, 12, Nov 9, 19 while the hosted manager and the REST API said
   Sep 19, 20, 22, 23, 29, 30, Oct 1, 5, 7, 13, Nov 10, 20. Cause and fix: see the spec §6.2
   calendar-date note; `displayCalendarDate` now formats local midnight. After the fix the fourteen
   cards match the API exactly.

The write run then passed: subject was the 360-day subscription due 2026-11-20, alone on its order.
The skip dialog read "20 x 30 inch Tissue Paper - 480 Sheets - Kraft will leave your order on
Nov 20th 2026. Your next order will be on Nov 20th 2027."; after confirming, the card showed
Nov 20th 2027 and the snackbar "Next order skipped."; the change-date dialog offered
"In 12 months (Nov 20th 2028)", "In 24 months (Nov 20th 2029)", "In 36 months (Nov 20th 2030)" and
"Pick a date"; the typed date restored 2026-11-20 with "Next order date updated.". Exactly two
writes reached Ordergroove — `PATCH /orders/<id>/skip_subscription/ {"subscription":"<id>"}` and
`PATCH /subscriptions/<id>/change_next_order_date/ {"order_date":"2026-11-20"}` — **zero**
`send_now` requests, no failed requests, and each write was followed by a refetch of subscriptions,
`orders?status=1` and `items?status=1` only (no products, payments or addresses re-read). A
read-only pass afterwards showed all fourteen dates identical to before the run.

- [x] **Step 4: Record**

Paste the summary (product name, dates, request lines — never tokens or the merchant id) into the memory note section from Task 6 Step 4, mirror to the vault and Mongo as there, and commit the note as `docs: B2B-0000 Record the Phase 3a live check` if the Task 6 docs commit has already been made.

---

## Self-review against the spec

- §1 decisions 1–3, 5, 6: Task 5 (row on each card; send now confirm lists siblings), Task 4 (presets in the change-date dialog; skip is `skip_subscription` for one subscription), Task 0 and Task 7 (reversible live writes; send now never fired). Decision 4 (inline selects), 7 (escape link stays — no change needed, the link is untouched), 8 and 9 are 3b or need nothing here. ✓
- §2.1 where things render: Task 5 (`actions` slot on active cards; hidden without `nextOrder`; cancelled cards untouched). ✓ Mobile wrap is CSS only (`flexWrap`), no test — recorded for the spec in Task 6.
- §2.2 3a contents and §2.3 files: every 3a file appears in the file table and a task. ✓
- §3.1 write helper (10 s, single re-mint, status mapping, no retry): Task 1. §3.2 the three endpoints, bodies, return types: Task 1; trailing slash: Task 0 finding A. §3.3 types and builders: Task 1. ✓
- §4.1 card additions: Task 2. §4.2 arithmetic and presets: Task 2 (`addIntervals`, `changeDatePresets`), with the manager's observed dates as fixtures. §4.3–4.6 are 3b. ✓
- §5 hook, instances per card, invalidation set, snackbars, error kinds: Task 3 (hook) and Task 5 (per-card instantiation, dialog closes after the refresh via the per-call `onSuccess`). ✓
- §6.1 row and buttons: Task 5. §6.2 Skip, Send now, Change date dialogs: Task 4 (custom date via native input — amendment recorded in Task 6). §6.4 states: pending disables the row (Task 5 test), failure keeps the dialog open (Task 5 test), success closes it (Task 5 tests), no-order card hides the row (Task 5 tests). ✓
- §7 copy: Task 3 adds every 3a key; two amendments recorded. ✓
- §8 error handling: no double submit (Task 5), truth after timeout (Task 1's deadline test + invalidation on the next success). ✓
- §10.1 Task 0 steps 1–3: Task 0. §10.2 tests: api (Task 1), view model (Task 2), hook (Task 3), dialogs (Task 4), row and page (Task 5). §10.3 live check: Task 7 with the zero-`send_now` assertion. ✓
- Placeholder scan: the only blanks are the Task 0 finding lines and the two memory-note placeholders, both filled in during execution as in Phase 2. ✓
- Type consistency: `nextOrder.orderId` / `otherProducts[].externalProductId|name` (Task 2) match the dialogs (Task 4) and the row (Task 5); `useSubscriptionActions` variable shapes (Task 3) match the row's `mutate` calls (Task 5); `FrequencyPeriod` (Task 1) is the type behind `everyPeriod` (Task 2) and `OFFSET_KEYS` (Task 4). ✓
