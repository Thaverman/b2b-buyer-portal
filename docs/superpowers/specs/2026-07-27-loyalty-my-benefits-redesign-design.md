# Loyalty "My benefits" tab redesign — design

**Date:** 2026-07-27
**Status:** Approved (design)
**Area:** B2B buyer portal · Loyalty (`/loyalty`) — My benefits tab only
**Related:** [2026-07-27-loyalty-smart-rewards-redesign-design.md](2026-07-27-loyalty-smart-rewards-redesign-design.md) (the four-tab restructure this builds on).
Source of truth for visuals/copy: the user-supplied My benefits mock (2026-07-27, second mock).

## Problem

The freshly-shipped `BenefitsTab` is a utilitarian stack (benefit boxes, progress
card, earn rules, tier + membership comparison lists). The new mock turns My
benefits into a guided marketing page: intro copy, icon-styled benefit boxes, a
simplified progress card, an image banner, three static explainer cards, a
"what's ahead" tier ladder, and a closing CTA — and drops the earn-rules,
Tiers, and Memberships sections.

## Decisions (user-selected 2026-07-27)

1. **Copy source = data-driven + i18n.** Tier facts stay in Influence data
   (benefit bullets = tier perks; the "What's available" cards = the Influence
   tiers above the customer's, with the tier's `threshold` string as the quota
   parenthetical). Generic explainer copy (intro, three info cards, footer,
   phone) is hardcoded i18n.
2. **Earn-rules section removed** (mock-literal). Social-follow earning leaves
   the portal; customers can still earn via Influence's own launcher widget.
3. **Membership benefits box kept**, restyled identically to the tier box;
   self-hides when the customer has no membership (the mock's "Lisa" has none).
4. **Progress card restyled, dual-quota logic kept.** Light box, "Progress to
   {tier} Tier" title, "$1,390 of $2,000"-style captions; each quota row
   renders only when that target exists; the server summary sentence is
   dropped from the card. Money keeps app-wide `currencyFormat` (cents shown —
   accepted deviation from the comp).
5. **Tiers and Memberships comparison sections removed** (explicit ask).
6. **Accepted flags:** the info-card copy embeds static figures ("1% rate",
   "$500", "$300", "12 months", the phone number) — editing them requires a
   portal deploy; the mock's small icon on the MY BENEFITS tab is skipped
   (tabs stay text-only); hero and the other three tabs are untouched.

## Removals and the knip cascade

Deleting the three sections orphans code that `yarn lint:knip` will enforce
removing. Full inventory:

| Removed | Because |
|---|---|
| `components/EarnPointsTab.tsx` | only consumer was BenefitsTab |
| `components/TiersTab.tsx`, `components/MembershipsTab.tsx` | only consumer was BenefitsTab (NextTiersSection renders tiers itself) |
| `api.ts`: `fetchEarnRules`, `completeSocialRule`, `getSocialCompletionFlag`, `isEarnRuleForTier`, `EarnRule` | consumers deleted |
| `api.ts`: `fetchMemberships`, `LoyaltyMembership` | consumer deleted (`LoyaltyMembershipSummary` / `customer.currentMembership` STAYS — the membership box uses it) |
| `index.tsx`: `membershipsQuery`, `memberships` prop | section gone |
| `loyaltyIcons.ts`: `earnRuleIcon` (+ its tests) | consumer deleted; `redeemRuleIcon` stays (RewardsTab) |
| `api.test.ts` / `index.test.tsx`: earn-rule + memberships-list + social-follow tests, `buildEarnRuleWith`/`mockEarnRules`/`buildMembershipWith`/`mockMemberships` | features deleted |
| en.json: `loyalty.earn.*` (7 keys), `loyalty.tabs.tiers`, `loyalty.tabs.memberships`, `loyalty.tiers.currentTier`, `loyalty.benefits.howYouEarn`, `loyalty.progress.orders`, `loyalty.progress.spend` | orphaned |

`LoyaltyCustomer`'s social-flag fields (`followInstagram` etc.) remain — they
are payload mappings, not exports, and knip does not flag interface fields.
`LEGACY_TABS` is untouched: `?tab=tiers|memberships|earn` still deep-link to
`benefits`.

## New BenefitsTab layout (top → bottom)

The `!customer` early-return guard stays. `{tier}` in prose uses the page's
`displayTierTitle` (SSW name, Influence fallback — passed down as a new
`tierDisplayName: string | null` prop); when null, the tier-parameterized lines
use generic fallback keys instead ("…your benefits…", "HERE'S HOW YOUR REWARDS
WORK").

### 1. Intro (i18n)

- `loyalty.benefits.introLead`: "You're officially part of the SSW Smart
  Rewards family. We want to make sure every order works harder for you."
- `loyalty.benefits.introGuide`: "Here's a quick guide to your {tier} benefits
  and how to get the most from them." (bold; fallback key
  `loyalty.benefits.introGuideGeneric`: "Here's a quick guide to your benefits
  and how to get the most from them.")
Centered, secondary text for the lead line.

### 2. Benefit boxes (restyled; data unchanged)

Blue (`primary.main`) rounded box: large outlined badge icon
(`WorkspacePremiumOutlined`, ~64px, left column), right column = title
(`loyalty.overview.benefitsTitle` / `loyalty.overview.membershipBenefitsTitle`,
unchanged keys) + perks as a bulleted list (`<ul>`/`<li>` semantics, small
text). Tier box first, membership box below it, identical styling; each
self-hides exactly as today (no `currentTier` / no membership-with-perks).

### 3. Progress card (restyle `TierProgressCard` in place)

- Container: light primary tint (`bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08)`),
  rounded, padded; `targetKind !== 'NextTier'` guard unchanged.
- Title: `loyalty.tiers.progressTo` value changes to "Progress to {tier} Tier"
  (key kept, only this card consumes it).
- Spend row (when `targetAmountRequired > 0`): caption
  `loyalty.progress.spendOf` = "{spent} of {target}" with `currencyFormat`
  values, then the bar (`Math.min(100, spendProgressPct)`).
- Orders row (when `targetOrdersRequired > 0`): caption
  `loyalty.progress.ordersOf` = "{current} of {target} orders", then its bar.
  (A spend-only tier renders exactly the mock.)
- The `summary` line is no longer rendered here (PrePointsGate summary remains
  hero-only, unchanged).

### 4. Mid-page image banner (new, in BenefitsTab)

Full-width blue banner, mirror of the hero pattern:
- Heading (uppercase, bold): `loyalty.benefits.bannerTitle` = "Here's how your
  {tier} rewards work" (fallback `loyalty.benefits.bannerTitleGeneric` =
  "Here's how your rewards work"); sub-line `loyalty.benefits.bannerSubtitle`
  = "Each purchase earns you points."
- Right-side `<img>`: `getBenefitsBannerUrl()` — new optional
  `BC_CONTEXT.loyalty.benefitsBannerUrl` override, else the root-relative
  default `/content/images/loyalty/loyalty-benefits-banner.jpg`; `onError`
  hides the image (text-only blue banner); hidden on `xs`. Same rationale as
  the hero banner (spec §2c of the Smart Rewards redesign): storefront-hosted,
  never bundled, per-environment by construction.
- **Operational note:** upload the provided artwork to
  `/content/images/loyalty/loyalty-benefits-banner.jpg` on sandbox and
  production (WebDAV, ~10s propagation) — no code hand-off needed.

### 5. Three info cards (new component `BenefitsInfoCards`, i18n copy)

Gray (`grey.100`) rounded cards, blue (`primary.main`) h6 heading, outlined
line icon top-right (`SavingsOutlined`, `LocalShippingOutlined`,
`TrendingUpOutlined` — or the closest available named MUI variant), bulleted
body. Copy verbatim from the mock ({tier} parameterized where the tier name
appears):

**Earning and Redeeming Credit** (`loyalty.benefits.credit.*`):
1. "Each purchase earns you points. Every month, your points are automatically
   converted to store credit you can apply to any future purchase."
2. "At the {tier} level, you earn at a 1% rate once you reach $500 in annual
   purchases." *(figures static — accepted)*
3. "Credit is calculated on your order total, after any discounts, excluding
   tax and shipping."
4. "When your points are ready, we'll send you an email letting you know your
   store credit is available to use."
5. "The store certificates are valid for 12 months and can be used alongside
   product discounts."

**Free Shipping** (`loyalty.benefits.shipping.*`):
1. "Orders over $300 ship ground for free, every time."
2. "You'll see your progress toward the $300 threshold in your cart, so you
   always know where you stand before you check out."

**Your Tier Status** (`loyalty.benefits.tierStatus.*`):
1. "We look at your orders over the past 12 months, updated monthly, to
   determine your tier."
2. "If your tier is ever going to change, we'll let you know 30 days in
   advance."

### 6. "What's Available as Your Orders Grow?" (new component `NextTiersSection`)

Props `{ tiers: LoyaltyTier[], currentTierId: string | null }`. Data-driven:
- `nextTiers` = the tiers AFTER the customer's current tier in the
  API-returned order (`fetchTiers` preserves it). If the current tier id is
  not found in the list, `nextTiers` is empty.
- Section (heading + cards + the auto-upgrade footer line) renders only when
  `nextTiers.length > 0` — top-tier customers see none of it.
- Heading `loyalty.benefits.nextTiersTitle` = "What's Available as Your Orders
  Grow?"; sub-line `loyalty.benefits.nextTiersIntro` = "As your orders grow,
  so do your rewards. {count} more level(s) are available:" — rendered from
  two keys (`…IntroOne` "1 more level is available:" wording / `…IntroMany`
  with {count}) to dodge pluralization.
- One blue card per tier, two-up on `md`+ (stacked on mobile): uppercase
  "{title} Tier" heading, `ArrowOutward` icon top-right, bold parenthetical
  "({threshold}) :" from the tier's `threshold` string (omitted when blank),
  body = the tier's perks joined with ", ".
- **The Influence `threshold` field becomes load-bearing buyer-facing copy**
  (e.g. "8+ orders/year or $2,000+ annual spend") — it must be maintained in
  the Influence admin. Previously unused by any UI.

### 7. Footer (i18n)

- `loyalty.benefits.autoUpgrade`: "When you reach the next level, your tier
  upgrades automatically." (rendered with the NextTiersSection, see §6).
- `loyalty.benefits.contact`: "Questions? Contact us at 1-833-397-2619"
  (bold; always rendered).
- Full-width `error.main` contained button `loyalty.benefits.orderCta` =
  "Place your next order" (MUI uppercases), anchor to the storefront home
  (`window.location.origin + '/'`) with `target="_top"` — same pattern as the
  hero CTA. The target is load-bearing: the portal renders inside the
  `ThemeFrame` iframe, so a default-target anchor loads the home page *inside*
  the account panel instead of closing the portal. Always rendered.

## File structure

- `components/BenefitsTab.tsx` — composer: intro, benefit boxes, progress
  card, banner, `BenefitsInfoCards`, `NextTiersSection`, footer.
- `components/BenefitsInfoCards.tsx` (new) — `{ tierDisplayName: string | null }`,
  purely presentational.
- `components/NextTiersSection.tsx` (new) — `{ tiers, currentTierId }`,
  includes the auto-upgrade line.
- `components/TierProgressCard.tsx` — restyled in place.
- `api.ts` — `getBenefitsBannerUrl()` added; orphaned exports removed.
- `index.d.ts` — `benefitsBannerUrl?: string`.
- `index.tsx` — `membershipsQuery` removed; `tierDisplayName={displayTierTitle}`
  passed to BenefitsTab.
- Deleted: `EarnPointsTab.tsx`, `TiersTab.tsx`, `MembershipsTab.tsx`.

## Edge cases

| Case | Behavior |
|---|---|
| `customer` unresolved (loading/error) | BenefitsTab renders nothing (guard kept; existing regression test) |
| No `currentTier` match | Tier box hidden; {tier} prose falls back to generic keys |
| No membership / no membership perks | Membership box hidden (as today) |
| `tierProgress` null / `PrePointsGate` | No progress card (guards unchanged) |
| Orders-quota tier | Orders row renders with "{current} of {target} orders" |
| Banner image 404 / not uploaded | Text-only blue banner (no broken image) |
| `benefitsBannerUrl` set by theme | Overrides the default path |
| Top tier / current tier unknown | NextTiersSection + auto-upgrade line absent |
| Tier `threshold` blank | Parenthetical omitted from that card |
| Tier with no perks | Card renders title + parenthetical only |
| `?tab=tiers`, `?tab=memberships`, `?tab=earn` bookmarks | Still land on My benefits (LEGACY_TABS untouched) |

## Non-goals

- Any change to the hero, Get rewards, My rewards, or FAQ tabs, the allowlist
  gate, masquerade gating, or the tab bar (stays text-only).
- Re-adding social-follow earning elsewhere.
- A theme-config channel for the explainer copy (decision 1).
- Localizing or pluralizing beyond the two intro keys.

## Testing

- Delete tests for removed features (earn rules incl. social follow flows,
  memberships list section, tier-comparison rendering) and their builders/mocks.
- Update: benefits-box tests (same text assertions still pass — bullets keep
  perk strings), progress-card tests to the new captions ("$130.85 of $300.00",
  "39 of 75 orders", "Progress to Signature Tier"), summary-absence.
- New: intro renders with tier name and generic fallback; info cards render
  (spot-check one bullet per card + {tier} interpolation); NextTiersSection —
  higher tiers only (current + lower excluded), threshold parenthetical,
  perks joined, hidden at top tier and when current tier unknown; banner
  image default src + `onError` hide (hero-test pattern); footer CTA link
  present; auto-upgrade line only with next tiers.
- Untouched: hero, gate/masquerade, Get rewards, My rewards, FAQ, deep-link
  tests.

## Verification

- Full Loyalty suite green; `tsc --noEmit`; scoped eslint; knip at the
  `analytics.ts` baseline (all orphans removed); `yarn build` exit 0.
- Live (sandbox, post-deploy): My benefits matches the mock top-to-bottom for
  an Essential-tier account; banner appears once the artwork is uploaded to
  `/content/images/loyalty/loyalty-benefits-banner.jpg`; a Signature (top
  tier) account shows no "What's available" section.
