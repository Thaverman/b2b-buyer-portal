---
title: 'Ordergroove integration decoded for custom manage-subscriptions scoping: portal iframes theme /subscriptions hosting og.msi; og_auth is minted by the middleware ordergroove-auth endpoint; custom MSP = OG REST storefront-auth from the browser, payment change included (payments/create + use_for_all are Storefront-scope; no server-side component needed beyond signature minting)'
type: concept
created: 2026-09-02
updated: 2026-09-16
lastVerified: 2026-09-16
repo: b2b-buyer-portal
storeHash: 24erkpw9h6
website: SSW
area: B2B
memoryType: finding
durable: true
status: active
project: subscriptions-custom-msp-scoping
module: apps/storefront
mongoId: 6a982e6f24e380927044ba89
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/ManageSubscriptions/index.tsx
    symbol: ManageSubscriptions
    note: "the page to replace — a thin iframe over the theme /subscriptions page; its #og-msi div is inert in the portal (OG renders in the iframed theme page, not here)"
  - kind: ts-react
    package: apps/storefront
    path: src/pages/PaymentMethods/api.ts
    symbol: deleteStoredInstrument
    note: "delete-warning hook point — confirm dialog in PaymentMethods/index.tsx precedes this call, which hard-unvaults at the gateway via middleware DeleteStoredInstrument"
  - kind: ts-react
    package: apps/storefront
    path: src/shared/routeList.ts
    symbol: isNativePaymentMethodsPage
    note: "gating model to copy — /manage-subscriptions today has NO platform/BC_CONTEXT/masquerade gate, unlike /payment-methods (routeList.ts:292-300); a custom OG page must gate on masquerade because OG auth is signed for the logged-in BC customer id"
---

Scoping finding (2026-09-02) for replacing the Ordergroove manage-subscriptions
experience with a custom portal page, plus warning about affected subscriptions
before a stored payment instrument is deleted on /payment-methods.

## As-built today

- Portal `/manage-subscriptions` iframes the storefront theme page
  `/subscriptions?hideLayout=true`; Ordergroove's Manage Subscriptions Interface
  (`window.og.msi`) renders there into `#subscriptionManagerNav`. Zero OG code
  in the portal repo.
- Theme auth (decoded from the deployed theme bundle, chunk 28, sandbox
  2026-09-02): custom theme page `pages/custom/page/ordergroove-auth` POSTs
  `{customerId, storeHash}` to
  `https://test-onlineservices.storesupply.com/products/productclient/ordergroove-auth`
  and sets the returned `cookieValue` as the `og_auth` cookie (2h, path=/,
  Secure, SameSite=Lax). The theme clears `og_auth` on logout, and its main
  bundle MutationObserver-hacks OG's rendered DOM (injects web order numbers,
  attaches pagination listeners) — those hacks become real features in a custom
  build. `window.ordergrooveConfig = { enabled, apiEndpoint }` is set globally.

## Custom MSP path (Ordergroove-sanctioned)

- OG REST API `https://restapi.ordergroove.com` with Storefront auth header —
  JSON `{public_id, ts, sig_field, sig}`, HMAC-SHA256 over `customer_id|ts`,
  2h TTL — is browser-callable; OG docs explicitly bless custom experiences
  beyond their Subscription Manager. The middleware ordergroove-auth endpoint
  already mints exactly this signature (og_auth value = `user|ts|sig`), so the
  portal can reuse it instead of new key plumbing.
- Documented endpoints cover every MSP feature (list, skip, change date,
  frequency, quantity, swap, cancel, reactivate, send-now, address change,
  payment change, failed-order retry). "Pause" has no endpoint — it is a
  next-order-date shift.
- Rate limit 6000 req/IP/min. CORS is undocumented — verify from the storefront
  origin before committing to the client-side path.

## Payment-change constraints

- OG never calls the gateway. On BigCommerce the card is vaulted at the
  gateway (BC stored instruments); OG holds a token reference + display
  metadata (last4/brand/expiry) and places recurring orders through its BC
  order-placement function.
- Client-side OK: `GET /payments/` + `PATCH /subscriptions/{id}/change_payment/`
  repoints a subscription among payment records OG **already has**.
- CORRECTION (2026-09-02 follow-up): the legacy HMAC+AES `update_payment_default`
  is NOT required. Current REST has `POST /payments/create/` (customer,
  cc_number_ending, token_id; optional cc_holder/cc_exp_date/billing_address)
  and `POST /payments/{id}/use_for_all/` — BOTH accept Storefront scope, so the
  whole payment-change flow is browser-callable with the customer signature.
  No new ssw-microservices endpoint needed beyond what mints the signature.
  `PATCH /payments/{id}` only activates/deactivates; it is not a token editor.
  OG's model still leans one default token per customer (use_for_all).
- New card capture: reuse the portal's existing checkout-sdk hosted-form
  add-card flow (gateway vault) then notify OG. Never send PAN to OG.

## Delete-warning feature

Needs OG `GET /payments/` (fields include `token_id`, `cc_number_ending`) to
map stored-instrument token → payment record → subscriptions. Shares the same
auth plumbing as the custom MSP. Match by `token_id` if this integration stores
real gateway tokens; otherwise last4/brand is a heuristic only.

## Open questions (checked against developer.ordergroove.com reference tree 2026-09-02)

1. CLOSED (spike 2026-09-15) — TRUE GATEWAY TOKENS, not customer-id-as-token.
   GET /payments/ for customer 80591 returned 8 records; every `token_id` is a
   64-char hex string (one legacy record is an 11-digit numeric); NONE equals
   the customer id 80591. So the delete-warning and payment-change flows key on
   a real gateway token, and last4-only matching is NOT required. (Actual token
   and merchant-id values intentionally not stored here — read them live.)
2. CLOSED (spike 2026-09-15) — BC stored-instrument `token` === OG payment
   `token_id`, EXACT string match. Logged in as customer 80591, called the
   middleware StoredInstruments (3 instruments, all 64-hex tokens) and OG
   GET /payments/; the customer's DEFAULT BC instrument's token is byte-for-byte
   the token_id all 14 active subs use. So: (a) the delete-warning can match a
   BC instrument to its OG subscriptions EXACTLY on token; (b) add-card /
   payment-change can hand the BC stored-instrument token straight to OG
   POST /payments/create as token_id. ASYMMETRY: OG had 4 distinct token_ids
   vs BC's 3 instruments — OG RETAINS payment records for cards the customer
   already removed from BC (incl. a legacy 11-digit token). Implication: the
   warning must be DATA-DRIVEN per token (2 of the 3 BC instruments have ZERO
   subs — deleting those is safe, no warning), and deleting a BC instrument
   does NOT delete the OG payment record, so subs keep pointing at a now-
   unvaulted token and fail at next order unless repointed — which is exactly
   the risk the warning exists to prevent.
3. CLOSED (spike 2026-09-02) — CORS is wide open. OPTIONS preflight to
   restapi.ordergroove.com/{subscriptions,payments}/ from Origin
   sandbox.storesupply.com returns 204 with `access-control-allow-origin: *`,
   `access-control-allow-methods: OPTIONS,GET,PUT,POST,DELETE,PATCH`,
   allow-headers includes Authorization, allow-credentials: true. Browser
   calls from the storefront origin will work. Unauth GET /subscriptions/
   returns 403 {"detail":"Authentication Failed"} — endpoint reachable, auth
   enforced.
4. CLOSED — credentials are self-service at https://rc3.ordergroove.com/keys/
   ("generate and go", no OG contact needed once you have an OG admin login).

## Spike results (2026-09-02, throwaway, no repo changes)

- Signature mint WORKS: POST test-onlineservices.storesupply.com/products/
  productclient/ordergroove-auth {customerId, storeHash} -> 200
  `{success, cookieValue:"80591|<ts>|<base64 HMAC>", expiresIn:7200}` — exactly
  OG's storefront-auth sig_field|ts|sig format, 2h TTL. Confirmed with sandbox
  BC customer 80591.
- CORS: closed (see Q3 above).
- Authenticated calls WORK (spike 2026-09-15). Header is JSON
  `{public_id, sig_field, ts, sig}` where public_id = OG "Your Merchant ID"
  (from rc3.ordergroove.com/keys) and sig_field/ts/sig come straight from the
  middleware og-auth cookieValue split on `|`. GET /payments/ and
  GET /subscriptions/ both returned 200 with live data for customer 80591.
- DATA SHAPE observed (customer 80591, all real):
  - Payments: 8 records, several sharing one token_id (OG mints a NEW payment
    public_id per checkout even when the underlying card/token is identical —
    5 of the 8 share the same token_id, last4 1111). `live` flag marks the
    active record. Fields: customer, billing_address (id ref), cc_number_ending,
    payment_method, public_id, token_id, cc_holder (often null), cc_type (int),
    cc_exp_date ("M/YYYY"), live.
  - Subscriptions: 18 total (14 active, 4 cancelled), paginated (`next`).
    Each has customer, merchant, product ("9537_12118" = productId_variantId
    style), `payment` (a payment public_id), shipping_address, offer,
    subscription_type "replenishment", quantity, frequency_days, every/
    every_period, start_date, cancelled, merchant_order_id, public_id, live.
  - ALL 14 active subs point at ONE payment record (the live one) -> so "this
    card is used by N subscriptions" is a real, non-trivial warning here
    (N=14). Map: sub.payment -> payment.public_id -> payment.token_id.
- RESOLVED 2026-09-15: the BC StoredInstruments `token` and the OG `token_id`
  are the same value (see Q2 above).

## Phase 1 implemented and live-verified (2026-09-16)

- Branch `worktree-ordergroove-phase1-delete-warning` (8 commits on dev 850b311b, merged into
  local dev as adf1eee3 on 2026-09-16 and the branch deleted; re-verified on that commit the same
  day: tsc clean, depcruise clean, eslint/knip only the pre-existing baseline findings, scoped
  suites 17 files / 141 tests green):
  `BC_CONTEXT.subscriptions` gate, `src/shared/service/ordergroove/` (auth
  mint + module-memory cache, API client with 5s Promise.race timeout and one
  403 re-mint, recursive pagination, token->subscriptions mapping, getProduct),
  `DeleteSubscriptionWarning` + 10 locale keys, `useSubscriptionsUsingInstrument`
  hook, wiring through `B3Dialog disabledSaveBtn`. 37 new tests; PaymentMethods
  suite 115 green; tsc/depcruise/eslint clean; knip only flags the pre-existing
  `BillingStateOption`.
- Live on sandbox (Playwright, local deploy-flavour build served over
  `/content/b2bBuyerPortal/dist/**`, config injected with an init-script SETTER on
  `window.BC_CONTEXT` because the theme assigns the whole object then sets
  properties): default card -> "Checking your subscriptions…" with confirm
  disabled, settled ~1.1s, then "This card is used by 14 active subscriptions:"
  with real product names/frequencies, "and 9 more", consequence line, MANAGE
  SUBSCRIPTIONS; clean card -> dialog identical to today, auth not re-minted;
  gate off -> zero Ordergroove/auth requests. No card deleted.
- Post-review fixes (2026-09-16, committed on dev after the merge): the 5 s bound now wraps
  the WHOLE check (one `withTimeout` around the hook's queryFn, auth mint included) — before,
  only each Ordergroove fetch was bounded, so a hung middleware left the confirm button
  disabled indefinitely; the page and hook share one enable predicate
  (`Boolean(pendingDelete?.token)`), because a disabled react-query v5 query with no data is
  `pending` forever and an empty-token instrument showed "Checking…" with no request;
  `deriveSubscriptionCheckStatus` moved next to the hook and reads `data`/`isError`, so a
  stale result survives a failed re-check; `everyDays` is an ICU plural ("every day"); the
  checking line carries `role="status"`; builder defaults are faker-driven (no real customer
  id in the repo). Reviewer suggestions left open: in-flight auth-mint dedupe, host check on
  the paginated `next` URL, `isAvailable` in the predicate for masquerade defense in depth.
- Follow-up candidates (not in scope): group listed subscriptions by product
  with a count (the same product appears 4x for this customer); Phase 4 adds
  "move these subscriptions to another card" from this dialog.
- Automation gotcha reconfirmed: MUI uppercases button labels via CSS and
  `innerText` reflects `text-transform` — match on `textContent`.
