---
title: Loyalty page tests — getByRole('progressbar') collides with B3Spin's spinner; settle the hero first (and refetchOnWindowFocus is globally off)
type: concept
created: 2026-07-09
updated: 2026-07-09
lastVerified: 2026-07-09
repo: b2b-buyer-portal
storeHash: all
website: SSW
area: B2B
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
mongoId: 6a554485d5f00733c128a18d
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/components/spin/B3Spin.tsx
    symbol: B3Spin                 # CircularProgress has role="progressbar" while isSpinning
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/index.test.tsx
    symbol: ShippingTracker tests  # settle pattern: await 'You have 2,465 points' before getByRole('progressbar')
  - kind: ts-react
    package: apps/storefront
    path: src/react-setup.tsx
    symbol: QueryClient            # defaults refetchOnWindowFocus: false app-wide
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/components/ShippingTracker.tsx
    symbol: ShippingTracker        # opts back in with refetchOnWindowFocus: true
tags: [memory, b2b-buyer-portal, b2b, loyalty, testing, react-query, progressbar]
---

# Loyalty page tests — getByRole('progressbar') collides with B3Spin's spinner; settle the hero first

Two related gotchas found while adding the free-shipping tracker (2026-07-09):

## 1. `getByRole('progressbar')` is ambiguous while the page is loading

`B3Spin`'s `CircularProgress` carries `role="progressbar"` the whole time
`digestQuery.isFetching || customerQuery.isFetching` is true on the Loyalty
page. Any component query that resolves FASTER than the customer chain (e.g. a
window-function mock resolving instantly) renders its `LinearProgress` while
the page spinner is still mounted → `getByRole('progressbar')` throws
"multiple elements".

**Fix pattern:** settle the hero before the progressbar assertion —
`expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();`
(points text requires the customer query resolved, which unmounts the spinner).
With tiers unmocked (empty), OverviewTab renders no LinearProgress, so exactly
one progressbar remains. Used by all ShippingTracker tests in
`index.test.tsx`.

## 2. `refetchOnWindowFocus` is disabled app-wide

The app-level `QueryClient` in `react-setup.tsx` sets
`refetchOnWindowFocus: false` (and `refetchOnReconnect: false`) as defaults.
Any design that assumes react-query's documented default focus-refresh is
silently wrong in this app — the shipping-tracker spec made exactly that
mistake and the final review caught it. Queries that genuinely want
focus-refresh must opt back in per-query (`refetchOnWindowFocus: true`, see
`ShippingTracker.tsx`).

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--loyalty-earn-rules-blank-title]]
- [[b2b-buyer-portal--dev-red-baseline]]
