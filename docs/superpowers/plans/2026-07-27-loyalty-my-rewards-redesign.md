# Loyalty "My rewards" Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Loyalty My rewards tab per the approved spec — intro copy plus light-blue "READY TO USE AT CHECKOUT" reward rows with a copy-code affordance — and remove the points-history ledger entirely.

**Architecture:** One component restyled in place (`MyRewardsTab.tsx`); the history removal cascades into `api.ts`, both test files, and `en.json` (knip enforces orphan removal). No new components, slices, or contexts.

**Tech Stack:** React 18 + MUI 5, @tanstack/react-query `useInfiniteQuery`, Vitest + Testing Library + MSW (via `tests/test-utils`), b3Lang i18n from `en.json`.

**Spec:** `docs/superpowers/specs/2026-07-27-loyalty-my-rewards-redesign-design.md`

## Global Constraints

- **Isolated worktree, mandatory:** the main checkout is where the in-flight My benefits redesign session works (its Task 1 landed as `d02aa49b`; Tasks 2–4 are pending and share files with this plan — `api.ts`, `index.test.tsx`, `en.json`). Use the `superpowers:using-git-worktrees` skill to create a worktree on a new branch `feature/loyalty-my-rewards-redesign` from the **latest local `dev` HEAD** (at plan-writing time `05ce9c1b`, which includes `d02aa49b` — never base on anything older). Never implement this plan in the main checkout. All file paths and line numbers below were verified at `05ce9c1b`; if more My benefits commits have landed since, re-anchor by the quoted code text, not the line numbers.
- All commands run from `apps/storefront/` inside the worktree.
- Commit subject format: `type: B2B-0000 Short description` (see `commit-validation.json`).
- **Red baseline:** the dev branch may carry pre-existing test failures. Capture the baseline (Task 1, Step 1) and only compare failures against it; never fix unrelated redness.
- Copy strings verbatim from this plan — `loyalty.myRewards.introApply` contains an em dash (—), not a hyphen.
- Named imports from `@mui/icons-material` only; import test utilities only from `tests/test-utils`; use builders for test data; do not add violations of the project-wide disabled ESLint rules (see CLAUDE.md).
- `getByText` matches DOM text, not rendered CSS: the uppercase look comes from `textTransform`, so tests assert the sentence-case strings (`$5 credit`, `Ready to use at checkout`).

---

## File Structure

| File | Change |
|---|---|
| `src/pages/Loyalty/components/MyRewardsTab.tsx` | Task 1 strips history; Task 2 rebuilds the layout (final file ~110 lines) |
| `src/pages/Loyalty/api.ts` | Task 1 deletes `PointActivity`/`PointActivityPage`/`RawPointActivity`/`fetchPointsHistory` (lines 486–534) |
| `src/pages/Loyalty/api.test.ts` | Task 1 deletes the `fetchPointsHistory` describe (line 378) + its import |
| `src/pages/Loyalty/index.test.tsx` | Task 1 deletes history tests/builder; Task 2 updates earned tests and adds five new ones |
| `src/lib/lang/locales/en.json` | Task 1 removes 2 keys; Task 2 adds 4 keys, removes 1 |

Untouched: `index.tsx` (tab wiring unchanged — `MyRewardsTab` keeps its `identity` prop), `RewardsTab.tsx`, `SectionHeader.tsx` (other tabs still consume it), `index.mobile.test.tsx`, `index.platform.test.tsx` (no history references).

---

### Task 1: Remove the points-history ledger

**Files:**
- Modify: `src/pages/Loyalty/index.test.tsx` (imports; builder at ~line 146; tests at ~lines 603, 631, 1051)
- Modify: `src/pages/Loyalty/components/MyRewardsTab.tsx`
- Modify: `src/pages/Loyalty/api.ts:486-534`
- Modify: `src/pages/Loyalty/api.test.ts` (describe at line 378; import list)
- Modify: `src/lib/lang/locales/en.json` (keys `loyalty.tabs.history`, `loyalty.history.empty`)

**Interfaces:**
- Consumes: existing `fetchEarnedRewards(identity, nextToken?)`, `EarnedReward { id, couponCode, title, createdAt }` from `../api` — unchanged.
- Produces: `MyRewardsTab` with the earned-rewards block only (Task 2 rebuilds its JSX); `api.ts` without any `PointActivity`/`fetchPointsHistory` exports (nothing may reference them afterward).

- [ ] **Step 1: Capture the red baseline**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run`
Record the names of any failing tests. These are pre-existing; every later "expect green" means "no failures beyond this baseline".

- [ ] **Step 2: Delete the history tests from index.test.tsx**

Four edits:

(a) Remove `PointActivity,` from the `./api` import block (top of file):

```tsx
import {
  EarnedReward,
  LoyaltyCustomer,
  LoyaltyIdentity,
  LoyaltyTier,
  LoyaltyTierProgress,
  RedeemRule,
} from './api';
```

(b) Delete the `buildPointActivityWith` builder (~line 146):

```tsx
const buildPointActivityWith = builder<PointActivity>(() => ({
  id: faker.string.uuid(),
  action: faker.helpers.arrayElement(['earned', 'redeemed']),
  status: 'approved',
  points: faker.number.int({ min: -500, max: 500 }),
  createdAt: faker.date.past().toISOString(),
  customDescription: faker.company.catchPhrase(),
}));
```

(c) Delete two whole tests: `it('lists points history and loads more pages', …)` (~line 603) and `it('shows the empty history state', …)` (~line 631).

(d) Rewrite the combined test (~line 1051) to drop its history half — new full body:

```tsx
it('lists earned coupon codes away from the catalog', async () => {
  const earned = buildEarnedRewardWith({ couponCode: 'SAVE-123', title: '$5 discount' });

  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 600 }));
  mockRedeemRules([buildRedeemRuleWith({ title: 'Free shipping', pointCost: 500 })]);
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({ items: [earned], nextToken: null }),
    ),
  );

  const { user } = renderWithProviders(<Loyalty />);

  // Catalog tab shows the redeemable rule but no longer the earned codes.
  await user.click(await screen.findByRole('tab', { name: 'Get rewards' }));
  expect(await screen.findByText('Free shipping')).toBeInTheDocument();
  expect(screen.queryByText('SAVE-123')).not.toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: 'My rewards' }));
  expect(await screen.findByText('SAVE-123')).toBeInTheDocument();
  expect(screen.getByText('Your earned rewards')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the file — must be green (vs baseline)**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run`
Expected: PASS — the deleted tests were the only consumers of the deleted builder; the component still renders history but nothing asserts it.

- [ ] **Step 4: Strip history from MyRewardsTab.tsx**

Replace the file's entire contents with:

```tsx
import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { useInfiniteQuery } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';

import { EarnedReward, fetchEarnedRewards, LoyaltyIdentity } from '../api';

import SectionHeader from './SectionHeader';

interface MyRewardsTabProps {
  identity: LoyaltyIdentity | undefined;
}

function MyRewardsTab({ identity }: MyRewardsTabProps) {
  const b3Lang = useB3Lang();

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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.myRewards')}</SectionHeader>
      {earnedRewards.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {b3Lang('loyalty.redeem.earnedTitle')}
          </Typography>
          {earnedRewards.map((reward) => (
            <Card key={reward.id} variant="outlined" sx={{ mb: 1, borderRadius: 2 }}>
              <CardContent
                sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}
              >
                <Typography variant="body2">{reward.title}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {reward.couponCode}
                </Typography>
              </CardContent>
            </Card>
          ))}
          {earnedQuery.hasNextPage && (
            <Button
              size="small"
              disabled={earnedQuery.isFetchingNextPage}
              onClick={() => earnedQuery.fetchNextPage()}
            >
              {b3Lang('loyalty.loadMore')}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

export default MyRewardsTab;
```

(This is the current file minus the `historyQuery`, `activities`, `showEmptyHistory`, `formatPoints`, `formatDate`, the history JSX, and the `fetchPointsHistory`/`PointActivity` imports. The earned block is byte-identical to today — Task 2 replaces it.)

- [ ] **Step 5: Delete the api layer**

In `src/pages/Loyalty/api.ts`, delete lines 486–534 — the entire contiguous block from `export interface PointActivity {` through the closing `};` of `fetchPointsHistory` (four declarations: `PointActivity`, `PointActivityPage`, `RawPointActivity`, `fetchPointsHistory`).

In `src/pages/Loyalty/api.test.ts`, delete the whole `describe('fetchPointsHistory', …)` block (starts line 378 — one `it` inside, ends at its `});`), and remove `fetchPointsHistory,` from the `./api` import list at the top.

- [ ] **Step 6: Remove the orphaned i18n keys**

In `src/lib/lang/locales/en.json`, delete these two lines (~786 and ~809):

```json
  "loyalty.tabs.history": "History",
  "loyalty.history.empty": "No points activity yet.",
```

- [ ] **Step 7: Verify types and the whole Loyalty suite**

Run: `yarn tsc --noEmit` — expected clean.
Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run` — expected green vs baseline.
Run: `grep -rn "fetchPointsHistory\|PointActivity\|loyalty.tabs.history\|loyalty.history.empty" src/` — expected no matches.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: B2B-0000 Remove the loyalty points history ledger"
```

---

### Task 2: Intro copy, ready-to-use reward rows, copy affordance, empty state

**Files:**
- Modify: `src/pages/Loyalty/index.test.tsx` (earned-rewards test ~line 575; combined test from Task 1; five new tests)
- Modify: `src/pages/Loyalty/components/MyRewardsTab.tsx` (full rewrite below)
- Modify: `src/lib/lang/locales/en.json` (add 4 keys, remove `loyalty.redeem.earnedTitle`)

**Interfaces:**
- Consumes: Task 1's `MyRewardsTab` (earned query intact), `snackbar` from `@/utils/b3Tip` (already mocked module-wide in index.test.tsx), `ContentCopy` icon, `alpha` from `@mui/material`.
- Produces: the final tab. New i18n keys: `loyalty.myRewards.introRedeemed`, `loyalty.myRewards.introApply`, `loyalty.myRewards.readyStatus`, `loyalty.myRewards.empty`. Reuses existing keys `loyalty.redeem.copy` ("Copy code" — the icon button's accessible name), `loyalty.redeem.copied`, `loyalty.errors.generic`, `loyalty.loadMore`.

- [ ] **Step 1: Update the two existing tests and add five new ones (failing first)**

In `src/pages/Loyalty/index.test.tsx`:

(a) Replace `it('lists previously earned coupon codes and loads more pages', …)` (~line 575) with:

```tsx
it('lists previously earned rewards and loads more pages', async () => {
  const first = buildEarnedRewardWith({ title: '$5 credit', couponCode: 'FIRST-CODE' });
  const second = buildEarnedRewardWith({ title: '$10 credit', couponCode: 'SECOND-CODE' });

  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, ({ request }) => {
      const token = new URL(request.url).searchParams.get('nextToken');
      if (token === 'page-2') {
        return HttpResponse.json({ items: [second], nextToken: null });
      }
      return HttpResponse.json({ items: [first], nextToken: 'page-2' });
    }),
  );

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'My rewards' }));

  expect(await screen.findByText('$5 credit')).toBeInTheDocument();
  expect(screen.queryByText('FIRST-CODE')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Load more' }));

  expect(await screen.findByText('$10 credit')).toBeInTheDocument();
  expect(screen.getByText('$5 credit')).toBeInTheDocument();
  expect(screen.getAllByText('Ready to use at checkout')).toHaveLength(2);
});
```

(b) In the combined test from Task 1 (`lists earned coupon codes away from the catalog`), replace the two My rewards assertions at the end:

```tsx
  await user.click(screen.getByRole('tab', { name: 'My rewards' }));
  expect(await screen.findByText('$5 discount')).toBeInTheDocument();
  expect(screen.getByText('Ready to use at checkout')).toBeInTheDocument();
  expect(screen.queryByText('SAVE-123')).not.toBeInTheDocument();
```

(the code is never visible as text anywhere now; rename the test to `keeps earned rewards away from the catalog`).

(c) Add five new tests next to it:

```tsx
it('copies an earned reward code from its My rewards row', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({
        items: [buildEarnedRewardWith({ title: '$5 credit', couponCode: 'SAVE-123' })],
        nextToken: null,
      }),
    ),
  );

  const { user } = renderWithProviders(<Loyalty />, {
    initialEntries: [{ search: '?tab=my-rewards' }],
  });

  await user.click(await screen.findByRole('button', { name: 'Copy code' }));

  await waitFor(() => {
    expect(snackbar.success).toHaveBeenCalledWith('Code copied');
  });
  expect(await window.navigator.clipboard.readText()).toBe('SAVE-123');
});

it('hides the copy affordance when a reward has no coupon code', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({
        items: [buildEarnedRewardWith({ title: '$5 credit', couponCode: '' })],
        nextToken: null,
      }),
    ),
  );

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=my-rewards' }] });

  expect(await screen.findByText('$5 credit')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Copy code' })).not.toBeInTheDocument();
});

it('shows the intro copy and the empty nudge when nothing has been redeemed', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({ items: [], nextToken: null }),
    ),
  );

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=my-rewards' }] });

  expect(
    await screen.findByText("Here's what you've redeemed and have ready to use."),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "At checkout, you'll choose one to apply to your order — only one reward can be used per order.",
    ),
  ).toBeInTheDocument();
  expect(
    await screen.findByText(
      "You haven't redeemed any rewards yet. Visit Get rewards to turn your points into store credit.",
    ),
  ).toBeInTheDocument();
});

it('keeps the empty nudge off when the rewards fetch fails', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({}, { status: 500 }),
    ),
  );

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=my-rewards' }] });

  expect(
    await screen.findByText("Here's what you've redeemed and have ready to use."),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(
      "You haven't redeemed any rewards yet. Visit Get rewards to turn your points into store credit.",
    ),
  ).not.toBeInTheDocument();
});

it('shows an error snackbar when copying a reward code fails', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({
        items: [buildEarnedRewardWith({ title: '$5 credit', couponCode: 'SAVE-123' })],
        nextToken: null,
      }),
    ),
  );
  const writeText = vi
    .spyOn(window.navigator.clipboard, 'writeText')
    .mockRejectedValueOnce(new Error('denied'));

  const { user } = renderWithProviders(<Loyalty />, {
    initialEntries: [{ search: '?tab=my-rewards' }],
  });

  await user.click(await screen.findByRole('button', { name: 'Copy code' }));

  await waitFor(() => {
    expect(snackbar.error).toHaveBeenCalledWith('Something went wrong. Please try again.');
  });
  writeText.mockRestore();
});
```

Notes for the implementer: `snackbar` and `waitFor` are already imported at the top of this file; `renderWithProviders` returns `{ user }`; the `?tab=my-rewards` deep-link pattern matches the existing tests. There is exactly one "Copy code"-named button per row (the redeem dialog's copy button only exists while that dialog is open, which it never is here).

- [ ] **Step 2: Run — the five new tests and both updated tests must FAIL**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run`
Expected failures: missing texts (`$5 credit` visible but `Ready to use at checkout`, intro, and nudge absent; `FIRST-CODE` still visible; no `Copy code` button). Anything else failing beyond the baseline means a test was written wrong — fix the test, not the (unwritten) implementation.

- [ ] **Step 3: Add the i18n keys**

In `src/lib/lang/locales/en.json`, delete the line `"loyalty.redeem.earnedTitle": "Your earned rewards",` (~line 807) and insert directly before `"loyalty.loadMore": "Load more",`:

```json
  "loyalty.myRewards.introRedeemed": "Here's what you've redeemed and have ready to use.",
  "loyalty.myRewards.introApply": "At checkout, you'll choose one to apply to your order — only one reward can be used per order.",
  "loyalty.myRewards.readyStatus": "Ready to use at checkout",
  "loyalty.myRewards.empty": "You haven't redeemed any rewards yet. Visit Get rewards to turn your points into store credit.",
```

- [ ] **Step 4: Rewrite MyRewardsTab.tsx**

Replace the file's entire contents with:

```tsx
import { ContentCopy } from '@mui/icons-material';
import { alpha, Box, Button, IconButton, Typography } from '@mui/material';
import { useInfiniteQuery } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import { snackbar } from '@/utils/b3Tip';

import { EarnedReward, fetchEarnedRewards, LoyaltyIdentity } from '../api';

interface MyRewardsTabProps {
  identity: LoyaltyIdentity | undefined;
}

function MyRewardsTab({ identity }: MyRewardsTabProps) {
  const b3Lang = useB3Lang();

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

  const copyCode = async (couponCode: string) => {
    try {
      await navigator.clipboard.writeText(couponCode);
      snackbar.success(b3Lang('loyalty.redeem.copied'));
    } catch {
      snackbar.error(b3Lang('loyalty.errors.generic'));
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography color="text.secondary">
          {b3Lang('loyalty.myRewards.introRedeemed')}
        </Typography>
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
            <Typography
              sx={{ textTransform: 'uppercase', fontWeight: 700, color: 'text.secondary' }}
            >
              {b3Lang('loyalty.myRewards.readyStatus')}
            </Typography>
            {reward.couponCode !== '' && (
              <IconButton
                size="small"
                aria-label={b3Lang('loyalty.redeem.copy')}
                onClick={() => copyCode(reward.couponCode)}
              >
                <ContentCopy fontSize="small" />
              </IconButton>
            )}
          </Box>
        </Box>
      ))}
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

(`SectionHeader`, `Card`/`CardContent`, and the "Your earned rewards" heading are gone — the intro is the only lead-in, per the spec. `SectionHeader.tsx` itself stays; other tabs use it.)

- [ ] **Step 5: Run — everything green**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run` — all new/updated tests pass.
Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run` — whole folder green vs baseline. If any *other* test fails on a missing "My rewards" heading or "Your earned rewards" text, update that assertion to the new layout (title + "Ready to use at checkout") — do not reintroduce headings.
Run: `yarn tsc --noEmit` — clean.
Run: `grep -rn "loyalty.redeem.earnedTitle" src/` — no matches.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: B2B-0000 Redesign My rewards into ready-to-use reward rows"
```

---

## Verification (whole feature)

- `CIRCLECI=true yarn test src/pages/Loyalty/ --run` green vs baseline; `yarn tsc --noEmit` clean; `npx eslint src/pages/Loyalty/ --max-warnings 0` clean; `yarn lint:knip` at baseline (no new orphans — history exports removed with their consumers); `yarn build` exit 0.
- Manual (sandbox, post-deploy): My rewards matches the mock for an account with redemptions (uppercase titles, status labels, light-blue rows); the copy icon copies a working code and toasts "Code copied"; an account with no redemptions sees the intro + nudge; points history is gone; `?tab=history` still lands on My rewards.

## Merge-back / coordination

This branch is based on the latest local `dev` HEAD while the My benefits redesign session (Tasks 2–4 of its own plan) keeps committing to `dev` from the main checkout. Do **not** merge to `dev` as part of this plan — finish with `superpowers:finishing-a-development-branch` and let the user sequence the merge. The two changesets edit disjoint regions (the history block vs the BenefitsTab restyle/banner/info cards; different i18n keys; My benefits never touches `MyRewardsTab.tsx`), so the merge should be mostly automatic.

## Notes / out of scope

- The in-portal points ledger is intentionally gone (user decision 2026-07-27); the Influence launcher widget remains the only ledger surface.
- `EarnedReward.createdAt` stays as an unused payload mapping (knip doesn't flag interface fields).
- Hero, tab bar, Get rewards, My benefits, FAQ, redeem dialogs, allowlist/masquerade gates: untouched.
