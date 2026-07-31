# Apply/Remove Loyalty Rewards on the Cart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the copy-code button on each My rewards row with an Apply-to-cart action that shows applied state and can be removed, driven by the BigCommerce Storefront REST coupon endpoints.

**Architecture:** A new domain-agnostic service module (`src/shared/service/bc/api/cart.ts`) wraps three same-origin Storefront REST calls: read the cart (which returns its id *and* applied coupon codes in one response), apply a coupon, remove a coupon. `MyRewardsTab` reads that state with `useQuery` and mutates it with two `useMutation`s, deriving every row's state by matching `reward.couponCode` against the cart's applied codes. The server is the only source of truth for "is it applied?" — no optimistic local flag.

**Tech Stack:** React 18, TypeScript, `@tanstack/react-query` v5, MUI v5, Vitest + Testing Library + MSW, `b3Lang` i18n.

**Spec:** [../specs/2026-07-31-loyalty-apply-reward-to-cart-design.md](../specs/2026-07-31-loyalty-apply-reward-to-cart-design.md)

## Global Constraints

- **All commands run from `apps/storefront/`**, not the repo root.
- **Commit format:** `type: TICKET-### Short description`. Use `B2B-0000` (matches the recent Loyalty commits).
- **Red baseline — measured, not predicted.** `en.json` has `"loyalty.tabs.faq": "FAQs"` committed while tests still query the tab by the accessible name `FAQ`. Running `yarn test --run src/pages/Loyalty/index.test.tsx` on the starting commit gives **3 failed | 91 passed (94)**. The three failures are exactly:
  - `renders theme-provided FAQ sections, questions and answers`
  - `uses the default FAQ intro when the theme supplies none`
  - `renders an FAQ item bullet list even when the item has no answer`

  **These three are red before you start. Do not fix them.** Any *other* failure is yours. (A fourth `name: 'FAQ'` query at `index.test.tsx:1242` passes vacuously — it asserts the tab is *absent* — so it is not in the failure list.)
- **Stage explicit paths only, never `git add -A`.** The branch is `feature/loyalty-apply-reward` in a dedicated worktree; keep commits to the files each task names.
- **Imports:** `@/` and `tests/` aliases only — no long relative paths. Named imports from `@mui/icons-material`. `lodash-es` only.
- **Do not add new violations** of the project-wide-disabled ESLint rules (notably: no non-null assertions `!`, no `any`).
- **No new Redux slices, Context providers, or `localStorage`/`sessionStorage` state.**
- **Never read or write the `cartId` cookie** in this feature — the cart id comes from the API response.
- **Coupon code matching is case-insensitive** everywhere. Match on `code` only, never `couponType`.
- **Copy strings are exact.** Every string below is verbatim from the spec, including the em dash (`—`) and the curly apostrophe in `couldn't`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/service/bc/api/cart.ts` | **New.** The three Storefront REST coupon calls, the `CartCouponError` kind mapping, and case-insensitive code comparison. No React, no loyalty concepts. |
| `src/pages/Loyalty/components/MyRewardsTab.tsx` | **Modify.** Owns the cart query, both mutations, row state derivation, and the hint line. Stays a single component. |
| `src/lib/lang/locales/en.json` | **Modify.** Nine new keys, one reworded, one removed. |
| `src/pages/Loyalty/index.test.tsx` | **Modify.** Cart builder + `mockCart` helper; rewrite the two copy tests as apply tests; update four label/intro assertions; add coverage for remove, blocking, and the no-cart states. |

No test file is created for the service module: there are zero tests anywhere under `src/shared/` today, and AGENTS.md directs page-level integration tests over unit tests for non-reusable code. MSW asserts the exact HTTP requests the module produces, which covers its mapping logic.

---

### Task 0: Verify the API contract against a real store

This is a **manual** task with no code. It exists because the BigCommerce OpenAPI specs document only `200` and `409` for the coupon endpoints — there is no documented response for an invalid, expired, already-used coupon or an empty cart. Task 1's error mapping is inference until this runs.

**Files:** none.

- [ ] **Step 1: Open the sandbox storefront logged in as a customer with at least one item in the cart**

Navigate to the store URL (e.g. `https://<store>.mybigcommerce.com/`), sign in, add a product to the cart. Open DevTools → Console.

- [ ] **Step 2: Read the cart and confirm the response shape**

```js
await (await fetch('/api/storefront/carts', {
  credentials: 'same-origin',
  headers: { Accept: 'application/json' },
})).json()
```

Expected: an **array**. Record `[0].id` (a UUID) and confirm a `coupons` array is present. If the response is an object rather than an array, **stop and report** — the module's parsing assumption is wrong.

- [ ] **Step 3: Apply a real redeemed reward code and confirm no CSRF token is needed**

```js
const cartId = (await (await fetch('/api/storefront/carts', { credentials: 'same-origin' })).json())[0].id;
const res = await fetch(`/api/storefront/checkouts/${cartId}/coupons`, {
  method: 'POST',
  credentials: 'same-origin',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify({ couponCode: 'PASTE_A_REAL_REWARD_CODE' }),
});
console.log(res.status, await res.json());
```

Expected: `200` and a checkout object with a populated top-level `coupons` array. **A `403` means a CSRF token IS required — stop and report; the design's central finding would be wrong and the approach needs revisiting.**

- [ ] **Step 4: Capture the real failure statuses**

Run the Step 3 request again with (a) a garbage code like `'NOT-A-REAL-CODE'`, (b) the same code twice (already applied), and (c) an emptied cart. Record the **status code** and **response body** for each.

- [ ] **Step 5: Confirm removal works**

```js
const res = await fetch(`/api/storefront/checkouts/${cartId}/coupons/PASTE_A_REAL_REWARD_CODE`, {
  method: 'DELETE',
  credentials: 'same-origin',
  headers: { Accept: 'application/json' },
});
console.log(res.status, (await res.json()).coupons);
```

Expected: `200` and an empty (or shorter) `coupons` array.

- [ ] **Step 6: Reconcile with Task 1's mapping**

Task 1 maps `body.type === 'empty_cart'` → `emptyCart`, `404`/`422` → `rejected`, everything else → `upstream`. If Step 4 produced a different status for an invalid or already-used code (e.g. `400`), **add that status to the `rejected` branch in Task 1 Step 3** and note it in the commit message. If a status you observed would fall through to `upstream`, the buyer would see the vague generic error instead of the useful one — so this reconciliation is the point of the whole task.

---

### Task 1: Apply a reward to the cart

Deliverable: the copy button is gone; each row has a working **Apply to cart** button that shows **APPLIED TO YOUR CART** afterward. Remove and one-per-order blocking come later.

**Files:**
- Create: `apps/storefront/src/shared/service/bc/api/cart.ts`
- Modify: `apps/storefront/src/pages/Loyalty/components/MyRewardsTab.tsx`
- Modify: `apps/storefront/src/lib/lang/locales/en.json`
- Test: `apps/storefront/src/pages/Loyalty/index.test.tsx`

**Interfaces:**
- Consumes: `EarnedReward` (`{ id, couponCode, title, createdAt }`) and `fetchEarnedRewards` from `../api`, both unchanged.
- Produces, from `@/shared/service/bc/api/cart`:
  - `interface CartCoupons { cartId: string | null; appliedCodes: string[] }`
  - `class CartCouponError extends Error { kind: 'emptyCart' | 'rejected' | 'upstream' }`
  - `fetchCartCoupons(): Promise<CartCoupons>`
  - `applyCartCoupon(cartId: string, code: string): Promise<string[]>` — returns the applied codes after the write
  - `isSameCouponCode(a: string, b: string): boolean`
  - Task 2 adds `removeCartCoupon(cartId: string, code: string): Promise<string[]>` to the same module.
  - Query key `['cartCoupons']` (module-local `const CART_COUPONS_KEY` in `MyRewardsTab.tsx`).

- [ ] **Step 1: Add the i18n keys**

In `apps/storefront/src/lib/lang/locales/en.json`, find the `loyalty.myRewards.*` block. **Reword** `introApply`, **delete** the `readyStatus` line, and add five keys, so the block reads:

```json
  "loyalty.myRewards.introRedeemed": "Here's what you've redeemed and have ready to use.",
  "loyalty.myRewards.introApply": "Apply one to your cart below — only one reward can be used per order.",
  "loyalty.myRewards.empty": "You haven't redeemed any rewards yet. Visit Get rewards to turn your points into store credit.",
  "loyalty.myRewards.apply": "Apply to cart",
  "loyalty.myRewards.appliedStatus": "Applied to your cart",
  "loyalty.myRewards.applySuccess": "Reward applied to your cart.",
  "loyalty.myRewards.needsCart": "Add items to your cart before applying a reward.",
  "loyalty.myRewards.rejected": "This reward couldn't be applied. It may have already been used.",
```

Leave `loyalty.redeem.copy` and `loyalty.redeem.copied` alone — the Get rewards reveal dialog still uses both.

- [ ] **Step 2: Write the failing tests**

In `apps/storefront/src/pages/Loyalty/index.test.tsx`, add these three URL constants and the cart builder/helper next to the existing `buildEarnedRewardWith` (around line 143):

```tsx
const cartsUrl = 'http://localhost:3000/api/storefront/carts';
const couponsUrl = 'http://localhost:3000/api/storefront/checkouts/:checkoutId/coupons';

interface StorefrontCart {
  id: string;
  coupons: { code: string }[];
}

const buildCartWith = builder<StorefrontCart>(() => ({
  id: faker.string.uuid(),
  coupons: [],
}));

// The file's catch-all handler leaves unmatched requests pending forever, so a My
// rewards test without this renders with the cart query stuck pending — which is
// indistinguishable from "no cart", and Apply never enables.
const mockCart = (cart: StorefrontCart | null) =>
  server.use(http.get(cartsUrl, () => HttpResponse.json(cart ? [cart] : [])));
```

**Replace** the test at line 1064 (`copies an earned reward code from its My rewards row`) with:

```tsx
it('applies an earned reward to the cart from its My rewards row', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  mockCart(buildCartWith({ id: 'cart-1' }));
  const applyRequest = vi.fn();
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({
        items: [buildEarnedRewardWith({ title: '$5 credit', couponCode: 'SAVE-123' })],
        nextToken: null,
      }),
    ),
    http.post(couponsUrl, async ({ request, params }) => {
      applyRequest({ checkoutId: params.checkoutId, body: await request.json() });
      return HttpResponse.json({ coupons: [{ code: 'SAVE-123' }] });
    }),
  );

  const { user } = renderWithProviders(<Loyalty />, {
    initialEntries: [{ search: '?tab=my-rewards' }],
  });

  const applyButton = await screen.findByRole('button', { name: 'Apply to cart' });
  // The button stays disabled until the cart read supplies the checkout id, and
  // MUI disabled buttons carry pointer-events: none, which userEvent rejects.
  await waitFor(() => expect(applyButton).toBeEnabled());
  await user.click(applyButton);

  expect(await screen.findByText('Applied to your cart')).toBeInTheDocument();
  expect(applyRequest).toHaveBeenCalledWith({
    checkoutId: 'cart-1',
    body: { couponCode: 'SAVE-123' },
  });
  await waitFor(() => {
    expect(snackbar.success).toHaveBeenCalledWith('Reward applied to your cart.');
  });
  expect(screen.queryByRole('button', { name: 'Apply to cart' })).not.toBeInTheDocument();
});
```

**Replace** the test at line 1156 (`shows an error snackbar when copying a reward code fails`) with:

```tsx
it('shows a rejection message when the cart refuses the reward code', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  mockCart(buildCartWith({}));
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({
        items: [buildEarnedRewardWith({ title: '$5 credit', couponCode: 'SAVE-123' })],
        nextToken: null,
      }),
    ),
    http.post(couponsUrl, () =>
      HttpResponse.json({ status: 404, title: 'Coupon code is invalid' }, { status: 404 }),
    ),
  );

  const { user } = renderWithProviders(<Loyalty />, {
    initialEntries: [{ search: '?tab=my-rewards' }],
  });

  const applyButton = await screen.findByRole('button', { name: 'Apply to cart' });
  await waitFor(() => expect(applyButton).toBeEnabled());
  await user.click(applyButton);

  await waitFor(() => {
    expect(snackbar.error).toHaveBeenCalledWith(
      "This reward couldn't be applied. It may have already been used.",
    );
  });
  expect(screen.queryByText('Applied to your cart')).not.toBeInTheDocument();
});
```

**Add** this new test after it:

```tsx
it('offers no apply action and explains why when the shopper has no cart', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  mockCart(null);
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({
        items: [buildEarnedRewardWith({ title: '$5 credit', couponCode: 'SAVE-123' })],
        nextToken: null,
      }),
    ),
  );

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=my-rewards' }] });

  expect(
    await screen.findByText('Add items to your cart before applying a reward.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply to cart' })).toBeDisabled();
});

it('keeps apply disabled when the cart read fails', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  server.use(
    http.get(cartsUrl, () => HttpResponse.json({}, { status: 500 })),
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({
        items: [buildEarnedRewardWith({ title: '$5 credit', couponCode: 'SAVE-123' })],
        nextToken: null,
      }),
    ),
  );

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=my-rewards' }] });

  expect(await screen.findByText('$5 credit')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Apply to cart' })).toBeDisabled();
  });
  // A failed read must not claim the cart is empty — that would be a guess.
  expect(
    screen.queryByText('Add items to your cart before applying a reward.'),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
});

it('tells the shopper to fill the cart when the coupon write reports an empty cart', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  // The cart exists at read time and is emptied before the write — the only route to
  // the empty_cart discriminator, and otherwise dead error-mapping code.
  mockCart(buildCartWith({ id: 'cart-1' }));
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({
        items: [buildEarnedRewardWith({ title: '$5 credit', couponCode: 'SAVE-123' })],
        nextToken: null,
      }),
    ),
    http.post(couponsUrl, () =>
      HttpResponse.json({ type: 'empty_cart', title: 'Cart is empty' }, { status: 400 }),
    ),
  );

  const { user } = renderWithProviders(<Loyalty />, {
    initialEntries: [{ search: '?tab=my-rewards' }],
  });

  const applyButton = await screen.findByRole('button', { name: 'Apply to cart' });
  await waitFor(() => expect(applyButton).toBeEnabled());
  await user.click(applyButton);

  await waitFor(() => {
    expect(snackbar.error).toHaveBeenCalledWith(
      'Add items to your cart before applying a reward.',
    );
  });
});
```

**Edit** the test at line 1088 (`hides the copy affordance when a reward has no coupon code`) — rename it and swap the assertion:

```tsx
it('offers no apply action when a reward has no coupon code', async () => {
```

and replace its last line with:

```tsx
  expect(screen.queryByRole('button', { name: 'Apply to cart' })).not.toBeInTheDocument();
```

**Edit** these four existing tests to drop the retired label and pick up the reworded intro:

1. Line 605 (`lists previously earned rewards and loads more pages`): add `mockCart(buildCartWith({}));` after `mockRedeemRules([]);`, and **delete** the final line `expect(screen.getAllByText('Ready to use at checkout')).toHaveLength(2);`.
2. Line 1040 (`keeps earned rewards away from the catalog`): add `mockCart(buildCartWith({}));` after `mockRedeemRules([]);`, and **delete** the line `expect(screen.getByText('Ready to use at checkout')).toBeInTheDocument();`.
3. Line 1106 (`shows the intro copy and the empty nudge when nothing has been redeemed`): change the second assertion's string to `'Apply one to your cart below — only one reward can be used per order.'`.
4. Line 626: leave `expect(screen.queryByText('FIRST-CODE')).not.toBeInTheDocument();` in place — codes still must not render as text.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx`

Expected: all five apply / no-cart / cart-error tests fail, because no `Apply to cart` button exists yet and `findByRole` times out. The reworded-intro test fails on the old string. The three FAQ tests listed in Global Constraints fail — pre-existing baseline, not your regression.

- [ ] **Step 4: Create the service module**

Create `apps/storefront/src/shared/service/bc/api/cart.ts`:

```ts
import b2bLogger from '@/utils/b3Logger';
import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';

// Same-origin REST Storefront API. On stencil BigCommerceStorefrontAPIBaseURL is
// window.origin, which is what these endpoints require — they take no token.
const STOREFRONT_API_BASE = `${BigCommerceStorefrontAPIBaseURL}/api/storefront`;

export interface CartCoupons {
  cartId: string | null;
  appliedCodes: string[];
}

// BigCommerce documents only 200 and 409 for the coupon endpoints, so every other
// status is inferred: 'rejected' covers an invalid, expired or already-used code.
type CartCouponErrorKind = 'emptyCart' | 'rejected' | 'upstream';

export class CartCouponError extends Error {
  kind: CartCouponErrorKind;

  constructor(kind: CartCouponErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

interface RawCoupon {
  code?: string;
}

interface RawCart {
  id?: string;
  coupons?: RawCoupon[];
}

interface RawErrorBody {
  type?: string;
  title?: string;
}

const couponCodes = (coupons: RawCoupon[] | undefined): string[] =>
  (coupons ?? []).map((coupon) => coupon.code ?? '').filter((code) => code !== '');

// BigCommerce normalizes coupon codes, so what the loyalty provider issued and what
// the cart reports back can differ in case. Blank never matches blank.
export const isSameCouponCode = (a: string, b: string): boolean => {
  const left = a.trim().toLowerCase();
  return left !== '' && left === b.trim().toLowerCase();
};

export const fetchCartCoupons = async (): Promise<CartCoupons> => {
  let response: Response;
  try {
    response = await fetch(`${STOREFRONT_API_BASE}/carts`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new CartCouponError('upstream');
  }
  // Emptying a cart deletes it; both of these mean "no active cart", not a failure.
  if (response.status === 404 || response.status === 204) {
    return { cartId: null, appliedCodes: [] };
  }
  if (!response.ok) {
    throw new CartCouponError('upstream');
  }

  // This endpoint returns an ARRAY of carts — an empty array means no active cart.
  const carts = (await response.json()) as RawCart[];
  const cart = Array.isArray(carts) ? carts[0] : undefined;
  if (!cart?.id) {
    return { cartId: null, appliedCodes: [] };
  }
  return { cartId: cart.id, appliedCodes: couponCodes(cart.coupons) };
};

const writeError = async (response: Response): Promise<CartCouponError> => {
  let body: RawErrorBody = {};
  try {
    body = (await response.json()) as RawErrorBody;
  } catch {
    // Non-JSON error body; fall through to the status check.
  }
  // The docs specify no error body for a bad coupon, so log what upstream actually
  // said — it is the only way to diagnose a mapping that turns out too coarse.
  b2bLogger.error(
    `Cart coupon write failed: ${response.status} "${body.title ?? response.statusText}" type "${body.type ?? 'none'}"`,
  );
  if (body.type === 'empty_cart') {
    return new CartCouponError('emptyCart');
  }
  if (response.status === 404 || response.status === 422) {
    return new CartCouponError('rejected');
  }
  return new CartCouponError('upstream');
};

const couponWrite = async (
  path: string,
  method: 'POST' | 'DELETE',
  body?: string,
): Promise<string[]> => {
  let response: Response;
  try {
    response = await fetch(`${STOREFRONT_API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body,
    });
  } catch {
    throw new CartCouponError('upstream');
  }
  if (!response.ok) {
    throw await writeError(response);
  }
  // Both writes return the whole recomputed checkout, so the new applied set is
  // readable straight off the response with no follow-up read.
  const checkout = (await response.json()) as { coupons?: RawCoupon[] };
  return couponCodes(checkout.coupons);
};

export const applyCartCoupon = (cartId: string, code: string): Promise<string[]> =>
  couponWrite(`/checkouts/${cartId}/coupons`, 'POST', JSON.stringify({ couponCode: code }));
```

If Task 0 Step 4 observed a status other than 404/422 for a bad code, add it to the `rejected` branch now.

- [ ] **Step 5: Rewrite `MyRewardsTab.tsx`**

Replace the whole file with:

```tsx
import { alpha, Box, Button, Typography } from '@mui/material';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import {
  applyCartCoupon,
  CartCouponError,
  CartCoupons,
  fetchCartCoupons,
  isSameCouponCode,
} from '@/shared/service/bc/api/cart';
import { snackbar } from '@/utils/b3Tip';

import { EarnedReward, fetchEarnedRewards, LoyaltyIdentity } from '../api';

const CART_COUPONS_KEY = ['cartCoupons'];

interface MyRewardsTabProps {
  identity: LoyaltyIdentity | undefined;
}

function MyRewardsTab({ identity }: MyRewardsTabProps) {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();

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

  // Independent of identity: the cart belongs to the storefront session, not to the
  // loyalty provider. One call yields both the checkout id and its applied codes.
  const cartQuery = useQuery({
    queryKey: CART_COUPONS_KEY,
    queryFn: fetchCartCoupons,
  });
  const cartId = cartQuery.data?.cartId ?? null;
  const appliedCodes = cartQuery.data?.appliedCodes ?? [];

  const applyMutation = useMutation({
    mutationFn: (code: string) => {
      if (!cartId) {
        return Promise.reject(new CartCouponError('emptyCart'));
      }
      return applyCartCoupon(cartId, code);
    },
    onSuccess: (codes) => {
      queryClient.setQueryData<CartCoupons>(CART_COUPONS_KEY, (previous) => ({
        cartId: previous?.cartId ?? null,
        appliedCodes: codes,
      }));
      snackbar.success(b3Lang('loyalty.myRewards.applySuccess'));
    },
    onError: (error) => {
      // Resync: the write may have failed because our view of the cart was stale.
      queryClient.invalidateQueries({ queryKey: CART_COUPONS_KEY });
      const kind = error instanceof CartCouponError ? error.kind : 'upstream';
      if (kind === 'emptyCart') {
        snackbar.error(b3Lang('loyalty.myRewards.needsCart'));
        return;
      }
      if (kind === 'rejected') {
        snackbar.error(b3Lang('loyalty.myRewards.rejected'));
        return;
      }
      snackbar.error(b3Lang('loyalty.errors.generic'));
    },
  });

  // The first reward whose code the cart reports as applied. Keyed by id so that
  // two rewards sharing a code cannot both render as applied.
  const appliedReward = earnedRewards.find((reward) =>
    appliedCodes.some((code) => isSameCouponCode(code, reward.couponCode)),
  );

  let hint = '';
  if (cartQuery.isSuccess && !cartId) {
    hint = b3Lang('loyalty.myRewards.needsCart');
  } else if (cartQuery.isError) {
    hint = b3Lang('loyalty.errors.generic');
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography color="text.secondary">{b3Lang('loyalty.myRewards.introRedeemed')}</Typography>
        <Typography color="text.secondary">{b3Lang('loyalty.myRewards.introApply')}</Typography>
      </Box>
      {earnedQuery.isSuccess && earnedRewards.length === 0 && (
        <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
          {b3Lang('loyalty.myRewards.empty')}
        </Typography>
      )}
      {earnedRewards.map((reward) => (
        <Box
          key={reward.id}
          sx={{
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
            borderRadius: 3,
            px: 4,
            py: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Typography sx={{ textTransform: 'uppercase' }}>{reward.title}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {reward.couponCode !== '' &&
              (appliedReward?.id === reward.id ? (
                <Typography
                  sx={{ textTransform: 'uppercase', fontWeight: 700, color: 'text.secondary' }}
                >
                  {b3Lang('loyalty.myRewards.appliedStatus')}
                </Typography>
              ) : (
                <Button
                  variant="outlined"
                  size="small"
                  // No cartId means the cart read is still in flight, failed, or found
                  // no cart — in none of those can a coupon be applied.
                  disabled={applyMutation.isPending || !cartId}
                  onClick={() => applyMutation.mutate(reward.couponCode)}
                >
                  {b3Lang('loyalty.myRewards.apply')}
                </Button>
              ))}
          </Box>
        </Box>
      ))}
      {hint !== '' && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          {hint}
        </Typography>
      )}
      {earnedQuery.hasNextPage && (
        <Button
          size="small"
          disabled={earnedQuery.isFetchingNextPage}
          onClick={() => earnedQuery.fetchNextPage()}
          sx={{ alignSelf: 'flex-start' }}
        >
          {b3Lang('loyalty.loadMore')}
        </Button>
      )}
    </Box>
  );
}

export default MyRewardsTab;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx`

Expected: every Loyalty test passes except the three pre-existing FAQ failures listed in Global Constraints (i.e. 3 failed | N passed, with N grown by your new tests).

- [ ] **Step 7: Type-check and lint**

Run: `yarn tsc --noEmit && yarn lint:eslint --max-warnings 0 src/shared/service/bc/api/cart.ts src/pages/Loyalty && yarn lint:knip`

Expected: all clean. If knip reports `couponUrl` as unused in the test file, delete it here and reintroduce it in Task 2.

- [ ] **Step 8: Commit**

```bash
git add apps/storefront/src/shared/service/bc/api/cart.ts \
        apps/storefront/src/pages/Loyalty/components/MyRewardsTab.tsx \
        apps/storefront/src/lib/lang/locales/en.json \
        apps/storefront/src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Apply a loyalty reward to the cart from My rewards"
```

`en.json` also carries the pre-existing `FAQ` → `FAQs` edit. That is fine to include — it is a one-line copy fix already in the tree — but say so in the commit body if you do.

---

### Task 2: Remove an applied reward

Deliverable: an applied row gets a **Remove** button that clears the coupon from the cart.

**Files:**
- Modify: `apps/storefront/src/shared/service/bc/api/cart.ts`
- Modify: `apps/storefront/src/pages/Loyalty/components/MyRewardsTab.tsx`
- Modify: `apps/storefront/src/lib/lang/locales/en.json`
- Test: `apps/storefront/src/pages/Loyalty/index.test.tsx`

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces: `removeCartCoupon(cartId: string, code: string): Promise<string[]>`.

- [ ] **Step 1: Add the i18n keys**

In `en.json`, after `loyalty.myRewards.apply`:

```json
  "loyalty.myRewards.remove": "Remove",
  "loyalty.myRewards.removeSuccess": "Reward removed from your cart.",
```

- [ ] **Step 2: Write the failing tests**

Add `couponUrl` to the URL constants if Task 1 removed it:

```tsx
const couponUrl = 'http://localhost:3000/api/storefront/checkouts/:checkoutId/coupons/:couponCode';
```

Add these two tests after the apply tests:

```tsx
it('shows a reward the cart already has as applied, matching the code case-insensitively', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  mockCart(buildCartWith({ id: 'cart-1', coupons: [{ code: 'save-123' }] }));
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({
        items: [buildEarnedRewardWith({ title: '$5 credit', couponCode: 'SAVE-123' })],
        nextToken: null,
      }),
    ),
  );

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=my-rewards' }] });

  expect(await screen.findByText('Applied to your cart')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Apply to cart' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
});

it('removes an applied reward from the cart', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  mockCart(buildCartWith({ id: 'cart-1', coupons: [{ code: 'SAVE 123' }] }));
  const removeRequest = vi.fn();
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({
        items: [buildEarnedRewardWith({ title: '$5 credit', couponCode: 'SAVE 123' })],
        nextToken: null,
      }),
    ),
    http.delete(couponUrl, ({ params }) => {
      removeRequest({ checkoutId: params.checkoutId, couponCode: params.couponCode });
      return HttpResponse.json({ coupons: [] });
    }),
  );

  const { user } = renderWithProviders(<Loyalty />, {
    initialEntries: [{ search: '?tab=my-rewards' }],
  });

  await user.click(await screen.findByRole('button', { name: 'Remove' }));

  expect(await screen.findByRole('button', { name: 'Apply to cart' })).toBeInTheDocument();
  // MSW decodes path params, so this asserts the code was encoded on the way out:
  // a raw space in the URL path would not have round-tripped.
  expect(removeRequest).toHaveBeenCalledWith({ checkoutId: 'cart-1', couponCode: 'SAVE 123' });
  await waitFor(() => {
    expect(snackbar.success).toHaveBeenCalledWith('Reward removed from your cart.');
  });
  expect(screen.queryByText('Applied to your cart')).not.toBeInTheDocument();
});

it('reports a generic error when removing an applied reward fails', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  mockCart(buildCartWith({ id: 'cart-1', coupons: [{ code: 'SAVE-123' }] }));
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({
        items: [buildEarnedRewardWith({ title: '$5 credit', couponCode: 'SAVE-123' })],
        nextToken: null,
      }),
    ),
    http.delete(couponUrl, () => HttpResponse.json({}, { status: 404 })),
  );

  const { user } = renderWithProviders(<Loyalty />, {
    initialEntries: [{ search: '?tab=my-rewards' }],
  });

  await user.click(await screen.findByRole('button', { name: 'Remove' }));

  // Not the apply-specific "couldn't be applied" copy — that reads as nonsense on a
  // removal. The refetch is what resolves the true state.
  await waitFor(() => {
    expect(snackbar.error).toHaveBeenCalledWith('Something went wrong. Please try again.');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx`

Expected: the three new tests fail — no `Remove` button exists (`findByRole` times out); the case-insensitive test fails on the missing `Applied to your cart` text.

- [ ] **Step 4: Add `removeCartCoupon` to the service module**

Append to `apps/storefront/src/shared/service/bc/api/cart.ts`:

```ts
export const removeCartCoupon = (cartId: string, code: string): Promise<string[]> =>
  // The code travels in the PATH, so it must be encoded — codes may contain spaces.
  couponWrite(`/checkouts/${cartId}/coupons/${encodeURIComponent(code)}`, 'DELETE');
```

- [ ] **Step 5: Add the remove mutation and button**

In `MyRewardsTab.tsx`, add `removeCartCoupon` to the `@/shared/service/bc/api/cart` import.

This task creates the **second** call site for the cache write, so extract it now (Task 1 deliberately left it inline — a helper for a single caller would have been premature). Add this above `applyMutation`:

```tsx
  // Both writes return the cart's new applied-code set; the cart id is unchanged.
  const storeAppliedCodes = (codes: string[]) =>
    queryClient.setQueryData<CartCoupons>(CART_COUPONS_KEY, (previous) => ({
      cartId: previous?.cartId ?? null,
      appliedCodes: codes,
    }));
```

Then rewrite `applyMutation`'s `onSuccess` to use it, leaving its snackbar line intact:

```tsx
    onSuccess: (codes) => {
      storeAppliedCodes(codes);
      snackbar.success(b3Lang('loyalty.myRewards.applySuccess'));
    },
```

Then add this mutation after `applyMutation`:

```tsx
  const removeMutation = useMutation({
    mutationFn: (code: string) => {
      if (!cartId) {
        return Promise.reject(new CartCouponError('emptyCart'));
      }
      return removeCartCoupon(cartId, code);
    },
    onSuccess: (codes) => {
      storeAppliedCodes(codes);
      snackbar.success(b3Lang('loyalty.myRewards.removeSuccess'));
    },
    // Always generic: the apply-specific "may have already been used" copy is wrong
    // for a removal, and the refetch below is what resolves the real state anyway.
    onError: () => {
      queryClient.invalidateQueries({ queryKey: CART_COUPONS_KEY });
      snackbar.error(b3Lang('loyalty.errors.generic'));
    },
  });

  const isMutating = applyMutation.isPending || removeMutation.isPending;
```

Change the apply button's `disabled` to use the shared flag:

```tsx
                  disabled={isMutating || !cartId}
```

Replace the applied-status branch so the label is followed by a Remove button:

```tsx
              (appliedReward?.id === reward.id ? (
                <>
                  <Typography
                    sx={{ textTransform: 'uppercase', fontWeight: 700, color: 'text.secondary' }}
                  >
                    {b3Lang('loyalty.myRewards.appliedStatus')}
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={isMutating}
                    onClick={() => removeMutation.mutate(reward.couponCode)}
                  >
                    {b3Lang('loyalty.myRewards.remove')}
                  </Button>
                </>
              ) : (
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx`

Expected: all pass except the three pre-existing FAQ failures listed in Global Constraints.

- [ ] **Step 7: Type-check and lint**

Run: `yarn tsc --noEmit && yarn lint:eslint --max-warnings 0 src/shared/service/bc/api/cart.ts src/pages/Loyalty && yarn lint:knip`

- [ ] **Step 8: Commit**

```bash
git add apps/storefront/src/shared/service/bc/api/cart.ts \
        apps/storefront/src/pages/Loyalty/components/MyRewardsTab.tsx \
        apps/storefront/src/lib/lang/locales/en.json \
        apps/storefront/src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Remove an applied loyalty reward from the cart"
```

---

### Task 3: Enforce one reward per order

Deliverable: while any coupon is on the cart, every other row's Apply is disabled and a hint explains why.

**Files:**
- Modify: `apps/storefront/src/pages/Loyalty/components/MyRewardsTab.tsx`
- Modify: `apps/storefront/src/lib/lang/locales/en.json`
- Test: `apps/storefront/src/pages/Loyalty/index.test.tsx`

**Interfaces:**
- Consumes: everything Tasks 1 and 2 produced. No new exports.

- [ ] **Step 1: Add the i18n keys**

In `en.json`, after `loyalty.myRewards.needsCart`:

```json
  "loyalty.myRewards.oneAtATime": "Only one reward can be applied per order. Remove the applied reward to use a different one.",
  "loyalty.myRewards.otherCoupon": "A discount code is already applied to your cart. Only one code can be used per order.",
```

- [ ] **Step 2: Write the failing tests**

```tsx
it('blocks a second reward while one is applied and says why', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  mockCart(buildCartWith({ id: 'cart-1', coupons: [{ code: 'SAVE-5' }] }));
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({
        items: [
          buildEarnedRewardWith({ title: '$5 credit', couponCode: 'SAVE-5' }),
          buildEarnedRewardWith({ title: '$10 credit', couponCode: 'SAVE-10' }),
        ],
        nextToken: null,
      }),
    ),
  );

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=my-rewards' }] });

  expect(await screen.findByText('Applied to your cart')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply to cart' })).toBeDisabled();
  expect(
    screen.getByText(
      'Only one reward can be applied per order. Remove the applied reward to use a different one.',
    ),
  ).toBeInTheDocument();
});

it('blocks every reward when a discount code the portal did not apply is on the cart', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  mockCart(buildCartWith({ id: 'cart-1', coupons: [{ code: 'SUMMER-SALE' }] }));
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({
        items: [buildEarnedRewardWith({ title: '$5 credit', couponCode: 'SAVE-5' })],
        nextToken: null,
      }),
    ),
  );

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=my-rewards' }] });

  expect(
    await screen.findByText(
      'A discount code is already applied to your cart. Only one code can be used per order.',
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply to cart' })).toBeDisabled();
  // The portal never offers to remove a coupon it did not apply.
  expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx`

Expected: both fail — the Apply buttons are still enabled and neither hint string renders.

- [ ] **Step 4: Add the blocking rule and the two hints**

In `MyRewardsTab.tsx`, add the derived flag right after `appliedReward`:

```tsx
  const hasAnyCoupon = appliedCodes.length > 0;
```

Replace the hint block with the full precedence chain:

```tsx
  let hint = '';
  if (appliedReward) {
    hint = b3Lang('loyalty.myRewards.oneAtATime');
  } else if (hasAnyCoupon) {
    // A coupon is applied that matches no LOADED reward. It may be a non-reward
    // discount, or a reward on an unfetched page — so the copy claims neither.
    hint = b3Lang('loyalty.myRewards.otherCoupon');
  } else if (cartQuery.isSuccess && !cartId) {
    hint = b3Lang('loyalty.myRewards.needsCart');
  } else if (cartQuery.isError) {
    hint = b3Lang('loyalty.errors.generic');
  }
```

Change the apply button's `disabled`:

```tsx
                  disabled={isMutating || hasAnyCoupon || !cartId}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn test --run src/pages/Loyalty/index.test.tsx`

Expected: all pass except the three pre-existing FAQ failures listed in Global Constraints.

- [ ] **Step 6: Full verification**

Run each and confirm:

```bash
yarn tsc --noEmit
yarn lint
yarn test --run src/pages/Loyalty
yarn build
```

Expected: `tsc` clean, `lint` (dependency-cruiser + eslint + knip) clean, Loyalty suite green except the three FAQ baseline failures, `build` exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/storefront/src/pages/Loyalty/components/MyRewardsTab.tsx \
        apps/storefront/src/lib/lang/locales/en.json \
        apps/storefront/src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Allow only one loyalty reward on the cart at a time"
```

---

### Task 4: Live verification on the sandbox storefront

**Files:** none.

- [ ] **Step 1: Serve the portal against the real store**

From `apps/storefront/`, run `yarn dev`, then open the sandbox store URL (**not** `http://localhost:3001` — the portal is script-injected into the storefront page; see [docs/stencil.md](../../stencil.md)). Sign in as a customer who has redeemed at least one reward.

- [ ] **Step 2: Walk the happy path**

Add a product to the cart → open `#/loyalty?tab=my-rewards` → click **Apply to cart** on a reward. Confirm: the row flips to **APPLIED TO YOUR CART** with a **Remove** button, the success snackbar fires, every other row's Apply is disabled, and the one-at-a-time hint shows.

- [ ] **Step 3: Confirm it reached the cart and the checkout**

Open the cart page: the discount appears in the totals. Proceed to checkout: the coupon is listed. Return to My rewards and reload: the row still reads applied (proving the state is read from the server, not remembered locally).

- [ ] **Step 4: Walk the removal and failure paths**

Click **Remove** → the coupon disappears from the cart and every Apply re-enables. Then empty the cart and reload My rewards → Apply is disabled with "Add items to your cart before applying a reward." Finally apply a code that has already been consumed on a past order and confirm the message is intelligible.

- [ ] **Step 5: Reconcile the error mapping one last time**

Check the browser console for the `Cart coupon write failed: …` lines logged by `writeError`. If any real failure landed on `upstream` (the vague generic message) when a specific one existed, add that status to the `rejected` branch in `cart.ts`, update the Task 1 Step 2 rejection test to use it, re-run `yarn test --run src/pages/Loyalty/index.test.tsx`, and commit:

```bash
git add apps/storefront/src/shared/service/bc/api/cart.ts \
        apps/storefront/src/pages/Loyalty/index.test.tsx
git commit -m "fix: B2B-0000 Map the observed coupon-rejection status from the live store"
```
