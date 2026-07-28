# Loyalty Login Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After login, land customers with an active tier journey (`GetDetailWithProgress` → `NextTier` or `PrePointsGate`) on `#/loyalty` instead of the role default — in both the portal-login and storefront-entry flows, with a 1500 ms budget and no late bounce.

**Architecture:** A page-owned decision module (`pages/Loyalty/loyaltyLanding.ts`) holds a module-level prefetch promise with three entry points: `prefetchLoyaltyLanding` (replaces — used by `loginInfo.ts` for the production head start and by `gotoAllowedAppPage` on storefront entry), `prefetchLoyaltyLandingIfIdle` (no-ops when a check is already pending — first line of `navigateAfterSuccessfulLogin`, which keeps the head start in production AND makes the flow testable, since Login tests `vi.mock('@/utils/loginInfo')` so the loginInfo prefetch never fires there), and `resolveLoyaltyLanding` (budget race, used once at decision time).

**Tech Stack:** React 18, MSW + Vitest, Redux store reads via `store.getState()`. All commands run from `apps/storefront/`.

## Global Constraints

- Run every command from `apps/storefront/`.
- Spec: `docs/superpowers/specs/2026-07-28-loyalty-login-landing-design.md`.
- Trigger is EXACTLY "fetchTierProgress returned non-null" (NextTier/PrePointsGate). AtTop, errors, timeout, missing `progressSite`, non-Stencil, masquerade, no customer id ⇒ normal landing. Never a late bounce.
- Precedence in the portal flow: quote-checkout → `loginJump` home-landing setting → loyalty check → today's role logic (the `MULTIPLE_B2C`+`SUPER_ADMIN` early return moves BELOW the loyalty check per spec decision 3; everything after the loyalty check stays byte-identical, including the existing B2C double-navigate quirk — do NOT "fix" it).
- Deep links / hash routes gain zero latency (`gotoAllowedAppPage` change lives only inside the no-hash branch).
- Existing Login tests never set `BC_CONTEXT`, so the check no-ops instantly for them — they must stay green with no added wall-time.
- `yarn lint:dependencies` is the arbiter for the cross-page imports (`pages/Login` → `pages/Loyalty`, `shared/routes` → `pages/Loyalty`, `utils` → `pages/Loyalty`); if it rejects any of them, STOP and report BLOCKED with the rule name (the spec's fallback is a relocation decision, not an improvisation).
- Tests: builders; utils from `tests/test-utils`; the budget-timeout test uses a REAL small budget (50 ms) against a hanging MSW handler, not fake timers.
- Commit format `type: B2B-0000 Subject` + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## File Structure

- **Create** `src/pages/Loyalty/loyaltyLanding.ts` + `src/pages/Loyalty/loyaltyLanding.test.ts` (Task 1).
- **Modify** `src/pages/Login/navigateAfterSuccessfulLogin.ts`, `src/pages/Login/index.tsx` (await), `src/utils/loginInfo.ts` (head-start prefetch), `src/shared/routes/index.tsx` (entry branch), `src/pages/Login/index.test.tsx` (Task 2).

---

## Task 1: The decision module

**Files:**
- Create: `src/pages/Loyalty/loyaltyLanding.ts`
- Test: `src/pages/Loyalty/loyaltyLanding.test.ts`

**Interfaces:**
- Consumes: `fetchTierProgress`, `isTierProgressAvailable`, `LoyaltyTierProgress` from `./api`.
- Produces (Task 2 relies on these exact signatures):
  - `prefetchLoyaltyLanding(customerId: number, isAgenting: boolean): void` — always replaces the stored check
  - `prefetchLoyaltyLandingIfIdle(customerId: number, isAgenting: boolean): void` — no-op when a check is already stored
  - `resolveLoyaltyLanding(budgetMs?: number): Promise<boolean>` (default 1500)

- [ ] **Step 1: Write the failing tests**

Create `src/pages/Loyalty/loyaltyLanding.test.ts`:

```ts
import { http, HttpResponse, startMockServer } from 'tests/test-utils';

import {
  prefetchLoyaltyLanding,
  prefetchLoyaltyLandingIfIdle,
  resolveLoyaltyLanding,
} from './loyaltyLanding';

const { server } = startMockServer();

const shopKey = 'store-key';
const apiBase = 'https://ssw.example.com/customers';
const appClientId = 'ssw-app-client-id';
const progressUrl = `${apiBase}/loyaltycustomersclient/GetDetailWithProgress`;

const withProgressSite = () => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, progressSite: 'StoreSupply' } };
};

const mockProgress = (targetKind: string) =>
  server.use(
    http.get(progressUrl, () =>
      HttpResponse.json({
        Success: true,
        Result: { TierProgress: { TargetKind: targetKind, TargetTierName: 'Signature' } },
      }),
    ),
  );

afterEach(() => {
  delete window.BC_CONTEXT;
});

// Module state persists within this file: this MUST stay the first test.
it('resolves false when no prefetch has happened', async () => {
  expect(await resolveLoyaltyLanding(50)).toBe(false);
});

it('resolves true for a NextTier customer', async () => {
  withProgressSite();
  mockProgress('NextTier');

  prefetchLoyaltyLanding(264074, false);

  expect(await resolveLoyaltyLanding()).toBe(true);
});

it('resolves true for a PrePointsGate customer', async () => {
  withProgressSite();
  mockProgress('PrePointsGate');

  prefetchLoyaltyLanding(264074, false);

  expect(await resolveLoyaltyLanding()).toBe(true);
});

it('resolves false for an AtTop customer', async () => {
  withProgressSite();
  mockProgress('AtTop');

  prefetchLoyaltyLanding(264074, false);

  expect(await resolveLoyaltyLanding()).toBe(false);
});

it('resolves false when the endpoint fails', async () => {
  withProgressSite();
  server.use(http.get(progressUrl, () => HttpResponse.json({}, { status: 500 })));

  prefetchLoyaltyLanding(264074, false);

  expect(await resolveLoyaltyLanding()).toBe(false);
});

it('resolves false when the endpoint is slower than the budget', async () => {
  withProgressSite();
  server.use(http.get(progressUrl, () => new Promise<never>(() => {})));

  prefetchLoyaltyLanding(264074, false);

  expect(await resolveLoyaltyLanding(50)).toBe(false);
});

it('does not call the endpoint without progressSite config', async () => {
  const requests = vi.fn();
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };
  server.use(
    http.get(progressUrl, () => {
      requests();
      return HttpResponse.json({});
    }),
  );

  prefetchLoyaltyLanding(264074, false);

  expect(await resolveLoyaltyLanding(50)).toBe(false);
  expect(requests).not.toHaveBeenCalled();
});

it('does not call the endpoint while masquerading', async () => {
  const requests = vi.fn();
  withProgressSite();
  server.use(
    http.get(progressUrl, () => {
      requests();
      return HttpResponse.json({});
    }),
  );

  prefetchLoyaltyLanding(264074, true);

  expect(await resolveLoyaltyLanding(50)).toBe(false);
  expect(requests).not.toHaveBeenCalled();
});

it('does not call the endpoint without a customer id', async () => {
  const requests = vi.fn();
  withProgressSite();
  server.use(
    http.get(progressUrl, () => {
      requests();
      return HttpResponse.json({});
    }),
  );

  prefetchLoyaltyLanding(0, false);

  expect(await resolveLoyaltyLanding(50)).toBe(false);
  expect(requests).not.toHaveBeenCalled();
});

it('replaces the previous check on a new prefetch', async () => {
  withProgressSite();
  mockProgress('NextTier');
  prefetchLoyaltyLanding(264074, false);
  expect(await resolveLoyaltyLanding()).toBe(true);

  mockProgress('AtTop');
  prefetchLoyaltyLanding(264074, false);
  expect(await resolveLoyaltyLanding()).toBe(false);
});

it('prefetchLoyaltyLandingIfIdle does not replace a pending check', async () => {
  withProgressSite();
  mockProgress('NextTier');
  prefetchLoyaltyLanding(264074, false);

  // Would resolve false if it replaced the stored NextTier check.
  mockProgress('AtTop');
  prefetchLoyaltyLandingIfIdle(264074, false);

  expect(await resolveLoyaltyLanding()).toBe(true);
});

it('prefetchLoyaltyLandingIfIdle leaves a stored resolved-null check in place', async () => {
  // A resolved-null check (from an ineligible prefetch) still counts as stored:
  // IfIdle only ever fills a slot that no prefetch has touched.
  withProgressSite();
  prefetchLoyaltyLanding(0, false); // stores resolved-null
  mockProgress('NextTier');
  prefetchLoyaltyLandingIfIdle(264074, false);

  expect(await resolveLoyaltyLanding(50)).toBe(false);
});
```

- [ ] **Step 2: Run to verify RED**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/loyaltyLanding.test.ts --run`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the module**

Create `src/pages/Loyalty/loyaltyLanding.ts`:

```ts
import { fetchTierProgress, isTierProgressAvailable, LoyaltyTierProgress } from './api';

// Module-level so the login flow can start the check early and the navigation
// decision can await (a slice of) it later without threading state through callers.
let pendingLanding: Promise<LoyaltyTierProgress | null> | null = null;

export const prefetchLoyaltyLanding = (customerId: number, isAgenting: boolean): void => {
  if (!isTierProgressAvailable() || isAgenting || !customerId) {
    pendingLanding = Promise.resolve(null);
    return;
  }
  // Swallow errors: a failed check must never break the login flow.
  pendingLanding = fetchTierProgress(customerId).catch(() => null);
};

// Safety net for flows where the early prefetch didn't run (and for tests that
// mock the login-info module): only fills an empty slot, never restarts an
// in-flight check — the production head start survives.
export const prefetchLoyaltyLandingIfIdle = (customerId: number, isAgenting: boolean): void => {
  if (pendingLanding === null) {
    prefetchLoyaltyLanding(customerId, isAgenting);
  }
};

// True only when the customer has an active tier journey (NextTier/PrePointsGate)
// AND the answer arrived within the budget. Callers use it once at navigation
// time — a late answer never causes a bounce.
export const resolveLoyaltyLanding = async (budgetMs = 1500): Promise<boolean> => {
  if (!pendingLanding) {
    return false;
  }
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), budgetMs);
  });
  const result = await Promise.race([pendingLanding, timeout]);
  return result !== null;
};
```

- [ ] **Step 4: GREEN + gates**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/loyaltyLanding.test.ts --run` → all pass (12 tests).
Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run` → whole Loyalty suite green.
Run: `yarn tsc --noEmit` → clean.
Run: `npx eslint src/pages/Loyalty/loyaltyLanding.ts src/pages/Loyalty/loyaltyLanding.test.ts --max-warnings 0` → clean.
NOTE: `yarn lint:knip` will flag the three new exports until Task 2 consumes them — expected interim.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Loyalty/loyaltyLanding.ts src/pages/Loyalty/loyaltyLanding.test.ts
git commit -m "feat: B2B-0000 Add the loyalty landing decision module" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Wire both login flows

**Files:**
- Modify: `src/pages/Login/navigateAfterSuccessfulLogin.ts`, `src/pages/Login/index.tsx`, `src/utils/loginInfo.ts`, `src/shared/routes/index.tsx`
- Test: `src/pages/Login/index.test.tsx`

**Interfaces:**
- Consumes from Task 1: all three module exports.
- Produces: `navigateAfterSuccessfulLogin` becomes `async` (its single caller at `src/pages/Login/index.tsx:139` awaits it).

- [ ] **Step 1: Write the failing tests**

The Login test harness (see `'should redirect junior buyer to /shoppingLists after successful login'`, `index.test.tsx:34`): MSW `graphql.mutation('Login', …)`, `vi.mocked(getCurrentCustomerInfo).mockResolvedValue({ userType: 5, role: 2, … })` (the whole `@/utils/loginInfo` module is mocked — which is exactly why `navigateAfterSuccessfulLogin` carries the `IfIdle` prefetch), `renderWithProviders` returning `{ navigation }`, and `expect(navigation).toHaveBeenCalledWith(expect.stringContaining('/shoppingLists'))`. The store's customer id must come from `preloadedState` since the mocked login never sets it.

Add inside the `'successful login and redirects'` describe, mirroring the junior-buyer test's setup lines exactly except as shown:

```ts
    it('lands on Rewards after login when the customer has an active tier journey', async () => {
      vi.mock('@/hooks/useB2BCallback');

      window.BC_CONTEXT = {
        loyalty: {
          shopKey: 'store-key',
          apiBase: 'https://ssw.example.com/customers',
          appClientId: 'ssw-app-client-id',
          progressSite: 'StoreSupply',
        },
      };
      server.use(
        graphql.mutation('Login', () => {
          return HttpResponse.json({
            data: {
              login: {
                result: {
                  storefrontLoginToken: '456',
                  token: '123',
                  permissions: [{ code: '1', permissionLevel: 1 }],
                },
              },
            },
          });
        }),
        http.get(
          'https://ssw.example.com/customers/loyaltycustomersclient/GetDetailWithProgress',
          () =>
            HttpResponse.json({
              Success: true,
              Result: { TierProgress: { TargetKind: 'PrePointsGate', TargetTierName: 'Signature' } },
            }),
        ),
      );

      vi.mocked(getCurrentCustomerInfo).mockResolvedValue({
        userType: 5,
        role: 2,
        companyRoleName: 'Junior Buyer',
      });

      const { navigation } = renderWithProviders(<LoginPage setOpenPage={vi.fn()} />, {
        preloadedState: { company: buildCompanyStateWith({ customer: { id: 264074 } }) },
      });

      await userEvent.type(screen.getByLabelText('Email address *'), 'test@example.com');
      await userEvent.type(screen.getByLabelText('Password *'), 'Password123');
      await userEvent.keyboard('{Enter}');

      await waitFor(() => {
        expect(navigation).toHaveBeenCalledWith(expect.stringContaining('/loyalty'));
      });
      // Rewards preempts the junior-buyer default entirely.
      expect(navigation).not.toHaveBeenCalledWith(expect.stringContaining('/shoppingLists'));
    });

    it('keeps the role default landing for an AtTop customer', async () => {
      vi.mock('@/hooks/useB2BCallback');

      window.BC_CONTEXT = {
        loyalty: {
          shopKey: 'store-key',
          apiBase: 'https://ssw.example.com/customers',
          appClientId: 'ssw-app-client-id',
          progressSite: 'StoreSupply',
        },
      };
      server.use(
        graphql.mutation('Login', () => {
          return HttpResponse.json({
            data: {
              login: {
                result: {
                  storefrontLoginToken: '456',
                  token: '123',
                  permissions: [{ code: '1', permissionLevel: 1 }],
                },
              },
            },
          });
        }),
        http.get(
          'https://ssw.example.com/customers/loyaltycustomersclient/GetDetailWithProgress',
          () => HttpResponse.json({ Success: true, Result: { TierProgress: { TargetKind: 'AtTop' } } }),
        ),
      );

      vi.mocked(getCurrentCustomerInfo).mockResolvedValue({
        userType: 5,
        role: 2,
        companyRoleName: 'Junior Buyer',
      });

      const { navigation } = renderWithProviders(<LoginPage setOpenPage={vi.fn()} />, {
        preloadedState: { company: buildCompanyStateWith({ customer: { id: 264074 } }) },
      });

      await userEvent.type(screen.getByLabelText('Email address *'), 'test@example.com');
      await userEvent.type(screen.getByLabelText('Password *'), 'Password123');
      await userEvent.keyboard('{Enter}');

      await waitFor(() => {
        expect(navigation).toHaveBeenCalledWith(expect.stringContaining('/shoppingLists'));
      });
      expect(navigation).not.toHaveBeenCalledWith(expect.stringContaining('/loyalty'));
    });
```

Imports to extend at the top of the file: `http` from `tests/test-utils` (alongside the existing `graphql`/`HttpResponse`). Add a top-level cleanup so the loyalty config never leaks:

```ts
  afterEach(() => {
    delete window.BC_CONTEXT;
  });
```

(inside the outer `describe('LoginPage', …)` next to the existing `beforeEach`).

Quote-checkout precedence: the restructure keeps `quoteDetailToCheckoutUrl` as
the first early return, so any existing quote-checkout redirect test stays green
untouched. If no such test exists in this file, note that in your report — do
NOT build a new harness for it (the precedence is structurally unchanged).

- [ ] **Step 2: Run to verify RED**

Run: `CIRCLECI=true yarn test src/pages/Login/index.test.tsx --run -t "active tier journey|AtTop customer"`
Expected: the eligible test FAILS (`/loyalty` never navigated); the AtTop test may already pass (locks the non-regression).

- [ ] **Step 3: Restructure `navigateAfterSuccessfulLogin`**

Replace `src/pages/Login/navigateAfterSuccessfulLogin.ts` with:

```ts
import { type NavigateFunction } from 'react-router-dom';

import { PATH_ROUTES } from '@/constants';
import {
  prefetchLoyaltyLandingIfIdle,
  resolveLoyaltyLanding,
} from '@/pages/Loyalty/loyaltyLanding';
import { store } from '@/store';
import { CustomerRole, UserTypes } from '@/types';
import { b2bJumpPath } from '@/utils/b3CheckPermissions/b2bPermissionPath';
import { loginJump } from '@/utils/b3Login';
import { CustomerInfo } from '@/utils/loginInfo';

export async function navigateAfterSuccessfulLogin(
  navigate: NavigateFunction,
  info: CustomerInfo | undefined,
  quoteDetailToCheckoutUrl: string,
): Promise<void> {
  // Safety net: the login sequence normally prefetches earlier (head start);
  // this fills the slot only if that didn't happen.
  const { company, b2bFeatures } = store.getState();
  prefetchLoyaltyLandingIfIdle(
    company.customer.id,
    b2bFeatures.masqueradeCompany.isAgenting,
  );

  if (quoteDetailToCheckoutUrl) {
    navigate(quoteDetailToCheckoutUrl);
    return;
  }

  const isLoginLandLocation = loginJump(navigate);

  if (!isLoginLandLocation) return;

  // Active-tier customers land on Rewards ahead of every role default
  // (spec 2026-07-28). Budget-bounded: an unresolved check falls through.
  if (await resolveLoyaltyLanding()) {
    navigate('/loyalty');
    return;
  }

  if (info?.userType === UserTypes.MULTIPLE_B2C && info?.role === CustomerRole.SUPER_ADMIN) {
    navigate('/dashboard');
    return;
  }

  if (info?.userType === UserTypes.B2C) {
    navigate(PATH_ROUTES.ORDERS);
  }

  const path = b2bJumpPath(Number(info?.role));

  navigate(path);
}
```

(The super-admin early return moved below the loyalty check and below `loginJump` — both sanctioned by the spec's precedence. The B2C double-navigate tail is pre-existing: untouched.)

In `src/pages/Login/index.tsx` (~line 139), await the call — `await navigateAfterSuccessfulLogin(navigate, info, quoteDetailToCheckoutUrl);` (make the enclosing function async if the compiler asks).

- [ ] **Step 4: Fire the head-start prefetch in the login sequence**

In `src/utils/loginInfo.ts`, locate the point inside `getCurrentCustomerInfo` where the logged-in customer has just been dispatched into the company slice:

Run: `grep -n "dispatch" src/utils/loginInfo.ts | head -30` and read around the customer-info dispatch (`loginCustomer` region, ~line 246+).

Immediately after that dispatch, insert:

```ts
  {
    const { company, b2bFeatures } = store.getState();
    prefetchLoyaltyLanding(company.customer.id, b2bFeatures.masqueradeCompany.isAgenting);
  }
```

with `import { prefetchLoyaltyLanding } from '@/pages/Loyalty/loyaltyLanding';` added. If the dispatch site turns out not to be common to all portal-form login variants, place it in the lowest common function instead and say so in your report — the `IfIdle` call in Step 3 already guarantees correctness either way; this step only buys the head start.

- [ ] **Step 5: Wire the storefront-entry flow**

In `src/shared/routes/index.tsx`, inside `gotoAllowedAppPage`'s
`if ((!url && role !== CustomerRole.GUEST && pathname.includes('account.php')) || isAccountEnter)`
branch, AFTER the existing `switch` block that sets `url` (so it overrides every role default), add:

```ts
    // Active-tier customers land on Rewards instead of the role default
    // (spec 2026-07-28); budget-bounded and fail-quiet.
    prefetchLoyaltyLanding(
      company.customer.id,
      currentState.b2bFeatures.masqueradeCompany.isAgenting,
    );
    if (await resolveLoyaltyLanding()) {
      url = '/loyalty';
    }
```

with `import { prefetchLoyaltyLanding, resolveLoyaltyLanding } from '@/pages/Loyalty/loyaltyLanding';`.
(`gotoAllowedAppPage` is already async; `company` and `currentState` are already in scope there. The existing route-permission `flag` check after this validates `/loyalty` like any URL.)

- [ ] **Step 6: GREEN + gates**

Run: `CIRCLECI=true yarn test src/pages/Login/index.test.tsx --run` → all green (new + existing; existing tests never set `BC_CONTEXT`, so the `IfIdle` prefetch stores a resolved-null and `resolveLoyaltyLanding` returns immediately — no added wall-time).
Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run` → green.
Run: `yarn tsc --noEmit` → clean.
Run: `npx eslint src/pages/Login/navigateAfterSuccessfulLogin.ts src/pages/Login/index.tsx src/utils/loginInfo.ts src/shared/routes/index.tsx src/pages/Login/index.test.tsx --max-warnings 0` → clean.
Run: `yarn lint:dependencies` → clean (cross-page/utils import arbiter — if it flags the new imports, STOP and report BLOCKED with the rule name).
Run: `yarn lint:knip` → back to the `analytics.ts` baseline (all Task 1 exports consumed).

- [ ] **Step 7: Commit**

```bash
git add src/pages/Login/navigateAfterSuccessfulLogin.ts src/pages/Login/index.tsx src/utils/loginInfo.ts src/shared/routes/index.tsx src/pages/Login/index.test.tsx
git commit -m "feat: B2B-0000 Land active-tier customers on Rewards after login" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Verification (whole feature)

- Both suites green; `tsc --noEmit` clean; scoped eslint clean; `yarn lint:dependencies` clean; `yarn lint:knip` at baseline; `yarn build` exit 0.
- Live (sandbox): an `AtTop` account (current test accounts) still lands on `#/orders`; once a `PrePointsGate`/`NextTier` account exists, it lands on `#/loyalty` via both the portal form and the storefront account link; masquerade unaffected.

## Notes / out of scope

- The Loyalty page refetches tier progress on mount (accepted duplicate call).
- The tier-allowlist-denied edge (lands on Rewards' "not available") is accepted per the spec.
- No "first login only" memory; no react-query cache seeding; no AbortController.
- One design refinement vs. the spec, forced by a test-infrastructure fact: Login tests mock `@/utils/loginInfo`, so the flow gained the idempotent `prefetchLoyaltyLandingIfIdle` safety net in `navigateAfterSuccessfulLogin` (production behavior unchanged — the head start survives because IfIdle never replaces a pending check).
