# Loyalty "Smart Rewards" page redesign — design

**Date:** 2026-07-27
**Status:** Approved (design)
**Area:** B2B buyer portal · Loyalty (`/loyalty`) Rewards page — hero, tab structure, all tabs
**Related:** [2026-07-20-loyalty-ssw-tier-progress-design.md](2026-07-20-loyalty-ssw-tier-progress-design.md),
[2026-07-17-loyalty-memberships-tab-design.md](2026-07-17-loyalty-memberships-tab-design.md),
[2026-07-09-loyalty-shipping-tracker-design.md](2026-07-09-loyalty-shipping-tracker-design.md),
[2026-07-06-loyalty-page-design.md](2026-07-06-loyalty-page-design.md).
Source of truth for visuals: the user-supplied "Smart Rewards" mock (2026-07-27).

## Problem

The Rewards page grew feature-by-feature into six tabs (Your rewards · Earn
points · Rewards · Tiers · Memberships · History) with a plain text hero. The
new "Smart Rewards" design consolidates it into a branded banner + four tabs
(MY BENEFITS · GET REWARDS · MY REWARDS · FAQ), separates "spend points"
(catalog) from "use what you activated" (earned codes), and surfaces the SSW
backend's new **`PrePointsGate`** tier state ("Spend $X more … to start
earning points") which the current code discards (`fetchTierProgress` nulls
every `TargetKind` except `NextTier`).

## Decisions (user-selected 2026-07-27)

1. **Fold, don't drop.** All six current surfaces survive inside the four new
   tabs (mapping in §3). Nothing is deleted except the old hero layout.
2. **FAQ content is theme-provided** via a new host-config global
   (`window.loyaltyFaqConfig`); the FAQ tab auto-hides until the theme ships it.
3. **CTA + gate message are banner-only and PrePointsGate-only.** The
   "Start shopping to earn points" button and the server `Summary` line render
   only while the customer is in `PrePointsGate`; earning customers
   (`NextTier`/`AtTop`) see neither, and NextTier progress renders in
   MY BENEFITS as today.
4. **Accepted assumptions:** nav menu item label stays "Rewards"; banner
   points come from the existing Launcher `pointBalance` (NOT
   `InfluenceCheck`, which is a diagnostics block); the ShippingTracker
   remains below the banner (currently dormant); the FAQ intro defaults to the
   mock copy; the mock's "avaliable" typo is corrected to "available".

## 1. Hero — "Smart Rewards" banner (rework `LoyaltyHero`)

- **Brand row:** `WorkspacePremium` icon (named `@mui/icons-material` import) +
  "Smart Rewards" (`loyalty.hero.brand`).
- **Greeting:** "Welcome back, {name}" (`loyalty.hero.welcomeBack`) where
  `name = company.customer.firstName || companyName` (Redux, read at page top
  and passed down as today).
- **PrePointsGate block** (only when `tierProgress?.targetKind === 'PrePointsGate'`):
  outlined CTA button "Start shopping to earn points" (`loyalty.hero.cta`)
  linking to the storefront home (`window.location.origin + '/'`, plain
  anchor — it leaves the SPA), with the server's `summary` string verbatim
  beneath it.
- **Status line:** tier chip (existing `displayTierTitle` = SSW
  `currentTierName` || Influence title — logic unchanged) + "You have
  {points} points available." (`loyalty.hero.pointsAvailable`,
  `pointBalance.toLocaleString()`).
- **Member-since chip:** kept (existing `memberSince` behavior).
- **Background image:** right-aligned `background-size: cover` photo with a
  blue gradient overlay (`linear-gradient` from the brand blue over the left
  ~60%) so text keeps contrast; **hidden on `xs`** (plain blue banner on
  mobile). The URL is **storefront-hosted, not bundled** — see §2c for the
  resolution order. The banner must render correctly when the image is absent
  or 404s (gradient-only), so implementation is never blocked on the file.
- ShippingTracker renders below the banner exactly as today.

## 2. Data layer (`src/pages/Loyalty/api.ts`, `src/index.d.ts`)

### 2a. `fetchTierProgress` learns `PrePointsGate`

- `LoyaltyTierProgress` gains `targetKind: 'NextTier' | 'PrePointsGate'`.
- `fetchTierProgress` returns a mapped object when
  `TargetKind ∈ {'NextTier','PrePointsGate'}`; still `null` for `AtTop` or
  anything else. All other mapping/error semantics unchanged.
- **Consumers split by kind:** `TierProgressCard` renders only when
  `progress?.targetKind === 'NextTier'` (dual-quota card, unchanged
  otherwise); the hero consumes `summary` only when
  `targetKind === 'PrePointsGate'`. `displayTierTitle` keeps using
  `currentTierName` from either kind.

### 2b. FAQ host-config global

```ts
/** Theme-set FAQ content; absent or empty = FAQ tab hidden. */
loyaltyFaqConfig?: {
  intro?: string;
  items?: { question?: string; answer?: string }[];
};
```

`api.ts` exports `getFaqItems(): { question: string; answer: string }[]`
(defensive: drops items missing either field, `?? []` throughout) and the tab
renders only when it returns ≥ 1 item. Intro falls back to
`loyalty.faq.intro` ("Got questions? Here's what our customers ask most about
SSW Smart Rewards.") when `intro` is blank.

### 2c. Banner image URL — theme override over a relative default

**Decision (2026-07-27): do NOT bundle the banner as a repo asset.**
[vite.config.ts](../../../apps/storefront/vite.config.ts) rewrites bundled
asset URLs to `VITE_ASSETS_ABSOLUTE_PATH` at **build** time, and `.env`
currently pins that to `https://sandbox.storesupply.com/…`. A bundle built
that way and promoted to production would fetch the banner from **sandbox** —
a cross-environment leak baked into the artifact. Bundling would also force a
rebuild + redeploy for every seasonal image swap. (`src/assets/b2bLogo.png` is
legitimately bundled because it is never-changing chrome, not marketing copy.)

Instead, `api.ts` exports `getBannerUrl(): string` resolving in this order:

1. `BC_CONTEXT.loyalty.bannerUrl` (optional theme override) when non-blank;
2. else the root-relative constant
   `/content/images/loyalty/loyalty-account-banner.jpg`;
3. and the component degrades to **gradient-only** if the image fails to load
   (`onError`, so a 404 or a not-yet-uploaded file never shows a broken image).

New optional field in `src/index.d.ts` under `BC_CONTEXT.loyalty` (alongside
`progressSite`; NOT part of `getLoyaltyConfig`'s presence check):

```ts
/** Theme override for the hero banner image; absent = the relative default. */
bannerUrl?: string;
```

**Why the relative default is correct:** the portal is script-injected and runs
in the **top document on the storefront origin** (hash routing on the
storefront URL is the proof — e.g. `sandbox.storesupply.com/login.php#/orders`),
so a root-relative path resolves to sandbox on sandbox and production on
production automatically, with no host string in the code and no config
required. Verified 2026-07-27: both
`https://{www,sandbox}.storesupply.com/content/images/loyalty/loyalty-account-banner.jpg`
return `200 image/jpeg`, 33,557 bytes, byte-identical.

**Why keep the theme override:** it lets the theme repoint the banner per
channel or per campaign without a portal deploy, and lets Stencil emit the URL
through its `{{cdn}}` helper if CDN/cache-busting semantics are wanted later.

**Caching note (informational, not a portal concern):** the hosted banner is
served with `cache-control: max-age=10` behind Cloudflare. Practically that
means overwriting the file over WebDAV goes live in ~10 seconds with no deploy
of any kind — convenient for swaps — but it also means the ~33 KB image is
re-fetched on nearly every page view instead of being cached. If longer
caching is ever wanted, that is a WebDAV/Cloudflare header change on the
hosting side, **not** a buyer-portal change.

## 3. Tabs: six → four (`index.tsx`)

| New value | Label (i18n) | Content |
|---|---|---|
| `benefits` | MY BENEFITS (`loyalty.tabs.benefits`) | §4 |
| `get-rewards` | GET REWARDS (`loyalty.tabs.getRewards`) | redeem catalog only |
| `my-rewards` | MY REWARDS (`loyalty.tabs.myRewards`) | earned codes + points history |
| `faq` | FAQ (`loyalty.tabs.faq`) | §6; tab hidden when no FAQ items |

**Legacy deep-link mapping** in `toLoyaltyTab` (old bookmarks keep working;
MUI `Tabs` never gets an unknown value):
`overview|earn|tiers|memberships → benefits`, `redeem → get-rewards`,
`history → my-rewards`; unknown → `benefits`. `?tab=faq` with no FAQ items
falls back to `benefits` via the existing `activeTab` guard pattern.

Old tab icons are dropped (mock shows text-only tabs); the existing
scrollable/auto-margin centering behavior stays.

## 4. MY BENEFITS (new `components/BenefitsTab.tsx`)

Section order (top → bottom):
1. **Membership status** — the "Your {membership} benefits" box (moved from
   OverviewTab; renders only with a `currentMembership` with perks).
2. **Tier benefits** — the "Your {tier} benefits" box (moved from OverviewTab).
3. **Tier progress** — `TierProgressCard` (NextTier only, per §2a).
4. **How you earn points** — the earn-rules cards (existing `EarnPointsTab`
   rendered as a section with heading `loyalty.benefits.howYouEarn` = "How you
   earn points"; social follow buttons/mutations unchanged).
5. **Tiers** — the tier comparison cards (existing `TiersTab` list, which no
   longer carries the progress card — it moves to §4.3).
6. **Memberships** — the membership comparison cards (existing
   `MembershipsTab` list; section hidden when the store has none — the
   auto-hide moves from tab-level to section-level).

`OverviewTab.tsx` is dissolved into this component (its two boxes move here);
`EarnPointsTab`/`TiersTab`/`MembershipsTab` are reused as child sections
(heading adjustments only — data flow, queries, and mutations unchanged).

## 5. GET REWARDS / MY REWARDS split

- **GET REWARDS** = `RewardsTab` minus its "Your earned rewards" block. The
  redeem catalog, confirm dialog, coupon-code reveal dialog, balance-gated
  disable logic — all unchanged.
- **MY REWARDS** = new `components/MyRewardsTab.tsx`:
  1. "Your earned rewards" — the earned-coupons list moved verbatim from
     RewardsTab (infinite pagination + copy-code flow intact). This is where
     codes activated in GET REWARDS are used.
  2. Points history — the existing `HistoryTab` content below it (pagination
     intact). `HistoryTab.tsx` is absorbed; its file goes away.
- After redeeming in GET REWARDS, the existing query invalidation keeps
  MY REWARDS fresh (`loyaltyRewards` infinite query is already re-keyed on
  redeem).

## 6. FAQ tab (new `components/FaqTab.tsx`)

Intro line (theme `intro` or the i18n default) + one MUI `Accordion` per FAQ
item (`question` as summary, `answer` as body text). Purely presentational; no
queries. Tab + panel render only when `getFaqItems().length > 0`.

## Edge cases

| Case | Behavior |
|---|---|
| `PrePointsGate` customer | Banner: CTA + summary; MY BENEFITS: no progress card |
| `NextTier` customer | Banner: no CTA/summary; MY BENEFITS: dual-quota card |
| `AtTop` / progress endpoint fails / `progressSite` absent | `tierProgress` null — no CTA, no summary, no card; page intact (fail-quiet unchanged) |
| `firstName` blank | Greeting falls back to company name |
| Banner image 404s / not yet uploaded | `onError` ⇒ gradient-only banner (never a broken image) |
| `BC_CONTEXT.loyalty.bannerUrl` set | That URL wins over the relative default |
| `bannerUrl` absent or blank | Relative `/content/images/loyalty/loyalty-account-banner.jpg` (resolves per environment) |
| `loyaltyFaqConfig` absent/empty/all-invalid items | FAQ tab hidden; `?tab=faq` → benefits |
| Old bookmark `?tab=redeem` etc. | Mapped to the new tab, no MUI warning |
| Store with no memberships | Memberships section hidden inside MY BENEFITS (tab no longer hides) |
| Masquerade / non-Stencil / tier-allowlist deny | Unchanged gates — whole page unavailable before any of this renders |

## Non-goals

- Renaming the "Rewards" nav menu item or route path.
- Consuming `InfluenceCheck`, `RecentTransactions`, `Ledger`, `PendingPoints`.
- Membership enroll/join (still blocked on the SSW Platform-API proxy).
- A spend progress bar for the PrePointsGate state (summary line only).
- Localizing the server `Summary` string.
- Any change to the tier-allowlist gate (stays Influence-keyed) or masquerade
  gating.

## Testing

- **api.test.ts:** `fetchTierProgress` returns mapped object with
  `targetKind: 'PrePointsGate'` for the new payload (use the user's example);
  still null for `AtTop`; `getFaqItems` table (absent global, empty items,
  partial items dropped, valid items pass).
- **index.test.tsx:** restructured to the new tab names — intent preserved,
  labels/locations updated (this restructuring is spec-mandated; the
  tab-name change IS the feature). New tests: PrePointsGate banner shows CTA +
  summary; NextTier shows neither but shows the dual-quota card in MY
  BENEFITS; greeting uses firstName and falls back to companyName; FAQ tab
  hidden without config, shown with items, accordion renders Q/A; legacy
  `?tab=` values land on the right new tab; earned rewards + history render
  under MY REWARDS; redeem flow still works from GET REWARDS.
- Allowlist-gate and masquerade tests unchanged in intent (selectors updated
  only where tab names appear).

## Verification

- Full Loyalty suite green; `tsc --noEmit`; scoped eslint; knip clean
  (dissolved components removed, new exports consumed).
- Live (sandbox): banner renders with image + greeting; the 264074-style
  PrePointsGate account shows CTA + "Spend $2,902.15 more…" line; four tabs
  present (FAQ only once the theme ships `loyaltyFaqConfig`); earned codes
  usable under MY REWARDS.

## Assets

The banner is **storefront-hosted, never bundled** — full rationale and
resolution order in §2c. It already exists at
`/content/images/loyalty/loyalty-account-banner.jpg` on both environments
(verified 200 / 33 KB / identical on `www.` and `sandbox.`), so no asset needs
to be checked into this repo and nothing about this feature is blocked on a
file hand-off. Swapping the image is a WebDAV overwrite (live in ~10s, per the
`max-age=10` note in §2c); repointing it elsewhere is a theme
`BC_CONTEXT.loyalty.bannerUrl` change. Neither requires a portal deploy.
