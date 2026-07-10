# Loyalty "Rewards" Page Visual Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the existing Influence.io-backed Loyalty page to match the supplied mockup as a visual-only change — tab icons, a filled tier-benefits panel, and icon-topped cards — without touching data fetching, routing, or behavior.

**Architecture:** Add two small page-local presentational helpers (`loyaltyIcons` mapping module, `SectionHeader` component) under `src/pages/Loyalty/`, then apply theme-token styling inside each existing hero/tab component. The Earn and Redeem grids share the same "icon card" shape. No API, routing, or i18n-key changes.

**Tech Stack:** React 18, TypeScript, MUI v5 (`@mui/material`, `@mui/icons-material`), `@tanstack/react-query`, Vitest + Testing Library.

**Spec:** `apps/storefront/docs/superpowers/specs/2026-07-10-loyalty-rewards-page-redesign-design.md`

## Global Constraints

- **Working dir:** run all `yarn` commands from `apps/storefront/`. Run `git` from the repo root (`/home/thaverman/repos/customb2baccount/b2b-buyer-portal`); `git add` paths below are repo-root-relative.
- **Color:** theme tokens only — `primary.main`, `primary.contrastText`, `background.paper`, `divider`, `text.secondary`, `common.black`, `common.white`. No hardcoded hex.
- **Icons:** named imports from `@mui/icons-material` only (deep paths are ESLint-blocked).
- **Imports:** `@/` and `tests/` aliases across dirs; `./`/`../` within the Loyalty page folder. `yarn format` auto-fixes import ordering.
- **i18n:** no new keys — reuse existing `loyalty.*` keys from `src/lib/lang/locales/en.json`; uppercase section headers via CSS `textTransform`, not new copy.
- **Lint gate:** `yarn lint` runs with `--max-warnings 0` and knip (unused exports fail the build). Every new export must be consumed; remove any import your edit orphans.
- **Testing philosophy:** genuinely new logic gets unit tests first (Tasks 1–2, TDD). The restyle tasks (3–8) are visual and are guarded by the **existing** Loyalty test suite (behavior/text/roles unchanged) plus `tsc` and a final manual visual check (Task 9). Do not invent redundant isolated tab tests — the icon-mapping logic is already unit-tested in Task 1 and the DRY/YAGNI rules in AGENTS.md make duplicate integration tests a review blocker.
- **Do NOT change:** `api.ts`, route definitions, `?tab=` handling, or any `loyalty.*` i18n key. Store-credit / free-shipping / mission / "pending" points / Earn "Learn more" are out of scope.

---

### Task 1: `loyaltyIcons` mapping module

Pure functions mapping an earn/redeem rule to a `@mui/icons-material` component, using the same keyword-heuristic style as the existing `getSocialCompletionFlag`, with a fallback. This is the only piece of the redesign with real logic, so it is fully unit-tested.

**Files:**
- Create: `apps/storefront/src/pages/Loyalty/loyaltyIcons.ts`
- Test: `apps/storefront/src/pages/Loyalty/loyaltyIcons.test.ts`

**Interfaces:**
- Consumes: `EarnRule`, `RedeemRule` from `./api`.
- Produces:
  - `earnRuleIcon(rule: EarnRule): SvgIconComponent`
  - `redeemRuleIcon(rule: RedeemRule): SvgIconComponent`

Note: the file is `.ts` (not `.tsx`) — it returns component references, never JSX.

- [ ] **Step 1: Write the failing tests**

Create `apps/storefront/src/pages/Loyalty/loyaltyIcons.test.ts`:

```ts
import {
  CardGiftcard,
  Instagram,
  LocalOffer,
  LocalShipping,
  MailOutline,
  Person,
  RateReview,
  Redeem,
  ShoppingBag,
  Star,
} from '@mui/icons-material';
import { builder, faker } from 'tests/test-utils';

import { EarnRule, RedeemRule } from './api';
import { earnRuleIcon, redeemRuleIcon } from './loyaltyIcons';

const buildEarnRuleWith = builder<EarnRule>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productName(),
  summary: faker.lorem.sentence(),
  earnType: 'flat',
  templateName: '',
  socialUrl: '',
  earnValue: faker.number.int({ min: 1, max: 100 }),
  limitTiers: false,
  loyaltyTierIds: [],
}));

const buildRedeemRuleWith = builder<RedeemRule>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productName(),
  pointCost: faker.number.int({ min: 100, max: 1000 }),
  redeemType: '',
  status: 'active',
  minRedeemablePoints: null,
  maxRedeemablePoints: null,
}));

describe('earnRuleIcon', () => {
  it('maps an Instagram rule to the Instagram icon', () => {
    expect(earnRuleIcon(buildEarnRuleWith({ templateName: 'follow_on_instagram' }))).toBe(Instagram);
  });

  it('maps a purchase rule to the ShoppingBag icon', () => {
    expect(earnRuleIcon(buildEarnRuleWith({ title: 'Make a purchase' }))).toBe(ShoppingBag);
  });

  it('maps an account rule to the Person icon', () => {
    expect(earnRuleIcon(buildEarnRuleWith({ title: 'Create an account' }))).toBe(Person);
  });

  it('maps a mailing-list rule to the MailOutline icon', () => {
    expect(earnRuleIcon(buildEarnRuleWith({ title: 'Sign up to our mailing list' }))).toBe(
      MailOutline,
    );
  });

  it('maps a review rule to the RateReview icon', () => {
    expect(earnRuleIcon(buildEarnRuleWith({ title: 'Write a product review' }))).toBe(RateReview);
  });

  it('falls back to the Star icon for an unrecognized rule', () => {
    expect(earnRuleIcon(buildEarnRuleWith({ title: 'Attend our event', templateName: 'xyz' }))).toBe(
      Star,
    );
  });
});

describe('redeemRuleIcon', () => {
  it('maps a free-shipping reward to the LocalShipping icon', () => {
    expect(redeemRuleIcon(buildRedeemRuleWith({ title: 'Free shipping' }))).toBe(LocalShipping);
  });

  it('maps a gift-card reward to the Redeem icon', () => {
    expect(redeemRuleIcon(buildRedeemRuleWith({ title: '$5 gift card' }))).toBe(Redeem);
  });

  it('maps a discount reward to the LocalOffer icon', () => {
    expect(redeemRuleIcon(buildRedeemRuleWith({ title: '10% discount' }))).toBe(LocalOffer);
  });

  it('falls back to the CardGiftcard icon for an unrecognized reward', () => {
    expect(redeemRuleIcon(buildRedeemRuleWith({ title: 'Mystery box', redeemType: '' }))).toBe(
      CardGiftcard,
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty/loyaltyIcons.test.ts`
Expected: FAIL — `Failed to resolve import "./loyaltyIcons"` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/storefront/src/pages/Loyalty/loyaltyIcons.ts`:

```ts
import {
  CardGiftcard,
  Instagram,
  LocalOffer,
  LocalShipping,
  MailOutline,
  Person,
  RateReview,
  Redeem,
  ShoppingBag,
  Star,
  SvgIconComponent,
} from '@mui/icons-material';

import { EarnRule, RedeemRule } from './api';

// Heuristic keyword match on the rule's human-facing and template fields, mirroring
// getSocialCompletionFlag in api.ts. Order matters: earlier checks win.
export const earnRuleIcon = (rule: EarnRule): SvgIconComponent => {
  const haystack = `${rule.templateName} ${rule.title} ${rule.socialUrl}`.toLowerCase();
  if (haystack.includes('instagram')) {
    return Instagram;
  }
  if (haystack.includes('purchase') || haystack.includes('order') || haystack.includes('spend')) {
    return ShoppingBag;
  }
  if (
    haystack.includes('account') ||
    haystack.includes('sign up') ||
    haystack.includes('signup') ||
    haystack.includes('register')
  ) {
    return Person;
  }
  if (
    haystack.includes('mail') ||
    haystack.includes('newsletter') ||
    haystack.includes('subscribe')
  ) {
    return MailOutline;
  }
  if (haystack.includes('review')) {
    return RateReview;
  }
  return Star;
};

export const redeemRuleIcon = (rule: RedeemRule): SvgIconComponent => {
  const haystack = `${rule.title} ${rule.redeemType}`.toLowerCase();
  if (haystack.includes('ship')) {
    return LocalShipping;
  }
  if (haystack.includes('gift')) {
    return Redeem;
  }
  if (
    haystack.includes('discount') ||
    haystack.includes('percent') ||
    haystack.includes('%') ||
    haystack.includes('off') ||
    haystack.includes('$')
  ) {
    return LocalOffer;
  }
  return CardGiftcard;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty/loyaltyIcons.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Type-check**

Run: `yarn tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/pages/Loyalty/loyaltyIcons.ts apps/storefront/src/pages/Loyalty/loyaltyIcons.test.ts
git commit -m "feat: B2B-0000 Add loyalty rule-to-icon mapping helper"
```

---

### Task 2: `SectionHeader` component

A centered, uppercased, primary-colored heading used above every tab's content.

**Files:**
- Create: `apps/storefront/src/pages/Loyalty/components/SectionHeader.tsx`
- Test: `apps/storefront/src/pages/Loyalty/components/SectionHeader.test.tsx`

**Interfaces:**
- Produces: `default export function SectionHeader({ children }: { children: ReactNode })` — renders an `<h2>` heading.

- [ ] **Step 1: Write the failing test**

Create `apps/storefront/src/pages/Loyalty/components/SectionHeader.test.tsx`:

```tsx
import { render, screen } from 'tests/test-utils';

import SectionHeader from './SectionHeader';

it('renders its text as a level-2 heading', () => {
  render(<SectionHeader>Earn points</SectionHeader>);

  expect(screen.getByRole('heading', { level: 2, name: 'Earn points' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test --run src/pages/Loyalty/components/SectionHeader.test.tsx`
Expected: FAIL — `Failed to resolve import "./SectionHeader"`.

- [ ] **Step 3: Write the implementation**

Create `apps/storefront/src/pages/Loyalty/components/SectionHeader.tsx`:

```tsx
import { ReactNode } from 'react';
import { Typography } from '@mui/material';

interface SectionHeaderProps {
  children: ReactNode;
}

function SectionHeader({ children }: SectionHeaderProps) {
  return (
    <Typography
      variant="h6"
      component="h2"
      sx={{
        textAlign: 'center',
        textTransform: 'uppercase',
        fontWeight: 700,
        letterSpacing: 1,
        color: 'primary.main',
        my: 3,
      }}
    >
      {children}
    </Typography>
  );
}

export default SectionHeader;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test --run src/pages/Loyalty/components/SectionHeader.test.tsx`
Expected: PASS — 1 test.

- [ ] **Step 5: Type-check**

Run: `yarn tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/pages/Loyalty/components/SectionHeader.tsx apps/storefront/src/pages/Loyalty/components/SectionHeader.test.tsx
git commit -m "feat: B2B-0000 Add loyalty SectionHeader component"
```

---

### Task 3: Restyle `LoyaltyHero`

Bold/uppercase welcome, tier "pill" with a badge icon, and points moved to a slim strip below the hero. Props and rendered text are unchanged, so the existing hero assertions in `index.test.tsx` keep passing.

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/components/LoyaltyHero.tsx`

**Interfaces:**
- Consumes: nothing new. Props unchanged (`companyName`, `memberSince`, `tierTitle`, `pointBalance`).

- [ ] **Step 1: Replace the whole file**

Replace the contents of `apps/storefront/src/pages/Loyalty/components/LoyaltyHero.tsx` with:

```tsx
import { Box, Chip, Typography } from '@mui/material';
import { WorkspacePremium } from '@mui/icons-material';

import { useB3Lang } from '@/lib/lang';

interface LoyaltyHeroProps {
  companyName: string;
  memberSince: string | null;
  tierTitle: string | null;
  pointBalance: number | null;
}

function LoyaltyHero({ companyName, memberSince, tierTitle, pointBalance }: LoyaltyHeroProps) {
  const b3Lang = useB3Lang();

  return (
    <>
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          borderRadius: 2,
          p: { xs: 3, sm: 4 },
          mb: 2,
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Typography
            variant="h4"
            sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}
          >
            {b3Lang('loyalty.hero.welcome')}
          </Typography>
          {memberSince && (
            <Chip
              label={b3Lang('loyalty.hero.memberSince', { date: memberSince })}
              sx={{ bgcolor: 'common.black', color: 'common.white' }}
            />
          )}
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 400, opacity: 0.9 }}>
          {companyName}
        </Typography>
        {tierTitle && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              {b3Lang('loyalty.hero.currentTier')}
            </Typography>
            <Chip
              icon={<WorkspacePremium />}
              label={tierTitle}
              sx={{
                mt: 1,
                fontWeight: 700,
                bgcolor: 'common.black',
                color: 'common.white',
                '& .MuiChip-icon': { color: 'common.white' },
              }}
            />
          </Box>
        )}
      </Box>
      {pointBalance !== null && (
        <Typography sx={{ textAlign: 'center', mb: 2, color: 'text.secondary' }}>
          {b3Lang('loyalty.hero.points', { points: pointBalance.toLocaleString() })}
        </Typography>
      )}
    </>
  );
}

export default LoyaltyHero;
```

- [ ] **Step 2: Run the Loyalty page tests (regression guard)**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx`
Expected: PASS — welcome text, member-since, tier, and points assertions still resolve (DOM text is unchanged; uppercasing is CSS-only).

- [ ] **Step 3: Type-check**

Run: `yarn tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/src/pages/Loyalty/components/LoyaltyHero.tsx
git commit -m "feat: B2B-0000 Restyle loyalty hero to match mockup"
```

---

### Task 4: Add icons to the tabs (`index.tsx`)

Add a leading icon to each `<Tab>`. `value`s, `?tab=` routing, and `variant="scrollable"` are untouched, so tab-routing tests are unaffected (icons don't change a tab's accessible name, which comes from `label`).

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/index.tsx`

- [ ] **Step 1: Add the icon imports**

In `apps/storefront/src/pages/Loyalty/index.tsx`, add this import alongside the existing `@mui/material` import (keep it as its own line so `simple-import-sort` groups it):

```tsx
import { CardGiftcard, FavoriteBorder, Layers, Schedule, StarBorder } from '@mui/icons-material';
```

- [ ] **Step 2: Add `icon` + `iconPosition` to each Tab**

Replace the five `<Tab .../>` lines (currently lines ~138–142) with:

```tsx
          <Tab
            value="overview"
            icon={<FavoriteBorder />}
            iconPosition="start"
            label={b3Lang('loyalty.tabs.overview')}
          />
          <Tab
            value="earn"
            icon={<StarBorder />}
            iconPosition="start"
            label={b3Lang('loyalty.tabs.earn')}
          />
          <Tab
            value="redeem"
            icon={<CardGiftcard />}
            iconPosition="start"
            label={b3Lang('loyalty.tabs.redeem')}
          />
          <Tab
            value="tiers"
            icon={<Layers />}
            iconPosition="start"
            label={b3Lang('loyalty.tabs.tiers')}
          />
          <Tab
            value="history"
            icon={<Schedule />}
            iconPosition="start"
            label={b3Lang('loyalty.tabs.history')}
          />
```

- [ ] **Step 3: Run the full Loyalty page test set (regression guard)**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx src/pages/Loyalty/index.mobile.test.tsx src/pages/Loyalty/index.platform.test.tsx`
Expected: PASS — tab navigation still works; `getByRole('tab', { name: ... })` matches on the unchanged `label`.

- [ ] **Step 4: Type-check**

Run: `yarn tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/pages/Loyalty/index.tsx
git commit -m "feat: B2B-0000 Add icons to loyalty tabs"
```

---

### Task 5: Restyle `OverviewTab` (tier-benefits panel)

Add the section header and render the tier benefits as the mockup's filled `primary.main` panel (title left, perks right). Keep the progress card, restyled as a bordered box. `Card`/`CardContent` are replaced by `Box`, so drop them from the import.

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/components/OverviewTab.tsx`

**Interfaces:**
- Consumes: `SectionHeader` from `./SectionHeader`.

- [ ] **Step 1: Replace the whole file**

Replace the contents of `apps/storefront/src/pages/Loyalty/components/OverviewTab.tsx` with:

```tsx
import { Box, LinearProgress, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyCustomer, LoyaltyTier } from '../api';
import { findNextTier } from '../tierProgress';
import SectionHeader from './SectionHeader';

interface OverviewTabProps {
  customer: LoyaltyCustomer | undefined;
  tiers: LoyaltyTier[];
}

function OverviewTab({ customer, tiers }: OverviewTabProps) {
  const b3Lang = useB3Lang();

  if (!customer) {
    return null;
  }

  const currentTier = tiers.find((tier) => tier.id === customer.currentLoyaltyTierId);
  const progress = customer.currentLoyaltyTierProgress;
  const nextTier = findNextTier(tiers, progress);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.overview')}</SectionHeader>
      {currentTier && (
        <Box
          sx={{
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            borderRadius: 2,
            p: { xs: 3, sm: 4 },
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Typography
            variant="h6"
            sx={{ fontWeight: 800, textTransform: 'uppercase', flex: '1 1 40%' }}
          >
            {b3Lang('loyalty.overview.benefitsTitle', { tier: currentTier.title })}
          </Typography>
          <Box sx={{ flex: '1 1 50%' }}>
            {currentTier.perks.map((perk) => (
              <Typography key={perk} variant="body2" sx={{ mb: 0.5 }}>
                {perk}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
      {nextTier && progress !== null && (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
          <Typography variant="subtitle2" color="text.secondary">
            {b3Lang('loyalty.tiers.progressTo', { tier: nextTier.tier.title })}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {`${progress.toLocaleString()} / ${nextTier.threshold.toLocaleString()}`}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, (progress / nextTier.threshold) * 100)}
            sx={{ mt: 1, height: 8, borderRadius: 4 }}
          />
        </Box>
      )}
    </Box>
  );
}

export default OverviewTab;
```

- [ ] **Step 2: Run the Loyalty page tests (regression guard)**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx`
Expected: PASS — benefits title, perk text, and "X / Y" progress text are unchanged.

- [ ] **Step 3: Type-check**

Run: `yarn tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/src/pages/Loyalty/components/OverviewTab.tsx
git commit -m "feat: B2B-0000 Restyle loyalty overview tier-benefits panel"
```

---

### Task 6: Restyle `EarnPointsTab` (icon cards)

Add the section header and give each rule card a top icon via `earnRuleIcon`. Behavior (`renderAction`, informational rules with no button) is unchanged.

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/components/EarnPointsTab.tsx`

**Interfaces:**
- Consumes: `earnRuleIcon` from `../loyaltyIcons`; `SectionHeader` from `./SectionHeader`.

- [ ] **Step 1: Add the imports**

In `apps/storefront/src/pages/Loyalty/components/EarnPointsTab.tsx`, add after the existing local imports:

```tsx
import { earnRuleIcon } from '../loyaltyIcons';
import SectionHeader from './SectionHeader';
```

- [ ] **Step 2: Replace the `return (...)` block**

Replace the component's `return (...)` (currently the `<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>` … `</Box>`) with:

```tsx
  return (
    <Box>
      <SectionHeader>{b3Lang('loyalty.tabs.earn')}</SectionHeader>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {rules.map((rule) => {
          const Icon = earnRuleIcon(rule);
          return (
            <Card
              key={rule.id}
              variant="outlined"
              sx={{ minWidth: 240, flex: '1 1 40%', borderRadius: 2 }}
            >
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <Icon color="primary" sx={{ fontSize: 32, mb: 1 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {rule.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {rule.summary}
                </Typography>
                {rule.earnValue > 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {rule.earnType === 'increments'
                      ? b3Lang('loyalty.earn.perDollar', { points: rule.earnValue })
                      : b3Lang('loyalty.earn.flat', { points: rule.earnValue })}
                  </Typography>
                )}
                {renderAction(rule)}
              </CardContent>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
```

- [ ] **Step 3: Run the Loyalty page tests (regression guard)**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx`
Expected: PASS — rule titles, summaries, earn-rate text, and the Follow/Completed actions are unchanged.

- [ ] **Step 4: Type-check**

Run: `yarn tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/pages/Loyalty/components/EarnPointsTab.tsx
git commit -m "feat: B2B-0000 Restyle loyalty earn-points cards with icons"
```

---

### Task 7: Restyle `RewardsTab` (redeem icon cards)

The section the mockup labels "Rewards." Add the section header and a top icon per catalog card via `redeemRuleIcon`. The "Get reward" button (with its disable-on-insufficient-points logic), both dialogs, and the earned-rewards list keep their behavior.

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/components/RewardsTab.tsx`

**Interfaces:**
- Consumes: `redeemRuleIcon` from `../loyaltyIcons`; `SectionHeader` from `./SectionHeader`.

- [ ] **Step 1: Replace the whole file**

(Whole-file replacement avoids error-prone closing-tag counting around the portaled dialogs and earned-rewards block — only the imports and the `return (...)` differ from the original.) Replace the contents of `apps/storefront/src/pages/Loyalty/components/RewardsTab.tsx` with:

```tsx
import { useState } from 'react';
import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';
import { snackbar } from '@/utils/b3Tip';

import {
  EarnedReward,
  fetchEarnedRewards,
  fetchRedeemRules,
  isRedeemableCatalogRule,
  LoyaltyError,
  LoyaltyIdentity,
  redeemReward,
  RedeemRule,
} from '../api';
import { redeemRuleIcon } from '../loyaltyIcons';
import SectionHeader from './SectionHeader';

interface RewardsTabProps {
  identity: LoyaltyIdentity | undefined;
  pointBalance: number;
  customerQueryKey: (string | number)[];
}

function RewardsTab({ identity, pointBalance, customerQueryKey }: RewardsTabProps) {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();
  const [pendingRedeem, setPendingRedeem] = useState<RedeemRule | null>(null);
  const [couponCode, setCouponCode] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey: ['loyaltyRedeemRules'],
    queryFn: fetchRedeemRules,
    staleTime: Infinity,
  });
  const catalog = (rulesQuery.data ?? []).filter(isRedeemableCatalogRule);

  const redeemMutation = useMutation({
    mutationFn: (ruleId: string) => {
      if (!identity) {
        return Promise.reject(new Error('identity not loaded'));
      }
      return redeemReward(identity, ruleId);
    },
    onSuccess: (result) => {
      setPendingRedeem(null);
      // Invalidate regardless of outcome: upstream may have deducted points even
      // when it returns no coupon code, so refetch the truth.
      queryClient.invalidateQueries({ queryKey: customerQueryKey });
      queryClient.invalidateQueries({ queryKey: ['loyaltyHistory'] });
      queryClient.invalidateQueries({ queryKey: ['loyaltyRewards'] });
      if (!result.couponCode) {
        snackbar.error(b3Lang('loyalty.errors.generic'));
        return;
      }
      setCouponCode(result.couponCode);
    },
    onError: (err) => {
      setPendingRedeem(null);
      if (err instanceof LoyaltyError && err.kind === 'rateLimited') {
        snackbar.error(b3Lang('loyalty.errors.rateLimited'));
        return;
      }
      snackbar.error(b3Lang('loyalty.errors.generic'));
    },
  });

  const earnedQuery = useInfiniteQuery({
    queryKey: ['loyaltyRewards', identity?.customerId ?? ''],
    queryFn: ({ pageParam }) => {
      if (!identity) {
        return Promise.reject(new Error('identity not loaded'));
      }
      return fetchEarnedRewards(identity, pageParam);
    },
    // v5 requires initialPageParam; undefined = first page (no nextToken param sent).
    initialPageParam: undefined as string | undefined,
    // || not ??: an empty-string token would count as "has next page" while the
    // fetcher drops it from the request — refetching page 1 forever.
    getNextPageParam: (last) => last.nextToken || undefined,
    enabled: Boolean(identity),
  });
  const earnedRewards: EarnedReward[] = earnedQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const handleCopy = async () => {
    if (!couponCode) {
      return;
    }
    try {
      await navigator.clipboard.writeText(couponCode);
      snackbar.success(b3Lang('loyalty.redeem.copied'));
    } catch {
      snackbar.error(b3Lang('loyalty.errors.generic'));
    }
  };

  return (
    <Box>
      <SectionHeader>{b3Lang('loyalty.tabs.redeem')}</SectionHeader>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {catalog.map((rule) => {
          const Icon = redeemRuleIcon(rule);
          return (
            <Card
              key={rule.id}
              variant="outlined"
              sx={{ minWidth: 240, flex: '1 1 40%', borderRadius: 2 }}
            >
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <Icon color="primary" sx={{ fontSize: 32, mb: 1 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {rule.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {b3Lang('loyalty.redeem.pointCost', {
                    points: (rule.pointCost ?? 0).toLocaleString(),
                  })}
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={redeemMutation.isPending || (rule.pointCost ?? 0) > pointBalance}
                  onClick={() => setPendingRedeem(rule)}
                >
                  {b3Lang('loyalty.redeem.getReward')}
                </Button>
              </CardContent>
            </Card>
          );
        })}
        <B3Dialog
          isOpen={Boolean(pendingRedeem)}
          title={b3Lang('loyalty.redeem.confirmTitle')}
          leftSizeBtn={b3Lang('loyalty.redeem.cancel')}
          rightSizeBtn={b3Lang('loyalty.redeem.confirm')}
          loading={redeemMutation.isPending}
          handleLeftClick={() => {
            if (!redeemMutation.isPending) {
              setPendingRedeem(null);
            }
          }}
          handRightClick={() => {
            if (pendingRedeem) {
              redeemMutation.mutate(pendingRedeem.id);
            }
          }}
        >
          <Box>
            {pendingRedeem &&
              b3Lang('loyalty.redeem.confirmContent', {
                reward: pendingRedeem.title,
                points: (pendingRedeem.pointCost ?? 0).toLocaleString(),
              })}
          </Box>
        </B3Dialog>
        <B3Dialog
          isOpen={Boolean(couponCode)}
          title={b3Lang('loyalty.redeem.couponTitle')}
          leftSizeBtn={b3Lang('loyalty.redeem.copy')}
          rightSizeBtn={b3Lang('loyalty.redeem.close')}
          handleLeftClick={handleCopy}
          handRightClick={() => setCouponCode(null)}
        >
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h5" sx={{ mb: 1 }}>
              {couponCode}
            </Typography>
            <Typography variant="body2">{b3Lang('loyalty.redeem.applyAtCheckout')}</Typography>
          </Box>
        </B3Dialog>
        {earnedRewards.length > 0 && (
          <Box sx={{ width: '100%', mt: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {b3Lang('loyalty.redeem.earnedTitle')}
            </Typography>
            {earnedRewards.map((reward) => (
              <Card key={reward.id} variant="outlined" sx={{ mb: 1, borderRadius: 2 }}>
                <CardContent
                  sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}
                >
                  <Typography variant="body2">{reward.title}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {reward.couponCode}
                  </Typography>
                </CardContent>
              </Card>
            ))}
            {earnedQuery.hasNextPage && (
              <Button
                size="small"
                disabled={earnedQuery.isFetchingNextPage}
                onClick={() => earnedQuery.fetchNextPage()}
              >
                {b3Lang('loyalty.loadMore')}
              </Button>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default RewardsTab;
```

- [ ] **Step 2: Run the Loyalty page tests (regression guard)**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx`
Expected: PASS — reward titles, point-cost text, "Get reward" button, the redeem confirm/coupon dialogs, and earned-rewards load-more all behave unchanged.

- [ ] **Step 3: Type-check**

Run: `yarn tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/src/pages/Loyalty/components/RewardsTab.tsx
git commit -m "feat: B2B-0000 Restyle loyalty rewards cards with icons"
```

---

### Task 8: Consistency styling for `TiersTab` and `HistoryTab`

Not depicted in the mockup — apply the shared `SectionHeader` and light `variant="outlined"` card styling so they read consistently. Behavior (current-tier highlight, empty state, load-more) is unchanged.

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/components/TiersTab.tsx`
- Modify: `apps/storefront/src/pages/Loyalty/components/HistoryTab.tsx`

**Interfaces:**
- Consumes: `SectionHeader` from `./SectionHeader`.

- [ ] **Step 1: Replace `TiersTab.tsx`**

Replace the contents of `apps/storefront/src/pages/Loyalty/components/TiersTab.tsx` with:

```tsx
import { Box, Card, CardContent, LinearProgress, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyTier } from '../api';
import { findNextTier } from '../tierProgress';
import SectionHeader from './SectionHeader';

interface TiersTabProps {
  tiers: LoyaltyTier[];
  currentTierId: string | null;
  currentTierProgress: number | null;
}

function TiersTab({ tiers, currentTierId, currentTierProgress }: TiersTabProps) {
  const b3Lang = useB3Lang();
  const next = findNextTier(tiers, currentTierProgress);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.tiers')}</SectionHeader>
      {next && currentTierProgress !== null && (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
          <Typography variant="subtitle2" color="text.secondary">
            {b3Lang('loyalty.tiers.progressTo', { tier: next.tier.title })}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {`${currentTierProgress.toLocaleString()} / ${next.threshold.toLocaleString()}`}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, (currentTierProgress / next.threshold) * 100)}
            sx={{ mt: 1, height: 8, borderRadius: 4 }}
          />
        </Box>
      )}
      {tiers.map((tier) => (
        <Card
          key={tier.id}
          variant="outlined"
          sx={{
            borderRadius: 2,
            borderColor: tier.id === currentTierId ? 'primary.main' : 'divider',
          }}
        >
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {tier.id === currentTierId
                ? b3Lang('loyalty.tiers.currentTier', { tier: tier.title })
                : tier.title}
            </Typography>
            {tier.perks.map((perk) => (
              <Typography key={perk} variant="body2" color="text.secondary">
                {perk}
              </Typography>
            ))}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

export default TiersTab;
```

- [ ] **Step 2: Replace `HistoryTab.tsx`**

Replace the contents of `apps/storefront/src/pages/Loyalty/components/HistoryTab.tsx` with:

```tsx
import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { useInfiniteQuery } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';

import { fetchPointsHistory, LoyaltyIdentity, PointActivity } from '../api';
import SectionHeader from './SectionHeader';

interface HistoryTabProps {
  identity: LoyaltyIdentity | undefined;
}

const formatPoints = (points: number): string => (points > 0 ? `+${points}` : String(points));

const formatDate = (createdAt: string): string => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

function HistoryTab({ identity }: HistoryTabProps) {
  const b3Lang = useB3Lang();

  const historyQuery = useInfiniteQuery({
    queryKey: ['loyaltyHistory', identity?.customerId ?? ''],
    queryFn: ({ pageParam }) => {
      if (!identity) {
        return Promise.reject(new Error('identity not loaded'));
      }
      return fetchPointsHistory(identity, pageParam);
    },
    initialPageParam: undefined as string | undefined,
    // || not ??: an empty-string token would count as "has next page" while the
    // fetcher drops it from the request — refetching page 1 forever.
    getNextPageParam: (last) => last.nextToken || undefined,
    enabled: Boolean(identity),
  });
  const activities: PointActivity[] = historyQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const showEmpty = historyQuery.isSuccess && activities.length === 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.history')}</SectionHeader>
      {showEmpty && <Typography>{b3Lang('loyalty.history.empty')}</Typography>}
      {activities.map((activity) => (
        <Card key={activity.id} variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="body2">{activity.customDescription || activity.action}</Typography>
              <Typography variant="caption" color="text.secondary">
                {formatDate(activity.createdAt)}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {formatPoints(activity.points)}
            </Typography>
          </CardContent>
        </Card>
      ))}
      {historyQuery.hasNextPage && (
        <Button
          size="small"
          disabled={historyQuery.isFetchingNextPage}
          onClick={() => historyQuery.fetchNextPage()}
        >
          {b3Lang('loyalty.loadMore')}
        </Button>
      )}
    </Box>
  );
}

export default HistoryTab;
```

- [ ] **Step 3: Run the Loyalty page tests (regression guard)**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx src/pages/Loyalty/index.mobile.test.tsx`
Expected: PASS — tier titles/current-tier label, history rows, empty state, and load-more are unchanged.

- [ ] **Step 4: Type-check**

Run: `yarn tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/pages/Loyalty/components/TiersTab.tsx apps/storefront/src/pages/Loyalty/components/HistoryTab.tsx
git commit -m "feat: B2B-0000 Align loyalty tiers and history tabs with redesign"
```

---

### Task 9: Full verification and visual check

Run the complete Loyalty suite, type-check, lint, then verify the page visually against the mockup.

**Files:** none (verification only).

- [ ] **Step 1: Run the full Loyalty test folder**

Run: `yarn test --run src/pages/Loyalty`
Expected: PASS — all Loyalty tests (index, mobile, platform, api, loyaltyIcons, SectionHeader) green.

- [ ] **Step 2: Type-check the whole app**

Run: `yarn tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Lint (blocking gate)**

Run: `yarn lint`
Expected: `lint:dependencies`, `lint:eslint` (`--max-warnings 0`), and `lint:knip` all pass. If knip reports an unused export, confirm `earnRuleIcon`/`redeemRuleIcon`/`SectionHeader` are all imported by their consumers. Run `yarn format` to auto-fix import ordering if eslint complains, then re-run.

- [ ] **Step 4: Manual visual verification**

Use the `/verify` skill (or run `yarn dev` on port 3001 and load the buyer portal at `/#/loyalty` through the BigCommerce store URL). Confirm against the mockup:
- Hero: uppercase "WELCOME BACK", company name, member-since chip, tier pill with badge icon; points strip centered below.
- Tabs show leading icons; clicking each still updates `?tab=`.
- Your rewards: filled tier-benefits panel (title left, perks right) + bordered progress bar.
- Earn points / Rewards: centered icon-topped cards with the section header above.
- Confirm the three omitted panels (store credit, free-shipping progress, mission) are intentionally absent.

- [ ] **Step 5: Final confirmation**

No commit needed (verification only). If any check fails, fix in the owning task's file and re-run Steps 1–3.

---

## Self-Review

**Spec coverage:**
- Icons module → Task 1. SectionHeader → Task 2. Hero restyle → Task 3. Tab icons → Task 4. Overview "YOUR REWARDS"/benefits panel → Task 5. Earn cards → Task 6. Rewards cards → Task 7. Tiers/History consistency → Task 8. Theme-token color → enforced in every task via Global Constraints + concrete `sx`. i18n-reuse → Global Constraints (no new keys). Testing/verify → Task 9. Omissions (store credit / free shipping / mission / pending / "Learn more") → never added; called out in Task 9 Step 4. **No gaps.**

**Placeholder scan:** no TBD/TODO; every code step shows complete code and every run step shows an exact command + expected result.

**Type consistency:** `earnRuleIcon(rule: EarnRule): SvgIconComponent` and `redeemRuleIcon(rule: RedeemRule): SvgIconComponent` are defined in Task 1 and consumed with those exact names/args in Tasks 6–7. `SectionHeader` default export defined in Task 2, imported as a default in Tasks 5–8. `EarnRule`/`RedeemRule` field names (`templateName`, `title`, `socialUrl`, `redeemType`, `pointCost`, `earnType`, `earnValue`) match `api.ts`.
