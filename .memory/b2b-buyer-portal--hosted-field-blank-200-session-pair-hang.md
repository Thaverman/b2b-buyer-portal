---
title: Add-card infinite spinner — /checkout/payment/hosted-field only 302s to the payments field when BOTH SHOP_SESSION_TOKEN and SHOP_SESSION_ROTATION_TOKEN are valid; otherwise a blank 200 hangs checkout-sdk initialize() forever (no timeout, no console error); bounded to 20s in 6d790f58
type: concept
created: 2026-09-03
updated: 2026-09-03
lastVerified: 2026-09-03
repo: b2b-buyer-portal
storeHash: ssw
website: both
area: Customer Accounts
memoryType: gotcha
durable: true
status: active
project: payment-methods-page
mongoId: 6a995ec499d6c7c49644ba89
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/PaymentMethods/components/AddPaymentMethodDialog.tsx
    symbol: createStoredCardFormWithTimeout
  - kind: ts-react
    package: apps/storefront
    path: src/pages/PaymentMethods/hostedForm.ts
    symbol: createStoredCardForm
  - kind: ts-react
    package: apps/storefront
    path: src/pages/PaymentMethods/vaultAccess.ts
    symbol: getVaultAccess
tags: [memory, b2b-buyer-portal, payment-methods, hosted-form, checkout-sdk, session, cookies, gotcha]
---

# Add-card infinite spinner — the hosted-field wrapper needs BOTH storefront session cookies, or it returns a blank 200 that hangs `initialize()` forever

Reported 2026-09-03 on sandbox: Add card opens, the spinner never stops, the checkout-sdk
chunk loads, no console errors. The DOM shows **only the first card box** holding an
`<iframe src="/checkout/payment/hosted-field?version=1.967.0">`, the other three empty,
billing unprefilled and country/state as text fields — the whole init `Promise.all` is stuck.

## Key Points
- **Mechanism (cookie-subset probes):** the same-origin wrapper `/checkout/payment/hosted-field`
  is a pure server redirect — `302 → https://payments.bigcommerce.com/pay/hosted_forms/<uuid>/field`
  — and BigCommerce's checkout app issues that 302 **only when BOTH `SHOP_SESSION_TOKEN` and
  `SHOP_SESSION_ROTATION_TOKEN` are present and valid.** Missing/stale either one (or anonymous)
  ⇒ `HTTP 200`, 0-byte body (`x-makeswift-stable-page-reference: checkout-0` — BC, *not* a
  Cloudflare challenge). `SHOP_TOKEN`, `XSRF-TOKEN`, `SF-CSRF-TOKEN`, `Shopper-Pref`,
  `cf_clearance`, `__cf_bm` are irrelevant.
- The SDK mounts fields **sequentially** and waits on the first field's postMessage
  handshake; a blank document never answers, and `initialize()` has **no timeout**, so the
  promise never settles — infinite spinner, nothing in the console.
- **Why one user and not the test harness:** the portal's redux-persisted login can
  outlive/desync from the storefront cookie pair. `account.php` still accepts the session
  token (so the vault scrape passes and the Add card button renders) while the checkout app
  rejects the pair. Also reproduced intermittently in fresh headless sessions during a
  session-rotation race (`account.php 302 → login.php` and the wrapper `200` in the same
  second). Headless vs a real window makes no difference (verified `headless:false` on WSLg).
- **Remedies:** (1) code — `6d790f58` wraps `createStoredCardForm` in a 20 s timeout that
  rejects into the existing formError alert + native-page link and tears down a
  late-arriving form; deployed to sandbox and verified live (spinner at 15 s, alert at ~24 s).
  (2) user — a full **storefront** sign-out/sign-in reissues the pair.
- **Candidate follow-up:** preflight `fetch(wrapper, { redirect: 'manual' })` before creating
  the form — `type: 'opaqueredirect'` = healthy; `status: 200` = desynced session → show the
  sessionExpired message immediately instead of a 20 s wait.
- **Diagnostic fingerprint:** Network shows `hosted-field` **200** (healthy is **302**) and
  **zero** `pay/hosted_forms` requests; DOM has one iframe in `#bpm-card-number`, none elsewhere.
- **Refined (live user case, 2026-09-03) — the desync is DUPLICATE COOKIES.** A stale
  `SHOP_SESSION_TOKEN` and/or `SHOP_SESSION_ROTATION_TOKEN` on the **parent domain
  `.storesupply.com`** (left by another `*.storesupply.com` site) sits alongside the valid
  host-only `sandbox.storesupply.com` pair. Verified: with the parent-domain duplicates added,
  `account.php` stays 200 with a vault token (Add card button renders) while the wrapper returns
  the 0-byte 200 — a duplicate **rotation token alone** is enough. A sandbox re-login reissues
  the host-only cookies but does **not** remove the parent-domain rows, so the user keeps
  failing while still "seeing" the rotation token. **Remedy:** delete the `.storesupply.com`
  `SHOP_SESSION_*` rows (or clear storesupply.com cookies). **Check:** DevTools → Application →
  Cookies shows two rows per name with different Domain values.

## Code references
- `src/pages/PaymentMethods/components/AddPaymentMethodDialog.tsx` (`createStoredCardFormWithTimeout`) — the 20 s bound and late-form teardown.
- `src/pages/PaymentMethods/hostedForm.ts` (`createStoredCardForm`) — the SDK `initialize()` call that can hang.
- `src/pages/PaymentMethods/vaultAccess.ts` (`getVaultAccess`) — passes on `account.php` even when the checkout app rejects the session pair, which is why the button still renders.

## Related
- [[b2b-buyer-portal--stored-card-hosted-form-contract]]
- [[board-payment-methods-page]]
