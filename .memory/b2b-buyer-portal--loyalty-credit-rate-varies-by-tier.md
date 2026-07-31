---
title: Loyalty My-benefits credit-rate card now varies by membership tier
type: concept
created: 2026-07-31
updated: 2026-07-31
lastVerified: 2026-07-31
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
    path: src/pages/Loyalty/components/BenefitsInfoCards.tsx
    symbol: matchCreditRateTier
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: isTierAllowed
tags: [memory, b2b-buyer-portal, b2b, loyalty, benefits, credit, i18n, tier]
---

# Loyalty "Earning and Redeeming Credit" card — tier-specific rate line

The My-benefits "Earning and Redeeming Credit" explainer card previously
hardcoded "1% rate" for every membership tier (an accepted trade-off from the
2026-07-27 My-benefits redesign). It now shows the customer's real tier rate:
Essential 1% (gated on $500 in annual purchases), Select 2%, Signature 3%, or
a generic rate-less line when no tier resolves or the name doesn't match one
of those three. The bullet list also shrank from 5 items to 4 (dropped an
"email notification" bullet and a "certificates valid for 12 months" clause).

## Decision + why

- **Tier matching stays local to `BenefitsInfoCards.tsx`**, not `api.ts` —
  `matchCreditRateTier` is a module-private, case-insensitive/whitespace-trimmed
  matcher mirroring `isTierAllowed`'s convention, but it's pure display-copy
  selection with exactly one consumer. Promote it to `api.ts` only if a second
  consumer needs the same tier-rate mapping.
- **No `Record<CreditRateTier, string>` lookup indexed inside the `b3Lang(...)`
  call.** The original design spec proposed exactly that, but this codebase's
  rule that every `b3Lang(...)` call site use a literal key string makes an
  indexed lookup a real violation (a computed key expression), not a style
  nit — caught at task review, not before. Shipped as an IIFE of literal-keyed
  if/else branches instead.
- Unmatched/null tier name always falls back to a rate-less generic line
  rather than guessing — this includes a future 4th tier name the matcher
  doesn't know about yet.

## How to apply

- If a 4th tier is ever added, `CreditRateTier` (union), `CREDIT_RATE_TIERS`
  (array), and the if/else branches in `BenefitsInfoCards.tsx` all need the
  new tier name added — three places, by design (flagged, not fixed, in the
  final review: `as const` + derived type would collapse two of the three,
  but the spec prescribed this shape).
- Design doc (with an as-built note correcting the Record-lookup deviation):
  `docs/superpowers/specs/2026-07-30-loyalty-credit-panel-tier-rates-design.md`.
- Landed via full subagent-driven-development (task review → 1 fix round →
  final review → 1 fix round). Commits on `dev`: `e71830d0`, `b2eb65f4`,
  `26d287fc`, `e87a11d0`.
- **Not yet verified live** — needs an Essential/Select/Signature account
  spot-check on sandbox.storesupply.com once deployed.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--loyalty-benefits-banner-width-and-crop]]
- [[b2b-buyer-portal--jsdom-getcomputedstyle-media-query-sx]]
