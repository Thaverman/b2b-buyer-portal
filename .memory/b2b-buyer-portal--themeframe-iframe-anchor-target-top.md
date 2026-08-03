---
title: 'Buyer-portal UI is portaled into the ThemeFrame iframe — plain <a href> navigates the iframe (storefront page loads inside the account panel); links that leave the SPA need target="_top", while scripted window.location.href works because the JS realm is the parent'
type: concept
created: 2026-08-03
updated: 2026-08-03
lastVerified: 2026-08-03
repo: b2b-buyer-portal
storeHash: all
website: SSW
area: B2B
memoryType: gotcha
durable: true
status: active
project: loyalty-benefits-cta-iframe-escape
module: apps/storefront
mongoId: 6a70e55c0088fffbda135101
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/components/ThemeFrame.tsx
    symbol: ThemeFrame
    note: "creates the <iframe> (no src, no sandbox; content via srcdoc/document.write) and createPortals the portal tree into iframe.contentDocument.body — the DOM/JS realm split that causes the trap"
  - kind: ts-react
    package: apps/storefront
    path: src/App.tsx
    symbol: App
    note: "wraps B3RenderRouter in ThemeFrame, so EVERY routed portal page renders inside the iframe"
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/components/BenefitsTab.tsx
    symbol: BenefitsTab
    note: "the reported bug — Place your next order CTA; fixed by adding target=_top on 2026-08-03"
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/components/LoyaltyHero.tsx
    symbol: LoyaltyHero
    note: "Start shopping to earn points PrePointsGate CTA — identical defect from the same spec sentence, fixed in the same change"
  - kind: ts-react
    package: apps/storefront
    path: src/components/layout/B3CloseAppButton.tsx
    symbol: B3CloseAppButton
    note: "working precedent for the OTHER exit style: window.location.href = '/' in a click handler needs no target because window is the parent realm (same in B3Logo, B3MainHeader)"
  - kind: ts-react
    package: apps/storefront
    path: src/components/upload/B3Upload.tsx
    symbol: B3Upload
    note: "pre-existing UNFIXED instance of the same class: sample-CSV Link href with no target (~line 315) would also load inside the account panel"
tags: [memory, b2b-buyer-portal, b2b, loyalty, iframe, themeframe, navigation, links, cta, createportal]
---

# Buyer-portal UI renders inside the ThemeFrame iframe — plain storefront anchors navigate the iframe, not the page

`App.tsx` wraps the router in `ThemeFrame`, which creates an `<iframe>` (no `src`, no
`sandbox`; its document is written via `srcdoc`/`document.write`) and `createPortal`s the
entire portal tree into `iframe.contentDocument.body`. That split makes two
superficially identical ways of leaving the SPA behave differently:

- **Declarative `<a href>` (including MUI `Button href={…}`)** — the anchor node lives in
  the *iframe* document, so its implicit `target="_self"` is **the iframe**. Clicking a
  storefront URL loads that storefront page *inside* the account panel; the hosting page —
  and with it the injected portal — never goes away. This is what the 2026-08-03 bug report
  "the Place your next order link loads the home page in the account section instead of
  closing the B2B account" actually was.
- **Scripted `window.location.href = '/'`** — works with no extra handling, because
  `createPortal` relocates DOM nodes only; the React code still executes in the **parent**
  window's realm, so `window` is the top-level window. That is why `B3Logo`,
  `B3CloseAppButton` and `B3MainHeader` have always exited the portal correctly while an
  anchor written from the same intent does not.

## The fix

`target="_top"` on the anchor. The iframe is same-origin (about:srcdoc inherits the parent
origin) and carries no `sandbox` attribute, so a top-level navigation is permitted. The full
load of `/` tears down the injected portal, and since `main.ts` only boots the app when
`location.hash` starts with `#/`, the reloaded home page comes up with the portal closed.

Dropping the fragment (`store.com/#/loyalty` → `store.com/`) **is** a real navigation, not a
same-document fragment hop: the HTML navigate algorithm only takes the fragment shortcut
when the *target* URL's fragment is non-null. So `_top` reloads even when the host page is
the home page itself.

## How to apply

Any new "back to the storefront / continue shopping / place an order" affordance under
`src/pages/**` must pick one of the two working styles deliberately:

- anchor → **must** carry `target="_top"` (keeps link semantics: middle-click, open-in-new-tab);
- or scripted `window.location.href = …` in an `onClick` (the older codebase idiom).

A "plain anchor" instruction in a design spec is not sufficient — both loyalty specs said
exactly that and both produced the bug. The specs were amended in the same change to say
`target="_top"` and why.

## Testing limitation

`renderWithProviders` renders the page component directly and never mounts `ThemeFrame`, so
**no jsdom test can catch this trap by clicking** — in tests the anchor is in the main
document, where the default target is harmless. Regression coverage can only pin the
attribute (`expect(cta).toHaveAttribute('target', '_top')`); two such tests were added to
`src/pages/Loyalty/index.test.tsx`. Do not mistake a green suite for proof that a portal
link escapes the frame.

## Adjacent, unfixed

`B3Upload.tsx`'s sample-CSV `Link href={…}` (~line 315) has no target and would load inside
the account panel the same way. Pre-existing; deliberately left alone.

## Related
- [[board-loyalty-benefits-cta-iframe-escape]]
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--loyalty-hero-account-banner-composition]]
