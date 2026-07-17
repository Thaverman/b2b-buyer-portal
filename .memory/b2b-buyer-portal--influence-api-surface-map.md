---
title: Influence.io API surface map — Platform (x-api-key) + Launcher (HMAC digest), 53 documented endpoints; portal Loyalty consumes ~8 of the 24 Launcher endpoints
type: reference
created: 2026-07-16
updated: 2026-07-17
lastVerified: 2026-07-17
repo: b2b-buyer-portal
storeHash: 24erkpw9h6
website: SSW
area: B2B
memoryType: reference
durable: true
status: active
project: b2b-buyer-portal
mongoId: 6a5a5a7987b497fba796553f  # promoted to Mongo + Obsidian vault 2026-07-17 (all three sinks in sync)
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: LAUNCHER_API_BASE          # const = 'https://launcher.api.influence.io/launcher/v1' — the Launcher base the portal calls
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: launcherGet                # generic GET caller; today hits /customer, /customer/all-rewards, /customer/points, /shop/tiers, /shop/rules/earn, /shop/rules/redeem
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: launcherPost               # generic POST caller; today hits /customer/social, /customer/redeem
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: fetchLoyaltyCustomer       # GET /customer — first customer-scoped (digest-gated) call
tags: [memory, b2b-buyer-portal, b2b, loyalty, influence-io, api-reference, launcher, platform-api, endpoint-inventory]
---

# Influence.io API surface map — Platform + Launcher

Reference map of the third-party **Influence.io** loyalty/referral API that backs
the portal's `/loyalty` (Rewards) page. Derived on 2026-07-16 by fetching all 53
documented endpoint pages from `developer.influence.io` (index at
`https://developer.influence.io/llms.txt`) and reconstructing the data model.
Complements the troubleshooting note
[[b2b-buyer-portal--loyalty-digest-mismatch-influence-launcher]] — this one is the
*inventory*, that one is the *auth failure mode*.

Rendered diagrams (endpoint map, ER model, auth flows, lifecycle):
`https://claude.ai/code/artifact/4c36440c-cb11-407a-b159-8e9f0163f9b9`

## Two API surfaces

| Surface | Base URL | Auth | Audience | Endpoints |
|---|---|---|---|---|
| **Platform API** | `https://platform.api.influence.io` | `x-api-key` header | server-to-server | 29 |
| **Launcher API** | `https://launcher.api.influence.io` | per-customer HMAC-SHA256 digest | storefront widgets | 24 |

- **Platform API is not the portal's concern** — it's server-side (companies,
  orders, products, webhooks) and would live in the SSW backend (`Ssw.MicroServices`),
  keyed by the secret `x-api-key`. Requires an Influence.io **Plus plan** or higher.
- **Launcher API is what the portal calls.** The portal mounts it at
  `LAUNCHER_API_BASE = 'https://launcher.api.influence.io/launcher/v1'` (note the
  `/launcher/v1` path prefix). Auth is the per-customer digest =
  `HMAC-SHA256(shopKey + lowercase(email) + customerId)` keyed by the Platform API
  key, minted by the SSW backend (`.../customers/loyalty/digest`) — see the digest
  note for the 401 `DigestMismatch` failure mode.

## Launcher endpoints — used vs. available

The portal currently consumes **~8 of 24** Launcher endpoints. The rest are
available for future loyalty features (stamps, referrals, memberships, uploads,
dynamic links, loyalty-card lookup).

**Customer (14 documented):**
- USED: `GET /v1/customer`, `GET /v1/customer/all-rewards`,
  `GET /v1/customer/points`, `POST /v1/customer/redeem`, `POST /v1/customer/social`
- AVAILABLE (not yet wired): `GET /v1/customer/all-rewards/count`,
  `PUT /v1/customer/birthday`, `POST /v1/customer/dynamic-link`,
  `GET /v1/customer/loyalty-card-lookup`, `GET /v1/customer/referrals`,
  `GET /v1/customer/stamps`, `POST /v1/customer/upload-file`,
  `GET /v1/customer/uploads`
- DEPRECATED: `POST /v1/customer/auth`

**Shop (10 documented):**
- USED: `GET /v1/shop/tiers`, `GET /v1/shop/rules/earn`, `GET /v1/shop/rules/redeem`
- AVAILABLE: `GET /v1/shop`, `GET /v1/shop/rules/referral`,
  `GET /v1/shop/rules/earn/{id}/exclusions/product`,
  `GET /v1/shop/rules/earn/{id}/exclusions/variant`, `GET /v1/shop/tiers/{id}`,
  `GET /v1/shop/stamp-card`, `GET /v1/shop/memberships`

**Platform (29, server-side — for backend reference):** Collections (6),
Customers (9 — incl. award/deduct points, stamp, membership enroll/remove),
Orders (3), Products (5), Rewards (1 — `POST /v1/rewards/{couponCode}/use`),
Webhooks (5).

## Memberships — field-level contracts (doc-confirmed 2026-07-17)

Three endpoints across both surfaces. Pulled live from `developer.influence.io` on
2026-07-17, closing the "fields not provided — contact support" gap the caveats
section flags for this entity.

**List (Launcher, browser-safe)** — `GET /shop/memberships?shop=<shopKey>`
Returns `{ memberships: [...] }`; `404` = "Shop not found with shopKey". Maps onto
the existing `launcherGet('/shop/memberships', { shop })` pattern; shape is a
near-clone of `LoyaltyTier`:

| Field | Type | Notes |
|---|---|---|
| `id` | string | the `membershipId` passed to enroll |
| `title` | string | |
| `description` | string | |
| `customerCount` | integer | enrolled-customer count (shop-wide, not per-customer) |
| `perks` | string[] | |

**Enroll (Platform, `x-api-key`, server-side)** —
`POST /v1/customers/{customerId}/membership/enroll` · body `{ membershipId?: string }`
(optional in schema) · `200` → `{ customer: {...} }` · `404` → "Customer not found".

**Remove (Platform, `x-api-key`, server-side)** —
`POST /v1/customers/{customerId}/membership/remove` · no body ·
`200` → `{ customer: {...} }` · `404` → "Customer not found".

Both enroll/remove echo the full customer object: `id, email, firstName, lastName,
name, customerType, referralLink, referralsCompleted, externalId, pointBalance,
share/like/follow social flags, birthdayMonth, birthdayDay, createdAt, updatedAt,
currentLoyaltyTierProgress, currentLoyaltyTierId, lifetimeStampsEarned`.

**Read-back (corrected 2026-07-17):** the live `GET /customer` payload DOES carry
`currentMembershipId` + a `currentMembership` object (`{ id, title, iconType,
defaultIcon, excludeFromMemberships, excludeFromReferrals, perks }`), so a
customer's current membership IS readable and the portal renders its perks on the
Overview tab (`fetchLoyaltyCustomer` maps `id/title/perks`). The enroll/remove
*docs* echo a customer object that omits the membership field — a docs gap, not a
real one. Only the WRITE path (enroll/remove, Platform API `x-api-key`) stays
gated; `list` exposes per-membership `customerCount` totals only.

**Portal integration:** list is portal-safe (call it like `fetchTiers`); enroll/
remove need an SSW proxy holding the `x-api-key`, same trust boundary as
`.../customers/loyalty/digest`.

## Webhook topics (Platform API)

`customers/updated`, `customers/tier_changed`, `points/earned`, `points/redeemed`,
`referrals/started`, `referrals/completed`.

## Data model (inferred)

23 entities. `Shop` is the tenant root → owns `Customer`, catalog
(`Product`/`ProductVariant`/`Collection`), program config
(`EarnRule`/`RedeemRule`/`ReferralRule`/`Tier`/`Membership`/`StampCardSettings`),
and `Webhook`s. A `Customer` accrues `PointActivity` + `Stamp`s that redeem into
`Reward`/`Coupon`s. `Order` carries `financialStatus` ∈ {authorized, pending, paid,
partially_paid, refunded, partially_refunded, voided, expired} and point
award/refund flags.

## Caveats (why this is a sketch, not a contract)

- **Entity fields are inferred** from request/response schemas — Influence.io
  publishes no formal data schema. Trust the *endpoint inventory + auth model*
  (high confidence, matches live traffic in the digest note) over exact field lists.
- The published docs were **last revised over a year ago**; verify against live
  before building on any single field.
- **`GET /customer/current.jwt` is undocumented** — the portal uses it (JWT
  retrieval keyed by `BC_CONTEXT.loyalty.appClientId`, see
  [[b2b-buyer-portal--current-jwt-app-client-id]]) but it is **not** in the
  developer-docs index of 53 endpoints. The documented surface is not the whole
  surface.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--loyalty-digest-mismatch-influence-launcher]]
- [[b2b-buyer-portal--current-jwt-app-client-id]]
- [[b2b-buyer-portal--loyalty-earn-rules-blank-title]]
