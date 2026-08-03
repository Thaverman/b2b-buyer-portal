# Loyalty "My rewards" — apply/remove a reward on the cart — design

**Date:** 2026-07-31
**Status:** Approved (design)
**Area:** B2B buyer portal · Loyalty (`/loyalty`) — My rewards tab + a new BC Storefront REST service module
**Related:** [2026-07-27-loyalty-my-rewards-redesign-design.md](2026-07-27-loyalty-my-rewards-redesign-design.md)
(the redesign that introduced the row layout and the copy button this replaces),
[2026-07-06-loyalty-page-design.md](2026-07-06-loyalty-page-design.md) (the original page + Influence.io API).

## Problem

A redeemed reward is a BigCommerce coupon code, but the portal can only *show*
it. Today each My rewards row reads "READY TO USE AT CHECKOUT" beside a
copy-code icon button, and the intro tells the buyer "At checkout, you'll
choose one to apply to your order." The buyer has to copy a code, leave the
portal, reach the coupon field at checkout, and paste it — and nothing in the
portal ever reflects whether that worked.

Rewards should be applied from the row itself, show as applied afterward, and
be removable.

## Decisions (user-selected 2026-07-31)

1. **One reward at a time, block rather than swap.** BigCommerce applies one
   coupon per order by default. While a reward is applied, its row shows
   "APPLIED TO YOUR CART" + Remove and every other row's Apply is disabled.
   Nothing is ever silently swapped out. Rejected: auto-swap (a destructive
   action the buyer did not ask for, which can also strand them with no coupon
   if the second apply fails) and stacking (Enterprise-plan-gated, requires a
   control-panel setting, and was unsupported on uncustomized storefronts at
   launch — not verified for this store).
2. **The copy button goes away entirely.** Rows become title + action. Apply is
   the supported path, so an un-actionable code is noise; a code that must be
   read manually is still visible at checkout on the applied coupon. This
   reverses decision 2 of the 2026-07-27 spec, which added the copy button as
   "the one accepted deviation from the mock."
3. **The "Ready to use at checkout" label is retired.** It contradicts a button
   sitting next to it that applies the reward *here*. An un-applied row is
   described by its Apply button; an applied row says "APPLIED TO YOUR CART".
   This drops a mock-derived string, accepted explicitly.

## Approach: the server owns "is it applied?"

On tab mount, read the cart once. `GET /api/storefront/carts` returns the cart
id **and** its applied coupon codes in a single call, so each row's state is
derived by matching `reward.couponCode` against those codes. Apply and Remove
are mutations whose response — the full checkout — refreshes that state.

Rejected alternatives:

- **Local state only** (remember "applied" after a successful POST, no cart
  read). Half the code, but it lies: a reload drops the applied badge, a coupon
  applied at checkout is invisible, and the one-per-order block cannot see
  coupons the portal did not apply. Telling a buyer "not applied" about a
  coupon that *is* on their cart is worse than the copy button being replaced.
- **BigCommerce Storefront GraphQL.** Impossible: it reads `couponAmount` but
  exposes no coupon mutation. REST Storefront is the only client-side path.
- **Read the full checkout** (`GET /api/storefront/checkouts/{id}`) for totals
  as well, to show each reward's discount amount. Needs the cart id first, so
  it is a second round trip for data this design does not display.

### Why this is safe to build

| Verified | How |
|---|---|
| Cart id **is** checkout id, so no checkout-creation step | BC spec: "The ID of the subject checkout. Identical to the cart ID." |
| ~~No CSRF token needed for the writes~~ **— WRONG, corrected 2026-08-03** | **Writes DO require a CSRF token.** BigCommerce protects them with a double-submit cookie: the storefront sets a non-HttpOnly `SF-CSRF-TOKEN` cookie, and a write must echo its value in an `X-SF-CSRF-TOKEN` header. Measured against the live sandbox: matching header → processed; wrong value → **403**; cookie present but no header → **403**; no cookie at all → processed. `GET /carts` is not protected. **How the original claim went wrong:** it rested on reading `@bigcommerce/checkout-sdk` in the `ssw-checkout` fork, where "csrf" genuinely appears nowhere — but that bundle is pinned at **1.936.2** and predates the enforcement. A vendored dependency is evidence about that version, never about the live API. The endpoint doc page saying "write requests require a CSRF token" was simply right, and the Storefront overview's "no token is required" refers only to bearer/API tokens. |
| Same-origin requirement is already met | Loyalty is gated to `platform === 'bigcommerce'` (`isLoyaltyAvailable`, api.ts:28), and on that platform `BigCommerceStorefrontAPIBaseURL` is `window.origin` (basicConfig.ts:8-15). |

Residual risk: the endpoints' OpenAPI specs document **only** 200 and 409.
There is no documented status or body for an invalid, expired, already-used, or
ineligible coupon, nor for an empty cart. Error handling is therefore
defensive by design (below), and the first implementation step is a live
sandbox smoke test.

## New service module: `src/shared/service/bc/api/cart.ts`

Applying a coupon to the cart is domain-agnostic BigCommerce functionality, not
loyalty logic, so it belongs in the shared service layer rather than
`pages/Loyalty/api.ts`. Exact precedent:
[bc/api/login.ts](../../../apps/storefront/src/shared/service/bc/api/login.ts)
is already raw same-origin `fetch` against `BigCommerceStorefrontAPIBaseURL`,
sitting beside its GraphQL twin `bc/graphql/login.ts` — this file sits beside
`bc/graphql/cart.ts` the same way. It is **not** added to `bc/index.ts`
(consumers of `bc/graphql/cart.ts` already deep-import).

```ts
interface CartCoupons {
  cartId: string | null;
  appliedCodes: string[];
}

type CartCouponErrorKind = 'emptyCart' | 'rejected' | 'upstream';
class CartCouponError extends Error { kind: CartCouponErrorKind }

fetchCartCoupons(): Promise<CartCoupons>
// Both writes → the applied codes after the write, or null when the write
// succeeded but returned no readable body (see the error-mapping notes below).
applyCartCoupon(cartId: string, code: string): Promise<string[] | null>
removeCartCoupon(cartId: string, code: string): Promise<string[] | null>
isSameCouponCode(a: string, b: string): boolean
```

Requests are `fetch` with `credentials: 'same-origin'`,
`Accept: application/json`, base `${BigCommerceStorefrontAPIBaseURL}/api/storefront`:

| Call | Request |
|---|---|
| read | `GET /carts` |
| apply | `POST /checkouts/{cartId}/coupons`, body `{ couponCode }` |
| remove | `DELETE /checkouts/{cartId}/coupons/{encodeURIComponent(code)}` |

**Both writes must also send `X-SF-CSRF-TOKEN`,** read from the `SF-CSRF-TOKEN`
cookie via `js-cookie`, or BigCommerce answers 403 (see the corrected row above).
The header is omitted entirely when the cookie is absent — a blank value reads as a
mismatch and is rejected, whereas presenting no token at all is accepted. This is the
one cookie the feature reads; the `cartId` cookie is still never touched.

Details that matter:

- **`GET /carts` returns an array.** No active cart → `[]` →
  `{ cartId: null, appliedCodes: [] }`. Both writes return the full checkout;
  the applied codes are read off its top-level `coupons[]`.
- **The cart id comes from that response, not the `cartId` cookie.** The cookie
  is only a side effect of `getCart()` (bc/graphql/cart.ts:333), which may
  never have run this session, and a stale cookie can name a deleted cart.
  Nothing in this feature reads or writes that cookie.
- **Codes are compared case-insensitively.** BigCommerce normalizes coupon
  codes, so what Influence issued and what the cart reports back can differ in
  case. Matching is on `code` only — never `couponType`, whose type is
  inconsistent across BigCommerce's own specs (string enum in `cart.coupons`,
  integer at checkout top level, integer-with-string-`discountedAmount` in
  `GET /carts`).
- **The optional `version` field is omitted**, which makes the documented 409
  unreachable.
- **Error mapping**, given the doc gap, in this precedence order: response body
  `type === 'empty_cart'` (the discriminator BigCommerce's own SDK checks) →
  `emptyCart`; `401`/`403` → `upstream`; **any other 4xx** → `rejected`;
  anything else, including 5xx and a network throw → `upstream`. The real
  status and `title` go to `b2bLogger.error` so support can diagnose what the
  docs could not tell us. This mirrors `LoyaltyError` in `pages/Loyalty/api.ts`.

  Keying `rejected` on the whole 4xx *class* rather than named members is
  deliberate: BigCommerce documents no status for a refused coupon, so
  enumerating guesses would leave the useful copy unreachable in production for
  the feature's most likely failure. The `401`/`403` carve-out above it exists
  because an auth or CSRF fault is never a statement about the coupon — telling
  a buyer their reward "may have already been used" would blame them for a
  server misconfiguration. Both `emptyCart` and the carve-out must stay above
  the class check; the empty-cart response is itself a 4xx.

- **A successful write with an unreadable body returns `null`, not an error.**
  `couponWrite` parses the response inside a `try`; on failure (a `204`, an
  empty body) it yields `null`, meaning "the write succeeded but the new code
  list is unknown". Callers then resync with `invalidateQueries` instead of
  writing the cache, and still show their success message. Throwing here would
  put an error toast on screen for an operation that worked, contradicted a
  moment later by the resynced UI.

## `MyRewardsTab.tsx` changes

Stays a single component — no child extraction, consistent with the 2026-07-27
spec. It grows by roughly 80 lines: one query, two mutations, the button block.

**Removed:** the `ContentCopy` / `IconButton` imports, `copyCode`, and the
status-label `Typography`.

**Added:** a `['cartCoupons']` `useQuery` over `fetchCartCoupons`, plus apply
and remove `useMutation`s following the RewardsTab/PaymentMethods convention
(`mutationFn` + `onSuccess` + `onError`, `useQueryClient` hoisted). On success
each mutation writes the returned codes straight into the cache with
`setQueryData` — no follow-up round trip — and shows a success snackbar. On
error it maps the error kind to a message and `invalidateQueries` to resync
from the server.

The cart query has **three** meaningful states, and "still loading" must not be
confused with "no cart":

| Cart query | Effect |
|---|---|
| pending | Apply disabled (the cart id is not known yet), no hint |
| success, `cartId` set | Normal operation |
| success, `cartId === null` | Apply disabled, `needsCart` hint |
| error | Apply disabled, generic hint |

### Row states

| Condition | Right side of the row |
|---|---|
| This reward's code is applied | `APPLIED TO YOUR CART` + `Remove` button |
| Nothing applied, cart id known, code non-blank | `Apply to cart` button |
| A different code is applied | `Apply to cart`, disabled |
| Cart id unknown or absent | `Apply to cart`, disabled |
| `couponCode` blank | Nothing (unchanged from today) |
| Either mutation in flight | All buttons disabled |

### Hint line

One line below the list, first match wins:

1. A **loaded** reward is applied → `oneAtATime`
2. Some coupon is applied, the earned list **has finished fetching**, and no loaded
   reward matches → `otherCoupon`
3. Cart query succeeded with no cart → `needsCart`
4. Cart query errored → `loyalty.errors.generic`
5. Otherwise nothing

Rule 2's "has finished fetching" guard exists because the two queries resolve in a
**fixed** order, not a racing one: the cart read is a single request, while the
earned list waits on a JWT fetch then a digest POST before it can even start. So
without the guard, every visit where a reward is applied would show `otherCoupon`
first and then swap to `oneAtATime` — a guaranteed misleading flash, not an
occasional one. Gating on `isFetched` (which TanStack sets on error too, so a
failed rewards fetch still gets its hint) shows nothing until the list can be
matched.

Rule 2 is what keeps pagination honest: the applied reward may sit on a page of
the earned list that has not been fetched, so the copy must not claim the code
is "another discount" — it says a discount code is applied and only one can be
used, which is true either way.

## i18n (`src/lib/lang/locales/en.json`)

**Changed** — the old text names the wrong place to act:

- `loyalty.myRewards.introApply`: "Apply one to your cart below — only one
  reward can be used per order."

**Removed:** `loyalty.myRewards.readyStatus`.

**New:**

| Key | Value |
|---|---|
| `loyalty.myRewards.apply` | "Apply to cart" |
| `loyalty.myRewards.remove` | "Remove" |
| `loyalty.myRewards.appliedStatus` | "Applied to your cart" |
| `loyalty.myRewards.applySuccess` | "Reward applied to your cart." |
| `loyalty.myRewards.removeSuccess` | "Reward removed from your cart." |
| `loyalty.myRewards.oneAtATime` | "Only one reward can be applied per order. Remove the applied reward to use a different one." |
| `loyalty.myRewards.otherCoupon` | "A discount code is already applied to your cart. Only one code can be used per order." |
| `loyalty.myRewards.needsCart` | "Add items to your cart before applying a reward." |
| `loyalty.myRewards.rejected` | "This reward couldn't be applied. It may have already been used." |

`appliedStatus` renders uppercase via `textTransform`, inheriting the retired
label's treatment. `loyalty.redeem.copy` and `loyalty.redeem.copied` stay —
the Get rewards reveal dialog still uses both, so removing MyRewardsTab's copy
button orphans no keys.

**Apply** failures map their error kind to a snackbar: `emptyCart` →
`needsCart`, `rejected` → `rejected`, `upstream` → `loyalty.errors.generic`.
**Remove** failures always use `loyalty.errors.generic` — the `rejected` copy
("couldn't be applied… may have already been used") is wrong for a removal, and
the follow-up refetch is what actually resolves the state either way.

## Edge cases

| Case | Behavior |
|---|---|
| Applied reward is on an unfetched page of the earned list | No row matches; the neutral `otherCoupon` hint shows rather than a false claim. Loading that page via "Load more" resolves it into an applied row |
| Coupon was already spent on a past order | The Influence API exposes no used/unused status, so Apply is still offered; BigCommerce rejects it and the buyer sees the `rejected` message |
| A non-reward coupon is on the cart | Apply disabled everywhere, `otherCoupon` hint. The portal does **not** offer to remove a coupon it did not apply |
| Remove fails because the coupon is already gone | Generic error snackbar, then the invalidate-driven refetch shows the true (removed) state |
| Cart emptied or filled in another browser tab | Row state can be stale. Every mutation resyncs, and any tab switch remounts the panel (panels are conditionally rendered, `staleTime: 0`) and refetches. `refetchOnWindowFocus` is globally `false` (react-setup.tsx:32), so this does not self-heal on focus — accepted, because the portal is hash-routed inside the storefront page, so adding items to the cart is a real page load in the normal flow |
| Cart read fails | Apply disabled, generic hint, no crash — matching the page's fail-quiet convention |
| `identity` undefined (page still resolving) | Earned query stays disabled as today; the cart query is independent of identity and may resolve first, which is harmless |
| Coupon code longer than BigCommerce's 50-char limit | Not pre-validated; the write fails and maps to `rejected` |

## Non-goals

- Stacking more than one coupon, and any control-panel/plan work to enable it.
- Showing discount amounts, cart totals, or the cart item count (applying a
  coupon changes totals, not item count, so `cartNumber` needs no update).
- Applying from the **Get rewards** reveal dialog. It keeps its copy button and
  "Apply this code at checkout" text. This leaves a deliberate inconsistency
  between the two tabs; folding Apply into that dialog is a reasonable
  follow-up, outside this scope.
- Any change to the hero, tab bar, My benefits, FAQ, the redeem/confirm flow,
  the allowlist gate, or masquerade gating.
- Catalyst/headless support. Loyalty is Stencil-only, and these endpoints
  require the storefront origin.
- Touching the theme, `ssw-checkout`, or the `cartId` cookie.

## Testing

All in `src/pages/Loyalty/index.test.tsx`, following its existing inline
builder/handler conventions (there are no shared loyalty fixtures under
`tests/`). New handlers target `http://localhost:3000/api/storefront/...`,
which is `window.origin` under jsdom.

A `mockCart()` helper is needed by **every** My-rewards test, not only the new
ones: the file's catch-all MSW handler leaves unmatched requests pending
forever (mockServer.ts:6), so a test without it renders the tab with the cart
query stuck in `pending` — Apply permanently disabled.

**Update** (5 tests asserting on the copy button or the retired label):

| Test | Change |
|---|---|
| `copies an earned reward code from its My rewards row` (:1064) | Becomes the apply happy path: click "Apply to cart" → POST fires with the right code → row shows "Applied to your cart" + Remove → success snackbar |
| `shows an error snackbar when copying a reward code fails` (:1156) | Becomes apply-failure coverage: the POST 404s → `rejected` message, row stays un-applied |
| `hides the copy affordance when a reward has no coupon code` (:1088) | Asserts no Apply button on a blank-code row |
| `lists previously earned rewards and loads more pages` (:605) | Drops the two `Ready to use at checkout` assertions; pagination intent unchanged |
| `keeps earned rewards away from the catalog` (:1040) | Same label assertion dropped |
| `shows the intro copy and the empty nudge…` (:1106) | Asserts the reworded `introApply` string |

**New:**

- An already-applied reward renders as applied on first paint (cart read
  reports its code), including a case-mismatched code.
- Remove clears it: DELETE fires with the encoded code, row returns to Apply,
  success snackbar.
- With one reward applied, a second reward's Apply is disabled and the
  `oneAtATime` hint shows.
- A foreign coupon on the cart disables every Apply and shows `otherCoupon`.
- No cart → Apply disabled + `needsCart`; the empty-cart error path maps to the
  same message.
**No separate test file for the service module.** There are zero tests anywhere
under `src/shared/` today, and AGENTS.md directs page-level integration tests
over unit tests for non-reusable code. The module's logic — array-to-`CartCoupons`,
error-kind mapping, code encoding — is exercised through the page tests, since
those mock at the HTTP boundary with MSW and can assert the exact request the
module produced.

**Untouched:** hero, gate/masquerade, Get rewards redeem flow (including its
three "Copy code" dialog tests), My benefits, FAQ, deep-link tests.

## Verification

- Full Loyalty suite green, `yarn tsc --noEmit`, scoped eslint, `yarn lint:knip`,
  `yarn build` exit 0.
- ⚠️ **Baseline:** the working tree has an uncommitted `en.json` edit flipping
  `loyalty.tabs.faq` from "FAQ" to "FAQs" while four tests still query the tab
  by the name "FAQ" (index.test.tsx:1242, :1259, :1275, :1302). Those four are
  red before this work starts. Diff against that baseline; do not fix them here.
- **Live sandbox smoke test, first implementation step** (it settles the
  documented-error gap and confirms the no-CSRF finding on a real store):
  apply a reward → cart shows the discount → checkout shows the coupon →
  Remove clears it. Capture the real status and body for an invalid/used code
  and for an empty cart, and tighten the error mapping to match.
