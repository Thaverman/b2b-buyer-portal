---
title: BC_CONTEXT is the host-page config channel — paymentMethods joins storeSuffix
type: concept
created: 2026-06-12
updated: 2026-06-12
lastVerified: 2026-06-12
repo: b2b-buyer-portal
storeHash: ssw
website: SSW
area: Customer Accounts
memoryType: decision
durable: true
status: active
project: payment-methods-page
mongoId:
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/index.d.ts
    symbol: BC_CONTEXT
  - kind: ts-react
    package: apps/storefront
    path: src/pages/PaymentMethods/api.ts
    symbol: isPaymentMethodsAvailable
tags: [memory, b2b-buyer-portal, customer-accounts, host-config, gating]
---

# BC_CONTEXT is the host-page config channel — paymentMethods joins storeSuffix

`window.BC_CONTEXT` is the established channel for the host project (Stencil
theme) to configure portal features per store, set before the portal boots.
**Absent key = feature off** — gating, not failure.

Current shape (typed in `src/index.d.ts`):
- `storeSuffix?: string` — gates order-id obfuscation (2026-06 project).
- `paymentMethods?: { apiBase, appClientId }` — gates the `/payment-methods`
  page (this project); additionally requires `platform === 'bigcommerce'` and
  `!isAgenting`.

## Key Points
- Trust boundary: BC_CONTEXT values are **host-controlled trusted input** — the
  page POSTs a fresh, valid Current Customer JWT to whatever `apiBase` the host
  supplies. Host-page integrity is the assumed boundary (documented, accepted
  posture; same as storeSuffix). No client-side allowlist.
- Multi-store onboarding is config-only on both sides: backend `StoreSecrets`/
  `Sites` entries + the host page setting BC_CONTEXT values. Zero portal code.
- The route-level gate duplicates the availability condition in
  `getAllowedRoutesWithoutComponent` (it can't import from a page folder);
  `isPaymentMethodsAvailable()` in `api.ts` is the page-side source of truth —
  keep the two in sync when extending.

## Code references
- `src/index.d.ts` (`BC_CONTEXT`) — the Window typing for all host-config keys.
- `src/pages/PaymentMethods/api.ts` (`isPaymentMethodsAvailable`) — platform + config availability check.

## Related
- [[board-payment-methods-page]]
- [[board-customer-stored-credit-card]]
