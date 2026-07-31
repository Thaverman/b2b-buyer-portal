# Loyalty "My benefits" Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the My benefits tab per the second mock — remove the earn-rules/Tiers/Memberships sections, restyle the benefit boxes and progress card, and add the intro, image banner, explainer cards, next-tier ladder, and footer CTA.

**Architecture:** Task 1 is the destructive sweep (three sections leave `BenefitsTab`, orphaning components/api/tests/i18n that knip forces out). Tasks 2–4 are additive: restyled boxes + progress card + intro, then the storefront-hosted banner + static info cards, then the data-driven `NextTiersSection` + footer. Tier facts stay in Influence data (perks, and the `threshold` string becomes the quota parenthetical); explainer copy is i18n.

**Tech Stack:** React 18, `@tanstack/react-query`, MUI, MSW + Vitest + Testing Library, builders. All commands run from `apps/storefront/`.

## Global Constraints

- Run every command from `apps/storefront/`.
- Spec: `docs/superpowers/specs/2026-07-27-loyalty-my-benefits-redesign-design.md`.
- The allowlist gate, masquerade gating, hero, Get rewards, My rewards, FAQ tabs, and `LEGACY_TABS` are untouched.
- `BenefitsTab`'s `if (!customer) return null;` guard stays (regression-tested).
- `TierProgressCard`'s `targetKind !== 'NextTier'` guard stays.
- MUI icons: named imports from `@mui/icons-material`. Money via `currencyFormat` (cents shown — accepted deviation).
- Tests: builders; utils from `tests/test-utils`; no `getByRole('progressbar')`.
- `{tier}` in prose = the page's `displayTierTitle` (passed as `tierDisplayName`); null falls back to the `…Generic` i18n keys.
- After Task 1 and after Task 4, `yarn lint:knip` must show only the pre-existing `src/utils/analytics.ts` baseline.
- Commit format `type: B2B-0000 Subject` + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## File Structure

- **Task 1 deletes:** `components/EarnPointsTab.tsx`, `components/TiersTab.tsx`, `components/MembershipsTab.tsx`; earn/memberships-list code in `api.ts`, `loyaltyIcons.ts`, tests, i18n.
- **Task 2 modifies:** `components/BenefitsTab.tsx` (intro + restyled boxes), `components/TierProgressCard.tsx` (restyle), i18n, tests.
- **Task 3 creates:** `components/BenefitsInfoCards.tsx`; modifies `api.ts` (`getBenefitsBannerUrl`), `index.d.ts`, `BenefitsTab.tsx` (banner), i18n, tests.
- **Task 4 creates:** `components/NextTiersSection.tsx`; modifies `BenefitsTab.tsx` (footer), i18n, tests.

---

## Task 1: Remove the earn-rules, Tiers and Memberships sections (+ knip cascade)

**Files:**
- Modify: `src/pages/Loyalty/components/BenefitsTab.tsx`, `src/pages/Loyalty/index.tsx`, `src/pages/Loyalty/api.ts`, `src/pages/Loyalty/loyaltyIcons.ts`, `src/lib/lang/locales/en.json`
- Delete: `src/pages/Loyalty/components/EarnPointsTab.tsx`, `src/pages/Loyalty/components/TiersTab.tsx`, `src/pages/Loyalty/components/MembershipsTab.tsx`
- Test: `src/pages/Loyalty/index.test.tsx`, `src/pages/Loyalty/api.test.ts`, `src/pages/Loyalty/loyaltyIcons.test.ts`

**Interfaces:**
- Consumes: current `BenefitsTab` (renders `EarnPointsTab`/`TiersTab`/`MembershipsTab` at lines 89–91).
- Produces (Tasks 2–4 build on this): `BenefitsTab` props shrink to
  `{ customer: LoyaltyCustomer | undefined; tiers: LoyaltyTier[]; tierProgress: LoyaltyTierProgress | null }`
  (`tiers` is retained for the current-tier lookup and Task 4's ladder).
  `launcherPost`, `redeemRuleIcon`, `LoyaltyMembershipSummary`, and
  `LoyaltyCustomer`'s social-flag fields all REMAIN.

- [ ] **Step 1: Trim `BenefitsTab`**

Remove the three renders (lines 89–91), the `EarnPointsTab`/`TiersTab`/`MembershipsTab` imports, the `LoyaltyIdentity`/`LoyaltyMembership` type imports, and the `memberships`/`identity`/`customerQueryKey` props. Resulting signature:

```tsx
interface BenefitsTabProps {
  customer: LoyaltyCustomer | undefined;
  tiers: LoyaltyTier[];
  tierProgress: LoyaltyTierProgress | null;
}

function BenefitsTab({ customer, tiers, tierProgress }: BenefitsTabProps) {
```

Everything else in the component (guard, two boxes, `TierProgressCard`) stays for now.

- [ ] **Step 2: Trim `index.tsx`**

Delete the `membershipsQuery` block and the `const memberships = …` line (lines 100–106), remove `fetchMemberships` from the `./api` import, and shrink the `BenefitsTab` call to:

```tsx
        {activeTab === 'benefits' && (
          <BenefitsTab customer={customer} tiers={tiers} tierProgress={tierProgress} />
        )}
```

(`identity` and `customerQueryKey` are still used by `RewardsTab`/`MyRewardsTab` — leave those.)

- [ ] **Step 3: Delete the orphaned api.ts code**

Delete these blocks (current line areas): `LoyaltyMembership` + `RawMembership` + `fetchMemberships` (256–282); `EarnRule` + `RawEarnRule` + `fetchEarnRules` (368–424); `SocialFlag` type + `SOCIAL_MATCHERS` + `getSocialCompletionFlag` (~410–431 region); `isEarnRuleForTier` (433–441); `SocialResult` + `completeSocialRule` (443–487). KEEP `launcherPost` (used by `redeemReward`) and everything else.

- [ ] **Step 4: Delete `earnRuleIcon`**

In `src/pages/Loyalty/loyaltyIcons.ts`: remove the `earnRuleIcon` function, the `EarnRule` import, and the now-unused icon imports (`Instagram`, `MailOutline`, `Person`, `RateReview`, `ShoppingBag`, `Star`). `redeemRuleIcon` and its imports stay. In `loyaltyIcons.test.ts`, delete the `earnRuleIcon` cases (keep `redeemRuleIcon` ones); remove orphaned imports.

- [ ] **Step 5: Delete the three component files**

```bash
git rm src/pages/Loyalty/components/EarnPointsTab.tsx src/pages/Loyalty/components/TiersTab.tsx src/pages/Loyalty/components/MembershipsTab.tsx
```

- [ ] **Step 6: Delete the orphaned i18n keys**

From `en.json` remove: `loyalty.earn.completed`, `loyalty.earn.flat`, `loyalty.earn.follow`, `loyalty.earn.followSuccess`, `loyalty.earn.perDollar`, `loyalty.tabs.tiers`, `loyalty.tabs.memberships`, `loyalty.tiers.currentTier`, `loyalty.benefits.howYouEarn`.

- [ ] **Step 7: Sweep the tests**

`src/pages/Loyalty/index.test.tsx`:
- DELETE these tests (features removed): `'omits the memberships section when the store has none'`, `'omits the description line for a membership with no description'`, `'renders earn rules with title and summary'`, `'shows a per-dollar points line for increments earn rules'`, `'shows a flat points line for non-increments earn rules'`, `'omits the points line when earnValue is 0'`, `'shows only the earn rules for the customer current tier'`, `'shows a completed chip on a social rule the customer already did'`, `'awards points through the social follow button'`, `'shows the rate-limited error when the social follow is throttled'`, `'shows the generic error when the social follow fails upstream'`.
- REPLACE `'renders the tier list with the current tier highlighted and its title in the hero'` (line ~402) — its tier-card assertions die with the list, but it is the only hero-Influence-fallback coverage. Replace with:

```ts
it('falls back to the Influence tier title in the hero when tier progress is absent', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1' }));
  mockTiers([buildTierWith({ id: 't1', title: 'Select' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Current tier')).toBeInTheDocument();
  expect(await screen.findByText('Select')).toBeInTheDocument();
});
```

- UPDATE `'shows membership status, tier benefits, earn rules and comparisons on My benefits'` (line ~1315): rename to `'shows membership status and tier benefits on My benefits'`; drop the `mockMemberships`/`mockEarnRules` setup lines and the earn-rules/comparison assertions; keep the membership-box and tier-box assertions unchanged.
- DELETE the now-unused `buildEarnRuleWith`, `mockEarnRules`, `buildMembershipWith`, `mockMemberships` helpers and the `EarnRule`/`LoyaltyMembership` type imports.

`src/pages/Loyalty/api.test.ts`: DELETE the describes `fetchMemberships` (line 265), `fetchEarnRules` (318), `completeSocialRule` (425), `getSocialCompletionFlag` (452), `isEarnRuleForTier` (477), the top-level `buildEarnRuleWith` builder, and the orphaned imports.

- [ ] **Step 8: Gates**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run` → green.
Run: `yarn tsc --noEmit` → clean.
Run: `npx eslint src/pages/Loyalty/ --max-warnings 0` → clean.
Run: `yarn lint:knip` → **must be exactly the pre-existing `src/utils/analytics.ts` baseline** (this task is the knip-critical one; anything else flagged means a missed orphan — fix it).

- [ ] **Step 9: Commit**

```bash
git add -A src/pages/Loyalty src/lib/lang/locales/en.json
git commit -m "refactor: B2B-0000 Remove earn-rules, tiers and memberships sections from My benefits" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Intro, restyled benefit boxes, restyled progress card

**Files:**
- Modify: `src/pages/Loyalty/components/BenefitsTab.tsx`, `src/pages/Loyalty/components/TierProgressCard.tsx`, `src/pages/Loyalty/index.tsx`, `src/lib/lang/locales/en.json`
- Test: `src/pages/Loyalty/index.test.tsx`

**Interfaces:**
- Consumes from Task 1: `BenefitsTab` props `{ customer, tiers, tierProgress }`.
- Produces: `BenefitsTab` props gain `tierDisplayName: string | null` (Tasks 3–4 reuse it);
  `TierProgressCard` keeps `{ progress }`.

- [ ] **Step 1: Write the failing tests**

In `src/pages/Loyalty/index.test.tsx`, append:

```ts
it('introduces My benefits with the customer tier name', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1' }));
  mockTiers([buildTierWith({ id: 't1', title: 'Essential' })]);

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByText(
      "We want to make sure every order works harder for you.",
    ),
  ).toBeInTheDocument();
  expect(
    await screen.findByText(
      "Here's a quick guide to your Essential benefits and how to get the most from them.",
    ),
  ).toBeInTheDocument();
});

it('uses the generic intro line when no tier name is known', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: null }));

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByText(
      "Here's a quick guide to your benefits and how to get the most from them.",
    ),
  ).toBeInTheDocument();
});
```

Also update the progress-card expectations (find them with `grep -n "Progress to\|39 / 75\|130.85" src/pages/Loyalty/index.test.tsx`):
- every `'Progress to Signature'` expected string → `'Progress to Signature Tier'` (including the `findAllByText` single-render test);
- `'39 / 75'` → `'39 of 75 orders'`;
- `'$130.85 / $300.00'` → `'$130.85 of $300.00'`;
- in `'shows dual-quota tier progress on the Your rewards tab'`: the summary string is no longer rendered by the card — change its summary assertion to `expect(screen.queryByText("36 more order(s) OR $169.15 more spend away from 'Signature'.")).not.toBeInTheDocument();` and drop the standalone `'Orders'`/`'Spend'` label assertions (labels are gone; the row captions are self-describing).

- [ ] **Step 2: Run to verify RED**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run -t "introduces My benefits|generic intro|tier progress"`
Expected: FAIL — intro copy absent; old card strings rendered.

- [ ] **Step 3: i18n changes**

In `en.json`: change `"loyalty.tiers.progressTo": "Progress to {tier}"` → `"Progress to {tier} Tier"`. Delete `loyalty.progress.orders` and `loyalty.progress.spend`. Add:

```json
  "loyalty.progress.spendOf": "{spent} of {target}",
  "loyalty.progress.ordersOf": "{current} of {target} orders",
  "loyalty.benefits.introLead": "We want to make sure every order works harder for you.",
  "loyalty.benefits.introGuide": "Here's a quick guide to your {tier} benefits and how to get the most from them.",
  "loyalty.benefits.introGuideGeneric": "Here's a quick guide to your benefits and how to get the most from them.",
```

- [ ] **Step 4: Restyle `TierProgressCard`** (replace the render, keep both guards)

```tsx
import { alpha, Box, LinearProgress, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { currencyFormat } from '@/utils/b3CurrencyFormat';

import { LoyaltyTierProgress } from '../api';

interface TierProgressCardProps {
  progress: LoyaltyTierProgress | null;
}

function TierProgressCard({ progress }: TierProgressCardProps) {
  const b3Lang = useB3Lang();

  // PrePointsGate is surfaced by the hero (CTA + summary), not by this card.
  if (!progress || progress.targetKind !== 'NextTier') {
    return null;
  }

  return (
    <Box
      sx={{
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
        borderRadius: 2,
        p: 3,
      }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {b3Lang('loyalty.tiers.progressTo', { tier: progress.targetTierName })}
      </Typography>
      {progress.targetAmountRequired > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('loyalty.progress.spendOf', {
              spent: currencyFormat(progress.spendInWindow),
              target: currencyFormat(progress.targetAmountRequired),
            })}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, progress.spendProgressPct)}
            sx={{ mt: 1, height: 8, borderRadius: 4 }}
          />
        </Box>
      )}
      {progress.targetOrdersRequired > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('loyalty.progress.ordersOf', {
              current: progress.ordersInWindow.toLocaleString(),
              target: progress.targetOrdersRequired.toLocaleString(),
            })}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, progress.ordersProgressPct)}
            sx={{ mt: 1, height: 8, borderRadius: 4 }}
          />
        </Box>
      )}
    </Box>
  );
}

export default TierProgressCard;
```

(The `summary` render is gone — spend row first, orders second, per the spec.)

- [ ] **Step 5: Restyle `BenefitsTab`** (intro + icon boxes; SectionHeader removed — the mock opens with the intro)

Replace the component with:

```tsx
import { WorkspacePremiumOutlined } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyCustomer, LoyaltyTier, LoyaltyTierProgress } from '../api';

import TierProgressCard from './TierProgressCard';

interface BenefitsTabProps {
  customer: LoyaltyCustomer | undefined;
  tiers: LoyaltyTier[];
  tierProgress: LoyaltyTierProgress | null;
  tierDisplayName: string | null;
}

const benefitsBoxSx = {
  bgcolor: 'primary.main',
  color: 'primary.contrastText',
  borderRadius: 2,
  p: { xs: 3, sm: 4 },
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 3,
} as const;

interface BenefitsBoxProps {
  title: string;
  perks: string[];
}

function BenefitsBox({ title, perks }: BenefitsBoxProps) {
  return (
    <Box sx={benefitsBoxSx}>
      <WorkspacePremiumOutlined sx={{ fontSize: 64, flex: '0 0 auto', mx: { xs: 'auto', sm: 3 } }} />
      <Box sx={{ flex: '1 1 60%' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          {title}
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {perks.map((perk) => (
            <Typography key={perk} component="li" variant="body2" sx={{ mb: 0.5 }}>
              {perk}
            </Typography>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function BenefitsTab({ customer, tiers, tierProgress, tierDisplayName }: BenefitsTabProps) {
  const b3Lang = useB3Lang();

  if (!customer) {
    return null;
  }

  const currentTier = tiers.find((tier) => tier.id === customer.currentLoyaltyTierId);
  const membership = customer.currentMembership;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {b3Lang('loyalty.benefits.introLead')}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {tierDisplayName
            ? b3Lang('loyalty.benefits.introGuide', { tier: tierDisplayName })
            : b3Lang('loyalty.benefits.introGuideGeneric')}
        </Typography>
      </Box>
      {currentTier && (
        <BenefitsBox
          title={b3Lang('loyalty.overview.benefitsTitle', { tier: currentTier.title })}
          perks={currentTier.perks}
        />
      )}
      {membership && membership.perks.length > 0 && (
        <BenefitsBox
          title={b3Lang('loyalty.overview.membershipBenefitsTitle', {
            membership: membership.title,
          })}
          perks={membership.perks}
        />
      )}
      <TierProgressCard progress={tierProgress} />
    </Box>
  );
}

export default BenefitsTab;
```

NOTE the box order matches the mock's emphasis: the mock shows the tier box; spec §2 orders tier box first, membership box below (this REVERSES the previous membership-first order — the mock's guide is tier-centric; spec §2 governs).

- [ ] **Step 6: Wire `tierDisplayName`**

In `index.tsx`, the `BenefitsTab` call gains `tierDisplayName={displayTierTitle}`.

- [ ] **Step 7: GREEN + gates**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run` → green (the membership/tier box tests keep passing — same text, now `<li>`).
Run: `yarn tsc --noEmit`; `npx eslint src/pages/Loyalty/components/BenefitsTab.tsx src/pages/Loyalty/components/TierProgressCard.tsx src/pages/Loyalty/index.tsx src/pages/Loyalty/index.test.tsx --max-warnings 0` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Loyalty/components/BenefitsTab.tsx src/pages/Loyalty/components/TierProgressCard.tsx src/pages/Loyalty/index.tsx src/lib/lang/locales/en.json src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Restyle My benefits intro, benefit boxes and progress card" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Image banner + explainer info cards

**Files:**
- Modify: `src/pages/Loyalty/api.ts`, `src/index.d.ts`, `src/pages/Loyalty/components/BenefitsTab.tsx`, `src/lib/lang/locales/en.json`
- Create: `src/pages/Loyalty/components/BenefitsInfoCards.tsx`
- Test: `src/pages/Loyalty/api.test.ts`, `src/pages/Loyalty/index.test.tsx`

**Interfaces:**
- Consumes from Task 2: `BenefitsTab` with `tierDisplayName`.
- Produces: `getBenefitsBannerUrl(): string`; `BenefitsInfoCards` default export taking `{ tierDisplayName: string | null }`.

- [ ] **Step 1: Write the failing tests**

`api.test.ts` — append (mirroring the `getBannerUrl` describe at line 993):

```ts
describe('getBenefitsBannerUrl', () => {
  it('defaults to the storefront-relative benefits banner path', () => {
    window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };

    expect(getBenefitsBannerUrl()).toBe('/content/images/loyalty/loyalty-benefits-banner.jpg');
  });

  it('prefers a non-blank theme override', () => {
    window.BC_CONTEXT = {
      loyalty: { shopKey, apiBase, appClientId, benefitsBannerUrl: 'https://cdn.example.com/b.jpg' },
    };

    expect(getBenefitsBannerUrl()).toBe('https://cdn.example.com/b.jpg');
  });
});
```

`index.test.tsx` — append:

```ts
it('shows the benefits banner and explainer cards with the tier name', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1' }));
  mockTiers([buildTierWith({ id: 't1', title: 'Essential' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText("Here's how your Essential rewards work")).toBeInTheDocument();
  expect(screen.getByText('Each purchase earns you points.')).toBeInTheDocument();
  expect(
    document.querySelector('img[src="/content/images/loyalty/loyalty-benefits-banner.jpg"]'),
  ).toBeInTheDocument();
  expect(screen.getByText('Earning and Redeeming Credit')).toBeInTheDocument();
  expect(
    screen.getByText(
      'At the Essential level, you earn at a 1% rate once you reach $500 in annual purchases.',
    ),
  ).toBeInTheDocument();
  expect(screen.getByText('Free Shipping')).toBeInTheDocument();
  expect(screen.getByText('Orders over $300 ship ground for free, every time.')).toBeInTheDocument();
  expect(screen.getByText('Your Tier Status')).toBeInTheDocument();
  expect(
    screen.getByText(
      'We look at your orders over the past 12 months, updated monthly, to determine your tier.',
    ),
  ).toBeInTheDocument();
});

it('hides the benefits banner image when it fails to load', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />);

  const image = await waitFor(() => {
    const el = document.querySelector(
      'img[src="/content/images/loyalty/loyalty-benefits-banner.jpg"]',
    );
    expect(el).toBeInTheDocument();
    return el;
  });

  fireEvent.error(image as Element);

  expect(
    document.querySelector('img[src="/content/images/loyalty/loyalty-benefits-banner.jpg"]'),
  ).not.toBeInTheDocument();
});
```

(`fireEvent` and `waitFor` are exported from `tests/test-utils` — the hero-banner test already imports `fireEvent` this way.)

- [ ] **Step 2: RED**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run -t "benefits banner|getBenefitsBannerUrl"`
Expected: FAIL — export and content missing.

- [ ] **Step 3: Config + reader**

`src/index.d.ts` — after `bannerUrl?`:

```ts
        /** Theme override for the My-benefits banner image; absent = the relative default. */
        benefitsBannerUrl?: string;
```

`api.ts` — add `benefitsBannerUrl?: string;` to `LoyaltyConfig`, and next to `getBannerUrl`:

```ts
const DEFAULT_BENEFITS_BANNER_URL = '/content/images/loyalty/loyalty-benefits-banner.jpg';

export const getBenefitsBannerUrl = (): string =>
  getLoyaltyConfig()?.benefitsBannerUrl?.trim() || DEFAULT_BENEFITS_BANNER_URL;
```

- [ ] **Step 4: i18n**

```json
  "loyalty.benefits.bannerTitle": "Here's how your {tier} rewards work",
  "loyalty.benefits.bannerTitleGeneric": "Here's how your rewards work",
  "loyalty.benefits.bannerSubtitle": "Each purchase earns you points.",
  "loyalty.benefits.credit.title": "Earning and Redeeming Credit",
  "loyalty.benefits.credit.point1": "Each purchase earns you points. Every month, your points are automatically converted to store credit you can apply to any future purchase.",
  "loyalty.benefits.credit.point2": "At the {tier} level, you earn at a 1% rate once you reach $500 in annual purchases.",
  "loyalty.benefits.credit.point2Generic": "You earn at your tier's rate once you reach $500 in annual purchases.",
  "loyalty.benefits.credit.point3": "Credit is calculated on your order total, after any discounts, excluding tax and shipping.",
  "loyalty.benefits.credit.point4": "When your points are ready, we'll send you an email letting you know your store credit is available to use.",
  "loyalty.benefits.credit.point5": "The store certificates are valid for 12 months and can be used alongside product discounts.",
  "loyalty.benefits.shipping.title": "Free Shipping",
  "loyalty.benefits.shipping.point1": "Orders over $300 ship ground for free, every time.",
  "loyalty.benefits.shipping.point2": "You'll see your progress toward the $300 threshold in your cart, so you always know where you stand before you check out.",
  "loyalty.benefits.tierStatus.title": "Your Tier Status",
  "loyalty.benefits.tierStatus.point1": "We look at your orders over the past 12 months, updated monthly, to determine your tier.",
  "loyalty.benefits.tierStatus.point2": "If your tier is ever going to change, we'll let you know 30 days in advance.",
```

- [ ] **Step 5: Create `BenefitsInfoCards`**

```tsx
import {
  LocalShippingOutlined,
  SavingsOutlined,
  SvgIconComponent,
  TrendingUp,
} from '@mui/icons-material';
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

interface BenefitsInfoCardsProps {
  tierDisplayName: string | null;
}

interface InfoCardProps {
  title: string;
  Icon: SvgIconComponent;
  points: string[];
}

function InfoCard({ title, Icon, points }: InfoCardProps) {
  return (
    <Box sx={{ bgcolor: 'grey.100', borderRadius: 2, p: { xs: 3, sm: 4 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography variant="h6" color="primary" sx={{ fontWeight: 700, mb: 1 }}>
          {title}
        </Typography>
        <Icon color="primary" sx={{ fontSize: 40 }} />
      </Box>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {points.map((point) => (
          <Typography key={point} component="li" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            {point}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

function BenefitsInfoCards({ tierDisplayName }: BenefitsInfoCardsProps) {
  const b3Lang = useB3Lang();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <InfoCard
        title={b3Lang('loyalty.benefits.credit.title')}
        Icon={SavingsOutlined}
        points={[
          b3Lang('loyalty.benefits.credit.point1'),
          tierDisplayName
            ? b3Lang('loyalty.benefits.credit.point2', { tier: tierDisplayName })
            : b3Lang('loyalty.benefits.credit.point2Generic'),
          b3Lang('loyalty.benefits.credit.point3'),
          b3Lang('loyalty.benefits.credit.point4'),
          b3Lang('loyalty.benefits.credit.point5'),
        ]}
      />
      <InfoCard
        title={b3Lang('loyalty.benefits.shipping.title')}
        Icon={LocalShippingOutlined}
        points={[b3Lang('loyalty.benefits.shipping.point1'), b3Lang('loyalty.benefits.shipping.point2')]}
      />
      <InfoCard
        title={b3Lang('loyalty.benefits.tierStatus.title')}
        Icon={TrendingUp}
        points={[b3Lang('loyalty.benefits.tierStatus.point1'), b3Lang('loyalty.benefits.tierStatus.point2')]}
      />
    </Box>
  );
}

export default BenefitsInfoCards;
```

(If any icon name doesn't exist in the installed `@mui/icons-material`, substitute the closest named variant and note it in the report.)

- [ ] **Step 6: Banner + cards into `BenefitsTab`**

Add to `BenefitsTab.tsx` (imports: `useState`, `getBenefitsBannerUrl`, `BenefitsInfoCards`); insert BETWEEN `<TierProgressCard …/>` and the closing `</Box>`:

```tsx
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          borderRadius: 2,
          p: { xs: 3, sm: 6 },
          mx: { md: -4 },
        }}
      >
        {!bannerFailed && (
          <Box
            component="img"
            src={getBenefitsBannerUrl()}
            alt=""
            onError={() => setBannerFailed(true)}
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              height: '100%',
              width: { xs: 0, md: '45%' },
              objectFit: 'cover',
              display: { xs: 'none', md: 'block' },
            }}
          />
        )}
        <Box sx={{ position: 'relative', maxWidth: { md: '50%' } }}>
          <Typography variant="h4" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>
            {tierDisplayName
              ? b3Lang('loyalty.benefits.bannerTitle', { tier: tierDisplayName })
              : b3Lang('loyalty.benefits.bannerTitleGeneric')}
          </Typography>
          <Typography variant="body2" sx={{ mt: 2, opacity: 0.9 }}>
            {b3Lang('loyalty.benefits.bannerSubtitle')}
          </Typography>
        </Box>
      </Box>
      <BenefitsInfoCards tierDisplayName={tierDisplayName} />
```

with `const [bannerFailed, setBannerFailed] = useState(false);` at the top of the component. (The heading is stored sentence-case and uppercased by CSS, so tests match `"Here's how your Essential rewards work"`.)

- [ ] **Step 7: GREEN + gates**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run` → green.
Run: `yarn tsc --noEmit`; `npx eslint src/pages/Loyalty/components/BenefitsTab.tsx src/pages/Loyalty/components/BenefitsInfoCards.tsx src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts src/pages/Loyalty/index.test.tsx --max-warnings 0` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/index.d.ts src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts src/pages/Loyalty/components/BenefitsTab.tsx src/pages/Loyalty/components/BenefitsInfoCards.tsx src/lib/lang/locales/en.json src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Add the benefits banner and explainer cards" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Next-tier ladder + footer

**Files:**
- Create: `src/pages/Loyalty/components/NextTiersSection.tsx`
- Modify: `src/pages/Loyalty/components/BenefitsTab.tsx`, `src/lib/lang/locales/en.json`
- Test: `src/pages/Loyalty/index.test.tsx`

**Interfaces:**
- Consumes: `LoyaltyTier` (`id`, `title`, `threshold`, `perks` — `threshold` becomes buyer-facing copy).
- Produces: `NextTiersSection` default export taking `{ tiers: LoyaltyTier[]; currentTierId: string | null }` (renders `null` when the current tier is unknown or last).

- [ ] **Step 1: Write the failing tests**

Append to `index.test.tsx`:

```ts
const rewardTiers = () => [
  buildTierWith({ id: 't1', title: 'Essential', threshold: '' }),
  buildTierWith({
    id: 't2',
    title: 'Select',
    threshold: '8+ orders/year or $2,000+ annual spend',
    perks: ['2% monthly credit', 'an account rep'],
  }),
  buildTierWith({
    id: 't3',
    title: 'Signature',
    threshold: '16+ orders/year or $5,000+ annual spend',
    perks: ['3% monthly credit'],
  }),
];

it('shows the tiers above the customer with their quota and perks', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1' }));
  mockTiers(rewardTiers());

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText("What's Available as Your Orders Grow?")).toBeInTheDocument();
  expect(
    screen.getByText('As your orders grow, so do your rewards. 2 more levels are available:'),
  ).toBeInTheDocument();
  expect(screen.getByText('Select Tier')).toBeInTheDocument();
  expect(screen.getByText('(8+ orders/year or $2,000+ annual spend) :')).toBeInTheDocument();
  expect(screen.getByText('2% monthly credit, an account rep')).toBeInTheDocument();
  expect(screen.getByText('Signature Tier')).toBeInTheDocument();
  expect(
    screen.getByText('When you reach the next level, your tier upgrades automatically.'),
  ).toBeInTheDocument();
});

it('shows only the tiers above the customer, not current or lower ones', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't2' }));
  mockTiers(rewardTiers());

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Signature Tier')).toBeInTheDocument();
  expect(
    screen.getByText('As your orders grow, so do your rewards. 1 more level is available:'),
  ).toBeInTheDocument();
  expect(screen.queryByText('Select Tier')).not.toBeInTheDocument();
  expect(screen.queryByText('Essential Tier')).not.toBeInTheDocument();
});

it('hides the tier ladder for a top-tier customer but keeps the contact footer', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't3' }));
  mockTiers(rewardTiers());

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Questions? Contact us at 1-833-397-2619')).toBeInTheDocument();
  expect(screen.queryByText("What's Available as Your Orders Grow?")).not.toBeInTheDocument();
  expect(
    screen.queryByText('When you reach the next level, your tier upgrades automatically.'),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Place your next order' })).toBeInTheDocument();
});
```

Also add the unknown-tier edge (spec edge-case table):

```ts
it('hides the tier ladder when the customer tier is unknown', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 'not-in-list' }));
  mockTiers(rewardTiers());

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Questions? Contact us at 1-833-397-2619')).toBeInTheDocument();
  expect(screen.queryByText("What's Available as Your Orders Grow?")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: RED**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run -t "Orders Grow|tiers above|top-tier customer|tier is unknown"`
Expected: FAIL.

- [ ] **Step 3: i18n**

```json
  "loyalty.benefits.nextTiersTitle": "What's Available as Your Orders Grow?",
  "loyalty.benefits.nextTiersIntroOne": "As your orders grow, so do your rewards. 1 more level is available:",
  "loyalty.benefits.nextTiersIntroMany": "As your orders grow, so do your rewards. {count} more levels are available:",
  "loyalty.benefits.nextTierName": "{title} Tier",
  "loyalty.benefits.autoUpgrade": "When you reach the next level, your tier upgrades automatically.",
  "loyalty.benefits.contact": "Questions? Contact us at 1-833-397-2619",
  "loyalty.benefits.orderCta": "Place your next order",
```

- [ ] **Step 4: Create `NextTiersSection`**

```tsx
import { ArrowOutward } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyTier } from '../api';

interface NextTiersSectionProps {
  tiers: LoyaltyTier[];
  currentTierId: string | null;
}

function NextTiersSection({ tiers, currentTierId }: NextTiersSectionProps) {
  const b3Lang = useB3Lang();

  const currentIndex = tiers.findIndex((tier) => tier.id === currentTierId);
  // Unknown current tier: we cannot say what is "above", so show nothing.
  const nextTiers = currentIndex === -1 ? [] : tiers.slice(currentIndex + 1);

  if (nextTiers.length === 0) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 800, textAlign: 'center' }}>
        {b3Lang('loyalty.benefits.nextTiersTitle')}
      </Typography>
      <Typography sx={{ textAlign: 'center' }}>
        {nextTiers.length === 1
          ? b3Lang('loyalty.benefits.nextTiersIntroOne')
          : b3Lang('loyalty.benefits.nextTiersIntroMany', { count: nextTiers.length })}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {nextTiers.map((tier) => (
          <Box
            key={tier.id}
            sx={{
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              borderRadius: 2,
              p: 3,
              flex: '1 1 40%',
              minWidth: 240,
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Typography variant="h5" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>
                {b3Lang('loyalty.benefits.nextTierName', { title: tier.title })}
              </Typography>
              <ArrowOutward sx={{ fontSize: 32 }} />
            </Box>
            {tier.threshold.trim() !== '' && (
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>
                {`(${tier.threshold}) :`}
              </Typography>
            )}
            {tier.perks.length > 0 && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {tier.perks.join(', ')}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
      <Typography sx={{ textAlign: 'center' }}>
        {b3Lang('loyalty.benefits.autoUpgrade')}
      </Typography>
    </Box>
  );
}

export default NextTiersSection;
```

- [ ] **Step 5: Wire into `BenefitsTab` + footer**

In `BenefitsTab.tsx`: import `Button` (add to the `@mui/material` import) and `NextTiersSection`; after `<BenefitsInfoCards …/>` append:

```tsx
      <NextTiersSection tiers={tiers} currentTierId={customer.currentLoyaltyTierId ?? null} />
      <Typography sx={{ textAlign: 'center', fontWeight: 700 }}>
        {b3Lang('loyalty.benefits.contact')}
      </Typography>
      <Button
        href={`${window.location.origin}/`}
        variant="contained"
        color="error"
        size="large"
        fullWidth
      >
        {b3Lang('loyalty.benefits.orderCta')}
      </Button>
```

- [ ] **Step 6: GREEN + full gates**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run` → green.
Run: `yarn tsc --noEmit`; `npx eslint src/pages/Loyalty/components/NextTiersSection.tsx src/pages/Loyalty/components/BenefitsTab.tsx src/pages/Loyalty/index.test.tsx --max-warnings 0` → clean.
Run: `yarn lint:knip` → `analytics.ts` baseline only.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Loyalty/components/NextTiersSection.tsx src/pages/Loyalty/components/BenefitsTab.tsx src/lib/lang/locales/en.json src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Add the next-tier ladder and footer to My benefits" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Verification (whole feature)

- `CIRCLECI=true yarn test src/pages/Loyalty/ --run` green; `yarn tsc --noEmit` clean; `npx eslint src/pages/Loyalty/ --max-warnings 0` clean; `yarn lint:knip` at baseline; `yarn build` exit 0.
- Manual (sandbox, post-deploy): My benefits matches the mock for an Essential account; the mid-page banner appears once the artwork is uploaded to `/content/images/loyalty/loyalty-benefits-banner.jpg`; a top-tier account shows no ladder; `?tab=tiers`/`?tab=memberships` bookmarks still land on My benefits.

## Notes / out of scope

- The Influence tier `threshold` string is now buyer-facing quota copy ("8+ orders/year or $2,000+ annual spend") — maintain it in the Influence admin.
- Info-card figures (1%, $500, $300, 12 months, phone) are static i18n by decision; edits require a deploy. `credit.point2Generic` covers unknown-tier customers.
- Social-follow earning intentionally leaves the portal (Influence launcher still offers it).
- The benefits banner artwork is a WebDAV upload, not a code hand-off.
