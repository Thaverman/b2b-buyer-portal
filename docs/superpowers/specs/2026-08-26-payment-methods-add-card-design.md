# Payment Methods: Add-a-saved-card (Braintree Drop-in) — Design

- **Date:** 2026-08-26
- **Status:** Approved (brainstormed + spiked with THaverman)
- **Page:** `apps/storefront/src/pages/PaymentMethods/`
- **Backend:** already built, tested, merged (.NET microservices behind the YARP gateway). This work is frontend-only, against the fixed HTTP contract below. No mocked backends outside tests.

## 1. Context & goal

The account section already lists, sets-default, and deletes saved cards via
`POST {apiBase}/customers/Customer/*`. This feature adds:

1. An **"Add card" flow** using Braintree's JS SDK (Drop-in UI v3), vaulting into Braintree.
2. **Source-aware plumbing** for the list, which now merges two vaults (BigCommerce +
   Braintree), each card tagged `Source`. Customers must NOT need to care which vault a
   card lives in — no visible source indicator in v1.

Only stores with a Braintree merchant account support adding cards (StoreSupply,
LoveGroomers, DealerSupply, SimpleRetail). On **Preferred**, `VaultClientToken` /
`VaultInstrument` return 502 — the Add-card affordance must not render there.
Listing/deleting existing BigCommerce cards keeps working everywhere.

Out of scope: any charging/checkout flow, Catalyst/headless support (existing
Stencil-only gate stands), masquerade changes (existing hide-while-agenting stands),
theme/`BC_CONTEXT` changes.

## 2. Existing state (what we build on)

- `api.ts` — fetches a fresh Current Customer JWT per call via
  `getCurrentCustomerJWT(config.appClientId)` (JWT lives ~15s), POSTs JSON to
  `${config.apiBase}/customers/Customer/{action}`. Config comes from
  `window.BC_CONTEXT.paymentMethods` (`apiBase`, `appClientId`) — theme-set; there is no
  client id or base URL to hardcode.
- `normalize()` — casing-tolerant (.NET PascalCase / camelCase) mapper to a camelCase DTO.
- `PaymentMethodsError` kinds: `sessionExpired | notFound | rateLimited | upstream`.
- `index.tsx` — `useQuery(['storedInstruments', customerId])` + two `useMutation`s;
  set-default/delete already re-render from the refreshed list the backend returns
  (`queryClient.setQueryData`).
- Gating: Stencil-only + config present + not agenting (`isPaymentMethodsAvailable()`,
  mirrored in `routeList.ts`).

## 3. HTTP contract (fixed, backend merged)

All actions are POST, `Content-Type: application/json`. **Request fields PascalCase**
(`Jwt`, `Token`, `Nonce`, `DeviceData`). Card DTOs in responses are PascalCase; the three
inline wrappers are camelCase exactly as shown (`clientToken`, `error`, `declineReason`).

| # | Action | Body | 200 | Errors |
|---|---|---|---|---|
| 1 | `VaultClientToken` | `{Jwt}` | `{clientToken}` | 400 `missing_jwt`, 401 `invalid_token`, 502 `upstream_unavailable` |
| 2 | `VaultInstrument` | `{Jwt, Nonce, DeviceData?}` | single Card, `Source=="braintree"` | 400 `missing_jwt\|missing_nonce`, 401, **422 `{declineReason}`** (card declined — show reason), 502 (transient — NOT a decline), **429 (rate limit: 5/min/IP)** |
| 3 | `StoredInstruments` | `{Jwt}` | `{CustomerId, Instruments[]}` (merged, both vaults) | |
| 4 | `GetStoredInstrument` | `{Jwt, Token}` | Card | 404 `instrument_not_found` |
| 5 | `SetDefaultStoredInstrument` | `{Jwt, Token}` | refreshed `{CustomerId, Instruments}` | 404 |
| 6 | `DeleteStoredInstrument` | `{Jwt, Token}` | refreshed list | 404 |

Card shape: `Token` (opaque stable key, never displayed), `Last4`, `Brand` (may be `""`),
`ExpiryMonth`/`ExpiryYear` (int, 0 if unknown), `Type`, `IsDefault` (exactly one across
both vaults; backend auto-defaults a customer's first card), `Source`
(`"bigcommerce" | "braintree"`). `Source` is never sent in requests — the backend
resolves tokens across vaults.

**Critical distinction:** 422 = the card was declined/failed verification → show
`declineReason`, let the user try another card. 502/429 = our problem / slow down → never
imply the card was bad.

## 4. Spike findings (2026-08-26) — the load-bearing constraint

Question: does Braintree Drop-in work when its container lives in the ThemeFrame iframe
(where the portal DOM renders via `createPortal`) but the SDK runs in the parent JS realm
(where the bundle executes)?

Method: throwaway harness replicating ThemeFrame exactly (srcdoc iframe, same default
content, container created in the iframe document), Drop-in 1.44.1, real client token
from the SSW sandbox Braintree merchant, headless Chromium.

| SDK realm | Result |
|---|---|
| Parent window (bundle's normal realm) | `dropin.create()` **hangs forever** — no error, no callback. Hosted-field frames postMessage to *their* parent window (the theme frame); the SDK's framebus listens on the top window. Silent deadlock. |
| Injected into the ThemeFrame iframe (Captcha-style) | **Works end-to-end**: Drop-in rendered in the theme frame, hosted fields accepted input with live brand detection, `requestPaymentMethod()` returned a real sandbox nonce (CreditCard/Visa/1111). |

Consequences baked into this design:

- The SDK **must execute in the iframe realm** → load the script into
  `iframeDocument.head`; **cannot be an npm dependency** (bundled code runs in the parent
  realm). Version pinned in a constant CDN URL:
  `https://js.braintreegateway.com/web/dropin/1.44.1/js/dropin.min.js`.
- No postMessage bridge needed (unlike Captcha): the frames are same-origin, so parent
  React code calls `iframeDocument.defaultView.braintree.dropin.create(...)` directly and
  holds the instance.
- Auth failures and realm failures are indistinguishable through Drop-in's generic
  create error ("There was an error creating Drop-in.") — remember when debugging.
- `deviceData` requires `dataCollector: true` in `dropin.create` options; it then appears
  on the `requestPaymentMethod` payload (verified against current Braintree docs; confirm
  live during implementation).

## 5. Design

### 5.1 API layer (`api.ts`)

Split transport from response shaping (today `post()` hardcodes normalize-to-list; the
new endpoints return `{clientToken}` and a single Card).

- `getVaultClientToken(): Promise<string>` — POST `VaultClientToken` → `clientToken`.
- `vaultInstrument({ nonce, deviceData? }): Promise<StoredInstrument>` — POST
  `VaultInstrument`; omit `DeviceData` from the body when absent (collection failure must
  not block vaulting).
- New `PaymentMethodsError` kind **`declined`** carrying `declineReason` (from the 422
  body). Vault-endpoint status mapping: 401 → `sessionExpired`, 422 → `declined`,
  429 → `rateLimited`, 400/502/network → `upstream`. Existing kinds/mappings unchanged.
- **Request casing unified to PascalCase** across the file (`Jwt`, `Token`, `Nonce`,
  `DeviceData`) per the declared contract. The existing camelCase requests only work
  because ASP.NET deserializes case-insensitively; one consistent casing per contract.
- DTO gains `source` (normalize accepts `Source`/`source`); the single-card normalizer is
  shared with `VaultInstrument`'s response. No UI reads `source` in v1.
- Never log the nonce.

### 5.2 Brand gating: probe, not theme flag

A second query on page load, alongside the list:
`useQuery(['vaultClientToken', customerId], getVaultClientToken, { enabled: isAvailable })`.

- Error after default retries (Preferred's permanent 502) → the Add-card button does not
  render; the page is exactly today's page. Fail-closed, zero theme changes, immune to
  prod's lagging theme.
- Success → client token cached (Braintree client tokens live ~24h, far beyond a page
  session) and warm when the user clicks Add. `VaultInstrument` still fetches its own
  fresh JWT at submit time.

### 5.3 Add-card UI (`components/AddPaymentMethod.tsx` + `dropin.ts`)

"Add card" button above the list, expanding an **inline section** (not a dialog — avoids
modal-teardown/z-index interplay with Drop-in's own iframes) containing the Drop-in
container plus Save/Cancel.

`dropin.ts` (page-local module): idempotent Captcha-style script injection into
`iframeDocument.head` (pinned URL above), then
`iframeDocument.defaultView.braintree.dropin.create({ authorization, container, dataCollector: true })`
where `container` is the React-rendered div (physically in the iframe document;
`themeFrameSelector` provides the document). Returns the instance. `teardown()` on
cancel/unmount.

Submit: disable button (also covers the 5/min double-submit risk) →
`requestPaymentMethod()` → `vaultInstrument({ nonce, deviceData })` mutation → success:
invalidate `['storedInstruments', customerId]`, collapse section, success snackbar.
Drop-in shows its own inline field-validation UI; a rejected `requestPaymentMethod` just
re-enables the button.

Error UX — inline `Alert`s inside the open section:

| Kind | Message | Form |
|---|---|---|
| `declined` (422) | the backend's `declineReason`; invite trying another card | stays open, fields editable |
| `rateLimited` (429) | "too many attempts — wait a minute" | stays open |
| `upstream` (502/network) | generic our-side "try again" — never implies the card was bad | stays open |
| `sessionExpired` (401) | existing session-expired treatment | — |

### 5.4 List updates

Rows untouched — both vaults render identically; delete-dialog copy ("your payment
provider") already reads correctly for either vault. Set-default/delete keep re-rendering
from the backend's refreshed merged list. One copy branch: when adding is available, the
empty state becomes "Add your first card and it will become your default" (reflecting the
backend's auto-default); on Preferred the existing checkout-oriented copy stays.

### 5.5 i18n

New `paymentMethods.addCard.*` keys in `src/lib/lang/locales/en.json`: button, section
title, save/cancel, declined/rate-limited/upstream alerts, success toast, empty-state
variant.

### 5.6 Testing

- `api.test.ts` (MSW): client token 200/502; vault 200 (PascalCase single card) /
  422-with-`declineReason` / 429 / 502; `Source` normalization; `DeviceData` omitted from
  the body when absent; PascalCase request bodies asserted.
- `index.test.tsx`: `vi.mock` `dropin.ts` with a fake instance
  (`requestPaymentMethod`, `teardown`) — jsdom cannot run real Drop-in. Covers: button
  hidden on probe failure; happy path through refreshed list; decline shows reason and
  keeps the form open; 429 vs 502 messaging distinct; teardown on cancel.
- `dropin.ts` gets Captcha-style script-injection tests (fresh JSDOM instance).
- Repo TDD workflow; every new test gets a revert-and-rerun negative control (prior
  sessions produced vacuous tests without it).

## 6. Implementation-time checkpoints

- Verify `dataCollector: true` yields `deviceData` against the real sandbox merchant.
- Confirm the vault endpoints accept the theme's existing
  `BC_CONTEXT.paymentMethods.appClientId` (same JWT mechanism as the list endpoints).
- Drop-in version bumps = one constant in `dropin.ts`.
