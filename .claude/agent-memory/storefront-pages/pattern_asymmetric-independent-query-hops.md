# Asymmetric hop-count between two "independent" queries always resolves the same way

When a component reads two independently-gated `useQuery`/`useInfiniteQuery` calls and
renders content from each once it resolves, "independent" does not mean "same speed" —
if one query's `enabled` flag depends on data from a chain of N sequential fetches
(e.g. JWT fetch → digest POST → only then does the dependent query become `enabled`)
while the other query fires a single fetch on mount, the single-fetch query will
*deterministically* resolve first in every run, not just occasionally. This isn't
flakiness; it's a fixed ordering baked into the dependency graph.

Concretely, in Loyalty's `MyRewardsTab`: `cartQuery` (`fetchCartCoupons`, one fetch,
enabled unconditionally on mount) will always resolve before `earnedQuery` (needs
`identity`, which itself needs `digestQuery` → `getCurrentCustomerJWT` fetch then a
digest POST — two hops before `earnedQuery` even becomes `enabled`, a third hop to
get data). A test that renders, awaits the cart-derived hint text, and then
*synchronously* asserts on a UI element that comes from the reward list (e.g. an
Apply button) will fail every time — not intermittently — because the reward row
genuinely hasn't mounted yet.

Fix: wrap the second assertion in `waitFor` (matching the pattern the same test suite
already uses in a sibling test), or add an explicit `await screen.findByText(<reward
title>)` guard before checking anything derived from the reward row. Don't chase this
as "test flakiness" and add a retry/sleep — identify which query is actually the slow
one via the hop count, and gate the assertion on that query's settled state instead of
the always-faster sibling query's.

Confirmed empirically (spec: `2026-07-31-loyalty-apply-reward-to-cart`, task 1): ran
the failing test 4x in isolation and 3x as part of the full suite — same failure every
time, until the `waitFor` guard was added, after which it passed every time.
