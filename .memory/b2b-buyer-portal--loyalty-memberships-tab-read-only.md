---
title: Buyer-portal Loyalty memberships are read-only by design — enroll/remove need an SSW Platform-API (x-api-key) proxy that doesn't exist; the READ path works (GET /customer returns currentMembership + perks, shown on the Overview tab)
type: decision
created: 2026-07-17
updated: 2026-07-17
lastVerified: 2026-07-17
repo: b2b-buyer-portal
storeHash: 24erkpw9h6
website: SSW
area: B2B
memoryType: decision
durable: true
status: active
project: b2b-buyer-portal
mongoId: 6a5a84fefe5205583b3b19f1
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: fetchMemberships          # GET /shop/memberships (Launcher, shop-scoped, browser-safe) — the list of all memberships
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: fetchLoyaltyCustomer       # maps currentMembership {id,title,perks} onto LoyaltyCustomer.currentMembership (read path — GET /customer)
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/components/MembershipsTab.tsx
    symbol: MembershipsTab            # read-only card list of all memberships (title/description/perks); no Join/Leave
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/components/OverviewTab.tsx
    symbol: OverviewTab               # renders customer.currentMembership.perks on the "Your rewards" tab
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/index.tsx
    symbol: Loyalty                   # membershipsQuery mirrors tiersQuery; tab auto-hides when empty; activeTab deep-link guard
tags: [memory, b2b-buyer-portal, b2b, loyalty, influence-io, memberships, platform-api, read-only, decision]
---

# Buyer-portal Loyalty memberships are read-only by design

The Loyalty (Rewards) page **lists** the store's Influence.io memberships
(Memberships tab, via `GET /shop/memberships`) and **shows the customer's own
current membership perks** on the Overview ("Your rewards") tab (2026-07-17).
There is **no enroll/join/leave** UI — deliberately, for ONE reason: the write path.

**Enroll/remove are Platform-API only (the real blocker).**
`POST /v1/customers/{customerId}/membership/enroll` and `…/remove` live on the
Influence.io **Platform API** (`platform.api.influence.io`), authenticated with the
secret **`x-api-key`** header. That key must never reach the browser, so the portal
cannot call them directly. They require a **new SSW backend proxy** (same trust
boundary as `…/customers/loyalty/digest`) that **does not exist yet**.

**The READ path DOES work — corrects an earlier wrong assumption.**
The Launcher `GET /customer` response carries **`currentMembershipId`** and a
**`currentMembership`** object (`{ id, title, iconType, defaultIcon,
excludeFromMemberships, excludeFromReferrals, perks }`). So a customer's current
membership IS readable, and the portal renders its perks on the Overview tab —
`fetchLoyaltyCustomer` maps `id/title/perks` onto `LoyaltyCustomer.currentMembership`.
An earlier version of this note (and its title) claimed "no read-back of current
membership" — that was **WRONG**, based on the developer-docs enroll/remove response,
which omits the membership field. The live `/customer` payload includes it.

**When the SSW proxy lands**, the follow-up is: an `enrollMembership()` service fn
(POST to the new SSW endpoint, reusing `identityBody`/`LoyaltyError`), a
`useMutation` + `invalidateQueries(['loyaltyCustomer'])`, and a gated Join CTA.

Spec/plan: `docs/superpowers/specs/2026-07-17-loyalty-memberships-tab-design.md`,
`docs/superpowers/plans/2026-07-17-loyalty-memberships-tab.md`.
Full Influence.io API surface incl. field-level membership contracts:
[[b2b-buyer-portal--influence-api-surface-map]].

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--influence-api-surface-map]]
