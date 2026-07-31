# The asymmetric-hop-count race isn't just a testing gotcha — it can leak into render logic

Companion to `pattern_asymmetric-independent-query-hops.md` (which covers the test-assertion
side of this). This entry covers the same root cause causing a real, shippable UI bug, not
just a flaky/wrong test.

If a component derives a *conditional UI branch* — not just content, but which message to
show — from the fast query's data alone (e.g. `hasAnyCoupon` from a 1-hop cart read), while
a *more specific* branch needs the slow query's data to even be checkable (e.g. matching a
coupon code against a reward list that needs `identity → digest → all-rewards`, 3 hops),
the fast-query branch will render on **every single load**, however briefly, before the
slow-query branch can override it — even though the slow-query branch is the one that
ends up correct 100% of the time in the scenario under test. This is not a flash a user
might miss under normal conditions; because the timing gap is structural (hop-count, not
network jitter), it is present on every page load, every time, for every user in that
state — worth fixing even though it's easy to dismiss as "just a brief flash."

Fix: gate the fast-query-derived branch on the slow query having *settled*
(`slowQuery.isFetched`, not `isSuccess` — `isFetched` also covers "resolved to an error,"
which still means "no more useful data is coming this render pass"), not just on the fast
query's own data. Concretely in `MyRewardsTab`, the `otherCoupon` hint (from `cartQuery`,
1 hop) was gated on `hasAnyCoupon && earnedQuery.isFetched` so it can no longer render
before the `earnedQuery`-derived `oneAtATime` branch has had a chance to claim the reward
as a match.

Before reaching for a hop-count fix like this, check whether the "wrong" branch is
merely imprecise-but-not-false (as documented in the design doc's own edge-case table)
versus actively misleading on the golden path — the latter is what makes this worth an
explicit `isFetched` gate rather than accepting it as "eventually consistent."

Source: `2026-07-31-loyalty-apply-reward-to-cart` final-review Fix 4 (Minor, but
100%-repro every visit where a reward is applied).
