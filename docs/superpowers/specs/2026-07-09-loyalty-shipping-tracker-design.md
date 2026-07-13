# Loyalty free-shipping tracker — design

**Date:** 2026-07-09
**Status:** Approved (design)
**Area:** B2B buyer portal · Loyalty (`/loyalty`) · hero banner
**Related:** [2026-07-09-loyalty-earn-points-tier-values-design.md](2026-07-09-loyalty-earn-points-tier-values-design.md),
[2026-07-06-loyalty-page-design.md](2026-07-06-loyalty-page-design.md)

## Problem

SSW offers free shipping once the cart's shipping-eligible subtotal reaches a
threshold ($300 on sandbox). Shoppers on the Rewards page have no visibility
into how close they are. The host Stencil theme owns the eligibility math; the
portal should render a progress bar in the Loyalty hero.

## Integration contract (host theme)

Two theme-provided globals. **Verified live on sandbox 2026-07-09:** the config
exists on every page; the function is NOT yet deployed (undeployed theme
branch), so the portal must treat both as optional.

```ts
window.loyaltyShippingConfig?: {
  threshold: number;            // 300 on sandbox
  excludedProductIds: string;   // CSV, may be ''
  excludedCategoryIds: string;  // CSV, may be ''
};

// async; example return (contract supplied by SSW):
window.getLoyaltyShippingCalculation?: () => Promise<{
  qualifies: boolean;          // eligibleSubtotal >= threshold
  threshold: number;           // 300
  eligibleSubtotal: number;    // 130.85 — already excludes excluded products/categories
  remaining: number;           // 169.15
  excludedByProduct: unknown[];
  excludedByCategory: unknown[];
  ltlItems: unknown[];         // freight items
}>;
```

The theme does all the math; the portal renders and never recomputes
eligibility. Every field is treated as possibly missing at runtime.

## Goal

In the blue Loyalty hero (below the tier chip), on every tab:

- **In progress** (`qualifies: false`): "**$169.15 away from FREE shipping**",
  a LinearProgress bar at `min(100, eligibleSubtotal / threshold * 100)`, and a
  "$130.85 / $300" caption.
- **Qualified** (`qualifies: true`): "You've earned FREE shipping!" with a full
  bar.
- **Hidden entirely** when: the gate is off (either global absent — e.g. theme
  not yet deployed), the calculation call rejects, or the query is still
  loading. No spinner, no placeholder, no error UI in the hero.
- Empty cart is NOT an error: bar at 0, "$300 away from FREE shipping".

## Design

### 1. Types — `src/index.d.ts`

Add both globals to `Window`, optional, exactly as in the contract above (list
fields optional in the return type: the wrapper defends against absences).

### 2. API wrapper — `src/pages/Loyalty/api.ts` (page-local pattern)

```ts
export interface ShippingCalculation {
  qualifies: boolean;
  threshold: number;
  eligibleSubtotal: number;
  remaining: number;
}

export const isShippingTrackerAvailable = (): boolean =>
  Boolean(window.loyaltyShippingConfig) &&
  typeof window.getLoyaltyShippingCalculation === 'function';

export const getShippingCalculation = async (): Promise<ShippingCalculation>
```

Normalization in `getShippingCalculation` (defensive defaults):
- `threshold: raw.threshold ?? window.loyaltyShippingConfig?.threshold ?? 0`
- `eligibleSubtotal: raw.eligibleSubtotal ?? 0`
- `remaining: raw.remaining ?? Math.max(0, threshold - eligibleSubtotal)`
- `qualifies: raw.qualifies ?? false`
- Function missing at call time → throw (query gate makes this unreachable;
  mirrors `requireConfig`). Rejection propagates to the query; the component
  hides. Log rejections via `b2bLogger.error` (message includes
  'Loyalty: shipping calculation failed'); never render error UI.
- `excludedByProduct` / `excludedByCategory` / `ltlItems` are not mapped (v1
  ignores them).

### 3. Component — new `src/pages/Loyalty/components/ShippingTracker.tsx`

Self-contained (owns its query, like EarnPointsTab/RewardsTab/HistoryTab):

- `useQuery({ queryKey: ['loyaltyShipping'], queryFn: getShippingCalculation,
  enabled: isShippingTrackerAvailable() })` — no polling; react-query's default
  refetch-on-window-focus gives a free refresh after cart edits in another tab.
- Returns `null` unless the query has data (loading, error, gate-off → nothing).
- Rendered by `LoyaltyHero` at the bottom of the blue hero Box (after the tier
  chip block), styled on the hero's contrast color; bar `height: 8,
  borderRadius: 4` (matches OverviewTab's progress bar).
- Money formatted with the existing `currencyFormat()` from
  `@/utils/b3CurrencyFormat`.
- `LoyaltyHero` gains no new props — it just renders `<ShippingTracker />`.

### 4. Copy — `src/lib/lang/locales/en.json`

```
"loyalty.shipping.away": "{amount} away from FREE shipping",
"loyalty.shipping.progress": "{current} / {threshold}",
"loyalty.shipping.qualified": "You've earned FREE shipping!",
```

(`{amount}`/`{current}`/`{threshold}` are pre-formatted currency strings — all
three use `currencyFormat()` output verbatim, so the caption reads
"$130.85 / $300.00", not "$300".)

## Edge cases

| Case | Behavior |
|---|---|
| Config absent (feature off / theme not deployed) | Tracker renders nothing |
| Function absent (older theme) | Tracker renders nothing |
| Calculation rejects | Logged; tracker renders nothing |
| Result missing fields | Defensive defaults per §2 |
| `threshold` 0 or missing everywhere | Guard: no division; tracker renders nothing (avoid 0/0 bar) |
| Empty cart (`eligibleSubtotal` 0) | Bar at 0, "$300 away from FREE shipping" |
| `eligibleSubtotal > threshold` with `qualifies` true | Bar capped at 100% |
| Masquerading rep | Loyalty page already gated `!isAgenting`; tracker inherits |

## Non-goals (v1)

- No rendering of `excludedByProduct` / `excludedByCategory` / `ltlItems`.
- No polling or cart-event subscription.
- No cart-page or non-portal rendering (theme territory).
- No qualifying-celebration animation.

## Testing

Window-global mocks (no MSW — it's a window function):

- Hidden when: `loyaltyShippingConfig` absent; function absent; promise rejects
  (and the rejection is logged).
- Progress state at the contract example (`eligibleSubtotal` 130.85,
  `threshold` 300, `remaining` 169.15): copy "$169.15 away from FREE shipping",
  caption "$130.85 / $300.00", progressbar `aria-valuenow` 44 (MUI rounds
  `min(100, 130.85 / 300 * 100)` = 43.62 to the nearest integer).
- Qualified state: "You've earned FREE shipping!", bar 100.
- `threshold` falls back to `window.loyaltyShippingConfig.threshold` when the
  result omits it; tracker hidden when threshold resolves to 0.
- Existing Loyalty tests stay green: with no window globals set, the tracker is
  gate-off and the hero renders exactly as before.

## Verification

- `yarn tsc --noEmit` clean; Loyalty suite green; scoped eslint clean.
- Live (once the theme branch deploys the function): Rewards-page hero shows
  the bar with real cart numbers; with an over-threshold cart it flips to the
  qualified state.
