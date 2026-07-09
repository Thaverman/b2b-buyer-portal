# Loyalty Earn Points Tier Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each earn action on the Loyalty Earn Points tab once, with the point value that applies to the customer's current tier.

**Architecture:** Extend the `EarnRule` DTO in the page-local `api.ts` with three fields the Influence.io Launcher API already returns (`earnValue`, `limitTiers`, `loyaltyTierIds`), add a pure exported `isEarnRuleForTier` filter helper (same pattern as the existing `isRedeemableCatalogRule`), and render a tier-filtered points line in `EarnPointsTab`. No new props, queries, or state — `EarnPointsTab` already receives `customer` which carries `currentLoyaltyTierId`.

**Tech Stack:** React 18 function components, MUI, TanStack Query (already wired), Vitest + Testing Library + MSW, `builder` test factories from `tests/test-utils`.

**Spec:** `docs/superpowers/specs/2026-07-09-loyalty-earn-points-tier-values-design.md`

## Global Constraints

- **All commands run from `apps/storefront/`** (not repo root).
- Commit format: `type: B2B-0000 Short description` + trailing `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` line.
- Test data MUST use `builder` factories (hardcoded object literals in tests are a review blocker) — except tiny inline literals already established in the file (e.g. the `getSocialCompletionFlag` rule literal).
- Import test utilities from `tests/test-utils`, never directly from `@testing-library/*` or `msw`.
- Copy strings (exact, no pluralization): `"Earn {points} points per $1 spent"` (increments) and `"Earn {points} points"` (everything else). Points line omitted when `earnValue` is 0.
- Do NOT run `yarn lint` until Task 5 (knip fails on exports not yet consumed by app code).
- The working tree already contains an uncommitted, verified title-fallback bugfix in `api.ts`/`api.test.ts` — Task 1 commits it before feature work starts.
- This repo's dev branch has a known red test baseline elsewhere; only the Loyalty suite must be green here (`yarn test --run src/pages/Loyalty`).

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `apps/storefront/src/pages/Loyalty/api.ts` | Modify | DTO fields + `isEarnRuleForTier` pure helper |
| `apps/storefront/src/pages/Loyalty/api.test.ts` | Modify | Mapping + helper unit tests |
| `apps/storefront/src/pages/Loyalty/components/EarnPointsTab.tsx` | Modify | Tier filter + points line rendering |
| `apps/storefront/src/pages/Loyalty/index.test.tsx` | Modify | Builder defaults + rendering/filtering tests |
| `apps/storefront/src/lib/lang/locales/en.json` | Modify | Two new copy keys |
| `.memory/b2b-buyer-portal--loyalty-earn-rules-blank-title.md` | Modify (Task 1) | Update "not yet committed" status line |

---

### Task 1: Commit the pending title-fallback bugfix

The working tree already contains the verified fix (`title: rule.customTitle ?? rule.title ?? ''`, `title?` on `RawEarnRule`, one repro test). Commit it, plus its memory notes, so feature commits start clean.

**Files:**
- Commit (already modified): `apps/storefront/src/pages/Loyalty/api.ts`, `apps/storefront/src/pages/Loyalty/api.test.ts`
- Commit (untracked): `.memory/b2b-buyer-portal--loyalty-earn-rules-blank-title.md`, `.memory/b2b-buyer-portal--loyalty-digest-mismatch-influence-launcher.md`
- Leave untouched: `.memory/b2b-buyer-portal--b3fetch-raw-server-errors-b3-api-outage.md` (unrelated, pre-existing)

**Interfaces:**
- Consumes: nothing.
- Produces: committed baseline where `RawEarnRule` has `title?: string` and `fetchEarnRules` maps `title: rule.customTitle ?? rule.title ?? ''`.

- [ ] **Step 1: Verify the pending fix is green**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/api.test.ts`
Expected: `Tests  38 passed (38)`

- [ ] **Step 2: Update the memory note status line**

In `.memory/b2b-buyer-portal--loyalty-earn-rules-blank-title.md`, replace:

```
Status: **fix applied in the working tree on 2026-07-09, not yet committed / merged /
deployed.** The deployed sandbox bundle still shows blank cards until this ships. All
70 Loyalty tests + `tsc --noEmit` pass locally with the change.
```

with:

```
Status: **fix committed to `dev` on 2026-07-09, not yet deployed.** The deployed
sandbox bundle still shows blank cards until this ships. All 70 Loyalty tests +
`tsc --noEmit` pass locally with the change.
```

- [ ] **Step 3: Commit**

```bash
cd /home/thaverman/repos/customb2baccount/b2b-buyer-portal
git add apps/storefront/src/pages/Loyalty/api.ts apps/storefront/src/pages/Loyalty/api.test.ts .memory/b2b-buyer-portal--loyalty-earn-rules-blank-title.md .memory/b2b-buyer-portal--loyalty-digest-mismatch-influence-launcher.md
git commit -m "fix: B2B-0000 Fall back to title when earn rule has no customTitle

Influence.io Launcher earn rules carry the label in title (customTitle is
a merchant override, absent on real payloads), so every Earn Points card
rendered blank. Mirror fetchRedeemRules: customTitle ?? title ?? ''.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Extend the EarnRule DTO with earnValue / limitTiers / loyaltyTierIds

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/api.ts` (the `EarnRule` interface, `RawEarnRule` interface, and `fetchEarnRules` mapping — currently around lines 245–278)
- Test: `apps/storefront/src/pages/Loyalty/api.test.ts` (the `describe('fetchEarnRules')` block)
- Modify: `apps/storefront/src/pages/Loyalty/index.test.tsx` (the `buildEarnRuleWith` builder — widened type makes its current defaults incomplete)

**Interfaces:**
- Consumes: existing `RawEarnRule` / `EarnRule` / `fetchEarnRules` in `api.ts`.
- Produces: `EarnRule` with **required** `earnValue: number`, `limitTiers: boolean`, `loyaltyTierIds: string[]` (Tasks 3–5 rely on these exact names/types).

- [ ] **Step 1: Write the failing mapping test**

Add inside `describe('fetchEarnRules', ...)` in `api.test.ts`, after the "falls back to title" test:

```ts
  it('maps earnValue, limitTiers and loyaltyTierIds', async () => {
    server.use(
      http.get('https://launcher.api.influence.io/launcher/v1/shop/rules/earn', () =>
        HttpResponse.json({
          rules: [
            {
              id: 'r3',
              title: 'Place an order',
              earnType: 'increments',
              earnValue: 3,
              templateName: 'placeorder',
              limitTiers: true,
              loyaltyTierIds: ['29777d36-e455-44aa-a711-62f7c0ddad85'],
            },
          ],
        }),
      ),
    );

    const result = await fetchEarnRules();

    expect(result).toEqual([
      {
        id: 'r3',
        title: 'Place an order',
        summary: '',
        earnType: 'increments',
        templateName: 'placeorder',
        socialUrl: '',
        earnValue: 3,
        limitTiers: true,
        loyaltyTierIds: ['29777d36-e455-44aa-a711-62f7c0ddad85'],
      },
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/api.test.ts -t "maps earnValue"`
Expected: FAIL — received object lacks `earnValue` / `limitTiers` / `loyaltyTierIds`.

- [ ] **Step 3: Implement the DTO extension**

In `api.ts`, change the two interfaces and the mapping:

```ts
export interface EarnRule {
  id: string;
  title: string;
  summary: string;
  earnType: string;
  templateName: string;
  socialUrl: string;
  earnValue: number;
  limitTiers: boolean;
  loyaltyTierIds: string[];
}

interface RawEarnRule {
  id?: string | number;
  customTitle?: string;
  title?: string;
  summary?: string;
  earnType?: string;
  templateName?: string;
  socialUrl?: string;
  earnValue?: number;
  limitTiers?: boolean;
  loyaltyTierIds?: (string | number)[];
}
```

and in `fetchEarnRules`:

```ts
  return (raw.rules ?? []).map((rule) => ({
    id: String(rule.id ?? ''),
    title: rule.customTitle ?? rule.title ?? '',
    summary: rule.summary ?? '',
    earnType: rule.earnType ?? '',
    templateName: rule.templateName ?? '',
    socialUrl: rule.socialUrl ?? '',
    earnValue: rule.earnValue ?? 0,
    limitTiers: rule.limitTiers ?? false,
    loyaltyTierIds: (rule.loyaltyTierIds ?? []).map(String),
  }));
```

- [ ] **Step 4: Update existing literals to satisfy the widened type**

(a) In `api.test.ts`, the two existing `fetchEarnRules` `toEqual` expectations gain the new defaults. First test's expected object becomes:

```ts
    expect(result).toEqual([
      {
        id: 'r1',
        title: 'Make a purchase',
        summary: '2 points per $1',
        earnType: 'order',
        templateName: 'purchase',
        socialUrl: '',
        earnValue: 0,
        limitTiers: false,
        loyaltyTierIds: [],
      },
    ]);
```

Second ("falls back to title") test's expected object becomes:

```ts
    expect(result).toEqual([
      {
        id: 'r2',
        title: 'Place an order',
        summary: '',
        earnType: 'increments',
        templateName: 'placeorder',
        socialUrl: '',
        earnValue: 0,
        limitTiers: false,
        loyaltyTierIds: [],
      },
    ]);
```

(b) In `api.test.ts` `describe('getSocialCompletionFlag')`, the rule literal becomes:

```ts
    const rule = {
      id: 'r',
      title: '',
      summary: '',
      earnType: '',
      templateName,
      socialUrl,
      earnValue: 0,
      limitTiers: false,
      loyaltyTierIds: [],
    };
```

(c) In `index.test.tsx`, `buildEarnRuleWith` (around line 120) gains the new defaults so all existing tests stay green (`earnValue: 0` → no points line; `limitTiers: false` → passes any future filter):

```ts
const buildEarnRuleWith = builder<EarnRule>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productName(),
  summary: faker.company.catchPhrase(),
  earnType: 'custom',
  templateName: 'custom',
  socialUrl: '',
  earnValue: 0,
  limitTiers: false,
  loyaltyTierIds: [],
}));
```

(`mockEarnRules` spreads `...rest`, so the new fields flow into the MSW payload automatically — no change needed there.)

- [ ] **Step 5: Run tests and type-check to verify green**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/api.test.ts && yarn tsc --noEmit`
Expected: `Tests  39 passed (39)`; tsc exits 0.

- [ ] **Step 6: Commit**

```bash
cd /home/thaverman/repos/customb2baccount/b2b-buyer-portal
git add apps/storefront/src/pages/Loyalty/api.ts apps/storefront/src/pages/Loyalty/api.test.ts apps/storefront/src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Map earnValue, limitTiers and loyaltyTierIds on earn rules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Pure tier filter — isEarnRuleForTier

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/api.ts` (new exported helper, placed directly after `getSocialCompletionFlag`)
- Test: `apps/storefront/src/pages/Loyalty/api.test.ts`

**Interfaces:**
- Consumes: `EarnRule` from Task 2 (`limitTiers: boolean`, `loyaltyTierIds: string[]`).
- Produces: `isEarnRuleForTier(rule: EarnRule, currentTierId: string | null): boolean` — Task 5's component filter calls exactly this.

Note: do NOT run `yarn lint` at the end of this task — knip flags the export as unused until Task 5 wires it into `EarnPointsTab`.

- [ ] **Step 1: Write the failing test table**

In `api.test.ts`: add `isEarnRuleForTier` to the existing `from './api'` import list, add a local builder next to the other builders at the top of the file:

```ts
const buildEarnRuleWith = builder<EarnRule>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productName(),
  summary: '',
  earnType: '',
  templateName: '',
  socialUrl: '',
  earnValue: 0,
  limitTiers: false,
  loyaltyTierIds: [],
}));
```

(also add `EarnRule` to the `./api` type imports), then add after `describe('getSocialCompletionFlag')`:

```ts
describe('isEarnRuleForTier', () => {
  it.each([
    [false, [], 'tier-select', true],
    [true, ['tier-select'], 'tier-select', true],
    [true, ['tier-select'], 'tier-signature', false],
    [true, ['tier-select'], null, false],
  ] as [boolean, string[], string | null, boolean][])(
    'limitTiers=%j tierIds=%j currentTier=%j → %j',
    (limitTiers, loyaltyTierIds, currentTierId, expected) => {
      const rule = buildEarnRuleWith({ limitTiers, loyaltyTierIds });

      expect(isEarnRuleForTier(rule, currentTierId)).toBe(expected);
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/api.test.ts -t "isEarnRuleForTier"`
Expected: FAIL — `isEarnRuleForTier` is not exported (SyntaxError/undefined).

- [ ] **Step 3: Implement the helper**

In `api.ts`, directly after `getSocialCompletionFlag`:

```ts
// Tier-gated rules (limitTiers) only apply to customers in one of the listed tiers;
// with no known tier we hide them rather than show a rate the customer may not get.
export const isEarnRuleForTier = (rule: EarnRule, currentTierId: string | null): boolean => {
  if (!rule.limitTiers) {
    return true;
  }
  if (!currentTierId) {
    return false;
  }
  return rule.loyaltyTierIds.includes(currentTierId);
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/api.test.ts`
Expected: `Tests  43 passed (43)` (39 prior + 4 table cases).

- [ ] **Step 5: Commit**

```bash
cd /home/thaverman/repos/customb2baccount/b2b-buyer-portal
git add apps/storefront/src/pages/Loyalty/api.ts apps/storefront/src/pages/Loyalty/api.test.ts
git commit -m "feat: B2B-0000 Add isEarnRuleForTier filter for tier-gated earn rules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Points line rendering + lang keys

**Files:**
- Modify: `apps/storefront/src/lib/lang/locales/en.json` (two keys; `en.json` is the only locale file)
- Modify: `apps/storefront/src/pages/Loyalty/components/EarnPointsTab.tsx`
- Test: `apps/storefront/src/pages/Loyalty/index.test.tsx`

**Interfaces:**
- Consumes: `EarnRule.earnValue` / `EarnRule.earnType` from Task 2; existing `useB3Lang` interpolation (`{points}` placeholder, same as `loyalty.earn.followSuccess`).
- Produces: lang keys `loyalty.earn.perDollar` and `loyalty.earn.flat`; a points `Typography` line rendered between summary and the social action.

- [ ] **Step 1: Write the failing rendering tests**

In `index.test.tsx`, after the existing `it('renders earn rules with title and summary', ...)` test:

```ts
it('shows a per-dollar points line for increments earn rules', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockEarnRules([
    buildEarnRuleWith({ title: 'Place an order', earnType: 'increments', earnValue: 3 }),
  ]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));

  expect(await screen.findByText('Place an order')).toBeInTheDocument();
  expect(screen.getByText('Earn 3 points per $1 spent')).toBeInTheDocument();
});

it('shows a flat points line for non-increments earn rules', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockEarnRules([buildEarnRuleWith({ title: 'Sign up', earnType: '', earnValue: 10 })]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));

  expect(await screen.findByText('Sign up')).toBeInTheDocument();
  expect(screen.getByText('Earn 10 points')).toBeInTheDocument();
});

it('omits the points line when earnValue is 0', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockEarnRules([buildEarnRuleWith({ title: 'Mystery rule', earnValue: 0 })]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));

  expect(await screen.findByText('Mystery rule')).toBeInTheDocument();
  expect(screen.queryByText('Earn 0 points')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/index.test.tsx -t "points line"`
Expected: 3 FAIL — points-line texts not found.

- [ ] **Step 3: Add the lang keys**

In `src/lib/lang/locales/en.json`, keep alphabetical order within the `loyalty.earn.*` block:

```json
  "loyalty.earn.completed": "Completed",
  "loyalty.earn.flat": "Earn {points} points",
  "loyalty.earn.follow": "Follow",
  "loyalty.earn.followSuccess": "You earned {points} points!",
  "loyalty.earn.perDollar": "Earn {points} points per $1 spent",
```

- [ ] **Step 4: Render the points line**

In `EarnPointsTab.tsx`, the card `CardContent` becomes:

```tsx
          <CardContent sx={{ textAlign: 'center' }}>
            <Typography variant="subtitle1">{rule.title}</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {rule.summary}
            </Typography>
            {rule.earnValue > 0 && (
              <Typography variant="body2" sx={{ mb: 1 }}>
                {rule.earnType === 'increments'
                  ? b3Lang('loyalty.earn.perDollar', { points: rule.earnValue })
                  : b3Lang('loyalty.earn.flat', { points: rule.earnValue })}
              </Typography>
            )}
            {renderAction(rule)}
          </CardContent>
```

(The summary line stays unconditional — surgical change, existing behavior.)

- [ ] **Step 5: Run the Loyalty page suite to verify green**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/index.test.tsx`
Expected: `Tests  33 passed (33)` (30 prior + 3 new).

- [ ] **Step 6: Commit**

```bash
cd /home/thaverman/repos/customb2baccount/b2b-buyer-portal
git add apps/storefront/src/lib/lang/locales/en.json apps/storefront/src/pages/Loyalty/components/EarnPointsTab.tsx apps/storefront/src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Show earn-rule point values on the Earn Points tab

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Tier filtering in EarnPointsTab

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/components/EarnPointsTab.tsx`
- Test: `apps/storefront/src/pages/Loyalty/index.test.tsx`

**Interfaces:**
- Consumes: `isEarnRuleForTier` from Task 3; `customer.currentLoyaltyTierId` (already a prop-borne field: `customer: LoyaltyCustomer | undefined`).
- Produces: final user-visible behavior — one card per action, current tier only.

- [ ] **Step 1: Write the failing filtering test**

In `index.test.tsx`, after the Task 4 tests:

```ts
it('shows only the earn rules for the customer current tier', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 'tier-signature' }));
  mockEarnRules([
    buildEarnRuleWith({
      title: 'Place an order',
      earnType: 'increments',
      earnValue: 3,
      limitTiers: true,
      loyaltyTierIds: ['tier-signature'],
    }),
    buildEarnRuleWith({
      title: 'Place an order',
      earnType: 'increments',
      earnValue: 2,
      limitTiers: true,
      loyaltyTierIds: ['tier-select'],
    }),
    buildEarnRuleWith({ title: 'Sign up', earnValue: 10 }),
  ]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));

  expect(await screen.findByText('Sign up')).toBeInTheDocument();
  expect(screen.getAllByText('Place an order')).toHaveLength(1);
  expect(screen.getByText('Earn 3 points per $1 spent')).toBeInTheDocument();
  expect(screen.queryByText('Earn 2 points per $1 spent')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/index.test.tsx -t "current tier"`
Expected: FAIL — `getAllByText('Place an order')` returns 2 elements.

- [ ] **Step 3: Implement the filter**

In `EarnPointsTab.tsx`: add `isEarnRuleForTier` to the existing `from '../api'` import list, then replace

```ts
  const rules = rulesQuery.data ?? [];
```

with

```ts
  const rules = (rulesQuery.data ?? []).filter((rule) =>
    isEarnRuleForTier(rule, customer?.currentLoyaltyTierId ?? null),
  );
```

(`rules.map(...)` in the JSX stays unchanged.)

- [ ] **Step 4: Run the full Loyalty suite and type-check**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty && yarn tsc --noEmit`
Expected: 4 files, `Tests  78 passed (78)` (43 api + 34 index + 1 mobile + 1 platform — if counts differ, all must PASS); tsc exits 0.

- [ ] **Step 5: Commit**

```bash
cd /home/thaverman/repos/customb2baccount/b2b-buyer-portal
git add apps/storefront/src/pages/Loyalty/components/EarnPointsTab.tsx apps/storefront/src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Filter earn rules to the customer current tier

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Full verification

**Files:** none (verification only; fix-forward if anything fails).

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified green branch state.

- [ ] **Step 1: Type-check + full lint**

Run: `cd apps/storefront && yarn tsc --noEmit && yarn lint`
Expected: tsc exits 0; dependency-cruiser, eslint (`--max-warnings 0`), and knip all pass. knip must NOT flag `isEarnRuleForTier` (it is consumed by `EarnPointsTab.tsx` as of Task 5).

- [ ] **Step 2: Full Loyalty suite one more time**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty`
Expected: all 4 test files PASS.

- [ ] **Step 3: Live verification note (post-deploy, not blocking)**

Once deployed to sandbox, re-run the Playwright flow (scratchpad `tabs.mjs`): the SIGNATURE account must show exactly three cards — Place an order (Earn 3 points per $1 spent), Sign up (Earn 10 points), General Purpose (Earn 20 points) — with no duplicate "Place an order" cards.
