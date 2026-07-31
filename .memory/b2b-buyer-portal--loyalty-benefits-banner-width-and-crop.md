---
title: Loyalty Benefits-tab banner — width must match siblings (no mx offset), photo crop is tuned to one specific image
type: concept
created: 2026-07-29
updated: 2026-07-29
lastVerified: 2026-07-29
repo: b2b-buyer-portal
storeHash: 24erkpw9h6
website: SSW
area: B2B
memoryType: decision
durable: true
status: active
project: b2b-buyer-portal
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/components/BenefitsTab.tsx
    symbol: BenefitsTab   # the "Here's how your {tier} rewards work" banner box
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: getBenefitsBannerUrl   # DEFAULT_BENEFITS_BANNER_URL = /content/images/loyalty/loyalty-benefits-banner.jpg
tags: [memory, b2b-buyer-portal, b2b, loyalty, benefits, banner, image-crop]
---

# Loyalty Benefits banner — width parity + photo-specific crop

The "Here's how your {tier} rewards work" banner (Benefits tab, bottom section)
previously carried `mx: { md: -4 }`, bleeding it 32px past both edges of the
content column on ≥900px screens. Every sibling in the same tab (`BenefitsBox`,
`TierProgressCard`, `BenefitsInfoCards`) and the hero above it (`LoyaltyHero`)
use no horizontal margin — this box was the only outlier. Removed; it now spans
the same width as the rest of the tab.

The banner photo (`loyalty-benefits-banner.jpg`, verified 1347x898 = 3:2) has
its subject's head in the top ~30% of the frame, not centered. The panel that
displays it (`width: 45%` of a much wider column, full box height) is far wider
than 3:2, so `object-fit: cover` crops vertically — the default centered
`object-position` trimmed the top of the subject's head. Fixed with
`objectPosition: 'center 20%'` to bias the visible window upward.

## Decision + why

- Width fix: horizontal margin on a single box in a shared-width tab is very
  likely a leftover/mistake, not intentional — check for width parity against
  literal sibling boxes before assuming a margin is deliberate.
- Crop fix: `object-position: center 20%` is tuned to **this specific
  photograph's composition** (head near top-third), not a generic rule for
  wide `object-fit: cover` panels.

## How to apply

- If `loyalty-benefits-banner.jpg` (or `getBenefitsBannerUrl()`'s target) is
  ever swapped for a different photo, re-check the crop — a new image with the
  subject centered or lower in frame would make `center 20%` cut off the
  **bottom** of the subject instead. There is no automated check for this
  (jsdom can't render real image crops); it's a visual-QA step on any banner
  image change.
- The same "subject near top, `object-fit: cover` in a very wide panel" shape
  exists in `LoyaltyHero.tsx`'s photo — it currently uses the default centered
  `object-position` and was not touched by this fix. If that photo is ever
  swapped or the panel widened, check its framing too.
- Testing gotcha specific to this fix (why the width change isn't
  test-covered) lives in
  [[b2b-buyer-portal--jsdom-getcomputedstyle-media-query-sx]].

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--jsdom-getcomputedstyle-media-query-sx]]
- [[b2b-buyer-portal--loyalty-shipping-tracker-theme-contract]]
