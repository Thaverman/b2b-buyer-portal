---
title: Loyalty Rewards page fails with Influence.io Launcher 401 DigestMismatch — SSW backend HMAC secret/format mismatch, not a portal bug
type: concept
created: 2026-07-09
updated: 2026-07-09
lastVerified: 2026-07-09
repo: b2b-buyer-portal
storeHash: 24erkpw9h6
website: SSW
area: B2B
memoryType: gotcha
durable: true
status: resolved
project: b2b-buyer-portal
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: launcherStatusToError   # Launcher 401 → LoyaltyError('misconfigured'); comment: HMAC of stable inputs, re-login never fixes
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: getLoyaltyDigest         # POST {apiBase}/loyalty/digest — apiBase MUST end in /customers
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/api.ts
    symbol: fetchLoyaltyCustomer     # GET launcher/v1/customer — first customer-scoped call, where DigestMismatch surfaces
  - kind: ts-react
    package: apps/storefront
    path: src/index.d.ts
    symbol: BC_CONTEXT               # window.BC_CONTEXT.loyalty = { shopKey, apiBase, appClientId } host-set by Stencil theme
tags: [memory, b2b-buyer-portal, b2b, loyalty, influence-io, digest, hmac, ssw-microservices]
---

# Loyalty Rewards page fails with Influence.io Launcher 401 DigestMismatch — SSW backend HMAC secret/format mismatch, not a portal bug

> **RESOLVED 2026-07-09.** The `test-onlineservices` backend digest signing was
> corrected; `launcher/v1/customer` now returns 200 and the Rewards page renders
> fully (see [Resolution](#resolution-verified-2026-07-09)). Kept as an active
> **diagnostic reference** — the reusable rule below still applies to any future
> `401 DigestMismatch`.

The `/loyalty` (Rewards) page *previously* rendered but showed the generic
**"We couldn't load your rewards."** error because the Influence.io Launcher API
rejected the SSW-minted digest with **HTTP 401 `{"error":"DigestMismatch"}`** on
every customer-scoped call. Public shop-scoped calls succeeded; only the
HMAC-gated customer calls failed.

Diagnosed end-to-end on 2026-07-09 via Playwright, logged in as
`thaverman@storesupply.com` (BC customer `80591`, B2B "Test Company") on
`sandbox.storesupply.com` (store hash `24erkpw9h6`).

## Resolution (verified 2026-07-09)

Re-ran the same Playwright flow later the same day. All loyalty calls now succeed:

- `POST …/customers/loyalty/digest` → **200**
- `GET launcher/v1/shop/tiers?shop=24erkpw9h6` → **200**
- `GET launcher/v1/customer?shop=24erkpw9h6&customer_id=80591&…` → **200** (was 401)
  — returns real data: `currentLoyaltyTierId 29777d36…` (**SIGNATURE**), `externalId 80591`.

The Rewards page renders the real state — *Welcome back Test Company · Member
since Mar 2026 · Current tier SIGNATURE · 46,834 points · SIGNATURE benefits* —
with no error banner and no `Loyalty: Launcher API rejected the digest (401)`
console error. Both blockers are closed: the `/loyalty/digest` 404 (theme
`apiBase` gained `/customers`) **and** the `DigestMismatch` 401 (backend HMAC
key/format corrected in `Ssw.MicroServices`).

## Observed request chain

- `POST https://test-onlineservices.storesupply.com/customers/loyalty/digest`
  → **200** `{"Digest":"<64-char HMAC-SHA256>","CustomerId":"80591","Email":"thaverman@storesupply.com"}`
- `GET launcher/v1/shop/tiers?shop=24erkpw9h6` → **200** (real tiers:
  SIGNATURE/SELECT/ELITE with thresholds + perks)
- `GET launcher/v1/customer?shop=24erkpw9h6&customer_id=80591&customer_email=…&digest=…`
  → **401** `{"error":"DigestMismatch"}`

Console: `Loyalty: Launcher API rejected the digest (401) — identity keying or
shop key mismatch`.

## The original 404 is a DIFFERENT, already-fixed problem

The earlier report of `https://test-onlineservices.storesupply.com/loyalty/digest`
returning **404** was the missing-`/customers` state of
`window.BC_CONTEXT.loyalty.apiBase`. The theme has since been corrected —
`apiBase` is now `https://test-onlineservices.storesupply.com/customers`, the
portal builds `.../customers/loyalty/digest`, and that endpoint returns 200. Do
not conflate the two: **404 at `/loyalty/digest` = theme apiBase missing
`/customers`; 401 DigestMismatch = backend signing problem (below).**

## Root cause (backend, in Ssw.MicroServices — NOT the portal)

The digest is `HMAC-SHA256(shopKey + lowercase(email) + customerId)` keyed by
Influence.io's **Platform API key**, minted by the SSW backend and re-verified by
Influence.io. A `DigestMismatch` means the HMAC the `test-onlineservices` backend
produced ≠ the one Influence.io computes for identical inputs. The `test-onlineservices`
backend is either signing with the **wrong Influence.io Platform API key** (secret
mismatch — blank/placeholder, or test-vs-prod key crossed with the shop) or
**constructing the HMAC message differently** than Influence.io's digest spec
(field order / separator / shop-key string).

Ruled out by evidence:
- **Shop key** is valid — `/shop/tiers?shop=24erkpw9h6` returns real tier data,
  so Influence.io recognizes shop `24erkpw9h6`.
- **Email casing** is fine — backend returned already-lowercased
  `thaverman@storesupply.com`; client echoes it verbatim. The documented casing
  trap is not the cause here.
- **Identity** is well-formed and consistent — 401 (not 404) means it fails at
  HMAC validation, *before* any customer lookup.

## Diagnostic rule (reusable)

- **Launcher `401 DigestMismatch`** = check the SSW backend's Influence.io
  Platform API key and HMAC message construction for that shop, in
  `Ssw.MicroServices` (`test-onlineservices` / `api.storesupply.com`). It is
  never a portal bug and never a shopper session problem — re-login cannot fix a
  timeless HMAC.
- The portal already encodes this: `launcherStatusToError` maps a Launcher 401 to
  `LoyaltyError('misconfigured')` (not `sessionExpired`), so the UI never shows a
  false "sign in again" for this failure.
- **404 at `/loyalty/digest`** (distinct failure) = `BC_CONTEXT.loyalty.apiBase`
  is missing its `/customers` path segment (host Stencil theme config), no trailing
  slash — the portal appends `/loyalty/digest`.
- Fix verification: once the backend key/format is corrected, `launcher/v1/customer`
  flips to 200 and the page populates. Re-runnable with the Playwright login flow.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--bc-context-host-config-gating]]
- [[b2b-buyer-portal--current-jwt-app-client-id]]
