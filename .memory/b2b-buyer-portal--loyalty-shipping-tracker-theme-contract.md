---
title: Loyalty free-shipping tracker — theme-provided window contract (bare globals, not BC_CONTEXT); dormant until theme ships the function
type: concept
created: 2026-07-09
updated: 2026-07-09
lastVerified: 2026-07-09
repo: b2b-buyer-portal
storeHash: 24erkpw9h6
website: SSW
area: B2B
memoryType: decision
durable: true
status: active
project: b2b-buyer-portal
mongoId: 6a554485d5f00733c128a18e
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: isShippingTrackerAvailable   # gate = config present AND typeof fn === 'function'
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: getShippingCalculation       # normalizer; threshold fallback raw → config → 0
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/components/ShippingTracker.tsx
    symbol: ShippingTracker              # hidden on gate-off/loading/error/threshold<=0
  - kind: ts-react
    package: apps/storefront
    path: src/index.d.ts
    symbol: Window                       # loyaltyShippingConfig + getLoyaltyShippingCalculation, both optional
tags: [memory, b2b-buyer-portal, b2b, loyalty, shipping, theme-contract, window-globals]
---

# Loyalty free-shipping tracker — theme-provided window contract

The Rewards-hero free-shipping bar is driven by TWO **bare window globals** set
by the SSW Stencil theme — deliberately NOT under `window.BC_CONTEXT` like the
newer host-config pattern ([[b2b-buyer-portal--bc-context-host-config-gating]]).
Don't "fix" this to BC_CONTEXT; the theme already ships the config this way.

```ts
window.loyaltyShippingConfig = {
  threshold: 300,             // sandbox value; live-verified 2026-07-09
  excludedProductIds: '',     // CSV
  excludedCategoryIds: '',    // CSV
};

// async; contract supplied by SSW (theme repo, not deployed to sandbox yet):
await window.getLoyaltyShippingCalculation() → {
  qualifies, threshold, eligibleSubtotal, remaining,
  excludedByProduct[], excludedByCategory[], ltlItems[]   // lists ignored in v1
}
```

## Decision + why

- **The theme owns all eligibility math** (exclusions, LTL, qualifies); the
  portal never recomputes — it only normalizes missing fields
  (`threshold: raw ?? config ?? 0`, `remaining: raw ?? max(0, threshold−subtotal)`).
- **The portal treats both globals as optional** and renders nothing when either
  is absent, the call rejects, or threshold resolves ≤ 0. This makes the feature
  **dormant on sandbox today**: the config is live but the theme branch that
  defines `getLoyaltyShippingCalculation` has NOT deployed (verified by grepping
  every script bundle on homepage + cart, 2026-07-09). The bar appears
  automatically when the theme ships — no portal change or release needed.
- A sibling theme global `ovrShippingConfig` also exists on window — unrelated,
  do not confuse the two.

## How to apply

- Debugging "tracker not showing": check `typeof window.getLoyaltyShippingCalculation`
  in the console FIRST — `undefined` means the theme hasn't shipped it (expected
  state), not a portal bug. Then check `window.loyaltyShippingConfig`.
- Any change to the returned shape must keep every field optional at the type
  level; the normalizer is the single defense.
- Testing gotchas for this page (spinner role collision, app-wide
  `refetchOnWindowFocus: false`) live in
  [[b2b-buyer-portal--loyalty-test-progressbar-b3spin-collision]].

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--bc-context-host-config-gating]]
- [[b2b-buyer-portal--loyalty-test-progressbar-b3spin-collision]]
- [[b2b-buyer-portal--loyalty-digest-mismatch-influence-launcher]]
