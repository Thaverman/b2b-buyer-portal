---
title: Loyalty tier gate arms via BC_CONTEXT.loyalty.tierAttributeId — digit-strings coerce, anything else logs and disarms
type: gotcha
created: 2026-08-04
updated: 2026-08-10
lastVerified: 2026-08-10
repo: b2b-buyer-portal
storeHash: ssw
website: SSW
area: Customer Accounts
memoryType: gotcha
durable: true
status: active
project: loyalty-attribute-visibility-gate
mongoId: pending
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: getTierAttributeId
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: resolveLoyaltyEntitlement
  - kind: ts-react
    package: apps/storefront
    path: src/index.d.ts
    symbol: BC_CONTEXT
tags: [memory, b2b-buyer-portal, loyalty, host-config, gating, theme-contract]
---

# Loyalty tier gate arms via BC_CONTEXT.loyalty.tierAttributeId — digit-strings coerce, anything else logs and disarms

The "Loyalty Tier" visibility gate (hides the Smart Rewards nav tab and
`/loyalty` when the customer attribute is blank) arms only when the theme emits
`BC_CONTEXT.loyalty.tierAttributeId`. As of 2026-08-04 `getTierAttributeId`
accepts a number **or a clean digit-string** (`'2'`, `' 2 '`) — theme settings
are stringly-typed (Handlebars), and the first live delivery was the string
`'2'`, which the original number-only check silently ignored. Coercion is
guarded for GraphQL-injection safety: trimmed `/^\d+$/` match, then the same
`Number.isInteger && 0 < id < 2**31` plausibility test as before.

Failure semantics now split three ways:
- **Key absent** → silent gate-off, Loyalty visible ("un-opted store keeps
  today's behaviour", by design, tested).
- **Key set but unusable** (`'2.5'`, `'abc'`, `0`, `1e21`, 22-digit strings) →
  gate-off + `b2bLogger.error` "not a usable attribute id — leaving Loyalty
  visible". A set key is a misconfiguration signal, not an un-opted store.
- **Usable id** → attribute queried at login; blank value hides Loyalty.

**BC GraphQL semantics gotcha (measured live 2026-08-04, customer 40978):**
`attribute(entityId:)` echoes the attribute **name only when the customer has a
value record**. A never-set attribute arrives as `{ entityId, name: '',
value: null }`. The resolver's id-drift name guard must therefore fire only on a
**non-empty, different** name — as first built it fired on `''`, which made every
unenrolled customer fail-open and the gate could never close. Any future
name-assertion against BC customer attributes has this same trap.

**History (why this note exists):** the gate shipped inert — the sandbox theme
emitted no `tierAttributeId` at all (curl 2026-08-04, zero page hits), while
shipping an unread `loyalty_require_tier:true` theme setting. Third BC_CONTEXT
as-built mismatch after `storeSuffix` and `siteName`.

**2026-08-10 — STILL INERT, now measured on BOTH environments (4th
occurrence of the BC_CONTEXT as-built class).** Reported as "the gate is not
preventing Smart Rewards from showing". Curl + grep, decisive in minutes:

- sandbox home + login.php: `BC_CONTEXT.loyalty = { shopKey, apiBase,
  appClientId, siteName:'StoreSupply', bannerUrl, customerId:'' }` — **no
  `tierAttributeId`**, zero grep hits.
- production www.storesupply.com: same shape, no `tierAttributeId` — and
  **`siteName:''`**, a second latent gap (tier-progress reads
  `BC_CONTEXT.loyalty.siteName`, commit 24b76cb8).
- Deployed sandbox bundle is NOT stale: `chunks/index.m1CbFrD1.js` under
  `/content/b2bBuyerPortal/dist/` contains `tierAttributeId`,
  `isLoyaltyEntitled`, and the "not a usable attribute id" log string.

So the 2026-08-04 `'2'` digit-string delivery either never shipped past a
preview or was rolled back. Portal behaves exactly as designed (absent key =
un-opted store = silent fail-open); **the fix belongs in the stencil theme
snippet that renders `window.BC_CONTEXT.loyalty`** — it must emit
`tierAttributeId` (sandbox id 2; confirm prod id via Management API before
setting it).

## Key Points
- **Debugging heuristic:** when a host-gated portal feature "doesn't work",
  curl the live storefront HTML and grep for the BC_CONTEXT key FIRST — minutes,
  and decisive. Absent-key fail-open logs nothing.
- Sandbox attribute entityId = 2; production must be confirmed via
  `GET /v3/customers/attributes?name=Loyalty Tier` (Management API — Storefront
  GraphQL has no name lookup).
- Entitlement resolves ONCE per login (`loginInfo.ts` → `setCustomerInfo`) and
  persists per-tab (sessionStorage). Same-tab reload never re-resolves: after
  changing the attribute or the theme config, log out/in or open a new tab
  before judging the gate broken. Devtools-console assignments to BC_CONTEXT
  don't survive that reload — the theme must serve the key.
- Still unverified spec risk: `customer.attributes` through the B2B proxy
  (`graphqlBCProxy`) for an *authenticated* customer. If the proxy strips it,
  the console shows "Loyalty: attribute N was requested but nothing came back"
  and the gate fail-opens → fall back to spec Approach B (same-origin
  `graphqlBC` query).
- Spec: `docs/superpowers/specs/2026-08-03-loyalty-attribute-visibility-gate-design.md`.

## Code references
- `src/pages/Loyalty/api.ts` (`getTierAttributeId`) — digit-string-tolerant, injection-guarded config read.
- `src/pages/Loyalty/api.ts` (`resolveLoyaltyEntitlement`) — fail-open verdict table.
- `src/index.d.ts` (`BC_CONTEXT`) — host-config typing, `tierAttributeId?: number | string`.

## Related
- [[b2b-buyer-portal--bc-context-host-config-gating]]
- [[board-loyalty-tier-attribute-gate]]
