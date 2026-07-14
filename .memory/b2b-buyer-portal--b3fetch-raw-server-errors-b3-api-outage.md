---
title: b3Fetch graphqlB2B rethrows raw B3 API server errors — api-b2b.bigcommerce.com outages surface as storefront errors
type: concept
created: 2026-07-06
updated: 2026-07-06
lastVerified: 2026-07-06
repo: b2b-buyer-portal
storeHash: all
website: both
area: B2B
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
mongoId: 6a4bd01514206377d044ba89
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/shared/service/request/b3Fetch.ts
    symbol: graphqlB2B          # snackbar.error(message) + throw new Error(message) — server text verbatim
  - kind: ts-react
    package: apps/storefront
    path: src/shared/service/request/base.ts
    symbol: getAPIBaseURL       # production always → https://api-b2b.bigcommerce.com; VITE_B2B_URL is local-only
  - kind: ts-react
    package: apps/storefront
    path: src/utils/loginInfo.ts
    symbol: loginInfo           # getBCGraphqlToken — first B3 call awaited at App startup
tags: [memory, b2b-buyer-portal, b2b, b3-api, error-handling, outage]
---

# b3Fetch graphqlB2B rethrows raw B3 API server errors — api-b2b.bigcommerce.com outages surface as storefront errors

`B3Request.graphqlB2B` takes any B3 GraphQL `errors[0].message` and both shows it
to the shopper (`snackbar.error(message)`) and throws it (`throw new
Error(message)`) with **no sanitization** — so infrastructure errors from
BigCommerce's backend leak verbatim into the storefront UI and error monitoring.

Incident example (2026-07-06): Postgres `FATAL: remaining connection slots are
reserved for roles with privileges of the "pg_use_reserved_connections" role`
(connection to `10.40.240.4:5432`) appeared on **Store Supply and Love Groomers
simultaneously**. That is BigCommerce's B2B Edition database exhausting
`max_connections` — a BigCommerce-side outage, nothing in our code.

## Diagnostic rule

- Production `graphqlB2B` traffic ALWAYS goes to BigCommerce-hosted
  `https://api-b2b.bigcommerce.com` (`base.ts` `ENVIRONMENT_B2B_API_URL`;
  `VITE_B2B_URL` only affects the `local` environment). We do not host or proxy
  it, so a raw DB/server error thrown at `b3Fetch.ts` = **BigCommerce B2B
  Edition backend incident** → escalate to BigCommerce support with timestamp +
  store hashes; check status.bigcommerce.com.
- Multiple stores failing at the same moment is the fingerprint of the shared
  backend (each store has no B3 infrastructure of its own).
- The first call to fail is usually `loginInfo()` → `getBCGraphqlToken`, awaited
  during `App.tsx` startup — so the portal fails to initialize and the stack
  reads `b3Fetch.ts → loginInfo.ts → App.tsx`.
- Distinct from the `extensions.code === 40101` branch, which clears
  sessionStorage and force-logs-out (see checkout-side notes on sessionStorage
  wipes); generic server errors take the plain `message` branch.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-checkout--checkoutdata-window-exposure-order-confirmation]]
