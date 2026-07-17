# Loyalty Memberships Tab (read-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only "Memberships" tab to the buyer-portal Loyalty (Rewards) page that lists the store's Influence.io memberships (title, description, perks).

**Architecture:** One new browser-safe Launcher fetcher (`fetchMemberships`, shop-scoped, no digest) feeds a new `useQuery` in the existing `Loyalty` page. A new `MembershipsTab` component (modeled on `TiersTab`) renders the cards. The tab auto-hides when the store has no memberships; a computed `activeTab` keeps MUI `Tabs` valid when `?tab=memberships` is deep-linked into a store with none.

**Tech Stack:** React 18 function components, `@tanstack/react-query`, MUI, MSW + Vitest + Testing Library, `builder`/`faker` test factories. All commands run from `apps/storefront/`.

## Global Constraints

- Run every command from `apps/storefront/` (not repo root).
- MUI icons: **named imports** from `@mui/icons-material` (never deep paths).
- Use `@/` and `tests/` path aliases, not long relative paths (page-local files use `./` / `../`).
- No new Redux slices, Context providers, or `localStorage`/`sessionStorage`. Read Redux only at the top of the page.
- `useQuery` for data fetching (not `useEffect` + `setState`).
- Tests: **always use builders**; no hardcoded fixtures. Import test utils from `tests/test-utils`, not `@testing-library/*`/`msw` directly.
- Do not modify existing tests; they must stay green untouched.
- Commit format: `type: TICKET-### Short description` (this repo's loyalty work uses `B2B-0000`).
- Scope: **read-only**. No enroll/join/leave, no current-membership indicator, no `customerCount` rendering.

---

## File Structure

- **Modify** `src/pages/Loyalty/api.ts` — add `LoyaltyMembership` interface + `fetchMemberships`. One responsibility: the Loyalty service layer (unchanged pattern).
- **Modify** `src/pages/Loyalty/api.test.ts` — unit tests for `fetchMemberships`.
- **Create** `src/pages/Loyalty/components/MembershipsTab.tsx` — presentational card list. One responsibility: render memberships.
- **Modify** `src/lib/lang/locales/en.json` — add `loyalty.tabs.memberships`.
- **Modify** `src/pages/Loyalty/index.tsx` — query + tab + panel wiring + deep-link guard.
- **Modify** `src/pages/Loyalty/index.test.tsx` — page-level tests (tab visible / hidden / deep-link fallback / card content).

---

## Task 1: `fetchMemberships` service layer

**Files:**
- Modify: `src/pages/Loyalty/api.ts` (add near `fetchTiers`, ~line 208–243)
- Test: `src/pages/Loyalty/api.test.ts`

**Interfaces:**
- Consumes: existing `requireConfig`, `launcherGet`, `LoyaltyError` in `api.ts`.
- Produces:
  - `interface LoyaltyMembership { id: string; title: string; description: string; perks: string[]; }`
  - `fetchMemberships(): Promise<LoyaltyMembership[]>`

- [ ] **Step 1: Write the failing tests**

In `src/pages/Loyalty/api.test.ts`, add `fetchMemberships` to the existing import block from `./api` (keep alphabetical with the other `fetch*` imports), then append this `describe`:

```ts
describe('fetchMemberships', () => {
  const membershipsUrl = 'https://launcher.api.influence.io/launcher/v1/shop/memberships';

  it('fetches memberships with only the shop key and normalizes them', async () => {
    server.use(
      http.get(membershipsUrl, ({ request }) => {
        assertQueryParams(request, { shop: shopKey });

        return HttpResponse.json({
          memberships: [
            {
              id: 'm1',
              title: 'VIP Gold',
              description: 'Our premium program',
              customerCount: 1240,
              perks: ['Free expedited shipping', 'Early access'],
            },
            { id: 'm2', title: 'Trade Pro' },
          ],
        });
      }),
    );

    const result = await fetchMemberships();

    // customerCount is intentionally dropped (not buyer-facing)
    expect(result).toEqual([
      {
        id: 'm1',
        title: 'VIP Gold',
        description: 'Our premium program',
        perks: ['Free expedited shipping', 'Early access'],
      },
      { id: 'm2', title: 'Trade Pro', description: '', perks: [] },
    ]);
  });

  it('returns an empty list when the payload has no memberships array', async () => {
    server.use(http.get(membershipsUrl, () => HttpResponse.json({})));

    expect(await fetchMemberships()).toEqual([]);
  });

  it('maps a 404 to an upstream error (shop-key misconfig, not per-customer)', async () => {
    server.use(http.get(membershipsUrl, () => HttpResponse.json({}, { status: 404 })));

    const error = await fetchMemberships().catch((e) => e);

    expect(error).toBeInstanceOf(LoyaltyError);
    expect(error.kind).toBe('upstream');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/api.test.ts --run -t fetchMemberships`
Expected: FAIL — `fetchMemberships is not exported` / `is not a function`.

- [ ] **Step 3: Write the minimal implementation**

In `src/pages/Loyalty/api.ts`, immediately after the `fetchTiers` block (after the closing of `export const fetchTiers = …`, ~line 243), add:

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

(`customerCount` is deliberately absent from `RawMembership` — it is never consumed.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/api.test.ts --run -t fetchMemberships`
Expected: PASS (3 tests).

- [ ] **Step 5: Type-check**

Run: `yarn tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts
git commit -m "feat: B2B-0000 Add fetchMemberships launcher service"
```

---

## Task 2: Read-only Memberships tab (component + i18n + page wiring)

**Files:**
- Create: `src/pages/Loyalty/components/MembershipsTab.tsx`
- Modify: `src/lib/lang/locales/en.json` (after `loyalty.tabs.history`, line 787)
- Modify: `src/pages/Loyalty/index.tsx`
- Test: `src/pages/Loyalty/index.test.tsx`

**Interfaces:**
- Consumes: `LoyaltyMembership`, `fetchMemberships` from Task 1; page-local `SectionHeader`; `useB3Lang`; `CardMembership` from `@mui/icons-material`.
- Produces: `MembershipsTab` default export taking `{ memberships: LoyaltyMembership[] }`; a rendered `Memberships` tab in the Loyalty page (auto-hidden when the list is empty).

- [ ] **Step 1: Write the failing page tests**

In `src/pages/Loyalty/index.test.tsx`:

(a) add `LoyaltyMembership` to the import from `./api`;

(b) add a builder + mock helper next to the existing `buildTierWith` / `mockTiers` (~line 118–121):

```ts
const buildMembershipWith = builder<LoyaltyMembership>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productName(),
  description: faker.company.catchPhrase(),
  perks: [faker.company.catchPhrase()],
}));

const mockMemberships = (memberships: LoyaltyMembership[]) =>
  server.use(
    http.get(`${launcherBase}/shop/memberships`, () => HttpResponse.json({ memberships })),
  );
```

(c) append these tests:

```ts
it('shows the Memberships tab and lists membership cards when the store has memberships', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships([
    buildMembershipWith({
      title: 'VIP Gold',
      description: 'Our premium program',
      perks: ['Free expedited shipping', 'Early access to sales'],
    }),
  ]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Memberships' }));

  expect(await screen.findByText('VIP Gold')).toBeInTheDocument();
  expect(screen.getByText('Our premium program')).toBeInTheDocument();
  expect(screen.getByText('Free expedited shipping')).toBeInTheDocument();
  expect(screen.getByText('Early access to sales')).toBeInTheDocument();
});

it('hides the Memberships tab when the store has no memberships', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships([]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByRole('tab', { name: 'Your rewards' })).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Memberships' })).not.toBeInTheDocument();
});

it('falls back to Your rewards when ?tab=memberships but the store has none', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships([]);

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=memberships' }] });

  expect(
    await screen.findByRole('tab', { name: 'Your rewards', selected: true }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Memberships' })).not.toBeInTheDocument();
});

it('omits the description line for a membership with no description', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships([
    buildMembershipWith({ title: 'Trade Pro', description: '', perks: ['Net-30 terms'] }),
  ]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Memberships' }));

  expect(await screen.findByText('Trade Pro')).toBeInTheDocument();
  expect(screen.getByText('Net-30 terms')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run -t Memberships`
Expected: FAIL — no `Memberships` tab found.

- [ ] **Step 3: Add the i18n key**

In `src/lib/lang/locales/en.json`, after the `"loyalty.tabs.history"` line (line 787) add:

```json
  "loyalty.tabs.memberships": "Memberships",
```

(Only `en.json` carries the `loyalty.*` namespace — no other locale file needs the key.)

- [ ] **Step 4: Create the component**

Create `src/pages/Loyalty/components/MembershipsTab.tsx`:

```tsx
import { Box, Card, CardContent, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyMembership } from '../api';

import SectionHeader from './SectionHeader';

interface MembershipsTabProps {
  memberships: LoyaltyMembership[];
}

function MembershipsTab({ memberships }: MembershipsTabProps) {
  const b3Lang = useB3Lang();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.memberships')}</SectionHeader>
      {memberships.map((membership) => (
        <Card key={membership.id} variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {membership.title}
            </Typography>
            {membership.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {membership.description}
              </Typography>
            )}
            {membership.perks.map((perk) => (
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

export default MembershipsTab;
```

- [ ] **Step 5: Wire the page — imports**

In `src/pages/Loyalty/index.tsx`:

(a) line 2 — add `CardMembership` to the icons import (keep alphabetical):

```ts
import { CardGiftcard, CardMembership, FavoriteBorder, Layers, Schedule, StarBorder } from '@mui/icons-material';
```

(b) after the `import TiersTab from './components/TiersTab';` line (line 15) add:

```ts
import MembershipsTab from './components/MembershipsTab';
```

(c) add `fetchMemberships` to the existing import block from `./api` (lines 16–24).

- [ ] **Step 6: Wire the page — query + tab list**

(a) line 26 — add `'memberships'` before `'history'`:

```ts
const LOYALTY_TABS = ['overview', 'earn', 'redeem', 'tiers', 'memberships', 'history'] as const;
```

(b) after the `tiersQuery` block (line 73–79) add:

```ts
  const membershipsQuery = useQuery({
    queryKey: ['loyaltyMemberships'],
    queryFn: fetchMemberships,
    enabled: isAvailable,
    staleTime: Infinity,
  });
  const memberships = membershipsQuery.data ?? [];
```

- [ ] **Step 7: Wire the page — active-tab guard + render**

(a) Immediately before the final `return (` of the component (after the `isLoadError` line, ~line 134) add:

```ts
  const hasMemberships = memberships.length > 0;
  const activeTab = tab === 'memberships' && !hasMemberships ? 'overview' : tab;
```

(b) Change the `Tabs` value (line 176) from `value={tab}` to `value={activeTab}`.

(c) Add the Memberships `<Tab>` between the Tiers tab (ends line 212) and the History tab (line 213):

```tsx
          {hasMemberships && (
            <Tab
              value="memberships"
              icon={<CardMembership />}
              iconPosition="start"
              label={b3Lang('loyalty.tabs.memberships')}
            />
          )}
```

(d) Change the five existing panel guards from `tab === '…'` to `activeTab === '…'` (lines 220, 221, 228, 235, 242), and add the memberships panel after the Tiers panel (after line 241):

```tsx
        {activeTab === 'memberships' && <MembershipsTab memberships={memberships} />}
```

The final panel block reads:

```tsx
        {activeTab === 'overview' && <OverviewTab customer={customer} tiers={tiers} />}
        {activeTab === 'earn' && (
          <EarnPointsTab
            identity={identity}
            customer={customer}
            customerQueryKey={['loyaltyCustomer', customerId]}
          />
        )}
        {activeTab === 'redeem' && (
          <RewardsTab
            identity={identity}
            pointBalance={customer?.pointBalance ?? 0}
            customerQueryKey={['loyaltyCustomer', customerId]}
          />
        )}
        {activeTab === 'tiers' && (
          <TiersTab
            tiers={tiers}
            currentTierId={customer?.currentLoyaltyTierId ?? null}
            currentTierProgress={customer?.currentLoyaltyTierProgress ?? null}
          />
        )}
        {activeTab === 'memberships' && <MembershipsTab memberships={memberships} />}
        {activeTab === 'history' && <HistoryTab identity={identity} />}
```

- [ ] **Step 8: Run the new tests to verify they pass**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run -t Memberships`
Expected: PASS (4 tests).

- [ ] **Step 9: Run the full Loyalty suite + type-check (no regressions)**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run`
Expected: all green, including the untouched existing tests.
Run: `yarn tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Lint (scoped)**

Run:
```bash
yarn lint:eslint src/pages/Loyalty/index.tsx src/pages/Loyalty/components/MembershipsTab.tsx src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts src/pages/Loyalty/index.test.tsx
yarn lint:knip
```
Expected: clean (new exports `LoyaltyMembership` / `fetchMemberships` are consumed; named MUI icon import; no unused code).

- [ ] **Step 11: Commit**

```bash
git add src/pages/Loyalty/components/MembershipsTab.tsx src/pages/Loyalty/index.tsx src/pages/Loyalty/index.test.tsx src/lib/lang/locales/en.json
git commit -m "feat: B2B-0000 Add read-only Memberships tab to Loyalty page"
```

---

## Verification (whole feature)

- `yarn tsc --noEmit` clean.
- `CIRCLECI=true yarn test src/pages/Loyalty/ --run` green (new + existing).
- `yarn lint:eslint <changed files>` + `yarn lint:knip` + `yarn lint:dependencies` clean.
- Manual (Stencil sandbox with memberships configured): the Memberships tab appears between Tiers and History and lists each membership's title/description/perks; on a store with no memberships the tab is absent and `#/loyalty?tab=memberships` shows the Overview tab.

## Notes / out of scope (future work)

- **Enroll/join/leave** is blocked on a new SSW Platform-API proxy (`x-api-key`); a follow-up spec adds `enrollMembership()` + a gated CTA once that endpoint exists.
- No current-membership indicator (no read-back API) and no `customerCount` display — both deliberate per the spec.
- `index.mobile.test.tsx` is intentionally **not** modified: it is a viewport smoke test (asserts hero + a couple of tabs at 500px) and the Memberships tab has no viewport-conditional logic, so no mobile-specific test is warranted.
