# Loyalty tier-allowlist gate for the buyer portal — design

**Date:** 2026-07-14
**Status:** Approved (design)
**Area:** B2B buyer portal · Loyalty (`/loyalty`) page + hero shipping tracker
**Related:** [2026-07-09-loyalty-shipping-tracker-design.md](2026-07-09-loyalty-shipping-tracker-design.md),
[2026-07-06-loyalty-page-design.md](2026-07-06-loyalty-page-design.md),
the stencil theme's "Loyalty Program Display Rules" reference (2026-07-13 audit) and its
`2026-07-13-influenceio-loyalty-rollout-gates-design.md` (authoritative rollout-gates spec).

## Problem

The SSW Stencil theme now tier-gates every influence.io loyalty surface via a
rollout lever: `theme_settings.loyalty_allowed_tiers` (CSV of tier names),
plumbed to base-layout pages as `window.loyaltyRolloutConfig.allowedTiers` and
enforced at four points (launcher, cart/drawer panel, checkout, order
confirmation) with a fail-closed posture when the list is set.

**The lever is LIVE on sandbox (verified 2026-07-14):**
`window.loyaltyRolloutConfig = { allowedTiers: 'ESSENTIAL,SELECT,SIGNATURE' }`.

The buyer portal's `/loyalty` Rewards page (and its hero free-shipping tracker)
is a fifth loyalty surface with **no tier gate** — any logged-in customer sees
the full loyalty UI regardless of tier verification, contradicting the theme's
rollout posture. This spec brings the portal into rule-parity.

## Decision (user-selected): page-level gate only

The Rewards nav item stays visible to logged-in members; the **page** verifies
the tier and renders the existing `"Rewards are not available."` state when
denied. No nav hiding, no route removal — the route predicate is synchronous
while tier verification is async, and plumbing an async verdict into
routeList would require new global state (against the AGENTS.md migration).

One enforcement point (the page) covers both portal surfaces: the
ShippingTracker renders inside the gated page, and the theme independently
never installs `window.getLoyaltyShippingCalculation` for excluded tiers
(theme `wire()` is tier-gated), so the tracker is doubly closed.

## Allowlist semantics (MUST stay identical to the theme's canon)

The theme's `parseAllowedTiers` / `isTierAllowed` (`influence-client.js`)
semantics, reproduced as exported pure helpers in the page-local `api.ts`:

- CSV of tier **names** (titles), split on `,`, trimmed, lowercased, blanks dropped.
- **Empty list ⇒ everyone allowed** (lever off; zero behavior change).
- Non-empty ⇒ case-insensitive, whitespace-trimmed **exact** membership of the
  customer's current tier title.
- Null/undefined/empty tier title **never matches a non-empty list** ⇒ denied.
- Config read: `parseAllowedTiers((window.loyaltyRolloutConfig || {}).allowedTiers)` —
  the `|| {}` guard means a **missing/blocked global degrades to empty list
  (fail OPEN)**, exactly like the theme's cart-panel.
- Accepted risks carried over verbatim from the theme spec: tier names with
  HTML-special characters never match; comma-containing names inexpressible;
  renaming a tier in the influence.io admin silently changes who is allowed.

## Design

### 1. Window type — `src/index.d.ts`

```ts
/** Theme-set rollout gate; absent (older theme deploys) = empty allowlist = everyone. */
loyaltyRolloutConfig?: {
  allowedTiers?: string;
};
```

### 2. Helpers — `src/pages/Loyalty/api.ts` (exported, unit-tested)

```ts
export const parseAllowedTiers = (csv: string | undefined): string[]
export const isTierAllowed = (tierTitle: string | null | undefined, allowed: string[]): boolean
export const getAllowedTiers = (): string[]
```

No new transport. The portal does NOT adopt the theme's `POST /customer/auth`
path; the tier title comes from the existing digest → Launcher `customer`
(`currentLoyaltyTierId`) → `fetchTiers` title lookup.

### 3. Page gate — `src/pages/Loyalty/index.tsx`

Let `allowed = getAllowedTiers()` (read once per render; the global is static
per pageview). Let `tierTitle` be the already-computed
`tiers.find(t => t.id === customer.currentLoyaltyTierId)?.title ?? null`.

**When `allowed` is empty (lever off / global absent / older theme):**
behavior is exactly today's — hero, tabs, error+retry, sessionExpired,
notEnrolled states all unchanged. Zero regression surface.

**When `allowed` is non-empty (lever on):**

| State | Render |
|---|---|
| Customer + tiers resolved, `isTierAllowed(tierTitle, allowed)` true | Full page, exactly as today |
| Resolved, tier NOT listed (or tier-less member / blank title) | Existing unavailable state (`loyalty.unavailable`, "Rewards are not available.") — hero, tabs, tracker all absent (theme spec R3: excluded tier is fully outside the program) |
| Unverifiable: digest/JWT failure, Launcher auth/customer failure (incl. `notEnrolled` 404), tiers fetch failure | **Fail closed** ⇒ same unavailable state. Deliberately replaces the error/retry, sessionExpired, and notEnrolled UIs while the lever is on (theme §5: platform outage ⇒ CLOSED everywhere; no JWT = unverifiable = denied) |
| Queries still in flight (verdict unknown) | `B3Spin` spinner only — no hero/tabs flash to a possibly-denied member (theme's hidden-shell principle) |

No new lang keys — `loyalty.unavailable` is reused.

### 4. ShippingTracker — no changes

Inherits the page gate (renders inside the gated page). Theme-side, excluded
tiers never receive `window.getLoyaltyShippingCalculation` (installed only by
the tier-gated `wire()`), so the tracker is closed by two independent
mechanisms. The excluded tier losing the $300 progress bar is the intended R3
posture, not a regression.

### 5. Enforcement-point inventory (rule-parity map)

| Theme enforcement point | Portal equivalent |
|---|---|
| ① launcher `gate()` | N/A (theme-owned) |
| ② cart-panel `activate()` | N/A (theme-owned) |
| ③ checkout inline | N/A (theme-owned) |
| ④ order-confirmation inline | N/A (theme-owned) |
| ⑤ **buyer portal `/loyalty` page (this spec)** | single gate in `Loyalty/index.tsx`; tracker inherits |

`loyalty_require_login` needs no portal analog — the buyer portal is
login-gated by construction. Masquerading reps are already excluded
(`isAgenting` gate, digest identifies the rep not the buyer).

## Edge cases

| Case | Behavior |
|---|---|
| `window.loyaltyRolloutConfig` absent (old theme artifact) | Empty list ⇒ fail open ⇒ today's behavior |
| `allowedTiers: ''` | Empty list ⇒ fail open |
| `allowedTiers: ' , ,'` (blanks) | Blanks dropped ⇒ empty ⇒ fail open |
| Lever on + tier `SIGNATURE` vs list `signature` | Allowed (case-insensitive) |
| Lever on + `currentLoyaltyTierId` null (tier-less member) | Denied |
| Lever on + tiers list empty/failed (title unresolvable) | Denied (unverifiable) |
| Lever on + digest 401 (expired session) | Denied — unavailable state, NOT the session-expired alert |
| Lever on + Launcher 404 notEnrolled | Denied — unavailable, NOT the "start earning" info alert |
| Lever off + any of the above failures | Today's respective error/info states, unchanged |
| Masquerading rep | Already unavailable before this spec (isAgenting) |

## Non-goals

- Nav-item or route hiding (user decision — page-level only).
- Any `loyalty_require_login` analog.
- Per-pageview denial latching (react-query's query lifecycle already gives
  one verdict per mount; a full reload re-evaluates, same as the theme).
- Adopting the theme's `/customer/auth` transport or hardcoded app client id.
- Gating any non-loyalty portal surface.

## Testing

- **`api.test.ts`** — `parseAllowedTiers` / `isTierAllowed` table mirroring the
  theme's semantics: empty ⇒ true; exact trimmed/lowercased match; miss ⇒ false;
  null/undefined/'' vs non-empty ⇒ false; blanks dropped; `getAllowedTiers`
  with global absent ⇒ `[]`.
- **`index.test.tsx`** — with `window.loyaltyRolloutConfig` set (and cleaned up
  in `afterEach`):
  - allowed tier ⇒ page renders (hero + tabs);
  - unlisted tier ⇒ "Rewards are not available." and no hero/tabs/tracker;
  - digest failure, customer 404, tiers failure ⇒ unavailable (and NOT the
    error/retry, session-expired, or not-enrolled states);
  - `allowedTiers: ''` ⇒ current behavior;
  - all existing tests untouched (they never set the global ⇒ fail open).

## Verification

- `yarn tsc --noEmit` clean; Loyalty suite green; scoped eslint clean.
- Live (sandbox, lever already on): logged in as a SIGNATURE member the
  Rewards page renders; flipping the theme's allowlist to exclude SIGNATURE
  (or testing with a tier-less account) must show "Rewards are not available."
  Re-runnable with the existing Playwright login flow.
