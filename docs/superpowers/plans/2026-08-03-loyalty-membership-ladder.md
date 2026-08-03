# Loyalty Membership Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `fetchTierProgress`'s broken `site` param (unblocking tier-progress in production), restore Influence's membership catalog fetcher, and rebuild the "What's Available as Your Orders Grow?" ladder to source memberships (anchored by SSW data) instead of Influence tiers.

**Architecture:** Three independent-but-related changes: (A) a request-param source fix in the existing `fetchTierProgress`/`isTierProgressAvailable`, (B) restoring a previously-deleted Influence API fetcher (`fetchMemberships`), (C) a renamed-and-rewritten ladder component consuming (B)'s catalog anchored by (A)'s already-fetched `tierProgress.currentTierName`. B and C are the dependency: C needs `LoyaltyMembership`/`fetchMemberships` to exist. A is independent of both but ships first since it's the smallest, most isolated change.

**Tech Stack:** React 18, `@tanstack/react-query`, MUI, Vitest + Testing Library + MSW, builder/faker factories. All commands run from `apps/storefront/`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-03-loyalty-membership-ladder-design.md`.
- No copy changes anywhere — every `en.json` string and key name referenced by the ladder stays byte-identical (spec decision 6).
- `fetchTiers`/`LoyaltyTier`/`tiers` are NOT removed — the tier perk box (`BenefitsTab.tsx`) and the tier-allowlist gate (`index.tsx`) keep consuming them exactly as today.
- `window.B3.setting.store_hash` stays the source for `bigCommerceStoreId` — confirmed already correct, do not touch.
- The ladder's anchor is name-only (`tierProgress.currentTierName` against a hardcoded `['essential', 'select', 'signature']` order) — no id-based fallback of any kind.
- Run every command from `apps/storefront/`.
- Commit format: `type: B2B-0000 Subject` plus trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## File Structure

- **Modify** `src/index.d.ts` — add `loyalty_site_name?: string` to `Window`; remove `progressSite?: string` from `BC_CONTEXT.loyalty`.
- **Modify** `src/pages/Loyalty/api.ts` — remove `progressSite` from `LoyaltyConfig`; `isTierProgressAvailable`/`fetchTierProgress` read `window.loyalty_site_name`; restore `LoyaltyMembership`/`RawMembership`/`fetchMemberships`.
- **Modify** `src/pages/Loyalty/index.tsx` — add `membershipsQuery`/`memberships`; pass `memberships` to `BenefitsTab`.
- **Modify** `src/pages/Loyalty/components/BenefitsTab.tsx` — new `memberships` prop; swap `NextTiersSection` for `NextMembershipsSection`.
- **Create** `src/pages/Loyalty/components/NextMembershipsSection.tsx` (replaces `NextTiersSection.tsx`, which is deleted).
- **Test:** `src/pages/Loyalty/api.test.ts`, `src/pages/Loyalty/index.test.tsx`, `src/pages/Loyalty/loyaltyLanding.test.ts`, `src/pages/Login/index.test.tsx` (all four currently configure `progressSite` and must switch to `window.loyalty_site_name`).

---

## Task 1: Fix `fetchTierProgress`'s site param

**Files:**
- Modify: `src/index.d.ts:56-83` (Window block)
- Modify: `src/pages/Loyalty/api.ts:7-31,284-296`
- Test: `src/pages/Loyalty/api.test.ts:523-528` (`withProgressSite` helper + its describe blocks), `src/pages/Loyalty/index.test.tsx:45-51,205-230,955-978` (`afterEach`, `mockTierProgress`, two inline call sites), `src/pages/Loyalty/loyaltyLanding.test.ts:16-32` (`withProgressSite` + `afterEach`), `src/pages/Login/index.test.tsx:38-39,122-134,180-192` (`afterEach` + two inline call sites)

**Interfaces:**
- Consumes: nothing new.
- Produces: `isTierProgressAvailable(): boolean` and `fetchTierProgress(customerId: string | number): Promise<LoyaltyTierProgress | null>` — same signatures, same return shape, only the `site` request param's source changes. Every later task (and `loyaltyLanding.ts`, unmodified) keeps calling these exactly as today.

- [ ] **Step 1: Update the failing tests first — this repo's helpers are shared, so fixing each helper's body fixes every test that calls it**

In `src/pages/Loyalty/api.test.ts`, change (line 526-528):

```ts
const withProgressSite = () => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, progressSite: 'StoreSupply' } };
};
```

to:

```ts
const withProgressSite = () => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };
  window.loyalty_site_name = 'StoreSupply';
};
```

Change the two `isTierProgressAvailable` tests (line 530-540) from asserting on `progressSite` presence to asserting on `window.loyalty_site_name`:

```ts
describe('isTierProgressAvailable', () => {
  it('is false when loyalty_site_name is not configured', () => {
    expect(isTierProgressAvailable()).toBe(false);
  });

  it('is true when loyalty_site_name is set', () => {
    withProgressSite();

    expect(isTierProgressAvailable()).toBe(true);
  });
});
```

Add `delete window.loyalty_site_name;` to the file's `afterEach` block (next to `delete window.BC_CONTEXT;`, around line 58-63).

In `src/pages/Loyalty/index.test.tsx`, change the `mockTierProgress` helper (line 207-208):

```ts
const mockTierProgress = (progress: LoyaltyTierProgress) => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, progressSite: 'StoreSupply' } };
```

to:

```ts
const mockTierProgress = (progress: LoyaltyTierProgress) => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };
  window.loyalty_site_name = 'StoreSupply';
```

Change the two inline call sites (line 957 and line 970 — both `it()` blocks that set `window.BC_CONTEXT` directly instead of via `mockTierProgress`) from:

```ts
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, progressSite: 'StoreSupply' } };
```

to:

```ts
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };
  window.loyalty_site_name = 'StoreSupply';
```

Add `delete window.loyalty_site_name;` to this file's `afterEach` block (next to `delete window.BC_CONTEXT;`, around line 45-51).

In `src/pages/Loyalty/loyaltyLanding.test.ts`, change the `withProgressSite` helper (line 16-18):

```ts
const withProgressSite = () => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, progressSite: 'StoreSupply' } };
};
```

to:

```ts
const withProgressSite = () => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };
  window.loyalty_site_name = 'StoreSupply';
};
```

Add `delete window.loyalty_site_name;` to this file's `afterEach` block (next to `delete window.BC_CONTEXT;`, around line 31-32).

In `src/pages/Login/index.test.tsx`, there are two `it()` blocks (around line 122-134 and 180-192) that each set:

```ts
      window.BC_CONTEXT = {
        loyalty: {
          shopKey: 'store-key',
          apiBase: 'https://ssw.example.com/customers',
          appClientId: 'ssw-app-client-id',
          progressSite: 'StoreSupply',
        },
      };
```

Change **both** occurrences to:

```ts
      window.BC_CONTEXT = {
        loyalty: {
          shopKey: 'store-key',
          apiBase: 'https://ssw.example.com/customers',
          appClientId: 'ssw-app-client-id',
        },
      };
      window.loyalty_site_name = 'StoreSupply';
```

Add `delete window.loyalty_site_name;` to this file's `afterEach` block (next to `delete window.BC_CONTEXT;`, around line 38-39).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/api.test.ts src/pages/Loyalty/index.test.tsx src/pages/Loyalty/loyaltyLanding.test.ts src/pages/Login/index.test.tsx --run`
Expected: FAIL — `window.loyalty_site_name` is not a recognized `Window` property yet (type error surfaces at `tsc`, but Vitest will also fail at runtime since `api.ts` still reads `config.progressSite`, which is now always undefined in these tests).

- [ ] **Step 3: Add the `Window.loyalty_site_name` type and drop `progressSite`**

In `src/index.d.ts`, inside `BC_CONTEXT.loyalty` (around line 76-77), delete:

```ts
        /** SSW site key for GetDetailWithProgress (e.g. "StoreSupply"); absent = tier progress off. */
        progressSite?: string;
```

Add a new top-level `Window` property, next to `loyaltyRolloutConfig` (around line 100-104):

```ts
    /** SSW site key for GetDetailWithProgress (e.g. "StoreSupply"); absent = tier progress off. */
    loyalty_site_name?: string;
```

- [ ] **Step 4: Update `api.ts`**

Remove `progressSite?: string;` from the `LoyaltyConfig` interface (line 11):

```ts
interface LoyaltyConfig {
  shopKey: string;
  apiBase: string;
  appClientId: string;
  bannerUrl?: string;
  benefitsBannerUrl?: string;
}
```

Change `isTierProgressAvailable` (line 30-31):

```ts
export const isTierProgressAvailable = (): boolean =>
  isLoyaltyAvailable() && Boolean(window.loyalty_site_name);
```

Change the top of `fetchTierProgress` (line 287-296) from:

```ts
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
```

to:

```ts
  const config = requireConfig();
  const site = window.loyalty_site_name;
  if (!site) {
    throw new Error('Loyalty tier progress is not configured on this store');
  }
  const params = new URLSearchParams({
    site,
    bigCommerceStoreId: window.B3.setting.store_hash,
    bigCommerceCustomerId: String(customerId),
    recentTransactionsTake: '0',
  });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ src/pages/Login/ --run`
Expected: all green.

- [ ] **Step 6: Gates**

Run: `yarn tsc --noEmit` → clean.
Run: `npx eslint src/index.d.ts src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts src/pages/Loyalty/index.test.tsx src/pages/Loyalty/loyaltyLanding.test.ts src/pages/Login/index.test.tsx --max-warnings 0` → clean.

- [ ] **Step 7: Commit**

```bash
git add src/index.d.ts src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts src/pages/Loyalty/index.test.tsx src/pages/Loyalty/loyaltyLanding.test.ts src/pages/Login/index.test.tsx
git commit -m "fix: B2B-0000 Read the SSW tier-progress site key from window.loyalty_site_name" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Restore the membership catalog fetcher

**Files:**
- Modify: `src/pages/Loyalty/api.ts` (append near `fetchTiers`, after line 255)
- Modify: `src/pages/Loyalty/index.tsx:14-27,83-89` (import list, add `membershipsQuery`)
- Test: `src/pages/Loyalty/api.test.ts` (append after the `fetchTiers` describe block, which ends at line 232)

**Interfaces:**
- Consumes: `requireConfig()`, `launcherGet()` (both already defined in `api.ts`, used by `fetchTiers` immediately above this insertion point).
- Produces (Task 3 depends on these exact names):
  - `export interface LoyaltyMembership { id: string; title: string; description: string; perks: string[]; }`
  - `export const fetchMemberships: () => Promise<LoyaltyMembership[]>`
  - `index.tsx`: `const memberships: LoyaltyMembership[]` (via `membershipsQuery.data ?? []`)

- [ ] **Step 1: Write the failing tests**

In `src/pages/Loyalty/api.test.ts`, add `fetchMemberships` to the `./api` import block (alphabetical — after `fetchLoyaltyCustomer`, before `fetchRedeemRules`):

```ts
import {
  fetchEarnedRewards,
  fetchLoyaltyCustomer,
  fetchMemberships,
  fetchRedeemRules,
  fetchTierProgress,
  fetchTiers,
  getAllowedTiers,
  getBannerUrl,
  getBenefitsBannerUrl,
  getFaqIntro,
  getFaqSections,
  getLoyaltyDigest,
  getShippingCalculation,
  isRedeemableCatalogRule,
  isShippingTrackerAvailable,
  isTierAllowed,
  isTierProgressAvailable,
  LoyaltyError,
  LoyaltyIdentity,
  LoyaltyTierProgress,
  parseAllowedTiers,
  redeemReward,
} from './api';
```

Then append immediately after the `fetchTiers` describe block (which closes at line 232, right before `describe('parseThreshold'`):

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
              title: 'Essential',
              description: 'Entry-level membership',
              customerCount: 1240,
              perks: ['Free standard shipping'],
            },
            { id: 'm2', title: 'Select' },
          ],
        });
      }),
    );

    const result = await fetchMemberships();

    // customerCount is intentionally dropped (not buyer-facing)
    expect(result).toEqual([
      { id: 'm1', title: 'Essential', description: 'Entry-level membership', perks: ['Free standard shipping'] },
      { id: 'm2', title: 'Select', description: '', perks: [] },
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

Run: `CIRCLECI=true yarn test src/pages/Loyalty/api.test.ts --run -t "fetchMemberships"`
Expected: FAIL — `fetchMemberships` is not exported.

- [ ] **Step 3: Implement `fetchMemberships` in `api.ts`**

Add immediately after `fetchTiers` (after line 255, before `export interface LoyaltyTierProgress`):

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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/api.test.ts --run -t "fetchMemberships"`
Expected: PASS.

- [ ] **Step 5: Wire `membershipsQuery` into `index.tsx`**

Add `fetchMemberships` to the `./api` import block (alphabetical — between `fetchLoyaltyCustomer` and `fetchTierProgress`):

```ts
import {
  fetchLoyaltyCustomer,
  fetchMemberships,
  fetchTierProgress,
  fetchTiers,
  getAllowedTiers,
  getBannerUrl,
  getFaqIntro,
  getFaqSections,
  getLoyaltyDigest,
  isLoyaltyAvailable,
  isTierAllowed,
  isTierProgressAvailable,
  LoyaltyError,
} from './api';
```

After the `tiersQuery`/`tiers` block (line 83-89), add:

```ts
  const membershipsQuery = useQuery({
    queryKey: ['loyaltyMemberships'],
    queryFn: fetchMemberships,
    enabled: isAvailable,
    staleTime: Infinity,
  });
  const memberships = membershipsQuery.data ?? [];
```

(`memberships` is unused until Task 3 wires it into `BenefitsTab` — this is expected, interim `knip`/`eslint no-unused-vars` will flag it; Task 3 resolves it. Do not silence the lint rule.)

- [ ] **Step 6: Run the full Loyalty suite + gates**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run` → all green (the new `memberships` local is unused, which is a TS/lint concern, not a test failure — confirm no test regressions here; Step 7's gate run is where the unused-var warning will actually surface).
Run: `yarn tsc --noEmit` → clean (an unused `const` is not a type error).
Run: `npx eslint src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts src/pages/Loyalty/index.tsx --max-warnings 0` → **expected to fail** on `memberships` being unused. This is the known interim state from Step 5 — do not fix it in this task; Task 3 consumes it. Note the failure in your report and move on.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts src/pages/Loyalty/index.tsx
git commit -m "feat: B2B-0000 Restore the Influence memberships catalog fetcher" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Rebuild the ladder on memberships

**Files:**
- Create: `src/pages/Loyalty/components/NextMembershipsSection.tsx`
- Delete: `src/pages/Loyalty/components/NextTiersSection.tsx`
- Modify: `src/pages/Loyalty/components/BenefitsTab.tsx`
- Test: `src/pages/Loyalty/index.test.tsx` (add `buildMembershipWith`/`mockMemberships` helpers; replace the 10 ladder tests spanning today's lines 1872-2046)

**Interfaces:**
- Consumes: `LoyaltyMembership` from `../api` (Task 2); `memberships` local from `index.tsx` (Task 2, currently unused — this task is what consumes it).
- Produces: `NextMembershipsSection` default export, props `{ memberships: LoyaltyMembership[], currentTierName: string | null, atTop: boolean }`. Nothing downstream of this task depends on it further.

- [ ] **Step 1: Write the failing tests**

In `src/pages/Loyalty/index.test.tsx`, add `LoyaltyMembership` to the `./api` import block (alphabetical — between `LoyaltyIdentity` and `LoyaltyTier`):

```ts
import {
  EarnedReward,
  LoyaltyCustomer,
  LoyaltyIdentity,
  LoyaltyMembership,
  LoyaltyTier,
  LoyaltyTierProgress,
  RedeemRule,
} from './api';
```

Add a `buildMembershipWith`/`mockMemberships` pair right after `buildTierWith`/`mockTiers` (today's lines 116-124):

```ts
const buildMembershipWith = builder<LoyaltyMembership>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productAdjective(),
  description: faker.company.catchPhrase(),
  perks: [faker.company.catchPhrase()],
}));

const mockMemberships = (memberships: LoyaltyMembership[]) =>
  server.use(
    http.get(`${launcherBase}/shop/memberships`, () => HttpResponse.json({ memberships })),
  );
```

Now replace the whole block from `const rewardTiers = () => [` through the end of `it('falls back to the Influence tier id when the SSW tier name matches no tier'...)` (today's lines 1872-2046) with:

```ts
const rewardMemberships = () => [
  buildMembershipWith({ id: 'm1', title: 'Essential', description: '' }),
  buildMembershipWith({
    id: 'm2',
    title: 'Select',
    description: '8+ orders/year or $2,000+ annual spend',
    perks: ['2% monthly credit', 'an account rep'],
  }),
  buildMembershipWith({
    id: 'm3',
    title: 'Signature',
    description: '16+ orders/year or $5,000+ annual spend',
    perks: ['3% monthly credit'],
  }),
];

it('shows the memberships above the customer with their quota and perks', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships(rewardMemberships());
  mockTierProgress(buildTierProgressWith({ targetKind: 'NextTier', currentTierName: 'Essential' }));

  renderWithProviders(<Loyalty />, customerPreloadedState);

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

it('shows only the memberships above the customer, not current or lower ones', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships(rewardMemberships());
  mockTierProgress(buildTierProgressWith({ targetKind: 'NextTier', currentTierName: 'Select' }));

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('Signature Tier')).toBeInTheDocument();
  expect(
    screen.getByText('As your orders grow, so do your rewards. 1 more level is available:'),
  ).toBeInTheDocument();
  expect(screen.queryByText('Select Tier')).not.toBeInTheDocument();
  expect(screen.queryByText('Essential Tier')).not.toBeInTheDocument();
});

it('hides the membership ladder for a top-tier customer but keeps the contact footer', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships(rewardMemberships());
  mockTierProgress(
    buildTierProgressWith({ targetKind: 'AtTop', currentTierName: 'Signature', targetTierName: '' }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('Questions? Contact us at 1-833-397-2619')).toBeInTheDocument();
  expect(screen.queryByText("What's Available as Your Orders Grow?")).not.toBeInTheDocument();
  expect(
    screen.queryByText('When you reach the next level, your tier upgrades automatically.'),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Place your next order' })).toBeInTheDocument();
});

// Same iframe escape as the hero CTA above.
it('points the order CTA at the top-level window, not the portal frame', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships(rewardMemberships());

  renderWithProviders(<Loyalty />);

  const cta = await screen.findByRole('link', { name: 'Place your next order' });

  expect(cta).toHaveAttribute('href', `${window.location.origin}/`);
  expect(cta).toHaveAttribute('target', '_top');
});

it('hides the membership ladder when tier progress is unavailable', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships(rewardMemberships());

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Questions? Contact us at 1-833-397-2619')).toBeInTheDocument();
  expect(screen.queryByText("What's Available as Your Orders Grow?")).not.toBeInTheDocument();
});

it('hides the membership ladder when SSW reports a membership name matching none of the three', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships(rewardMemberships());
  mockTierProgress(
    buildTierProgressWith({ targetKind: 'NextTier', currentTierName: 'Renamed In SSW Only' }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('Questions? Contact us at 1-833-397-2619')).toBeInTheDocument();
  expect(screen.queryByText("What's Available as Your Orders Grow?")).not.toBeInTheDocument();
});

it('replaces the membership ladder with the top-tier message when SSW reports AtTop', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships(rewardMemberships());
  mockTierProgress(
    buildTierProgressWith({ targetKind: 'AtTop', currentTierName: 'Signature', targetTierName: '' }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(
    await screen.findByText(
      "You're at Signature, our top tier — you're already earning at the highest rate we offer.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("What's Available as Your Orders Grow?")).not.toBeInTheDocument();
  expect(screen.queryByText('Signature Tier')).not.toBeInTheDocument();
  // A non-null AtTop progress object must not wake the progress card or the hero CTA.
  expect(screen.queryByText(/Progress to/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Start shopping to earn points' }),
  ).not.toBeInTheDocument();
});

it('falls back to the generic top-tier message when SSW sends no membership name', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships(rewardMemberships());
  mockTierProgress(
    buildTierProgressWith({ targetKind: 'AtTop', currentTierName: '', targetTierName: '' }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(
    await screen.findByText(
      "You're at our top tier — you're already earning at the highest rate we offer.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("What's Available as Your Orders Grow?")).not.toBeInTheDocument();
});

it('matches the SSW membership name case-insensitively', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships(rewardMemberships());
  mockTierProgress(
    buildTierProgressWith({ targetKind: 'NextTier', currentTierName: 'SELECT', targetTierName: 'Signature' }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('Signature Tier')).toBeInTheDocument();
  expect(screen.queryByText('Select Tier')).not.toBeInTheDocument();
  expect(screen.queryByText('Essential Tier')).not.toBeInTheDocument();
});
```

Note: `mockTierProgress` (Task 1's already-fixed helper) sets up both `window.loyalty_site_name` and the `GetDetailWithProgress` mock — every test above that needs a specific `currentTierName`/`targetKind` calls it explicitly; the two that don't (`'points the order CTA...'`, `'hides the membership ladder when tier progress is unavailable'`) rely on no tier-progress mock existing, so `tierProgress` stays `null` and `currentTierName`/`atTop` both resolve to their "unresolved" defaults.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run -t "membership ladder|memberships above the customer|order CTA at the top-level|top-tier message|case-insensitively"`
Expected: FAIL — `NextMembershipsSection` doesn't exist yet; `BenefitsTab` still renders the old tier-sourced ladder.

- [ ] **Step 3: Create `NextMembershipsSection.tsx`**

```tsx
import { ArrowOutward } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyMembership } from '../api';

interface NextMembershipsSectionProps {
  memberships: LoyaltyMembership[];
  currentTierName: string | null;
  atTop: boolean;
}

const MEMBERSHIP_LADDER_ORDER = ['essential', 'select', 'signature'];

function NextMembershipsSection({ memberships, currentTierName, atTop }: NextMembershipsSectionProps) {
  const b3Lang = useB3Lang();

  const sswName = currentTierName?.trim() ?? '';

  // SSW is the only source consulted for placement (per the 2026-08-03 decision):
  // Influence is no longer trusted for "which membership is this customer in."
  if (atTop) {
    return (
      <Typography sx={{ textAlign: 'center' }}>
        {sswName
          ? b3Lang('loyalty.benefits.atTopTier', { tier: sswName })
          : b3Lang('loyalty.benefits.atTopTierGeneric')}
      </Typography>
    );
  }

  const anchorIndex = MEMBERSHIP_LADDER_ORDER.indexOf(sswName.toLowerCase());
  // Unknown or absent current membership: we cannot say what is "above," so show nothing.
  if (anchorIndex === -1) {
    return null;
  }

  const nextMemberships = MEMBERSHIP_LADDER_ORDER.slice(anchorIndex + 1)
    .map((name) => memberships.find((membership) => membership.title.trim().toLowerCase() === name))
    .filter((membership): membership is LoyaltyMembership => Boolean(membership));

  if (nextMemberships.length === 0) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 800, textAlign: 'center' }}>
        {b3Lang('loyalty.benefits.nextTiersTitle')}
      </Typography>
      <Typography sx={{ textAlign: 'center' }}>
        {nextMemberships.length === 1
          ? b3Lang('loyalty.benefits.nextTiersIntroOne')
          : b3Lang('loyalty.benefits.nextTiersIntroMany', { count: nextMemberships.length })}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {nextMemberships.map((membership) => (
          <Box
            key={membership.id}
            sx={{
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              borderRadius: 2,
              p: 3,
              flex: '1 1 40%',
              minWidth: 240,
            }}
          >
            <Box
              sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <Typography variant="h5" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>
                {b3Lang('loyalty.benefits.nextTierName', { title: membership.title })}
              </Typography>
              <ArrowOutward sx={{ fontSize: 32 }} />
            </Box>
            {membership.description.trim() !== '' && (
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>
                {`(${membership.description}) :`}
              </Typography>
            )}
            {membership.perks.length > 0 && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {membership.perks.join(', ')}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
      <Typography sx={{ textAlign: 'center' }}>{b3Lang('loyalty.benefits.autoUpgrade')}</Typography>
    </Box>
  );
}

export default NextMembershipsSection;
```

Delete `src/pages/Loyalty/components/NextTiersSection.tsx`: `git rm apps/storefront/src/pages/Loyalty/components/NextTiersSection.tsx`.

- [ ] **Step 4: Wire it into `BenefitsTab.tsx`**

Change the import (line 10) from:

```ts
import NextTiersSection from './NextTiersSection';
```

to:

```ts
import NextMembershipsSection from './NextMembershipsSection';
```

Add `LoyaltyMembership` to the `../api` import (line 7):

```ts
import {
  getBenefitsBannerUrl,
  LoyaltyCustomer,
  LoyaltyMembership,
  LoyaltyTier,
  LoyaltyTierProgress,
} from '../api';
```

Add `memberships` to `BenefitsTabProps` (line 13-18) and the function signature (line 58):

```ts
interface BenefitsTabProps {
  customer: LoyaltyCustomer | undefined;
  tiers: LoyaltyTier[];
  memberships: LoyaltyMembership[];
  tierProgress: LoyaltyTierProgress | null;
  tierDisplayName: string | null;
}
```

```ts
function BenefitsTab({ customer, tiers, memberships, tierProgress, tierDisplayName }: BenefitsTabProps) {
```

Replace the `<NextTiersSection ... />` call (line 139-144):

```tsx
      <NextTiersSection
        tiers={tiers}
        currentTierId={customer.currentLoyaltyTierId ?? null}
        currentTierName={tierProgress?.currentTierName || null}
        atTop={tierProgress?.targetKind === 'AtTop'}
      />
```

with:

```tsx
      <NextMembershipsSection
        memberships={memberships}
        currentTierName={tierProgress?.currentTierName || null}
        atTop={tierProgress?.targetKind === 'AtTop'}
      />
```

- [ ] **Step 5: Pass `memberships` from `index.tsx`**

In `src/pages/Loyalty/index.tsx`, find the `<BenefitsTab ... />` call (line 224-230) and add the new prop:

```tsx
        {activeTab === 'benefits' && (
          <BenefitsTab
            customer={customer}
            tiers={tiers}
            memberships={memberships}
            tierProgress={tierProgress}
            tierDisplayName={displayTierTitle}
          />
        )}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run`
Expected: all green.

- [ ] **Step 7: Gates**

Run: `yarn tsc --noEmit` → clean.
Run: `npx eslint src/pages/Loyalty/components/NextMembershipsSection.tsx src/pages/Loyalty/components/BenefitsTab.tsx src/pages/Loyalty/index.tsx src/pages/Loyalty/index.test.tsx --max-warnings 0` → clean.
Run: `yarn lint:knip` → clean at the `analytics.ts` baseline (confirms `NextTiersSection`'s deletion left no dangling references and `fetchMemberships`/`LoyaltyMembership` are now consumed).

- [ ] **Step 8: Commit**

```bash
git add src/pages/Loyalty/components/NextMembershipsSection.tsx src/pages/Loyalty/components/BenefitsTab.tsx src/pages/Loyalty/index.tsx src/pages/Loyalty/index.test.tsx
git rm src/pages/Loyalty/components/NextTiersSection.tsx
git commit -m "feat: B2B-0000 Source the benefits ladder from memberships anchored on SSW state" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** Part A (site param) → Task 1; Part B (membership catalog) → Task 2; Part C (ladder rebuild + wiring) → Task 3; the "no copy changes" decision is honored throughout (every `en.json` key/string referenced by `NextMembershipsSection` is identical to `NextTiersSection`'s); the two Influence-id-fallback tests are dropped per the spec's Testing section, not carried forward.
- **Wider blast radius found while planning:** the spec's File Structure section didn't name `loyaltyLanding.test.ts` or `Login/index.test.tsx`, but both configure `progressSite` today (`loyaltyLanding.ts` calls `isTierProgressAvailable`/`fetchTierProgress` directly) and would silently break under Task 1's change without their own fix — added to Task 1 explicitly.
- **Placeholder scan:** none — every step has literal code.
- **Type consistency:** `LoyaltyMembership { id, title, description, perks }` and `NextMembershipsSectionProps { memberships, currentTierName, atTop }` are identical across Task 2/3's code blocks and the spec.
