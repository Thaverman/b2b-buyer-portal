---
title: Loyalty page-title heading and account-nav label are separate render paths sharing one idLang string; routeList.name is never rendered
type: concept
created: 2026-07-30
updated: 2026-07-30
lastVerified: 2026-07-30
repo: b2b-buyer-portal
storeHash: all
website: SSW
area: B2B
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
mongoId: 6a6bb8ec881b3cc5ddf69550
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/components/layout/B3Layout.tsx
    symbol: B3Layout   # useEffect path-exclusion list (/quoteDraft, now also /loyalty) blanks `title`
  - kind: ts-react
    package: apps/storefront
    path: src/components/layout/B3MainHeader.tsx
    symbol: B3MainHeader   # renders `title` as an <h3> above CompanyCredit + routed content (desktop)
  - kind: ts-react
    package: apps/storefront
    path: src/components/layout/B3MobileLayout.tsx
    symbol: B3MobileLayout   # renders `title` as an UNCONDITIONAL <h1> (mobile) — no `title &&` guard
  - kind: ts-react
    package: apps/storefront
    path: src/components/layout/B3Nav.tsx
    symbol: B3Nav   # sidebar/drawer nav renders b3Lang(item.idLang) independently of B3Layout's title state
  - kind: ts-react
    package: apps/storefront
    path: src/shared/routeList.ts
    symbol: routeList   # /loyalty entry's `name` field is internal-only, never rendered
  - kind: ts-react
    package: apps/storefront
    path: src/lib/lang/locales/en.json
    symbol: global.navMenu.loyalty   # the actual rendered string for both nav label and page-title
tags: [memory, b2b-buyer-portal, b2b, loyalty, rewards, nav, page-title, b3layout, i18n, routing]
---

# Loyalty page-title heading and account-nav label are separate render paths sharing one idLang string

While removing UI text from the `/loyalty` (Rewards) page, we needed to distinguish
three visually-similar-but-structurally-different "Rewards" strings on the same
page, each wired through a different mechanism:

1. **Page-title heading** — an `<h3>` (desktop, `B3MainHeader.tsx`) / `<h1>`
   (mobile, `B3MobileLayout.tsx`) rendered by the shared `B3Layout.tsx` **above
   every routed page's content**. `B3Layout` looks up `routes.find(item =>
   item.path === location.pathname)` and calls
   `setTitle(b3Lang(itemsRoutes.idLang))` in a `useEffect` — except for a small
   hardcoded path-exclusion list (`/quoteDraft` already blanked its title this
   way). We added `/loyalty` to that same exclusion to remove the page-title
   heading for just this route.
2. **Account-nav label** — the sidebar link (desktop) / drawer link (mobile),
   rendered by `B3Nav.tsx` via `b3Lang(item.idLang)` **per routeList item,
   independently of `B3Layout`'s `title` state**. This is not gated by the
   exclusion list above — a route excluded from the page-title heading keeps
   its nav label.
3. **routeList.ts's `name` field** (e.g. `name: 'Rewards'` on the `/loyalty`
   entry) looked like it might drive one of the above but does not — it greps
   to a single non-rendering consumer (`item.name === 'Quotes'` in
   `B3Nav.tsx`, used only for a special-case comparison). All *visible* text
   for both (1) and (2) comes from the `idLang`-keyed string in
   `src/lib/lang/locales/en.json` (`global.navMenu.loyalty`), never from
   `name`.

## Net effect

For a route NOT in B3Layout's exclusion list, the page-title heading and the
nav label show the **same string**, because both read the same `idLang`
key — but they are two separate DOM elements rendered by two separate
components, not one shared label. Editing the `idLang` lang string renames
both at once; adding the route to B3Layout's exclusion list removes only the
page-title heading and leaves the nav label untouched.

## How to apply

- **To hide a page's top title heading for one route**: add the route's path
  to the exclusion condition in `B3Layout.tsx`'s `useEffect` (same list as
  `/quoteDraft`). Do not touch `idLang` or the lang JSON — that would also
  blank the nav label.
- **To rename a route's visible nav/page label**: edit the `idLang`-keyed
  string value in `en.json`. Do not edit `routeList.ts`'s `name` field
  expecting a UI change — it is a non-rendered internal identifier (only
  updated it in this session to keep it mirroring the lang value, matching
  the convention visible on other routeList entries like
  `name: 'Payment methods'` ↔ `global.navMenu.paymentMethods`).
- **Mobile has no empty-title guard**: `B3MobileLayout.tsx` renders its
  `<h1>` title Box unconditionally (no `{title && ...}`), so a route with a
  blanked title still gets an empty heading box with its `mb: '6vw'` margin
  on mobile. This is pre-existing behavior (same for `/quoteDraft`), not
  something we fixed.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--loyalty-benefits-banner-width-and-crop]]
- [[b2b-buyer-portal--loyalty-earn-rules-blank-title]]
