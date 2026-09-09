---
title: 'Ordergroove integration decoded for custom manage-subscriptions scoping: portal iframes theme /subscriptions hosting og.msi; og_auth is minted by the middleware ordergroove-auth endpoint; custom MSP = OG REST storefront-auth from the browser, payment change included (payments/create + use_for_all are Storefront-scope; no server-side component needed beyond signature minting)'
type: concept
created: 2026-09-02
updated: 2026-09-02
lastVerified: 2026-09-02
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

1. STILL OPEN — token mode of this store's BC integration: true gateway token
   vs customer-id-as-token. No BigCommerce-specific developer pages exist in
   the reference; `token_id` is undescribed everywhere. Ask OG, or probe
   empirically: read an existing record's token_id via GET /payments/ once
   keys are in hand.
2. STILL OPEN — whether a BC stored-instrument token is a valid `token_id`
   for POST /payments/create/. Not documented anywhere.
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
- BLOCKED on the authenticated data call (GET /payments/, GET /subscriptions/):
  OG's storefront-auth header ALSO needs the merchant `public_id`, which is not
  exposed anonymously (no OG scripts on home/PDP/prod-subs pages without a
  logged-in subscription context; static.ordergroove.com is not keyed by store
  hash). Get it from https://rc3.ordergroove.com/keys/ (needs OG admin login),
  or lift OG's own auth object (og.store.getState().auth) from a logged-in
  sandbox browser session (needs sandbox customer credentials). Token mode
  (Q1) and BC-token-as-token_id (Q2) can only be answered once that call runs.
