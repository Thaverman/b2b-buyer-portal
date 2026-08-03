# Loyalty Attribute Visibility Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the Smart Rewards nav entry, the `/loyalty` route, the page body, and the login-landing redirect unless the BigCommerce "Loyalty Tier" customer attribute has a non-empty value.

**Architecture:** The verdict is resolved **once at login** — where we know whether the API answered — and stored as a single boolean `Customer.isLoyaltyEntitled` on the existing `company` Redux slice. The attribute selection rides along on the customer query the portal already runs at login, so there is no extra round trip and the value is in Redux before the nav's first render. Three surfaces then read that one boolean: the `routeList` filter (which hides the nav entry *and* the route together), the page body, and the login-landing redirect.

**Tech Stack:** TypeScript, React 18, Redux Toolkit, BigCommerce Storefront GraphQL (via the B2B `bc-storefront` proxy), Vitest + Testing Library + MSW.

**Spec:** [../specs/2026-08-03-loyalty-attribute-visibility-gate-design.md](../specs/2026-08-03-loyalty-attribute-visibility-gate-design.md) — read the "Gate semantics" table and the "Why 'no answer' must not mean 'hidden'" section before Task 1.

## Global Constraints

- **All commands run from `apps/storefront/`.**
- **Commit format:** `type: TICKET-### Short description`, ticket `B2B-0000`. **Stage explicit paths only, never `git add -A`** — a parallel agent commits to this repo.
- **Baseline is measured, never assumed.** Before Task 1, run `yarn test --run src/pages/Loyalty` and `yarn tsc --noEmit` and record the result. The branch has pre-existing redness that is **not yours to fix**: FAQ tests failing because `en.json` says `"FAQs"` while tests query `"FAQ"`; 1 eslint error + 1 warning in `src/pages/ManageSubscriptions/index.tsx`; `src/utils/analytics.ts` flagged by knip and dependency-cruiser. Anything *else* that fails is yours.
- **The safe default is VISIBLE.** Every unknown, error, misconfiguration, or missing value must leave Loyalty exactly as it is today. The gate closes **only** when the attribute was successfully read and is blank. Getting this backwards hides the feature from every customer at once.
- **Never** add a Redux slice, Context provider, or `localStorage`/`sessionStorage`. `src/shared/**` must not import from `src/pages/**` (the reverse, and `src/utils/**` → `src/pages/Loyalty/**`, are established and fine).
- Imports: `@/` and `tests/` aliases only; test utilities from `tests/test-utils`.
- No `any`, no non-null assertions (`!`), no `console`.
- Do not touch the existing tier-allowlist gate (`getAllowedTiers`, `isTierAllowed`, `parseAllowedTiers`) or `loyaltyRolloutConfig`. This gate is **additive**.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/index.d.ts` | Add `tierAttributeId?: number` to the `BC_CONTEXT.loyalty` type |
| `src/pages/Loyalty/api.ts` | **`getTierAttributeId()`** and **`resolveLoyaltyEntitlement()`** — the whole policy, as pure functions beside the existing loyalty predicates |
| `src/shared/service/bc/graphql/user.ts` | Add the optional attribute selection to the existing login customer query |
| `src/types/company.ts` | `Customer.isLoyaltyEntitled: boolean` |
| `src/store/slices/company.ts` | Seed `initialState.customer.isLoyaltyEntitled: true` |
| `tests/storeStateBuilders/companyStateBuilder.ts` | Same default, so existing tests keep compiling |
| `src/utils/loginInfo.ts` | Resolve the verdict and put it in the dispatched customer payload |
| `src/shared/routeList.ts` | Surface 1 — nav entry + route |
| `src/pages/Loyalty/index.tsx` | Surface 2 — page body |
| `src/pages/Loyalty/loyaltyLanding.ts` + 3 call sites | Surface 3 — login redirect |
| `src/pages/Loyalty/api.test.ts` | Resolver unit tests |
| `src/pages/Loyalty/index.test.tsx` | Page-body gate tests |
| `src/pages/Loyalty/loyaltyLanding.test.ts` | Redirect gate test |
| `src/shared/routeList.test.ts` | **New file** — first test for the route/nav filter |

---

### Task 1: Resolve the verdict at login and store it

Deliverable: after login, `store.getState().company.customer.isLoyaltyEntitled` holds the correct verdict. No UI changes yet — nothing is hidden until Task 2.

**Files:**
- Modify: `apps/storefront/src/index.d.ts` (the `BC_CONTEXT.loyalty` block, ~line 69-82)
- Modify: `apps/storefront/src/pages/Loyalty/api.ts`
- Modify: `apps/storefront/src/shared/service/bc/graphql/user.ts`
- Modify: `apps/storefront/src/types/company.ts` (`interface Customer`, line 8)
- Modify: `apps/storefront/src/store/slices/company.ts` (`initialState.customer`, ~line 43-55)
- Modify: `apps/storefront/tests/storeStateBuilders/companyStateBuilder.ts` (`customer` default, ~line 15-25)
- Modify: `apps/storefront/src/utils/loginInfo.ts` (lines 247-256 and 280-292)
- Test: `apps/storefront/src/pages/Loyalty/api.test.ts`

**Interfaces:**
- Produces, from `@/pages/Loyalty/api`:
  - `getTierAttributeId(): number | undefined`
  - `resolveLoyaltyEntitlement(rawAttribute: RawTierAttribute | null | undefined): boolean`
  - `interface RawTierAttribute { entityId?: number; name?: string; value?: string | null }` (exported, because `loginInfo` passes one in)
- Produces, from `@/shared/service/bc/graphql/user`: `getCustomerInfo(tierAttributeId?: number)` — previously took no arguments.
- Produces: `Customer.isLoyaltyEntitled: boolean` (**required**, not optional — TypeScript then forces every construction site to be explicit).
- Consumed by Tasks 2 and 3 via `store.getState().company.customer.isLoyaltyEntitled` / `useAppSelector`.

- [ ] **Step 1: Record the baseline**

Run `yarn test --run src/pages/Loyalty` and `yarn tsc --noEmit`. Write the exact counts into your report. If a Loyalty test fails for any reason other than the FAQ naming issue named in Global Constraints, **stop and report `NEEDS_CONTEXT`** — you need a clean read on what you inherited.

- [ ] **Step 2: Write the failing resolver tests**

Add to `apps/storefront/src/pages/Loyalty/api.test.ts`. Follow the file's existing conventions for setting/clearing `window.BC_CONTEXT`.

```ts
describe('resolveLoyaltyEntitlement', () => {
  const withTierAttributeId = (tierAttributeId?: number) => {
    window.BC_CONTEXT = {
      loyalty: {
        shopKey: 'shop-key',
        apiBase: 'https://ssw.example.com/customers',
        appClientId: 'app-client-id',
        ...(tierAttributeId === undefined ? {} : { tierAttributeId }),
      },
    };
  };

  it('is entitled when the attribute has a value', () => {
    withTierAttributeId(2);

    expect(
      resolveLoyaltyEntitlement({ entityId: 2, name: 'Loyalty Tier', value: 'Signature' }),
    ).toBe(true);
  });

  it('is NOT entitled when the attribute was read and is blank', () => {
    withTierAttributeId(2);

    expect(resolveLoyaltyEntitlement({ entityId: 2, name: 'Loyalty Tier', value: '' })).toBe(false);
    expect(resolveLoyaltyEntitlement({ entityId: 2, name: 'Loyalty Tier', value: '   ' })).toBe(
      false,
    );
    expect(resolveLoyaltyEntitlement({ entityId: 2, name: 'Loyalty Tier', value: null })).toBe(
      false,
    );
  });

  // The gate is a rollout lever a store opts into; an un-opted store keeps today's behaviour.
  it('stays entitled when no tierAttributeId is configured, whatever the payload says', () => {
    withTierAttributeId(undefined);

    expect(resolveLoyaltyEntitlement({ entityId: 2, name: 'Loyalty Tier', value: '' })).toBe(true);
    expect(resolveLoyaltyEntitlement(undefined)).toBe(true);
  });

  // THE important case: "the API did not answer" must never read as "no tier".
  it('stays entitled when the attribute object is absent despite being configured', () => {
    withTierAttributeId(2);

    expect(resolveLoyaltyEntitlement(undefined)).toBe(true);
    expect(resolveLoyaltyEntitlement(null)).toBe(true);
  });

  // Guards against the configured id drifting onto a different attribute, which would
  // otherwise hide Loyalty from everyone.
  it('stays entitled and logs when the id points at a differently-named attribute', () => {
    withTierAttributeId(2);

    expect(
      resolveLoyaltyEntitlement({ entityId: 2, name: 'SxeCustomerNumber', value: '5137301' }),
    ).toBe(true);
    expect(b2bLogger.error).toHaveBeenCalled();
  });

  it('ignores a non-integer configured id rather than injecting it into the query', () => {
    window.BC_CONTEXT = {
      loyalty: {
        shopKey: 'shop-key',
        apiBase: 'https://ssw.example.com/customers',
        appClientId: 'app-client-id',
        tierAttributeId: '2 } malformed' as unknown as number,
      },
    };

    expect(getTierAttributeId()).toBeUndefined();
    expect(resolveLoyaltyEntitlement({ entityId: 2, name: 'Loyalty Tier', value: '' })).toBe(true);
  });
});
```

If `api.test.ts` does not already mock the logger, add `vi.mock('@/utils/b3Logger')` at the top of the file alongside the existing mocks.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty/api.test.ts`
Expected: the new `describe` block fails — `resolveLoyaltyEntitlement` and `getTierAttributeId` are not exported yet.

- [ ] **Step 4: Add the config type**

In `apps/storefront/src/index.d.ts`, inside the `BC_CONTEXT.loyalty` object type, after `appClientId`:

```ts
        /**
         * entityId of the BigCommerce "Loyalty Tier" customer attribute. Absent =
         * the visibility gate is OFF and Loyalty shows for everyone, as before.
         * Find it with GET /v3/customers/attributes?name=Loyalty Tier (server-side).
         */
        tierAttributeId?: number;
```

- [ ] **Step 5: Add the resolver**

In `apps/storefront/src/pages/Loyalty/api.ts`, add to the `LoyaltyConfig` interface (which is module-internal):

```ts
  tierAttributeId?: number;
```

Then add, next to `isLoyaltyAvailable` / `isTierProgressAvailable`:

```ts
/** The `loyaltyTier` alias returned by the login customer query. */
export interface RawTierAttribute {
  entityId?: number;
  name?: string;
  value?: string | null;
}

const TIER_ATTRIBUTE_NAME = 'Loyalty Tier';

// Number.isInteger both validates and makes interpolating the id into a GraphQL
// document safe — the value comes from a host-set global and is not to be trusted.
export const getTierAttributeId = (): number | undefined => {
  const configured = getLoyaltyConfig()?.tierAttributeId;
  return Number.isInteger(configured) ? configured : undefined;
};

// TRUE keeps Loyalty visible. It closes ONLY on a successfully-read, blank attribute:
// "we could not find out" is not a verdict about this customer, and treating it as one
// would hide Loyalty from everybody the moment the id drifted or the schema changed.
export const resolveLoyaltyEntitlement = (
  rawAttribute: RawTierAttribute | null | undefined,
): boolean => {
  const tierAttributeId = getTierAttributeId();
  if (tierAttributeId === undefined) {
    return true;
  }
  if (!rawAttribute) {
    b2bLogger.error(
      `Loyalty: attribute ${tierAttributeId} was requested but nothing came back — leaving Loyalty visible`,
    );
    return true;
  }
  if (rawAttribute.name !== TIER_ATTRIBUTE_NAME) {
    b2bLogger.error(
      `Loyalty: attribute ${tierAttributeId} is named "${rawAttribute.name ?? ''}", not "${TIER_ATTRIBUTE_NAME}" — check BC_CONTEXT.loyalty.tierAttributeId; leaving Loyalty visible`,
    );
    return true;
  }
  return (rawAttribute.value ?? '').trim() !== '';
};
```

- [ ] **Step 6: Run the resolver tests**

Run: `yarn test --run src/pages/Loyalty/api.test.ts`
Expected: PASS, including the pre-existing tests in that file.

- [ ] **Step 7: Add the attribute selection to the login query**

Replace the body of `apps/storefront/src/shared/service/bc/graphql/user.ts`:

```ts
import B3Request from '../../request/b3Fetch';

// Omitted entirely when no id is configured, so an un-opted store sends exactly the
// query it sends today. The id is Number.isInteger-checked by its caller.
const tierAttributeSelection = (tierAttributeId?: number) =>
  tierAttributeId === undefined
    ? ''
    : `attributes {
    loyaltyTier: attribute(entityId: ${tierAttributeId}) {
      entityId,
      name,
      value,
    }
  }`;

const getCustomer = (tierAttributeId?: number) => `query customer {
  customer{
    entityId,
    phone,
    firstName,
    lastName,
    email,
    customerGroupId,
    ${tierAttributeSelection(tierAttributeId)}
  }
}`;

const getCustomerInfo = (tierAttributeId?: number) =>
  B3Request.graphqlBCProxy({
    query: getCustomer(tierAttributeId),
  });

export { getCustomerInfo };
```

- [ ] **Step 8: Add the required field and its two defaults**

`apps/storefront/src/types/company.ts`, inside `interface Customer`:

```ts
  /**
   * Whether Loyalty is visible to this customer, decided at login from the
   * BigCommerce "Loyalty Tier" customer attribute. True when entitled AND when the
   * gate is inactive (unconfigured, misconfigured, or unreadable); false only when
   * the attribute was genuinely read and is blank.
   */
  isLoyaltyEntitled: boolean;
```

`apps/storefront/src/store/slices/company.ts`, in `initialState.customer`, and
`apps/storefront/tests/storeStateBuilders/companyStateBuilder.ts`, in its `customer`
default — add the same line to both:

```ts
    isLoyaltyEntitled: true,
```

- [ ] **Step 9: Wire it into login**

In `apps/storefront/src/utils/loginInfo.ts`, add to the existing import from `@/pages/Loyalty/loyaltyLanding` on line 1 a second import:

```ts
import { getTierAttributeId, resolveLoyaltyEntitlement } from '@/pages/Loyalty/api';
```

Change the `getCustomerInfo()` call to pass the id:

```ts
    const data = await getCustomerInfo(getTierAttributeId());
```

Add `attributes` to the destructure of `loginCustomer` (lines 247-256), after `customerGroupId`:

```ts
      attributes,
```

Then in the `customerInfo` object (lines 280-292), after `companyRoleName`:

```ts
        isLoyaltyEntitled: resolveLoyaltyEntitlement(attributes?.loyaltyTier),
```

- [ ] **Step 10: Type-check, lint and run the suites**

Run each:

```bash
yarn tsc --noEmit
yarn test --run src/pages/Loyalty
../../node_modules/.bin/eslint --max-warnings 0 src/pages/Loyalty src/shared/service/bc/graphql/user.ts src/utils/loginInfo.ts src/types/company.ts src/store/slices/company.ts
```

Expected: `tsc` clean; Loyalty suites at the Step 1 baseline plus your new passing tests; eslint clean on those paths. If `tsc` reports a missing `isLoyaltyEntitled` anywhere you have not touched, that is the required-field check doing its job — add the value there and note it in your report.

- [ ] **Step 11: Commit**

```bash
git add apps/storefront/src/index.d.ts \
        apps/storefront/src/pages/Loyalty/api.ts \
        apps/storefront/src/pages/Loyalty/api.test.ts \
        apps/storefront/src/shared/service/bc/graphql/user.ts \
        apps/storefront/src/types/company.ts \
        apps/storefront/src/store/slices/company.ts \
        apps/storefront/tests/storeStateBuilders/companyStateBuilder.ts \
        apps/storefront/src/utils/loginInfo.ts
git commit -m "feat: B2B-0000 Resolve Loyalty entitlement from the tier attribute at login"
```

---

### Task 2: Hide the nav entry and the route

Deliverable: with `isLoyaltyEntitled: false`, the Smart Rewards nav entry is gone and `/loyalty` is not a route.

**Files:**
- Modify: `apps/storefront/src/shared/routeList.ts` (the `/loyalty` block, lines 297-304)
- Test: `apps/storefront/src/shared/routeList.test.ts` (**new file**)

**Interfaces:**
- Consumes: `Customer.isLoyaltyEntitled` from Task 1, read via the imperative `store.getState()` that this function already uses.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Create `apps/storefront/src/shared/routeList.test.ts`. This is the **first** test for
this filter, so it establishes the pattern.

The signature is `getAllowedRoutesWithoutComponent(globalState: GlobalState): BuyerPortalRoute[]`
(routeList.ts:269). It takes `storefrontConfig`/`quoteConfig` from its argument but reads
`company` and `b2bFeatures` **imperatively** from the real store — so the store must be
primed by dispatching, not passed in. `platform` is already `'bigcommerce'` in the test
environment (`tests/setup-test-environment.ts`).

```ts
import { buildCompanyStateWith, buildGlobalStateWith } from 'tests/storeStateBuilders';

import { store } from '@/store';
import { setCustomerInfo } from '@/store/slices/company';

import { getAllowedRoutesWithoutComponent } from './routeList';

const loyaltyConfig = {
  shopKey: 'shop-key',
  apiBase: 'https://ssw.example.com/customers',
  appClientId: 'app-client-id',
};

// The filter reads company.customer off the singleton store, so prime it by dispatching
// a complete Customer — the builder's default supplies every required field.
const primeCustomer = (isLoyaltyEntitled: boolean) => {
  const { customer } = buildCompanyStateWith({});
  store.dispatch(setCustomerInfo({ ...customer, isLoyaltyEntitled }));
};

const hasLoyaltyRoute = () =>
  getAllowedRoutesWithoutComponent(buildGlobalStateWith({})).some(
    (route) => route.path === '/loyalty',
  );

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('offers the loyalty route when the customer is loyalty-entitled', () => {
  window.BC_CONTEXT = { loyalty: loyaltyConfig };
  primeCustomer(true);

  expect(hasLoyaltyRoute()).toBe(true);
});

it('withholds the loyalty route when the customer is not loyalty-entitled', () => {
  window.BC_CONTEXT = { loyalty: loyaltyConfig };
  primeCustomer(false);

  expect(hasLoyaltyRoute()).toBe(false);
});

// The pre-existing host-config gate must still win on its own, so that adding the
// entitlement term did not accidentally make an unconfigured store show Loyalty.
it('withholds the loyalty route when the host has no loyalty config, even if entitled', () => {
  primeCustomer(true);

  expect(hasLoyaltyRoute()).toBe(false);
});
```

**Correction (found during execution):** `buildGlobalStateWith({})` does **not**
satisfy this parameter. There are two different interfaces both named `GlobalState` —
`@/store/slices/global` (what the builder makes) and `@/shared/global/context/config`
(what `getAllowedRoutesWithoutComponent` actually takes, ~20 more required props).
Build off the real `initState` export from `@/shared/global/context/config`:
`builder<GlobalState>(() => initState)`. Do not weaken the type with a cast.

**If priming the singleton store proves unworkable, do not fight it** — assert through
the rendered nav instead (`renderWithProviders` with `preloadedState`, then assert on the
`Smart Rewards` menu link). Either level is acceptable; what must be pinned is that a
`false` verdict removes the entry. Report which level you used and why.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test --run src/shared/routeList.test.ts`
Expected: the "withholds … when the customer is not loyalty-entitled" test fails —
`/loyalty` is still present because the gate does not exist yet. The other two pass
already, which is what makes the failing one meaningful.

- [ ] **Step 3: Add the gate**

In `apps/storefront/src/shared/routeList.ts`, extend the existing `/loyalty` block. Note the comment update — the reason list grows:

```ts
    // /loyalty is Stencil-only, host-configured, hidden while agenting — the loyalty
    // digest identifies the logged-in rep, not the masqueraded buyer — and hidden
    // unless the "Loyalty Tier" customer attribute has a value (resolved at login;
    // defaults to entitled so no failure mode hides it from everyone).
    if (
      path === '/loyalty' &&
      (platform !== 'bigcommerce' ||
        !window.BC_CONTEXT?.loyalty ||
        isAgenting ||
        !isLoyaltyEntitled)
    ) {
      return false;
    }
```

The value comes from the destructure already at routeList.ts:272 — change:

```ts
  const { role } = company.customer;
```
to:
```ts
  const { role, isLoyaltyEntitled } = company.customer;
```

**Do not import anything from `src/pages/`** — dependency-cruiser forbids `shared` → `pages`, and the resolved boolean is already in Redux precisely so this file does not need to.

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test --run src/shared/routeList.test.ts`
Expected: all four cases pass.

- [ ] **Step 5: Confirm nothing else regressed and dependency rules still hold**

```bash
yarn tsc --noEmit
yarn test --run src/pages/Loyalty
yarn lint:dependencies
```

Expected: `tsc` clean; Loyalty suites at baseline (the page-body gate is Task 3, so nothing there should change yet); `lint:dependencies` shows **only** the known `src/utils/analytics.ts` orphan — if it reports a new `shared` → `pages` violation, you added an import that must be removed.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/shared/routeList.ts apps/storefront/src/shared/routeList.test.ts
git commit -m "feat: B2B-0000 Hide the Loyalty nav entry and route when not entitled"
```

---

### Task 3: Gate the page body and the login redirect

Deliverable: the page cannot render for a non-entitled customer even via a stale tab or programmatic navigation, and login never redirects them to `/loyalty`.

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/index.tsx` (line 56)
- Modify: `apps/storefront/src/pages/Loyalty/loyaltyLanding.ts` (lines 6-22)
- Modify: `apps/storefront/src/utils/loginInfo.ts` (line 347)
- Modify: `apps/storefront/src/shared/routes/index.tsx` (line 192)
- Modify: `apps/storefront/src/pages/Login/navigateAfterSuccessfulLogin.ts` (line 22)
- Test: `apps/storefront/src/pages/Loyalty/index.test.tsx`, `apps/storefront/src/pages/Loyalty/loyaltyLanding.test.ts`

**Interfaces:**
- Consumes: `Customer.isLoyaltyEntitled` from Task 1.
- Produces: `prefetchLoyaltyLanding(customerId: number, isAgenting: boolean, isLoyaltyEntitled?: boolean)` and `prefetchLoyaltyLandingIfIdle(customerId: number, isAgenting: boolean, isLoyaltyEntitled?: boolean)` — the third parameter is **optional and defaults to `true`** so the ~18 existing call sites in `loyaltyLanding.test.ts` keep compiling unchanged.

- [ ] **Step 1: Write the failing tests**

In `apps/storefront/src/pages/Loyalty/index.test.tsx`, add — matching the file's existing use of `renderWithProviders`, `buildCompanyStateWith` and `window.BC_CONTEXT`:

```ts
it('shows the unavailable state when the customer is not loyalty-entitled', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />, {
    preloadedState: {
      company: buildCompanyStateWith({ customer: { isLoyaltyEntitled: false } }),
    },
  });

  expect(await screen.findByText('Rewards are not available.')).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'My rewards' })).not.toBeInTheDocument();
});
```

In `apps/storefront/src/pages/Loyalty/loyaltyLanding.test.ts`, add — mirroring the existing `prefetchLoyaltyLanding(264074, true)` masquerade test, which is the closest precedent:

**Correction (found during execution): the obvious version of this test is vacuous.**
`prefetchLoyaltyLanding` bails on `!isTierProgressAvailable() || isAgenting ||
!customerId || !isLoyaltyEntitled`, and without `BC_CONTEXT.loyalty.progressSite`
configured the FIRST term already short-circuits — so a test that omits it passes
whether or not the entitlement gate exists. Configure `progressSite` so a reverted
gate would genuinely reach the endpoint, and assert the endpoint was never called:

```ts
it('does not redirect a customer who is not loyalty-entitled', async () => {
  // Config in place so a reverted gate would genuinely hit the endpoint and could
  // resolve true; without this the check is vacuous either way.
  const requests = vi.fn();
  withProgressSite();
  server.use(
    http.get(progressUrl, () => {
      requests();
      return HttpResponse.json({
        Success: true,
        Result: { TierProgress: { TargetKind: 'NextTier', TargetTierName: 'Signature' } },
      });
    }),
  );

  prefetchLoyaltyLanding(264074, false, false);

  expect(await resolveLoyaltyLanding()).toBe(false);
  expect(requests).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx src/pages/Loyalty/loyaltyLanding.test.ts`
Expected: both new tests fail — the page still renders its tabs, and the redirect still resolves `true`.

- [ ] **Step 3: Gate the page body**

In `apps/storefront/src/pages/Loyalty/index.tsx`, add a selector beside the existing ones and fold it into `isAvailable`:

```tsx
  const isLoyaltyEntitled = useAppSelector(({ company }) => company.customer.isLoyaltyEntitled);
  // Belt and braces: Task 2 removes the <Route>, but gotoAllowedAppPage checks the
  // UNFILTERED routes array, so a programmatic push could still mount this page.
  const isAvailable = isLoyaltyAvailable() && !isAgenting && isLoyaltyEntitled;
```

Keep the existing `isLoyaltyAvailable() && !isAgenting` terms exactly as they are; only add the new one.

- [ ] **Step 4: Gate the login redirect**

In `apps/storefront/src/pages/Loyalty/loyaltyLanding.ts`:

```ts
export const prefetchLoyaltyLanding = (
  customerId: number,
  isAgenting: boolean,
  // Defaults to entitled so the many existing callers and tests are unaffected; the
  // three production call sites all pass the real verdict.
  isLoyaltyEntitled = true,
): void => {
  if (!isTierProgressAvailable() || isAgenting || !customerId || !isLoyaltyEntitled) {
    setPendingLanding(Promise.resolve(null));
    return;
  }
  // Swallow errors: a failed check must never break the login flow.
  setPendingLanding(fetchTierProgress(customerId).catch(() => null));
};

export const prefetchLoyaltyLandingIfIdle = (
  customerId: number,
  isAgenting: boolean,
  isLoyaltyEntitled = true,
): void => {
  if (getPendingLanding() === null) {
    prefetchLoyaltyLanding(customerId, isAgenting, isLoyaltyEntitled);
  }
};
```

- [ ] **Step 5: Pass the verdict at all three production call sites**

All three already read `company.customer`, so the value is in hand. A missed site silently keeps redirecting, which is why all three change together.

`apps/storefront/src/utils/loginInfo.ts` line 347:

```ts
        prefetchLoyaltyLanding(
          company.customer.id,
          b2bFeatures.masqueradeCompany.isAgenting,
          company.customer.isLoyaltyEntitled,
        );
```

`apps/storefront/src/pages/Login/navigateAfterSuccessfulLogin.ts` line 22:

```ts
  prefetchLoyaltyLandingIfIdle(
    company.customer.id,
    b2bFeatures.masqueradeCompany.isAgenting,
    company.customer.isLoyaltyEntitled,
  );
```

`apps/storefront/src/shared/routes/index.tsx` line 192 — read the existing call's arguments and add the third in the same style, sourcing it from the same state object the other two arguments come from.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty`
Expected: both new tests pass; everything else at the Step 1 baseline of Task 1.

- [ ] **Step 7: Full verification**

```bash
yarn tsc --noEmit
yarn test --run src/pages/Loyalty src/shared/routeList.test.ts
../../node_modules/.bin/eslint --max-warnings 0 src/pages/Loyalty src/shared src/utils/loginInfo.ts
yarn lint:knip
yarn lint:dependencies
yarn build
```

Expected: `tsc` clean; suites at baseline plus new passing tests; eslint clean on those paths; knip and dependency-cruiser showing **only** the known `src/utils/analytics.ts` item — and specifically **not** flagging `resolveLoyaltyEntitlement`, `getTierAttributeId` or `RawTierAttribute` as unused; `build` exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/storefront/src/pages/Loyalty/index.tsx \
        apps/storefront/src/pages/Loyalty/index.test.tsx \
        apps/storefront/src/pages/Loyalty/loyaltyLanding.ts \
        apps/storefront/src/pages/Loyalty/loyaltyLanding.test.ts \
        apps/storefront/src/utils/loginInfo.ts \
        apps/storefront/src/shared/routes/index.tsx \
        apps/storefront/src/pages/Login/navigateAfterSuccessfulLogin.ts
git commit -m "feat: B2B-0000 Gate the Loyalty page body and login redirect on entitlement"
```

---

### Task 4: Live verification on the sandbox

**Files:** none.

The spec's one residual unknown: the proxy is proven to *accept* the attribute selection, and to resolve customer identity for other fields, but has never been observed returning an attribute **value** for an authenticated shopper. This task closes that.

- [ ] **Step 1: Serve the portal against the real store**

From `apps/storefront/`, set `tierAttributeId: 2` in the sandbox theme's `BC_CONTEXT.loyalty` (or temporarily via the browser console before the portal boots), run `yarn dev`, and open the sandbox store URL — **not** `localhost:3001`; the portal is script-injected into the storefront page.

- [ ] **Step 2: Confirm the proxy actually returns the value**

Sign in as a customer whose "Loyalty Tier" attribute has a value. In DevTools → Network, find the `bc-storefront/graphql` request and confirm the response contains
`attributes: { loyaltyTier: { entityId: 2, name: "Loyalty Tier", value: "<tier>" } }`.

**If `attributes` is absent or null for an authenticated customer, stop and report.** That is the fallback trigger: the fix is Approach B in the spec — a separate `graphqlBC` (same-origin) query, which is already measured to work — and it is a change to Task 1 Step 7 and Step 9 only, not to the gate logic.

- [ ] **Step 3: Confirm the entitled path**

Smart Rewards appears in the nav, `/loyalty` loads, and — if this customer has an active tier journey — login still lands on it.

- [ ] **Step 4: Confirm the gated path**

Clear that customer's "Loyalty Tier" value in the BigCommerce control panel, sign out, sign back in. Confirm: no Smart Rewards nav entry; visiting `#/loyalty` directly does not render the page; login does not land there. Then restore the attribute value.

While here, note the response shape for the cleared attribute (`value: ""` vs `value: null`) — both must resolve to hidden, and the spec predicts an object with a blank value rather than a bare `null`. **If a customer who has *never* had the attribute set is available, check that one too**; the spec's measurement says it behaves identically, and this is the cheapest possible confirmation.

- [ ] **Step 5: Confirm the un-opted path**

Remove `tierAttributeId` from `BC_CONTEXT.loyalty`, reload, and confirm Smart Rewards is visible again for a customer with **no** tier value — proving an un-opted store is unaffected.

- [ ] **Step 6: Report**

Record all five results. If any behaved differently, report it rather than adjusting the code to match — the gate's failure direction is the whole safety property of this design, and a surprise here is worth a conversation.
