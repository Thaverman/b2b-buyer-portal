# Component Recreation Guide

Technical implementation reference for porting the following to another repo:

1. [`ManageSubscriptions`](#1-managesubscriptions) — iframe-hosted subscription manager page
2. [`SavedPaymentMethods`](#2-savedpaymentmethods) — iframe-hosted BigCommerce payment methods page
3. [`pushDataLayerEvent`](#3-pushdatalayereventutility) — GTM data layer helper

This guide lists every file you need, every dependency, exact code, route wiring, permissions, and non-obvious behaviors so the components can be recreated in another project.

---

## Shared prerequisites

Both page components share the same dependencies and wiring patterns. Set these up first.

### Runtime / libraries
- React 17+ (`useState`, `ReactElement`)
- `@mui/material` (for `Box`, `CircularProgress`, `useTheme`)
- A lazy-loaded router (React Router v6 style with `React.lazy`)
- A global app config injected at runtime on `window.B3.setting` (see basic config below) — required only by `SavedPaymentMethods`.

### Loading spinner wrapper — `B3Spin`

Both pages wrap their iframe in a `B3Spin` component that renders a centered `CircularProgress` overlay while loading. Minimal reproduction if you don't want to port the existing one:

```tsx
// components/spin/B3Spin.tsx
import { ReactNode } from 'react';
import { Box, CircularProgress } from '@mui/material';

interface B3SpinProps {
  isSpinning?: boolean;
  children: ReactNode;
}

export default function B3Spin({ isSpinning, children }: B3SpinProps) {
  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      {isSpinning && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.6)',
            zIndex: 1,
          }}
        >
          <CircularProgress size={40} thickness={2} />
        </Box>
      )}
      {children}
    </Box>
  );
}
```

The real implementation in this repo ([apps/storefront/src/components/spin/B3Spin.tsx](apps/storefront/src/components/spin/B3Spin.tsx)) additionally supports `tip`, `size`, `thickness`, `isCloseLoading`, `background`, `spinningHeight`, `isFlex`, and `transparency` props, plus mobile detection (`useMobile`) and i18n (`useB3Lang`). The minimal version above is sufficient for these pages.

### Route wiring pattern

The app keeps route metadata (path, permissions, menu visibility, i18n key) in a flat list, and a separate map from path to lazy-loaded component. Routes are built by merging the two.

Relevant files in this repo:
- [apps/storefront/src/shared/routes/index.tsx](apps/storefront/src/shared/routes/index.tsx) — lazy imports + `routesMap` (path → component)
- [apps/storefront/src/shared/routeList.ts](apps/storefront/src/shared/routeList.ts) — route metadata list
- [apps/storefront/src/shared/routes/config.ts](apps/storefront/src/shared/routes/config.ts) — permission groups

Permissions key used for both pages: `accountSettingPermissions` — a role list:

```ts
// shared/routes/config.ts
accountSettingPermissions: [
  CustomerRole.SUPER_ADMIN,
  CustomerRole.ADMIN,
  CustomerRole.SENIOR_BUYER,
  CustomerRole.JUNIOR_BUYER,
  CustomerRole.CUSTOM_ROLE,
  CustomerRole.B2C,
  CustomerRole.SUPER_ADMIN_BEFORE_AGENCY,
]
```

Each route entry has this shape (fields used by these pages):

| Field            | Type       | Purpose                                                             |
| ---------------- | ---------- | ------------------------------------------------------------------- |
| `path`           | `string`   | URL path                                                            |
| `name`           | `string`   | Human-readable name                                                 |
| `wsKey`          | `string`   | Workspace/feature key used by other menu-gating logic               |
| `configKey`      | `string?`  | If present, route is gated by `storefrontConfig[configKey]` boolean |
| `isMenuItem`     | `boolean`  | Whether to render in navigation menu                                |
| `permissions`    | `Role[]`   | Roles allowed to access the route                                   |
| `isTokenLogin`   | `boolean`  | Whether the route requires B2B authentication                       |
| `idLang`         | `string`   | i18n key for the menu label                                         |

### Page props contract

Route components receive a `PageProps` object:

```ts
// pages/PageProps.ts
import { type SetOpenPage } from '@/pages/SetOpenPage';

export interface PageProps {
  setOpenPage: SetOpenPage;
}
```

`ManageSubscriptions` ignores props entirely; `SavedPaymentMethods` accepts them as `_props` and ignores them.

---

## 1. `ManageSubscriptions`

**Source file:** [apps/storefront/src/pages/ManageSubscriptions/index.tsx](apps/storefront/src/pages/ManageSubscriptions/index.tsx)

### What it does

Renders a full-page iframe to an external subscription-management app. Shows a spinner until the iframe fires `onLoad`, then best-effort hides the embedded site's `<header>`/`<footer>` (fails silently on cross-origin, which is the expected case in most environments).

### Dependencies

| Import                | From                         | Purpose                           |
| --------------------- | ---------------------------- | --------------------------------- |
| `useState`            | `react`                      | `loading` state                   |
| `Box`                 | `@mui/material`              | Layout                            |
| `B3Spin`              | `@/components/spin/B3Spin`   | Loading overlay                   |

### Config

A single environment variable drives the iframe URL:

```
VITE_SUBSCRIPTION_MANAGER_URL=https://your-subscriptions-host.example.com/subscriptions?hideLayout=true
```

Fallback hard-coded default: `https://sandbox.storesupply.com/subscriptions`.

### Full source

```tsx
import { useState } from 'react';
import { Box } from '@mui/material';

import B3Spin from '@/components/spin/B3Spin';

const SUBSCRIPTION_MANAGER_URL =
  import.meta.env.VITE_SUBSCRIPTION_MANAGER_URL || 'https://sandbox.storesupply.com/subscriptions';

function ManageSubscriptions() {
  const [loading, setLoading] = useState(true);

  const handleIframeLoad = () => {
    setLoading(false);

    // Attempt to hide header/footer - will only work if same-origin
    try {
      const iframe = document.getElementById('subscriptions-iframe') as HTMLIFrameElement;
      if (iframe?.contentWindow?.document) {
        const iframeDoc = iframe.contentWindow.document;

        const header = iframeDoc.querySelector('header');
        const footer = iframeDoc.querySelector('footer');

        if (header) (header as HTMLElement).style.display = 'none';
        if (footer) (footer as HTMLElement).style.display = 'none';
      }
    } catch (error) {
      // Cross-origin access blocked - this is expected for different domains
      console.warn('Unable to modify iframe content due to cross-origin restrictions:', error);
    }
  };

  return (
    <B3Spin isSpinning={loading}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: '800px',
          position: 'relative',
        }}
      >
        <div id="og-msi" ng-jq=""></div>
        <iframe
          id="subscriptions-iframe"
          src={SUBSCRIPTION_MANAGER_URL}
          style={{ width: '100%', height: '100%', border: 'none', minHeight: '800px' }}
          title="Manage Subscriptions"
          onLoad={handleIframeLoad}
        />
      </Box>
    </B3Spin>
  );
}

export default ManageSubscriptions;
```

### Route wiring

Lazy import + routes map:

```tsx
// shared/routes/index.tsx
const SubscriptionManager = lazy(() => import('@/pages/ManageSubscriptions'));

const routesMap = {
  // ...
  '/manage-subscriptions': SubscriptionManager,
};
```

Route metadata:

```ts
// shared/routeList.ts
{
  path: '/manage-subscriptions',
  name: 'Manage Subscriptions',
  wsKey: 'manageSubscriptions',
  isMenuItem: true,
  permissions: accountSettingPermissions,
  isTokenLogin: true,
  idLang: 'global.navMenu.manageSubscriptions',
}
```

### Notes / gotchas

- **No Redux, no API calls, no props.** Purely a local `useState` for the loading flag.
- The `<div id="og-msi" ng-jq=""></div>` is a specific hook consumed by the embedded host (OG Manage Subscriptions Initializer) — remove it if your embedded host doesn't expect it.
- `minHeight: 800px` is duplicated on the wrapper `Box` and the `iframe` itself — both are needed because the iframe doesn't auto-size to content.
- The cross-origin DOM manipulation is defensive: most real deployments will be cross-origin, so the `try/catch` is the normal path. The `hideLayout=true` query string on the embedded URL is the real mechanism for hiding chrome.
- `isMenuItem: true` means this page appears in the left nav.
- No analytics are fired from this page (no `pushDataLayerEvent` call).

---

## 2. `SavedPaymentMethods`

**Source file:** [apps/storefront/src/pages/SavedPaymentMethods/index.tsx](apps/storefront/src/pages/SavedPaymentMethods/index.tsx)

### What it does

Renders a full-page iframe to the BigCommerce storefront's built-in Account → Payment Methods page (`/account.php?action=payment_methods`). Dynamically builds the BigCommerce host URL from platform/storeHash/channelId. Same spinner + same cross-origin header/footer hiding attempt as `ManageSubscriptions`.

### Dependencies

| Import                             | From                              | Purpose                                                     |
| ---------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| `ReactElement`, `useState`         | `react`                           | Types + state                                               |
| `Box`                              | `@mui/material`                   | Layout                                                      |
| `B3Spin`                           | `@/components/spin/B3Spin`        | Loading overlay                                             |
| `PageProps`                        | `@/pages/PageProps`               | Route props interface                                       |
| `BigCommerceStorefrontAPIBaseURL`  | `@/utils` (from `utils/basicConfig.ts`) | Dynamically constructed BC storefront host URL      |

### Base URL helper

The URL is not an env var — it's computed from runtime globals on `window.B3.setting`:

```ts
// utils/basicConfig.ts
export const {
  store_hash: storeHash,
  channel_id: channelId,
  disable_logout_button: disableLogoutButton,
  platform = 'custom',
} = window.B3.setting;

const generateBcStorefrontAPIBaseUrl = () => {
  if (platform === 'bigcommerce') return window.origin;
  if (channelId === 1) return `https://store-${storeHash}.mybigcommerce.com`;
  return `https://store-${storeHash}-${channelId}.mybigcommerce.com`;
};

export const BigCommerceStorefrontAPIBaseURL = generateBcStorefrontAPIBaseUrl();
```

To port this, either:
- Replicate the `window.B3.setting` global (inject `{ store_hash, channel_id, platform, ... }` from the host page), **or**
- Replace `BigCommerceStorefrontAPIBaseURL` with a value from your own env/config system.

### Type declaration (if `window.B3` isn't already declared)

```ts
// types/global.d.ts
declare global {
  interface Window {
    B3: {
      setting: {
        store_hash: string;
        channel_id: number;
        platform?: 'bigcommerce' | 'custom' | 'catalyst';
        disable_logout_button?: boolean;
        [k: string]: unknown;
      };
    };
  }
}
export {};
```

### Full source

```tsx
import { ReactElement, useState } from 'react';
import { Box } from '@mui/material';

import B3Spin from '@/components/spin/B3Spin';
import { PageProps } from '@/pages/PageProps';
import { BigCommerceStorefrontAPIBaseURL } from '@/utils';

const PAYMENT_METHODS_URL = `${BigCommerceStorefrontAPIBaseURL}/account.php?action=payment_methods&hideLayout=true`;

export default function SavedPaymentMethods(_props: PageProps): ReactElement {
  const [loading, setLoading] = useState(true);

  const handleIframeLoad = () => {
    setLoading(false);

    try {
      const iframe = document.getElementById('payment-methods-iframe') as HTMLIFrameElement;
      if (iframe?.contentWindow?.document) {
        const iframeDoc = iframe.contentWindow.document;

        const header = iframeDoc.querySelector('header');
        const footer = iframeDoc.querySelector('footer');

        if (header) (header as HTMLElement).style.display = 'none';
        if (footer) (footer as HTMLElement).style.display = 'none';
      }
    } catch (error) {
      console.warn('Unable to modify iframe content due to cross-origin restrictions:', error);
    }
  };

  return (
    <B3Spin isSpinning={loading}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: '800px',
          position: 'relative',
        }}
      >
        <iframe
          id="payment-methods-iframe"
          src={PAYMENT_METHODS_URL}
          style={{ width: '100%', height: '100%', border: 'none', minHeight: '800px' }}
          title="Saved payment methods"
          onLoad={handleIframeLoad}
        />
      </Box>
    </B3Spin>
  );
}
```

### Route wiring

```tsx
// shared/routes/index.tsx
const SavedPaymentMethods = lazy(() => import('@/pages/SavedPaymentMethods'));

const routesMap = {
  // ...
  '/saved-payment-methods': SavedPaymentMethods,
};
```

Route metadata:

```ts
// shared/routeList.ts
{
  path: '/saved-payment-methods',
  name: 'Saved payment methods',
  wsKey: 'savedPaymentMethods',
  configKey: 'savedPaymentMethods',
  isMenuItem: false,
  permissions: accountSettingPermissions,
  isTokenLogin: true,
  idLang: 'global.navMenu.savedPaymentMethods',
}
```

### Notes / gotchas

- **Multi-channel aware.** The URL differs by channel:
  - `platform === 'bigcommerce'` → `window.origin`
  - `channelId === 1` → `https://store-<hash>.mybigcommerce.com`
  - else → `https://store-<hash>-<channelId>.mybigcommerce.com`
- **Feature flag.** `configKey: 'savedPaymentMethods'` means the route is only mounted when `storefrontConfig.savedPaymentMethods` is truthy (the router filter in [apps/storefront/src/shared/routeList.ts:260](apps/storefront/src/shared/routeList.ts#L260) `getAllowedRoutesWithoutComponent` drops routes whose `configKey` is disabled). Replicate this gating in the destination or omit the `configKey`.
- **Not in nav menu.** `isMenuItem: false` — users reach this page from Account Settings or a deep link, not the sidebar.
- **Same cross-origin caveat.** `hideLayout=true` is the real layout-hiding mechanism; the JS DOM manipulation is a no-op in production.
- **No Redux, no API calls, no analytics.**
- `_props: PageProps` is deliberate: the type is preserved so the component satisfies the `routesMap` signature `(props: PageProps) => ReactElement`, but the underscore signals the props are unused.

---

## 3. `pushDataLayerEvent` (utility)

**Source file:** [apps/storefront/src/utils/analytics.ts](apps/storefront/src/utils/analytics.ts)

### What it does

Pushes an arbitrary event object to Google Tag Manager's `window.dataLayer`, lazily initializing the array on first use. This is the standard GTM idiom.

### Full source (4 lines)

```ts
export function pushDataLayerEvent(event: Record<string, unknown>): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(event);
}
```

### Type declaration required

`window.dataLayer` is not a standard browser global. Declare it:

```ts
// types/global.d.ts (or equivalent)
declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}
export {};
```

### Where it's called in this repo

All five call sites push one of two event shapes: `{ event: 'login', method: 'email' }` or `{ event: 'sign_up', method: 'email' }`. They fire **after** successful authentication or registration, synchronously, with no error handling.

| # | Site | Path | Fired when | Event shape |
| - | ---- | ---- | ---------- | ----------- |
| 1 | [Login, checkout path](apps/storefront/src/pages/Login/index.tsx#L187) | `pages/Login/index.tsx:187` | `loginCheckout()` returns non-error response | `{ event: 'login', method: 'email' }` |
| 2 | [Login, B2B portal path](apps/storefront/src/pages/Login/index.tsx#L219) | `pages/Login/index.tsx:219` | After `b2bLogin` mutation + `setB2BToken` + `customerLoginAPI` | `{ event: 'login', method: 'email' }` |
| 3 | [Registered, checkout path](apps/storefront/src/pages/Registered/index.tsx#L97) | `pages/Registered/index.tsx:97` | After successful `loginCheckout` following signup | `{ event: 'sign_up', method: 'email' }` |
| 4 | [Registered, B2B portal path](apps/storefront/src/pages/Registered/index.tsx#L117) | `pages/Registered/index.tsx:117` | After `bcLogin` + `getCurrentCustomerInfo` | `{ event: 'sign_up', method: 'email' }` |
| 5 | [RegisteredBCToB2B conversion](apps/storefront/src/pages/RegisteredBCToB2B/index.tsx#L503) | `pages/RegisteredBCToB2B/index.tsx:503` | After successful BC→B2B company-user conversion | `{ event: 'sign_up', method: 'email' }` |

### Representative call pattern

```tsx
// pages/Login/index.tsx (B2B portal path, line 219)
const { login: { result: { token, storefrontLoginToken }, errors } } = await b2bLogin({ loginData });

storeDispatch(setB2BToken(token));
customerLoginAPI(storefrontLoginToken);
dispatchEvent('on-login', { storefrontToken: storefrontLoginToken });
pushDataLayerEvent({ event: 'login', method: 'email' });
```

### Event shape conventions

The function accepts `Record<string, unknown>` — there is no compile-time schema. Observed conventions in this repo:

- `event: string` — required-by-convention; values so far: `'login'`, `'sign_up'` (both GA4 recommended event names).
- `method: string` — required-by-convention for auth events; always `'email'` (no OAuth/SSO integrations currently tracked).

If you want stricter typing in the destination, introduce a discriminated union:

```ts
type AuthMethod = 'email' | 'google' | 'apple' | 'sso';

type DataLayerEvent =
  | { event: 'login'; method: AuthMethod }
  | { event: 'sign_up'; method: AuthMethod }
  | { event: string; [k: string]: unknown };

export function pushDataLayerEvent(event: DataLayerEvent): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(event);
}
```

### Notes / gotchas

- **GTM must be installed on the host page.** This function assumes the GTM container script runs and consumes `window.dataLayer`. If GTM isn't present the pushes are harmless no-ops (they just pile up in an array).
- **Call after the happy-path side effects complete.** In every call site the event fires *after* the token/customer info is set — if you front-load the push, GTM may tag a user who is not yet authenticated.
- **Unguarded.** There's no `try/catch`. If `window.dataLayer.push` were ever patched to throw, the caller would see the error. Keep the helper minimal; don't add error swallowing unless you can justify it.
- **No PII.** Only event name and auth method are pushed — no email, customer ID, etc. Preserve this discipline when adding new call sites to avoid leaking customer data into GTM/GA.

---

## Recreation checklist

To port all three to another repo:

- [ ] Install deps: `react`, `@mui/material`, `@emotion/react`, `@emotion/styled`, React Router (or your router).
- [ ] Create `components/spin/B3Spin.tsx` (minimal version above is fine).
- [ ] Create `utils/analytics.ts` with `pushDataLayerEvent`.
- [ ] Add `window.dataLayer` to your global type declarations.
- [ ] Verify GTM snippet is present on the host page.
- [ ] For `ManageSubscriptions`: copy the file, set `VITE_SUBSCRIPTION_MANAGER_URL` (or rename the env var to match your build tool — CRA uses `REACT_APP_*`, Next uses `NEXT_PUBLIC_*`).
- [ ] For `SavedPaymentMethods`: either replicate `window.B3.setting` injection + `utils/basicConfig.ts`, or replace `BigCommerceStorefrontAPIBaseURL` with your own config value.
- [ ] Create `pages/PageProps.ts` (or simplify the component signature to `() => ReactElement` if you don't use a shared props contract).
- [ ] Wire both routes into your router with lazy loading.
- [ ] Add permission gates matching your role model (or drop them for a simpler app).
- [ ] Add `pushDataLayerEvent({ event: 'login', method: 'email' })` after successful login and `{ event: 'sign_up', method: 'email' }` after successful registration at your own auth call sites.
- [ ] Smoke test: load each page, confirm spinner disappears on iframe load, confirm cross-origin console warning is benign, confirm GTM receives events (check `window.dataLayer` in devtools).
