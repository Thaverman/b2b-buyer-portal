# Loyalty My-benefits ladder — source memberships from SSW, not Influence tiers — design

**Date:** 2026-08-03
**Status:** Approved (design)
**Area:** B2B buyer portal · Loyalty (`/loyalty`) — My benefits tab, tier-progress data layer, ladder section
**Related:** [2026-07-28-loyalty-top-tier-ladder-design.md](2026-07-28-loyalty-top-tier-ladder-design.md) (introduced the SSW-name-anchored ladder this spec replaces), [2026-07-20-loyalty-ssw-tier-progress-design.md](2026-07-20-loyalty-ssw-tier-progress-design.md), [2026-07-17-loyalty-memberships-tab-design.md](2026-07-17-loyalty-memberships-tab-design.md) (the memberships catalog this spec restores).

## Problem

The "What's Available as Your Orders Grow?" ladder (`NextTiersSection`) currently
shows Influence.io's points-based **tiers** (`fetchTiers`, `/shop/tiers`), anchored
by matching SSW's `tierProgress.currentTierName` (or, as a fallback, Influence's
own tier id) against the Influence tier list.

Per the user (2026-08-03): **Influence does not place customers into the right
membership — SSW's own "online services" API does that.** The ladder must
source its catalog from Influence's **memberships** concept instead (a separate
Influence.io feature from tiers — see the 2026-07-17 memberships-tab spec,
whose `fetchMemberships`/`LoyaltyMembership` were removed on 2026-07-27 as an
explicit "drop this section" ask, now being restored for a different purpose),
and anchor "which membership is the customer on" using SSW data — not
Influence's `customer.currentMembership`.

A live payload from SSW's `GetDetailWithProgress` (customer 54877, verified
2026-08-03) confirms `TierProgress.CurrentTierName` — despite the "Tier" name —
**is** the customer's current membership, and `LocalTierAssociation`'s
`PriorTierName: "Essential"` → `CurrentTierName: "Select"` plus
`TierProgress.TargetTierName: "Signature"` establishes the order:
**Essential → Select → Signature**.

That same investigation surfaced a live, currently-blocking bug: `fetchTierProgress`
reads `site` from `BC_CONTEXT.loyalty.progressSite`, which is `null` on the
deployed theme — `isTierProgressAvailable()` gates the whole tier-progress query
off as a result, so **none** of `TierProgress`/`AtTop`/hero CTA/progress card is
ever fetched in production today. The theme actually provides this value as
`window.loyalty_site_name`. `bigCommerceStoreId` (`window.B3.setting.store_hash`)
is confirmed already correct — no change there.

## Decisions (user-selected 2026-08-03)

1. **Fix `fetchTierProgress`'s `site` param first, as its own concern.** Switch
   from `BC_CONTEXT.loyalty.progressSite` to `window.loyalty_site_name`. This
   unblocks tier-progress in production generally (progress card, hero CTA,
   tier chip), not just the ladder — the ladder's anchor depends on it, but the
   fix belongs to `fetchTierProgress` itself.
2. **Membership catalog = restored `fetchMemberships()`** (Influence
   `/shop/memberships`), exactly as it existed before the 2026-07-27 removal.
   Influence still owns the membership *definitions* (title, description,
   perks) — only *placement* (which one a customer is in) moves to SSW.
3. **Anchor = `tierProgress.currentTierName` only.** No Influence-id fallback
   (unlike the tier ladder's `currentTierId` fallback) — there is no SSW/Influence
   id-space reconciliation problem to fall back from, since Influence is no
   longer consulted for placement at all. Unmatched or absent → hide the ladder
   entirely (confirmed 2026-08-03; matches today's "unknown anchor" behavior).
4. **Order is hardcoded client-side**, `['essential', 'select', 'signature']` —
   Influence's `/shop/memberships` list has no rank field (unlike `/shop/tiers`,
   which comes back pre-ordered). A membership title that doesn't match one of
   these three (case-insensitive, trimmed) is dropped from the ladder rather than
   guessing its position — same principle as `matchCreditRateTier`.
5. **`atTop` keeps its existing meaning and copy**, sourced from
   `tierProgress.targetKind === 'AtTop'` exactly as today — this is an SSW signal
   already available on the same object being used for the anchor, not something
   this spec recomputes from list position.
6. **No copy changes.** Confirmed 2026-08-03: "Keep the wording that is still how
   the memberships are functioning for us." Every `en.json` string
   (`nextTiersTitle`, `nextTiersIntroOne/Many`, `nextTierName` ["{title} **Tier**"],
   `autoUpgrade` ["...your **tier** upgrades automatically"], `atTopTier`,
   `atTopTierGeneric`) keeps its exact current value and key name — only the
   component's internal name and data source change, not user-facing text.

## Part A — `fetchTierProgress` site param (`api.ts`, `index.d.ts`)

- `src/index.d.ts`: add a new top-level `Window` property
  `loyalty_site_name?: string;` (alongside `loyaltyRolloutConfig`/`loyaltyFaqConfig`).
  Remove `progressSite?: string;` from `BC_CONTEXT.loyalty` (now unused).
- `api.ts`:
  - Remove `progressSite?: string;` from the `LoyaltyConfig` interface.
  - `isTierProgressAvailable`: `isLoyaltyAvailable() && Boolean(window.loyalty_site_name)`
    (was `Boolean(getLoyaltyConfig()?.progressSite)`).
  - `fetchTierProgress`: replace the `config.progressSite` guard/read with
    `window.loyalty_site_name`; `bigCommerceStoreId: window.B3.setting.store_hash`
    is unchanged. Same thrown-error message and shape on absence.
- No change to `RawTierProgress`, the response mapping, or any other field —
  this is purely a request-param source swap.

## Part B — restore the membership catalog (`api.ts`)

Restore verbatim (from the 2026-07-27 deletion, commit `d02aa49b`, originally
added in `a32081cf`):

```ts
export interface LoyaltyMembership {
  id: string;
  title: string;
  description: string;
  perks: string[];
}

interface RawMembership {
  id?: string | number;
  title?: string;
  description?: string;
  perks?: string[];
}

export const fetchMemberships = async (): Promise<LoyaltyMembership[]> => {
  const config = requireConfig();
  const raw = (await launcherGet('/shop/memberships', { shop: config.shopKey }, 'upstream')) as {
    memberships?: RawMembership[];
  };

  return (raw.memberships ?? []).map((membership) => ({
    id: String(membership.id ?? ''),
    title: membership.title ?? '',
    description: membership.description ?? '',
    perks: membership.perks ?? [],
  }));
};
```

`index.tsx` gains a `membershipsQuery` mirroring the existing `tiersQuery`
exactly (`queryKey: ['loyaltyMemberships']`, `enabled: isAvailable`,
`staleTime: Infinity`), and `const memberships = membershipsQuery.data ?? [];`.

`fetchTiers`/`LoyaltyTier`/`tiers` are **not removed** — `BenefitsTab`'s tier
perk box (`currentTier = tiers.find(...)`) and the tier-allowlist gate in
`index.tsx` still consume them, unchanged and untouched by this spec.

## Part C — the ladder itself

Rename `components/NextTiersSection.tsx` → `components/NextMembershipsSection.tsx`
(the component's whole reason for being changes; keeping the old name on
membership-sourced props would mislead the next reader). New props:

```ts
interface NextMembershipsSectionProps {
  memberships: LoyaltyMembership[];
  currentTierName: string | null; // tierProgress.currentTierName — SSW's name for it, kept as-is
  atTop: boolean;                 // tierProgress.targetKind === 'AtTop'
}
```

(`currentTierId`/`tiers` are gone — there is no id-based fallback anymore.)

Behavior:

```ts
const MEMBERSHIP_LADDER_ORDER = ['essential', 'select', 'signature'];
```

1. `atTop` → same top-tier line as today (`atTopTier`/`atTopTierGeneric`), same
   guard shape, unchanged.
2. Otherwise: normalize `currentTierName` (trim + lowercase), find its index in
   `MEMBERSHIP_LADDER_ORDER`. Not found (null, blank, or no match) → render
   `null` (hide the whole section, no ladder and no auto-upgrade line — same
   as today's "unknown anchor" case).
3. `nextNames = MEMBERSHIP_LADDER_ORDER.slice(anchorIndex + 1)`; map each to the
   matching entry in `memberships` (case-insensitive title match) and drop any
   name with no matching fetched membership (e.g. Influence not yet configured
   with all three). Empty result → render `null` (same guard as today).
4. Render exactly today's JSX shape (heading, one/many intro line, one card per
   membership, auto-upgrade footer) — `membership.perks.join(', ')` unchanged;
   the quota parenthetical (today `(${tier.threshold}) :`) becomes
   `(${membership.description}) :`, guarded the same way on non-blank.

`en.json` keys/strings are untouched (decision 6) — `nextTierName` still renders
`"{title} Tier"` for a membership title, `autoUpgrade` still says "tier", by
explicit instruction.

## Wiring

- `BenefitsTab.tsx`: new prop `memberships: LoyaltyMembership[]`. Replace the
  `NextTiersSection` import/usage:
  ```tsx
  <NextMembershipsSection
    memberships={memberships}
    currentTierName={tierProgress?.currentTierName || null}
    atTop={tierProgress?.targetKind === 'AtTop'}
  />
  ```
  (`currentTierName`/`atTop` expressions are unchanged from today's
  `NextTiersSection` call — only `memberships` is new and `tiers`/`currentTierId`
  are dropped from *this* call specifically; `tiers` stays a `BenefitsTab` prop
  for the perk box above.)
- `index.tsx`: add `membershipsQuery`/`memberships` (Part B) and pass
  `memberships` down to `BenefitsTab`. No other prop changes.

## Edge cases

| Case | Behavior |
|---|---|
| `window.loyalty_site_name` absent | `isTierProgressAvailable()` false; `tierProgressQuery` disabled; ladder hidden (no anchor) — same shape as today's "SSW unavailable" case, just a different absent global |
| `tierProgress` null (endpoint error, unknown `targetKind`) | `atTop` false, `currentTierName` null → ladder hidden |
| `currentTierName` matches none of the 3 known names (typo, future 4th membership) | Ladder hidden — never guesses a position |
| Influence `/shop/memberships` missing one of the 3 names | That name is dropped from `nextNames`; ladder still renders with whatever matched |
| `atTop` true | Top-tier message, exactly as today, regardless of the memberships list |
| Membership `description` blank | Parenthetical omitted (same guard as today's `threshold`) |

## Non-goals

- Any change to `customer.currentMembership` / `LoyaltyMembershipSummary` or the
  membership **perk box** in `BenefitsTab.tsx` (still Influence-sourced, still
  unrelated to this ladder's anchor) — that field answers "what does Influence
  think this customer's membership is," which this spec explicitly stops
  trusting for the ladder, but which the perk box's own scope is untouched.
- Any change to the tier-allowlist gate, `fetchTiers`, the tier perk box, or any
  other Loyalty tab.
- Rewriting `en.json` copy (decision 6).
- Reconciling why Influence's own membership placement (`currentMembershipId`)
  might disagree with SSW's — SSW wins for this ladder, full stop.
- `window.influenceio_shop` — not needed; `bigCommerceStoreId` stays
  `window.B3.setting.store_hash`, confirmed correct.

## Testing

- **`api.test.ts`**: `isTierProgressAvailable`/`fetchTierProgress` tests move
  from setting `BC_CONTEXT.loyalty.progressSite` to setting
  `window.loyalty_site_name` directly (plus `afterEach` cleanup); add back the
  `fetchMemberships` describe block deleted in `d02aa49b` (three tests: shop-key-only
  fetch + normalization, empty-payload → `[]`, 404 → upstream `LoyaltyError`).
- **`index.test.tsx`**: `mockTierProgress`'s `progressSite` config line and the
  two direct `window.BC_CONTEXT` assignments at what are today lines 957/970
  move to `window.loyalty_site_name` (plus `afterEach` cleanup); add
  `buildMembershipWith`/`mockMemberships` helpers (mirroring
  `buildTierWith`/`mockTiers`, hitting `/shop/memberships`); replace all 10
  ladder tests (today's "shows the tiers above the customer…" through "falls
  back to the Influence tier id…") with membership-sourced equivalents —
  the two Influence-id-fallback tests are dropped outright (no fallback exists
  anymore); the rest keep their intent (shows-above/not-below, hides-at-top,
  CTA target, hides-on-unknown-anchor, `AtTop` message + generic variant,
  case-insensitive name match) against `memberships`/`currentTierName`.

## Verification

- Full Loyalty suite green; `tsc --noEmit`; scoped eslint; `yarn lint:knip` at
  the `analytics.ts` baseline (no orphans — `fetchMemberships`/`LoyaltyMembership`
  consumed by the new component + `index.tsx`; `fetchTiers`/`LoyaltyTier` still
  consumed by the perk box + allowlist gate).
- Live (sandbox, post-deploy): `window.loyalty_site_name` resolves and the
  progress card/hero CTA start working (previously dormant); a mid-membership
  account sees the ladder anchored correctly; a Signature account sees the
  top-tier message, not an empty or wrong ladder.
