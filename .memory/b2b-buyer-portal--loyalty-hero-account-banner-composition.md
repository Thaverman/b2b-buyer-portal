---
title: Loyalty hero account-banner photo has a baked-in color field — plan crops/scrims around it
type: concept
created: 2026-07-31
updated: 2026-07-31
lastVerified: 2026-07-31
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
    path: src/pages/Loyalty/components/LoyaltyHero.tsx
    symbol: LoyaltyHero
tags: [memory, b2b-buyer-portal, b2b, loyalty, hero, banner, image-crop, image-composition]
---

# Loyalty hero banner photo is not a plain photo — it has its own baked-in color field

The default hero banner image (`/content/images/loyalty/loyalty-account-banner.jpg`,
served from the storefront, verified 1920x600 by downloading it directly from
sandbox.storesupply.com) is **not** a plain photograph. A solid brand-blue
color field is pre-baked into roughly the left 65% of the file itself, with
the actual photo (a person using their phone) confined to the right ~30%,
already fading from blue to photo via the image file's **own internal
gradient** — not a CSS effect.

This is why the original `LoyaltyHero.tsx` only ever showed this image at
`width: 55%` anchored to the right edge with a matching CSS gradient overlay,
and hid it entirely below the `md` breakpoint. That was built around this
specific asset's composition, not an arbitrary or half-finished responsive
treatment.

## What broke when asked to make the banner "full-bleed"

Naively widening the image to `width: 100%` (visible at every breakpoint) with
the default centered `object-fit: cover` and a uniform CSS scrim broke badly on
narrow/tall boxes (mobile):

- **Default centered `object-position` crops symmetrically from both sides.**
  On a narrow-but-tall box, `object-fit: cover` scales to match height and
  crops width — centered cropping on this image keeps a slice of the flat
  field but can push the subject (who sits at the far right of the source)
  out of frame entirely, or crop tightly across her face/hands with no context.
- **A same-hue (theme primary blue) scrim double-tints the already-blue
  field.** Stacking primary-color-on-primary-color doesn't smooth the seam
  where the image's own baked-in gradient ends — it makes it more visible.

## Decision + why

- `objectPosition: 'right center'` (not the default) — anchors the crop to
  keep the subject in frame at every width by cropping from the flat-field
  side instead of symmetrically.
- A flat **neutral black** scrim, `alpha(theme.palette.common.black, 0.5)` —
  not the theme's primary color — keeps text legible without double-tinting
  the image's own blue.
- The 0.5 opacity is a **plain, non-breakpoint-scoped** sx value on purpose:
  jsdom/`getComputedStyle` can't evaluate breakpoint-scoped MUI `sx` values in
  this repo's Vitest setup (see
  [[b2b-buyer-portal--jsdom-getcomputedstyle-media-query-sx]]), so a single
  value across all sizes stays regression-testable via `getComputedStyle`.
- Verified without live/authenticated access (the page is gated behind
  customer login and no test credentials were available this session) by
  downloading the real asset and rendering it through actual headless
  Chromium (`npx playwright install chromium` — not preinstalled — then
  `npx playwright screenshot`) in a static local HTML mockup replicating the
  hero's exact CSS at desktop (~1386px) / tablet (~700px) / mobile (375px)
  widths, with and without the tier chip (varies box height). Compared scrim
  opacities 0.35 / 0.5 / 0.6 and object-position `right center` vs `65%
  center` side by side before picking the above.

## How to apply

- If this specific image asset is ever swapped for a different photo, the
  crop math above is tuned to **this file's composition** (subject at the
  right, flat field at the left) — re-verify, don't assume the same
  `objectPosition` still makes sense. Same caveat already applies to the
  sibling Benefits-tab banner
  ([[b2b-buyer-portal--loyalty-benefits-banner-width-and-crop]]).
- No authenticated browser session was available in-session to confirm the
  pixel-level live result — **still needs a live visual pass on
  sandbox.storesupply.com** at mobile/tablet/desktop widths once deployed.
- To get a real Chromium screenshot in this environment when needed again:
  `npx playwright@1.62.1 install chromium` then
  `npx playwright@1.62.1 screenshot --viewport-size=W,H --wait-for-timeout=MS <url> out.png`
  (no `chromium-cli` tool available here; Playwright's own CLI substitutes
  fine for a single-page capture).

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--loyalty-benefits-banner-width-and-crop]]
- [[b2b-buyer-portal--jsdom-getcomputedstyle-media-query-sx]]
