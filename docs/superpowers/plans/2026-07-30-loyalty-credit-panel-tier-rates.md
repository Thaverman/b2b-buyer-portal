# Loyalty Credit-Panel Tier-Rate Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Earning and Redeeming Credit" card on the Loyalty My-benefits tab show the customer's actual tier rate (Essential 1% with a $500 annual-purchase gate, Select 2%, Signature 3%, or a generic line when no tier is known) instead of a hardcoded "1%" for everyone, and refresh its bullet list from 5 items to 4.

**Architecture:** Pure content + a small local, case-insensitive tier-name-to-rate lookup inside `BenefitsInfoCards.tsx` (no new API surface, no new components, no prop-shape change). i18n copy moves from one `{tier}`-interpolated key to four literal per-tier/generic keys.

**Tech Stack:** React 18, MUI, `react-intl` via `useB3Lang`, Vitest + Testing Library + MSW, builder factories. All commands run from `apps/storefront/`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-30-loyalty-credit-panel-tier-rates-design.md`.
- Free Shipping and Your Tier Status cards' copy is unchanged — do not touch `loyalty.benefits.shipping.*` or `loyalty.benefits.tierStatus.*` keys, or their assertions.
- Tier matching is case-insensitive and whitespace-trimmed (mirrors `isTierAllowed` in `api.ts`), but stays local to `BenefitsInfoCards.tsx` — do not add it to `api.ts`.
- No dynamically-constructed i18n key strings — every `b3Lang(...)` call site uses a literal key string.
- `BenefitsInfoCardsProps` (`{ tierDisplayName: string | null }`) is unchanged.
- Run every command from `apps/storefront/`.
- Commit format: `type: B2B-0000 Subject` plus trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## File Structure

- **Modify** `src/lib/lang/locales/en.json` — rewrite `loyalty.benefits.credit.point1`/`point3`/`point4`; remove `point2`, `point2Generic` (old wording), `point5`; add `point2Essential`, `point2Select`, `point2Signature`, `point2Generic` (new wording).
- **Modify** `src/pages/Loyalty/components/BenefitsInfoCards.tsx` — add `matchCreditRateTier` helper + `CREDIT_RATE_KEYS` map; change the credit card's `points` array from 5 entries to 4.
- **Modify** `src/pages/Loyalty/index.test.tsx` — update the two existing tests that assert credit-card copy; add three tests for Select, Signature, and the generic fallback (null and unmatched-name cases).

---

## Task 1: Tier-specific credit-rate copy

**Files:**
- Modify: `src/lib/lang/locales/en.json:800-806`
- Modify: `src/pages/Loyalty/components/BenefitsInfoCards.tsx`
- Test: `src/pages/Loyalty/index.test.tsx:1326-1370`

**Interfaces:**
- Consumes: existing `tierDisplayName: string | null` prop on `BenefitsInfoCards` (unchanged); existing `useB3Lang()` (`(id: string, values?) => string`).
- Produces: nothing new is exported — `matchCreditRateTier` and `CREDIT_RATE_KEYS` are module-private to `BenefitsInfoCards.tsx`.

- [ ] **Step 1: Update the two existing tests to the new copy**

In `src/pages/Loyalty/index.test.tsx`, find the test `'shows the benefits banner and explainer cards with the tier name'` (around line 1326). Change the credit-card assertion from:

```ts
  expect(screen.getByText('Earning and Redeeming Credit')).toBeInTheDocument();
  expect(
    screen.getByText(
      'At the Essential level, you earn at a 1% rate once you reach $500 in annual purchases.',
    ),
  ).toBeInTheDocument();
```

to:

```ts
  expect(screen.getByText('Earning and Redeeming Credit')).toBeInTheDocument();
  expect(
    screen.getByText(
      'Once you reach $500 in annual purchases, your rate is 1% of your total order.',
    ),
  ).toBeInTheDocument();
```

Leave the rest of that test (banner heading, Free Shipping, Tier Status assertions) untouched.

Next, find the test `'styles the benefits explainer card bullet points at 18px in #282828'` (around line 1355). Change:

```ts
  // The banner subtitle above these cards is "Each purchase earns you points." verbatim —
  // an exact-text query for that string would match it instead of this longer bullet.
  const bullet = await screen.findByText(
    'Each purchase earns you points. Every month, your points are automatically converted to store credit you can apply to any future purchase.',
  );
```

to:

```ts
  // The banner subtitle above these cards is "Each purchase earns you points." verbatim —
  // query the full bullet sentence so this never collides with that shorter subtitle.
  const bullet = await screen.findByText(
    'Every purchase earns you points, based on your tier rate.',
  );
```

**Step 2: Add three new tests for the Select, Signature and fallback cases**

Immediately after the `'styles the benefits explainer card bullet points…'` test (before `'frames the benefits banner photo…'`), insert:

```ts
it('shows the Select tier credit rate with no annual-purchase gate', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1' }));
  mockTiers([buildTierWith({ id: 't1', title: 'Select' })]);

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByText('Your rate is 2% of your total order.'),
  ).toBeInTheDocument();
});

it('shows the Signature tier credit rate with no annual-purchase gate', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1' }));
  mockTiers([buildTierWith({ id: 't1', title: 'Signature' })]);

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByText('Your rate is 3% of your total order.'),
  ).toBeInTheDocument();
});

it('falls back to a generic credit rate line when no tier is resolved', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: null }));

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByText('Your rate depends on your membership tier.'),
  ).toBeInTheDocument();
});

it('falls back to a generic credit rate line for a tier name outside Essential/Select/Signature', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1' }));
  mockTiers([buildTierWith({ id: 't1', title: 'Platinum' })]);

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByText('Your rate depends on your membership tier.'),
  ).toBeInTheDocument();
});
```

These use the same `mockLoyaltyApis`, `mockTiers`, `buildLoyaltyCustomerWith`, `buildTierWith` helpers already imported and used elsewhere in this file — no new imports needed.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run -t "credit rate|explainer cards with the tier name|18px"`

Expected: FAIL — the Essential/Select/Signature/generic rate lines aren't in the DOM yet (the component still renders the old hardcoded "1% rate" copy), and the restyled-bullet test can't find its new target text.

- [ ] **Step 4: Update the i18n copy**

In `src/lib/lang/locales/en.json`, replace lines 800-806:

```json
  "loyalty.benefits.credit.title": "Earning and Redeeming Credit",
  "loyalty.benefits.credit.point1": "Each purchase earns you points. Every month, your points are automatically converted to store credit you can apply to any future purchase.",
  "loyalty.benefits.credit.point2": "At the {tier} level, you earn at a 1% rate once you reach $500 in annual purchases.",
  "loyalty.benefits.credit.point2Generic": "You earn at your tier's rate once you reach $500 in annual purchases.",
  "loyalty.benefits.credit.point3": "Credit is calculated on your order total, after any discounts, excluding tax and shipping.",
  "loyalty.benefits.credit.point4": "When your points are ready, we'll send you an email letting you know your store credit is available to use.",
  "loyalty.benefits.credit.point5": "The store certificates are valid for 12 months and can be used alongside product discounts.",
```

with:

```json
  "loyalty.benefits.credit.title": "Earning and Redeeming Credit",
  "loyalty.benefits.credit.point1": "Every purchase earns you points, based on your tier rate.",
  "loyalty.benefits.credit.point2Essential": "Once you reach $500 in annual purchases, your rate is 1% of your total order.",
  "loyalty.benefits.credit.point2Select": "Your rate is 2% of your total order.",
  "loyalty.benefits.credit.point2Signature": "Your rate is 3% of your total order.",
  "loyalty.benefits.credit.point2Generic": "Your rate depends on your membership tier.",
  "loyalty.benefits.credit.point3": "Redeem your points for a certificate on the Get Rewards page.",
  "loyalty.benefits.credit.point4": "Certificates can be used alongside product discounts.",
```

- [ ] **Step 5: Update `BenefitsInfoCards.tsx`**

Read the current file — it's short (85 lines). Add a tier-matching helper and rate-key map above the `BenefitsInfoCards` function, and change the credit card's `points` array. The full new file:

```tsx
import {
  LocalShippingOutlined,
  SavingsOutlined,
  SvgIconComponent,
  TrendingUp,
} from '@mui/icons-material';
import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

interface BenefitsInfoCardsProps {
  tierDisplayName: string | null;
}

interface InfoCardProps {
  title: string;
  Icon: SvgIconComponent;
  points: string[];
}

function InfoCard({ title, Icon, points }: InfoCardProps) {
  return (
    <Box sx={{ bgcolor: 'grey.100', borderRadius: 2, p: { xs: 3, sm: 4 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography variant="h6" color="primary" sx={{ fontWeight: 700, mb: 1 }}>
          {title}
        </Typography>
        <Icon color="primary" sx={{ fontSize: 40 }} />
      </Box>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {points.map((point) => (
          <Typography
            key={point}
            component="li"
            variant="body2"
            sx={{ mb: 0.5, fontSize: '18px', color: '#282828' }}
          >
            {point}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

type CreditRateTier = 'essential' | 'select' | 'signature';

const CREDIT_RATE_TIERS: CreditRateTier[] = ['essential', 'select', 'signature'];

// Case-insensitive, trim-then-compare — mirrors isTierAllowed's convention in api.ts —
// but stays local: this is display-copy selection, not shared by any other consumer.
function matchCreditRateTier(tierDisplayName: string | null): CreditRateTier | null {
  const normalized = tierDisplayName?.trim().toLowerCase();
  return CREDIT_RATE_TIERS.find((tier) => tier === normalized) ?? null;
}

const CREDIT_RATE_KEYS: Record<CreditRateTier, string> = {
  essential: 'loyalty.benefits.credit.point2Essential',
  select: 'loyalty.benefits.credit.point2Select',
  signature: 'loyalty.benefits.credit.point2Signature',
};

function BenefitsInfoCards({ tierDisplayName }: BenefitsInfoCardsProps) {
  const b3Lang = useB3Lang();
  const creditRateTier = matchCreditRateTier(tierDisplayName);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <InfoCard
        title={b3Lang('loyalty.benefits.credit.title')}
        Icon={SavingsOutlined}
        points={[
          b3Lang('loyalty.benefits.credit.point1'),
          b3Lang(
            creditRateTier
              ? CREDIT_RATE_KEYS[creditRateTier]
              : 'loyalty.benefits.credit.point2Generic',
          ),
          b3Lang('loyalty.benefits.credit.point3'),
          b3Lang('loyalty.benefits.credit.point4'),
        ]}
      />
      <InfoCard
        title={b3Lang('loyalty.benefits.shipping.title')}
        Icon={LocalShippingOutlined}
        points={[
          b3Lang('loyalty.benefits.shipping.point1'),
          b3Lang('loyalty.benefits.shipping.point2'),
        ]}
      />
      <InfoCard
        title={b3Lang('loyalty.benefits.tierStatus.title')}
        Icon={TrendingUp}
        points={[
          b3Lang('loyalty.benefits.tierStatus.point1'),
          b3Lang('loyalty.benefits.tierStatus.point2'),
        ]}
      />
    </Box>
  );
}

export default BenefitsInfoCards;
```

(Only the credit `InfoCard` block and the new helper/map above the component changed — the Free Shipping and Tier Status `InfoCard`s are copied verbatim from the current file.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/ --run`
Expected: all green.

- [ ] **Step 7: Gates**

Run: `yarn tsc --noEmit` → clean.
Run: `npx eslint src/pages/Loyalty/components/BenefitsInfoCards.tsx src/pages/Loyalty/index.test.tsx --max-warnings 0` → clean.
Run: `yarn lint:knip` → clean (no new exports were added; `matchCreditRateTier`/`CREDIT_RATE_KEYS` are module-private).

- [ ] **Step 8: Commit**

```bash
git add src/lib/lang/locales/en.json src/pages/Loyalty/components/BenefitsInfoCards.tsx src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Vary the loyalty credit-rate copy by membership tier" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** copy table (Essential/Select/Signature/generic) → Step 4; tier-matching helper → Step 5; bullet count 5→4 → Step 5; test updates for the two existing assertions → Step 1; new Select/Signature/generic-null/generic-unmatched tests → Step 2. Free Shipping / Tier Status left untouched throughout, per spec non-goals.
- **Placeholder scan:** none — every step has literal code.
- **Type consistency:** `CreditRateTier` / `CREDIT_RATE_KEYS` / `matchCreditRateTier` names and shapes are identical between Step 5's code block and the spec.
