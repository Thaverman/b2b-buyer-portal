# Loyalty Earn Points tab — show per-tier point values

**Date:** 2026-07-09
**Status:** Approved (design)
**Area:** B2B buyer portal · Loyalty (`/loyalty`) · Earn Points tab
**Related:** [2026-07-06-loyalty-page-design.md](2026-07-06-loyalty-page-design.md),
`.memory/b2b-buyer-portal--loyalty-earn-rules-blank-title.md`

## Problem

The Earn Points tab renders one card per earn rule but shows **no point values**,
so the tab is uninformative. Two causes:

1. **Title bug (already fixed):** `fetchEarnRules` mapped `title` from
   `rule.customTitle` only; the real Influence.io Launcher payload uses `title`,
   so every card was blank. Fixed on 2026-07-09 with
   `title: rule.customTitle ?? rule.title ?? ''` + a `title?` field on `RawEarnRule`.
2. **Missing data (this spec):** the Launcher `GET /shop/rules/earn` response
   carries `earnValue` (the points), `earnType`, `limitTiers`, and
   `loyaltyTierIds`, but the `EarnRule` DTO drops all of them. The tab has nothing
   to display beyond a bare title.

The same action can appear as multiple tier-gated rules. Live example (shop
`24erkpw9h6`): three "Place an order" rules, `limitTiers: true`, one per tier —
`earnValue` 2 (SELECT), 3 (SIGNATURE), 1 (base) — plus untiered "Sign up"
(`earnValue` 10) and "General Purpose" (`earnValue` 20). Rendered raw, that is
three identical-looking "Place an order" cards.

## Goal

Show each earn action once, with the point value that applies to the customer's
**current tier**. For a SIGNATURE customer the tab reads:

- **Place an order** — Earn 3 points per $1 spent
- **Sign up** — Earn 10 points
- **General Purpose** — Earn 20 points

Full per-tier earn rates already live on the Overview/Tiers tabs as tier perks, so
the Earn tab stays personalized and non-redundant.

## Non-goals

- No change to redeem, history, overview, tiers, or the digest flow.
- No de-duplication of untiered rules that happen to share a title.
- No "completed" state for non-social rules (the customer object exposes only
  social-follow flags; one-time rules like Sign up cannot be known-complete).
- Social earn rules keep their existing Follow button behavior unchanged.

## Design

### 1. DTO — `api.ts`

Extend `RawEarnRule` and `EarnRule` with the three fields the API already returns:

```ts
// RawEarnRule (add)
title?: string;                 // already added by the title fix
earnValue?: number;
limitTiers?: boolean;
loyaltyTierIds?: (string | number)[];

// EarnRule (add)
earnValue: number;
limitTiers: boolean;
loyaltyTierIds: string[];
```

`fetchEarnRules` mapping (title fallback already landed):

```ts
title: rule.customTitle ?? rule.title ?? '',
earnValue: rule.earnValue ?? 0,
limitTiers: rule.limitTiers ?? false,
loyaltyTierIds: (rule.loyaltyTierIds ?? []).map(String),
```

`summary`, `earnType`, `templateName`, `socialUrl` are unchanged. `summary` stays
(harmless; empty from the real API) for backward compatibility.

### 2. Pure tier filter — new exported helper in `api.ts`

Mirrors the existing `isRedeemableCatalogRule` / `getSocialCompletionFlag` pattern.

```ts
export const isEarnRuleForTier = (rule: EarnRule, currentTierId: string | null): boolean => {
  if (!rule.limitTiers) return true;              // applies to every tier
  if (!currentTierId) return false;               // tier-gated but tier unknown → hide
  return rule.loyaltyTierIds.includes(currentTierId);
};
```

### 3. Copy — two new lang keys in `src/lib/lang/locales/en.json`

```
"loyalty.earn.perDollar": "Earn {points} points per $1 spent",
"loyalty.earn.flat": "Earn {points} points",
```

A formatter chooses the key by `earnType`:

- `earnType === 'increments'` → `loyalty.earn.perDollar`
- otherwise → `loyalty.earn.flat`

The points line is **omitted when `earnValue` is 0** (avoids "Earn 0 points"). The
`increments` → per-$1 wording is a heuristic: `placeorder` is the only increments
template observed; other `earnType` values fall back to the flat phrasing.

Pluralization is **not** handled (`earnValue: 1` renders "Earn 1 points") — this
matches every existing `loyalty.*` lang key (e.g. `loyalty.earn.followSuccess`
uses plain `{points} points`). Not worth ICU plurals for one edge tier.

### 4. Rendering — `EarnPointsTab.tsx`

- Filter: `rules.filter((r) => isEarnRuleForTier(r, customer?.currentLoyaltyTierId ?? null))`.
- Per card: `title` → optional `summary` → **points line** (when `earnValue > 0`)
  → existing `renderAction(rule)` (social Follow / Completed unchanged).
- No new props: `EarnPointsTab` already receives `customer`, which carries
  `currentLoyaltyTierId`.

### 5. Edge cases

| Case | Behavior |
|---|---|
| `earnValue` is 0/absent | No points line; title (+ summary) only |
| `currentTierId` is null (customer still loading or untiered) | Tier-gated rules hidden; untiered rules still show |
| Social rule (`instagram_follow`, etc.) | Filter passes (untiered); Follow button renders as today |
| Untiered rules sharing a title | Both shown (not our problem to dedupe) |

## Testing

- **`api.test.ts`**
  - `fetchEarnRules` maps `earnValue` / `limitTiers` / `loyaltyTierIds` from a
    real-shaped payload (the existing `title`-fallback test stays).
  - `isEarnRuleForTier` table: untiered → true; tiered+match → true; tiered+miss →
    false; tiered+null tier → false.
- **`index.test.tsx`**
  - Extend `buildEarnRuleWith` defaults with `earnValue: 0, limitTiers: false,
    loyaltyTierIds: []` so the existing 30 tests stay green.
  - New: a SIGNATURE customer sees only the SIGNATURE "Place an order" (3 pts/$1)
    with the SELECT/base variants filtered out, and the points line renders with
    the correct per-dollar vs flat copy.

## Verification

- `yarn tsc --noEmit` clean.
- Full Loyalty suite green (`yarn test --run src/pages/Loyalty`).
- Manual/Playwright re-check on `sandbox.storesupply.com` once deployed: SIGNATURE
  account shows Place an order (3 pts/$1), Sign up (10), General Purpose (20); no
  duplicate order cards.
