---
title: B3Dialog renders an in-flow wrapper Box even when closed — never place it inside a gap flex/grid container (siblings shrink by one gap per dialog)
type: concept
created: 2026-07-10
updated: 2026-07-10
lastVerified: 2026-07-10
repo: b2b-buyer-portal
storeHash: ssw
website: SSW
area: B2B
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/components/B3Dialog.tsx
    symbol: B3Dialog          # returns <Box><Box ref={container}/><Dialog…/></Box> — in-flow even when closed
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/components/RewardsTab.tsx
    symbol: RewardsTab        # dialogs moved after the card grid for exactly this reason
tags: [memory, b2b-buyer-portal, b2b, layout, flexbox, dialog]
---

# B3Dialog renders an in-flow wrapper Box even when closed — never place it inside a gap flex/grid container

`B3Dialog` returns `<Box><Box ref={container} /><Dialog …/></Box>`. The outer
`Box` and the `ref` target are **real in-flow DOM even when `isOpen` is false**
(the MUI `Dialog` portals away, the wrappers do not).

As children of a `display: flex` container with `gap`, each closed dialog is a
zero-size flex item that still **consumes one gap**. On the Loyalty RewardsTab
the two dialogs inside the card grid made the last reward card exactly
2 × 16px = **32px narrower** than its siblings (Playwright-measured; fix
verified equal-width).

**Fix pattern:** render `B3Dialog` after/outside the layout container — portal
and dialog behavior are unaffected by where the wrapper sits.

**Spot it by:** the last item of a `gap` flex row being narrower by `n × gap`
when `n` dialogs are siblings in that row.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--tabs-centering-auto-margins-not-safe-center]]
