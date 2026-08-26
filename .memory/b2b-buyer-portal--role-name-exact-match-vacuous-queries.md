---
title: "getByRole name option is an EXACT accessible-name match — the Loyalty tab is labelled \"FAQs\" while 4 tests queried name:'FAQ', so 3 failed and the 4th (a negative assertion) passed vacuously forever; label drift breaks positives loudly and negatives silently"
type: concept
created: 2026-08-07
updated: 2026-08-07
lastVerified: 2026-08-07
repo: b2b-buyer-portal
storeHash: 24erkpw9h6
website: SSW
area: B2B
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/index.tsx
    symbol: Loyalty                     # hasFaq gate + <Tab label={b3Lang('loyalty.tabs.faq')}> — renders "FAQs"
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/index.test.tsx
    symbol: hides the FAQ tab when the theme ships no FAQ content   # the vacuous negative assertion
tags: [memory, b2b-buyer-portal, b2b, loyalty, testing, testing-library, vitest, vacuous-test, i18n, gotcha]
---

# `name:` in `*ByRole` is exact — a renamed label breaks positives loudly, negatives silently

`loyalty.tabs.faq` is **"FAQs"** (plural). Four tests in
`src/pages/Loyalty/index.test.tsx` queried `{ name: 'FAQ' }`. Testing Library's
`name` option is a full exact match against the accessible name, so **none** of
them could ever match the rendered tab:

- 3 positives (`await user.click(await screen.findByRole('tab', {name:'FAQ'}))`)
  failed with `Unable to find role="tab" and name "FAQ"` — part of the long-standing
  `dev` red baseline ([[b2b-buyer-portal--dev-red-baseline]]), cause previously
  undocumented.
- 1 negative (`expect(screen.queryByRole('tab', {name:'FAQ'})).not.toBeInTheDocument()`
  in *"hides the FAQ tab when the theme ships no FAQ content"*) **passed — and
  could never fail.** It looked like it protected the hide-when-no-content
  behaviour and protected nothing.

## The misdiagnosis worth avoiding

`Unable to find role="tab" and name "FAQ"` reads like "the tab didn't render", so
the natural (wrong) conclusion is that the `hasFaq` gate is false under test and
the FAQ tab has no coverage. It is false — the tests **do** set
`window.loyaltyFaqConfig`, the gate opens, the tab renders. Only the *name*
mismatched. Confirm which it is before concluding a feature is untested.

## Proving a negative assertion is load-bearing (cheap, do it every time)

Break the production gate and re-run — the same technique
[[b2b-buyer-portal--test-absence-assertion-races-async-gate]] prescribes for the
*timing* flavour of this bug:

```
# force the tab to always render
-  const hasFaq = faqSections.length > 0;
+  const hasFaq = true;
```

With `name:'FAQ'` the negative test still **passed** (proof of vacuity). With
`name:'FAQs'` it **failed** (proof it now bites). Revert the gate; it passes again.

## Two distinct vacuity mechanisms — do not conflate

| Mechanism | Symptom | Fix |
|---|---|---|
| Selector can never match (this note) | negative passes always; positives fail | fix the selector to the real accessible name |
| Anchor settles before the async gate | negative passes on empty pre-fetch DOM | anchor on copy that renders for that state |

Both are caught by the same control: break the gate, expect red.

## How to apply

- Query tab/button names from the **rendered** `en.json` value, not the key name
  or a remembered label. `grep '"loyalty.tabs' src/lib/lang/locales/en.json`.
- Renaming any user-facing label is a test-touching change; `name:`-based queries
  will not fail-fast on the negative side.
- Prefer a positive anchor alongside every negative assertion so a selector typo
  surfaces as a failure somewhere.
- Fixed 2026-08-07: the 3 positives and the 1 vacuous negative all now use
  `'FAQs'`; Loyalty suite went 226/231 to 231/231.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--test-absence-assertion-races-async-gate]]
- [[b2b-buyer-portal--dev-red-baseline]]
- [[b2b-buyer-portal--loyalty-nav-label-vs-page-title-idlang]]
- [[b2b-buyer-portal--loyalty-tier-restricted-benefit-cards]]
