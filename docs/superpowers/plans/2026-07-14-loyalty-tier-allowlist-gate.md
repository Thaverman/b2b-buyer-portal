# Loyalty Tier-Allowlist Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fail-close the buyer portal's `/loyalty` page (and, by containment, the hero shipping tracker) behind the theme's influence.io tier allowlist (`window.loyaltyRolloutConfig.allowedTiers`), with semantics identical to the theme's four existing enforcement points.

**Architecture:** Three exported pure helpers in the page-local `api.ts` mirror the theme's `parseAllowedTiers`/`isTierAllowed` canon; `Loyalty/index.tsx` computes a tier verdict from the queries it already runs (digest → Launcher customer → tiers title lookup) and renders spinner-only while pending, the existing `loyalty.unavailable` state when denied, and today's UI when allowed or when the lever is off. No new transport, no new lang keys, no nav/route changes.

**Tech Stack:** React 18, TanStack Query (existing queries only), Vitest + Testing Library + MSW, `builder` factories.

**Spec:** `docs/superpowers/specs/2026-07-14-loyalty-tier-allowlist-gate-design.md`

## Global Constraints

- **All commands run from `apps/storefront/`.**
- Commit format: `type: B2B-0000 Short description` + trailing `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` line.
- Allowlist semantics MUST stay identical to the theme canon: CSV of tier names split on `,`, trimmed, lowercased, blanks dropped; **empty list ⇒ everyone allowed**; non-empty ⇒ case-insensitive trimmed exact membership; null/undefined/'' tier title NEVER matches a non-empty list; missing global ⇒ `(window.loyaltyRolloutConfig || {})` ⇒ empty list ⇒ fail OPEN.
- Lever ON + unverifiable (digest/JWT failure, Launcher customer failure incl. 404 notEnrolled, tiers failure, tier-less/blank title) ⇒ fail CLOSED to the existing `"Rewards are not available."` (`loyalty.unavailable`) — replacing the error/retry, session-expired, and not-enrolled UIs. Lever OFF ⇒ zero behavior change.
- Lever ON + verdict pending ⇒ `B3Spin` spinner only, no hero/tabs flash.
- Reuse `loyalty.unavailable`; no new lang keys. No `/customer/auth` transport.
- Test data MUST use `builder` factories; import test utilities from `tests/test-utils`.
- Before each commit run `npx eslint src/pages/Loyalty --max-warnings 0` (auto-fix + re-check). Do NOT run `yarn lint` until Task 3.
- `git add` exact file lists only — never `git add .`.
- Repo-wide lint/test redness outside branch files is a known pre-existing baseline (analytics.ts orphan, ManageSubscriptions eslint) — diff vs baseline, do not patch.
- TDD: capture the failing run before implementing.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `apps/storefront/src/index.d.ts` | Modify | `loyaltyRolloutConfig` Window type |
| `apps/storefront/src/pages/Loyalty/api.ts` | Modify (append) | `parseAllowedTiers` / `isTierAllowed` / `getAllowedTiers` |
| `apps/storefront/src/pages/Loyalty/api.test.ts` | Modify | Helper semantics table |
| `apps/storefront/src/pages/Loyalty/index.tsx` | Modify | Tier verdict + gate rendering |
| `apps/storefront/src/pages/Loyalty/index.test.tsx` | Modify | Gate behavior tests |

---

### Task 1: Allowlist helpers + Window type

**Files:**
- Modify: `apps/storefront/src/index.d.ts` (inside `interface Window`, directly after the `getLoyaltyShippingCalculation?: ...;` block added by the shipping-tracker feature)
- Modify: `apps/storefront/src/pages/Loyalty/api.ts` (append at end of file)
- Test: `apps/storefront/src/pages/Loyalty/api.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (Task 2 relies on exact names):
  - `parseAllowedTiers(csv: string | undefined): string[]` (exported)
  - `isTierAllowed(tierTitle: string | null | undefined, allowed: string[]): boolean` (exported)
  - `getAllowedTiers(): string[]` (exported)
  - `Window.loyaltyRolloutConfig?: { allowedTiers?: string }`

- [ ] **Step 1: Write the failing tests**

In `api.test.ts`: add `getAllowedTiers, isTierAllowed, parseAllowedTiers` to the existing `from './api'` import list (keep the list alphabetically sorted — `simple-import-sort` gates it). Extend the existing top-level `afterEach` to also clean the new global:

```ts
afterEach(() => {
  delete window.BC_CONTEXT;
  delete window.loyaltyShippingConfig;
  delete window.getLoyaltyShippingCalculation;
  delete window.loyaltyRolloutConfig;
});
```

Append at the end of the file (after the `describe('getShippingCalculation')` block):

```ts
describe('parseAllowedTiers', () => {
  it.each([
    [undefined, []],
    ['', []],
    [' , ,', []],
    ['ESSENTIAL,SELECT,SIGNATURE', ['essential', 'select', 'signature']],
    ['  Signature , select ', ['signature', 'select']],
  ] as [string | undefined, string[]][])('parses %j to %j', (csv, expected) => {
    expect(parseAllowedTiers(csv)).toEqual(expected);
  });
});

describe('isTierAllowed', () => {
  it.each([
    ['SIGNATURE', [], true],
    [null, [], true],
    ['SIGNATURE', ['signature'], true],
    ['  Signature ', ['signature'], true],
    ['ELITE', ['signature', 'select'], false],
    [null, ['signature'], false],
    [undefined, ['signature'], false],
    ['', ['signature'], false],
  ] as [string | null | undefined, string[], boolean][])(
    'tier %j vs list %j → %j',
    (tierTitle, allowed, expected) => {
      expect(isTierAllowed(tierTitle, allowed)).toBe(expected);
    },
  );
});

describe('getAllowedTiers', () => {
  it('degrades a missing rollout global to an empty allowlist (fail open)', () => {
    expect(getAllowedTiers()).toEqual([]);
  });

  it('reads and parses the theme rollout global', () => {
    window.loyaltyRolloutConfig = { allowedTiers: 'ESSENTIAL,SELECT,SIGNATURE' };

    expect(getAllowedTiers()).toEqual(['essential', 'select', 'signature']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/api.test.ts -t "AllowedTiers"`
Expected: FAIL — `parseAllowedTiers` / `getAllowedTiers` not exported. (The `isTierAllowed` describe fails the same way.)

- [ ] **Step 3: Add the Window type**

In `src/index.d.ts`, directly after the `getLoyaltyShippingCalculation?: () => Promise<{ ... }>;` block (inside `interface Window`, before `B3: {`):

```ts
    /** Theme-set rollout gate; absent (older theme deploys) = empty allowlist = everyone. */
    loyaltyRolloutConfig?: {
      allowedTiers?: string;
    };
```

- [ ] **Step 4: Implement the helpers**

Append at the end of `api.ts`:

```ts
// Rollout gate: mirrors the theme's parseAllowedTiers/isTierAllowed canon
// (influence-client.js) EXACTLY — CSV of tier names, trimmed, lowercased, blanks
// dropped; empty list = everyone; a null/blank tier title never matches a
// non-empty list (fail closed).
export const parseAllowedTiers = (csv: string | undefined): string[] =>
  (csv ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '');

export const isTierAllowed = (
  tierTitle: string | null | undefined,
  allowed: string[],
): boolean => {
  if (allowed.length === 0) {
    return true;
  }
  if (!tierTitle) {
    return false;
  }
  return allowed.includes(tierTitle.trim().toLowerCase());
};

// The `|| {}` mirrors the theme's cart-panel guard: a missing/blocked global
// degrades to an empty allowlist (fail open), never a throw.
export const getAllowedTiers = (): string[] =>
  parseAllowedTiers((window.loyaltyRolloutConfig || {}).allowedTiers);
```

- [ ] **Step 5: Run tests and type-check to verify green**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/api.test.ts && yarn tsc --noEmit && npx eslint src/pages/Loyalty --max-warnings 0 && npx eslint src/index.d.ts --max-warnings 0`
Expected: 66 tests pass (51 prior + 15 new); tsc exits 0; both eslint runs clean.

Note: do NOT run `yarn lint` — knip flags the three new exports as unused until Task 2 consumes them.

- [ ] **Step 6: Commit**

```bash
cd /home/thaverman/repos/customb2baccount/b2b-buyer-portal
git add apps/storefront/src/index.d.ts apps/storefront/src/pages/Loyalty/api.ts apps/storefront/src/pages/Loyalty/api.test.ts
git commit -m "feat: B2B-0000 Add loyalty tier-allowlist helpers mirroring the theme rollout gates

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Page-level fail-closed gate

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/index.tsx`
- Test: `apps/storefront/src/pages/Loyalty/index.test.tsx`

**Interfaces:**
- Consumes from Task 1 (exact): `getAllowedTiers(): string[]`, `isTierAllowed(tierTitle: string | null | undefined, allowed: string[]): boolean`.
- Produces: final user-visible gate behavior. ShippingTracker needs no change — it renders inside the gated page.

- [ ] **Step 1: Write the failing tests**

In `index.test.tsx`: extend the existing top-level `afterEach`:

```ts
afterEach(() => {
  delete window.BC_CONTEXT;
  delete window.loyaltyShippingConfig;
  delete window.getLoyaltyShippingCalculation;
  delete window.loyaltyRolloutConfig;
});
```

Append at the end of the file:

```ts
it('renders the page when the customer tier is on the rollout allowlist', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: 'ESSENTIAL,SELECT,SIGNATURE' };
  mockLoyaltyApis(
    buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't-sig', pointBalance: 2465 }),
  );
  mockTiers([buildTierWith({ id: 't-sig', title: 'SIGNATURE' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Earn points' })).toBeInTheDocument();
});

it('shows the unavailable state when the customer tier is not on the allowlist', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: 'essential,select' };
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't-sig' }));
  mockTiers([buildTierWith({ id: 't-sig', title: 'SIGNATURE' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Rewards are not available.')).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Earn points' })).not.toBeInTheDocument();
});

it('fails closed to unavailable on a digest failure while the allowlist is set', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: 'signature' };
  server.use(http.get(currentJwtUrl, () => HttpResponse.text('{"errors":[]}', { status: 401 })));
  mockTiers([buildTierWith({ id: 't-sig', title: 'SIGNATURE' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Rewards are not available.')).toBeInTheDocument();
  expect(
    screen.queryByText('Your session has expired — please sign in again.'),
  ).not.toBeInTheDocument();
});

it('fails closed to unavailable when the customer is not enrolled while the allowlist is set', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: 'signature' };
  mockJwt();
  mockDigest();
  server.use(http.get(`${launcherBase}/customer`, () => HttpResponse.json({}, { status: 404 })));
  mockTiers([buildTierWith({ id: 't-sig', title: 'SIGNATURE' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Rewards are not available.')).toBeInTheDocument();
  expect(
    screen.queryByText('Start earning points with your first order.'),
  ).not.toBeInTheDocument();
});

it('fails closed to unavailable when the tiers lookup fails while the allowlist is set', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: 'signature' };
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't-sig' }));
  server.use(
    http.get(`${launcherBase}/shop/tiers`, () => HttpResponse.json({}, { status: 500 })),
  );

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Rewards are not available.')).toBeInTheDocument();
});

it('treats an empty allowedTiers string as lever-off (current behavior)', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: '' };
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
});
```

(The 404 handler shape mirrors the existing not-enrolled test earlier in this file; the 401 JWT handler mirrors the existing session-expired test. Keep them consistent if those tests look different in the current tree.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/index.test.tsx`
Expected: the four deny-path tests FAIL (page renders instead of "Rewards are not available.", or the suppressed alerts appear); the allowed-tier and empty-string tests PASS (lever effectively off pre-implementation for 'allowed', and genuinely off for ''). All 42 pre-existing tests still pass.

- [ ] **Step 3: Implement the gate**

In `index.tsx`:

(a) Add `getAllowedTiers, isTierAllowed` to the `./api` import list (alphabetical position):

```ts
import {
  fetchLoyaltyCustomer,
  fetchTiers,
  getAllowedTiers,
  getLoyaltyDigest,
  isLoyaltyAvailable,
  isTierAllowed,
  LoyaltyError,
} from './api';
```

(b) Directly after the existing `if (!isAvailable) { ... }` early return, insert the verdict block — and MOVE the existing `tierTitle` computation (currently between the error-kind block and the JSX) up into it, so it is declared once, here:

```ts
  const tierTitle =
    (customer?.currentLoyaltyTierId &&
      tiers.find((tier) => tier.id === customer.currentLoyaltyTierId)?.title) ||
    null;

  // Theme rollout gate (spec 2026-07-14): with a non-empty allowlist every
  // unverifiable state fails CLOSED — matching the theme's four enforcement
  // points. With an empty list (or missing global) behavior is unchanged.
  const allowedTiers = getAllowedTiers();
  let tierVerdict: 'allowed' | 'denied' | 'pending' = 'allowed';
  if (allowedTiers.length > 0) {
    if (digestQuery.isError || customerQuery.isError || tiersQuery.isError) {
      tierVerdict = 'denied';
    } else if (customerQuery.isSuccess && tiersQuery.isSuccess) {
      tierVerdict = isTierAllowed(tierTitle, allowedTiers) ? 'allowed' : 'denied';
    } else {
      tierVerdict = 'pending';
    }
  }

  if (tierVerdict === 'pending') {
    // No hero/tabs flash to a possibly-denied member (theme hidden-shell principle).
    return (
      <B3Spin isSpinning>
        <Box sx={{ flex: 1, width: '100%', minHeight: 200 }} />
      </B3Spin>
    );
  }
  if (tierVerdict === 'denied') {
    return (
      <Box>
        <Typography sx={{ mt: 2 }}>{b3Lang('loyalty.unavailable')}</Typography>
      </Box>
    );
  }
```

(c) Delete the now-duplicate original `tierTitle` block (the one that sat just above the `return (` JSX). Nothing else in the component changes.

- [ ] **Step 4: Run the page suite, type-check, and scoped lint**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/index.test.tsx && yarn tsc --noEmit && npx eslint src/pages/Loyalty --max-warnings 0`
Expected: 48 tests pass (42 prior + 6 new); tsc exits 0; eslint clean.

- [ ] **Step 5: Commit**

```bash
cd /home/thaverman/repos/customb2baccount/b2b-buyer-portal
git add apps/storefront/src/pages/Loyalty/index.tsx apps/storefront/src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Fail-close the loyalty page behind the theme tier allowlist

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Full verification

**Files:** none (verification only; fix-forward if anything new fails).

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified green branch state.

- [ ] **Step 1: Type-check + full lint**

Run: `cd apps/storefront && yarn tsc --noEmit && yarn lint`
Expected: tsc exits 0. `yarn lint` fails ONLY on the pre-existing baseline (dependency-cruiser + knip: `src/utils/analytics.ts`; eslint: `src/pages/ManageSubscriptions/index.tsx`). knip must NOT flag `parseAllowedTiers`, `isTierAllowed`, or `getAllowedTiers`. Any NEW finding in branch-touched files must be fixed.

- [ ] **Step 2: Full Loyalty suite**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty`
Expected: all 6 test files PASS (127 tests: 66 api + 48 index + 10 icons + 1 SectionHeader + 1 mobile + 1 platform — if counts differ, all must PASS).

- [ ] **Step 3: Live verification note (post-deploy, not blocking)**

The lever is already ON at sandbox (`allowedTiers: 'ESSENTIAL,SELECT,SIGNATURE'`). Once this portal build deploys: the SIGNATURE test account (thaverman@storesupply.com) must still see the full Rewards page; a denied state can be exercised by temporarily flipping the theme's `loyalty_allowed_tiers` to exclude SIGNATURE (or a tier-less test account) and confirming "Rewards are not available." with no hero/tabs/tracker. Re-runnable with the existing Playwright login flow.
