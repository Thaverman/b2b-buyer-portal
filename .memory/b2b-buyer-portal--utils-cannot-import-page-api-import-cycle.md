---
title: "Anything reachable from b3Fetch (logoutSession, utils/*) cannot import a page's api.ts — real import/no-cycle via logoutSession -> pages/* api -> shared/service/bc -> b3Fetch -> logoutSession; split the shared state into a leaf module with only `import type`"
type: gotcha
created: 2026-07-28
updated: 2026-07-28
lastVerified: 2026-07-28
repo: b2b-buyer-portal
storeHash: all
website: SSW
area: B2B
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
syncPending: [mongodb, obsidian-vault]  # repo sink only — MCP_DOCKER tool surface gone this session; promote per [[b2b-buyer-portal--memory-sinks-docker-mcp-wsl]]
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/loyaltyLandingState.ts
    symbol: clearLoyaltyLanding      # the leaf: state + clear, only `import type` from ./api
  - kind: ts-react
    package: apps/storefront
    path: src/utils/logoutSession.ts
    symbol: logoutSession            # imports the LEAF, never loyaltyLanding.ts
  - kind: ts-react
    package: apps/storefront
    path: src/pages/Loyalty/loyaltyLanding.ts
    symbol: prefetchLoyaltyLanding   # re-exports clearLoyaltyLanding so consumers/tests keep one import path
tags: [memory, b2b-buyer-portal, b2b, eslint, import-cycle, architecture, dependency-cruiser, devex]
---

# utils → a page's `api.ts` is an import cycle (via b3Fetch → logoutSession)

Hit 2026-07-28 while wiring logout to clear the loyalty landing check; cost a
review loop and a BLOCKED implementer report before the shape was right.

## The cycle

```
src/utils/logoutSession.ts
  → src/pages/Loyalty/loyaltyLanding.ts
  → src/pages/Loyalty/api.ts
  → @/shared/service/bc            (getCurrentCustomerJWT)
  → …/graphql/currency
  → …/request/b3Fetch
  → src/utils/logoutSession.ts     ← back to the start (401 handling)
```

`eslint`'s `import/no-cycle` catches it (NOT `tsc`, and `yarn lint:dependencies`
reports it separately) — so a change that type-checks and passes tests can still
fail the lint gate. `b3Fetch` calls `logoutSession` on 401, which is why **any**
`utils/*` module reachable from `b3Fetch` inherits this constraint: it cannot
import a page module that (transitively) uses the shared service layer.

## The pattern that fixes it: a leaf state module

Put the shared mutable state in a module with **no runtime imports**, and have
both sides talk to that:

```ts
// pages/<Page>/xxxState.ts  — the leaf
import type { Foo } from './api';          // erased at compile time: no runtime edge

let pending: Promise<Foo | null> | null = null;
export const setPending = (p: Promise<Foo | null>): void => { pending = p; };
export const getPending = () => pending;
export const clearPending = (): void => { pending = null; };
```

- The page's real module (`loyaltyLanding.ts`) imports the leaf **and** `./api`,
  and **re-exports** the clear function so existing consumers and tests keep a
  single import path (public API unchanged).
- The `utils` side imports the **leaf only** (`logoutSession.ts` →
  `loyaltyLandingState`).
- `import type` is erased, so it creates no cycle — verified clean by both
  `eslint --max-warnings 0` (incl. `import/no-cycle`) and `lint:dependencies`.
  If a stricter config ever counted type imports, type the slot as
  `Promise<unknown> | null` in the leaf and narrow in the page module.

**Rule of thumb:** when `utils/*` (or anything else low in the graph) needs to
poke page-owned state, invert it — the page owns a dependency-free leaf, and the
low module imports the leaf, never the page's api-touching module.

## Related
- [[board-b2b-buyer-portal]]
- [[b2b-buyer-portal--loyalty-login-landing]]
- [[b2b-buyer-portal--b3fetch-raw-server-errors-b3-api-outage]]
