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
- Feature is **host-gated**: it only appears when the host page provides
  configuration via `window.BC_CONTEXT.paymentMethods`.
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
| File placement | Everything inside `src/pages/PaymentMethods/` (matroska) — page-specific business logic does not go in `src/shared/`. |

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
│   ├── PaymentMethodRow.tsx        # brand, ••••last4, expiry, chips, actions
│   └── DeleteConfirmDialog.tsx
├── index.test.tsx
└── (builders/handlers in test files per tests/ conventions)
```

### Routing & gating

- `routeList.ts`: new entry `{ path: '/payment-methods', isMenuItem: true,
  permissions: accountSettingPermissions, idLang: 'global.navMenu.paymentMethods', ... }`.
- `routes/index.tsx`: lazy import + map entry.
- Menu visibility additionally requires `window.BC_CONTEXT?.paymentMethods` to be
  present — gate applied in `getAllowedRoutesWithoutComponent` (routeList.ts),
  the same place permission filtering happens. A deep link to an unconfigured
  page renders a "not available" state instead of the list.
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

react-query wiring:

- `useQuery({ queryKey: ['storedInstruments'], queryFn: listStoredInstruments })`
- `useMutation(setDefaultStoredInstrument | deleteStoredInstrument)`
  - `onSuccess(refreshedList)` → `queryClient.setQueryData(['storedInstruments'], refreshedList)`
  - `notFound` → invalidate `['storedInstruments']` (card deleted elsewhere; refetch truth)
- All row actions disabled while any mutation is pending (double-click guard).

## UI states

| State | Rendering |
|---|---|
| Loading | skeleton |
| List | rows with Default / Expired chips; Set-as-default hidden on the default card |
| Empty | "You have no saved cards. Cards can be saved during checkout." |
| Error (initial load) | error message + retry button |
| Session expired | "Your session has expired — please sign in again" |
| Unconfigured | friendly "not available" (deep-link only; menu item already hidden) |

Delete flows through `DeleteConfirmDialog` with copy noting permanent removal
from the payment provider's vault. Mutation errors surface as toasts
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
  state; unconfigured state; `404` during mutation triggers a refetch;
  pending-state disables actions.

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
   honors it.
3. **Rate limit (20/60 s per IP) is shared** across list + mutations; normal
   page usage is far below it, but retry storms must not loop (no automatic
   retries on mutations; query retry left at react-query defaults for the list).

## Rollout

1. Backend/gateway team confirms CORS for `/customers/Customer/*` (Risk 1).
2. Host project sets `BC_CONTEXT.paymentMethods = { apiBase, appClientId }` for
   StoreSupply (same delivery as `storeSuffix`).
3. Staging smoke test: JWT accepted (aud = `StoreSecrets.ClientId`), list
   renders, set-default and delete round-trip, deleted card is gone from the
   gateway vault.
4. Additional stores later: backend `StoreSecrets`/`Sites` config + host-page
   `BC_CONTEXT` values only; zero portal code change.
