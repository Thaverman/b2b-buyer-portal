# Loyalty SSW Dual-Quota Tier Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace both Influence-threshold progress boxes on the Loyalty page with a dual-quota (orders + spend) progress card fed by the SSW `GetDetailWithProgress` endpoint, and make the hero display the SSW tier name.

**Architecture:** One new fetcher (`fetchTierProgress`) in the Loyalty service layer calls the SSW backend (same `apiBase` host as the digest endpoint, PascalCase envelope) and returns a mapped `LoyaltyTierProgress | null`. One page-level `useQuery` feeds a new shared `TierProgressCard` component rendered by both OverviewTab and TiersTab, replacing the old `findNextTier`-based boxes (which are deleted along with `tierProgress.ts` and `parseThreshold`). The hero's display title prefers the SSW `currentTierName`; the tier-allowlist gate keeps using the Influence-derived title unchanged.

**Tech Stack:** React 18, `@tanstack/react-query`, MUI, MSW + Vitest + Testing Library, builder/faker factories. All commands run from `apps/storefront/`.

## Global Constraints

- Run every command from `apps/storefront/`.
- Spec: `docs/superpowers/specs/2026-07-20-loyalty-ssw-tier-progress-design.md`.
- The **allowlist gate keeps matching on the Influence-derived `tierTitle`** — `isTierAllowed(tierTitle, allowedTiers)` in `index.tsx` must NOT be re-pointed at SSW data.
- `tierProgressQuery` joins neither the page error aggregation nor the gate verdict (fail-quiet).
- Endpoint query params exactly: `site` (from new `BC_CONTEXT.loyalty.progressSite`), `bigCommerceStoreId` (from `window.B3.setting.store_hash`), `bigCommerceCustomerId`, `recentTransactionsTake=0`.
- `fetchTierProgress` returns `null` (not an error) for `Success !== true`, missing/null `TierProgress`, or `TargetKind !== 'NextTier'`.
- Money via `currencyFormat` from `@/utils/b3CurrencyFormat` (ShippingTracker precedent).
- New i18n keys in `en.json` only: `loyalty.progress.orders` = "Orders", `loyalty.progress.spend` = "Spend". Reuse existing `loyalty.tiers.progressTo` for the header.
- Tests: builders only; test utils from `tests/test-utils`; in page tests avoid `getByRole('progressbar')` for the new card (B3Spin spinner + multiple bars collide) — assert on text instead.
- Existing tests may be modified ONLY where they assert the removed old box (spec §5 lists the three spots); everything else untouched.
- Commit format `type: B2B-0000 Subject` + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Test-environment fixtures: `window.B3.setting.store_hash` is `'store-hash'` (set in `tests/setup-test-environment.ts`); loyalty tests use `apiBase = 'https://ssw.example.com/customers'`.

---

## File Structure

- **Modify** `src/index.d.ts` — add optional `progressSite` to `BC_CONTEXT.loyalty`.
- **Modify** `src/pages/Loyalty/api.ts` — add `LoyaltyTierProgress`, `isTierProgressAvailable`, `fetchTierProgress`; (Task 2) remove `parseThreshold`.
- **Modify** `src/pages/Loyalty/api.test.ts` — new describes; (Task 2) delete `parseThreshold` table.
- **Create** `src/pages/Loyalty/components/TierProgressCard.tsx` — shared dual-quota card.
- **Modify** `src/pages/Loyalty/components/OverviewTab.tsx`, `.../TiersTab.tsx` — swap old box for the card.
- **Modify** `src/pages/Loyalty/index.tsx` — query, hero display title, props.
- **Modify** `src/lib/lang/locales/en.json` — two keys.
- **Delete** `src/pages/Loyalty/tierProgress.ts`.
- **Modify** `src/pages/Loyalty/index.test.tsx` — new tests + three old-box assertion updates.

---

## Task 1: `fetchTierProgress` service layer

**Files:**
- Modify: `src/index.d.ts` (loyalty block, lines 68–76)
- Modify: `src/pages/Loyalty/api.ts`
- Test: `src/pages/Loyalty/api.test.ts`

**Interfaces:**
- Consumes: existing `requireConfig`, `getLoyaltyConfig`, `isLoyaltyAvailable`, `LoyaltyError` in `api.ts`; `window.B3.setting.store_hash`.
- Produces (Task 2 relies on these exact names):
  - `interface LoyaltyTierProgress { currentTierName: string; targetTierName: string; ordersInWindow: number; targetOrdersRequired: number; spendInWindow: number; targetAmountRequired: number; ordersProgressPct: number; spendProgressPct: number; summary: string; }`
  - `isTierProgressAvailable(): boolean`
  - `fetchTierProgress(customerId: string | number): Promise<LoyaltyTierProgress | null>`

- [ ] **Step 1: Write the failing tests**

In `src/pages/Loyalty/api.test.ts`, add `fetchTierProgress`, `isTierProgressAvailable`, and `LoyaltyTierProgress` to the import block from `./api` (alphabetical), then append:

```ts
const progressUrl = 'https://ssw.example.com/customers/loyaltycustomersclient/GetDetailWithProgress';

const withProgressSite = () => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, progressSite: 'StoreSupply' } };
};

describe('isTierProgressAvailable', () => {
  it('is false when progressSite is not configured', () => {
    expect(isTierProgressAvailable()).toBe(false);
  });

  it('is true when the loyalty config includes progressSite', () => {
    withProgressSite();

    expect(isTierProgressAvailable()).toBe(true);
  });
});

describe('fetchTierProgress', () => {
  it('sends site, store hash, customer id and take=0, and maps the PascalCase payload', async () => {
    withProgressSite();
    server.use(
      http.get(progressUrl, ({ request }) => {
        assertQueryParams(request, {
          site: 'StoreSupply',
          bigCommerceStoreId: 'store-hash',
          bigCommerceCustomerId: '264074',
          recentTransactionsTake: '0',
        });

        return HttpResponse.json({
          Success: true,
          Result: {
            TierProgress: {
              CurrentTierName: 'Select',
              TargetKind: 'NextTier',
              TargetTierName: 'Signature',
              OrdersInWindow: 39,
              TargetOrdersRequired: 75,
              SpendInWindow: 2097.85,
              TargetAmountRequired: 5000,
              OrdersProgressPct: 52,
              SpendProgressPct: 41.96,
              Summary: "36 more order(s) OR $2902.15 more spend away from 'Signature'.",
            },
          },
        });
      }),
    );

    const result = await fetchTierProgress(264074);

    expect(result).toEqual({
      currentTierName: 'Select',
      targetTierName: 'Signature',
      ordersInWindow: 39,
      targetOrdersRequired: 75,
      spendInWindow: 2097.85,
      targetAmountRequired: 5000,
      ordersProgressPct: 52,
      spendProgressPct: 41.96,
      summary: "36 more order(s) OR $2902.15 more spend away from 'Signature'.",
    });
  });

  it.each([
    ['Success false', { Success: false, Result: { TierProgress: { TargetKind: 'NextTier' } } }],
    ['TierProgress null', { Success: true, Result: { TierProgress: null } }],
    ['Result missing', { Success: true }],
    ['top tier (TargetKind not NextTier)', { Success: true, Result: { TierProgress: { TargetKind: 'AtTop' } } }],
  ])('returns null for %s', async (_label, payload) => {
    withProgressSite();
    server.use(http.get(progressUrl, () => HttpResponse.json(payload)));

    expect(await fetchTierProgress(264074)).toBeNull();
  });

  it.each([
    [429, 'rateLimited'],
    [500, 'upstream'],
  ])('maps status %i to %s', async (status, kind) => {
    withProgressSite();
    server.use(http.get(progressUrl, () => HttpResponse.json({}, { status })));

    const error = await fetchTierProgress(264074).catch((e) => e);

    expect(error).toBeInstanceOf(LoyaltyError);
    expect(error.kind).toBe(kind);
  });

  it('maps a network failure to upstream', async () => {
    withProgressSite();
    server.use(http.get(progressUrl, () => HttpResponse.error()));

    const error = await fetchTierProgress(264074).catch((e) => e);

    expect(error).toBeInstanceOf(LoyaltyError);
    expect(error.kind).toBe('upstream');
  });
});
```

(The file's existing `afterEach` already deletes `window.BC_CONTEXT`, so `withProgressSite` needs no extra cleanup.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/api.test.ts --run -t "TierProgress|isTierProgressAvailable"`
Expected: FAIL — `fetchTierProgress` / `isTierProgressAvailable` not exported.

- [ ] **Step 3: Add the config type**

In `src/index.d.ts`, inside the `loyalty?: { … }` block (after the `appClientId` line, line 75):

```ts
        /** SSW site key for GetDetailWithProgress (e.g. "StoreSupply"); absent = tier progress off. */
        progressSite?: string;
```

- [ ] **Step 4: Write the minimal implementation**

In `src/pages/Loyalty/api.ts`:

(a) Add to the `LoyaltyConfig` interface (line 7–11):

```ts
  progressSite?: string;
```

(`getLoyaltyConfig` is unchanged — `progressSite` is optional and not part of the presence check.)

(b) After `isLoyaltyAvailable` (line 25), add:

```ts
export const isTierProgressAvailable = (): boolean =>
  isLoyaltyAvailable() && Boolean(getLoyaltyConfig()?.progressSite);
```

(c) After the `fetchMemberships` block, add:

```ts
export interface LoyaltyTierProgress {
  currentTierName: string;
  targetTierName: string;
  ordersInWindow: number;
  targetOrdersRequired: number;
  spendInWindow: number;
  targetAmountRequired: number;
  ordersProgressPct: number;
  spendProgressPct: number;
  summary: string;
}

// PascalCase: SSW backend (.NET/Newtonsoft), same serializer as the digest endpoint.
interface RawTierProgress {
  CurrentTierName?: string;
  TargetKind?: string;
  TargetTierName?: string;
  OrdersInWindow?: number;
  TargetOrdersRequired?: number;
  SpendInWindow?: number;
  TargetAmountRequired?: number;
  OrdersProgressPct?: number;
  SpendProgressPct?: number;
  Summary?: string;
}

export const fetchTierProgress = async (
  customerId: string | number,
): Promise<LoyaltyTierProgress | null> => {
  const config = requireConfig();
  if (!config.progressSite) {
    throw new Error('Loyalty tier progress is not configured on this store');
  }
  const params = new URLSearchParams({
    site: config.progressSite,
    bigCommerceStoreId: window.B3.setting.store_hash,
    bigCommerceCustomerId: String(customerId),
    recentTransactionsTake: '0',
  });

  let response: Response;
  try {
    response = await fetch(
      `${config.apiBase}/loyaltycustomersclient/GetDetailWithProgress?${params}`,
    );
  } catch {
    throw new LoyaltyError('upstream');
  }
  if (!response.ok) {
    if (response.status === 429) {
      throw new LoyaltyError('rateLimited');
    }
    throw new LoyaltyError('upstream');
  }

  const raw = (await response.json()) as {
    Success?: boolean;
    Result?: { TierProgress?: RawTierProgress | null };
  };
  const progress = raw.Success === true ? raw.Result?.TierProgress : null;
  // Anything other than an explicit next-tier target means there is nothing to show.
  if (!progress || progress.TargetKind !== 'NextTier') {
    return null;
  }

  return {
    currentTierName: progress.CurrentTierName ?? '',
    targetTierName: progress.TargetTierName ?? '',
    ordersInWindow: progress.OrdersInWindow ?? 0,
    targetOrdersRequired: progress.TargetOrdersRequired ?? 0,
    spendInWindow: progress.SpendInWindow ?? 0,
    targetAmountRequired: progress.TargetAmountRequired ?? 0,
    ordersProgressPct: progress.OrdersProgressPct ?? 0,
    spendProgressPct: progress.SpendProgressPct ?? 0,
    summary: progress.Summary ?? '',
  };
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/api.test.ts --run`
Expected: PASS (all — new describes plus every existing test untouched).

- [ ] **Step 6: Type-check + scoped lint**

Run: `yarn tsc --noEmit` → clean.
Run: `npx eslint src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts --max-warnings 0` → clean.
NOTE: `yarn lint:knip` WILL flag the three new exports as unused until Task 2 consumes them — expected interim state (same as prior loyalty tasks); do not "fix" it.

- [ ] **Step 7: Commit**

```bash
git add src/index.d.ts src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts
git commit -m "feat: B2B-0000 Add SSW tier-progress fetcher to the loyalty service" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: TierProgressCard + UI swap + cleanup

**Files:**
- Create: `src/pages/Loyalty/components/TierProgressCard.tsx`
- Modify: `src/pages/Loyalty/components/OverviewTab.tsx`, `src/pages/Loyalty/components/TiersTab.tsx`, `src/pages/Loyalty/index.tsx`, `src/lib/lang/locales/en.json`
- Delete: `src/pages/Loyalty/tierProgress.ts`
- Modify: `src/pages/Loyalty/api.ts` (remove `parseThreshold`), `src/pages/Loyalty/api.test.ts` (remove its table), `src/pages/Loyalty/index.test.tsx`

**Interfaces:**
- Consumes from Task 1: `LoyaltyTierProgress`, `isTierProgressAvailable()`, `fetchTierProgress(customerId)`.
- Produces: `TierProgressCard` default export taking `{ progress: LoyaltyTierProgress | null }` (renders `null` when no progress); `OverviewTab` props gain `tierProgress: LoyaltyTierProgress | null`; `TiersTab` props become `{ tiers, currentTierId, tierProgress }` (drops `currentTierProgress`).

- [ ] **Step 1: Write the failing page tests**

In `src/pages/Loyalty/index.test.tsx`:

(a) Add `LoyaltyTierProgress` to the `./api` import.

(b) Next to the other builders/mocks, add:

```ts
const buildTierProgressWith = builder<LoyaltyTierProgress>(() => ({
  currentTierName: faker.commerce.productAdjective(),
  targetTierName: faker.commerce.productAdjective(),
  ordersInWindow: faker.number.int({ min: 0, max: 50 }),
  targetOrdersRequired: faker.number.int({ min: 51, max: 100 }),
  spendInWindow: faker.number.float({ min: 0, max: 999, fractionDigits: 2 }),
  targetAmountRequired: faker.number.int({ min: 1000, max: 9999 }),
  ordersProgressPct: faker.number.int({ min: 0, max: 99 }),
  spendProgressPct: faker.number.int({ min: 0, max: 99 }),
  summary: faker.company.catchPhrase(),
}));

const progressUrl = `${apiBase}/loyaltycustomersclient/GetDetailWithProgress`;

// Sets the progressSite config AND the endpoint mock; callers must also pass a
// preloadedState customer id so the query's enabled gate opens.
const mockTierProgress = (progress: LoyaltyTierProgress) => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, progressSite: 'StoreSupply' } };
  server.use(
    http.get(progressUrl, () =>
      HttpResponse.json({
        Success: true,
        Result: {
          TierProgress: {
            CurrentTierName: progress.currentTierName,
            TargetKind: 'NextTier',
            TargetTierName: progress.targetTierName,
            OrdersInWindow: progress.ordersInWindow,
            TargetOrdersRequired: progress.targetOrdersRequired,
            SpendInWindow: progress.spendInWindow,
            TargetAmountRequired: progress.targetAmountRequired,
            OrdersProgressPct: progress.ordersProgressPct,
            SpendProgressPct: progress.spendProgressPct,
            Summary: progress.summary,
          },
        },
      }),
    ),
  );
};

const customerPreloadedState = {
  preloadedState: { company: buildCompanyStateWith({ customer: { id: 264074 } }) },
};
```

(c) Append these tests:

```ts
it('shows dual-quota tier progress on the Your rewards tab', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockTierProgress(
    buildTierProgressWith({
      targetTierName: 'Signature',
      ordersInWindow: 39,
      targetOrdersRequired: 75,
      spendInWindow: 130.85,
      targetAmountRequired: 300,
      summary: "36 more order(s) OR $169.15 more spend away from 'Signature'.",
    }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('Progress to Signature')).toBeInTheDocument();
  expect(screen.getByText('Orders')).toBeInTheDocument();
  expect(screen.getByText('39 / 75')).toBeInTheDocument();
  expect(screen.getByText('Spend')).toBeInTheDocument();
  expect(screen.getByText('$130.85 / $300.00')).toBeInTheDocument();
  expect(
    screen.getByText("36 more order(s) OR $169.15 more spend away from 'Signature'."),
  ).toBeInTheDocument();
});

it('shows the same tier progress card on the Tiers tab', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockTierProgress(
    buildTierProgressWith({ targetTierName: 'Signature', ordersInWindow: 39, targetOrdersRequired: 75 }),
  );

  const { user } = renderWithProviders(<Loyalty />, customerPreloadedState);

  await user.click(await screen.findByRole('tab', { name: 'Tiers' }));

  expect(await screen.findByText('Progress to Signature')).toBeInTheDocument();
  expect(screen.getByText('39 / 75')).toBeInTheDocument();
});

it('omits the orders row when only a spend quota is configured', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockTierProgress(
    buildTierProgressWith({ targetOrdersRequired: 0, spendInWindow: 130.85, targetAmountRequired: 300 }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('$130.85 / $300.00')).toBeInTheDocument();
  expect(screen.queryByText('Orders')).not.toBeInTheDocument();
});

it('omits the spend row when only an orders quota is configured', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockTierProgress(
    buildTierProgressWith({ ordersInWindow: 39, targetOrdersRequired: 75, targetAmountRequired: 0 }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('39 / 75')).toBeInTheDocument();
  expect(screen.queryByText('Spend')).not.toBeInTheDocument();
});

it('shows the SSW tier name in the hero when tier progress is available', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockTierProgress(buildTierProgressWith({ currentTierName: 'Select' }));

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('Current tier')).toBeInTheDocument();
  expect(await screen.findByText('Select')).toBeInTheDocument();
});

it('hides the tier progress card when the endpoint reports no progress', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, progressSite: 'StoreSupply' } };
  server.use(http.get(progressUrl, () => HttpResponse.json({ Success: false })));

  const { user } = renderWithProviders(<Loyalty />, customerPreloadedState);

  await user.click(await screen.findByRole('tab', { name: 'Tiers' }));

  expect(await screen.findByRole('tab', { name: 'Tiers', selected: true })).toBeInTheDocument();
  expect(screen.queryByText(/Progress to/)).not.toBeInTheDocument();
});
```

(d) Update the three old-box spots (spec §5 — the ONLY existing-test edits allowed):

1. In `'renders the tier list with the current tier highlighted and its title in the hero'`: delete these three lines (the tier cards, hero, and perks assertions stay):

```ts
  // progress toward Elite: 240 of 300
  expect(screen.getByText('240 / 300')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
```

2. Delete the entire test `'hides the tier progress bar when a threshold is not numeric'` (the `parseThreshold` behavior it exercises is removed).

3. In `'shows the current tier benefits and points summary on the Your rewards tab'`: delete the single line:

```ts
  expect(screen.getByText('240 / 300')).toBeInTheDocument();
```

Hero-fallback coverage note: after these edits, the surviving test `'renders the tier list with the current tier highlighted and its title in the hero'` (which never mocks the progress endpoint) doubles as the "hero falls back to the Influence title when tier progress is absent" test — its `findByText('Select')` hero assertion must still pass unchanged.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run -t "tier progress|SSW tier name|orders row"`
Expected: FAIL — `LoyaltyTierProgress` import error or "Progress to Signature" not found.

- [ ] **Step 3: Add the i18n keys**

In `src/lib/lang/locales/en.json`, after `"loyalty.tiers.progressTo": "Progress to {tier}",` (line 789):

```json
  "loyalty.progress.orders": "Orders",
  "loyalty.progress.spend": "Spend",
```

- [ ] **Step 4: Create the component**

Create `src/pages/Loyalty/components/TierProgressCard.tsx`:

```tsx
import { Box, LinearProgress, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { currencyFormat } from '@/utils/b3CurrencyFormat';

import { LoyaltyTierProgress } from '../api';

interface TierProgressCardProps {
  progress: LoyaltyTierProgress | null;
}

function TierProgressCard({ progress }: TierProgressCardProps) {
  const b3Lang = useB3Lang();

  if (!progress) {
    return null;
  }

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
      <Typography variant="subtitle2" color="text.secondary">
        {b3Lang('loyalty.tiers.progressTo', { tier: progress.targetTierName })}
      </Typography>
      {progress.targetOrdersRequired > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('loyalty.progress.orders')}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {`${progress.ordersInWindow.toLocaleString()} / ${progress.targetOrdersRequired.toLocaleString()}`}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, progress.ordersProgressPct)}
            sx={{ mt: 1, height: 8, borderRadius: 4 }}
          />
        </Box>
      )}
      {progress.targetAmountRequired > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {b3Lang('loyalty.progress.spend')}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {`${currencyFormat(progress.spendInWindow)} / ${currencyFormat(progress.targetAmountRequired)}`}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, progress.spendProgressPct)}
            sx={{ mt: 1, height: 8, borderRadius: 4 }}
          />
        </Box>
      )}
      {progress.summary && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {progress.summary}
        </Typography>
      )}
    </Box>
  );
}

export default TierProgressCard;
```

- [ ] **Step 5: Swap the box in OverviewTab**

In `src/pages/Loyalty/components/OverviewTab.tsx` (surgical hunks — the tier-benefits and membership-benefits blocks are untouched):

(a) Replace the imports block (lines 1–8) — `Typography` stays (the two benefits blocks use it); only `LinearProgress` and `findNextTier` are dropped:

```tsx
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyCustomer, LoyaltyTier, LoyaltyTierProgress } from '../api';

import SectionHeader from './SectionHeader';
import TierProgressCard from './TierProgressCard';
```

(b) Replace the props interface and function head (lines 10–24):

```tsx
interface OverviewTabProps {
  customer: LoyaltyCustomer | undefined;
  tiers: LoyaltyTier[];
  tierProgress: LoyaltyTierProgress | null;
}

function OverviewTab({ customer, tiers, tierProgress }: OverviewTabProps) {
  const b3Lang = useB3Lang();

  if (!customer) {
    return null;
  }

  const currentTier = tiers.find((tier) => tier.id === customer.currentLoyaltyTierId);
```

(the `progress` and `nextTier` consts and the `findNextTier` import are gone).

(c) Replace the final `{nextTier && progress !== null && ( … )}` block (lines 85–99) with:

```tsx
      <TierProgressCard progress={tierProgress} />
```

- [ ] **Step 6: Swap the box in TiersTab**

Replace `src/pages/Loyalty/components/TiersTab.tsx` in full:

```tsx
import { Box, Card, CardContent, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyTier, LoyaltyTierProgress } from '../api';

import SectionHeader from './SectionHeader';
import TierProgressCard from './TierProgressCard';

interface TiersTabProps {
  tiers: LoyaltyTier[];
  currentTierId: string | null;
  tierProgress: LoyaltyTierProgress | null;
}

function TiersTab({ tiers, currentTierId, tierProgress }: TiersTabProps) {
  const b3Lang = useB3Lang();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.tiers')}</SectionHeader>
      <TierProgressCard progress={tierProgress} />
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

- [ ] **Step 7: Wire the page**

In `src/pages/Loyalty/index.tsx`:

(a) Add `fetchTierProgress` and `isTierProgressAvailable` to the `./api` import block, keeping alphabetical order (`fetchTierProgress` sorts BEFORE `fetchTiers`):

```ts
import {
  fetchLoyaltyCustomer,
  fetchMemberships,
  fetchTierProgress,
  fetchTiers,
  getAllowedTiers,
  getLoyaltyDigest,
  isLoyaltyAvailable,
  isTierAllowed,
  isTierProgressAvailable,
  LoyaltyError,
} from './api';
```

(b) After the `membershipsQuery` block (line 96), add:

```ts
  const tierProgressQuery = useQuery({
    queryKey: ['loyaltyTierProgress', customerId],
    queryFn: () => fetchTierProgress(customerId),
    enabled: isTierProgressAvailable() && Boolean(customerId),
    staleTime: Infinity,
  });
  const tierProgress = tierProgressQuery.data ?? null;
```

(c) After the `tierTitle` computation (line 109), add — and do NOT touch the `isTierAllowed(tierTitle, …)` line in the gate:

```ts
  // Display identity only — the allowlist gate below stays keyed to the Influence title.
  const displayTierTitle = tierProgress?.currentTierName || tierTitle;
```

(d) Hero (line 172): change `tierTitle={tierTitle}` to `tierTitle={displayTierTitle}`.

(e) Overview panel (line 248):

```tsx
        {activeTab === 'overview' && (
          <OverviewTab customer={customer} tiers={tiers} tierProgress={tierProgress} />
        )}
```

(f) Tiers panel (lines 263–269):

```tsx
        {activeTab === 'tiers' && (
          <TiersTab
            tiers={tiers}
            currentTierId={customer?.currentLoyaltyTierId ?? null}
            tierProgress={tierProgress}
          />
        )}
```

- [ ] **Step 8: Delete the orphaned helpers**

1. Delete the file `src/pages/Loyalty/tierProgress.ts` (`git rm src/pages/Loyalty/tierProgress.ts`).
2. In `src/pages/Loyalty/api.ts`, delete this exact block (lines 236–243 area — its only consumer was `tierProgress.ts`):

```ts
// Tier thresholds are strings with no documented unit (spec S3) — parse defensively.
export const parseThreshold = (threshold: string): number | null => {
  if (threshold.trim() === '') {
    return null;
  }
  const value = Number(threshold);
  return Number.isFinite(value) ? value : null;
};
```

(`LoyaltyTier.threshold` and `LoyaltyCustomer.currentLoyaltyTierProgress` REMAIN — payload fields, still mapped and tested in the fetch tests.)
3. In `src/pages/Loyalty/api.test.ts`, delete the whole `describe('parseThreshold', …)` block (lines 312–321) and remove `parseThreshold` from the import.

- [ ] **Step 9: Run the full suite + gates**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run`
Expected: all green (new tests + updated tests + untouched allowlist-gate/membership/shipping tests).
Run: `yarn tsc --noEmit` → clean.
Run: `npx eslint src/pages/Loyalty/index.tsx src/pages/Loyalty/components/TierProgressCard.tsx src/pages/Loyalty/components/OverviewTab.tsx src/pages/Loyalty/components/TiersTab.tsx src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts src/pages/Loyalty/index.test.tsx --max-warnings 0` → clean.
Run: `yarn lint:knip` → the Task 1 interim flags are gone (all three exports consumed; `findNextTier`/`parseThreshold` deleted). Pre-existing `analytics.ts` orphan under `lint:dependencies` is baseline — leave it.

- [ ] **Step 10: Commit**

```bash
git add src/pages/Loyalty/components/TierProgressCard.tsx src/pages/Loyalty/components/OverviewTab.tsx src/pages/Loyalty/components/TiersTab.tsx src/pages/Loyalty/index.tsx src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts src/pages/Loyalty/index.test.tsx src/lib/lang/locales/en.json
git rm src/pages/Loyalty/tierProgress.ts
git commit -m "feat: B2B-0000 Replace loyalty tier progress with SSW dual-quota display" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Verification (whole feature)

- `CIRCLECI=true yarn test src/pages/Loyalty/ --run` green; `yarn tsc --noEmit` clean; scoped eslint + `lint:knip` clean.
- Manual (sandbox, theme with `BC_CONTEXT.loyalty.progressSite` set): Overview + Tiers show the dual-quota card (orders + spend bars + server summary) matching `GetDetailWithProgress`; hero shows the SSW tier name; without `progressSite` no card renders and the page matches today's behavior.

## Notes / out of scope

- The endpoint is unauthenticated — accepted risk recorded in the spec (§Accepted risk); backend hardening is an SSW follow-up, and the call site needs only an added parameter when it lands.
- `Ledger`, `RecentTransactions`, `PendingPoints`, `InfluenceCheck` are ignored by design.
- The Overview benefits box keeps its Influence tier title (perks are Influence data) — known, accepted seam with the SSW-named hero.
- `index.mobile.test.tsx` / `index.platform.test.tsx` are untouched (no progress assertions; the unmocked endpoint hangs via the MSW catch-all ⇒ no card ⇒ no effect).
