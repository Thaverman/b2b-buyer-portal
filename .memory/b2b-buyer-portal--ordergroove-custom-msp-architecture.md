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

## Phase 2 implemented (2026-09-17)

- `/manage-subscriptions` renders the portal page when `BC_CONTEXT.subscriptions.customManager`
  is `true`/`"true"` (`isHostFlagEnabled`, lifted from the payment-methods page into
  `src/utils/hostFlag.ts`) and the shopper is not masquerading; otherwise the hosted iframe
  (`components/HostedManagerFrame.tsx`). Page `SubscriptionsManager.tsx`; six queries in
  `hooks/useSubscriptionsData.ts`; pure join in `viewModel.ts`; card, cancelled-toggle and
  recent-orders components. 48 new tests. Full-project eslint is green for the first time (the
  old index.tsx findings went with the move); knip only the pre-existing `BillingStateOption`.
- Service additions: `listSubscriptions/Payments/Addresses`, `listUpcomingOrders`
  (`/orders/?status=1` + `/items/?status=1` — items are the only subscription→order link),
  `listOrdersPage` + `orderHistoryUrl` (`/orders/?place_end=<today>&ordering=-place`, paged by
  `next`).
- Probe findings (customer 80591): 14 upcoming items for 14 active subscriptions; `place` is
  "YYYY-MM-DD HH:mm:ss" (upcoming orders at 00:00:00); `/orders/` default order is not by place
  but `ordering=-place` is honoured; page size 10; 155 past orders.
- Test gotchas hit: the test store's date display format is blank, so pass
  `storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } })` and assert literal
  dates; a random customer id inside a `renderHook` callback re-keys every query per render.
- Live check (2026-09-17, sandbox, customer 80591, Playwright with the local deploy-flavour build
  and `customManager: true` injected): 14 cards with real product names, SKUs, "View product"
  links, quantities, frequencies (every 2/4/6/8 weeks, every 60/300/360 days), shipping
  summaries, "Paid with Visa ending in 1111 · exp 3/2028" and a "Next order …" date on every card;
  "4 cancelled subscriptions" toggle; escape link `https://sandbox.storesupply.com/subscriptions`
  with `target="_top"`; recent orders 10 rows (8 Placed with web order numbers linking to
  `#/orderDetail/<id>`, 2 Failed); no alerts; no failed requests; 9 distinct product lookups; ONE
  auth mint after the dedupe (six before). Gate-off control: the hosted iframe renders and the
  portal itself makes no Ordergroove request.
- Theme findings from the live check (stencil, outside this repo): the sandbox theme now emits
  `BC_CONTEXT.subscriptions` itself (Phase 1's theme change landed) as
  `{ enabled: true, merchantId, authEndpoint, appClientId }` — but `merchantId` is EMPTY on the
  test store (it reads the prod setting `subscriptions_merchant_id`, not
  `subscriptions_merchant_id_test`), so every Ordergroove call from sandbox fails at the CORS
  layer and the Phase 1 delete warning degrades to "couldn't check" there until the theme is
  fixed. The portal now honours `enabled` (false/"false" = every Ordergroove feature off).
  Injecting a `BC_CONTEXT` block in Playwright must now guard the `subscriptions` PROPERTY too,
  not just the whole-object assignment.
- RESOLVED the same day (observed 2026-09-17 ~11:10 CDT, deployed bundle, no injection): the
  sandbox theme now emits `{ enabled: true, customManager: true, merchantId (32 chars),
  authEndpoint, appClientId }`, and the portal bundle on
  `/content/b2bBuyerPortal/dist/` (Last-Modified 14:57 UTC, from a local build — origin/dev does
  not carry the merge) contains Phase 2. Live as a customer sees it: `/manage-subscriptions`
  renders the portal page with 14 cards (all with a next-order date, no fallbacks), "4 cancelled
  subscriptions", the escape link, 10 recent-order rows (8 Placed with web order numbers, 2
  Failed), no alerts, no failed requests, ONE auth mint per page load; the Phase 1 delete dialog
  lists the 14 subscriptions again (settled in 1.3 s). Phase 2 is effectively live on sandbox.

## Phase 3 designed (2026-09-17)

- Spec: `docs/superpowers/specs/2026-09-17-ordergroove-phase3-subscription-actions-design.md`
  (approved section by section; awaiting written review, then two plans: 3a order actions —
  skip / send now / change next-order date — and 3b subscription edits — frequency, quantity,
  cancel with reasons, reactivate, change shipping address).
- Decisions: full parity with the hosted manager MINUS swap product and add-new-address; actions
  on each subscription card (only send now is order-scoped; its confirm lists the other products
  in the order); quantity/frequency are inline selects that save on change, everything else a
  B3Dialog; pause = change_next_order_date with presets at 1x/2x/3x the frequency; skip = the
  order's `skip_subscription` for one subscription (the manager's "skip order" and "skip product"
  both call it); escape link stays until Phase 4; cancel reason optional (no selection sends the
  manager's `114|Cancelled without exit survey response`); live verification = REVERSIBLE writes
  only, send_now never fired against 80591 (sandbox talks to Ordergroove PRODUCTION).
- Hosted-manager capture (read-only, Playwright, `/subscriptions` as 80591): order-grouped
  layout; change order date, skip order, send now per order; quantity 1–20 (+ current), frequency
  select, More Options → skip product / pause / cancel; shipping dropdown of 10 deduped addresses
  (+ add/edit/delete); NO change-payment control; inactive list with Reactivate; cancel flow
  offers only "skip product" as retention (no discount configured); swap search present but
  unverified for SSW.
- Merchant bundle `static.ordergroove.com/<merchant>/msi.js` (1.9 MB) hardcodes SSW's frequency
  list as literal `{every, period}` pairs: 2,4,6,8,10,12 days; 1 day; 2,4,6,8,10,12 weeks (period
  1 = days, 2 = weeks, 3 = months). Not readable from the REST API → constant in `viewModel.ts`.
  Cancel reason codes the manager sends: 2, 8, 31, 70, 3, 22, 15, Other = 1 (+ free text), body
  `"{code} | {label}"`. Bundle endpoint map recorded in spec §12.3; notable: the manager omits the
  trailing slash on `change_next_order_date` (docs include it) — Task 0 settles it live.
- Reference confirmed Storefront scope for every mutation used. `/placement_logs/responses/`
  (failed-order attempts) is x-api-key only → retry stays out of scope.

## Phase 3a implemented (2026-09-17)

- Cards on `/manage-subscriptions` carry Skip, Send now and Change date (presets at 1x/2x/3x the
  frequency plus a native `<input type="date">`, min tomorrow — not B3Picker: no repo test drives
  the MUI picker and the native input is reliably testable). Service: `ogMutate` beside `ogFetch`
  in `src/shared/service/ordergroove/api.ts` (10 s write deadline, one 403 re-mint, 400/423 →
  `upstream`), `skipSubscription` / `sendOrderNow` / `changeNextOrderDate`; `OgSubscription` gained
  `every` / `every_period` (`FrequencyPeriod` 1 day, 2 week, 3 month). View model: card carries
  `every`, `everyPeriod`, `shippingAddressId`, `nextOrder { orderId, otherProducts }`;
  `addIntervals()` does CALENDAR arithmetic with dayjs (Sep 19 + 10 months = Jul 19, which
  frequency_days would miss); `changeDatePresets()`. Hook `hooks/useSubscriptionActions.ts`
  awaits invalidation of subscriptions + upcoming (+ orderHistory for send now) inside onSuccess so
  the dialog spinner runs until the card is current, then a snackbar. Row
  `components/actions/SubscriptionActions.tsx` keeps its three B3Dialogs MOUNTED and toggles
  `isOpen` — B3Dialog only opens on a re-render after its container ref exists, so dialog tests
  render closed then `rerender` open. Skip success copy reads "Next order skipped.".
- Task 0 probe (reversible, customer 80591, 12-month subscription due 2026-11-20): (A)
  `change_next_order_date/` WITH the trailing slash → 200 (docs form; the manager omits it);
  response carries every/every_period. (B) `skip_subscription` moved the item exactly one calendar
  interval (→ 2027-11-20); the emptied order STAYED in `/orders/?status=1` (no items) — harmless,
  the join derives dates from items. (C) changing the date back re-attached the item to the
  ORIGINAL order id (Ordergroove merges into the existing order on that date). (D) list records also
  carry cancel_reason, cancel_reason_code, offer, subscription_type, price, reminder_days.
- DEFECT FOUND AND FIXED during the 3a live check (it shipped in Phase 2): `displayFormat(date,
  true)` converts an INSTANT to the store's wall clock, so it shifts its argument by
  `storeInfo.timeFormat.offset`. Ordergroove's `place` is a CALENDAR DAY, and on this store
  (offset -21600) every date on `/manage-subscriptions` rendered ONE DAY EARLY — the live page
  showed "Nov 19th 2026" for an order Ordergroove places 2026-11-20, on all 14 cards and in order
  history. The hosted manager showed the true dates, so the two pages disagreed. Fix: new
  `displayCalendarDate()` in `src/utils/b3DateFormat` formats LOCAL MIDNIGHT of the given day (the
  php formatter reads local getters), and `pages/ManageSubscriptions/format.ts` re-exports it as
  `formatDate` for the card, the dialogs and the order rows. Rule: never route a "YYYY-MM-DD" through
  `displayFormat` — it is for unix timestamps. Reproduce in a test by seeding
  `buildStoreInfoStateWith({ timeFormat: { display: 'M jS Y', offset: -21600 } })`; with offset 0 the
  bug hides.
- Quality gate: tsc, eslint (project-wide), depcruise clean; knip = pre-existing BillingStateOption
  only. Scoped suites: 12 files / 65 tests in ManageSubscriptions + 4 files / 35 in the service.
  Full suite: 23 failing files vs the 21-file dev baseline — the set SHUFFLES with load (2 baseline
  files now pass, Dashboard/Login newly time out), and all four "new" names pass in isolation,
  including the two new action files (each had ONE test cross the 5 s per-test limit under load
  while the whole file runs in ~2.1-2.4 s alone). Dialog tests that drive several userEvent clicks
  are the first to cross that limit — expect them in the timeout set, not as regressions.
- Live check (sandbox, customer 80591, deploy-flavour build routed over
  `/content/b2bBuyerPortal/dist/`, no BC_CONTEXT injection — the theme already emits customManager):
  subject was the 360-day subscription due 2026-11-20, alone on its order. Skip dialog read
  "… will leave your order on Nov 20th 2026. Your next order will be on Nov 20th 2027."; after
  confirming, the card showed Nov 20th 2027 + snackbar "Next order skipped."; the change-date dialog
  offered "In 12 months (Nov 20th 2028)" / 24 / 36 months + "Pick a date", and the typed date
  restored 2026-11-20 with "Next order date updated.". EXACTLY two writes reached Ordergroove
  (skip_subscription, change_next_order_date), ZERO send_now, no failed requests, and each write was
  followed by a refetch of subscriptions + orders?status=1 + items?status=1 only. A read-only pass
  afterwards showed all 14 dates identical to before the run. Recipe note: the store's display
  format is "M jS Y", so a scraper must strip the ordinal ("Nov 20th 2026") before Date.parse.
- DEPLOYED-BUNDLE CHECK (2026-09-17 13:55 CDT, no interception, no injection): sandbox serves a
  bundle uploaded 18:51:49 UTC (13:51 CDT) that CONTAINS Phase 3a and the calendar-date fix. Theme
  emits `{enabled: true, customManager: true, merchantId (32)}`. 14 cards, each with Skip / Send now
  / Change date, and the next-order dates match the REST API exactly (Sep 19, 19, 20, 22, 23, 23,
  29, 30, Oct 1, 5, 7, 13, Nov 10, 20). Opening each dialog read-only: Skip "… will leave your order
  on Nov 20th 2026. Your next order will be on Nov 20th 2027."; Send now "… charged to Visa ending
  in 1111 · exp 3/2028." with no sibling list (that subscription ships alone); Change date presets
  "In 12 months (Nov 20th 2027)" / 24 / 36 + "Pick a date". Phase 1 UNAFFECTED by the `request()`
  write refactor: the delete dialog still lists "14 active subscriptions" with names and
  frequencies, settled in 1274 ms. Zero mutating requests, zero failed requests, ONE auth mint per
  page load.

## Phase 4 implemented (2026-09-18)

- A customer can move a subscription onto another saved card from its card, and move every
  subscription off a card from the delete dialog before deleting it. Service:
  `createPayment` / `changeSubscriptionPayment` / `applyPaymentToAll` in
  `shared/service/ordergroove/api.ts`. TWO reference claims are WRONG about the live API, both
  settled by the Task 0 probe: an upcoming order DOES follow its subscription's new payment (so no
  order-level repoint is needed — `changeOrderPayment` was never built), and `use_for_all` answers
  200 with a parseable JSON body, not the documented empty response (so no no-content helper was
  needed — `applyPaymentToAll` is a plain `ogMutate`). It moved 14 of 14 subscriptions and 12 of 12
  upcoming orders.
- Reuse before create: only a LIVE record whose token_id matches is reusable, because Ordergroove
  mints a record per checkout and keeps records for cards BigCommerce no longer has. Creating is
  ONE-WAY — there is no delete, only deactivate — so the live probe never creates one.
- The SSW customer middleware client now lives at `shared/service/ssw/customerClient.ts`; the
  payment-methods page keeps only its own actions. `CardOption` / `buildCardOptions` / `ccTypeFor` /
  `formatExpiry` live in the same directory, `shared/service/ssw/cardOptions.ts` — shared rather than
  in either page's view model, because both `/manage-subscriptions` and `/payment-methods` let a
  customer pick a card, and a page importing another page's view model fails dependency-cruiser.
- The service function is named `applyPaymentToAll`, not the spec's original `usePaymentForAll` —
  the `use` prefix reads as a React hook name, which it is not; it is an ordinary async call.
- Two vendor-documentation contradictions, both worth remembering beyond this feature: (1) the
  Ordergroove REST reference says an upcoming order's payment is silent on whether it follows a
  `change_payment` call on its subscription — live behaviour is that it DOES follow automatically,
  removing the need for any order-level repoint. (2) the reference says `POST
  /payments/{id}/use_for_all/` answers 200 with an empty body — live behaviour is 200 with a
  parseable (if empty-object) JSON body, so code written defensively around an unparseable response
  is unnecessary and was never built.
- Task 0 findings: (A) an already-generated upcoming order follows its subscription's new payment
  automatically (`change_payment` on the subscription moved the order's `payment` too, order stayed
  upcoming; both writes were reversed). (B) record inventory: 8 payment records, 4 distinct tokens,
  4 live, 4 dead, 1 token carrying more than one record. (C) `use_for_all` returned 200 with a
  parseable JSON body, not empty; moved 14 of 14 active subscriptions and 12 of 12 upcoming orders;
  fully reversed.
- Live check (2026-09-18, sandbox, customer 80591, deploy-flavour build routed over
  `/content/b2bBuyerPortal/dist/`, no BC_CONTEXT injection): the last card's subscription was
  repointed from the 3/2028 card to the 08/2027 card through the real Change card dialog and back.
  Picker listed all three saved cards with exactly one marked "(current)"; snackbar "Card updated.";
  the card line changed and changed back. The delete dialog showed the 14-subscription warning AND
  the move offer listing only the OTHER two cards (the card being deleted is correctly excluded);
  cancelled without moving and WITHOUT ever clicking Delete. Zero `use_for_all`, zero
  `DeleteStoredInstrument`, zero failed requests. Account verified back to 14-of-14 on one record.
- REUSE-BEFORE-CREATE PROVEN LIVE across two runs: run 1 fired `POST /payments/create/` because
  Ordergroove held no live record for the 08/2027 card (body carried `token_id`, `cc_number_ending`,
  `cc_exp_date`, `cc_type: 1` and `billing_address`); run 2 repointed to the SAME card with only
  `change_payment` and no create, because run 1's record now exists. That spare record cannot be
  deleted — Ordergroove has no delete for payment records — so the fixture account now carries one
  extra live record for that token. Expected and documented, not a defect.
- SCRAPER GOTCHA for future live checks: the subscription CARD line prints Ordergroove's raw
  `cc_exp_date` ("3/2028") while the card PICKER prints `formatExpiry`'s zero-padded form
  ("03/2028"), so the two never match as strings. A first run aborted between its two repoints on
  exactly that mismatch and left one subscription on the wrong card until a restore script moved it
  back. Match the picker's own "(current)" label instead of the card line.


## Phase 4 on the DEPLOYED sandbox bundle (2026-09-18, read-only)
Sandbox served `index.js` last-modified 18 Sep 2026 18:37 UTC — after the merge — and the check ran
with NO route interception and NO injection, so this is what a customer gets.
- 14 cards, no hosted iframe, and all 14 carry `Change card` beside Skip / Send now / Change date.
- The picker offers all three saved cards, marks and preselects the current one, and keeps Save
  disabled until a different card is chosen.
- The delete dialog names 13 subscriptions (5 listed, "and 8 more"), offers the other two cards,
  keeps "Move subscriptions" disabled until one is picked, and still shows Cancel / Delete.
- Every rendered next-order date matches the API's `place` calendar day (12 distinct dates, two
  shared by two cards each) — the displayFormat off-by-one is gone in the deployed build.
- Zero non-GET requests to Ordergroove, zero `DeleteStoredInstrument`, zero failed requests, zero
  error alerts. Scripts: `pw/sandbox-phase4-deployed.mjs`, `pw/sandbox-phase4-dates.mjs`.
- TWO COSMETIC DEFECTS now visible in production copy, neither fixed: (1) the card line renders
  Ordergroove's `cc_type`/`cc_exp_date` ("Visa ... exp 3/2028") while the picker renders the BC
  stored instrument ("VISA ... exp 03/2028"), and with three Visa cards all ending 1111 the expiry
  is the only distinguishing token; (2) the delete dialog's heading "Use this card for all my
  subscriptions" sits above radios for the OTHER cards, so "this card" reads as the card being
  deleted.

Both were fixed in `607c4d50`: `displayBrand` and `formatRawExpiry` in
`shared/service/ssw/cardOptions.ts` give every screen one shape ("Visa", "03/2028"), applied at the
subscription card line (`summarizePayment`), the card picker (`buildCardOptions`), the payment-methods
rows and the delete sentence; `paymentMethods.deleteDialog.move.title` became "Move them all to
another card:". `displayBrand` round-trips through `ccTypeFor`, which the create body reads — there is
a test holding that. Verified live against a local build served over the sandbox page: the card line
and the picker now print the identical string. NOTE: repeated full page loads on customer 80591 start
failing ("We couldn't load your subscriptions", all requests 200, later ones never answered) — space
live runs out, and re-run the deployed bundle as the control before blaming a build.

## Phase 3b implemented (2026-10-01)
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
- Task 0 findings E–J (probe 2026-10-01, customer 80591, every write restored except I's overwritten cancel timestamp and reason):
  - E change_frequency: 200 and the record follows (10 months → 6 weeks read back 6/2,
    frequency_days 42) but the upcoming order's DATE does not move (2027-08-01 before, after and
    after the restore); the hook refreshes `upcoming` regardless. Response shape unconfirmed.
  - F change_quantity: 200, and the upcoming order's item quantity FOLLOWS the subscription.
  - G change_shipping: 200, and the upcoming order's shipping_address FOLLOWS the subscription.
  - H reactivate: tomorrow accepted as next_order_date on the first try (live true, cancelled null,
    an upcoming order dated tomorrow appeared) → FIRST_ORDER_MIN_DAYS = 1; today itself untried.
  - I cancel right after reactivate: 200, cancel_reason stored VERBATIM with code 114 parsed from
    the prefix, the upcoming order gone. Side effect the API will not undo: the subscription's
    cancelled timestamp and reason were overwritten (it had 113|Disengaged).
  - J addresses: 24 live records → 22 nine-field identities but 10 distinct street lines, and the
    hosted manager offers exactly 10 → buildAddressOptions keys on the normalised street line
    ALONE (spec §4.6 amended). Cost: two real addresses sharing a street line in different cities
    collapse into one choice, as they do in the manager.
- SAFETY (shared hook): src/hooks/useScrollBar.ts now releases the ThemeFrame scroll lock in an
  effect cleanup when a component unmounts while open. A cancel moves its card out of the active
  list (the subscriptions refetch more likely lands before the upcoming one), so the card unmounted
  with its Cancel dialog open and, with the cancelled list collapsed (the default), the page stayed
  unscrollable. Pinned by useScrollBar.test.ts and a page case that holds the upcoming refetch.
- Quality gate: tsc, depcruise, eslint clean; knip = pre-existing BillingStateOption only. Scoped
  suites: 23 files / 190 tests green. Full suite: 15 failing files vs the 18-file dev baseline,
  none new (3 baseline-red files passed this time; the set shuffles with load). Five tests inside
  four baseline-red files failed this time that did not in the baseline run; each of those four
  files passes whole when run alone.
- Known gaps (deferred minors; the final whole-branch review triages them):
  - Task 2: "otherwise the first live record" is unpinned; an unknown cancel code falls back to 114
    (the type could be tightened); only code 8's label is asserted; frequencyOptions returns the
    mutable module array; the address sort ties on name; trim/empty-street edges untested;
    viewModel.ts is ~470 lines.
  - Task 3: the failure path is tested for cancel only; no request-count guard against a retry;
    wire literals are hardcoded (file precedent).
  - Task 4: the radio groups lack accessible names; B3Dialog autoFocus lands on the destructive (so Enter on open cancels with no reason)
    confirm (shared component); Cancel's radios stay editable while pending (the body is built at
    click time).
  - Task 5: tests lean on builder defaults; nothing pins that a select keeps the card's value after
    a pick; the Saving progressbar has no accessible name; `scheduleControls ??` vs
    `shippingAction &&` are inconsistent; the two-card id test lives in the page test.
  - Task 6: onClose/onSuccess wiring is pinned only for Skip, quantity and address; the isPending
    list is hand-kept; Cancel's right-alignment follows MUI md (900px) while the card switches on
    useMobile (768px), a cosmetic 769–899px gap; the page-wide combobox id check is brittle; the
    row test never pins Cancel's text variant; the frequency-write owner test ends before the write
    settles.
  - Task 7: ReactivateAction's dismissal and failure paths are untested; multi-card cancelled
    wiring is untested; dropping changeAddress from the isPending list survives the tests.
  - Browser-only, for Task 9: spinner position inside the select; keyboard focus after a save (the
    combobox loses tabindex while disabled); focus after a successful cancel.
- Live check (Task 9, 2026-10-02, two controller runs under the user's authorisation after the harness denied the implementer's): quantity, frequency and address changed and restored on one subscription through the real UI (the address restore by one allowlisted PATCH after the script's wait tripped on the theme's cart drawer, which carries role=dialog inside the ThemeFrame — scope dialog checks to `.MuiDialog-root`); one cancelled subscription reactivated then cancelled again with the 114 body on the same id; all five writes returned parseable bodies; zero forbidden/failed requests; scroll lock released after the cancel; keyboard focus lands on BODY after an inline save and after a cancel (follow-up). Account re-verified equal to the pre-run snapshot except that subscription's cancel metadata (now 2026-10-02 / 114).
- Whole-branch review fix wave (d8349d94): the Cancel dialog now opens with "You're cancelling {product}."; the reason and address radio groups and the saving spinner have accessible names; frequencyOptions is readonly; regression guards for the Reactivate dialog's dismissal/failure paths, two-cancelled-card wiring and the address write holding the card. Follow-ups left open: scroll-lock ref counting (Cancel→Skip handoff unlocks the frame while Skip is open) and keyboard focus after an inline save or a cancel (lands on body).
- Where: plan `docs/superpowers/plans/2026-10-01-ordergroove-phase3b-subscription-edits.md`; SDD ledger lines summarised there; branch `worktree-ordergroove-phase3b-subscription-edits`; merge state recorded at finish.
