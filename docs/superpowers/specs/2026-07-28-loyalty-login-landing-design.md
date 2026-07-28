# Loyalty login landing — default to Rewards for active-tier customers — design

**Date:** 2026-07-28
**Status:** Approved (design)
**Area:** B2B buyer portal · post-login landing (Login page flow + shared routes) · Loyalty
**Related:** [2026-07-20-loyalty-ssw-tier-progress-design.md](2026-07-20-loyalty-ssw-tier-progress-design.md)
(`fetchTierProgress` contract), [2026-07-27-loyalty-smart-rewards-redesign-design.md](2026-07-27-loyalty-smart-rewards-redesign-design.md).

## Problem

Every login lands on the role default (orders / dashboard / shopping lists) even
for customers actively progressing in the Smart Rewards program. The user wants
customers who "get a response" from `GetDetailWithProgress` to land on the
Rewards page (`#/loyalty`) after login instead.

## Decisions (user-selected 2026-07-28)

1. **Trigger = active tier journey.** Redirect when `fetchTierProgress`
   returns non-null — `targetKind` `NextTier` or `PrePointsGate`. `AtTop`,
   "no tiers configured", errors, and timeouts land normally. (A bare
   `Success: true` was rejected: the endpoint returns that for nearly everyone,
   including customers the Rewards page has no story for.)
2. **Latency = prefetch + budget.** The check fires as early as the customer id
   is known (concurrent with existing login work); the navigation decision
   waits at most **1500 ms** more. Not resolved in time ⇒ normal landing, and
   **never a late bounce**.
3. **Scope = both entry flows, Rewards wins.** The portal login form AND the
   storefront-entry path (`account.php` with no hash) redirect for every role —
   super admins and junior buyers included — except masquerading reps. Existing
   quote-checkout redirects and the merchant's "login lands on storefront home"
   setting take precedence (they exit/bypass the portal landing decision).

## Design

### 1. Decision module — `src/pages/Loyalty/loyaltyLanding.ts` (new)

Page-owned business logic (matroska rule); cross-page imports are established
practice in this repo (shared/routes and several pages already import from
other pages — `yarn lint:dependencies` remains the arbiter).

```ts
export const prefetchLoyaltyLanding = (customerId: number, isAgenting: boolean): void
export const resolveLoyaltyLanding = (budgetMs?: number): Promise<boolean>  // default 1500
```

- `prefetchLoyaltyLanding` stores a module-level promise:
  `fetchTierProgress(customerId).catch(() => null)` when
  `isTierProgressAvailable() && !isAgenting && customerId` — else a resolved
  `null`. Calling it again replaces the stored promise (fresh login = fresh
  check).
- `resolveLoyaltyLanding` races the stored promise against a `budgetMs` timer;
  returns `true` iff the race yields a non-null `LoyaltyTierProgress`. No
  stored promise (prefetch never called) ⇒ `false`. It does not cancel the
  underlying fetch; it simply stops waiting (the resolved value may warm
  nothing — the Loyalty page runs its own query on mount; one duplicate call,
  accepted).

### 2. Portal login flow

- **Prefetch:** in `src/utils/loginInfo.ts`, immediately after the login
  sequence dispatches the customer info into the company slice (the exact
  dispatch site is pinned during implementation), call
  `prefetchLoyaltyLanding(customerId, isAgenting)`. This gives the endpoint
  its head start concurrent with the remaining login work.
- **Decision:** `src/pages/Login/navigateAfterSuccessfulLogin.ts` becomes
  async. New precedence:
  1. `quoteDetailToCheckoutUrl` — unchanged, first (never hijack checkout);
  2. `loginJump` home-landing check — unchanged (merchant setting exits the
     portal; we do not override it);
  3. `await resolveLoyaltyLanding()` — `true` ⇒ `navigate('/loyalty')`, done;
  4. otherwise today's logic unchanged (super-admin dashboard, B2C orders,
     `b2bJumpPath`).
  Note the existing super-admin `MULTIPLE_B2C` early return moves BELOW the
  loyalty check (decision 3: Rewards wins over role defaults). The caller of
  `navigateAfterSuccessfulLogin` awaits it (or fire-and-forget `.then` —
  implementation detail; the function must not race two `navigate` calls).

### 3. Storefront-entry flow

In `gotoAllowedAppPage` (`src/shared/routes/index.tsx`), only inside the
existing `(!url && … account.php) || isAccountEnter` branch (the "no specific
destination" case): call `prefetchLoyaltyLanding(customerId, isAgenting)` then
`await resolveLoyaltyLanding()`; `true` ⇒ `url = '/loyalty'` (then the existing
route-permission `flag` check still runs — `/loyalty` is a registered route
with broad permissions, so an allowed role passes and a disallowed one falls
through exactly like any other URL). Deep links / existing hashes never touch
this branch — zero added latency there.

### 4. Failure posture

| Condition | Landing |
|---|---|
| `NextTier` or `PrePointsGate` within budget | `#/loyalty` |
| `AtTop` / no tiers configured / `Success:false` | normal (role default) |
| Endpoint error / network failure / 1500 ms budget exceeded | normal — and no bounce when the response arrives later |
| `progressSite` absent / non-Stencil / no `BC_CONTEXT.loyalty` | normal (prefetch no-ops) |
| Masquerading rep | normal (both flows) |
| Quote-checkout redirect pending | checkout wins, loyalty check skipped |
| Merchant "land on storefront home" setting | home wins (unchanged) |
| Tier-allowlist would deny the customer | **Accepted edge:** lands on Rewards' "not available" state. Pre-checking the allowlist needs digest+customer+tiers (≫ budget); the allowlist is empty today. Revisit only if the allowlist is ever populated long-term. |

## Non-goals

- No sessionStorage/localStorage "only first login" memory (every login
  re-evaluates — decision 3 said "after login", plainly).
- No cancellation/AbortController for the prefetch (harmless duplicate).
- No seeding of the react-query cache from the prefetch result.
- No change to `LEGACY_TABS`, the Loyalty page itself, or its gates.

## Testing

- **`loyaltyLanding` unit tests** (new `loyaltyLanding.test.ts`, MSW +
  fake-timer where needed): NextTier ⇒ `true`; PrePointsGate ⇒ `true`;
  AtTop ⇒ `false`; endpoint 500/network error ⇒ `false`; slower than budget ⇒
  `false` (and no unhandled rejection); `progressSite` absent ⇒ `false`
  without calling the endpoint; `isAgenting` ⇒ `false` without calling;
  re-prefetch replaces the previous promise.
- **`navigateAfterSuccessfulLogin` tests**: eligible ⇒ `navigate('/loyalty')`;
  not eligible ⇒ existing role paths (assert current behaviors preserved);
  quote-checkout URL still wins; exactly one `navigate` call per invocation.
- **`gotoAllowedAppPage`**: coverage added only if a test harness for it
  already exists (to be checked during planning); otherwise the branch logic
  is covered indirectly and noted.
- Existing Login page tests (`src/pages/Login/index.test.tsx`) must stay green
  — the default (non-eligible) path is behavior-identical.

## Verification

- Suites green; `tsc --noEmit`; scoped eslint; `yarn lint:dependencies` clean
  (arbiter for the cross-page import); knip at baseline; `yarn build` exit 0.
- Live (sandbox): a `PrePointsGate`/`NextTier` account logging in via the
  portal form lands on `#/loyalty`; an `AtTop` account (current sandbox test
  accounts) lands on `#/orders` as today; masquerade unaffected.
