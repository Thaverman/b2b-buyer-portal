---
title: "Module-level singleton state + a fully `vi.mock`ed filler module = cross-test poisoning: the first test fills the slot, later tests' idempotent filler correctly refuses, and the new production lines go mutation-dead — export a clear() and call it in beforeEach, then prove it with a mutation check"
type: gotcha
created: 2026-07-28
updated: 2026-07-28
lastVerified: 2026-07-28
repo: b2b-buyer-portal
storeHash: all
website: SSW
area: B2B
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
syncPending: [mongodb, obsidian-vault]  # repo sink only — MCP_DOCKER tool surface gone this session; promote per [[b2b-buyer-portal--memory-sinks-docker-mcp-wsl]]
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/loyaltyLandingState.ts
    symbol: clearLoyaltyLanding        # the reset seam; production-real (logoutSession uses it), not a test-only export
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Login/index.test.tsx
    symbol: lands on Rewards after login when the customer has an active tier journey  # the test that only passed in isolation
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Login/navigateAfterSuccessfulLogin.ts
    symbol: navigateAfterSuccessfulLogin  # the store-read + IfIdle lines that went mutation-dead
tags: [memory, b2b-buyer-portal, b2b, testing, vitest, module-state, code-review, mutation-testing]
---

# Module-singleton state + a mocked filler = silently poisoned tests

Found 2026-07-28 by the task review of the loyalty login-landing wiring.

## The mechanism

`loyaltyLanding.ts` keeps its pending check in a module-level variable. Two
callers fill it: a "replacing" prefetch (from `utils/loginInfo.ts`) and an
idempotent `…IfIdle` that fills **only an empty slot**. In
`src/pages/Login/index.test.tsx`, `@/utils/loginInfo` is **fully `vi.mock`ed**,
so the replacing filler never runs — only `IfIdle` can populate the slot, and it
can do so exactly **once per test file**:

1. An early test (no `BC_CONTEXT`) triggers `IfIdle` → slot = resolved-`null`.
2. Every later test's `IfIdle` correctly **refuses to replace** it.
3. So the new tests pass in isolation and fail in the full file — and a
   workaround that pre-fills the slot inside each test makes them pass while
   leaving the production lines they were written to cover **mutation-dead**
   (delete the store-read + `IfIdle` call and the suite still goes green).

Vitest does not reset module state between tests in a file; `vi.mock` hoisting
makes the intended filler unreachable. Both facts are individually benign — the
combination is what bites.

## The fix

Export a **real** reset used by production, not a test-only escape hatch:
`clearLoyaltyLanding()` lives in the leaf state module, is called by
`logoutSession()` (it closes a genuine cross-customer staleness bug — see
[[b2b-buyer-portal--loyalty-login-landing]]), and the test file calls it in
`beforeEach`. Now the brief's verbatim tests pass suite-wide **and** the only
thing that can fill the slot is the production `IfIdle` path reading the
preloaded Redux id — the coverage is real again. Bonus: this repo's knip counts
test files as consumers, so a test-only export would not have been flagged —
another reason to prefer a production-real reset.

## Always finish with the mutation check

For any test written to cover a guard/safety net, **delete the production line
and confirm the test fails**, then restore. Here it turned a plausible-looking
green suite into a proven one; the same check earlier in this project exposed a
different false-pass (an absence assertion racing an async gate — see
[[b2b-buyer-portal--test-absence-assertion-races-async-gate]]). Two independent
false-pass mechanisms in one feature area is enough to make the check routine.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--test-absence-assertion-races-async-gate]]
- [[b2b-buyer-portal--loyalty-login-landing]]
- [[b2b-buyer-portal--msw-mockserver-hangs-unhandled-requests]]
