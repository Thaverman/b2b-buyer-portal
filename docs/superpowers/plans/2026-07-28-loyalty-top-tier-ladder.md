# Loyalty Top-Tier Ladder Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the My benefits tier ladder from advertising the tier the customer is already on, by making SSW's `TargetKind: 'AtTop'` authoritative and anchoring the ladder on the SSW tier name instead of the Influence tier id.

**Architecture:** Two layers. The data layer stops discarding `AtTop` in `fetchTierProgress`, which gives the tab a trustworthy "topped out" signal for the first time. The view layer then replaces the ladder with portal-authored copy at the top tier, and for everyone else resolves the customer's position by case-insensitive tier-name match against SSW, falling back to today's Influence id match when SSW progress is unavailable.

**Tech Stack:** React 18 + MUI 5, @tanstack/react-query, Vitest + Testing Library + MSW (via `tests/test-utils`), b3Lang i18n from `en.json`.

**Spec:** `docs/superpowers/specs/2026-07-28-loyalty-top-tier-ladder-design.md`

## Global Constraints

- All commands run from `apps/storefront/`.
- Commit subject format: `type: B2B-0000 Short description` (see `commit-validation.json`).
- **PRECONDITION — resolve before Task 1.** At plan-writing time `components/BenefitsTab.tsx` and `index.test.tsx` held unrelated uncommitted work (a banner photo-crop change, `objectPosition: 'center 20%'`, plus its test). Both files are edited by Task 2, and `git add <file>` stages a whole file — hunk-level staging (`git add -p`) is interactive and unavailable here, so there is no way to split them at commit time. Therefore, before starting: run `git status`, and if those changes are still uncommitted, **stop and get them committed or stashed** (the user's call — do not commit someone else's work unasked). Only once `git status` is clean for those two files may execution begin. Alternatively the whole plan may run in a worktree branched from the current HEAD.
- **Never `git add -A` or `git commit -a`.** Stage the exact paths listed in each commit step and check `git diff --cached --stat` before committing.
- Copy strings verbatim: the top-tier copy contains an em dash (—), not a hyphen. The i18n values in `en.json` must be byte-identical to what the tests assert.
- Line numbers below were verified at `52966ba7`; anchor every edit on the quoted code text, not the line number.
- Named imports from `@mui/icons-material` only; test utilities imported only from `tests/test-utils`; use the existing builders (`buildTierWith`, `buildTierProgressWith`, `buildLoyaltyCustomerWith`); no new violations of the repo's disabled-ESLint-rule list.
- **Red baseline:** capture the Loyalty suite result before editing and compare against it; never fix unrelated redness.
- `mockTierProgress(...)` only takes effect when the render also passes `customerPreloadedState` — the query's `enabled` gate needs a customer id. Tests that omit it exercise the `tierProgress === null` fallback path.

---

## File Structure

| File | Change |
|---|---|
| `src/pages/Loyalty/api.ts` | Task 1 — `targetKind` union + accept `AtTop` in the guard |
| `src/pages/Loyalty/api.test.ts` | Task 1 — repoint **two** `AtTop → null` assertions, add the mapping test |
| `src/pages/Loyalty/loyaltyLanding.ts` | Task 1 — allowlist guard so at-top customers keep their existing post-login behavior (added mid-task; the plan's original audit missed this consumer) |
| `src/lib/lang/locales/en.json` | Task 2 — 2 new keys |
| `src/pages/Loyalty/components/NextTiersSection.tsx` | Task 2 — new props, name anchor, top-tier line |
| `src/pages/Loyalty/components/BenefitsTab.tsx` | Task 2 — pass the two new props |
| `src/pages/Loyalty/index.test.tsx` | Task 2 — 3 new tests + 1 existing test extended |

Untouched: `index.tsx` (BenefitsTab already receives `tierProgress`), `TierProgressCard.tsx`, `LoyaltyHero.tsx`, the allowlist gate.

---

### Task 1: Accept `AtTop` in the tier-progress data layer

**Files:**
- Modify: `src/pages/Loyalty/api.ts` (interface at ~257; guard at ~318-325)
- Modify: `src/pages/Loyalty/api.test.ts` (`it.each` row at ~594-597; `it('returns null for AtTop')` at ~689)

**Interfaces:**
- Produces: `LoyaltyTierProgress.targetKind: 'NextTier' | 'PrePointsGate' | 'AtTop'`. For an `AtTop` payload `fetchTierProgress` resolves to an object with `currentTierName` set, `targetTierName: ''`, every numeric field `0`, and `summary` carrying the server string. Task 2 reads `targetKind === 'AtTop'` and `currentTierName`.

- [ ] **Step 1: Capture the red baseline**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run`
Record the pass/fail counts. Every later "green" means "no failures beyond this baseline".

- [ ] **Step 2: Update the two existing tests that assert the old behavior (failing first)**

In `src/pages/Loyalty/api.test.ts`:

(a) In the `it.each([...])('returns null for %s', …)` table, replace this row:

```ts
    [
      'top tier (TargetKind not NextTier)',
      { Success: true, Result: { TierProgress: { TargetKind: 'AtTop' } } },
    ],
```

with:

```ts
    [
      'an unrecognized target kind',
      { Success: true, Result: { TierProgress: { TargetKind: 'Unrecognized' } } },
    ],
```

(b) In the `describe('fetchTierProgress target kinds', …)` block, replace the whole test:

```ts
  it('returns null for AtTop', async () => {
    withProgressSite();
    server.use(
      http.get(progressUrl, () =>
        HttpResponse.json({ Success: true, Result: { TierProgress: { TargetKind: 'AtTop' } } }),
      ),
    );

    expect(await fetchTierProgress(264074)).toBeNull();
  });
```

with this one (payload copied from the live endpoint, 2026-07-28, customer 80591):

```ts
  it('maps AtTop with the current tier name and zeroed quotas', async () => {
    withProgressSite();
    server.use(
      http.get(progressUrl, () =>
        HttpResponse.json({
          Success: true,
          Result: {
            TierProgress: {
              CurrentTierName: 'Signature',
              TargetKind: 'AtTop',
              TargetTierName: null,
              TargetOrdersRequired: 0,
              TargetAmountRequired: 0,
              OrdersInWindow: 0,
              SpendInWindow: 0,
              OrdersProgressPct: 0,
              SpendProgressPct: 0,
              Summary: "At top tier 'Signature' — earning at 300.00 %.",
            },
          },
        }),
      ),
    );

    expect(await fetchTierProgress(264074)).toEqual({
      targetKind: 'AtTop',
      currentTierName: 'Signature',
      targetTierName: '',
      ordersInWindow: 0,
      targetOrdersRequired: 0,
      spendInWindow: 0,
      targetAmountRequired: 0,
      ordersProgressPct: 0,
      spendProgressPct: 0,
      summary: "At top tier 'Signature' — earning at 300.00 %.",
    });
  });
```

- [ ] **Step 3: Run — the new mapping test must FAIL**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/api.test.ts --run`
Expected: `maps AtTop with the current tier name and zeroed quotas` FAILS (receives `null`, expected an object). The repointed `it.each` row should PASS already — `'Unrecognized'` is not an accepted kind today either.

- [ ] **Step 4: Widen the type union**

In `src/pages/Loyalty/api.ts`, change:

```ts
export interface LoyaltyTierProgress {
  targetKind: 'NextTier' | 'PrePointsGate';
```

to:

```ts
export interface LoyaltyTierProgress {
  targetKind: 'NextTier' | 'PrePointsGate' | 'AtTop';
```

- [ ] **Step 5: Accept `AtTop` in the guard**

In the same file, replace this block:

```ts
  // Only these two kinds have something to show: NextTier drives the progress card,
  // PrePointsGate drives the hero's shopping nudge. AtTop (and anything unknown) = nothing.
  if (
    !progress ||
    (progress.TargetKind !== 'NextTier' && progress.TargetKind !== 'PrePointsGate')
  ) {
    return null;
  }
```

with:

```ts
  // NextTier drives the progress card, PrePointsGate the hero's shopping nudge, and
  // AtTop tells My benefits to drop the tier ladder. Anything unknown = nothing to show.
  if (
    !progress ||
    (progress.TargetKind !== 'NextTier' &&
      progress.TargetKind !== 'PrePointsGate' &&
      progress.TargetKind !== 'AtTop')
  ) {
    return null;
  }
```

The mapping expression below it is unchanged — `TargetTierName: null` already becomes `''` through the existing `?? ''`, and the zeroed quotas map straight through. The three-way `!==` chain still narrows `TargetKind` from `string` to the literal union, so `targetKind: progress.TargetKind` stays type-safe with no cast.

- [ ] **Step 6: Run — green**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/api.test.ts --run` — expected PASS.
Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run` — whole folder green vs baseline. The hero and progress-card tests must be unaffected: both already gate on their own `targetKind`, so a non-null `AtTop` object changes nothing for them. If either fails, stop and report — that is a real regression, not a test to update.
Run: `yarn tsc --noEmit` — clean.

- [ ] **Step 7: Commit (explicit paths only)**

```bash
git add src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts
git diff --cached --stat   # must list exactly these two files
git commit -m "feat: B2B-0000 Map the AtTop tier-progress kind instead of discarding it"
```

---

### Task 2: Anchor the ladder on the SSW tier name and show top-tier copy

**Files:**
- Modify: `src/lib/lang/locales/en.json` (insert after `loyalty.benefits.autoUpgrade`, ~818)
- Modify: `src/pages/Loyalty/components/NextTiersSection.tsx`
- Modify: `src/pages/Loyalty/components/BenefitsTab.tsx` (the `<NextTiersSection …/>` usage, ~137)
- Modify: `src/pages/Loyalty/index.test.tsx` (3 new tests; extend `hides the tier ladder for a top-tier customer but keeps the contact footer`)

**Interfaces:**
- Consumes: Task 1's `targetKind === 'AtTop'` and `currentTierName` from `LoyaltyTierProgress`.
- Produces: `NextTiersSection` props `{ tiers: LoyaltyTier[]; currentTierId: string | null; currentTierName: string | null; atTop: boolean }`. New i18n keys `loyalty.benefits.atTopTier` (takes `{tier}`) and `loyalty.benefits.atTopTierGeneric`.

- [ ] **Step 1: Write the failing tests**

In `src/pages/Loyalty/index.test.tsx`, add these three tests immediately after the existing `it('hides the tier ladder when the customer tier is unknown', …)`:

```tsx
it('replaces the tier ladder with the top-tier message when SSW reports AtTop', async () => {
  // Influence still has this customer on the lowest tier (t1) while SSW says they are
  // topped out — the exact divergence that used to leave a SIGNATURE card in the ladder.
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1' }));
  mockTiers(rewardTiers());
  mockTierProgress(
    buildTierProgressWith({
      targetKind: 'AtTop',
      currentTierName: 'Signature',
      targetTierName: '',
    }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(
    await screen.findByText(
      "You're at Signature, our top tier — you're already earning at the highest rate we offer.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("What's Available as Your Orders Grow?")).not.toBeInTheDocument();
  expect(screen.queryByText('Signature Tier')).not.toBeInTheDocument();
  expect(
    screen.queryByText('When you reach the next level, your tier upgrades automatically.'),
  ).not.toBeInTheDocument();
  // A non-null AtTop progress object must not wake the progress card or the hero CTA.
  expect(screen.queryByText(/Progress to/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Start shopping to earn points' }),
  ).not.toBeInTheDocument();
});

it('falls back to the generic top-tier message when SSW sends no tier name', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1' }));
  mockTiers(rewardTiers());
  mockTierProgress(
    buildTierProgressWith({ targetKind: 'AtTop', currentTierName: '', targetTierName: '' }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(
    await screen.findByText(
      "You're at our top tier — you're already earning at the highest rate we offer.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("What's Available as Your Orders Grow?")).not.toBeInTheDocument();
});

it('anchors the tier ladder on the SSW tier name when the Influence id disagrees', async () => {
  // SSW and Influence keep separate tier id spaces, so the id resolves to nothing here;
  // the case-insensitive name match ('SELECT' vs 'Select') is what positions the ladder.
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 'influence-only-id' }));
  mockTiers(rewardTiers());
  mockTierProgress(
    buildTierProgressWith({
      targetKind: 'NextTier',
      currentTierName: 'SELECT',
      targetTierName: 'Signature',
    }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('Signature Tier')).toBeInTheDocument();
  expect(screen.queryByText('Select Tier')).not.toBeInTheDocument();
  expect(screen.queryByText('Essential Tier')).not.toBeInTheDocument();
});
```

Then extend the existing top-tier test to lock the documented gap — add this one assertion as its last line, inside `it('hides the tier ladder for a top-tier customer but keeps the contact footer', …)`:

```tsx
  // Influence ordering alone never earns the top-tier message; only SSW's AtTop does.
  expect(screen.queryByText(/our top tier/)).not.toBeInTheDocument();
```

- [ ] **Step 2: Run — the three new tests must FAIL**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run`
Expected failures: the two top-tier tests cannot find their message (no such copy yet, and the ladder still renders from the Influence id), and the name-anchoring test cannot find `Signature Tier` (the unmatched id yields an empty ladder today). The extended assertion on the existing test should already PASS.

- [ ] **Step 3: Add the i18n keys**

In `src/lib/lang/locales/en.json`, insert these two lines directly after
`"loyalty.benefits.autoUpgrade": "When you reach the next level, your tier upgrades automatically.",`:

```json
  "loyalty.benefits.atTopTier": "You're at {tier}, our top tier — you're already earning at the highest rate we offer.",
  "loyalty.benefits.atTopTierGeneric": "You're at our top tier — you're already earning at the highest rate we offer.",
```

- [ ] **Step 4: Rewrite NextTiersSection**

Replace the contents of `src/pages/Loyalty/components/NextTiersSection.tsx` with:

```tsx
import { ArrowOutward } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { LoyaltyTier } from '../api';

interface NextTiersSectionProps {
  tiers: LoyaltyTier[];
  currentTierId: string | null;
  currentTierName: string | null;
  atTop: boolean;
}

function NextTiersSection({
  tiers,
  currentTierId,
  currentTierName,
  atTop,
}: NextTiersSectionProps) {
  const b3Lang = useB3Lang();

  // SSW is the only trustworthy source for "topped out": Influence tier ids live in a
  // separate id space, so an id match cannot tell us the customer's real position.
  if (atTop) {
    return (
      <Typography sx={{ textAlign: 'center' }}>
        {currentTierName
          ? b3Lang('loyalty.benefits.atTopTier', { tier: currentTierName })
          : b3Lang('loyalty.benefits.atTopTierGeneric')}
      </Typography>
    );
  }

  const sswName = currentTierName?.trim().toLowerCase() ?? '';
  const byName = sswName
    ? tiers.findIndex((tier) => tier.title.trim().toLowerCase() === sswName)
    : -1;
  // Prefer the SSW name; fall back to the Influence id when progress is unavailable.
  const currentIndex =
    byName === -1 ? tiers.findIndex((tier) => tier.id === currentTierId) : byName;
  // Unknown current tier: we cannot say what is "above", so show nothing.
  const nextTiers = currentIndex === -1 ? [] : tiers.slice(currentIndex + 1);

  if (nextTiers.length === 0) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 800, textAlign: 'center' }}>
        {b3Lang('loyalty.benefits.nextTiersTitle')}
      </Typography>
      <Typography sx={{ textAlign: 'center' }}>
        {nextTiers.length === 1
          ? b3Lang('loyalty.benefits.nextTiersIntroOne')
          : b3Lang('loyalty.benefits.nextTiersIntroMany', { count: nextTiers.length })}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {nextTiers.map((tier) => (
          <Box
            key={tier.id}
            sx={{
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              borderRadius: 2,
              p: 3,
              flex: '1 1 40%',
              minWidth: 240,
            }}
          >
            <Box
              sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <Typography variant="h5" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>
                {b3Lang('loyalty.benefits.nextTierName', { title: tier.title })}
              </Typography>
              <ArrowOutward sx={{ fontSize: 32 }} />
            </Box>
            {tier.threshold.trim() !== '' && (
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>
                {`(${tier.threshold}) :`}
              </Typography>
            )}
            {tier.perks.length > 0 && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {tier.perks.join(', ')}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
      <Typography sx={{ textAlign: 'center' }}>{b3Lang('loyalty.benefits.autoUpgrade')}</Typography>
    </Box>
  );
}

export default NextTiersSection;
```

(Everything from the `return (` onward is byte-identical to today — only the props, the `atTop` early return, and the anchor resolution are new.)

- [ ] **Step 5: Pass the new props from BenefitsTab**

In `src/pages/Loyalty/components/BenefitsTab.tsx`, replace:

```tsx
      <NextTiersSection tiers={tiers} currentTierId={customer.currentLoyaltyTierId ?? null} />
```

with:

```tsx
      <NextTiersSection
        tiers={tiers}
        currentTierId={customer.currentLoyaltyTierId ?? null}
        currentTierName={tierProgress?.currentTierName || null}
        atTop={tierProgress?.targetKind === 'AtTop'}
      />
```

`tierProgress` is already a prop on this component — no signature change, and `index.tsx` needs no edit. Do not touch the banner `<Box>` above it; it carries unrelated uncommitted work.

- [ ] **Step 6: Run — everything green**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run` — the three new tests pass.
Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run` — whole folder green vs baseline. The two existing ladder tests (`shows the tiers above the customer…`, `shows only the tiers above the customer…`) pass unchanged: they never call `mockTierProgress`, so `currentTierName` is null and the Influence id match still drives them.
Run: `yarn tsc --noEmit` — clean.
Run: `npx eslint src/pages/Loyalty/ --max-warnings 0` — clean.

- [ ] **Step 7: Commit (explicit paths only)**

```bash
git add src/lib/lang/locales/en.json \
        src/pages/Loyalty/components/NextTiersSection.tsx \
        src/pages/Loyalty/components/BenefitsTab.tsx \
        src/pages/Loyalty/index.test.tsx
git diff --cached --stat   # must list exactly these four files
git commit -m "fix: B2B-0000 Anchor the tier ladder on SSW tier state, not Influence ids"
```

If `git diff --cached` contains any `objectPosition` / banner-crop hunk, the
precondition in Global Constraints was skipped: run `git reset` to unstage
everything, resolve the precondition, and stage again. Do not hand-edit the
staged content.

---

## Verification (whole feature)

- `CIRCLECI=true yarn test src/pages/Loyalty/ --run` green vs baseline; `yarn tsc --noEmit` clean; `npx eslint src/pages/Loyalty/ --max-warnings 0` clean; `yarn lint:knip` at the `analytics.ts` baseline; `yarn build` exit 0.
- The banner photo-crop change survives intact — whether it was committed ahead of this work, stashed and restored, or left in a separate worktree. Confirm with `git log --oneline -5` and `git status` that neither of this plan's commits absorbed it.
- Manual (sandbox, post-deploy): account 80591 (Signature / `AtTop`) sees "You're at Signature, our top tier…" and **no** ladder; a mid-tier account sees its ladder with the current tier excluded; an account with the progress endpoint unreachable renders exactly as it does today.

## Notes / out of scope

- Mapping `AtTop` makes `displayTierTitle` prefer SSW's `"Signature"` over Influence's `"SIGNATURE"` for at-top customers, so the hero chip, intro line, banner heading and info cards become title case for them. Accepted per the spec; the tier perk box keeps Influence's casing, so that one line stays out of step.
- The server `Summary` ("At top tier 'Signature' — earning at 300.00 %.") is mapped but deliberately never rendered.
- Reconciling the SSW/Influence tier **id** spaces is out of scope — this plan routes around the mismatch rather than fixing it.
