---
title: jsdom getComputedStyle resolves plain MUI sx values but not @media-wrapped (responsive breakpoint) ones
type: concept
created: 2026-07-29
updated: 2026-07-29
lastVerified: 2026-07-29
repo: b2b-buyer-portal
storeHash: 24erkpw9h6
website: SSW
area: B2B
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: tests/test-utils.tsx
    symbol: renderWithProviders   # any component rendered through the shared harness
tags: [memory, b2b-buyer-portal, testing, vitest, jsdom, mui, sx, emotion]
---

# jsdom + getComputedStyle can't see responsive (breakpoint) MUI `sx` values

Verified with a throwaway probe test (`Box sx={{ objectFit: 'cover', objectPosition: '...' }}`
vs `Box sx={{ mx: { md: -4 } }}`): jsdom's `window.getComputedStyle()` returns the
literal value for a plain sx property (`objectPosition` → `"center 20%"`), but
returns `""` for a property only set inside a responsive breakpoint object
(`mx: { md: -4 }`) — MUI/emotion compiles those into a `@media (min-width:...)`
rule in the injected stylesheet, and jsdom's CSSOM does not evaluate `@media`
blocks against `window.innerWidth`/`innerHeight` (fixed at 1024x768 in this
repo's setup) when computing style, so the property never resolves.

## Decision + why

- Don't try to assert a responsive-only `sx` value (anything shaped like
  `{ xs: ..., md: ... }` with no plain fallback) via `getComputedStyle` in a
  Vitest/jsdom test — it will read back empty regardless of whether the CSS is
  correct, giving a false failure (or worse, a false pass if asserting `''`).
- A literal (non-breakpoint) `sx` value on the same element **can** be asserted
  this way and is a reliable regression guard.

## How to apply

- When a fix removes/changes a responsive-only value (e.g. a breakpoint-scoped
  margin or width), verify it by reading the diff / rendered DOM structure, not
  by asserting computed style in a test — and say so explicitly rather than
  quietly skipping coverage.
- When a fix changes a plain (always-on) `sx` value (e.g. `objectPosition`,
  `objectFit`, non-breakpoint colors/spacing), a `getComputedStyle` assertion in
  a normal `renderWithProviders` test works fine and is the preferred guard.
- If a responsive value genuinely needs test coverage, resize via
  `window.innerWidth = ...; window.dispatchEvent(new Event('resize'))` is
  **not** sufficient either (same root cause — no `@media` evaluation); would
  need a real browser-mode runner (Playwright/Vitest browser mode) instead.

## Related
- [[board-b2b-buyer-portal]]
