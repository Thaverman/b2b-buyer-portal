# Loyalty Free-Shipping Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a free-shipping progress bar in the Loyalty hero, driven by the theme-provided `window.loyaltyShippingConfig` + `window.getLoyaltyShippingCalculation()`, hidden gracefully when either is absent.

**Architecture:** Page-local `api.ts` gains a typed gate (`isShippingTrackerAvailable`) and a normalizing async wrapper (`getShippingCalculation`) around the theme's window function. A new self-contained `ShippingTracker` component (owns its `useQuery`, like the tab components) renders inside `LoyaltyHero`'s blue Box. The theme does all eligibility math; the portal only renders.

**Tech Stack:** React 18 function components, MUI (`LinearProgress`), TanStack Query, Vitest + Testing Library (window-global mocks — no MSW for the new endpoint; it's a window function), `builder` factories.

**Spec:** `docs/superpowers/specs/2026-07-09-loyalty-shipping-tracker-design.md`

## Global Constraints

- **All commands run from `apps/storefront/`.**
- Commit format: `type: B2B-0000 Short description` + trailing `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` line.
- Test data MUST use `builder` factories from `tests/test-utils`.
- Copy strings (exact): `"{amount} away from FREE shipping"`, `"{current} / {threshold}"`, `"You've earned FREE shipping!"` — placeholders receive `currencyFormat()` output verbatim (e.g. "$130.85 / $300.00", never "$300").
- Tracker renders **nothing** when: config absent, function absent, query loading, query rejected, or resolved threshold ≤ 0. No placeholder/spinner/error UI.
- Before each commit run `npx eslint src/pages/Loyalty --max-warnings 0` (auto-fix with `--fix`, re-check). Do NOT run `yarn lint` until Task 3 (knip flags the api exports as unused until the component consumes them).
- `git add` exact file lists only — never `git add .` (unrelated untracked files exist).
- Repo-wide lint/test redness outside this branch's files is a known pre-existing baseline (analytics.ts orphan, ManageSubscriptions eslint) — diff against baseline, do not patch.
- TDD: capture the failing run before implementing.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `apps/storefront/src/index.d.ts` | Modify | Window types for the two theme globals |
| `apps/storefront/src/pages/Loyalty/api.ts` | Modify (append) | Gate + normalizing wrapper |
| `apps/storefront/src/pages/Loyalty/api.test.ts` | Modify | Wrapper unit tests |
| `apps/storefront/src/pages/Loyalty/components/ShippingTracker.tsx` | Create | Self-contained tracker UI (own useQuery) |
| `apps/storefront/src/pages/Loyalty/components/LoyaltyHero.tsx` | Modify | Render `<ShippingTracker />` in the blue Box |
| `apps/storefront/src/lib/lang/locales/en.json` | Modify | 3 copy keys |
| `apps/storefront/src/pages/Loyalty/index.test.tsx` | Modify | Rendered-behavior tests |

---

### Task 1: Window types + api.ts shipping wrapper

**Files:**
- Modify: `apps/storefront/src/index.d.ts` (inside `interface Window`, directly after the `BC_CONTEXT?: { ... };` block's closing `};`, before `B3: {`)
- Modify: `apps/storefront/src/pages/Loyalty/api.ts` (append at end of file)
- Test: `apps/storefront/src/pages/Loyalty/api.test.ts`

**Interfaces:**
- Consumes: existing `LoyaltyError` class and `b2bLogger` import in `api.ts`.
- Produces (Task 2 relies on these exact names):
  - `isShippingTrackerAvailable(): boolean` (exported)
  - `getShippingCalculation(): Promise<ShippingCalculation>` (exported)
  - `ShippingCalculation` = `{ qualifies: boolean; threshold: number; eligibleSubtotal: number; remaining: number }` — interface stays **unexported** (knip: nothing imports it; an exported function may return an unexported interface).
  - `Window.loyaltyShippingConfig?` and `Window.getLoyaltyShippingCalculation?` typed globals.

- [ ] **Step 1: Write the failing tests**

In `api.test.ts`: add `getShippingCalculation, isShippingTrackerAvailable` to the existing `from './api'` import list. Extend the existing top-level `afterEach` from

```ts
afterEach(() => {
  delete window.BC_CONTEXT;
});
```

to

```ts
afterEach(() => {
  delete window.BC_CONTEXT;
  delete window.loyaltyShippingConfig;
  delete window.getLoyaltyShippingCalculation;
});
```

Then append at the end of the file:

```ts
const shippingConfig = { threshold: 300, excludedProductIds: '', excludedCategoryIds: '' };

type RawShippingCalculation = Awaited<
  ReturnType<NonNullable<Window['getLoyaltyShippingCalculation']>>
>;

const buildRawShippingCalculationWith = builder<RawShippingCalculation>(() => ({
  qualifies: faker.datatype.boolean(),
  threshold: faker.number.int({ min: 100, max: 999 }),
  eligibleSubtotal: faker.number.float({ min: 0, max: 999, fractionDigits: 2 }),
  remaining: faker.number.float({ min: 0, max: 999, fractionDigits: 2 }),
  excludedByProduct: [],
  excludedByCategory: [],
  ltlItems: [],
}));

describe('isShippingTrackerAvailable', () => {
  it('is false when loyaltyShippingConfig is absent', () => {
    window.getLoyaltyShippingCalculation = vi.fn();

    expect(isShippingTrackerAvailable()).toBe(false);
  });

  it('is false when getLoyaltyShippingCalculation is absent', () => {
    window.loyaltyShippingConfig = shippingConfig;

    expect(isShippingTrackerAvailable()).toBe(false);
  });

  it('is true when both theme globals are present', () => {
    window.loyaltyShippingConfig = shippingConfig;
    window.getLoyaltyShippingCalculation = vi.fn();

    expect(isShippingTrackerAvailable()).toBe(true);
  });
});

describe('getShippingCalculation', () => {
  it('normalizes a complete calculation result', async () => {
    window.loyaltyShippingConfig = shippingConfig;
    window.getLoyaltyShippingCalculation = vi.fn().mockResolvedValue(
      buildRawShippingCalculationWith({
        qualifies: false,
        threshold: 300,
        eligibleSubtotal: 130.85,
        remaining: 169.15,
      }),
    );

    const result = await getShippingCalculation();

    expect(result).toEqual({
      qualifies: false,
      threshold: 300,
      eligibleSubtotal: 130.85,
      remaining: 169.15,
    });
  });

  it('defaults missing fields, falling back to the config threshold', async () => {
    window.loyaltyShippingConfig = { ...shippingConfig, threshold: 500 };
    window.getLoyaltyShippingCalculation = vi.fn().mockResolvedValue({
      eligibleSubtotal: 130.85,
    });

    const result = await getShippingCalculation();

    expect(result).toEqual({
      qualifies: false,
      threshold: 500,
      eligibleSubtotal: 130.85,
      remaining: 369.15,
    });
  });

  it('defaults everything to zero on an empty result with no config', async () => {
    window.getLoyaltyShippingCalculation = vi.fn().mockResolvedValue({});

    const result = await getShippingCalculation();

    expect(result).toEqual({ qualifies: false, threshold: 0, eligibleSubtotal: 0, remaining: 0 });
  });

  it('logs and maps a rejection to upstream', async () => {
    window.loyaltyShippingConfig = shippingConfig;
    window.getLoyaltyShippingCalculation = vi.fn().mockRejectedValue(new Error('cart api down'));

    const error = await getShippingCalculation().catch((e) => e);

    expect(error).toBeInstanceOf(LoyaltyError);
    expect(error.kind).toBe('upstream');
    expect(b2bLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Loyalty: shipping calculation failed'),
    );
  });

  it('throws when the theme function is absent', async () => {
    const error = await getShippingCalculation().catch((e) => e);

    expect(error).toBeInstanceOf(Error);
  });
});
```

Note: `api.test.ts` already has `vi.mock('@/utils/b3Logger')` at the top. Add `import b2bLogger from '@/utils/b3Logger';` to the imports (it is not currently imported in the test file).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/api.test.ts -t "hipping"`
Expected: FAIL — `isShippingTrackerAvailable` / `getShippingCalculation` are not exported.

- [ ] **Step 3: Add the Window types**

In `src/index.d.ts`, directly after the `BC_CONTEXT?: { ... };` block's closing `};` (before `B3: {`):

```ts
    /** Theme-set free-shipping config; absent = shipping tracker off. */
    loyaltyShippingConfig?: {
      threshold: number;
      excludedProductIds: string;
      excludedCategoryIds: string;
    };
    /** Theme-provided cart shipping-eligibility calculation; absent until the theme ships it. */
    getLoyaltyShippingCalculation?: () => Promise<{
      qualifies?: boolean;
      threshold?: number;
      eligibleSubtotal?: number;
      remaining?: number;
      excludedByProduct?: unknown[];
      excludedByCategory?: unknown[];
      ltlItems?: unknown[];
    }>;
```

- [ ] **Step 4: Implement the wrapper**

Append at the end of `api.ts`:

```ts
interface ShippingCalculation {
  qualifies: boolean;
  threshold: number;
  eligibleSubtotal: number;
  remaining: number;
}

// The theme owns the eligibility math (excluded products/categories, LTL);
// the portal only renders. Both globals are absent until the theme ships them.
export const isShippingTrackerAvailable = (): boolean =>
  Boolean(window.loyaltyShippingConfig) &&
  typeof window.getLoyaltyShippingCalculation === 'function';

export const getShippingCalculation = async (): Promise<ShippingCalculation> => {
  const calculate = window.getLoyaltyShippingCalculation;
  if (!calculate) {
    throw new Error('Loyalty shipping calculation is not available on this store');
  }
  let raw: Awaited<ReturnType<typeof calculate>>;
  try {
    raw = await calculate();
  } catch (error) {
    b2bLogger.error(`Loyalty: shipping calculation failed — ${String(error)}`);
    throw new LoyaltyError('upstream');
  }
  const threshold = raw.threshold ?? window.loyaltyShippingConfig?.threshold ?? 0;
  const eligibleSubtotal = raw.eligibleSubtotal ?? 0;
  return {
    qualifies: raw.qualifies ?? false,
    threshold,
    eligibleSubtotal,
    remaining: raw.remaining ?? Math.max(0, threshold - eligibleSubtotal),
  };
};
```

- [ ] **Step 5: Run tests and type-check to verify green**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/api.test.ts && yarn tsc --noEmit && npx eslint src/pages/Loyalty --max-warnings 0`
Expected: all 51 tests pass (43 prior + 8 new); tsc exits 0; eslint clean.

- [ ] **Step 6: Commit**

```bash
cd /home/thaverman/repos/customb2baccount/b2b-buyer-portal
git add apps/storefront/src/index.d.ts apps/storefront/src/pages/Loyalty/api.ts apps/storefront/src/pages/Loyalty/api.test.ts
git commit -m "feat: B2B-0000 Add loyalty shipping calculation wrapper and window types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: ShippingTracker component, hero wiring, lang keys

**Files:**
- Create: `apps/storefront/src/pages/Loyalty/components/ShippingTracker.tsx`
- Modify: `apps/storefront/src/pages/Loyalty/components/LoyaltyHero.tsx`
- Modify: `apps/storefront/src/lib/lang/locales/en.json`
- Test: `apps/storefront/src/pages/Loyalty/index.test.tsx`

**Interfaces:**
- Consumes: `isEarnRuleForTier`-style exports from Task 1 — exactly `isShippingTrackerAvailable(): boolean` and `getShippingCalculation(): Promise<{ qualifies: boolean; threshold: number; eligibleSubtotal: number; remaining: number }>` from `../api`; `currencyFormat(price)` from `@/utils/b3CurrencyFormat` (defaults to `$` + 2 decimals in tests).
- Produces: `<ShippingTracker />` (no props), rendered by `LoyaltyHero`.

- [ ] **Step 1: Write the failing rendering tests**

In `index.test.tsx`: extend the existing top-level `afterEach` from

```ts
afterEach(() => {
  delete window.BC_CONTEXT;
});
```

to

```ts
afterEach(() => {
  delete window.BC_CONTEXT;
  delete window.loyaltyShippingConfig;
  delete window.getLoyaltyShippingCalculation;
});
```

Add after the `buildPointActivityWith` builder (before the first `it(...)` that follows it):

```ts
type RawShippingCalculation = Awaited<
  ReturnType<NonNullable<Window['getLoyaltyShippingCalculation']>>
>;

const buildRawShippingCalculationWith = builder<RawShippingCalculation>(() => ({
  qualifies: faker.datatype.boolean(),
  threshold: faker.number.int({ min: 100, max: 999 }),
  eligibleSubtotal: faker.number.float({ min: 0, max: 999, fractionDigits: 2 }),
  remaining: faker.number.float({ min: 0, max: 999, fractionDigits: 2 }),
  excludedByProduct: [],
  excludedByCategory: [],
  ltlItems: [],
}));

const mockShippingTracker = (
  result: RawShippingCalculation | Error,
  config = { threshold: 300, excludedProductIds: '', excludedCategoryIds: '' },
) => {
  window.loyaltyShippingConfig = config;
  window.getLoyaltyShippingCalculation = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
};
```

Append at the end of the file:

```ts
it('shows the free-shipping progress bar with remaining amount and caption', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockShippingTracker(
    buildRawShippingCalculationWith({
      qualifies: false,
      threshold: 300,
      eligibleSubtotal: 130.85,
      remaining: 169.15,
    }),
  );

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('$169.15 away from FREE shipping')).toBeInTheDocument();
  expect(screen.getByText('$130.85 / $300.00')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '44');
});

it('shows the qualified state with a full bar', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockShippingTracker(
    buildRawShippingCalculationWith({
      qualifies: true,
      threshold: 300,
      eligibleSubtotal: 350.1,
      remaining: 0,
    }),
  );

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText("You've earned FREE shipping!")).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
});

it('falls back to the config threshold when the calculation omits it', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockShippingTracker(
    buildRawShippingCalculationWith({
      qualifies: false,
      threshold: undefined,
      eligibleSubtotal: 130.85,
      remaining: undefined,
    }),
    { threshold: 500, excludedProductIds: '', excludedCategoryIds: '' },
  );

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('$369.15 away from FREE shipping')).toBeInTheDocument();
  expect(screen.getByText('$130.85 / $500.00')).toBeInTheDocument();
});

it('hides the shipping tracker when the theme config is absent', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));
  window.getLoyaltyShippingCalculation = vi
    .fn()
    .mockResolvedValue(buildRawShippingCalculationWith({}));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
  expect(screen.queryByText(/away from FREE shipping/)).not.toBeInTheDocument();
  expect(window.getLoyaltyShippingCalculation).not.toHaveBeenCalled();
});

it('hides the shipping tracker when the theme function is absent', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));
  window.loyaltyShippingConfig = { threshold: 300, excludedProductIds: '', excludedCategoryIds: '' };

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
  expect(screen.queryByText(/away from FREE shipping/)).not.toBeInTheDocument();
});

it('hides the shipping tracker when the calculation rejects', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));
  mockShippingTracker(new Error('cart api down'));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
  expect(screen.queryByText(/away from FREE shipping/)).not.toBeInTheDocument();
  expect(screen.queryByText("You've earned FREE shipping!")).not.toBeInTheDocument();
});

it('hides the shipping tracker when the resolved threshold is zero', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));
  mockShippingTracker(
    buildRawShippingCalculationWith({ threshold: undefined, remaining: undefined }),
    { threshold: 0, excludedProductIds: '', excludedCategoryIds: '' },
  );

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
  expect(screen.queryByText(/away from FREE shipping/)).not.toBeInTheDocument();
});
```

Note: `builder` overrides with explicit `undefined` (e.g. `threshold: undefined`) set the field to `undefined` — that is intentional here to simulate omitted payload fields. If the repo's `builder` utility instead drops `undefined` overrides, replace those two calls with plain object literals cast to `RawShippingCalculation` and note it in the report.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/index.test.tsx`
Expected: the three positive tests FAIL ("$169.15 away from FREE shipping" / "You've earned FREE shipping!" not found); the four hide tests pass vacuously (nothing renders yet) — expected at RED. All 34 pre-existing tests still pass.

- [ ] **Step 3: Add the lang keys**

In `src/lib/lang/locales/en.json`, insert directly after the line `"loyalty.retry": "Try again",` (keeps the shipping group inside the loyalty block, alphabetical within itself):

```json
  "loyalty.shipping.away": "{amount} away from FREE shipping",
  "loyalty.shipping.progress": "{current} / {threshold}",
  "loyalty.shipping.qualified": "You've earned FREE shipping!",
```

- [ ] **Step 4: Create the component**

Create `src/pages/Loyalty/components/ShippingTracker.tsx`:

```tsx
import { Box, LinearProgress, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import { currencyFormat } from '@/utils/b3CurrencyFormat';

import { getShippingCalculation, isShippingTrackerAvailable } from '../api';

function ShippingTracker() {
  const b3Lang = useB3Lang();

  const shippingQuery = useQuery({
    queryKey: ['loyaltyShipping'],
    queryFn: getShippingCalculation,
    enabled: isShippingTrackerAvailable(),
  });
  const calculation = shippingQuery.data;

  // Hidden while loading/errored/gate-off, and when threshold is unusable (0/0 bar).
  if (!calculation || calculation.threshold <= 0) {
    return null;
  }

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="body1" sx={{ fontWeight: 700 }}>
        {calculation.qualifies
          ? b3Lang('loyalty.shipping.qualified')
          : b3Lang('loyalty.shipping.away', { amount: currencyFormat(calculation.remaining) })}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={
          calculation.qualifies
            ? 100
            : Math.min(100, (calculation.eligibleSubtotal / calculation.threshold) * 100)
        }
        sx={{
          mt: 1,
          height: 8,
          borderRadius: 4,
          bgcolor: 'rgba(255, 255, 255, 0.3)',
          '& .MuiLinearProgress-bar': { bgcolor: 'common.white', borderRadius: 4 },
        }}
      />
      <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.9 }}>
        {b3Lang('loyalty.shipping.progress', {
          current: currencyFormat(calculation.eligibleSubtotal),
          threshold: currencyFormat(calculation.threshold),
        })}
      </Typography>
    </Box>
  );
}

export default ShippingTracker;
```

- [ ] **Step 5: Wire it into the hero**

In `LoyaltyHero.tsx`: add the import (its own group after the `../api`-level groups per `simple-import-sort` — run eslint `--fix` and keep whatever grouping it enforces):

```tsx
import ShippingTracker from './ShippingTracker';
```

and render it as the last child inside the blue hero `Box` — after the `{tierTitle && ( ... )}` block's closing `)}`, before the Box's `</Box>`:

```tsx
        <ShippingTracker />
```

- [ ] **Step 6: Run the Loyalty page suite to verify green**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty/index.test.tsx`
Expected: `Tests  41 passed (41)` (34 prior + 7 new). If the count differs, all must PASS.

- [ ] **Step 7: Commit**

```bash
cd /home/thaverman/repos/customb2baccount/b2b-buyer-portal
git add apps/storefront/src/pages/Loyalty/components/ShippingTracker.tsx apps/storefront/src/pages/Loyalty/components/LoyaltyHero.tsx apps/storefront/src/lib/lang/locales/en.json apps/storefront/src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Add free-shipping tracker to the loyalty hero

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
Expected: tsc exits 0. `yarn lint` fails ONLY on the pre-existing baseline (dependency-cruiser + knip: `src/utils/analytics.ts` orphan; eslint: `src/pages/ManageSubscriptions/index.tsx`). knip must NOT flag `isShippingTrackerAvailable`, `getShippingCalculation`, or `ShippingTracker.tsx`. Any NEW finding in branch-touched files must be fixed.

- [ ] **Step 2: Full Loyalty suite**

Run: `cd apps/storefront && yarn test --run src/pages/Loyalty`
Expected: all 4 test files PASS (94 tests: 51 api + 41 index + 1 mobile + 1 platform — if counts differ, all must PASS).

- [ ] **Step 3: Live verification note (post-theme-deploy, not blocking)**

The tracker stays hidden on sandbox until the theme ships `getLoyaltyShippingCalculation`. Once deployed: the Rewards hero must show the bar with real cart numbers ("$X away from FREE shipping", "$Y / $300.00"), flip to "You've earned FREE shipping!" when the cart's eligible subtotal crosses $300, and render nothing when the function is removed. Re-runnable with the existing Playwright login flow (scratchpad `tabs.mjs`).
