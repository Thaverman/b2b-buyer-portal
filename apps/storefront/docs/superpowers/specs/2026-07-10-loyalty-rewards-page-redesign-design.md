# Loyalty "Rewards" page visual redesign

**Date:** 2026-07-10
**Status:** Approved (design) — pending spec review
**Area:** `apps/storefront/src/pages/Loyalty/`

## Summary

Restyle the existing Influence.io-backed Loyalty page to match a supplied
mockup, as a **visual-only** change. The tabbed structure, routing, data
fetching, and behavior are preserved; only presentation changes. Three mockup
panels that have no backing data are deferred to future tickets.

## Context

The Loyalty page (`src/pages/Loyalty/`) is a React SPA page injected into a
BigCommerce Stencil storefront. It renders a hero plus five tabs — Your rewards
(overview), Earn points, Rewards (redeem), Tiers, History — each currently built
from plain MUI `Card`s. Data comes from the Influence.io Launcher API via
`src/pages/Loyalty/api.ts`. The mockup shows a more polished treatment: tab
icons, a filled benefits panel, and icon-topped cards.

## Decisions (locked with stakeholder)

1. **Scope:** whole page, mockup-faithful — but *styling only* (see omissions).
2. **Structure:** keep the tabs, `?tab=` routing, and existing tab tests. The
   mockup's stacked appearance is treated as a design comp of the separate tabs,
   not a single-scroll rewrite.
3. **Color:** follow the store theme via MUI tokens (`primary.main`,
   `primary.contrastText`, `background.paper`, `divider`, `text.secondary`). No
   hardcoded hex. The app is script-injected into merchant storefronts and must
   respect each store's brand color, as the current hero already does.
4. **Dataless panels omitted** (deferred): store-credit card, free-shipping
   progress bar, MISSION banner, "(N pending)" points, and the Earn "Learn more"
   links. None have a source in the loyalty API; faithfully rendering them would
   require separate integrations (BC store credit, a shipping-threshold calc, a
   this-month order count) or fake numbers. Out of scope here.

## Data availability (why the omissions)

Mapping every mockup element to `api.ts`:

| Mockup element | Backing data | Treatment |
|---|---|---|
| Welcome / company / member-since / current tier | present | style |
| Points balance | `customer.pointBalance` | style (drop "pending") |
| Tab icons | n/a (decorative) | add icons |
| "YOUR SELECT BENEFITS" list | `currentTier.perks` + `.title` | style as filled panel |
| Earn cards | `fetchEarnRules` | style + per-rule icon |
| Rewards catalog cards | `fetchRedeemRules` | style + per-reward icon |
| Store credit ($ + expiry) | none | **omit** |
| Free-shipping progress ($240/$300) | none | **omit** |
| MISSION banner | none | **omit** |
| "(0 pending)" points | none (would guess an enum) | **omit** |
| Earn "Learn more" links | no description/URL data | **omit** |

## Implementation approach

**Approach A — small page-local primitives + per-tab styling.** Chosen over
pure-inline `sx` (duplicates the card styling across three grids) and MUI theme
overrides (too broad for one page; violates surgical-change principle).

New page-local helpers:
- `src/pages/Loyalty/loyaltyIcons.tsx` — pure functions mapping a rule/tab to a
  named `@mui/icons-material` import, using the same keyword-heuristic style as
  the existing `getSocialCompletionFlag`, always with a fallback icon.
- `src/pages/Loyalty/components/SectionHeader.tsx` — centered, uppercased,
  primary-colored section title used by every tab.

One shared "icon card" style (icon on top, title, detail line, action) reused by
the Earn and Redeem grids, which are structurally identical. Hero and Overview
use inline `sx`.

## Component-level design

### `loyaltyIcons.tsx` (new)
- Tabs: Your rewards→`FavoriteBorder`, Earn→`StarBorder`, Redeem→`CardGiftcard`,
  Tiers→`Layers`, History→`Schedule`.
- Earn rules: purchase→`ShoppingBag`, account→`Person`, instagram→`Instagram`,
  mailing→`MailOutline`, review→`RateReview`, default→`Star`. Match on
  `templateName`/`title`/`socialUrl` keywords.
- Redeem rules: shipping→`LocalShipping`, gift card→`Redeem`,
  discount/percent→`LocalOffer`, default→`CardGiftcard`. Match on `title`/
  `redeemType` keywords.
- All named imports from `@mui/icons-material` (ESLint-enforced). Pure and
  unit-tested.

### `LoyaltyHero.tsx`
Keep the filled `primary.main` panel and its props. "WELCOME BACK" becomes
bold/uppercase; keep the "Member since" chip top-right; restyle the tier chip
into the mockup's dark pill with a small tier icon. Points render in a slim
centered strip just below the hero (`loyalty.hero.points`), dropping "pending".

### `index.tsx`
Add `icon` + `iconPosition="start"` to each `<Tab>` from `loyaltyIcons`. Tab
`value`s, `?tab=` routing, and `variant="scrollable"` untouched — routing and
existing tab tests keep passing.

### `OverviewTab.tsx`
`SectionHeader` ("Your rewards"), then the tier benefits as a filled panel:
`primary.main` background, tier title left (via existing
`loyalty.overview.benefitsTitle`), perks list right. Existing tier-progress card
kept (only real progress data) with light restyle. Omit store-credit / free-
shipping / mission.

### `EarnPointsTab.tsx`
`SectionHeader` ("Earn points"), then icon-topped cards (icon, title, points
line, action). Social rules keep Follow/Completed; informational rules
(purchase/account/mailing/review) show their `summary` and **no button** — same
behavior as today, restyled. "Learn more" links omitted (no data).

### `RewardsTab.tsx` (redeem)
`SectionHeader` ("Rewards"), then icon-topped cards (icon, title,
`{points} points`, existing "Get reward" button with its disable-on-insufficient-
points logic). Earned-rewards list and both dialogs keep behavior, lightly
restyled.

### `TiersTab.tsx` / `HistoryTab.tsx`
Not depicted in the mockup. No structural change — apply `SectionHeader` + the
shared card styling so they read consistently with the redesigned tabs.

## i18n

No new keys required. Section headers reuse existing tab-label keys
(`loyalty.tabs.*`) with `textTransform: 'uppercase'`; all other copy already
exists in `src/lib/lang/locales/en.json`.

## Testing & verification

- `loyaltyIcons` helpers: unit tests, written first (TDD; pure functions).
- Restyle preserves behavior: run `index.test.tsx`, `index.mobile.test.tsx`,
  `index.platform.test.tsx`; fix any fallout from icons altering accessible
  names. Behavior assertions (redeem flow, load-more, error alerts, tab routing)
  must stay green.
- `yarn tsc --noEmit` and `yarn lint` (max-warnings 0) clean.
- Manual verify against the dev server via `/verify` once types + tests pass.

## Files

Touched: `index.tsx`; `components/{LoyaltyHero,OverviewTab,EarnPointsTab,`
`RewardsTab,TiersTab,HistoryTab}.tsx`.
New: `loyaltyIcons.tsx`, `loyaltyIcons.test.ts`, `components/SectionHeader.tsx`.
No changes to `api.ts`, routing, or i18n keys.

## Out of scope (future tickets)

Store-credit card, free-shipping progress bar, MISSION banner, "pending" points,
and Earn "Learn more" links — each deferred pending a real data source.
