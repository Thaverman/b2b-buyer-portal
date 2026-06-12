---
title: Current Customer JWT identifies the rep during masquerade — gate JWT features on isAgenting
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
mongoId: 6a2c5201cdacaf8a4e6c4bd0
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/PaymentMethods/index.tsx
    symbol: PaymentMethods
  - kind: ts-react
    package: apps/storefront
    path: src/shared/routeList.ts
    symbol: getAllowedRoutesWithoutComponent
sources:
  - docs/superpowers/specs/2026-06-11-payment-methods-page-design.md
tags: [memory, b2b-buyer-portal, customer-accounts, jwt, masquerade]
---

# Current Customer JWT identifies the rep during masquerade — gate JWT features on isAgenting

`/customer/current.jwt` mints a token for the **logged-in storefront customer**.
When a sales rep is masquerading/agenting for a company
(`b2bFeatures.masqueradeCompany.isAgenting`), that logged-in customer is the
**rep**, not the buyer they are acting for. Any feature authenticated by the
Current Customer JWT would silently read or mutate the *rep's own* data while
the portal UI implies it is the buyer's.

Surfaced by the payment-methods security review: a rep could have viewed or
deleted their own saved cards believing they were managing the company's.

## Key Points
- Payment Methods suppresses the feature in TWO places while agenting: the route
  gate in `getAllowedRoutesWithoutComponent` (menu + deep links) and the page's
  own `isAvailable = isPaymentMethodsAvailable() && !isAgenting` fallback.
- Apply the same dual gate to ANY future Current-Customer-JWT-backed feature in
  this portal — the JWT mechanism itself cannot represent the masqueraded buyer.
- Delete here is destructive (unvaults at the payment gateway), which is why
  acting on the wrong identity was rated the highest-consequence finding.

## Code references
- `src/pages/PaymentMethods/index.tsx` (`PaymentMethods`) — page-level `isAvailable` check.
- `src/shared/routeList.ts` (`getAllowedRoutesWithoutComponent`) — three-way route gate (platform / BC_CONTEXT / isAgenting), placed before all role branches.

## Related
- [[board-payment-methods-page]]
- [[ssw-microservices--bigcommerce-current-customer-jwt-stored-instruments]]
