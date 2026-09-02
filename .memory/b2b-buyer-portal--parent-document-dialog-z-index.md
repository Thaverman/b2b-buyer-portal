---
title: Parent-document dialogs sit BELOW the ThemeFrame unless zIndex is Z_INDEX.MODAL — the overlay iframe is at 12000, MUI Modal default is 1300
type: concept
created: 2026-09-02
updated: 2026-09-02
lastVerified: 2026-09-01
repo: b2b-buyer-portal
storeHash: ssw
website: both
area: Customer Accounts
memoryType: gotcha
durable: true
status: active
project: payment-methods-page
mongoId: 6a9808303dc954910b44ba8a
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/PaymentMethods/components/AddPaymentMethodDialog.tsx
    symbol: AddPaymentMethodDialog
  - kind: ts-react
    package: apps/storefront
    path: src/constants/index.ts
    symbol: Z_INDEX
tags: [memory, b2b-buyer-portal, z-index, themeframe, dialog, mui]
---

# Parent-document dialogs sit BELOW the ThemeFrame unless zIndex is Z_INDEX.MODAL

Found live on sandbox 2026-09-01: the add-card dialog existed in the parent DOM with
hosted fields mounted and every jsdom test green — but `elementFromPoint` at the dialog
center hit `iframe.active-frame`. The dialog was rendering invisibly behind the portal
overlay.

## Key Points
- The ThemeFrame overlay iframe carries **z-index 12000** (`Z_INDEX.IFRAME` in
  `src/constants`); MUI's Modal default is **1300**. Any component that escapes the
  frame into the parent document (which checkout-sdk hosted forms force) renders
  behind the portal unless it sets `sx={{ zIndex: Z_INDEX.MODAL }}` (12005).
- **jsdom cannot catch stacking.** The verification is an `elementFromPoint` probe in a
  real browser; the regression test asserts `toHaveStyle({ zIndex: '12005' })` on
  `.MuiDialog-root`, which only guards the declaration, not the visual outcome.
- `Z_INDEX` already defines the full ladder (IFRAME 12000 … MODAL 12005) — use it, don't
  invent numbers.

## Code references
- `src/constants/index.ts` (`Z_INDEX`) — the ladder.
- `src/pages/PaymentMethods/components/AddPaymentMethodDialog.tsx` (`AddPaymentMethodDialog`) — the fixed consumer.

## Related
- [[board-payment-methods-page]]
