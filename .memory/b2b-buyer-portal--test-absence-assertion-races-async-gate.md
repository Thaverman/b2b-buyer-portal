---
title: "Absence assertions false-pass when the awaited anchor isn't gated on the async state — `await findByText(<first-paint text>)` returns before the query settles; use `await expect(findByText(x,{},{timeout})).rejects.toThrow()` and prove the guard by breaking the production gate"
type: concept
created: 2026-07-28
updated: 2026-07-28
lastVerified: 2026-07-28
repo: b2b-buyer-portal
storeHash: all
website: SSW
area: B2B
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
mongoId: 6a688facce65fba63730de88
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/index.test.tsx
    symbol: keeps the empty nudge off when the rewards fetch fails   # the test that false-passed
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/components/MyRewardsTab.tsx
    symbol: MyRewardsTab              # the `earnedQuery.isSuccess && earnedRewards.length === 0` gate under test
tags: [memory, b2b-buyer-portal, b2b, loyalty, testing, testing-library, react-query, msw, code-review, negative-assertions]
---

# Absence assertions false-pass when the awaited anchor isn't gated on the async state

Found by the **final whole-branch review** of the My rewards redesign
(2026-07-28); hardened in commit `14b6438b`.

## The defect pattern

A test asserts some UI does **not** appear in an async failure/empty state:

```tsx
// FALSE-PASSES
await screen.findByText(introCopy);                          // renders on first paint
expect(screen.queryByText(nudge)).not.toBeInTheDocument();   // runs before the 500 settles
```

This is **vacuous whenever the awaited anchor renders independently of the query
under test**. The `await` resolves immediately, the absence check runs before the
mocked response settles into react-query state, and a component that *would*
render the thing once the query errors still passes.

**The concrete case:** `keeps the empty nudge off when the rewards fetch fails`
mocked `GET /customer/all-rewards → 500` and awaited the `MyRewardsTab` intro
copy — static JSX outside the query. A `MyRewardsTab` that dropped its
`earnedQuery.isSuccess &&` guard (showing the empty nudge while pending/errored)
passed the original test.

## The fix — assert *sustained* absence

```tsx
await expect(
  screen.findByText(nudge, {}, { timeout: 1500 }),
).rejects.toThrow();
```

`findByText` polls for the whole window and only resolves on appearance, so a
rejection proves the element stayed absent **across** the settle. Note the
three-arg signature: `findByText(text, queryOptions, waitForOptions)`.

1500 ms is affordable — the per-test timeout is 40 s in CI (5 s locally) and the
whole 80-test `index.test.tsx` runs in ~6.7 s. No fake timers are in play in this
file, so real-timer polling behaves as documented.

**General rule:** the anchor you await must itself be gated on the async state
you're making a claim about. If it isn't, either await a query-gated anchor or
switch to the `rejects.toThrow()` form.

## Prove the guard actually guards

A negative assertion is only worth its line count once you've **watched it fail**:

1. Deliberately break the production gate —
   `{earnedQuery.isSuccess && earnedRewards.length === 0 && (` →
   `{earnedRewards.length === 0 && (`
2. Run the focused file; the hardened test must FAIL (it did: 79/80).
3. `git checkout --` the component; re-run; green (80/80).
4. `git status` clean of the component before committing the test.

Neither the implementer's self-review nor **two** task-scoped reviews caught the
original vacuous test — only the broad final review did. Do not treat a green
suite as evidence that a negative assertion is load-bearing.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--loyalty-test-progressbar-b3spin-collision]]
- [[b2b-buyer-portal--msw-mockserver-hangs-unhandled-requests]]
- [[b2b-buyer-portal--dev-red-baseline]]
