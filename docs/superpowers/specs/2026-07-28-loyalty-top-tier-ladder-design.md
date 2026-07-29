# Loyalty My benefits — top-tier ladder fix — design

**Date:** 2026-07-28
**Status:** Approved (design)
**Area:** B2B buyer portal · Loyalty (`/loyalty`) — My benefits tab, tier-progress data layer
**Related:** [2026-07-27-loyalty-my-benefits-redesign-design.md](2026-07-27-loyalty-my-benefits-redesign-design.md) (introduced `NextTiersSection`),
[2026-07-27-loyalty-smart-rewards-redesign-design.md](2026-07-27-loyalty-smart-rewards-redesign-design.md) (§2a, which deliberately discarded `AtTop`),
[2026-07-20-loyalty-ssw-tier-progress-design.md](2026-07-20-loyalty-ssw-tier-progress-design.md).

## Problem

A customer already at the top tier sees the "What's Available as Your Orders
Grow?" ladder advertising the tier they are *already on* — a `SIGNATURE TIER`
card sitting directly beneath the `Your SIGNATURE benefits` box.

**Root cause — two independent failures stacked:**

1. `fetchTierProgress` returns `null` for `TargetKind: 'AtTop'`
   ([api.ts:320-325](../../../apps/storefront/src/pages/Loyalty/api.ts)), a
   deliberate choice in the Smart Rewards spec (§2a) made when nothing consumed
   it. The tab therefore has **no way to know the customer is topped out**.
2. With no SSW signal, `NextTiersSection` computes "what's above me" purely from
   Influence: `tiers.findIndex(t => t.id === customer.currentLoyaltyTierId)`,
   then `slice(currentIndex + 1)`. **SSW and Influence maintain separate tier ID
   spaces**, so this match is unreliable.

Verified live 2026-07-28 against
`test-onlineservices.storesupply.com/.../GetDetailWithProgress` for
`bigCommerceCustomerId=80591`:

| Source | Tier id | Tier name |
|---|---|---|
| SSW `TierProgress.CurrentTierId` | `e45340b8-64c8-4780-a9e1-05e42c1fc279` | `Signature` |
| SSW `LocalTierAssociation.CurrentTierId` | `e45340b8-…` (same) | `Signature` |
| Influence `InfluenceCheck.CurrentLoyaltyTierId` | `29777d36-e455-44aa-a711-62f7c0ddad85` | `SIGNATURE` |

The same payload reports `TargetKind: "AtTop"`, `TargetTierName: null`, all
quota fields `0`, and
`Summary: "At top tier 'Signature' — earning at 300.00 %."`

Note the two systems also disagree on **casing** (`Signature` vs `SIGNATURE`) —
which is why the name match below is case-insensitive.

## Decisions (user-selected 2026-07-28)

1. **Portal-authored top-tier copy, not the server `Summary`.** The server
   string ships `"300.00 %"` and a quoted tier name; buyer-facing wording stays
   in `en.json`. `summary` is still mapped (consistent with the other kinds) but
   goes unrendered for `AtTop`.
2. **Anchor the ladder on the SSW tier name, not the Influence id.** Fixes the
   ID-space mismatch for every customer, not just the top-tier symptom. Today's
   id match survives as the fallback when SSW progress is unavailable.
3. **Scope correction:** an earlier framing of this task ("remove the banner and
   Influence tier data from My benefits") was withdrawn by the user. The
   mid-page banner, both perk boxes, the info cards and the progress card are
   **untouched**.

## 1. Data layer (`api.ts`)

- `LoyaltyTierProgress.targetKind` becomes
  `'NextTier' | 'PrePointsGate' | 'AtTop'`.
- `fetchTierProgress` accepts `AtTop` alongside the existing two kinds; the
  mapping expression is unchanged (`TargetTierName: null` already lands as `''`
  via `?? ''`, and the zeroed quotas map to `0`). Unknown/absent kinds, `Success:
  false`, and missing `TierProgress` still return `null`. Error semantics
  (`rateLimited` / `upstream`) unchanged.

### Consumer audit

Flipping `tierProgress` from `null` to an object for top-tier customers touches
every reader:

| Reader | Effect |
|---|---|
| `TierProgressCard` | None — already returns null unless `targetKind === 'NextTier'` |
| Hero CTA + server summary | None — already gated on `targetKind === 'PrePointsGate'` |
| Tier-allowlist gate (`isTierAllowed`) | None — keyed to `tierTitle` (Influence), not `displayTierTitle`, by design |
| `resolveLoyaltyLanding` (`loyaltyLanding.ts`) | **Changes** — it treated any non-null progress as "active tier journey"; now guarded to an explicit `NextTier`/`PrePointsGate` allowlist so at-top customers still do not land on Rewards after login (behavior unchanged from today; its existing tests already specified this) |
| `displayTierTitle` (`index.tsx:121`) | **Changes** — see below |
| `NextTiersSection` | The fix (§2) |

**Accepted side effect:** `displayTierTitle = tierProgress?.currentTierName ||
tierTitle` now resolves to SSW `"Signature"` for at-top customers instead of
falling through to Influence `"SIGNATURE"`. The hero tier chip, the intro line,
the banner heading and the info cards therefore switch from all-caps to title
case for those customers — consistent with how `NextTier` customers already
render. The tier **perk box** keeps Influence's `currentTier.title`, so
`Your SIGNATURE benefits` remains all-caps; casing stays mixed on that one line.
Pre-existing for `NextTier` customers; not addressed here.

**Audit correction (2026-07-28):** this table originally omitted
`resolveLoyaltyLanding`, and the omission was caught only when mapping `AtTop`
broke two of its pre-existing tests. Anyone widening `targetKind` again should
treat "consumers that infer meaning from a non-null result" as part of the
audit, not just consumers that read `targetKind` directly.

## 2. Ladder (`components/NextTiersSection.tsx`)

Props become:

```ts
interface NextTiersSectionProps {
  tiers: LoyaltyTier[];
  currentTierId: string | null;    // Influence id — fallback anchor
  currentTierName: string | null;  // SSW CurrentTierName — preferred anchor
  atTop: boolean;                  // SSW TargetKind === 'AtTop'
}
```

Behavior:

1. **`atTop` → render the top-tier line instead of the ladder** (§3). No
   heading, no cards, and no `loyalty.benefits.autoUpgrade` line — there is no
   next level to upgrade to.
2. Otherwise resolve the anchor index:
   - by name first: case-insensitive, whitespace-trimmed match of
     `currentTierName` against each `tier.title`;
   - falling back to the existing `tier.id === currentTierId` match when
     `currentTierName` is null/blank or matches nothing.
3. `nextTiers = tiers.slice(anchorIndex + 1)`; unchanged from today, including
   `anchorIndex === -1 → []` and the `nextTiers.length === 0 → null` guard.

The component keeps ownership of this whole slot (ladder *or* top-tier line),
as it already owns the auto-upgrade footer line. `BenefitsTab` stays a composer.

## 3. Copy (`en.json`, 2 new keys)

- `loyalty.benefits.atTopTier`: "You're at {tier}, our top tier — you're already
  earning at the highest rate we offer."
- `loyalty.benefits.atTopTierGeneric`: "You're at our top tier — you're already
  earning at the highest rate we offer."

Parameterized/generic pair follows the existing
`introGuide`/`introGuideGeneric` precedent; the generic form covers a blank
`currentTierName`. Rendered centered, matching the ladder's intro line.

## 4. Wiring (`components/BenefitsTab.tsx`)

`BenefitsTab` already receives `tierProgress`, so it derives both new props
locally:

```ts
const atTop = tierProgress?.targetKind === 'AtTop';
const sswTierName = tierProgress?.currentTierName || null;
```

**`index.tsx` is untouched.**

## Edge cases

| Case | Behavior |
|---|---|
| SSW `AtTop` | No ladder, no auto-upgrade line; top-tier line renders with the SSW tier name |
| SSW `AtTop`, blank `CurrentTierName` | Generic top-tier line |
| `NextTier`, SSW name matches an Influence title | Ladder anchored by name (the fix) |
| `NextTier`, SSW name matches nothing | Falls back to Influence id match (today's behavior) |
| `tierProgress` null (endpoint down, `progressSite` absent, unknown kind) | `atTop` false, name null → id match; today's behavior exactly |
| `PrePointsGate` | Not at top; name anchor applies; ladder renders as today |
| Influence tier is last in the list but SSW did not say `AtTop` | No ladder **and no top-tier line** — only SSW's `AtTop` earns the message (unchanged from today) |
| Influence tiers list empty / current tier absent | No ladder (unchanged) |

## Non-goals

- Rendering the server `Summary` for `AtTop` anywhere (decision 1).
- Reconciling the SSW/Influence tier **id** spaces, or fixing the perk box's
  Influence-sourced casing.
- Any change to the banner, perk boxes, info cards, progress card, hero,
  allowlist gate, or the other three tabs.
- Localizing or reformatting the server `Summary` string.

## Testing

**`api.test.ts`**
- The existing `returns null for %s` table row
  `['top tier (TargetKind not NextTier)', { … TargetKind: 'AtTop' }]`
  **asserts the old behavior and must be repointed** at a genuinely unknown kind
  (e.g. `'Unrecognized'`); the other three rows stay.
- New: `AtTop` maps to an object — use the verified live payload above
  (`currentTierName: 'Signature'`, `targetTierName: ''`, zeroed quotas,
  `summary` retained).

**`index.test.tsx`**
- At-top customer: no ladder, no auto-upgrade line, top-tier line present.
- At-top customer: still no progress card and no hero CTA (guards hold with a
  non-null `tierProgress`).
- **Bug repro:** Influence tier id that does not match the customer's tier entry
  + SSW `CurrentTierName` that does match by name → ladder anchors by name and
  excludes the current tier.
- Case-insensitivity: SSW `"Signature"` against Influence `"SIGNATURE"`.
- Fallback: `tierProgress` null → id match still drives the ladder.
- Existing top-tier/ladder tests updated where they assumed `AtTop → null`.

## Verification

- Full Loyalty suite green; `tsc --noEmit`; scoped eslint; `yarn lint:knip` at
  the `analytics.ts` baseline; `yarn build` exit 0.
- Live (sandbox, post-deploy): account 80591 (Signature/AtTop) sees the
  top-tier line and **no** ladder; a mid-tier account still sees its ladder with
  the current tier excluded; an account with the progress endpoint unavailable
  renders exactly as today.
