---
title: Centering MUI scrollable Tabs — use first/last-tab auto margins; justify-content 'safe center' is parse-but-ignored on Chromium <115 / Safari <17.6 and clips leading tabs
type: concept
created: 2026-07-10
updated: 2026-07-10
lastVerified: 2026-07-10
repo: b2b-buyer-portal
storeHash: ssw
website: SSW
area: B2B
memoryType: decision
durable: true
status: active
project: b2b-buyer-portal
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/index.tsx
    symbol: Loyalty            # Tabs sx: first/last-tab auto margins
  - kind: ts-react
    package: apps/storefront
    path: vite.config.ts
    symbol: modernTargets      # 'since 2022' — includes Safari 15.4–17.5 / Chrome 97–114
tags: [memory, b2b-buyer-portal, css, flexbox, mui-tabs, browser-compat]
---

# Centering MUI scrollable Tabs — auto margins, not `safe center`

CSS Box Alignment **parsing is per-property**: Chromium 57–114 and Safari
10.1–17.5 *parse* `justify-content: safe center` (the grammar shipped with
Grid) but only *honor* `safe` in **flex** layout from Chrome 115 / Safari 17.6.
On those engines the declaration is **not dropped** — it computes to plain
`center`. In an overflowing scrollable flex row (MUI Tabs `flexContainer`;
`Tab` has `flex-shrink: 0`) plain `center` pushes the leading tabs past
`scrollLeft = 0`, where they are **unreachable**. `@supports` cannot gate it —
those engines pass the parse test.

The repo's build envelope (`vite.config.ts` `modernTargets: 'since 2022'`)
**includes** the affected engines, so `safe center` was rejected during the
loyalty mobile fixes (adversarial review catch, 2026-07-10).

**Adopted equivalent (universal):** on the Tabs `sx`,
`'& .MuiTabs-flexContainer > :first-of-type': { ml: 'auto' }` and
`'& … > :last-of-type': { mr: 'auto' }`. Auto margins absorb free space when
the tabs fit (perfectly centered, symmetric insets) and resolve to 0 on
overflow (start-aligned, fully scrollable). Playwright-verified in both states.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--b3dialog-inflow-wrapper-flex-gap]]
