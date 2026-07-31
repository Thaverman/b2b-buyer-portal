---
title: Get Rewards catalog is sorted by pointCost ascending — the only numeric field on RedeemRule, not a true "value"
type: concept
created: 2026-07-30
updated: 2026-07-30
lastVerified: 2026-07-30
repo: b2b-buyer-portal
storeHash: 24erkpw9h6
website: SSW
area: B2B
memoryType: decision
durable: true
status: active
project: b2b-buyer-portal
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/components/RewardsTab.tsx
    symbol: RewardsTab   # catalog = filter(isRedeemableCatalogRule).sort(by pointCost asc)
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: RedeemRule   # { id, title, pointCost, redeemType, status, minRedeemablePoints, maxRedeemablePoints }
tags: [memory, b2b-buyer-portal, b2b, loyalty, rewards, redeem, sorting]
---

# Get Rewards catalog sort order

`RewardsTab` first requested "order rewards highest to lowest" (descending by
pointCost), then immediately reversed to ascending (lowest cost first) in the
same session — no reason given for the reversal. `RedeemRule` (from
`fetchRedeemRules` / `/shop/rules/redeem`) has exactly one numeric field:
`pointCost`. There is no separate monetary/discount "value" field — pointCost
is being used as a stand-in for reward value on the assumption that
higher-cost rewards are the more valuable ones.

```ts
const catalog = (rulesQuery.data ?? [])
  .filter(isRedeemableCatalogRule)
  .sort((a, b) => (a.pointCost ?? 0) - (b.pointCost ?? 0));
```

## Decision + why

- Currently sorted ascending by `pointCost` (cheapest first). This flipped
  once already within the same working session with no stated rationale, so
  treat the direction as **volatile** — verify the current comparator in
  `RewardsTab.tsx` directly rather than trusting this note's code snippet if
  it's been a while (`lastVerified` above), since it may have flipped again.
- `pointCost` is the only candidate sort field, and it's already the number
  shown on every reward card (`loyalty.redeem.pointCost`). No product/business
  input was sought on whether "value" should mean something else (e.g. dollar
  discount amount) — that field doesn't exist upstream today.
- `.sort()` runs on the array produced by `.filter(isRedeemableCatalogRule)`,
  which is already a fresh array (not the react-query cached `rulesQuery.data`
  reference), so mutating in place via `.sort()` is safe.

## How to apply

- If BigCommerce/Influence ever adds a distinct "value" or "discount amount"
  field to the redeem-rule payload, re-check whether sort-by-value should
  replace sort-by-pointCost — they may diverge (e.g. a promo reward priced low
  in points but high in dollar value).
- Test coverage for ordering lives in `index.test.tsx` ("orders the reward
  catalog by point cost, lowest first") — it asserts DOM order via
  `.MuiCard-root` + `getByRole('heading', { level: 6 })` inside each card,
  not by reading array data directly, so it also catches a regression in
  render order (not just the sort call itself). The test name and expected
  array must be kept in sync with whichever direction is live.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--loyalty-earn-rules-blank-title]]
