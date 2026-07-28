# Loyalty "My rewards" tab redesign — design

**Date:** 2026-07-27
**Status:** Approved (design)
**Area:** B2B buyer portal · Loyalty (`/loyalty`) — My rewards tab only
**Related:** [2026-07-27-loyalty-smart-rewards-redesign-design.md](2026-07-27-loyalty-smart-rewards-redesign-design.md) (the four-tab restructure this builds on),
[2026-07-27-loyalty-my-benefits-redesign-design.md](2026-07-27-loyalty-my-benefits-redesign-design.md) (sibling redesign; shared visual language).
Source of truth for visuals/copy: the user-supplied My rewards mock (2026-07-27, third mock).

## Problem

The freshly-shipped `MyRewardsTab` is a utilitarian stack: a "My rewards"
section header, a "Your earned rewards" list of outlined cards showing raw
coupon codes, and a full points-history ledger below it. The new mock turns
My rewards into a focused "ready to use" surface: two lines of intro copy,
then one light-blue row per redeemed reward — title on the left ("$5
CREDIT"), a "READY TO USE AT CHECKOUT" status on the right — and nothing
else. No headings, no visible codes, no history.

## Decisions (user-selected 2026-07-27)

1. **Points history removed entirely** (mock-literal, same precedent as the
   My benefits redesign). The in-portal ledger goes away; Influence's own
   launcher widget still offers it. `fetchPointsHistory` and friends are
   deleted (knip enforces the cascade).
2. **Status label + copy affordance.** Rows render the mock's status label,
   plus a small copy-code icon button so the code stays retrievable if
   checkout requires manual entry — the one accepted deviation from the mock.
3. **Empty state = message + nudge.** With history gone, an empty list needs
   its own state: "You haven't redeemed any rewards yet. Visit Get rewards to
   turn your points into store credit."
4. **Accepted copy correction:** the mock's comma splice ("…to your order,
   only one reward…") is corrected with an em dash, following the
   "avaliable" → "available" precedent from the parent spec.

## New MyRewardsTab layout (top → bottom)

Restyle `components/MyRewardsTab.tsx` in place — it stays a single component
(one list + intro; no child components extracted). The `identity` prop,
`loyaltyRewards` infinite query (keyed on `identity.customerId`, invalidated
by the Get rewards redeem flow), and pagination semantics are unchanged.

### 1. Intro (i18n, new keys)

- `loyalty.myRewards.introRedeemed`: "Here's what you've redeemed and have
  ready to use."
- `loyalty.myRewards.introApply`: "At checkout, you'll choose one to apply
  to your order — only one reward can be used per order."

Centered, secondary text — same treatment as the My benefits intro. The
`SectionHeader` ("My rewards") and the "Your earned rewards" h6 heading are
both dropped; the intro is the only lead-in. `SectionHeader` itself stays
(other tabs consume it).

### 2. Reward rows (restyled)

One row per `EarnedReward`, in API order:

- Container: light primary tint (`bgcolor: (theme) =>
  alpha(theme.palette.primary.main, 0.08)`), rounded, generous padding —
  visually matching the restyled tier-progress card from the sibling spec.
- Left: `reward.title` rendered uppercase via `textTransform` (the string
  itself is untouched — "$5 credit" displays as "$5 CREDIT").
- Right: status label `loyalty.myRewards.readyStatus` = "Ready to use at
  checkout" (uppercase via `textTransform`, bold), then a small
  `ContentCopy` icon button (named `@mui/icons-material` import,
  aria-label = existing `loyalty.redeem.copy` "Copy code"), rendered only
  when `reward.couponCode` is non-blank.
- Copy click: `navigator.clipboard.writeText(couponCode)` →
  `snackbar.success(b3Lang('loyalty.redeem.copied'))`; on clipboard failure
  `snackbar.error(b3Lang('loyalty.errors.generic'))` — the exact pattern
  already in `RewardsTab`.
- Rows `flexWrap` on narrow viewports (as the current cards do).

### 3. Load more (unchanged)

The existing small "Load more" button renders only while the query
`hasNextPage` (`nextToken` semantics untouched, including the `||`-not-`??`
empty-token guard). The mock's Lisa has a single page, so it shows nothing.

### 4. Empty state (new key)

When the earned query succeeds with zero rewards:
`loyalty.myRewards.empty` = "You haven't redeemed any rewards yet. Visit Get
rewards to turn your points into store credit." — centered, secondary text
under the intro. While loading, or if the fetch errors, the tab shows the
intro only (fail-quiet, matching the page's existing behavior).

## Removals and the knip cascade

| Removed | Because |
|---|---|
| `MyRewardsTab.tsx`: history query, history rendering, `formatPoints`, `formatDate` | history section gone |
| `api.ts`: `fetchPointsHistory`, `PointActivity`, `PointActivityPage`, `RawPointActivity` | only consumer was MyRewardsTab |
| `api.test.ts`: `fetchPointsHistory` describe block | feature deleted |
| `index.test.tsx`: "lists points history and loads more pages", "shows the empty history state", the history half of the combined earned+history test, the `buildPointActivityWith` builder and any `/customer/points` MSW handlers | features deleted |
| en.json: `loyalty.tabs.history`, `loyalty.history.empty`, `loyalty.redeem.earnedTitle` | orphaned (headings gone) |

`loyalty.loadMore` stays (earned-rewards pagination keeps it).
`EarnedReward.createdAt` stays — unused by the mock but it is a payload
mapping, and knip does not flag interface fields. The legacy deep-link
mapping `?tab=history → my-rewards` is untouched.

## Edge cases

| Case | Behavior |
|---|---|
| `identity` undefined (page still resolving) | Queries disabled — intro renders alone |
| Earned fetch errors | Intro only; no empty message (message needs `isSuccess`) |
| Zero earned rewards | Intro + empty-message nudge |
| `couponCode` blank on a reward | Row renders title + status, no copy button |
| Clipboard write fails | Error snackbar (`loyalty.errors.generic`) |
| Multiple pages | "Load more" as today; new rows styled identically |
| Redeem in Get rewards, switch tab | Existing query invalidation keeps the list fresh (unchanged) |
| Narrow viewport / long titles | Row content wraps |
| `?tab=history` bookmark | Still lands on My rewards (mapping untouched) |

## Non-goals

- Any change to the hero, tab bar, Get rewards, My benefits, or FAQ tabs,
  the redeem/confirm/reveal dialogs, the allowlist gate, or masquerade gating.
- Reward statuses other than "ready to use" (the API exposes none; every
  fetched reward gets the same label).
- Re-adding a points ledger elsewhere in the portal.
- Removing `EarnedReward.createdAt` from the payload mapping.

## Testing

- **Update** the earned-rewards tests: rows assert title + the "Ready to use
  at checkout" status label instead of visible code text; the coupon code no
  longer renders as text; copy button writes the code to the clipboard and
  fires the success snackbar; pagination test intent unchanged.
- **Update** the tab-split test ("earned codes … away from the catalog") to
  the new row shape; drop its history assertions.
- **New:** intro copy renders; empty state renders on a successful empty
  page (and not while pending/error); no copy button when `couponCode` is
  blank.
- **Delete:** the two history tests and the `fetchPointsHistory` API tests.
- **Untouched:** hero, gate/masquerade, Get rewards redeem flow, My
  benefits, FAQ, deep-link tests (including `['history', 'My rewards']`).

## Verification

- Full Loyalty suite green; `tsc --noEmit`; scoped eslint; knip clean (all
  history orphans removed); `yarn build` exit 0.
- Live (sandbox, post-deploy): My rewards matches the mock for an account
  with redeemed rewards; copy icon copies a working code; an account with no
  redemptions sees the intro + nudge; points history is gone.
