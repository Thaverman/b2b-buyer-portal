---
title: "Post-login landing defaults to #/loyalty only for an ACTIVE tier journey (NextTier|PrePointsGate) — prefetch + 1500ms budget, never a late bounce, cleared on logout; side effect: super admins now lose /dashboard to the merchant home-landing setting"
type: decision
created: 2026-07-28
updated: 2026-07-28
lastVerified: 2026-07-28
repo: b2b-buyer-portal
storeHash: 24erkpw9h6
website: SSW
area: B2B
memoryType: decision
durable: true
status: active
project: b2b-buyer-portal
syncPending: [mongodb, obsidian-vault]  # repo sink only — MCP_DOCKER tool surface gone this session; promote per [[b2b-buyer-portal--memory-sinks-docker-mcp-wsl]]
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/loyaltyLanding.ts
    symbol: resolveLoyaltyLanding        # budget race; true iff fetchTierProgress returned non-null in time
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/loyaltyLanding.ts
    symbol: prefetchLoyaltyLandingIfIdle # safety net: fills an empty slot only, so the head start survives
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/loyaltyLandingState.ts
    symbol: clearLoyaltyLanding          # called by logoutSession — kills cross-customer staleness
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Login/navigateAfterSuccessfulLogin.ts
    symbol: navigateAfterSuccessfulLogin # precedence: quote-checkout -> loginJump -> loyalty -> role defaults
  - kind: ts-react
    package: apps/storefront
    path: src/shared/routes/index.tsx
    symbol: gotoAllowedAppPage           # storefront-entry flow; override only inside the no-hash branch
tags: [memory, b2b-buyer-portal, b2b, loyalty, login, routing, landing-page, decision]
---

# Post-login landing → Rewards, for active tier journeys only

Shipped 2026-07-28 (commits `ebb74c47`, `1fbf4347`, `f765a5de`, `4813d12b`).

**Trigger is deliberately narrow.** `GetDetailWithProgress` returns
`Success: true` for nearly everyone — including `TargetKind: 'AtTop'` and stores
with no tiers configured ("nothing to progress toward"). So "got a response" is
NOT the trigger: the redirect fires only when `fetchTierProgress` returns
non-null, i.e. `NextTier` or `PrePointsGate` — exactly the customers the Rewards
page has a story for. `AtTop`, unconfigured stores, errors and timeouts land on
the normal role default.

**Latency: prefetch + budget, never a late bounce.** `prefetchLoyaltyLanding`
fires from `getCurrentCustomerInfo` (the verified lowest common login function —
Login page, App-boot JWT re-login, HeadlessController and both Registered flows
all funnel through it) so the ~0.3–1.7 s call runs concurrent with the rest of
login. `resolveLoyaltyLanding` is consulted ONCE at navigation time against a
1500 ms budget; a later answer is simply dropped. `prefetchLoyaltyLandingIfIdle`
in `navigateAfterSuccessfulLogin` is a safety net for flows that skipped the
head start — it fills an empty slot only, so it never restarts an in-flight check.

**Precedence** (both the portal form and storefront `account.php` entry):
quote-checkout redirect → merchant "login lands on storefront home" setting →
loyalty check → today's role defaults. Deep links/hash routes never pay the
budget (the `gotoAllowedAppPage` override lives only in the no-hash branch).

## Two traps this design already paid for

1. **Cross-customer staleness.** The pending check is module-level state that
   outlives a same-page logout→login. A reviewer traced a real path: customer A
   logs in (positive answer stored) → portal logout without reload → customer B
   logs in but `getCurrentCustomerInfo` degrades before its replacing prefetch →
   B inherits A's answer and is redirected. Fixed by clearing on logout
   (`logoutSession` → `clearLoyaltyLanding`). A theoretical edge survives (a
   *different* customer logging in over a live session, no logout, plus a
   degraded login); the standing hardening is to **key the pending check by
   customer id** — which would also let `gotoAllowedAppPage` use `IfIdle`
   instead of a replacing prefetch, removing a duplicate request.
2. **The import cycle** that clearing on logout ran into — see
   [[b2b-buyer-portal--utils-cannot-import-page-api-import-cycle]].

## Side effect to remember (not loyalty-specific)

Moving the `MULTIPLE_B2C`+`SUPER_ADMIN` early return BELOW `loginJump` (required
by the approved precedence) means **on any store with the merchant home-landing
setting enabled — including stores with no loyalty config — super admins now
land on the storefront home instead of `/dashboard`.** Spec-sanctioned, but it is
the one universal behavior delta; it belongs in release notes, not in a bug report.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--loyalty-ssw-tier-progress]]
- [[b2b-buyer-portal--utils-cannot-import-page-api-import-cycle]]
- [[b2b-buyer-portal--module-singleton-state-cross-test-poisoning]]
- [[b2b-buyer-portal--masquerade-jwt-identifies-rep]]
