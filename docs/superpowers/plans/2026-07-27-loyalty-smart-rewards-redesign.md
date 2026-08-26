# Loyalty "Smart Rewards" Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Loyalty page as "Smart Rewards" — a branded hero banner with a PrePointsGate call-to-action, and four tabs (My benefits / Get rewards / My rewards / FAQ) folding in today's six.

**Architecture:** The data layer learns the SSW `PrePointsGate` tier state and gains two host-config readers (FAQ content, banner URL). The hero becomes a branded banner that shows a shopping CTA + the server's gate summary only for PrePointsGate customers. The six tabs collapse to four: a composed `BenefitsTab` (membership + tier + progress + earn rules + comparisons), `RewardsTab` slimmed to the redeem catalog, a new `MyRewardsTab` (earned codes + points history), and a theme-fed `FaqTab`.

**Tech Stack:** React 18 function components, `@tanstack/react-query`, MUI, MSW + Vitest + Testing Library, builder/faker factories. All commands run from `apps/storefront/`.

## Global Constraints

- Run every command from `apps/storefront/` (not the repo root).
- Spec: `docs/superpowers/specs/2026-07-27-loyalty-smart-rewards-redesign-design.md`.
- **The tier-allowlist gate stays keyed to the Influence-derived `tierTitle`.** Never re-point `isTierAllowed(tierTitle, allowedTiers)` at SSW data. `displayTierTitle` is display-only.
- `tierProgressQuery` joins neither the page error aggregation nor the gate verdict (fail-quiet). Do not add it to either.
- MUI icons: **named** imports from `@mui/icons-material`. Use `@/` and `tests/` aliases; page-local imports use `./` / `../`.
- No new Redux slices, Context providers, or `localStorage`/`sessionStorage`. `useQuery` for data fetching.
- Tests: builders only (no hardcoded fixtures); import test utils from `tests/test-utils`, never from `@testing-library/*` or `msw` directly.
- Do **not** use `getByRole('progressbar')` in page tests (B3Spin's spinner and multiple bars collide) — assert on text.
- Tab i18n values are **sentence case** ("My benefits"); MUI uppercases them via CSS, and Testing Library matches the sentence-case text content.
- Existing tests may be modified only where the redesign changes what they assert (tab names, hero copy). Intent must be preserved. Every other test stays untouched.
- Money via `currencyFormat` from `@/utils/b3CurrencyFormat`.
- Commit format `type: B2B-0000 Subject` plus trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Test-env fixtures: `window.B3.setting.store_hash` is `'store-hash'`; loyalty tests use `apiBase = 'https://ssw.example.com/customers'`.

---

## File Structure

- **Modify** `src/index.d.ts` — `bannerUrl?` on `BC_CONTEXT.loyalty`; new `loyaltyFaqConfig` global.
- **Modify** `src/pages/Loyalty/api.ts` — `targetKind` on `LoyaltyTierProgress`; accept `PrePointsGate`; `getFaqItems`, `getFaqIntro`, `getBannerUrl`.
- **Modify** `src/pages/Loyalty/components/TierProgressCard.tsx` — render only for `NextTier`.
- **Modify** `src/pages/Loyalty/components/LoyaltyHero.tsx` — branded banner, greeting, gated CTA + summary, background image.
- **Create** `src/pages/Loyalty/components/MyRewardsTab.tsx` — earned codes + points history.
- **Modify** `src/pages/Loyalty/components/RewardsTab.tsx` — redeem catalog only.
- **Delete** `src/pages/Loyalty/components/HistoryTab.tsx` (absorbed by `MyRewardsTab`).
- **Create** `src/pages/Loyalty/components/BenefitsTab.tsx` — composed My-benefits tab.
- **Delete** `src/pages/Loyalty/components/OverviewTab.tsx` (absorbed by `BenefitsTab`).
- **Modify** `src/pages/Loyalty/components/TiersTab.tsx` — drop `tierProgress` prop (progress card moves up).
- **Create** `src/pages/Loyalty/components/FaqTab.tsx` — accordion.
- **Modify** `src/pages/Loyalty/index.tsx` — new tab set + legacy mapping, hero props, panel wiring.
- **Modify** `src/lib/lang/locales/en.json` — new keys; retire orphaned ones.
- **Modify** `src/pages/Loyalty/api.test.ts`, `index.test.tsx`, `index.mobile.test.tsx`.

---

## Task 1: Data layer — PrePointsGate, FAQ config, banner URL

**Files:**
- Modify: `src/index.d.ts` (loyalty block ~lines 68–77; globals area near `loyaltyRolloutConfig`)
- Modify: `src/pages/Loyalty/api.ts`
- Modify: `src/pages/Loyalty/components/TierProgressCard.tsx`
- Test: `src/pages/Loyalty/api.test.ts`

**Interfaces:**
- Consumes: existing `getLoyaltyConfig`, `requireConfig`, `isLoyaltyAvailable`, `LoyaltyError`, `RawTierProgress` (already has `TargetKind?: string` at api.ts:298).
- Produces (later tasks depend on these exact names):
  - `LoyaltyTierProgress` gains `targetKind: 'NextTier' | 'PrePointsGate'`
  - `export interface LoyaltyFaqItem { question: string; answer: string }`
  - `getFaqItems(): LoyaltyFaqItem[]`
  - `getFaqIntro(): string` (empty string when the theme sets none)
  - `getBannerUrl(): string`
  - `TierProgressCard` renders `null` unless `progress.targetKind === 'NextTier'`

- [ ] **Step 1: Write the failing tests**

In `src/pages/Loyalty/api.test.ts`, add `getBannerUrl`, `getFaqIntro`, `getFaqItems` to the `./api` import block (alphabetical), then append:

```ts
describe('fetchTierProgress target kinds', () => {
  const progressUrl =
    'https://ssw.example.com/customers/loyaltycustomersclient/GetDetailWithProgress';
  const withProgressSite = () => {
    window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, progressSite: 'StoreSupply' } };
  };

  it('maps a PrePointsGate payload, keeping the spend gate and summary', async () => {
    withProgressSite();
    server.use(
      http.get(progressUrl, () =>
        HttpResponse.json({
          Success: true,
          Result: {
            TierProgress: {
              CurrentTierName: 'Signature',
              TargetKind: 'PrePointsGate',
              TargetTierName: 'Signature',
              TargetOrdersRequired: 0,
              TargetAmountRequired: 5000,
              OrdersInWindow: 39,
              SpendInWindow: 2097.85,
              OrdersProgressPct: 0,
              SpendProgressPct: 41.96,
              Summary:
                "Spend $2902.15 more in the next 365-day window to start earning points on the 'Signature' tier.",
            },
          },
        }),
      ),
    );

    const result = await fetchTierProgress(264074);

    expect(result).toEqual({
      targetKind: 'PrePointsGate',
      currentTierName: 'Signature',
      targetTierName: 'Signature',
      ordersInWindow: 39,
      targetOrdersRequired: 0,
      spendInWindow: 2097.85,
      targetAmountRequired: 5000,
      ordersProgressPct: 0,
      spendProgressPct: 41.96,
      summary:
        "Spend $2902.15 more in the next 365-day window to start earning points on the 'Signature' tier.",
    });
  });

  it('still maps NextTier with its target kind', async () => {
    withProgressSite();
    server.use(
      http.get(progressUrl, () =>
        HttpResponse.json({
          Success: true,
          Result: { TierProgress: { TargetKind: 'NextTier', TargetTierName: 'Signature' } },
        }),
      ),
    );

    const result = await fetchTierProgress(264074);

    expect(result?.targetKind).toBe('NextTier');
    expect(result?.targetTierName).toBe('Signature');
  });

  it('returns null for AtTop', async () => {
    withProgressSite();
    server.use(
      http.get(progressUrl, () =>
        HttpResponse.json({ Success: true, Result: { TierProgress: { TargetKind: 'AtTop' } } }),
      ),
    );

    expect(await fetchTierProgress(264074)).toBeNull();
  });
});

describe('getBannerUrl', () => {
  it('defaults to the storefront-relative banner path', () => {
    window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };

    expect(getBannerUrl()).toBe('/content/images/loyalty/loyalty-account-banner.jpg');
  });

  it('prefers a non-blank theme override', () => {
    window.BC_CONTEXT = {
      loyalty: { shopKey, apiBase, appClientId, bannerUrl: 'https://cdn.example.com/hero.jpg' },
    };

    expect(getBannerUrl()).toBe('https://cdn.example.com/hero.jpg');
  });

  it('falls back to the default when the override is blank', () => {
    window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, bannerUrl: '   ' } };

    expect(getBannerUrl()).toBe('/content/images/loyalty/loyalty-account-banner.jpg');
  });
});

describe('getFaqItems and getFaqIntro', () => {
  it('returns an empty list and intro when the theme global is absent', () => {
    expect(getFaqItems()).toEqual([]);
    expect(getFaqIntro()).toBe('');
  });

  it('drops items missing a question or an answer', () => {
    window.loyaltyFaqConfig = {
      intro: 'Ask away.',
      items: [
        { question: 'How do I earn?', answer: 'Place orders.' },
        { question: 'No answer' },
        { answer: 'No question' },
        { question: '  ', answer: 'blank question' },
      ],
    };

    expect(getFaqItems()).toEqual([{ question: 'How do I earn?', answer: 'Place orders.' }]);
    expect(getFaqIntro()).toBe('Ask away.');
  });

  it('degrades an items-less config to an empty list', () => {
    window.loyaltyFaqConfig = {};

    expect(getFaqItems()).toEqual([]);
  });
});
```

Add `delete window.loyaltyFaqConfig;` to the file's existing `afterEach` cleanup block (next to `delete window.loyaltyRolloutConfig;`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/api.test.ts --run -t "target kinds|getBannerUrl|getFaqItems"`
Expected: FAIL — `getBannerUrl` / `getFaqIntro` / `getFaqItems` are not exported, and the PrePointsGate case returns `null`.

- [ ] **Step 3: Add the config types**

In `src/index.d.ts`, inside the `loyalty?: { … }` block (after the `progressSite` line):

```ts
        /** Theme override for the hero banner image; absent = the relative default. */
        bannerUrl?: string;
```

And next to the other theme globals (beside `loyaltyRolloutConfig`):

```ts
    /** Theme-set FAQ content; absent or empty = the FAQ tab is hidden. */
    loyaltyFaqConfig?: {
      intro?: string;
      items?: { question?: string; answer?: string }[];
    };
```

- [ ] **Step 4: Implement the api.ts changes**

(a) Add `bannerUrl?: string;` to the `LoyaltyConfig` interface (after `progressSite?: string;`).

(b) Add `targetKind` to `LoyaltyTierProgress` as its first field:

```ts
  targetKind: 'NextTier' | 'PrePointsGate';
```

(c) In `fetchTierProgress`, replace the NextTier-only guard and the mapped object's opening. Change:

```ts
  const progress = raw.Success === true ? raw.Result?.TierProgress : null;
  // Anything other than an explicit next-tier target means there is nothing to show.
  if (!progress || progress.TargetKind !== 'NextTier') {
    return null;
  }

  return {
    currentTierName: progress.CurrentTierName ?? '',
```

to:

```ts
  const progress = raw.Success === true ? raw.Result?.TierProgress : null;
  // Only these two kinds have something to show: NextTier drives the progress card,
  // PrePointsGate drives the hero's shopping nudge. AtTop (and anything unknown) = nothing.
  if (
    !progress ||
    (progress.TargetKind !== 'NextTier' && progress.TargetKind !== 'PrePointsGate')
  ) {
    return null;
  }

  return {
    targetKind: progress.TargetKind,
    currentTierName: progress.CurrentTierName ?? '',
```

(d) Append the three config readers at the end of the file:

```ts
// The portal runs in the storefront's top document, so a root-relative path resolves to
// the right host per environment (sandbox vs production) with no config and no host string.
const DEFAULT_BANNER_URL = '/content/images/loyalty/loyalty-account-banner.jpg';

export const getBannerUrl = (): string =>
  getLoyaltyConfig()?.bannerUrl?.trim() || DEFAULT_BANNER_URL;

export interface LoyaltyFaqItem {
  question: string;
  answer: string;
}

export const getFaqItems = (): LoyaltyFaqItem[] =>
  (window.loyaltyFaqConfig?.items ?? [])
    .map((item) => ({ question: item.question?.trim() ?? '', answer: item.answer?.trim() ?? '' }))
    // A half-filled entry would render an empty accordion row; drop it.
    .filter((item) => item.question !== '' && item.answer !== '');

export const getFaqIntro = (): string => window.loyaltyFaqConfig?.intro?.trim() ?? '';
```

- [ ] **Step 5: Keep the progress card NextTier-only**

`fetchTierProgress` now also returns `PrePointsGate`, whose quota numbers are not a
tier-progress story. Gate the card so no interim state renders it. In
`src/pages/Loyalty/components/TierProgressCard.tsx`, change:

```tsx
  if (!progress) {
    return null;
  }
```

to:

```tsx
  // PrePointsGate is surfaced by the hero (CTA + summary), not by this card.
  if (!progress || progress.targetKind !== 'NextTier') {
    return null;
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run`
Expected: all green. The existing `buildTierProgressWith` builder in `index.test.tsx` lacks
`targetKind`, so `tsc` will flag it — add `targetKind: 'NextTier' as const,` to that builder's
defaults (mechanical, preserves every existing test's intent).

- [ ] **Step 7: Gates**

Run: `yarn tsc --noEmit` → clean.
Run: `npx eslint src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts src/pages/Loyalty/components/TierProgressCard.tsx src/pages/Loyalty/index.test.tsx --max-warnings 0` → clean.
Run: `yarn lint:knip` → `getFaqItems`/`getFaqIntro`/`getBannerUrl` will be flagged as unused
until Tasks 2 and 5 consume them. Expected interim state; do not "fix" it. `src/utils/analytics.ts`
is pre-existing baseline.

- [ ] **Step 8: Commit**

```bash
git add src/index.d.ts src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts src/pages/Loyalty/components/TierProgressCard.tsx src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Add PrePointsGate, FAQ and banner config to the loyalty data layer" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: "Smart Rewards" hero banner

**Files:**
- Modify: `src/pages/Loyalty/components/LoyaltyHero.tsx`
- Modify: `src/pages/Loyalty/index.tsx` (Redux read + `LoyaltyHero` props only — tabs untouched)
- Modify: `src/lib/lang/locales/en.json`
- Test: `src/pages/Loyalty/index.test.tsx`, `src/pages/Loyalty/index.mobile.test.tsx`

**Interfaces:**
- Consumes from Task 1: `getBannerUrl()`, `LoyaltyTierProgress.targetKind`.
- Produces:
  ```ts
  interface LoyaltyHeroProps {
    firstName: string;
    companyName: string;
    memberSince: string | null;
    tierTitle: string | null;
    pointBalance: number | null;
    showEarnCta: boolean;
    gateSummary: string | null;
    bannerUrl: string;
  }
  ```

- [ ] **Step 1: Write the failing tests**

In `src/pages/Loyalty/index.test.tsx`, append:

```ts
it('greets the customer by first name in the Smart Rewards banner', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 1044 }));

  renderWithProviders(<Loyalty />, {
    preloadedState: {
      company: buildCompanyStateWith({
        customer: { id: 264074, firstName: 'Lisa' },
        companyInfo: { companyName: 'Riverside Hardware Co.' },
      }),
    },
  });

  expect(await screen.findByText('Smart Rewards')).toBeInTheDocument();
  expect(await screen.findByText('Welcome, Lisa')).toBeInTheDocument();
  expect(await screen.findByText('You have 1,044 points available.')).toBeInTheDocument();
});

it('falls back to the company name when the customer has no first name', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />, {
    preloadedState: {
      company: buildCompanyStateWith({
        customer: { id: 264074, firstName: '' },
        companyInfo: { companyName: 'Riverside Hardware Co.' },
      }),
    },
  });

  expect(await screen.findByText('Welcome, Riverside Hardware Co.')).toBeInTheDocument();
});

it('shows the shopping CTA and gate summary for a PrePointsGate customer', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockTierProgress(
    buildTierProgressWith({
      targetKind: 'PrePointsGate',
      summary: "Spend $2902.15 more in the next 365-day window to start earning points.",
    }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(
    await screen.findByRole('link', { name: 'Start shopping to earn points' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Spend $2902.15 more in the next 365-day window to start earning points.'),
  ).toBeInTheDocument();
});

it('shows no CTA for a customer who is already earning', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 1044 }));
  mockTierProgress(buildTierProgressWith({ targetKind: 'NextTier', summary: 'Two more orders.' }));

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('You have 1,044 points available.')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Start shopping to earn points' })).not.toBeInTheDocument();
});
```

`mockTierProgress` already sets `progressSite` and mocks the endpoint; extend its inline
`TierProgress` payload to send `TargetKind: progress.targetKind` instead of the hardcoded
`'NextTier'`, so the builder's `targetKind` reaches the component.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run -t "Smart Rewards|first name|PrePointsGate|already earning"`
Expected: FAIL — "Smart Rewards" / "Welcome, Lisa" / the CTA link are not in the DOM.

- [ ] **Step 3: Update the i18n copy**

In `src/lib/lang/locales/en.json`, replace the line

```json
  "loyalty.hero.welcome": "Welcome",
```

with

```json
  "loyalty.hero.brand": "Smart Rewards",
  "loyalty.hero.welcomeBack": "Welcome, {name}",
  "loyalty.hero.cta": "Start shopping to earn points",
```

and change

```json
  "loyalty.hero.points": "You have {points} points",
```

to

```json
  "loyalty.hero.points": "You have {points} points available.",
```

- [ ] **Step 4: Rewrite the hero**

Replace `src/pages/Loyalty/components/LoyaltyHero.tsx` in full:

```tsx
import { useState } from 'react';
import { WorkspacePremium } from '@mui/icons-material';
import { Box, Button, Chip, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import ShippingTracker from './ShippingTracker';

interface LoyaltyHeroProps {
  firstName: string;
  companyName: string;
  memberSince: string | null;
  tierTitle: string | null;
  pointBalance: number | null;
  showEarnCta: boolean;
  gateSummary: string | null;
  bannerUrl: string;
}

function LoyaltyHero({
  firstName,
  companyName,
  memberSince,
  tierTitle,
  pointBalance,
  showEarnCta,
  gateSummary,
  bannerUrl,
}: LoyaltyHeroProps) {
  const b3Lang = useB3Lang();
  // background-image cannot report load failures, so the photo is a real <img> we can hide.
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <>
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          borderRadius: 2,
          p: { xs: 3, sm: 4 },
          mb: 2,
        }}
      >
        {!imageFailed && (
          <Box
            component="img"
            src={bannerUrl}
            alt=""
            onError={() => setImageFailed(true)}
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              height: '100%',
              width: { xs: 0, md: '55%' },
              objectFit: 'cover',
              // Decorative: the gradient below keeps the copy legible over it.
              display: { xs: 'none', md: 'block' },
            }}
          />
        )}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: (theme) =>
              `linear-gradient(to right, ${theme.palette.primary.main} 45%, transparent 100%)`,
          }}
        />
        <Box sx={{ position: 'relative' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <WorkspacePremium />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {b3Lang('loyalty.hero.brand')}
              </Typography>
            </Box>
            {memberSince && (
              <Chip
                label={b3Lang('loyalty.hero.memberSince', { date: memberSince })}
                sx={{ bgcolor: 'common.black', color: 'common.white' }}
              />
            )}
          </Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
            {b3Lang('loyalty.hero.welcomeBack', { name: firstName || companyName })}
          </Typography>
          {showEarnCta && (
            <Button
              href={`${window.location.origin}/`}
              variant="outlined"
              sx={{
                mt: 2,
                borderRadius: 8,
                color: 'primary.contrastText',
                borderColor: 'primary.contrastText',
              }}
            >
              {b3Lang('loyalty.hero.cta')}
            </Button>
          )}
          {gateSummary && (
            <Typography variant="body2" sx={{ mt: 2, opacity: 0.9 }}>
              {gateSummary}
            </Typography>
          )}
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
          <ShippingTracker />
        </Box>
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

(A MUI `Button` with `href` renders an `<a>`, which is why the test queries `role: 'link'`.)

- [ ] **Step 5: Wire the page**

In `src/pages/Loyalty/index.tsx`:

(a) Add `getBannerUrl` to the `./api` import block (alphabetical — before `getLoyaltyDigest`).

(b) After the `companyName` selector (line 54) add:

```ts
  const firstName = useAppSelector(({ company }) => company.customer.firstName);
```

(c) Replace the `<LoyaltyHero … />` element (lines 182–187) with:

```tsx
        <LoyaltyHero
          firstName={firstName}
          companyName={companyName}
          memberSince={customer ? formatMemberSince(customer.createdAt) : null}
          tierTitle={displayTierTitle}
          pointBalance={customer ? customer.pointBalance : null}
          showEarnCta={tierProgress?.targetKind === 'PrePointsGate'}
          gateSummary={
            tierProgress?.targetKind === 'PrePointsGate' ? tierProgress.summary || null : null
          }
          bannerUrl={getBannerUrl()}
        />
```

- [ ] **Step 6: Update the copy assertions the new wording breaks**

The points line now ends in " available." Find every stale assertion:

```bash
grep -rn "You have .* points'" src/pages/Loyalty/index.test.tsx src/pages/Loyalty/index.mobile.test.tsx
```

There are 15. Append ` available.` inside each expected string (e.g.
`'You have 2,465 points'` → `'You have 2,465 points available.'`). Change nothing else about
those tests — this is a copy change, not an intent change.

- [ ] **Step 7: Run the suite + gates**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run` → all green.
Run: `yarn tsc --noEmit` → clean.
Run: `npx eslint src/pages/Loyalty/components/LoyaltyHero.tsx src/pages/Loyalty/index.tsx src/pages/Loyalty/index.test.tsx src/pages/Loyalty/index.mobile.test.tsx --max-warnings 0` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Loyalty/components/LoyaltyHero.tsx src/pages/Loyalty/index.tsx src/lib/lang/locales/en.json src/pages/Loyalty/index.test.tsx src/pages/Loyalty/index.mobile.test.tsx
git commit -m "feat: B2B-0000 Rebuild the loyalty hero as the Smart Rewards banner" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Split earned rewards out of the catalog into `MyRewardsTab`

**Files:**
- Create: `src/pages/Loyalty/components/MyRewardsTab.tsx`
- Modify: `src/pages/Loyalty/components/RewardsTab.tsx`
- Delete: `src/pages/Loyalty/components/HistoryTab.tsx`
- Modify: `src/pages/Loyalty/index.tsx`, `src/lib/lang/locales/en.json`
- Test: `src/pages/Loyalty/index.test.tsx`

**Interfaces:**
- Consumes: existing `fetchEarnedRewards`, `fetchPointsHistory`, `EarnedReward`, `PointActivity`, `LoyaltyIdentity`, `SectionHeader`.
- Produces: `MyRewardsTab` default export taking `{ identity: LoyaltyIdentity | undefined }`;
  `RewardsTab` keeps `{ identity, pointBalance, customerQueryKey }` but renders only the catalog.

**Interim wiring note:** the tab *values* do not change in this task. `redeem` renders the
slimmed `RewardsTab`; `history` renders the new `MyRewardsTab` (earned codes + history).
Task 4 renames the tabs.

- [ ] **Step 1: Write the failing tests**

In `src/pages/Loyalty/index.test.tsx`, append:

```ts
it('lists earned coupon codes and points history together, away from the catalog', async () => {
  const earned = buildEarnedRewardWith({ couponCode: 'SAVE-123', title: '$5 discount' });
  const activity = buildPointActivityWith({ customDescription: 'Order #1001', points: 50 });

  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 600 }));
  mockRedeemRules([buildRedeemRuleWith({ title: 'Free shipping', pointCost: 500 })]);
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({ items: [earned], nextToken: null }),
    ),
    http.get(`${launcherBase}/customer/points`, () =>
      HttpResponse.json({ items: [activity], nextToken: null }),
    ),
  );

  const { user } = renderWithProviders(<Loyalty />);

  // Catalog tab shows the redeemable rule but no longer the earned codes.
  await user.click(await screen.findByRole('tab', { name: 'Rewards' }));
  expect(await screen.findByText('Free shipping')).toBeInTheDocument();
  expect(screen.queryByText('SAVE-123')).not.toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: 'History' }));
  expect(await screen.findByText('SAVE-123')).toBeInTheDocument();
  expect(screen.getByText('Your earned rewards')).toBeInTheDocument();
  expect(screen.getByText('Order #1001')).toBeInTheDocument();
  expect(screen.getByText('+50')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run -t "away from the catalog"`
Expected: FAIL — `SAVE-123` still renders on the Rewards tab and is absent from History.

- [ ] **Step 3: Add the Get-rewards heading key**

In `src/lib/lang/locales/en.json`, replace

```json
  "loyalty.tabs.redeem": "Rewards",
```

with

```json
  "loyalty.tabs.getRewards": "Get rewards",
```

- [ ] **Step 4: Create `MyRewardsTab`**

Create `src/pages/Loyalty/components/MyRewardsTab.tsx`:

```tsx
import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { useInfiniteQuery } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';

import {
  EarnedReward,
  fetchEarnedRewards,
  fetchPointsHistory,
  LoyaltyIdentity,
  PointActivity,
} from '../api';

import SectionHeader from './SectionHeader';

interface MyRewardsTabProps {
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

function MyRewardsTab({ identity }: MyRewardsTabProps) {
  const b3Lang = useB3Lang();

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

  const historyQuery = useInfiniteQuery({
    queryKey: ['loyaltyHistory', identity?.customerId ?? ''],
    queryFn: ({ pageParam }) => {
      if (!identity) {
        return Promise.reject(new Error('identity not loaded'));
      }
      return fetchPointsHistory(identity, pageParam);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextToken || undefined,
    enabled: Boolean(identity),
  });
  const activities: PointActivity[] = historyQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const showEmptyHistory = historyQuery.isSuccess && activities.length === 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.myRewards')}</SectionHeader>
      {earnedRewards.length > 0 && (
        <Box sx={{ mb: 2 }}>
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
      <Typography variant="h6" sx={{ mb: 1 }}>
        {b3Lang('loyalty.tabs.history')}
      </Typography>
      {showEmptyHistory && <Typography>{b3Lang('loyalty.history.empty')}</Typography>}
      {activities.map((activity) => (
        <Card key={activity.id} variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="body2">
                {activity.customDescription || activity.action}
              </Typography>
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

export default MyRewardsTab;
```

Add the tab label it references to `en.json` now (Task 4 adds the rest):

```json
  "loyalty.tabs.myRewards": "My rewards",
```

- [ ] **Step 5: Slim down `RewardsTab`**

In `src/pages/Loyalty/components/RewardsTab.tsx`:

(a) Change the imports to drop the earned-rewards pieces — replace the `@tanstack/react-query`
import and the `../api` import block with:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
```

```tsx
import {
  fetchRedeemRules,
  isRedeemableCatalogRule,
  LoyaltyError,
  LoyaltyIdentity,
  redeemReward,
  RedeemRule,
} from '../api';
```

(b) Delete the whole `earnedQuery` block and the `earnedRewards` line (lines 72–87).

(c) Change the section heading (line 103) from `b3Lang('loyalty.tabs.redeem')` to
`b3Lang('loyalty.tabs.getRewards')`.

(d) Delete the entire `{earnedRewards.length > 0 && ( … )}` block (lines 135–162), leaving the
catalog `.map(...)` as the only child of the card-grid `Box`.

Everything else — the redeem mutation, its invalidations (including `['loyaltyRewards']`, which
keeps My rewards fresh), both dialogs, and `handleCopy` — stays exactly as is.

- [ ] **Step 6: Swap the page wiring and delete `HistoryTab`**

In `src/pages/Loyalty/index.tsx`: replace the `HistoryTab` import with

```ts
import MyRewardsTab from './components/MyRewardsTab';
```

and change the history panel from `{activeTab === 'history' && <HistoryTab identity={identity} />}`
to

```tsx
        {activeTab === 'history' && <MyRewardsTab identity={identity} />}
```

Then `git rm src/pages/Loyalty/components/HistoryTab.tsx`.

- [ ] **Step 7: Run the suite + gates**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run`
Expected: green. Two existing tests assert the old arrangement and must move with the feature:
`'lists previously earned coupon codes and loads more pages'` and
`'lists points history and loads more pages'` — change their tab click from
`{ name: 'Rewards' }` / their `?tab=history` entry to the **History** tab (both live there now),
keeping every assertion. No other test changes.
Run: `yarn tsc --noEmit` → clean.
Run: `npx eslint src/pages/Loyalty/components/MyRewardsTab.tsx src/pages/Loyalty/components/RewardsTab.tsx src/pages/Loyalty/index.tsx src/pages/Loyalty/index.test.tsx --max-warnings 0` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Loyalty/components/MyRewardsTab.tsx src/pages/Loyalty/components/RewardsTab.tsx src/pages/Loyalty/index.tsx src/lib/lang/locales/en.json src/pages/Loyalty/index.test.tsx
git rm src/pages/Loyalty/components/HistoryTab.tsx
git commit -m "feat: B2B-0000 Split earned loyalty rewards into a My rewards tab" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: `BenefitsTab` and the four-tab restructure

**Files:**
- Create: `src/pages/Loyalty/components/BenefitsTab.tsx`
- Delete: `src/pages/Loyalty/components/OverviewTab.tsx`
- Modify: `src/pages/Loyalty/components/TiersTab.tsx`, `src/pages/Loyalty/components/EarnPointsTab.tsx`
- Modify: `src/pages/Loyalty/index.tsx`, `src/lib/lang/locales/en.json`
- Test: `src/pages/Loyalty/index.test.tsx`, `src/pages/Loyalty/index.mobile.test.tsx`

**Interfaces:**
- Consumes: `TierProgressCard` (already NextTier-gated in Task 1), `EarnPointsTab`, `TiersTab`,
  `MembershipsTab`, `MyRewardsTab` (Task 3), `LoyaltyCustomer`, `LoyaltyTier`,
  `LoyaltyMembership`, `LoyaltyTierProgress`, `LoyaltyIdentity`.
- Produces:
  ```ts
  interface BenefitsTabProps {
    customer: LoyaltyCustomer | undefined;
    tiers: LoyaltyTier[];
    memberships: LoyaltyMembership[];
    tierProgress: LoyaltyTierProgress | null;
    identity: LoyaltyIdentity | undefined;
    customerQueryKey: (string | number)[];
  }
  ```
  `TiersTab` props become `{ tiers, currentTierId }`. Tab values become
  `'benefits' | 'get-rewards' | 'my-rewards' | 'faq'`.

- [ ] **Step 1: Write the failing tests**

In `src/pages/Loyalty/index.test.tsx`, append:

```ts
it('renders the four Smart Rewards tabs and defaults to My benefits', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByRole('tab', { name: 'My benefits', selected: true }),
  ).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Get rewards' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'My rewards' })).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Earn points' })).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Tiers' })).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'History' })).not.toBeInTheDocument();
});

it('shows membership status, tier benefits, earn rules and comparisons on My benefits', async () => {
  const select = buildTierWith({ id: 't1', title: 'Select', perks: ['5% credit'] });

  mockLoyaltyApis(
    buildLoyaltyCustomerWith({
      currentLoyaltyTierId: 't1',
      currentMembership: {
        id: 'm1',
        title: 'Signature Membership',
        perks: ['Account representative'],
      },
    }),
  );
  mockTiers([select]);
  mockMemberships([buildMembershipWith({ title: 'Signature Membership' })]);
  mockEarnRules([buildEarnRuleWith({ title: 'Place an order', earnValue: 3 })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Your Signature Membership benefits')).toBeInTheDocument();
  expect(screen.getByText('Dedicated account representative')).toBeInTheDocument();
  expect(await screen.findByText('Your Select benefits')).toBeInTheDocument();
  expect(screen.getByText('How you earn points')).toBeInTheDocument();
  expect(await screen.findByText('Place an order')).toBeInTheDocument();
});

it.each([
  ['overview', 'My benefits'],
  ['earn', 'My benefits'],
  ['tiers', 'My benefits'],
  ['memberships', 'My benefits'],
  ['redeem', 'Get rewards'],
  ['history', 'My rewards'],
  ['bogus', 'My benefits'],
])('maps the legacy ?tab=%s deep link to %s', async (legacy, expected) => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: `?tab=${legacy}` }] });

  expect(await screen.findByRole('tab', { name: expected, selected: true })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run -t "four Smart Rewards tabs|My benefits|legacy"`
Expected: FAIL — no tab named "My benefits" exists.

- [ ] **Step 3: Add the new i18n keys and retire the orphans**

In `src/lib/lang/locales/en.json`, delete these two now-unused lines (`loyalty.tabs.redeem`
was already retired in Task 3):

```json
  "loyalty.tabs.overview": "Your rewards",
  "loyalty.tabs.earn": "Earn points",
```

(`loyalty.tabs.tiers`, `loyalty.tabs.history` and `loyalty.tabs.memberships` stay — they are
section headings inside the new tabs.) Then add:

```json
  "loyalty.tabs.benefits": "My benefits",
  "loyalty.benefits.howYouEarn": "How you earn points",
```

- [ ] **Step 4: Create `BenefitsTab`**

Create `src/pages/Loyalty/components/BenefitsTab.tsx` (the two benefit boxes are moved
verbatim from `OverviewTab`):

```tsx
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import {
  LoyaltyCustomer,
  LoyaltyIdentity,
  LoyaltyMembership,
  LoyaltyTier,
  LoyaltyTierProgress,
} from '../api';

import EarnPointsTab from './EarnPointsTab';
import MembershipsTab from './MembershipsTab';
import SectionHeader from './SectionHeader';
import TierProgressCard from './TierProgressCard';
import TiersTab from './TiersTab';

interface BenefitsTabProps {
  customer: LoyaltyCustomer | undefined;
  tiers: LoyaltyTier[];
  memberships: LoyaltyMembership[];
  tierProgress: LoyaltyTierProgress | null;
  identity: LoyaltyIdentity | undefined;
  customerQueryKey: (string | number)[];
}

const benefitsBoxSx = {
  bgcolor: 'primary.main',
  color: 'primary.contrastText',
  borderRadius: 2,
  p: { xs: 3, sm: 4 },
  display: 'flex',
  flexWrap: 'wrap',
  gap: 2,
} as const;

const benefitsTitleSx = { fontWeight: 800, textTransform: 'uppercase', flex: '1 1 40%' } as const;

function BenefitsTab({
  customer,
  tiers,
  memberships,
  tierProgress,
  identity,
  customerQueryKey,
}: BenefitsTabProps) {
  const b3Lang = useB3Lang();
  const currentTier = tiers.find((tier) => tier.id === customer?.currentLoyaltyTierId);
  const membership = customer?.currentMembership;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.benefits')}</SectionHeader>
      {membership && membership.perks.length > 0 && (
        <Box sx={benefitsBoxSx}>
          <Typography variant="h6" sx={benefitsTitleSx}>
            {b3Lang('loyalty.overview.membershipBenefitsTitle', { membership: membership.title })}
          </Typography>
          <Box sx={{ flex: '1 1 50%' }}>
            {membership.perks.map((perk) => (
              <Typography key={perk} variant="body2" sx={{ mb: 0.5 }}>
                {perk}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
      {currentTier && (
        <Box sx={benefitsBoxSx}>
          <Typography variant="h6" sx={benefitsTitleSx}>
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
      <TierProgressCard progress={tierProgress} />
      <EarnPointsTab
        identity={identity}
        customer={customer}
        customerQueryKey={customerQueryKey}
      />
      <TiersTab tiers={tiers} currentTierId={customer?.currentLoyaltyTierId ?? null} />
      {memberships.length > 0 && <MembershipsTab memberships={memberships} />}
    </Box>
  );
}

export default BenefitsTab;
```

- [ ] **Step 5: Retitle the earn section and drop `TiersTab`'s progress prop**

In `src/pages/Loyalty/components/EarnPointsTab.tsx`, change the section heading from
`b3Lang('loyalty.tabs.earn')` to `b3Lang('loyalty.benefits.howYouEarn')`.

In `src/pages/Loyalty/components/TiersTab.tsx`, remove the progress card (it now renders above,
once, from `BenefitsTab`) — replace the props interface, signature and the card line:

```tsx
interface TiersTabProps {
  tiers: LoyaltyTier[];
  currentTierId: string | null;
}

function TiersTab({ tiers, currentTierId }: TiersTabProps) {
```

Delete the `<TierProgressCard progress={tierProgress} />` line and the now-unused
`TierProgressCard` and `LoyaltyTierProgress` imports.

- [ ] **Step 6: Restructure the tabs in `index.tsx`**

(a) Replace the icons import (lines 2–9) — the mock's tabs are text-only — with nothing, and
delete `FavoriteBorder`, `StarBorder`, `CardGiftcard`, `Layers`, `CardMembership`, `Schedule`
usages in the `<Tab>` elements (drop each `icon=` and `iconPosition=` prop).

(b) Replace the `OverviewTab`/`EarnPointsTab`/`TiersTab`/`MembershipsTab` imports with:

```ts
import BenefitsTab from './components/BenefitsTab';
```

(`EarnPointsTab`, `TiersTab` and `MembershipsTab` are now rendered by `BenefitsTab`, not by the
page.)

(c) Replace the tab constants (lines 37–41):

```ts
const LOYALTY_TABS = ['benefits', 'get-rewards', 'my-rewards', 'faq'] as const;
type LoyaltyTab = (typeof LOYALTY_TABS)[number];

// Old bookmarks keep working: every retired tab value maps onto its new home.
const LEGACY_TABS: Record<string, LoyaltyTab> = {
  overview: 'benefits',
  earn: 'benefits',
  tiers: 'benefits',
  memberships: 'benefits',
  redeem: 'get-rewards',
  history: 'my-rewards',
};

const toLoyaltyTab = (value: string | null): LoyaltyTab => {
  if (LOYALTY_TABS.includes(value as LoyaltyTab)) {
    return value as LoyaltyTab;
  }
  return LEGACY_TABS[value ?? ''] ?? 'benefits';
};
```

(d) Replace the `hasMemberships`/`activeTab` lines (166–167) with:

```ts
  // The FAQ tab arrives in the next task; until then no tab can be conditionally absent.
  const activeTab = tab === 'faq' ? 'benefits' : tab;
```

(e) Replace the `<Tab>` list with four text-only tabs:

```tsx
          <Tab value="benefits" label={b3Lang('loyalty.tabs.benefits')} />
          <Tab value="get-rewards" label={b3Lang('loyalty.tabs.getRewards')} />
          <Tab value="my-rewards" label={b3Lang('loyalty.tabs.myRewards')} />
```

(f) Replace the whole panel block with:

```tsx
        {activeTab === 'benefits' && (
          <BenefitsTab
            customer={customer}
            tiers={tiers}
            memberships={memberships}
            tierProgress={tierProgress}
            identity={identity}
            customerQueryKey={['loyaltyCustomer', customerId]}
          />
        )}
        {activeTab === 'get-rewards' && (
          <RewardsTab
            identity={identity}
            pointBalance={customer?.pointBalance ?? 0}
            customerQueryKey={['loyaltyCustomer', customerId]}
          />
        )}
        {activeTab === 'my-rewards' && <MyRewardsTab identity={identity} />}
```

(g) `git rm src/pages/Loyalty/components/OverviewTab.tsx`.

- [ ] **Step 7: Update the existing tab-name assertions**

Every test that clicks or asserts a tab must use the new names. Find them:

```bash
grep -n "name: 'Your rewards'\|name: 'Earn points'\|name: 'Rewards'\|name: 'Tiers'\|name: 'History'\|name: 'Memberships'\|tab=" src/pages/Loyalty/index.test.tsx src/pages/Loyalty/index.mobile.test.tsx
```

This sweep includes the test added in Task 3
(`'lists earned coupon codes and points history together, away from the catalog'`) — its
`'Rewards'` and `'History'` clicks become `'Get rewards'` and `'My rewards'` like every other.

Apply this mapping, preserving each test's assertions:

| Old selector / param | New |
|---|---|
| `{ name: 'Your rewards' }` | `{ name: 'My benefits' }` |
| `{ name: 'Earn points' }` | `{ name: 'My benefits' }` (content is a section there; drop the click if already on it) |
| `{ name: 'Rewards' }` | `{ name: 'Get rewards' }` |
| `{ name: 'Tiers' }` | `{ name: 'My benefits' }` (drop the click if already on it) |
| `{ name: 'Memberships' }` | `{ name: 'My benefits' }` (drop the click if already on it) |
| `{ name: 'History' }` | `{ name: 'My rewards' }` |
| `?tab=history` | `?tab=my-rewards` |
| `?tab=memberships` | `?tab=benefits` |
| `?tab=bogus` | keep — still falls back (now to `My benefits`) |

Delete tests whose subject no longer exists as a behavior: the Memberships-tab
show/hide pair (`'shows the Memberships tab and lists membership cards…'`,
`'hides the Memberships tab when the store has no memberships'`) and
`'falls back to Your rewards when ?tab=memberships but the store has none'` — memberships are now
a section of My benefits, covered by the new Step 1 test. Replace them with one test asserting the
section is absent when the store has no memberships:

```ts
it('omits the memberships section when the store has none', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships([]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByRole('tab', { name: 'My benefits' })).toBeInTheDocument();
  expect(screen.queryByText('Memberships')).not.toBeInTheDocument();
});
```

In `index.mobile.test.tsx`, update its two tab assertions to `'My benefits'` and `'My rewards'`.

- [ ] **Step 8: Run the suite + gates**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run` → all green.
Run: `yarn tsc --noEmit` → clean.
Run: `npx eslint src/pages/Loyalty/components/BenefitsTab.tsx src/pages/Loyalty/components/TiersTab.tsx src/pages/Loyalty/components/EarnPointsTab.tsx src/pages/Loyalty/index.tsx src/pages/Loyalty/index.test.tsx src/pages/Loyalty/index.mobile.test.tsx --max-warnings 0` → clean.
Run: `yarn lint:knip` → only `getFaqItems`/`getFaqIntro` (Task 5) plus the `analytics.ts` baseline.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Loyalty/components/BenefitsTab.tsx src/pages/Loyalty/components/TiersTab.tsx src/pages/Loyalty/components/EarnPointsTab.tsx src/pages/Loyalty/index.tsx src/lib/lang/locales/en.json src/pages/Loyalty/index.test.tsx src/pages/Loyalty/index.mobile.test.tsx
git rm src/pages/Loyalty/components/OverviewTab.tsx
git commit -m "feat: B2B-0000 Fold the loyalty page into four Smart Rewards tabs" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Theme-fed FAQ tab

**Files:**
- Create: `src/pages/Loyalty/components/FaqTab.tsx`
- Modify: `src/pages/Loyalty/index.tsx`, `src/lib/lang/locales/en.json`
- Test: `src/pages/Loyalty/index.test.tsx`

**Interfaces:**
- Consumes from Task 1: `getFaqItems(): LoyaltyFaqItem[]`, `getFaqIntro(): string`,
  `LoyaltyFaqItem { question: string; answer: string }`.
- Produces: `FaqTab` default export taking `{ items: LoyaltyFaqItem[]; intro: string }`.

- [ ] **Step 1: Write the failing tests**

In `src/pages/Loyalty/index.test.tsx`, append (and add `delete window.loyaltyFaqConfig;` to the
file's `afterEach`):

```ts
it('hides the FAQ tab when the theme ships no FAQ content', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByRole('tab', { name: 'My benefits' })).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'FAQ' })).not.toBeInTheDocument();
});

it('renders theme-provided FAQ questions and answers', async () => {
  window.loyaltyFaqConfig = {
    intro: 'Ask away.',
    items: [{ question: 'How do I earn points?', answer: 'Place an order.' }],
  };
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'FAQ' }));

  expect(await screen.findByText('Ask away.')).toBeInTheDocument();
  expect(screen.getByText('How do I earn points?')).toBeInTheDocument();
  expect(screen.getByText('Place an order.')).toBeInTheDocument();
});

it('uses the default FAQ intro when the theme supplies none', async () => {
  window.loyaltyFaqConfig = { items: [{ question: 'Q?', answer: 'A.' }] };
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'FAQ' }));

  expect(
    await screen.findByText(
      "Got questions? Here's what our customers ask most about Smart Rewards.",
    ),
  ).toBeInTheDocument();
});

it('falls back to My benefits for ?tab=faq with no FAQ content', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=faq' }] });

  expect(
    await screen.findByRole('tab', { name: 'My benefits', selected: true }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run -t FAQ`
Expected: FAIL — no tab named "FAQ" is ever rendered.

- [ ] **Step 3: Add the i18n keys**

In `src/lib/lang/locales/en.json`, after the `loyalty.tabs.myRewards` line:

```json
  "loyalty.tabs.faq": "FAQ",
  "loyalty.faq.intro": "Got questions? Here's what our customers ask most about Smart Rewards.",
```

- [ ] **Step 4: Create `FaqTab`**

Create `src/pages/Loyalty/components/FaqTab.tsx`:

```tsx
import { ExpandMore } from '@mui/icons-material';
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyFaqItem } from '../api';

import SectionHeader from './SectionHeader';

interface FaqTabProps {
  items: LoyaltyFaqItem[];
  intro: string;
}

function FaqTab({ items, intro }: FaqTabProps) {
  const b3Lang = useB3Lang();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.faq')}</SectionHeader>
      <Typography sx={{ textAlign: 'center', color: 'text.secondary' }}>
        {intro || b3Lang('loyalty.faq.intro')}
      </Typography>
      <Box>
        {items.map((item) => (
          <Accordion key={item.question} disableGutters>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography sx={{ fontWeight: 700 }}>{item.question}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary">
                {item.answer}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    </Box>
  );
}

export default FaqTab;
```

- [ ] **Step 5: Wire the FAQ tab**

In `src/pages/Loyalty/index.tsx`:

(a) Add `import FaqTab from './components/FaqTab';` beside the other component imports, and add
`getFaqIntro`, `getFaqItems` to the `./api` import block (alphabetical).

(b) Replace the Task 4 placeholder `activeTab` line with:

```ts
  const faqItems = getFaqItems();
  const hasFaq = faqItems.length > 0;
  const activeTab = tab === 'faq' && !hasFaq ? 'benefits' : tab;
```

(c) After the `my-rewards` `<Tab>`, add:

```tsx
          {hasFaq && <Tab value="faq" label={b3Lang('loyalty.tabs.faq')} />}
```

(d) After the `my-rewards` panel, add:

```tsx
        {activeTab === 'faq' && <FaqTab items={faqItems} intro={getFaqIntro()} />}
```

- [ ] **Step 6: Run the suite + gates**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run` → all green.
Run: `yarn tsc --noEmit` → clean.
Run: `npx eslint src/pages/Loyalty/components/FaqTab.tsx src/pages/Loyalty/index.tsx src/pages/Loyalty/index.test.tsx --max-warnings 0` → clean.
Run: `yarn lint:knip` → down to the pre-existing `src/utils/analytics.ts` baseline only (every
Task 1 export is now consumed).

- [ ] **Step 7: Commit**

```bash
git add src/pages/Loyalty/components/FaqTab.tsx src/pages/Loyalty/index.tsx src/lib/lang/locales/en.json src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Add the theme-fed loyalty FAQ tab" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Verification (whole feature)

- `CIRCLECI=true yarn test src/pages/Loyalty/ --run` green; `yarn tsc --noEmit` clean; scoped
  eslint clean; `yarn lint:knip` at the `analytics.ts` baseline.
- `yarn build` succeeds (the `tsc --noEmit` prebuild hook plus the Vite bundle).
- Manual (sandbox): the banner shows the Smart Rewards brand row, the first-name greeting and the
  photo; a PrePointsGate account (e.g. customer `264074`) shows the CTA and the "Spend $2,902.15
  more…" line while an already-earning account shows neither; four tabs render; My benefits shows
  membership status, tier benefits, earn rules and both comparison lists; codes redeemed under Get
  rewards appear under My rewards; FAQ appears only once the theme ships `loyaltyFaqConfig`.

## Notes / out of scope

- The banner is storefront-hosted and never bundled — resolution order is theme
  `BC_CONTEXT.loyalty.bannerUrl` → `/content/images/loyalty/loyalty-account-banner.jpg` →
  gradient-only on load failure. The hosted file is served with `cache-control: max-age=10`, so
  overwriting it over WebDAV goes live in ~10s; longer caching is a hosting-side header change,
  not a portal change.
- `GetDetailWithProgress` remains unauthenticated by explicit prior decision (see the tier-progress
  spec's accepted risk); this plan changes nothing about that.
- Membership enroll/join is still blocked on the SSW Platform-API proxy.
- `InfluenceCheck`, `RecentTransactions`, `Ledger` and `PendingPoints` stay unused.
- `index.platform.test.tsx` needs no change (it asserts no tab names).
