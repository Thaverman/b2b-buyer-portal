---
title: Tier-restricted My-benefits content (account rep, early access, maintenance thresholds) gates on SSW tierProgress.currentTierName and fails CLOSED — never on tierDisplayName, whose Influence fallback b23b6eb3 distrusted
type: decision
created: 2026-08-07
updated: 2026-08-07
lastVerified: 2026-08-07
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
    symbol: BenefitsInfoCards          # currentTierName prop -> isSelect/isSignature/isSelectOrAbove + maintainLine
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/components/NextMembershipsSection.tsx
    symbol: NextMembershipsSection      # quotaLineFor(membership.title) — per-CARD, not per-customer
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/components/BenefitsTab.tsx
    symbol: BenefitsTab                 # passes currentTierName={tierProgress?.currentTierName || null}
tags: [memory, b2b-buyer-portal, b2b, loyalty, benefits, tier, gating, ssw-backend, influence-io, i18n, decision]
---

# Tier-restricted My-benefits cards gate on SSW placement, fail-closed

The My-benefits tab gained content that only some memberships may see:

| Content | Essential | Select | Signature |
|---|---|---|---|
| "Account Rep" card | — | yes | yes |
| Early-access card | — | "48-Hour" copy | "One-Week" copy |
| tierStatus maintenance bullet | — | 8+ orders / $2,000+ | 16+ orders / $5,000+ |
| ladder quota line (per card) | — | on the Select card | on the Signature card |

## Decision + why

- **Gate on `tierProgress.currentTierName` (SSW), not `tierDisplayName`.** The
  obvious move was to reuse `matchCreditRateTier` already in
  `BenefitsInfoCards.tsx` for the sibling credit-rate copy — that is the wrong
  source for a *visibility* gate. `tierDisplayName` is
  `tierProgress?.currentTierName || influenceTierTitle` (`index.tsx`), so when
  SSW is unavailable it silently falls back to the **Influence** tier that commit
  `b23b6eb3` removed from this very tab for placing customers on the wrong level
  (live divergence: ESSENTIAL vs Select for one customer). Reusing it would leak
  the rep's phone number and an early-access promise to a Select customer.
  Honors the 2026-08-03 "SSW alone answers which membership is this" decision and
  mirrors `NextMembershipsSection`'s existing normalization.
- **Fail CLOSED** (user decision, 2026-08-07). Any unverifiable state — null
  progress, endpoint down, `Success:false`, unknown `TargetKind`, blank name,
  `siteName` unconfigured, non-Stencil, masquerade — renders nothing. Contrast
  the attribute *entitlement* gate, which deliberately fails open
  (`2026-08-03-loyalty-attribute-visibility-gate-design.md`).
- **Copy selection stays literal-keyed if/else**, never a computed/indexed
  `b3Lang` key — same rule that was caught at review for `matchCreditRateTier`
  (see [[b2b-buyer-portal--loyalty-credit-rate-varies-by-tier]]).
- **The ladder quota line keys on the CARD's membership, not the customer's
  tier** — `quotaLineFor(membership.title)`. Each card advertises the level it
  is selling. Keying it on the customer (`sswName`) is a plausible-looking bug
  that a per-card test catches.
- **Numbers rendered, not visible section numbers.** The request numbered these
  "5." and "6."; nothing in this tab renders a numeral and `InfoCard` is a
  semantic `<ul>`, so the numbers were request-ordering only. Note the
  arithmetic never closed: appending two cards to the existing three gives 4 and
  5, so the source mockup likely has a card the portal does not render.

## Known hazard — the same thresholds now live in THREE places

Changing a tier's quota requires updating all three, and only two are in this repo:

1. `en.json` `loyalty.benefits.tierStatus.maintainSelect` / `maintainSignature`
   ("To maintain Select: place 8+ orders per year, and/or $2,000+ in annual purchases.")
2. `en.json` `loyalty.benefits.nextTierQuotaSelect` / `nextTierQuotaSignature`
   ("(8+ orders/year and/or $2,000+ annual spend)")
3. **Influence admin** `membership.description` — deliberately buyer-facing
   admin-managed copy per `2026-07-27-loyalty-my-benefits-redesign-design.md`
   ("The Influence `threshold` field becomes load-bearing buyer-facing copy").

Because (2) was added *above* (3) by explicit instruction, a Select ladder card
currently renders two near-duplicate parentheticals differing only in `or` vs
`and/or` and a trailing ` :`. Resolve by clearing/repurposing `description` in
the Influence admin — not in code.

Copy asymmetry left as-authored: `maintainSelect` says "To maintain Select:"
while `maintainSignature` says "To maintain your Signature tier:".

## How to apply

- Adding a 4th membership touches: `MEMBERSHIP_LADDER_ORDER`,
  `CREDIT_RATE_TIERS` + its if/else, `isSelect`/`isSignature`/`isSelectOrAbove`,
  `maintainLine`, `quotaLineFor`, and two new `en.json` key families.
- **Test with `mockTierProgress` + `customerPreloadedState`**, not `mockTiers`
  alone — `mockTiers` sets only the Influence tier, which by design shows
  nothing here. The load-bearing test is "Influence says Signature but no SSW
  progress => hidden"; it fails if the gate is repointed at `tierDisplayName`.
- Absence assertions must be anchored on the contact footer (renders after the
  cards) — see [[b2b-buyer-portal--test-absence-assertion-races-async-gate]].
- Ordered-bullet assertions use whole-card `textContent` equality, which locks
  order; presence-only checks pass with a bullet appended to the wrong end.
- **Not verified live.** Fail-closed means a missing `BC_CONTEXT.loyalty.siteName`
  hides all of this silently with nothing logged — curl the storefront and grep
  before assuming it ships (`siteName` has been an as-built miss before, see
  [[b2b-buyer-portal--bc-context-host-config-gating]]).

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--loyalty-ssw-tier-progress]]
- [[b2b-buyer-portal--loyalty-credit-rate-varies-by-tier]]
- [[b2b-buyer-portal--loyalty-tier-gate-theme-contract]]
- [[b2b-buyer-portal--role-name-exact-match-vacuous-queries]]
