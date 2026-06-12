---
title: current.jwt app_client_id must be the SSW app's ClientId — not getAppClientId() (B2B Edition)
type: concept
created: 2026-06-12
updated: 2026-06-12
lastVerified: 2026-06-12
repo: b2b-buyer-portal
storeHash: ssw
website: SSW
area: Customer Accounts
memoryType: gotcha
durable: true
status: active
project: payment-methods-page
mongoId:
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/PaymentMethods/api.ts
    symbol: listStoredInstruments
  - kind: ts-react
    package: apps/storefront
    path: src/shared/service/bc/api/login.ts
    symbol: getCurrentCustomerJWT
sources:
  - docs/superpowers/specs/2026-06-11-payment-methods-page-design.md
tags: [memory, b2b-buyer-portal, customer-accounts, jwt, oauth]
---

# current.jwt app_client_id must be the SSW app's ClientId — not getAppClientId() (B2B Edition)

The portal already had `getCurrentCustomerJWT(app_client_id)` — but every
existing caller passes `getAppClientId()`, which returns the **B2B Edition
app's** client id. CustomerServices validates the JWT's `aud` against its own
`StoreSecrets.ClientId` (the SSW app), so a B2B-Edition-minted JWT is rejected
as unknown-store → 401 → the UI renders it as "session expired", which re-login
can never fix.

## Key Points
- The SSW app's client id arrives via host config: `window.BC_CONTEXT.paymentMethods.appClientId`. The SSW app must be installed on the store for `/customer/current.jwt` to honor its id.
- `api.ts` emits `b2bLogger.error` diagnostics on the jwt-undefined and 401 paths specifically so this misconfig is distinguishable from a genuinely expired session in logs (the user-facing message is identical by design).
- `getCurrentCustomerJWT` also early-returns `undefined` whenever `platform !== 'bigcommerce'` — Stencil-only; gate features on platform rather than mapping that to an error.
- Backend-side aud/HS512/claim-shape realities are recorded in [[ssw-microservices--bigcommerce-current-customer-jwt-stored-instruments]].

## Code references
- `src/pages/PaymentMethods/api.ts` (`listStoredInstruments`) — fresh-JWT-per-call POST flow reading `config.appClientId`.
- `src/shared/service/bc/api/login.ts` (`getCurrentCustomerJWT`) — the shared JWT fetch helper and its undefined/throw semantics.

## Related
- [[board-payment-methods-page]]
- [[ssw-microservices--bigcommerce-current-customer-jwt-stored-instruments]]
