# Payment Methods Page (Stored Card Management) — Design Spec

- **Date:** 2026-06-11
- **Status:** Approved (design); ready for implementation planning
- **Area:** `apps/storefront` — new page `src/pages/PaymentMethods/`, routing, i18n

## Summary

A new buyer-portal page at `/#/payment-methods` where a logged-in customer can
**view** their saved credit cards, **set one as default**, and **delete** one.
The backend is already complete: `Ssw.MicroServices.CustomerServices` exposes
four `POST` endpoints under `/customers/Customer/*`, each authenticated by a
BigCommerce **Current Customer JWT** (~15 s TTL) that the portal fetches fresh
per call. No card data (PAN/CVV) ever flows through the portal or the service —
everything operates on opaque instrument tokens plus display metadata
(brand, last4, expiry, default flag).

This spec covers the **frontend only**. The backend contract is reproduced
below for reference; its design lives in the CustomerServices spec
(`2026-06-10` customer payment-method management endpoints).

## Goals

- New `/payment-methods` page listing the customer's stored instruments with
  brand, `•••• last4`, expiry, **Default** chip, and **Expired** chip.
- **Set as default** action (hidden on the current default card).
- **Delete** action behind a confirmation dialog that states the card is also
  removed from the payment provider's vault (permanent).
- Feature is **gated three ways**: host config present
  (`window.BC_CONTEXT.paymentMethods`), Stencil platform only
  (`platform === 'bigcommerce'`), and not while a sales rep is masquerading
  (`b2bFeatures.masqueradeCompany.isAgenting`).
- Fresh Current Customer JWT fetched immediately before every API call.

## Non-goals

- **No add-card.** Vaulting a new card is a PCI-sensitive hosted-fields flow;
  cards keep getting saved during checkout. Out of scope (matches the backend
  spec's out-of-scope list).
- **No card edit** (expiry/billing address).
- **No backend, gateway, or CustomerServices changes** — with one flagged
  exception: CORS support is an open dependency (see Risks).
- **No use of `GetStoredInstrument`.** The list response carries everything the
  UI needs; the get-one endpoint stays unwired until a detail view exists.
- **No new Redux slice, Context provider, or local/sessionStorage state**
  (per AGENTS.md state-management direction).
- **No multi-store portal work.** Store resolution is config-only on both
  sides; other stores onboard by backend config + host-page `BC_CONTEXT`.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Operations | View, set default, delete. Add-card explicitly excluded. |
| UI surface | New buyer-portal page `/payment-methods` (menu item), same permission set as Account Settings — stored cards belong to the individual BigCommerce customer, so every role manages only their own. |
| Config source | `window.BC_CONTEXT.paymentMethods = { apiBase, appClientId }`, set by the host project (same mechanism as `storeSuffix` for order-id obfuscation). Absent ⇒ feature off. |
| App client id | The JWT must be minted for the **SSW app** (`appClientId` from `BC_CONTEXT`), **not** `getAppClientId()` (the B2B Edition app). The backend validates `aud` against its `StoreSecrets.ClientId`; a B2B-app JWT is rejected as unknown-store. |
| HTTP client | Page-local `fetch` wrapper, not `B3Request` (which is hard-wired to B2BToken / BC token headers; this is a third backend with its own auth). |
| Server state | `@tanstack/react-query`: one `useQuery` for the list, `useMutation` per action. Mutations return the refreshed list, applied via `setQueryData` — no extra refetch. |
| JWT lifetime | Fetched fresh inside every query/mutation function, never cached (~15 s TTL). |
| File placement | Everything inside `src/pages/PaymentMethods/` (matroska) — page-specific business logic does not go in `src/shared/`. Delete confirmation uses the shared `B3Dialog` inline; no single-use dialog component. |
| Masquerade / agenting | Feature suppressed while a sales rep is agenting: the Current Customer JWT identifies the **logged-in rep**, not the masqueraded buyer, so the rep would unknowingly view/delete their own cards. Both the route gate and the in-page check honor `isAgenting`. |
| Platform | Stencil-only (`platform === 'bigcommerce'`). `getCurrentCustomerJWT` early-returns `undefined` on every other platform, which would misrender as "session expired" to a logged-in user — so non-Stencil platforms are gated out rather than error-mapped. |
| Cache scoping | `queryKey: ['storedInstruments', customerId]` with `customerId` from `company.customer.id` (read once at the top of the page), so logout / identity switch can never briefly render the previous customer's cards from cache. |

## Backend contract (already built — reference only)

Base: `{apiBase}/customers/Customer/…`, all `POST`, `Content-Type: application/json`.

| Action | Body | 200 response |
|---|---|---|
| `StoredInstruments` | `{ jwt }` | `{ customerId, instruments: [...] }` |
| `SetDefaultStoredInstrument` | `{ jwt, token }` | refreshed list (same shape) |
| `DeleteStoredInstrument` | `{ jwt, token }` | refreshed list; delete also unvaults at the gateway |
| `GetStoredInstrument` (unused here) | `{ jwt, token }` | single instrument DTO |

Instrument DTO: `{ token, last4, brand, expiryMonth, expiryYear, type, isDefault }`.

Errors (all actions): `400 missing_jwt|missing_token`, `401 invalid_token`,
`404 instrument_not_found`, `429` (empty body, 20 req/60 s per IP),
`502 upstream_unavailable`. Ownership is enforced server-side; `404` never
reveals whether a token exists for another customer.

## Architecture

```
src/pages/PaymentMethods/
├── index.tsx                       # page shell: title, useQuery, state switching
├── api.ts                          # fetch wrapper + typed error mapping
├── components/
│   └── PaymentMethodRow.tsx        # brand, ••••last4, expiry, chips, actions
├── index.test.tsx
├── index.platform.test.tsx         # platform gate test (vi.mock of basicConfig)
└── (builders/handlers in test files per tests/ conventions)
```

### Routing & gating

- `routeList.ts`: new entry `{ path: '/payment-methods', isMenuItem: true,
  permissions: accountSettingPermissions, idLang: 'global.navMenu.paymentMethods', ... }`.
- `routes/index.tsx`: lazy import + map entry.
- Availability gate applied in `getAllowedRoutesWithoutComponent` (routeList.ts),
  the same place permission filtering happens:
  `platform === 'bigcommerce' && window.BC_CONTEXT?.paymentMethods && !isAgenting`.
  This hides the menu item **and** bounces deep links through the router's normal
  disallowed-route handling.
- The page renders a "not available" state when the same conditions fail. Through
  normal routing that branch is unreachable (the route is filtered first); it
  exists as a defensive fallback because tests render the component directly and
  future routing changes must not silently expose a broken page.
- `index.d.ts`: extend the `BC_CONTEXT` type:

```ts
BC_CONTEXT?: {
  storeSuffix?: string;                                  // existing
  paymentMethods?: { apiBase: string; appClientId: string };
};
```

### Data layer (`api.ts`)

Every function: `getCurrentCustomerJWT(config.appClientId)` → `POST` → map
response. `getCurrentCustomerJWT` returning `undefined` (or API `401`) maps to a
`sessionExpired` error; `404` → `notFound`; `429` → `rateLimited`; `502`/network
→ `upstream`. Errors are a small discriminated union consumed by the page.

Two deliberate constraints:

- **Opaque errors.** API error bodies are never read, surfaced, or logged —
  error rendering is driven solely by the mapped error kind, preserving the
  backend's opaque `401`/`404` posture.
- **Misconfig diagnosability.** A wrong/stale `appClientId` (SSW app not
  installed, or `aud` mismatch rejected by the backend) collapses into the same
  `sessionExpired` UX as a genuinely expired session — and re-login can't fix
  it. To keep that debuggable, `api.ts` emits a `b2bLogger.error` with the
  disambiguating context on the jwt-undefined and `401` paths (no token values
  logged).
- **Intentional B3Request divergence.** Unlike `B3Request`'s 401-handling
  (which clears session state and logs the user out), a `401` here only renders
  the session-expired state — this is a third backend with its own auth, and a
  misconfigured `appClientId` must not log users out of the portal.

react-query wiring:

- `useQuery({ queryKey: ['storedInstruments', customerId], queryFn: listStoredInstruments, enabled: isAvailable })`
  — `customerId` from `company.customer.id`; `isAvailable` is the three-way gate.
- `useMutation(setDefaultStoredInstrument | deleteStoredInstrument)`
  - `onSuccess(refreshedList)` → `queryClient.setQueryData(['storedInstruments', customerId], refreshedList)`
  - `notFound` → invalidate `['storedInstruments', customerId]` (card deleted elsewhere; refetch truth)
- All row actions disabled while any mutation is pending (double-click guard).

## UI states

| State | Rendering |
|---|---|
| Loading | spinner (`B3Spin`) |
| List | rows with Default / Expired chips; Set-as-default hidden on the default card |
| Empty | "You have no saved cards. Cards can be saved during checkout." |
| Error (initial load) | error message + retry button |
| Session expired | "Your session has expired — please sign in again" |
| Unavailable | friendly "not available" — covers unconfigured host, non-Stencil platform, and agenting (defensive fallback; the route gate normally prevents reaching it) |

Delete flows through the shared `B3Dialog` with copy noting permanent removal
from the payment provider's vault and that the card will no longer be available
at checkout. Mutation errors surface as toasts
(`404` → "That card no longer exists" + refetch; `429` → "Too many requests —
try again in a minute"; `502`/network → generic failure).

Desktop and mobile use the portal's existing responsive patterns
(`useMobile`-style hooks); no separate mobile page. New i18n keys live under
`paymentMethods.*` plus the nav key.

## Testing

- **MSW handlers** for `/customer/current.jwt` and the three SSW endpoints
  (absolute URLs; import via `tests/test-utils`).
- **Builder** `buildStoredInstrumentWith` (faker-based) — no hardcoded data.
- `index.test.tsx` coverage: list renders with chips; set-default posts
  `{ jwt, token }` and re-renders from the returned refreshed list; delete shows
  the dialog, posts on confirm, card disappears; empty state; session-expired
  state; unconfigured state; agenting state (via `buildB2BFeaturesStateWith`);
  `404` during mutation triggers a refetch; pending-state disables actions.
- `index.platform.test.tsx`: non-Stencil platform renders the unavailable state
  (file-level `vi.mock` of `@/utils/basicConfig` with `platform: 'catalyst'`).

## Trust boundary

`window.BC_CONTEXT.paymentMethods` (`apiBase` **and** `appClientId`) is
host-controlled trusted input: the page POSTs a fresh, valid Current Customer
JWT to whatever `apiBase` the host supplies. The integrity of the storefront
host page is the assumed trust boundary — the same posture as the existing
`storeSuffix` (order-id obfuscation). A compromised/XSS'd host page can already
run arbitrary script, so no client-side allowlist is attempted; this is an
accepted, documented posture, not an oversight.

Instrument tokens and card metadata (brand/last4/expiry) must never be written
to `window.dataLayer`, console, or any analytics sink; react-query devtools are
not enabled in production builds.

## Dependencies & risks

1. **CORS (open dependency, blocks go-live).** The browser POSTs JSON from the
   storefront origin to `apiBase` — cross-origin with preflight. The YARP
   gateway / CustomerServices must answer `OPTIONS` and emit
   `Access-Control-Allow-Origin` for the storefront origin(s) on
   `/customers/Customer/*`, or every call fails before reaching the controller.
   Verify (and likely add) before the page can work.
2. **App client id correctness.** A JWT minted with the B2B Edition client id
   fails backend validation. The host must supply the SSW app's client id, and
   the SSW app must be installed on the store so `/customer/current.jwt`
   honors it. Both misconfig paths render as "session expired" to the user;
   the `b2bLogger.error` diagnostics in `api.ts` (see Data layer) are the
   disambiguation signal.
3. **Rate limit (20/60 s per IP) is shared** across list + mutations — and,
   B2B-relevantly, across every buyer behind one corporate NAT egress IP, with
   no per-customer fairness. Normal page usage is far below the bucket, but a
   busy shared office could starve legitimate users; per-customer keying is a
   backend improvement to raise with that team. No retry storms from our side:
   the app-wide `QueryClient` (`react-setup.tsx`) sets `retry: false`, which
   the list query inherits, and mutations never auto-retry. Note
   `/customer/current.jwt` is a second BigCommerce-throttled dependency —
   bounded by react-query's single-flight query and by row actions being
   disabled while a mutation is pending.
4. **JWT replay (residual, accepted).** The Current Customer JWT is a bearer
   credential sent in the request body, validated per-call with no
   jti/nonce/single-use check and a 5 s clock skew on the backend — a captured
   token is replayable for roughly TTL + 5 s (~20 s). Mitigated by TLS and the
   short TTL; documented here so it isn't rediscovered as a surprise.

## Rollout

1. Backend/gateway team confirms CORS for `/customers/Customer/*` (Risk 1).
2. Host project sets `BC_CONTEXT.paymentMethods = { apiBase, appClientId }` for
   StoreSupply (same delivery as `storeSuffix`).
3. Staging smoke test: JWT accepted (aud = `StoreSecrets.ClientId`), list
   renders, set-default and delete round-trip, deleted card is gone from the
   gateway vault.
4. Additional stores later: backend `StoreSecrets`/`Sites` config + host-page
   `BC_CONTEXT` values only; zero portal code change.
