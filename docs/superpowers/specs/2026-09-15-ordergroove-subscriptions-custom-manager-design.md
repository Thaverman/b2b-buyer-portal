# Ordergroove Subscriptions: Custom Manager + Payment-Method Guardrails — Program Design

**Date:** 2026-09-15
**Status:** Draft for review
**Scope:** `apps/storefront` (this repo), with named prerequisites in `ssw-microservices` and the Stencil theme
**Supersedes:** nothing — the existing `/manage-subscriptions` iframe page stays until Phase 4
**Evidence:** live spike against `sandbox.storesupply.com`, 2026-09-02 and 2026-09-15 (§2); memory note `.memory/b2b-buyer-portal--ordergroove-custom-msp-architecture.md`

---

## 1. Decision summary

Replace the Ordergroove-hosted "Manage Subscriptions" experience with a portal-native page
built on Ordergroove's REST API, and — before that page exists — warn a customer on
`/payment-methods` when the card they are about to delete is the one their subscriptions
charge. The program is four phases plus a security prerequisite:

| Phase | Deliverable | Server work | Size |
|---|---|---|---|
| **0** | Harden the middleware `ordergroove-auth` endpoint (§4) | `ssw-microservices` | small, **urgent regardless of this program** |
| **1** | Subscription warning in the `/payment-methods` delete dialog + the shared Ordergroove service module + host-config gate | none | small |
| **2** | Read-only custom subscriptions page behind the host-config gate; iframe stays as fallback | none | medium |
| **3** | Self-service mutations (skip, date, frequency, quantity, swap, cancel, reactivate, address) | none | large |
| **4** | Change payment method on a subscription (and from the delete warning); retire the iframe and the theme page | none | medium |

Why this is the right shape:

- **Ordergroove sanctions it.** Their docs explicitly bless custom experiences built on the REST
  API with Storefront-scope auth; every standard manager action has a documented endpoint.
- **We already own the credential.** The signature the REST API accepts is the same
  `customerId|ts|HMAC` value the middleware mints today for the theme's `og_auth` cookie.
- **No new server component for payments.** `POST /payments/create/`, `POST /payments/{id}/use_for_all/`
  and `PATCH /subscriptions/{id}/change_payment/` all accept Storefront scope and are browser-callable.
- **The tokens line up.** The BigCommerce stored-instrument `token` **is** Ordergroove's payment
  `token_id`, byte-for-byte (§2). The warning matches exactly, and payment changes hand the BC
  token straight to Ordergroove. No PAN ever touches the portal.
- **Phase 1 is independently valuable.** On the test account, one card carries **14** active
  subscriptions; deleting it today silently breaks all of them at their next order date.

## 2. Spike evidence (sandbox, customer 80591, throwaway scripts — no repo changes)

Everything below was observed live, not inferred from docs.

| # | Question | Result |
|---|---|---|
| 1 | Can we mint the Ordergroove credential? | `POST https://test-onlineservices.storesupply.com/products/productclient/ordergroove-auth` `{customerId, storeHash}` → `200 {success:true, cookieValue:"80591\|<epoch>\|<base64 HMAC>", expiresIn:7200}`. Exactly Ordergroove's `sig_field\|ts\|sig` storefront-auth triplet, 2h TTL. **Called with no cookies and no JWT** — see §4. |
| 2 | Does the REST API accept it from the browser? | `Authorization: {"public_id":"<OG Merchant ID>","sig_field":"80591","ts":<epoch>,"sig":"<sig>"}` → `GET /payments/` **200**, `GET /subscriptions/` **200**, plus `/orders/`, `/products/{id}/`, `/addresses/`, `/customers/{id}/`. Unauthenticated → `403 {"detail":"Authentication Failed"}`. |
| 3 | CORS | `OPTIONS` preflight from `Origin: https://sandbox.storesupply.com` → `204`, `access-control-allow-origin: *`, methods `OPTIONS,GET,PUT,POST,DELETE,PATCH`, `Authorization` allowed, `allow-credentials: true`. No proxy needed. |
| 4 | Token mode | 8 payment records; every `token_id` is a 64-hex string (one legacy 11-digit numeric). **None** is the customer id — this integration stores real gateway tokens, not the customer-id-as-token fallback. |
| 5 | BC token ≟ OG token | Logged in via `login.php?action=check_login`, minted a Current Customer JWT, called the middleware `StoredInstruments` (3 instruments). The customer's **default** BC instrument token is **byte-for-byte** the `token_id` all 14 active subscriptions charge. Exact match. |
| 6 | Data volume/shape | 18 subscriptions (14 active, 4 cancelled) over 2 pages; 165 orders (12 upcoming, `status=1`); 24 addresses; `GET /products/9537_12118/` returns name, `image_url`, `detail_url`, price, sku. |
| 7 | Asymmetry | Ordergroove holds **4** distinct token_ids vs BigCommerce's **3** instruments, and mints a **new payment record per checkout** even for the same card (5 of 8 share one token_id). Ordergroove retains payment records after the BC instrument is gone. |

Consequences carried into the design: the warning must be **data-driven per token** (2 of the 3
BC cards on this account have zero subscriptions and must not warn); Ordergroove records must be
**deduplicated by `token_id`** for display and reused rather than re-created on payment change;
and deleting a BC instrument does **not** touch Ordergroove — the subscription keeps pointing at
an unvaulted token and fails at the next `place` date, which is precisely the failure the
warning (Phase 1) and the payment change (Phase 4) exist to prevent.

Sandbox fixture for live verification in every phase: customer **80591** — 3 stored instruments,
14 active subscriptions on the default card (2 distinct products), 4 cancelled, 12 upcoming orders.

## 3. As-built today

- **Portal:** [`src/pages/ManageSubscriptions/index.tsx`](../../../apps/storefront/src/pages/ManageSubscriptions/index.tsx)
  iframes the storefront theme page `/subscriptions?hideLayout=true`. Its `#og-msi` div is inert;
  no Ordergroove code exists in this repo. Route `/manage-subscriptions`
  ([`routeList.ts`](../../../apps/storefront/src/shared/routeList.ts)) has **no** platform,
  host-config or masquerade gate — unlike `/payment-methods`.
- **Theme:** the `/subscriptions` page hosts Ordergroove's embedded manager (`window.og.msi` in
  `#subscriptionManagerNav`). A custom theme page (`pages/custom/page/ordergroove-auth`, deployed
  bundle chunk 28) POSTs `{customerId, storeHash}` to the middleware and sets the response as the
  `og_auth` cookie (2h, `path=/`, `Secure`, `SameSite=Lax`); the theme clears it on logout. The
  theme's main bundle **MutationObserver-hacks the manager's DOM** to inject web order numbers
  and pagination listeners — behaviour that becomes a first-class feature in Phase 2.
  `window.ordergrooveConfig = { enabled, apiEndpoint }` is already emitted globally.
- **Payment methods:** [`src/pages/PaymentMethods/`](../../../apps/storefront/src/pages/PaymentMethods/)
  lists BC stored instruments through the SSW middleware (`POST {apiBase}/customers/Customer/StoredInstruments`
  with a fresh Current Customer JWT per call), and deletes via `DeleteStoredInstrument`, which
  **hard-unvaults at the gateway**. Delete is a two-step `B3Dialog` confirm
  ([`index.tsx:219-245`](../../../apps/storefront/src/pages/PaymentMethods/index.tsx)). Gated on
  `platform === 'bigcommerce' && BC_CONTEXT.paymentMethods && !isAgenting`.

## 4. Security finding — the signature endpoint is unauthenticated (Phase 0)

`POST …/products/productclient/ordergroove-auth` accepts a bare `{customerId, storeHash}` body
and returns a valid **Storefront-scope Ordergroove credential for that customer** — no session
cookie, no JWT, no proof the caller is that customer (spike #1). BigCommerce customer ids are
small sequential integers. With the returned triplet plus the merchant id (which any logged-in
customer can read from the manager's script URL), an anonymous caller can, for **any** customer:
read names, phones and every shipping/billing address; read card last4/expiry and gateway token
ids; and **mutate subscriptions** — cancel them, change quantities, or redirect shipments to a
different address.

This is pre-existing (the theme uses the endpoint exactly this way) and is not introduced by this
program, but the program builds on the endpoint, so it is the first thing to fix. **Recommend
raising it with the `ssw-microservices` owners immediately, independent of the schedule here.**

**Hardening design (middleware):** the endpoint requires a Current Customer JWT — `{ Jwt }` —
validated the same way `StoredInstruments` already validates it; `customerId` comes from the
JWT's `customer.id` and `storeHash` from its `sub`; body `customerId` is ignored, then removed
once the theme is updated. The theme already fetches `/customer/current.jwt` on these pages
(`getCustomerTokenTest` in the page head), so its call site changes by one line.

**Forward-compatible portal contract:** the portal sends `{ Jwt, customerId, storeHash }` from
day one. Today's endpoint ignores `Jwt` (verified 2026-09-15: the extra field still returns
`200`); the hardened endpoint ignores `customerId`. Phase 1 can ship before or after Phase 0
without a portal redeploy — but Phase 0 should not wait on Phase 1.

## 5. Shared foundation (built in Phase 1, reused by 2–4)

### 5.1 Host config and gating

```ts
// apps/storefront/src/index.d.ts — alongside BC_CONTEXT.paymentMethods
/** Gates every Ordergroove-backed feature; absent = feature off. */
subscriptions?: {
  /** Ordergroove "Your Merchant ID" (the REST `public_id`; public, not a secret). */
  merchantId: string;
  /** Middleware endpoint that mints the storefront-auth triplet. */
  authEndpoint: string;
  /** SSW app client id used to mint the Current Customer JWT sent to authEndpoint. */
  appClientId: string;
  /** Phase 2: when true, /manage-subscriptions renders the portal page instead of the hosted iframe. */
  customManager?: boolean;
};
```

The theme emits it next to `BC_CONTEXT.paymentMethods` from new theme settings
(`ordergroove_merchant_id`, reusing the existing `ordergroove_api_endpoint`). Per-store
on-switch — SSW and LG/DOG roll independently, matching the `paymentMethodsBraintree` precedent.

`isSubscriptionsAvailable()` = `platform === 'bigcommerce' && Boolean(BC_CONTEXT.subscriptions)`.
Every consumer additionally requires `!isAgenting`: the credential is signed for the **logged-in**
BC customer, so a masquerading rep would see and edit their own subscriptions, not the buyer's.
Same rule and same reason as `/payment-methods`.

### 5.2 Auth acquisition and caching

`src/shared/service/ordergroove/auth.ts`

1. Mint a Current Customer JWT (`getCurrentCustomerJWT(appClientId)`, ~15s TTL, minted per use).
2. `POST authEndpoint { Jwt, customerId, storeHash }` → `cookieValue` → split on `|` →
   `Authorization` header value `JSON.stringify({ public_id: merchantId, sig_field, ts: Number(ts), sig })`.
3. Cache **in module memory only** — `{ customerId, header, expiresAt }` — reuse while more than
   10 minutes remain of the 2h TTL; drop on customer change. No `localStorage`/`sessionStorage`
   (AGENTS.md), no Redux, no Context.
4. On a `403` from Ordergroove, drop the cache, re-mint once, retry once; a second `403` surfaces
   as `sessionExpired`.

### 5.3 Service module

`src/shared/service/ordergroove/` — a third backend beside `shared/service/b2b` and
`shared/service/bc`, following the `PaymentMethods/api.ts` conventions (typed fetch wrapper,
error class with `kind`, PascalCase/camelCase-tolerant normalisers where a .NET hop is involved —
here only for the auth endpoint; Ordergroove itself is snake_case JSON).

```ts
// internal helpers (not exported until a page consumes them — knip fails on unused exports)
ogFetch<T>(customerId, url)              // adds Authorization, JSON, 5s timeout, 403 re-mint + retry once
listAll<T>(customerId, url)              // follows `next` until null
listPayments / listSubscriptions         // used by the mapping below; exported in Phase 2
// Phase 1 public surface (barrel `@/shared/service/ordergroove`)
isSubscriptionsAvailable(): boolean
getSubscriptionsUsingToken(customerId, token): Promise<OgSubscription[]>   // §5.4 mapping
getProduct(customerId, externalId): Promise<OgProduct>                     // names for the Phase 1 warning
// Phase 2+: listUpcomingOrders(), listItems(), listAddresses(), and the mutation functions of §8/§9.
class OrdergrooveError extends Error { kind: 'unavailable' | 'sessionExpired' | 'rateLimited' | 'timeout' | 'upstream' }
```

Business logic that belongs to a page (which subscriptions to warn about, how to phrase it) stays
in that page's folder; the service exposes data and the one cross-page mapping.

### 5.4 Data model as observed, and the rules it forces

```
customer (merchant_user_id = BC customer id)
 ├─ payments[]        public_id, token_id (= BC instrument token), cc_number_ending, cc_exp_date "M/YYYY",
 │                    cc_type (int code), cc_holder|null, billing_address (address public_id), live
 ├─ addresses[]       public_id, first/last, company, address lines, city, state, zip, country, live
 ├─ subscriptions[]   public_id, product ("<bcProductId>_<variantId>"), payment (payment public_id),
 │                    shipping_address, quantity, frequency_days, every/every_period, start_date,
 │                    cancelled|null, cancel_reason_code, merchant_order_id (BC order id), live
 ├─ orders[]          public_id, place (next charge date), status (1 = upcoming), totals, payment,
 │                    shipping_address, order_merchant_id, rejected_message, tries
 └─ items[]           order ↔ subscription ↔ product, quantity, price
products/{externalId} name, image_url, detail_url, price, sku
```

Rules:

- **Active subscription** = `cancelled === null && live === true`. Ordergroove has no pause
  state (pause is a next-order-date shift).
- **Instrument → subscriptions:** `payments.filter(p => p.token_id === instrument.token)` →
  set of payment `public_id`s → `subscriptions.filter(s => set.has(s.payment) && isActive(s))`.
  Match **all** payment records with the token, live or not — a dead record can still be
  referenced by a live subscription.
- **Display dedupe:** group payment records by `token_id` (and addresses by normalised fields);
  never render one card per Ordergroove record.
- **Web order number:** `formatOrderId(subscription.merchant_order_id)` from
  [`src/utils/orderId.ts`](../../../apps/storefront/src/utils/orderId.ts) — replaces the theme's
  DOM hack.
- **Frequency copy:** derive from `frequency_days` ("every 4 weeks" when divisible by 7, else
  "every N days"); do not depend on `every_period` codes until the mapping is verified.

### 5.5 Error kinds → UX

| kind | when | Phase 1 dialog | Phase 2+ page |
|---|---|---|---|
| `unavailable` | no `BC_CONTEXT.subscriptions` / wrong platform | no OG call, dialog unchanged | route hidden |
| `sessionExpired` | JWT 404, or OG 403 twice | disclosure line (§6.3) | existing "session expired" alert pattern |
| `rateLimited` | OG 429 (6000 req/IP/min) | disclosure line | retry alert |
| `timeout` | 5s deadline (`Promise.race`; Phase 1 puts one deadline around the whole check, auth mint included) | disclosure line | retry alert |
| `upstream` | anything else | disclosure line | retry alert |

## 6. Phase 1 — subscription warning on card delete (full design)

### 6.1 Behaviour

When the customer opens the **Delete card?** dialog on `/payment-methods` and Ordergroove is
configured for the store, the portal looks up the active subscriptions charging that card and,
if any exist, adds a warning to the dialog listing them. Deleting is **not blocked** — the
customer may be cancelling deliberately, and Phase 4 adds the "move them to another card"
affordance — but the confirm button is **disabled while the check is in flight** (bounded by the
5s timeout) so a fast click cannot skip the warning.

### 6.2 Data flow

```
setPendingDelete(instrument)
  → useSubscriptionsUsingInstrument(instrument.token)          // page hook, react-query
      queryKey ['subscriptionsUsingToken', customerId, token], enabled: Boolean(pendingDelete?.token), retry: 0
      → getSubscriptionsUsingToken(token)                       // shared service, §5.4
      → best-effort getProduct() for each distinct product id   // names for the list; failure ⇒ unnamed line
  → <DeleteSubscriptionWarning state=… />                       // rendered inside the existing B3Dialog body
```

No cache writes on delete success (the page shows no subscription data). On delete success the
`['subscriptionsUsingToken', …]` entry is left to garbage-collect.

### 6.3 UX states and copy

| state | rendering inside the dialog (below the existing content) | confirm button |
|---|---|---|
| feature off | nothing — dialog identical to today | enabled |
| checking | muted line **"Checking your subscriptions…"** | **disabled** |
| 0 subscriptions | nothing | enabled |
| N subscriptions | `Alert severity="warning"`: **"This card is used by {count} active subscription(s):"** then up to 5 lines **"{product} — {frequency}"** (+ "and {n} more"), then **"If you delete it, these subscriptions can't be charged at their next order. Change their payment method first."** and a link **"Manage subscriptions"** → hash route `/manage-subscriptions` (internal router navigation; the portal is inside the ThemeFrame, so no plain `<a>`). | enabled |
| check failed | `Alert severity="info"`: **"We couldn't check whether any subscriptions use this card."** | enabled |

Product names are best-effort: a subscription whose product fetch fails is still listed, as
**"Subscription — {frequency}"**, so the count and the list stay consistent. Locale keys under
`paymentMethods.deleteDialog.subscriptions.*` in `src/lib/lang/locales/en.json`.

### 6.4 Files

| file | change |
|---|---|
| `src/index.d.ts` | `BC_CONTEXT.subscriptions` (§5.1) |
| `src/shared/service/ordergroove/{config,errors,types,auth,api,index}.ts` | new (§5.2–5.4), Phase-1 surface only |
| `src/pages/PaymentMethods/hooks/useSubscriptionsUsingInstrument.ts` | new page hook |
| `src/pages/PaymentMethods/components/DeleteSubscriptionWarning.tsx` | new presentational component (state → markup) |
| `src/pages/PaymentMethods/index.tsx` | wire hook + component into the existing `B3Dialog`; disable confirm while checking |
| `src/lib/lang/locales/en.json` | copy (§6.3) |
| tests (§6.5) | new |

Untouched in this repo: the `/manage-subscriptions` iframe page and the routes. Outside this
repo, Phase 1 needs exactly one theme change — emitting `BC_CONTEXT.subscriptions` (§10) — and
no middleware change (§4 is Phase 0 and independent).

The confirm button is disabled during the check via `B3Dialog`'s existing `disabledSaveBtn`
prop, so no dialog component change is needed.

### 6.5 Testing

Test data via new builders `tests/ordergrooveBuilders/` (`buildOgPaymentWith`,
`buildOgSubscriptionWith`, `buildOgProductWith`), mirroring `tests/favoritesBuilders`. MSW
handlers for `restapi.ordergroove.com/payments/`, `/subscriptions/` (two pages via `next`),
`/products/:id/`, and the auth endpoint; all through `tests/test-utils`.

Cases:

1. `BC_CONTEXT.subscriptions` absent → dialog renders as today and **no** Ordergroove or auth
   request is made (await the fully rendered dialog before asserting absence — see memory note
   on absence-assertion races).
2. Token with no matching payment → no warning, confirm enabled.
3. Token matched by a `live:false` payment record referenced by a live subscription → still warns.
4. 14 subscriptions across two pages, 2 products → count 14, product names, "+ N more" rule,
   confirm disabled during the check and enabled after.
5. Product fetch fails → the subscription is listed without a product name.
6. Ordergroove `403` once → auth re-minted, second call succeeds; `403` twice → disclosure state,
   confirm enabled.
7. Auth endpoint failure / JWT 404 / timeout → disclosure state, confirm enabled.
8. Signature cached: two dialog opens → auth endpoint called once.
9. Masquerading (`isAgenting`) → page already unavailable; no OG calls (existing behaviour, assert
   it still holds).

Every new test gets a revert-and-rerun negative control (memory: planned tests were vacuous 3×
in one session). Live check on sandbox as customer 80591: deleting the default card shows the
14-subscription warning with two product names; the two unused cards show none.

## 7. Phase 2 — read-only custom subscriptions page (scoped design)

- **Full design:** [2026-09-17-ordergroove-phase2-subscriptions-page-design.md](2026-09-17-ordergroove-phase2-subscriptions-page-design.md).
- **Switch (revised 2026-09-17):** the `/manage-subscriptions` route component renders the new
  `SubscriptionsManager` when `isCustomManagerAvailable() && !isAgenting` — a second host flag,
  `BC_CONTEXT.subscriptions.customManager`, so the Phase 1 warning can reach prod while the page
  is still sandbox-only — else today's iframe. The route entry is unchanged; the iframe fallback
  keeps today's (ungated) behaviour until Phase 4. Until Phase 3 the page links to the hosted
  manager for actions.
- **Data:** `listSubscriptions()`, `listUpcomingOrders()` (`status=1`), `listItems()` to join
  order ↔ subscription, `getProduct()` per distinct `product`, `listPayments()`, `listAddresses()`.
  One `useQuery` per resource, joined in a page hook.
- **Per active subscription:** image, name, sku (→ `detail_url`), quantity, frequency, **next
  order date** (`place` of the upcoming order containing its item), shipping address summary,
  payment summary (last4 + expiry; `cc_type` code mapping to be verified against Ordergroove's
  reference), status. Cancelled subscriptions in a collapsed section. Order history from placed
  orders with `formatOrderId(order_merchant_id)` and `rejected_message` surfaced for failures
  (status codes to be verified against the reference).
- **Analytics parity:** the theme page emits dataLayer events documented in
  `docs/subscriptions-analytics-customer-recreation.md`; the custom page re-emits the page-view
  event via the existing `pushDataLayerEvent` pattern.
- Gets its own short spec at kickoff for layout; the data contract above is fixed by the spike.

## 8. Phase 3 — self-service mutations (scoped design)

Candidate parity set = Ordergroove's documented Subscription Manager features. **Kickoff task:**
capture the live manager as customer 80591 (screenshots per action) to confirm which are enabled
for SSW — `curl` cannot render it (client-side gate), so this needs a browser session.

| manager action | Ordergroove REST (per developer reference; verify exact path/body at implementation) | destructive confirm |
|---|---|---|
| skip next order | order-scoped skip | no |
| change next order date / "pause" | subscription change-next-order-date; order change-place-date | no |
| change frequency | subscription change-frequency | no |
| change quantity | subscription / item change-quantity | no |
| swap product | subscription change-product | yes |
| cancel | subscription cancel (+ merchant cancel-reason codes) | yes |
| reactivate | subscription reactivate | no |
| send now | order send-now | yes |
| change shipping address | subscription change-shipping-address (existing OG address, or create) | no |
| email reminders | subscription change-email-reminder | no |
| failed-order retry | order-placement-attempts | no |

Each mutation: `useMutation` → invalidate the affected resource queries → snackbar; destructive
ones behind `B3Dialog`. No optimistic updates (Ordergroove is the source of truth and re-fetch is
cheap). Rate limit is 6000 req/IP/min — irrelevant at this traffic.

## 9. Phase 4 — payment change and cutover (scoped design)

**Change payment method** (on the subscriptions page, and offered from the Phase 1 warning as
"Move these subscriptions to another card" when another instrument exists):

1. Picker lists the customer's **BC stored instruments** (the same list `/payment-methods`
   shows). `listStoredInstruments` and its types move from `pages/PaymentMethods/api.ts` to a
   shared service module when this second consumer appears.
2. Resolve the target Ordergroove payment record: find a **live** payment with
   `token_id === instrument.token`; if none, `POST /payments/create/`
   `{ customer, token_id: instrument.token, cc_number_ending, cc_exp_date, cc_type, cc_holder?, billing_address }`
   reusing the `billing_address` public_id of the subscription's **current payment record**
   (subscriptions reference a payment; the payment carries the billing address). Never create a
   duplicate record for a token Ordergroove already holds.
3. Apply: `PATCH /subscriptions/{id}/change_payment/ { payment }` for one subscription, or
   `POST /payments/{id}/use_for_all/` for "use this card for all my subscriptions".
4. Adding a brand-new card first reuses the existing `/payment-methods` add-card flow (gateway
   vaulting via hosted form / Braintree); the portal only ever handles the resulting token.

**Cutover:** remove the iframe page and its `og-msi` div; theme (stencil repo) redirects
`/subscriptions` to the portal route, removes the manager embed, the `ordergroove-auth` custom
page's cookie logic, the `og-login-return` redirect and the MutationObserver hacks; middleware
removes the body-`customerId` path (§4). `BC_CONTEXT.subscriptions` remains the on-switch.

## 10. Cross-cutting

- **PCI:** unchanged posture. The portal handles gateway tokens and last4/expiry only — the same
  values BigCommerce already returns to the customer via `StoredInstruments`. No PAN, no CVV.
- **Masquerade:** every Ordergroove feature hidden while `isAgenting` (§5.1).
- **Headless/Catalyst:** off (`platform !== 'bigcommerce'`); the iframe fallback keeps today's
  behaviour there until Phase 4, when the route gains the full gate.
- **Theme (stencil repo):** Phase 1 — emit `BC_CONTEXT.subscriptions`. Phase 4 — cutover list above.
- **Middleware (ssw-microservices):** Phase 0 only (§4).
- **Bundle:** the service module is small; no new dependencies.

## 11. Out of scope

- Enrolment/offers on product pages and checkout (native "Ships Every" options today; unchanged).
- Storing subscription state anywhere (no webhooks needed — the page reads Ordergroove live).
- Replacing the middleware's HMAC minting with portal-side signing (the private hash key must
  stay server-side).
- Prepaid / club / build-a-box subscription types (`subscription_type` is `replenishment` on
  every observed record).

## 12. Open decisions for review (recommendation first)

1. **Warn, don't block** deletion when subscriptions use the card (§6.1). Alternative: block
   until repointed — rejected because Phase 4 (repointing) doesn't exist yet and cancellation is
   a legitimate intent.
2. **Show product names** in the warning (a few extra `GET /products/{id}/` calls, best-effort).
   Alternative: count only — simpler, but the request was to inform about "the listed
   subscriptions".
3. **Service location** `src/shared/service/ordergroove/` (third backend beside `b2b`/`bc`).
   Alternative: page-local duplicate in both pages — rejected (two consumers from day one).
4. **Host-config on-switch with iframe fallback** (`BC_CONTEXT.subscriptions`) rather than a
   hard cutover — lets SSW and LG/DOG roll independently.
5. **Phase 0 ships first** (or in parallel), but the portal contract is forward-compatible so
   Phase 1 never waits on it.
6. Phase 4 lifts `listStoredInstruments` into a shared service instead of importing across pages.

## 13. Implementation checkpoints (live, sandbox, customer 80591)

- Phase 1: default card → warning lists 14 subscriptions / 2 products; other two cards → none;
  with `BC_CONTEXT.subscriptions` removed from the page → dialog identical to today and zero
  requests to `restapi.ordergroove.com` in the Network tab.
- Phase 0: `POST ordergroove-auth` with a body-only `customerId` and no `Jwt` → `401`.
- Phase 2: page shows 14 active + 4 cancelled, next order dates match `GET /orders/?status=1`.
- Phase 4: repoint one subscription to a second instrument → `GET /subscriptions/{id}/` shows the
  new `payment`; no duplicate payment record created for an already-known token.
