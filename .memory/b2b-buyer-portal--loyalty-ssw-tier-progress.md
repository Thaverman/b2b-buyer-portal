---
title: Loyalty tier progress comes from SSW GetDetailWithProgress (dual orders/spend quotas), not Influence thresholds — SSW tier names are display-only, the allowlist gate stays Influence-keyed; endpoint is unauthenticated by accepted decision
type: decision
created: 2026-07-20
updated: 2026-08-03
lastVerified: 2026-08-03
repo: b2b-buyer-portal
storeHash: 24erkpw9h6
website: SSW
area: B2B
memoryType: decision
durable: true
status: active
project: b2b-buyer-portal
syncPending: [mongodb, obsidian-vault]  # repo sink only — MCP_DOCKER gateway disconnected this session; promote per [[b2b-buyer-portal--memory-sinks-docker-mcp-wsl]]
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: fetchTierProgress          # GET {apiBase}/loyaltycustomersclient/GetDetailWithProgress; null for Success!==true / no TierProgress / TargetKind!=='NextTier'; LoyaltyError otherwise
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/components/TierProgressCard.tsx
    symbol: TierProgressCard           # dual-quota card (orders + spend bars + server Summary verbatim); shared by Overview + Tiers tabs
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/index.tsx
    symbol: Loyalty                    # displayTierTitle (SSW ?? Influence) feeds hero ONLY; isTierAllowed keeps the Influence tierTitle; enabled: isAvailable && isTierProgressAvailable() && customerId
tags: [memory, b2b-buyer-portal, b2b, loyalty, tier-progress, ssw-backend, influence-io, security, decision]
---

# Loyalty tier progress = SSW GetDetailWithProgress, not Influence thresholds

Since 2026-07-20 the Rewards page's tier progress (Overview + Tiers tabs) comes
from the SSW backend, replacing the Influence `currentLoyaltyTierProgress` vs
tier-`threshold` model entirely (`tierProgress.ts`/`findNextTier`/`parseThreshold`
were deleted):

`GET {BC_CONTEXT.loyalty.apiBase}/loyaltycustomersclient/GetDetailWithProgress`
`?site={BC_CONTEXT.loyalty.siteName}&bigCommerceStoreId={store_hash}&bigCommerceCustomerId={id}&recentTransactionsTake=0`

PascalCase Newtonsoft envelope `{ Success, Result: { TierProgress } }`. Dual
quotas: orders and/or spend over a rolling window, per-quota percentages, and a
server-composed `Summary` sentence rendered verbatim (backend owns AND/OR
phrasing). ~1.7s observed latency — independent query, never blocks first paint.

## Two tier-name systems — the split that matters

SSW's local tier model (`TierProgress.CurrentTierName`, e.g. "Select"/"Signature")
can DISAGREE with Influence.io's tier for the same customer (e.g. "ESSENTIAL
Plus"). Decision (user, 2026-07-20):

- **Display follows SSW** — hero + progress card show SSW names
  (`displayTierTitle = tierProgress?.currentTierName || influenceTierTitle`).
- **The tier-allowlist rollout gate stays keyed to Influence titles** —
  `isTierAllowed(tierTitle, …)` must never be re-pointed at SSW data (it mirrors
  the theme's canon; test-locked in index.test.tsx).
- Tiers-tab cards + Overview benefits box remain Influence data (perks live there).
- The "What's Available as Your Orders Grow?" ladder is now membership-sourced
  (`NextMembershipsSection.tsx`), anchored on the SSW `currentTierName` against a
  hardcoded Essential→Select→Signature order — Influence tier ids/thresholds are
  no longer consulted for the ladder itself (2026-08-03).

## Gating & failure posture

- Dormant until the theme sets `BC_CONTEXT.loyalty.siteName` (optional config;
  absent = no card anywhere, zero behavior change) — same pattern as the
  shipping tracker's `loyaltyShippingConfig`, see [[b2b-buyer-portal--bc-context-host-config-gating]].
  (`siteName` is a config field within `BC_CONTEXT.loyalty`, not a separate runtime global.)
- Fail-quiet: `tierProgressQuery` joins neither the page error aggregation nor
  the gate verdict; endpoint failure/`Success:false`/top-tier ⇒ no card, page
  intact (test-locked: endpoint-500 shows no error banner).
- `enabled` must include `isAvailable` (masquerade off) — the original plan
  omitted it and a rep fired a spurious request (fixed 814c6b46).

## Accepted risk (standing)

The endpoint is **unauthenticated** (verified 2026-07-20: cold GET with only a
customer id returns 200 incl. PII + spend history). User decision: ship as-is.
Portal mitigations: only the 9 TierProgress fields are mapped (PII discarded),
`recentTransactionsTake=0`. **Standing follow-up:** SSW backend should verify
identity (JWT/digest like `/loyalty/digest`); the call site needs only an added
parameter. Spec: `docs/superpowers/specs/2026-07-20-loyalty-ssw-tier-progress-design.md`.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--loyalty-memberships-tab-read-only]]
- [[b2b-buyer-portal--influence-api-surface-map]]
- [[b2b-buyer-portal--bc-context-host-config-gating]]
- [[b2b-buyer-portal--masquerade-jwt-identifies-rep]]
