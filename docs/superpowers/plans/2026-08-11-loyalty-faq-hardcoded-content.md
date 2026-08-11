# Loyalty FAQ Hardcoded Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the loyalty FAQ copy into the portal as a TSX content module with real `mailto:`/`tel:` links, and retire the `window.loyaltyFaqConfig` theme contract.

**Architecture:** A new `faqContent.tsx` holds the 7 sections / 32 items verbatim from sandbox, with two tiny link components for the rep email and phone. `FaqTab` imports that content directly and loses its props; `index.tsx` stops gating the FAQ tab on config. The config readers, the `Window` declaration, and the now-orphaned locale key are deleted in a second, deletion-only task.

**Tech Stack:** React 18, TypeScript, MUI 5, Vitest + Testing Library, react-intl (via `useB3Lang`).

**Spec:** [2026-08-11-loyalty-faq-hardcoded-content-design.md](../specs/2026-08-11-loyalty-faq-hardcoded-content-design.md)

## Global Constraints

- **All commands run from `apps/storefront/`**, not the repo root.
- Commit subject format: `type: B2B-0000 Short description`.
- **`react/function-component-definition` is an error** — named components must be `function Name() {}` declarations, never `const Name = () => …`. Verified against this config 2026-08-11.
- **`react/no-unescaped-entities` is an error** — a raw `'` in JSX *text* fails lint. Write `&apos;`. (Apostrophes inside plain string literals are fine; only JSX text is affected.) Verified 2026-08-11.
- Import order is enforced by `simple-import-sort`: `react` and other packages first, then `@/…`, then `../…`, then `./…`. `yarn format` auto-fixes ordering.
- Test imports come from `tests/test-utils`, never directly from `@testing-library/*`.
- **Copy rule:** FAQ text is transcribed verbatim from sandbox, with exactly three reworded answers (Task 1, Step 3). No absolute `storesupply.com` URL may appear in FAQ copy — a production URL in the bundle also runs on sandbox.
- **Expected interim red:** at the end of Task 1, `yarn lint:knip` reports `getFaqSections`/`getFaqIntro` as unused exports. That is correct and is resolved in Task 2. Run `yarn lint` only at the end of Task 2.
- `dev` has a pre-existing red test baseline. Compare failures against the baseline before this work; do not fix unrelated redness.

## File Structure

| File | Responsibility |
|---|---|
| `src/pages/Loyalty/faqContent.tsx` | **Create.** All FAQ copy + the two link components. Page data, so it sits next to `api.ts` per the matroska rule. |
| `src/pages/Loyalty/components/FaqTab.tsx` | **Modify.** Renders the imported content; loses both props and the position-keying block. |
| `src/pages/Loyalty/index.tsx` | **Modify.** FAQ tab becomes unconditional; `activeTab` indirection collapses into `tab`. |
| `src/pages/Loyalty/api.ts` | **Modify (Task 2).** Delete the two config readers and their two interfaces. |
| `src/index.d.ts` | **Modify (Task 2).** Delete the `loyaltyFaqConfig` window declaration. |
| `src/lib/lang/locales/en.json` | **Modify (Task 2).** Delete the orphaned `loyalty.faq.intro`. |
| `src/pages/Loyalty/index.test.tsx` | **Modify.** Rewrite FAQ coverage against the real content. |
| `src/pages/Loyalty/api.test.ts` | **Modify (Task 2).** Delete the `getFaqSections and getFaqIntro` block. |

---

### Task 1: FAQ content module and linked contact details

**Files:**
- Create: `src/pages/Loyalty/faqContent.tsx`
- Modify: `src/pages/Loyalty/components/FaqTab.tsx` (whole file)
- Modify: `src/pages/Loyalty/index.tsx:21-22, 172-174, 221, 237, 239, 247, 254, 255`
- Test: `src/pages/Loyalty/index.test.tsx:51, 1659-1740`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `FAQ_INTRO: string` and `FAQ_SECTIONS: FaqSection[]` from `src/pages/Loyalty/faqContent.tsx`, where `FaqSection = { title: string; items: FaqItem[] }` and `FaqItem = { question: string; answer?: ReactNode; bullets?: string[] }`. Both interfaces stay **unexported** — knip fails the build on unused exports and `FaqTab` needs only the two constants. `FaqTab` becomes a zero-prop component (`function FaqTab()`).

- [ ] **Step 1: Replace the FAQ tests with coverage of the real content**

In `src/pages/Loyalty/index.test.tsx`, delete lines 1659-1740 — that is these five tests, all of which assert the contract being removed:

- `hides the FAQ tab when the theme ships no FAQ content`
- `renders theme-provided FAQ sections, questions and answers`
- `uses the default FAQ intro when the theme supplies none`
- `renders an FAQ item bullet list even when the item has no answer`
- `falls back to My benefits for ?tab=faq with no FAQ content`

Also delete the now-dead line 51, `  delete window.loyaltyFaqConfig;`, from the `afterEach` block.

Insert these five tests in their place. Note none of them sets `window.loyaltyFaqConfig` — the content no longer comes from there. MUI's `Accordion` keeps collapsed panel content mounted, so answers and bullets are queryable without expanding anything (the deleted tests relied on this too).

```tsx
it('renders the hardcoded FAQ content with no theme config present', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'FAQs' }));

  expect(await screen.findByText('Program Tiers')).toBeInTheDocument();
  expect(screen.getByText('What are the different program tiers?')).toBeInTheDocument();
  expect(
    screen.getByText(
      'Monthly. We look at your orders from the past 12 months.',
    ),
  ).toBeInTheDocument();
});

it('renders the FAQ intro without a theme-supplied one', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'FAQs' }));

  expect(
    await screen.findByText(/Smart Rewards is our free loyalty program/),
  ).toBeInTheDocument();
});

it('renders bullets for an FAQ item that has no answer', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'FAQs' }));

  expect(await screen.findByText('What do I need to qualify for each tier?')).toBeInTheDocument();
  expect(
    screen.getByText('Select: 8+ orders per year, or $2,000+ in annual purchases.'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Signature: 16+ orders per year, or $5,000+ in annual purchases.'),
  ).toBeInTheDocument();
});

it('links the rep email and phone, with no target since neither navigates', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'FAQs' }));

  // MUI keeps collapsed Accordion content mounted but visibility:hidden, and role
  // queries exclude inaccessible nodes, so every answer carrying a link is expanded
  // first. (getByText matches hidden text, which is why the copy assertions below
  // and in the other tests need no expansion.)
  await user.click(screen.getByText('How do I reach my account rep?'));
  await user.click(screen.getByText('I think my tier is wrong. What do I do?'));
  await user.click(screen.getByText('Can I combine Smart Rewards with other promotions?'));
  await user.click(
    screen.getByText("I have a question that's not covered here. Who do I contact?"),
  );

  const emailLinks = await screen.findAllByRole('link', {
    name: 'contactsmartrewards@storesupply.com',
  });
  expect(emailLinks).toHaveLength(4);
  emailLinks.forEach((link) => {
    expect(link).toHaveAttribute('href', 'mailto:contactsmartrewards@storesupply.com');
    expect(link).not.toHaveAttribute('target');
  });

  const phoneLink = screen.getByRole('link', { name: '1-833-397-2619' });
  expect(phoneLink).toHaveAttribute('href', 'tel:+18333972619');
  expect(phoneLink).not.toHaveAttribute('target');

  // Pinning the total against the five exact hrefs above leaves no room for a
  // storefront URL to hide among the FAQ's links.
  expect(screen.getAllByRole('link')).toHaveLength(5);
});

it('points shoppers at portal tabs instead of an absolute storefront URL', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'FAQs' }));

  expect(
    await screen.findByText('Your tier, benefits, and progress are on the My benefits tab.'),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      'Your tier and benefits are on the My benefits tab, your points balance is at the top of this page, and any store credit certificates are under My rewards.',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/login\.php/)).not.toBeInTheDocument();
});

it('selects the FAQ tab for ?tab=faq', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=faq' }] });

  expect(await screen.findByRole('tab', { name: 'FAQs', selected: true })).toBeInTheDocument();
});
```

If the link count of 5 trips because `LoyaltyHero` renders an anchor with this fixture, scope the sweep with `within` on the FAQ content rather than raising the number — the point of the count is that the FAQ's link set is exactly the five known contact links.

Do not reach for `.closest('a')` to get around the collapsed-content problem: `testing-library/no-node-access` is enabled via `plugin:testing-library/react` and would reject it at Task 2's lint gate.

- [ ] **Step 2: Run the tests and confirm they fail for the right reason**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run`

Expected: FAIL. The five content tests fail at `findByRole('tab', { name: 'FAQs' })` — with no `window.loyaltyFaqConfig`, `hasFaq` is false and the tab is not rendered. `selects the FAQ tab for ?tab=faq` fails because `activeTab` redirects to `benefits`. If any of these six tests *passes* at this point, stop and find out why before continuing.

- [ ] **Step 3: Create the content module**

Create `src/pages/Loyalty/faqContent.tsx`. Copy is verbatim from sandbox except the three answers marked `// Reworded:` — those pointed at `https://www.storesupply.com/login.php#/login`, which is both a production URL baked into a bundle that also runs on sandbox and a login prompt for a reader who is already signed in.

```tsx
import { ReactNode } from 'react';
import { Link } from '@mui/material';

// The FAQ renders only inside the signed-in portal, so its links are contact
// channels, never storefront URLs. mailto:/tel: invoke a protocol handler and
// never navigate, which is why neither needs target="_top" the way the
// storefront CTAs in BenefitsTab/LoyaltyHero do.
const REP_EMAIL = 'contactsmartrewards@storesupply.com';
const REP_PHONE = '1-833-397-2619';

function RepEmail() {
  return (
    <Link href={`mailto:${REP_EMAIL}`} underline="always">
      {REP_EMAIL}
    </Link>
  );
}

function RepPhone() {
  return (
    <Link href="tel:+18333972619" underline="always">
      {REP_PHONE}
    </Link>
  );
}

interface FaqItem {
  question: string;
  answer?: ReactNode;
  bullets?: string[];
}

interface FaqSection {
  title: string;
  items: FaqItem[];
}

export const FAQ_INTRO =
  'Smart Rewards is our free loyalty program for Store Supply Warehouse customers. Every qualifying purchase earns points that convert into store credit, every tier gets free ground shipping on orders over $300, and higher tiers add an account rep and early access to closeouts and new products.';

export const FAQ_SECTIONS: FaqSection[] = [
  {
    title: 'About Smart Rewards',
    items: [
      {
        question: 'What is Smart Rewards?',
        answer:
          'A free rewards program for Store Supply Warehouse customers. Every qualifying purchase earns you points that convert into store credit you can use on future orders. You also get free ground shipping on orders over $300, and at higher tiers, early access to new products and an account rep.',
      },
      {
        question: 'Does it cost anything to be in the program?',
        answer: "No. There's no cost to be in Smart Rewards.",
      },
      {
        question: 'Do I need to sign up?',
        answer:
          "No. If you're an existing Store Supply Warehouse customer, you're already in. Your tier is based on your ordering history.",
      },
      {
        question: 'Who is eligible?',
        answer:
          'All Store Supply Warehouse customers. Your tier is determined by your purchasing activity over the past 12 months.',
      },
    ],
  },
  {
    title: 'Program Tiers',
    items: [
      {
        question: 'What are the different program tiers?',
        answer:
          "Smart Rewards has three tiers. Every purchase earns you points based on your tier's rate, calculated on your order total after discounts, excluding tax and shipping. Your points can be redeemed for store credit certificates.",
        bullets: [
          'Essential: 1% rate (after $500 in annual purchases), free ground shipping on orders over $300.',
          'Select: 2% rate, free ground shipping on orders over $300, an account rep, and 48-hour early access to closeouts and new products.',
          'Signature: 3% rate (the highest), free ground shipping on orders over $300, a dedicated account rep, and 1-week early access to closeouts and new products.',
        ],
      },
      {
        question: 'How is my tier determined?',
        answer:
          'We look at your order count and annual spend over the past 12 months, updated monthly.',
      },
      {
        question: 'What do I need to qualify for each tier?',
        bullets: [
          "Essential: You're in after your first order.",
          'Select: 8+ orders per year, or $2,000+ in annual purchases.',
          'Signature: 16+ orders per year, or $5,000+ in annual purchases.',
        ],
      },
      {
        question: 'How do I move up to a higher tier?',
        answer:
          "When your orders reach the next tier's threshold, you move up automatically. No application needed. We check monthly, so you'll move as soon as you qualify.",
      },
      {
        question: 'Can my tier go down?',
        answer:
          "Yes. If your ordering falls below your current tier's threshold over a 12-month period, your tier may change. We'll give you 30 days' notice before any change takes effect.",
      },
      {
        question: 'How often is my tier reviewed?',
        answer: 'Monthly. We look at your orders from the past 12 months.',
      },
      {
        question: 'Where can I see my current tier?',
        // Reworded: was "Log in at https://www.storesupply.com/login.php#/login to
        // see your tier, benefits, and progress."
        answer: 'Your tier, benefits, and progress are on the My benefits tab.',
      },
    ],
  },
  {
    title: 'Earning and Redeeming Credit',
    items: [
      {
        question: 'How do I earn credit?',
        answer:
          "Each purchase earns you points based on your tier's credit rate (1% for Essential, 2% for Select, 3% for Signature). Points are calculated on your order total after any discounts, excluding tax and shipping charges.",
      },
      {
        question: 'How do I redeem my points?',
        answer:
          "You'll receive an email when points are in your account. You redeem points for store credit certificates. You can then apply the certificates to any future order.",
      },
      {
        question: 'How long are my store credit certificates valid?',
        answer: "12 months from the date they're issued.",
      },
      {
        question: 'Can I use store credit with other discounts?',
        answer:
          'Yes. Store credit certificates work alongside product discounts on the same order.',
      },
      {
        question: 'Is there a limit on how much credit I can use per order?',
        answer:
          'One store credit certificate per order. Certificates cannot be transferred to other accounts.',
      },
      {
        question: 'What counts toward my points calculation?',
        answer:
          'Your invoice total after product discounts, excluding tax and shipping charges. If you return an item, the refund amount is deducted from your next point calculation.',
      },
      {
        question: 'Do I earn points on every order at the Essential level?',
        answer:
          'At the Essential tier, you earn at a 1% rate once you reach $500 in annual purchases. After that threshold, your purchases earn points for the remainder of the year.',
      },
    ],
  },
  {
    title: 'Free Shipping',
    items: [
      {
        question: 'How does free shipping work?',
        answer: 'Every tier gets free ground shipping on all qualifying orders over $300.',
      },
      {
        question: 'How do I know if my order qualifies for free shipping?',
        answer:
          'Your cart shows your progress toward the $300 threshold as you shop. Once you cross $300, free ground shipping applies automatically at checkout.',
      },
      {
        question: 'Are there any shipping exclusions?',
        answer: 'Free shipping covers standard ground delivery. The following are excluded:',
        bullets: [
          'Oversized items and items requiring LTL (less-than-truckload) freight',
          'Items requiring special handling',
          'Shipments to Alaska, Hawaii, and Puerto Rico',
        ],
      },
      {
        question: 'Can I upgrade to faster shipping?',
        answer:
          'If you are located more than 1 shipping day away via ground shipping from one of our shipping locations, you may choose expedited shipping for an extra cost if you need your item faster than standard ground shipping can get it to you.',
      },
    ],
  },
  {
    title: 'Your Account Rep (Select and Signature Tiers)',
    items: [
      {
        question: 'What is an account rep?',
        answer:
          'At the Select tier, you have access to an account rep who can help with orders, product questions, stock availability, and recommendations. At Signature, you have a dedicated rep assigned specifically to your account.',
      },
      {
        question: 'How do I reach my account rep?',
        answer: (
          <>
            You can reach your rep by phone at <RepPhone /> or by email at <RepEmail />.
          </>
        ),
      },
      {
        question: 'How can my account rep help me?',
        answer:
          'Placing orders, sourcing specific products, checking stock availability, product recommendations for your store, and any questions about your account or benefits.',
      },
    ],
  },
  {
    title: 'Early Access (Select and Signature Tiers)',
    items: [
      {
        question: 'What is early access?',
        answer:
          "Select and Signature members see closeout deals and new products before they're available to all customers. Select gets 48 hours. Signature gets a full week.",
      },
      {
        question: 'How do I find early access products?',
        // Reworded: the second sentence was "You can also log in at
        // https://www.storesupply.com/login.php#/login to see what's open to you."
        answer:
          "We'll email you when early access items are available. You can also check the My benefits tab to see what's open to you.",
      },
      {
        question: 'Can my rep help me find early access products?',
        answer:
          'Yes. Your dedicated rep can flag items or categories that might be relevant based on your ordering patterns.',
      },
    ],
  },
  {
    title: 'Questions and Troubleshooting',
    items: [
      {
        question: 'Where can I see my benefits, credit balance, and tier status?',
        // Reworded: was "Log in at https://www.storesupply.com/login.php#/login to
        // find your tier, benefits, points, and any store credits." Split by where
        // each thing actually lives in the portal.
        answer:
          'Your tier and benefits are on the My benefits tab, your points balance is at the top of this page, and any store credit certificates are under My rewards.',
      },
      {
        question: 'I think my tier is wrong. What do I do?',
        answer: (
          <>
            Your tier is based on your orders over the past 12 months, updated monthly. If something
            looks off, contact us at <RepEmail /> and we&apos;ll look into it.
          </>
        ),
      },
      {
        question: 'Can I combine Smart Rewards with other promotions?',
        answer: (
          <>
            Store credit certificates work alongside product discounts. For questions about specific
            promotions, contact us at <RepEmail />.
          </>
        ),
      },
      {
        question: "I have a question that's not covered here. Who do I contact?",
        answer: (
          <>
            Reach us at <RepEmail />. Select and Signature members can also contact their account rep
            directly.
          </>
        ),
      },
    ],
  },
];
```

Note the `&apos;` in "we&apos;ll" — that answer is JSX, where a raw `'` fails `react/no-unescaped-entities`. The string-literal answers keep ordinary apostrophes.

- [ ] **Step 4: Rewrite `FaqTab` to render the imported content**

Replace the whole of `src/pages/Loyalty/components/FaqTab.tsx`. The props and the `keyedSections` block both go: keys can be the question and title text now that the content is ours and static, which is what the old comment ("theme config can repeat text") was working around.

```tsx
import { ExpandMore } from '@mui/icons-material';
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { FAQ_INTRO, FAQ_SECTIONS } from '../faqContent';

import SectionHeader from './SectionHeader';

function FaqTab() {
  const b3Lang = useB3Lang();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.faq')}</SectionHeader>
      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '18px', textAlign: 'center' }}>
        {FAQ_INTRO}
      </Typography>
      {FAQ_SECTIONS.map((section) => (
        <Box key={section.title}>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, mb: 1 }}>
            {section.title}
          </Typography>
          <Box>
            {section.items.map((item) => (
              <Accordion key={item.question} disableGutters>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Typography sx={{ fontWeight: 700 }}>{item.question}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {item.answer && (
                    <Typography variant="body2" color="text.secondary">
                      {item.answer}
                    </Typography>
                  )}
                  {item.bullets && (
                    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                      {item.bullets.map((bullet) => (
                        <Typography
                          key={bullet}
                          component="li"
                          variant="body2"
                          color="text.secondary"
                        >
                          {bullet}
                        </Typography>
                      ))}
                    </Box>
                  )}
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export default FaqTab;
```

- [ ] **Step 5: Make the FAQ tab unconditional in `index.tsx`**

Four edits to `src/pages/Loyalty/index.tsx`:

1. Delete `  getFaqIntro,` and `  getFaqSections,` (lines 21-22) from the `./api` import block.
2. Delete lines 172-174 entirely:

```tsx
  const faqSections = getFaqSections();
  const hasFaq = faqSections.length > 0;
  const activeTab = tab === 'faq' && !hasFaq ? 'benefits' : tab;
```

3. Replace every remaining `activeTab` with `tab` — five sites: `<Tabs value={activeTab}` (221) and the four `{activeTab === '…' &&` guards (239, 247, 254, 255). `activeTab` existed only to redirect `?tab=faq` when the theme shipped no content.
4. Make the FAQ tab and panel unconditional:

```tsx
          <Tab value="faq" label={b3Lang('loyalty.tabs.faq')} />
```

```tsx
        {tab === 'faq' && <FaqTab />}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run`
Expected: PASS, including all six tests from Step 1.

- [ ] **Step 7: Type-check, and lint the touched files only**

Run: `yarn tsc --noEmit`
Expected: no errors. `getFaqSections`/`getFaqIntro` still exist in `api.ts` — merely unused, which is not a type error. (`yarn lint:knip` *will* flag them; that is Task 2.)

Run: `npx eslint src/pages/Loyalty/faqContent.tsx src/pages/Loyalty/components/FaqTab.tsx src/pages/Loyalty/index.tsx src/pages/Loyalty/index.test.tsx`
Expected: clean. This catches `react/function-component-definition`, `react/no-unescaped-entities`, `testing-library/no-node-access`, and import order now, rather than at Task 2's full `yarn lint` gate. It runs no knip, so the deliberately-orphaned exports do not trip it.

- [ ] **Step 8: Confirm the link assertions are not vacuous**

Temporarily change `RepEmail`'s href from `` `mailto:${REP_EMAIL}` `` to `` `https://example.com/${REP_EMAIL}` `` and re-run:

Run: `CIRCLECI=true yarn test src/pages/Loyalty/index.test.tsx --run -t 'links the rep email'`
Expected: FAIL on the `href` assertion. Then revert the href and re-run to confirm PASS.

This step exists because tests on this feature have passed against unwired code three times. Do not skip it.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Loyalty/faqContent.tsx src/pages/Loyalty/components/FaqTab.tsx src/pages/Loyalty/index.tsx src/pages/Loyalty/index.test.tsx
git commit -m "feat: B2B-0000 Hardcode the loyalty FAQ content with linked contact details"
```

Stage the four named files, not `git add -A` — this repo runs concurrent agent sessions and the working tree may hold other sessions' WIP.

---

### Task 2: Retire the `loyaltyFaqConfig` theme contract

**Files:**
- Modify: `src/pages/Loyalty/api.ts:676-708`
- Modify: `src/index.d.ts:111-118`
- Modify: `src/lib/lang/locales/en.json:787`
- Modify: `src/pages/Loyalty/api.test.ts:22-23, 66, 870-955`

**Interfaces:**
- Consumes: Task 1 must be complete — nothing may still call `getFaqSections`/`getFaqIntro`.
- Produces: no new interfaces. Removes `getFaqSections`, `getFaqIntro`, `LoyaltyFaqSection`, `LoyaltyFaqItem`, and the `Window.loyaltyFaqConfig` declaration from the codebase.

Deletion-only task: no behavior changes, so it opens with the deletions and closes with the full lint gate.

- [ ] **Step 1: Delete the config readers from `api.ts`**

Remove the trailing block of `src/pages/Loyalty/api.ts` (lines 676-708) in full — the knip comment, both interfaces, and both readers:

```ts
// Module-internal: knip fails the build on unused exports, so this file only
// exports what other files actually import.
interface LoyaltyFaqItem { … }

export interface LoyaltyFaqSection { … }

export const getFaqSections = (): LoyaltyFaqSection[] => …

export const getFaqIntro = (): string => …
```

Leave the identical knip comment at the top of the file (above `LoyaltyConfig`) alone — it belongs to that interface.

- [ ] **Step 2: Delete the FAQ tests from `api.test.ts`**

Three edits to `src/pages/Loyalty/api.test.ts`:

1. Delete `  getFaqIntro,` and `  getFaqSections,` from the import block (lines 22-23).
2. Delete `  delete window.loyaltyFaqConfig;` from the `afterEach` (line 66).
3. Delete the whole `describe('getFaqSections and getFaqIntro', …)` block (lines 870-955), which is the six tests from `returns an empty list and intro when the theme global is absent` through `degrades a sections-less config to an empty list`.

- [ ] **Step 3: Delete the window declaration**

Remove lines 111-118 of `src/index.d.ts`:

```ts
    /** Theme-set FAQ content; absent or empty = the FAQ tab is hidden. */
    loyaltyFaqConfig?: {
      intro?: string;
      sections?: {
        title?: string;
        items?: { question?: string; answer?: string; bullets?: string[] }[];
      }[];
    };
```

Do this *after* Step 2 — while any test still references `window.loyaltyFaqConfig`, deleting the declaration is a type error.

- [ ] **Step 4: Delete the orphaned locale key**

Remove line 787 of `src/lib/lang/locales/en.json`:

```json
  "loyalty.faq.intro": "Got questions? Here's what our customers ask most about Smart Rewards.",
```

Its only reader was `FaqTab`'s intro fallback, which Task 1 replaced with `FAQ_INTRO`. Confirm nothing else reads it:

Run: `grep -rn "loyalty.faq.intro" src`
Expected: no output.

- [ ] **Step 5: Verify no reference to the retired contract survives**

Run: `grep -rn "loyaltyFaqConfig\|getFaqSections\|getFaqIntro\|LoyaltyFaqSection" src tests`
Expected: no output.

- [ ] **Step 6: Type-check and run the loyalty suites**

Run: `yarn tsc --noEmit`
Expected: no errors.

Run: `CIRCLECI=true yarn test src/pages/Loyalty --run`
Expected: PASS across `api.test.ts`, `index.test.tsx`, `index.mobile.test.tsx`, `index.platform.test.tsx`. Neither mobile nor platform suite references FAQ config, so neither should need edits — if one fails, read it before changing it.

- [ ] **Step 7: Full lint gate**

Run: `yarn lint`
Expected: all three linters pass. This is the first point at which `lint:knip` can pass, since Task 1 deliberately left `getFaqSections`/`getFaqIntro` orphaned.

If `lint:eslint` reports formatting-only complaints, `yarn format` fixes them; re-run `yarn lint` afterwards.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Loyalty/api.ts src/pages/Loyalty/api.test.ts src/index.d.ts src/lib/lang/locales/en.json
git commit -m "refactor: B2B-0000 Retire the loyaltyFaqConfig theme contract"
```

---

## Follow-ups (not in this plan)

- **Stencil theme:** remove the `loyalty_faq` settings and the script block that assigns `window.loyaltyFaqConfig`. Separate repo; an assigned-but-unread global is harmless, so the portal ships first.
- **`loyalty.benefits.accountRep.point1`** (`en.json:814`) carries the same rep email and phone and still renders as plain text in the benefits cards.
- **Production content launch:** the FAQ tab is hidden on production today (its theme predates the `sections`-shaped config), so this work makes the FAQ appear there on deploy.
