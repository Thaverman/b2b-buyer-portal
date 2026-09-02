---
title: checkout-sdk stored-card hosted form — top-realm only, VAT-only auth (no IAT code path), FLAT billing fields, detail-less failures; pinned 1.967.0
type: concept
created: 2026-09-02
updated: 2026-09-02
lastVerified: 2026-09-01
repo: b2b-buyer-portal
storeHash: ssw
website: both
area: Customer Accounts
memoryType: finding
durable: true
status: active
project: payment-methods-page
mongoId: 6a9808303dc954910b44ba89
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/PaymentMethods/hostedForm.ts
    symbol: createStoredCardForm
  - kind: ts-react
    package: apps/storefront
    path: src/pages/PaymentMethods/vaultAccess.ts
    symbol: getVaultAccess
  - kind: ts-react
    package: apps/storefront
    path: src/pages/PaymentMethods/components/AddPaymentMethodDialog.tsx
    symbol: AddPaymentMethodDialog
tags: [memory, b2b-buyer-portal, payment-methods, checkout-sdk, hosted-form, vat, pci]
---

# checkout-sdk stored-card hosted form — top-realm only, VAT-only auth, FLAT fields, detail-less failures

Spike-verified 2026-09-01 against `@bigcommerce/checkout-sdk` **1.967.0** (all three
hosted-form bundles read); the in-portal add-card feature is built on these constraints.

## Key Points
- **Realm:** `createStoredCardHostedFormService` only initializes from the **top realm**
  with containers in the **top document** — driven from the ThemeFrame the field
  handshake deadlocks silently. Exact mirror of the old Braintree Drop-in finding
  (which only worked *inside* the iframe realm). Hence the dialog escapes to the parent
  document (MUI Dialog default portal + its own emotion cache bound to the parent head).
- **Auth:** the SDK posts to the legacy
  `stores/{hash}/customers/{shopperId}/stored_instruments` endpoint with
  `Authorization: <vaultToken>` **verbatim**. It has **no code path for the backend's
  VaultInstrumentToken IAT** (an IAT gets 401). The VAT (~30 min TTL) is scraped
  same-origin from the native add-payment-method page's `stencilBootstrap` context.
  The token charset regex `[A-Za-z0-9._-]+` is load-bearing — a naive `[^"]+` captures
  a JSON-escape backslash and poisons the Authorization header.
- **`submitStoredCard(fields, data)`:** `fields` is **FLAT** — `defaultInstrument` plus
  billing keys (incl. `stateOrProvinceCode`, NOT `provinceCode`, NOT a nested
  `billingAddress` object). `data` needs `currencyCode` / `paymentsUrl` / `providerId` /
  `shopperId` (**string**) / `storeHash` / `vaultToken`. Resolves with **no body** —
  always refetch `StoredInstruments`.
- **Failures carry no detail** (`STORED_CARD_FAILED`, empty payload): decline and system
  error are indistinguishable → one generic message, never wording that blames the card.
- **Security posture:** the hosted-field iframes are **same-origin with the store**
  (`/checkout/payment/hosted-field`) — platform-inherited, identical to native checkout.
  Unconsumed backend endpoints after this feature: `VaultInstrumentToken`,
  `VaultClientToken`, `VaultInstrument`, `GetStoredInstrument`.
  Security review: https://claude.ai/code/artifact/21bb679d-a126-491d-b517-da02a45b441d

## Code references
- `src/pages/PaymentMethods/hostedForm.ts` (`createStoredCardForm`) — the wrapper; version pin lives in package.json.
- `src/pages/PaymentMethods/vaultAccess.ts` (`getVaultAccess`) — VAT scrape seam; swap for a backend call if the SDK ever accepts IATs.
- `src/pages/PaymentMethods/components/AddPaymentMethodDialog.tsx` (`AddPaymentMethodDialog`) — parent-document dialog consuming both.

## Related
- [[board-payment-methods-page]]
