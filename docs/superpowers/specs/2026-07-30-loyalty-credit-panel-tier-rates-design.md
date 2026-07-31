# Loyalty "My benefits" — tier-specific credit-rate copy — design

**Date:** 2026-07-30
**Status:** Approved (design)
**Area:** B2B buyer portal · Loyalty (`/loyalty`) — My benefits tab, `BenefitsInfoCards`
**Related:** [2026-07-27-loyalty-my-benefits-redesign-design.md](2026-07-27-loyalty-my-benefits-redesign-design.md)
(decision 6 of that spec explicitly accepted a single hardcoded "1% rate" across
every tier as a static-figure trade-off; this spec supersedes that one point.)

## Problem

`BenefitsInfoCards` renders three explainer cards on My benefits: **Earning and
Redeeming Credit**, **Free Shipping**, and **Your Tier Status**. The customer
supplied refreshed copy for all three cards per membership tier (Essential /
Select / Signature). Diffing that copy against what ships today:

- **Free Shipping** and **Your Tier Status** are verbatim-identical to the
  current copy already, for every tier. No change needed.
- **Earning and Redeeming Credit** changes: the bullet list shrinks from 5
  items to 4, and the rate line must show the customer's actual tier rate
  (Essential 1%, Select 2%, Signature 3%) instead of a hardcoded "1%" for
  everyone.

This spec covers only the credit card's copy and the tier-rate lookup.

## New credit-card copy

Bullet 1 (unchanged across tiers, no longer interpolates `{tier}`):
> Every purchase earns you points, based on your tier rate.

Bullet 2 — tier-specific rate line:

| Tier | Line |
|---|---|
| Essential | "Once you reach $500 in annual purchases, your rate is 1% of your total order." |
| Select | "Your rate is 2% of your total order." |
| Signature | "Your rate is 3% of your total order." |
| Unknown / null (fallback) | "Your rate depends on your membership tier." |

Bullets 3–4 (fixed, replacing the old point3/point4/point5 — drops the "email
notification" and "12 months validity" bullets):
> Redeem your points for a certificate on the Get Rewards page.
> Certificates can be used alongside product discounts.

## Tier matching

`BenefitsInfoCards` already receives `tierDisplayName: string | null` (the
page's SSW-name-first, Influence-fallback display tier — same prop already
used for the intro/banner `{tier}` interpolation). A new local, unexported
helper in `BenefitsInfoCards.tsx` normalizes and matches it:

```ts
type CreditRateTier = 'essential' | 'select' | 'signature';

const CREDIT_RATE_TIERS: CreditRateTier[] = ['essential', 'select', 'signature'];

function matchCreditRateTier(tierDisplayName: string | null): CreditRateTier | null {
  const normalized = tierDisplayName?.trim().toLowerCase();
  return CREDIT_RATE_TIERS.find((tier) => tier === normalized) ?? null;
}
```

This mirrors the case-insensitive, trim-then-compare convention `isTierAllowed`
already uses in `api.ts` for tier-name matching — but stays local to
`BenefitsInfoCards.tsx` rather than growing `api.ts`, since it is pure
display-copy selection, not shared by any other consumer, and is exercised
today (and after this change) only through the component's own render-based
tests.

A `Record<CreditRateTier, string>` maps each matched tier to its i18n key
(literal key strings throughout — no dynamically-built key names, matching the
existing `tierDisplayName ? b3Lang(a) : b3Lang(b)` ternary style already used
in this file and in `BenefitsTab.tsx`):

```ts
const CREDIT_RATE_KEYS: Record<CreditRateTier, string> = {
  essential: 'loyalty.benefits.credit.point2Essential',
  select: 'loyalty.benefits.credit.point2Select',
  signature: 'loyalty.benefits.credit.point2Signature',
};
```

**Implementation note:** The Record-lookup approach shown above was replaced in
implementation with explicit literal-keyed if/else branches. Indexing
`CREDIT_RATE_KEYS[creditRateTier]` inside the `b3Lang(...)` call is a computed
key expression, which conflicts with the plan's global constraint: *every
`b3Lang(...)` call site must use a literal key string*. The shipped code uses an
IIFE with explicit if-branches to ensure each `b3Lang()` call passes a literal
key argument.

Unmatched (`null` — no tier resolved, or a name outside the three known tiers,
e.g. a future 4th tier) falls back to `loyalty.benefits.credit.point2Generic`,
which drops the specific percentage and $500 mention rather than guessing.

## i18n changes (`en.json`)

Remove:
- `loyalty.benefits.credit.point2` (was the hardcoded "At the {tier} level…1% rate…" line)
- `loyalty.benefits.credit.point2Generic` (old wording — replaced, see below)
- `loyalty.benefits.credit.point5`

Rewrite in place:
- `loyalty.benefits.credit.point1`: "Every purchase earns you points, based on your tier rate."
- `loyalty.benefits.credit.point3`: "Redeem your points for a certificate on the Get Rewards page."
- `loyalty.benefits.credit.point4`: "Certificates can be used alongside product discounts."

Add:
- `loyalty.benefits.credit.point2Essential`: "Once you reach $500 in annual purchases, your rate is 1% of your total order."
- `loyalty.benefits.credit.point2Select`: "Your rate is 2% of your total order."
- `loyalty.benefits.credit.point2Signature`: "Your rate is 3% of your total order."
- `loyalty.benefits.credit.point2Generic`: "Your rate depends on your membership tier."

`loyalty.benefits.credit.title` is untouched. `loyalty.benefits.shipping.*` and
`loyalty.benefits.tierStatus.*` are untouched (copy already matches).

## Component change

`BenefitsInfoCards.tsx`'s credit card `points` array goes from 5 entries to 4:

```tsx
const creditRateTier = matchCreditRateTier(tierDisplayName);

points={[
  b3Lang('loyalty.benefits.credit.point1'),
  b3Lang(
    creditRateTier
      ? CREDIT_RATE_KEYS[creditRateTier]
      : 'loyalty.benefits.credit.point2Generic',
  ),
  b3Lang('loyalty.benefits.credit.point3'),
  b3Lang('loyalty.benefits.credit.point4'),
]}
```

The `InfoCardProps`/`InfoCard` rendering (bulleted `<li>` list) and the
`BenefitsInfoCardsProps` signature (`{ tierDisplayName: string | null }`) are
unchanged — this is a content-only change inside the existing component shape.

## Edge cases

| Case | Behavior |
|---|---|
| `tierDisplayName` is `"Essential"` / `"Select"` / `"Signature"` (any casing, leading/trailing whitespace) | Matches that tier's rate line |
| `tierDisplayName` is `null` (no tier resolved) | Generic fallback line |
| `tierDisplayName` is a non-empty string that isn't one of the three (future tier, typo'd config) | Generic fallback line — never guesses a rate |
| Free Shipping / Tier Status cards | No change — copy already matches for every tier |

## Non-goals

- Any change to the Free Shipping or Tier Status cards' copy (already correct).
- Any change to the intro/banner `{tier}` interpolation, the benefit boxes, the
  progress card, `NextTiersSection`, or the footer — all outside this card.
- A theme-config channel for the rate figures (still hardcoded i18n strings,
  per the prior spec's accepted trade-off — only *which* hardcoded string is
  selected changes).
- Sharing `matchCreditRateTier` outside this component; if a second consumer
  ever needs tier-rate matching, promote it to `api.ts` then.

## Testing

- Update the existing `index.test.tsx` test `'shows the benefits banner and
  explainer cards with the tier name'` (Essential fixture): new point1 text,
  new Essential rate line, drop assertions on the removed point4/point5 text.
- Update `'styles the benefits explainer card bullet points at 18px in
  #282828'`, which currently queries the old point1 text as its bullet target —
  repoint it at the new point1 text (or another bullet).
- Add cases for Select and Signature tiers asserting their respective rate
  lines, and a null/unmatched-tier case asserting the generic fallback line.
- Free Shipping / Tier Status assertions in the existing test are unchanged
  and stay as regression coverage that those cards didn't move.

## Verification

- `yarn test src/pages/Loyalty/ --run` green.
- `yarn tsc --noEmit` clean.
- `npx eslint src/pages/Loyalty/components/BenefitsInfoCards.tsx src/pages/Loyalty/index.test.tsx --max-warnings 0` clean.
