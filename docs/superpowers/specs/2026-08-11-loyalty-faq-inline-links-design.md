# Inline links in the loyalty FAQ — design

**Date:** 2026-08-11
**Status:** Approved (design) — 2026-08-11
**Area:** B2B buyer portal · Loyalty FAQ tab (`src/pages/Loyalty/components/FaqTab.tsx`), theme FAQ contract (`window.loyaltyFaqConfig`)
**Related:** [2026-07-27-loyalty-smart-rewards-redesign-design.md](2026-07-27-loyalty-smart-rewards-redesign-design.md) (§6 defines the FAQ tab and its config contract)

## Problem

FAQ content reaches the portal as plain strings on `window.loyaltyFaqConfig` and
renders as inert text. `FaqTab` drops `item.answer` and each bullet straight into
a MUI `<Typography>` (`FaqTab.tsx:51-65`), and the read path only trims and drops
empties (`api.ts:689-707`). So `contactsmartrewards@storesupply.com` in the
theme's `loyalty_faq` config is not clickable, and there is no way to express any
other link — a phone number, a storefront page — in FAQ prose.

## Approach

Support a **markdown-subset link syntax** — `[text](url)` — in FAQ prose, parsed
at render time into MUI `Link` elements.

Chosen over the two alternatives considered:

- **Auto-linkifying bare addresses** (scan text for emails/URLs/phone shapes)
  needs no authoring change, but the link text is always the raw address, it
  cannot link a phrase, and address detection brings the usual false positives
  (trailing punctuation, SKUs read as phone numbers).
- **Structured link fields** in the config (`{ text, href }` instead of a bare
  string) is the most type-safe, but it changes the theme contract, needs a
  theme edit per linked item, and cannot place a link mid-sentence.

`dangerouslySetInnerHTML` was rejected outright: the FAQ strings are
merchant-authored theme config, and rendering them as HTML would turn a config
field into an injection surface for a feature that only needs anchors.

## Design

### `FaqText` component

New file `src/pages/Loyalty/components/FaqText.tsx`. Takes one string and
returns inline content — plain text plus `Link` elements.

It renders **inside** the existing `Typography` elements rather than replacing
them, so `FaqTab` keeps its current variants, colors, and `component="li"`
handling. Three call sites change:

| `FaqTab.tsx` | Today | After |
|---|---|---|
| intro (line 36) | `{intro \|\| b3Lang('loyalty.faq.intro')}` | wrapped in `FaqText` |
| answer (line 52) | `{item.answer}` | `<FaqText>{item.answer}</FaqText>` |
| bullet (line 64) | `{bullet.text}` | `<FaqText>{bullet.text}</FaqText>` |

Accordion **questions** and **section titles** stay plain text. A question label
sits inside the clickable `AccordionSummary`, where a nested anchor is both an
a11y problem (nested interactive elements) and a broken click target — tapping
the link would also toggle the panel.

The component lives in the page folder, not `src/components/`: per AGENTS.md
that directory is domain-agnostic only, and this parser encodes FAQ authoring
conventions. The parse helper is module-internal — knip fails the build on
unused exports, so only the component is exported.

### Parsing

One pure module-internal function, one regex:

```
/\[([^\]]+)\]\(([^)\s]+)\)/g
```

Text outside a match is literal. Consequences, all intentional:

- **Malformed syntax renders verbatim.** `[text](` with no close paren shows as
  written. No error state, no escaping mechanism — FAQ prose has no legitimate
  need to emit a literal `[x](y)`.
- **No whitespace inside the href**, which closes the `java\tscript:`
  smuggling shape before the scheme check even runs.
- Segment keys follow the `${index}-${text}` idiom `FaqTab` already uses for
  content the config can repeat.

### href policy — allowlist, with the iframe rule baked in

| `href` prefix | Renders as | `target` |
|---|---|---|
| `mailto:` | `Link` | none — protocol handler, never navigates |
| `tel:` | `Link` | none — same |
| `https://`, `http://` | `Link` | `_top` |
| `/` (root-relative) | `Link` | `_top` |
| anything else | plain text + `b2bLogger.error` | — |

Case-insensitive prefix match against an **allowlist**, not a denylist: this is
what guarantees `javascript:` and `data:` can never produce an anchor, rather
than a blocklist that has to anticipate every hostile scheme.

`target="_top"` is decided **here, once**. The portal renders inside the
ThemeFrame iframe, so a plain storefront anchor loads the storefront page inside
the account panel — the bug that already hit the loyalty CTAs twice
(`BenefitsTab.tsx:149`, `LoyaltyHero.tsx:92`). Putting the rule in the renderer
means it does not depend on whoever writes the theme config remembering the
trap. `mailto:`/`tel:` get no target because a protocol handler does not
navigate the frame.

Failing to plain text and logging matches how `api.ts` already handles bad
host-set config: leave the page usable, leave a trail.

### Deliberately out of scope

- **Internal portal routes (`#/orders`).** An anchor inside the iframe resolves
  its fragment against the iframe's `about:srcdoc` document, not the parent, so
  hash links need react-router navigation rather than an `href`. There is no
  stated need; such an href log-and-flattens like any other unrecognized scheme.
  Straightforward to add later as a separate branch in the same table.
- **`loyalty.benefits.accountRep.point1`** (`en.json:814`) carries the same
  email and phone number and renders plain in the benefits cards. It is a locale
  string, not `loyalty_faq`, and is out of scope for this change. `FaqText`
  would handle it unchanged if wired up later.

### Styling

MUI `Link`, `underline="always"`, default primary color. Underline-always
because these links sit inside `color="text.secondary"` body copy, where color
alone should not be the only signal that text is a link.

## Compatibility and theme follow-up

The portal change is **backwards compatible** — every string in today's config
lacks the syntax and renders exactly as it does now.

Getting actual links requires editing the `loyalty_faq` config in the stencil
repo (not this checkout), e.g.:

```
[contactsmartrewards@storesupply.com](mailto:contactsmartrewards@storesupply.com)
```

The `loyaltyFaqConfig` doc comment in `index.d.ts:111` gets a line recording
that intro, answers, and bullets accept link syntax, so the contract is
discoverable from the type.

## Testing

Cases added to the existing FAQ block in `index.test.tsx` (from line 1669),
reusing its `window.loyaltyFaqConfig` setup:

| Case | Assertion |
|---|---|
| `mailto:` link in an answer | link role with the `mailto:` href; **no** `target` attribute |
| `https://` link in a bullet | href set and `target="_top"` |
| root-relative link | href set and `target="_top"` |
| `javascript:` href | link text visible, **no** link role, `b2bLogger.error` called |
| malformed `[text](` | renders literally |
| link in the intro | link role present |

**Negative control required.** Per the standing note on vacuous tests, revert
the `FaqTab` wiring and confirm each new test fails before the work is called
done. A passing suite against unwired code has happened three times on this
feature.

Note the known limitation from the iframe work: `renderWithProviders` never
mounts `ThemeFrame`, so no jsdom test can prove a link escapes the frame by
clicking it. Pinning the `target` attribute is the available coverage.
