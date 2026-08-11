# Hardcode the loyalty FAQ content, with real links — design

**Date:** 2026-08-11
**Status:** Approved (design) — 2026-08-11
**Area:** B2B buyer portal · Loyalty FAQ tab (`src/pages/Loyalty/`), retirement of the `window.loyaltyFaqConfig` theme contract
**Related:** [2026-07-27-loyalty-smart-rewards-redesign-design.md](2026-07-27-loyalty-smart-rewards-redesign-design.md) (§2b defines the FAQ config contract this retires; §2c is the cross-environment-URL precedent)

## Problem

FAQ content reaches the portal as flat strings on `window.loyaltyFaqConfig` and
renders as inert text — `FaqTab` drops `item.answer` and each bullet straight
into a MUI `<Typography>` (`FaqTab.tsx:51-65`). So the support email in the FAQ
is not clickable, and there is no way to express any other link in FAQ prose.

## Decision

**Move the FAQ content into the repo and write the links as JSX.** Do not build
a link-syntax parser for theme-supplied strings.

The parser only had to exist because the content arrived as flat strings from a
host-set global. Authored in the repo, links are ordinary elements: no
`[text](url)` regex, no URL-scheme allowlist, no `b2bLogger` path for a bad
`href`, no malformed-syntax behavior to define, and `target="_top"` is visible
at each link instead of being enforced on a config author's behalf.

Precedent, in this same feature: every other word on the loyalty page is
already hardcoded store-specific copy in `en.json` — tier names, the `$300`
shipping threshold, the 8+/16+ order quotas, and the same rep phone number and
email at `en.json:814`. The theme-fed FAQ was the outlier. `en.json` is the only
locale file, so nothing is lost in i18n terms.

**Rejected alternatives:**

- **Markdown-subset parser** (`[text](url)` in theme config, the previous
  revision of this spec). Right answer only if a non-developer needs to edit
  FAQ wording without a portal deploy. Confirmed 2026-08-11 that nobody does.
- **Auto-linkifying bare addresses.** Link text is always the raw address, it
  cannot link a phrase, and address detection brings false positives.
- **Keeping the config as an override on top of hardcoded defaults.** Two
  sources of truth for one body of content; the predictable bug is "I edited
  the FAQ and nothing changed."
- **`dangerouslySetInnerHTML` on the config strings.** Would turn merchant-
  editable theme config into an HTML injection surface for a feature that only
  needs anchors.

**Accepted cost:** FAQ wording changes now require a portal deploy (merge to
`main` → CircleCI) instead of a theme-settings edit.

## Verified live, not inferred

Captured 2026-08-11 by curling both storefronts and extracting
`window.loyaltyFaqConfig` (the documented way to read as-built host config).

**Sandbox** (`sandbox.storesupply.com`) — the finished revision: `{ intro,
sections: [...] }`, 7 sections, 32 items, 3 bullet lists, real email/phone.
This is the copy to transcribe.

**Production** (`www.storesupply.com`) — running the **pre-promotion theme**
(confirmed 2026-08-11): both the copy rework and the `sections`-shaped config
landed on sandbox and have not been promoted yet. Two effects of that lag, both
expected rather than defects:

1. Its config is the older flat shape `{ intro, items: [...] }` with no
   `sections` key. `getFaqSections()` reads `config.sections`, gets `undefined`,
   returns `[]` — so the FAQ tab is hidden on production today and `?tab=faq`
   falls back to My benefits.
2. That older copy is an unfinished draft: four answers carry literal unfilled
   placeholders (`[PORTAL URL]`, `[REP PHONE]`, `[REP EMAIL]`,
   `[SUPPORT CONTACT]`), no bullet lists, and "SSW Smart Rewards" branding that
   sandbox dropped.

Retiring the config makes both moot — neither needs a theme fix. What matters
for this spec is only that **sandbox, not production, is the copy of record.**

`loyaltyFaqConfig` is assigned once per page and read by nothing in the theme;
`/smart-rewards/`, `/loyalty/` and `/rewards/` are all 404. The portal is the
only consumer, so retiring the contract breaks nothing else.

**Consequence to accept deliberately:** because the tab is hidden on production
today, this change is also the FAQ's first appearance for production customers —
a content launch, not only a link fix. It arrives with the portal deploy and no
longer waits on a theme promotion, which is the intended outcome.

## Design

### Content module

New file `src/pages/Loyalty/faqContent.tsx` — page data next to `api.ts`, per
the matroska rule.

```tsx
const REP_EMAIL = 'contactsmartrewards@storesupply.com';
const REP_PHONE = '1-833-397-2619';

const RepEmail = () => (
  <Link href={`mailto:${REP_EMAIL}`} underline="always">{REP_EMAIL}</Link>
);
const RepPhone = () => (
  <Link href="tel:+18333972619" underline="always">{REP_PHONE}</Link>
);

interface FaqItem { question: string; answer?: ReactNode; bullets?: string[] }
interface FaqSection { title: string; items: FaqItem[] }

export const FAQ_INTRO = '…';
export const FAQ_SECTIONS: FaqSection[] = [ … ];
```

- `answer` is `ReactNode` so a link can sit mid-sentence. `bullets` stays
  `string[]`: none of the three live bullet lists contains a link, and widening
  it later is a one-word change.
- `FaqItem`/`FaqSection` stay module-internal — knip fails the build on unused
  exports, and `FaqTab` needs only the two constants.
- Two small link components rather than four inline copies, so the `href` and
  underline style cannot drift between the four email sites.
- All FAQ copy lives here, including the intro — one home for FAQ content. This
  is a deliberate departure from the `en.json` convention: answers with links
  mid-sentence cannot live in ICU strings without react-intl rich-text tags,
  which would mean widening `useB3Lang`'s `=> string` signature
  (`useB3Lang.ts:4-7`) across 864 call sites for one page's benefit.

### Copy changes during transcription

Everything is transcribed verbatim from sandbox except the three answers that
point at a login page. They are the only content edits, and they exist because
the FAQ renders **only inside the signed-in portal** — telling that reader to
"log in at storesupply.com/login.php#/login" sends them to a login page they are
already past, and (per §2c of the redesign spec) bakes a production absolute URL
into a bundle that also runs on sandbox.

| Question | Was | Becomes |
|---|---|---|
| Where can I see my current tier? | Log in at `https://www.storesupply.com/login.php#/login` to see your tier, benefits, and progress. | Your tier and benefits are on the My benefits tab. |
| How do I find early access products? | We'll email you when early access items are available. You can also log in at `…` to see what's open to you. | We'll email you when early access items are available. |
| Where can I see my benefits, credit balance, and tier status? | Log in at `…` to find your tier, benefits, points, and any store credits. | Your tier and benefits are on the My benefits tab, your points balance is at the top of this page, and any store credit certificates are under My rewards. |

No link replaces the removed URLs, so this also drops 3 of the 8 link sites.

### Transcription source

The copy is not stored in this repo, so the implementer captures it fresh rather
than working from a pasted excerpt:

```bash
curl -sL https://sandbox.storesupply.com/ \
  | grep -o 'window.loyaltyFaqConfig = {.*' | head -1
```

Brace-match from `window.loyaltyFaqConfig = ` and `JSON.parse` the object — 7
sections, 32 items, 3 bullet lists. Transcribe verbatim apart from the three
rewordings above. **Do not** capture from production: that copy is the
unfinished draft described in Verified live.

### Link inventory after transcription

| Link | Sites | `href` | `target` |
|---|---|---|---|
| Rep email | 4 answers (reach my rep · tier looks wrong · combine with promotions · not covered here) | `mailto:contactsmartrewards@storesupply.com` | none |
| Rep phone | 1 answer (reach my rep) | `tel:+18333972619` | none |

Neither needs `target="_top"`: `mailto:` and `tel:` invoke a protocol handler
and never navigate the frame. No link in the FAQ leaves the SPA, so the
ThemeFrame iframe trap (`BenefitsTab.tsx:149`, `LoyaltyHero.tsx:92`) does not
arise here — a direct consequence of the copy rewording above, and the reason
to keep it that way.

### `FaqTab`

- Drops both props and imports `FAQ_INTRO` / `FAQ_SECTIONS` directly. The
  content is static; threading it through `index.tsx` buys nothing.
- Renders `item.answer` as a node instead of a string. Question labels and
  section titles stay plain text — a question sits inside the clickable
  `AccordionSummary`, where a nested anchor is both an a11y problem and a broken
  click target.
- The position-prefixed keys and their comment ("since theme config can repeat
  text") lose their rationale once the content is ours and static; keys become
  the question / title text.
- Intro renders `FAQ_INTRO` with no fallback branch.

### `index.tsx`

- Drop the `getFaqSections` / `getFaqIntro` imports and lines 172-174
  (`faqSections`, `hasFaq`, `activeTab`).
- `activeTab` collapses into `tab` at its five use sites (221, 239, 247, 254,
  255) — the variable existed only to redirect `?tab=faq` when the theme shipped
  no content.
- The FAQ `<Tab>` becomes unconditional; `<FaqTab />` takes no props.

### Retirements

| Where | What goes |
|---|---|
| `api.ts` | `getFaqSections`, `getFaqIntro`, `LoyaltyFaqSection`, `LoyaltyFaqItem` |
| `index.d.ts:111-118` | the `loyaltyFaqConfig` window declaration |
| `en.json` | `loyalty.faq.intro` (orphaned once the intro is hardcoded) |
| `api.test.ts` | the `getFaqSections and getFaqIntro` describe block |
| stencil theme | the `loyalty_faq` settings and the script block that assigns the global — **separate repo, follow-up** |

The theme cleanup is not a blocker: an assigned-but-unread global is harmless,
so the portal change can ship first.

## Behavior changes

- The FAQ tab is always present. It can no longer be hidden by config, and
  `?tab=faq` no longer falls back to My benefits.
- Production customers see the FAQ for the first time (see Verified live).
- Sandbox content changes only in the three reworded answers.

## Testing

Existing FAQ coverage in `index.test.tsx` (from line 1669) is built on
`window.loyaltyFaqConfig` and largely tests a contract that is being deleted.

**Delete:** "hides the FAQ tab when the theme ships no FAQ content", "uses the
default FAQ intro when the theme supplies none", "falls back to My benefits for
`?tab=faq` with no FAQ content", and the `getFaqSections and getFaqIntro` block
in `api.test.ts`. Rewrite the remaining two ("renders theme-provided FAQ
questions and answers", "renders an FAQ item bullet list…") against the real
content.

**Add:**

| Case | Assertion |
|---|---|
| Tab always renders | FAQ tab present with no `window.loyaltyFaqConfig` set at all |
| Content renders | a known section title, question, answer, and one bullet list item |
| Email links | 4 links named for the rep email, `href="mailto:…"`, **no** `target` attribute |
| Phone link | link named `1-833-397-2619`, `href="tel:+18333972619"` |
| No cross-environment URL | no link in the FAQ has an `href` containing `login.php` or `storesupply.com` |

That last one is the regression guard for the §2c class of bug: it fails if
anyone re-introduces an absolute storefront URL in FAQ copy.

**Negative control required.** Per the standing note on vacuous tests, revert
the source change and confirm each new test fails before this is called done —
tests on this feature have passed against unwired code three times.

## Out of scope

- **`loyalty.benefits.accountRep.point1`** (`en.json:814`) carries the same
  email and phone and renders plain in the benefits cards. Same fix would
  apply; not part of this change.
- **Internal portal routes as links** (e.g. linking "My benefits tab" to
  `?tab=benefits`). The reworded answers name the tab in prose instead. An
  anchor inside the iframe resolves its fragment against the iframe's
  `about:srcdoc` document rather than the parent, so an in-portal link needs
  react-router navigation, not an `href` — worth doing deliberately, later, if
  at all.
- **Theme-side removal of the `loyalty_faq` settings** — stencil repo.
