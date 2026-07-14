---
title: b3TriggerCartNumber TypeError reading 'site' (getCart) = graphqlBC envelope without data — b3Fetch never checks res.ok
type: concept
created: 2026-07-10
updated: 2026-07-10
lastVerified: 2026-07-10
repo: b2b-buyer-portal
storeHash: both
website: both
area: B2B
module: apps/storefront
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
mongoId: 6a50fa472d99cbb998a30e44
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/utils/b3TriggerCartNumber.ts
    symbol: b3TriggerCartNumber   # try/catch -> b2bLogger.error(err), then setCartNumber(0)
  - kind: ts-react
    package: apps/storefront
    path: src/shared/service/bc/graphql/cart.ts
    symbol: getCart               # platform==='bigcommerce' branch; cartInfo.data.site throws when envelope has no data
  - kind: ts-react
    package: apps/storefront
    path: src/shared/service/request/b3Fetch.ts
    symbol: graphqlBC             # Bearer bcGraphqlToken; NO errors-envelope handling (contrast graphqlB2B)
  - kind: ts-react
    package: apps/storefront
    path: src/shared/service/request/fetch.ts
    symbol: b3Fetch               # resolves res.json() regardless of HTTP status; only special-cases res.code===500
  - kind: ts-react
    package: apps/storefront
    path: src/utils/loginInfo.ts
    symbol: loginInfo             # mints bcGraphqlToken via storeFrontToken mutation; expires_at now+7d
  - kind: ts-react
    package: apps/storefront
    path: src/store/slices/company.ts
    symbol: persistReducer(company)  # sessionStorage persist:company; App init refreshes token only if falsy
  - kind: ts-react
    package: apps/storefront
    path: src/App.tsx
    symbol: init (useEffect)      # early return after failed b2bVerifyBcLoginStatus leaves bcGraphqlToken unset
tags: [memory, b2b-buyer-portal, b2b, cart, storefront-graphql, token, error-handling]
---

# b3TriggerCartNumber "reading 'site'" TypeError = graphqlBC envelope without `data`

Console error
`TypeError: Cannot read properties of undefined (reading 'site')` at
`getCart` (`cart.ts`, the `platform === 'bigcommerce'` branch reading
`cartInfo.data.site`) via `b3TriggerCartNumber` means the POST to
`{origin}/graphql` (BC **storefront** GraphQL) returned an envelope with **no
`data` key** — a 401 or an errors-only body.

## Chain
- `b3Fetch` resolves ANY JSON without checking `res.ok` (only special-cases
  `res.code === 500`).
- `graphqlBC` — unlike `graphqlB2B` — does zero errors-envelope handling and
  authorizes with `Bearer ${bcGraphqlToken}` from redux `company.tokens`.
- `bcGraphqlToken` is minted at App init by `loginInfo()` →
  `getBCGraphqlToken` (B3 `storeFrontToken` mutation; `expires_at` now+7d,
  `allowed_cors_origins: [origin]`, `channel_id` from `window.B3.setting`) and
  persisted via redux-persist to **sessionStorage** `persist:company`;
  `App.tsx` refreshes it only when **falsy**.

## Root-cause candidates when it fires
1. **Token never minted** — `App.tsx` init early-returns (`logoutSession`)
   when a rehydrated `customerId` fails `b2bVerifyBcLoginStatus`, or
   `loginInfo()` threw (see [[b2b-buyer-portal--b3fetch-raw-server-errors-b3-api-outage]]).
2. **Stale token** — sessionStorage survives tab-restore; token >7 days old or
   session invalidated server-side.
3. **Wrong-channel token (MultiSite)** — token minted for
   `window.B3.setting.channel_id` used on a different channel's origin
   (window.B3 is defined 3× theme-side; see stencil memory
   `stencil--b2b-edition-config-duplicated-and-corrupted-in-theme`).

## Impact & diagnosis
Impact is soft here: `b3TriggerCartNumber` try/catches (`b2bLogger.error`) and
dispatches `setCartNumber(0)` — portal cart badge shows 0 + console noise. But
every other `graphqlBC` consumer hits the same wall harder.

Diagnose: Network tab → POST `{origin}/graphql` status/body;
`JSON.parse(sessionStorage.getItem('persist:company')).tokens`; decode the JWT
payload (`eat`, channel).

## Hardening candidates (not yet implemented)
`res.ok` check in `b3Fetch`; errors-envelope handling in `graphqlBC`;
defensive `cartInfo?.data?.site` in `getCart`.

## Open
Which failure path fired for the 2026-07-10 sighting (UAT524 MultiSite
testing) is unconfirmed — need the Network-tab status/body of the failing
POST `/graphql` + `persist:company` tokens from the affected browser.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--b3fetch-raw-server-errors-b3-api-outage]]
- [[b2b-buyer-portal--current-jwt-app-client-id]]

> Sinks (3-sink complete 2026-07-10): MongoDB `memory.entries` _id
> `6a50fa472d99cbb998a30e44`, repo `.memory/` (this file), Obsidian vault
> `Platform/Memory/`. All consistent.
