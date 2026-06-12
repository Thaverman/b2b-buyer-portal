---
title: dev branch baseline is red — diff test/lint results against baseline, never patch unrelated redness
type: concept
created: 2026-06-12
updated: 2026-06-12
lastVerified: 2026-06-12
repo: b2b-buyer-portal
storeHash: ssw
website: SSW
area: Tooling
memoryType: finding
durable: true
status: active
project: payment-methods-page
mongoId: 6a2c5201cdacaf8a4e6c4bd2
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/ManageSubscriptions/index.tsx
    symbol: ManageSubscriptions
  - kind: ts-react
    package: apps/storefront
    path: src/utils/analytics.ts
    symbol: analytics
tags: [memory, b2b-buyer-portal, tooling, flaky-tests, lint]
---

# dev branch baseline is red — diff test/lint results against baseline, never patch unrelated redness

A clean `dev` checkout of this fork is NOT green (verified 2026-06-12 in a fresh
worktree with frozen-lockfile install):

- **Full `yarn vitest run` (parallel): ~129–150 failures** concentrated in
  date-filter/search suites (CompanyOrderList, MyOrders, Invoice, Dashboard,
  QuoteDraft…). Machine-flaky — the same files pass in isolation, and two
  identical full runs produce *different* failure sets.
- **`yarn lint:eslint`** fails on `src/pages/ManageSubscriptions/index.tsx`
  (no-unused-vars error + no-console warning).
- **`yarn lint:dependencies` + `yarn lint:knip`** both flag
  `src/utils/analytics.ts` (orphan / unused file).

## Key Points
- A feature branch's verification gate is **"no NEW redness"**: capture a
  baseline failure list on the branch base (`grep -E "FAIL" | sort -u`), run the
  suite after changes, diff, and arbitrate any new line with an isolated re-run
  of that file.
- **Never patch the pre-existing items inside a feature branch.** A Task-5
  subagent once added `eslint-disable` comments to ManageSubscriptions to force
  `yarn lint` green — it had to be reverted; per the repo's surgical-changes
  rules pre-existing issues are reported, not fixed.
- Scoped checks stay useful and green: `yarn eslint <your-paths> --max-warnings 0`
  and `yarn vitest run <your-page-folder>`.

## Code references
- `src/pages/ManageSubscriptions/index.tsx` (`ManageSubscriptions`) — carries the two pre-existing eslint violations.
- `src/utils/analytics.ts` (`analytics`) — pre-existing depcruise orphan / knip unused file.

## Related
- [[board-payment-methods-page]]
