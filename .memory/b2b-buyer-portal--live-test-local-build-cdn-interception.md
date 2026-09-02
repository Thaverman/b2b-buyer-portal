---
title: Live-testing a local build on sandbox needs BOTH interceptions — the theme dist prefix AND microapps.bigcommerce.com (__get_asset_location routes chunks to the prod CDN)
type: concept
created: 2026-09-02
updated: 2026-09-02
lastVerified: 2026-09-01
repo: b2b-buyer-portal
storeHash: ssw
website: SSW
area: DevEx
memoryType: gotcha
durable: true
status: active
project: b2b-buyer-portal
mongoId: 6a9808303dc954910b44ba8b
codeRefs:
  - kind: ts-react
    package: apps/storefront
    path: src/main.ts
    symbol: __get_asset_location
  - kind: ts-react
    package: apps/storefront
    path: vite.config.ts
    symbol: renderBuiltUrl
tags: [memory, b2b-buyer-portal, devex, playwright, vite, asset-location]
---

# Live-testing a local build needs BOTH interceptions — dist prefix AND microapps CDN

Observed 2026-09-01 while live-verifying the add-card build on sandbox.storesupply.com.

## Key Points
- A default local `yarn build` (`VITE_ASSETS_ABSOLUTE_PATH` unset) emits chunk/asset
  URLs through the runtime resolver `window.b2b.__get_asset_location`, which maps
  `environment=production` to `https://microapps.bigcommerce.com/b2b-buyer-portal/`.
  Serving only the theme loader files (`/content/b2bBuyerPortal/dist/index.js` +
  `polyfills.js`) therefore loads the entry while **every chunk 404s on the prod CDN**.
- **Symptom is subtle:** `window.b2b` exists but holds only
  `{initializationEnvironment, __get_asset_location}`, no `#bundle-container`, React
  never boots, and the lone console clue is one generic 404.
- **Fix:** `page.route` BOTH `'**/content/b2bBuyerPortal/dist/**'` AND
  `'https://microapps.bigcommerce.com/b2b-buyer-portal/**'`, fulfilling by basename
  from local `dist/{,chunks/,assets/}` (~108 files over a full add-card flow).
- Deploy builds behave differently because `VITE_ASSETS_ABSOLUTE_PATH` bakes absolute
  URLs (`vite.config.ts` `renderBuiltUrl` branches on it).

## Code references
- `src/main.ts` (`__get_asset_location`) — the runtime resolver and its environment map.
- `vite.config.ts` (`renderBuiltUrl`) — absolute-path vs runtime-resolver branch.

## Related
- [[board-b2b-buyer-portal]]
