# Payment Methods: Add-a-saved-card via BigCommerce Hosted Form — Design

- **Date:** 2026-09-01
- **Status:** Approved (brainstormed + spiked with THaverman)
- **SUPERSEDES:** `2026-08-26-payment-methods-add-card-design.md` (Braintree Drop-in / nonce
  design). The backend replaced that contract; this spec replaces that design **and** the
  raw-card custom-form contract that replaced it. Any reference to `VaultClientToken`,
  `VaultInstrument`, `Nonce`, `DeviceData`, Drop-in/Hosted Fields (Braintree's), a
  two-vault merged list, or a custom-built card form is stale.
- **Page:** `apps/storefront/src/pages/PaymentMethods/`

## 1. Decision summary

Add-card runs **in-portal through BigCommerce's stored-card hosted form**
(`createStoredCardHostedFormService` from `@bigcommerce/checkout-sdk`): card fields render
as **BigCommerce-hosted iframes**, the PAN/CVV never enter merchant-origin DOM, and the
attach posts from inside BigCommerce's iframe to BigPay. **No new PCI scope** (provider
iframes preserve the SAQ A posture), best-available customer UX (no context switch), and
zero card-handling code owned by us.

**Fallback (Option A):** when the vault token cannot be obtained but the store supports
vaulting-through-the-native-page, the Add-card affordance becomes a `target="_top"` link
to the native page `account.php?action=add_payment_method&provider=braintree&method_type=CARD`.
When the store has no configured gateway (Preferred), the affordance does not render at all.

Billing address on the attach is **prefilled from the customer's BigCommerce address book,
fields editable** (user decision 2026-09-01).

## 2. Spike evidence (2026-09-01, sandbox, throwaway harness)

Everything below was verified live against `sandbox.storesupply.com` with a real customer
session; a `VISA ····1111 12/2030` was attached end-to-end and then deleted via our own
`DeleteStoredInstrument`:

1. **Realms invert the Braintree finding.** `service.initialize()` mounts hosted-field
   iframes when the SDK runs in the **parent (top) realm with containers in the parent
   document**; run inside the ThemeFrame realm it deadlocks (framebus-style handshake
   never completes). Production consequence: the card-entry UI must live in **parent-DOM**,
   not inside the ThemeFrame — see §5.2.
2. **Field iframes are provider-delivered**: `https://payments.bigcommerce.com/pay/hosted_forms/{id}/field`.
   Brand detection, PAN formatting, and per-field validation events all work; Playwright
   filled and submitted them.
3. **Token flavor is VAT, not IAT.** All three hosted-form bundles in the current
   checkout-sdk (v1 loader, `hosted-form`, `hosted-form-v2-*`) post **only** to the legacy
   endpoint `POST {paymentsUrl}/stores/{hash}/customers/{shopperId}/stored_instruments`
   with `Authorization: <vaultToken>` verbatim. Our backend's `VaultInstrumentToken` IAT
   gets a clean **401** there (verified). There is **no IAT code path in checkout-sdk
   today** — the IAT only fits the raw-card custom-form contract we are not building.
4. **The VAT is obtainable client-side**: the storefront server renders it (with
   `shopperId`) into the native add-payment-method page context; a **same-origin,
   session-authenticated `fetch`** of that page retrieves it. TTL observed: **30 minutes**
   (`exp - nbf`). The Cloudflare bot check on that URL challenges document navigations,
   not XHR — fetches returned 200 consistently.
5. **Exact call contract** (reverse-engineered from the iframe-side handler, then proven):
   - `submitStoredCard(fields, data)` where **`fields` is FLAT**:
     `{ defaultInstrument: boolean, email, address1, address2?, city, postalCode,
     countryCode, company?, firstName, lastName, phone?, stateOrProvinceCode? }`
     (everything except `defaultInstrument` becomes `billing_address`).
   - `data`: `{ currencyCode: 'USD', paymentsUrl: 'https://payments.bigcommerce.com',
     providerId: 'braintree', shopperId: '<string>', storeHash, vaultToken }`.
   - Resolves with **no body** on success → always re-fetch `StoredInstruments` and
     render from that.
6. **Failures carry no detail.** The iframe posts `STORED_CARD_FAILED` with **no payload**
   — a decline is indistinguishable from a system error. §7 designs the copy around this;
   the earlier decline-reason requirement is **superseded** (the native page has the same
   limitation).
7. **Preferred self-gates**: no configured gateway → the scraped page carries no
   `vaultToken` → the affordance never renders. No theme flag, no probe endpoint.
8. Incidental but important: **the native add page on this theme is a raw-card
   merchant-DOM form** (theme JS parses the PAN and posts it). The store's *current* PCI
   posture already includes a merchant-origin card form. Relay to the compliance owner;
   this design improves the posture for portal users and never routes to that form except
   in the explicit fallback.

## 3. What already exists / stays

- `api.ts` list/set-default/delete over `POST {apiBase}/customers/Customer/*` with fresh
  Current Customer JWT per call, PascalCase bodies (`Jwt`, `Token`) — unchanged.
- Casing-tolerant `normalize()`/`normalizeInstrument()` with `source` on the DTO
  (`"bigcommerce"` for everything now; no UI reads it) — unchanged.
- Config from `window.BC_CONTEXT.paymentMethods` (`apiBase`, `appClientId`); Stencil-only
  + not-agenting gates — unchanged.
- Set-default/delete re-render from the refreshed list the backend returns — unchanged.

## 4. What gets REMOVED (the merged Braintree implementation on dev)

Removed forward (removal commits on dev; nothing was pushed, but forward removal is safe
regardless of other local consumers): `dropin.ts` + `dropin.test.ts`;
`getVaultClientToken` / `vaultInstrument` / the `declined` error kind and `declineReason`
in `api.ts` (+ their tests); the `['vaultClientToken']` probe query; the Drop-in guts of
`AddPaymentMethod` and its tests; the `paymentMethods.addCard.*` keys that no longer fit.
`PaymentMethodsError` reverts to `sessionExpired | notFound | rateLimited | upstream`.

Notify backend: **`VaultInstrumentToken` has no frontend consumer** under this design
(checkout-sdk cannot use an IAT). Their endpoint stays for a future raw-form or a future
SDK that accepts IATs; nothing here calls it.

## 5. Design

### 5.1 Vault access module (`vaultAccess.ts`, page-local)

One function behind `useQuery`:

```
getVaultAccess(): Promise<
  | { state: 'available'; vaultToken: string; shopperId: string; fetchedAt: number }
  | { state: 'unavailable' }          // page 200 but no vaultToken → no gateway (Preferred) → hide Add
>
// throws PaymentMethodsError('upstream') on network failure / non-200 / challenge page
// → Add renders as the native-page link-out (fallback A)
```

Implementation: same-origin `fetch('/account.php?action=add_payment_method&provider=braintree&method_type=CARD',
{ credentials: 'include' })`, regex the escaped page context for
`vaultToken: "VAT …"` (charset `[A-Za-z0-9._-]`, beware the JSON `\"` escaping — a naive
`[^"]+` captures a trailing backslash and poisons the Authorization header) and
`shopperId`. Never log the token. Query: `['vaultAccess', customerId]`, fetched at page
load for gating; **refetched when the dialog opens** (30-min TTL makes page-load tokens
stale for long sessions; treat mint+attach as one continuous action).

### 5.2 Card dialog (`components/AddPaymentMethodDialog.tsx`, parent-DOM)

Because the SDK only works parent-realm/parent-DOM (§2.1) and the portal renders inside
the ThemeFrame, the dialog escapes the frame:

- `createPortal(<dialog>, document.body)` from within the page component — the bundle's
  JS already runs in the parent realm, so this is a plain portal, no messaging.
- **Own emotion cache**: the app's `CacheProvider` targets the iframe head, so styles for
  parent-DOM content would land in the wrong document. Wrap the portaled subtree in
  `CacheProvider(createCache({ key: 'bpm-add-card', container: document.head }))`.
  (Precedent for parent-DOM UI: `B3MasqueradeGlobalTip`, `B3HoverButton` — those sit
  outside `ThemeFrame` in `App.tsx`; ours must be page-local, hence the portal + cache.)
- Content: four hosted-field containers (number / expiry / name / CVV) + editable
  billing-address fields (§5.4) + Save/Cancel. Containers are plain divs we style;
  the inputs inside are BigCommerce's iframes.

### 5.3 Hosted-form module (`hostedForm.ts`, page-local)

Wraps checkout-sdk so component tests can mock one seam:

```
createStoredCardForm(containers: {number, expiry, name, cvv}: containerIds)
  → Promise<{ submit(fields: FlatFields, data: SubmitData): Promise<void>; teardown(): void }>
```

- Dependency: `@bigcommerce/checkout-sdk` (npm, **pinned exact version**), loaded via
  dynamic `import()` so it stays out of the main bundle (~1.4 MB). Implementation-time
  checkpoint: confirm the npm build behaves like the CDN loader build the spike used; if
  bundling fights us, fall back to injecting the CDN loader **into the parent document**
  and pin `?version=` — the realm requirements are the same either way.
- `deinitialize()` on dialog close/unmount.

### 5.4 Billing address prefill (editable)

- Source: `getBCCustomerAddress()` (B2B GraphQL `customerAddresses`, already used by
  AddressList) — pick the first address (or the customer's only one); fields land in
  editable MUI inputs: first/last name, company, address1/2, city, state, postal code,
  country, phone. Email prefills from Redux `company.customer.emailAddress`.
- **State code mapping**: the hosted form wants `stateOrProvinceCode` (e.g. `MO`);
  `customerAddresses` returns the display name (`Missouri`). Map via the portal's
  existing country/state data (the AddressList edit form already does this lookup —
  reuse that utility; implementation-time checkpoint to name it).
- No addresses / fetch failure → fields start empty; prefill is a convenience, never a
  blocker. Address-book fetch failures are silent (form still usable).
- Required before submit: firstName, lastName, address1, city, postalCode, countryCode,
  email (mirrors what the attach body sends unconditionally). Validate inline before
  calling `submit`.

### 5.5 The flow

1. Page load: list query (unchanged) + `['vaultAccess', customerId]` query.
   - `available` → "Add card" button renders (opens dialog).
   - `unavailable` → no affordance (Preferred); empty-state keeps today's copy.
   - error → "Add card" renders as `target="_top"` anchor to the native add page.
2. Open dialog → refetch vaultAccess (fresh VAT) + `createStoredCardForm` + address
   prefill, in parallel. Save disabled until hosted form is ready.
3. Save → validate billing fields → disable Save →
   `submit({ defaultInstrument: false, ...billing }, { currencyCode: 'USD', paymentsUrl,
   providerId: 'braintree', shopperId, storeHash, vaultToken })`.
4. Success → close dialog, `invalidateQueries(['storedInstruments', customerId])`,
   success snackbar. First-card auto-default comes back in the refreshed list (BigPay
   behavior) — never set client-side.
5. Failure → inline alert (§7), form stays open, fields intact.

### 5.6 Portal takeover carve-out (`shared/routes` / `routeList`)

The portal hijacks every hash-less `account.php` URL into `#/orders`
(`shared/routes/index.tsx` — `pathname.includes('account.php')` ignores the query
string). The fallback link (and users landing on the native pages) need a carve-out:
skip the takeover when `window.location.search` contains `action=payment_methods` or
`action=add_payment_method`. Small, tested, and it also stops the portal fighting the
native page during the fallback.

## 6. Gating summary

| Store state | vaultAccess result | Affordance |
|---|---|---|
| Braintree gateway configured (SSW, LG, DS, SR) | `available` | In-portal dialog |
| No gateway (Preferred) | `unavailable` | Hidden entirely |
| Scrape broken (CF, theme change, outage) | error | Link-out to native page (`target="_top"`) |

Plus the existing gates: Stencil-only, `BC_CONTEXT.paymentMethods` present, not agenting.

## 7. Error UX

The SDK reports failure with no detail (§2.6), so decline and system error share one
honest message: **"We couldn't save this card. Check the card details and billing address,
or try a different card."** — inline alert, dialog stays open, fields intact. No wording
that asserts whose fault it was. Session-expired from the *list* endpoints keeps its
existing treatment; a vaultAccess refetch failure at submit time shows the same generic
alert with the link-out offered underneath ("or add it on the payment methods page").
Client-side guards that still work: hosted-field validation renders per-field messages via
the SDK's events before submit ever fires; billing-field validation is ours.

## 8. i18n

Rework `paymentMethods.addCard.*`: keep `button`, `save`, `cancel`, `success`,
`emptyList`; drop `declined*`, `rateLimited` (no longer reachable from this flow); add
dialog title, billing-section labels, the generic failure copy, and the link-out label.
Exact keys enumerated in the implementation plan.

## 9. Testing

- `vaultAccess.test.ts` (MSW): token+shopperId extracted from escaped page context
  (fixture built from the real page's structure — including the `\"` escaping that bit
  the spike); 200-without-token → `unavailable`; network error / challenge-shaped 200
  without context → throws upstream.
- `index.test.tsx`: gating trio (dialog mode / hidden / link-out with `target="_top"`);
  dialog open → `hostedForm.ts` mock created with container ids + fresh token; prefill
  populates editable fields from mocked `customerAddresses` (+ state-name→code case);
  save happy path → submit args (flat fields incl. `defaultInstrument: false`,
  data incl. `providerId: 'braintree'`, string `shopperId`) → list invalidated → dialog
  closed → snackbar; failure → generic alert, dialog open; billing validation blocks
  submit; teardown on cancel.
- `hostedForm.ts`: thin — unit-test only what jsdom can see (dynamic import mocked;
  option pass-through, teardown). The real SDK cannot run in jsdom.
- Route carve-out test alongside existing routeList tests.
- Repo TDD; every new test needs its red run (or a revert-and-rerun negative control for
  omission tests).

## 10. Out of scope / notes

- No checkout changes; no Catalyst/headless; no masquerade changes; no visible
  vault-source UI; no charging flows.
- Backend note (§4): `VaultInstrumentToken` unconsumed; the IAT/raw-attach contract is
  parked, not wired.
- Compliance note to relay (§2.8): the native theme add page is raw-card merchant-DOM
  today, independent of this work.
- The VAT-scrape dependency is the design's known soft spot. It is the same token, same
  origin, same session the native page uses; if BigCommerce ever changes the page
  context, the failure mode is the built-in link-out, not a broken page. If checkout-sdk
  later accepts IATs, swap §5.1 to call `VaultInstrumentToken` and delete the scrape —
  that is the module's whole reason for existing as a seam.

## 11. Implementation-time checkpoints

- Pin `@bigcommerce/checkout-sdk`; verify the npm build initializes hosted fields
  identically to the CDN loader (spike used the loader). Confirm the exact exported
  TypeScript types for the flat fields/data shapes and use them.
- Name and reuse the existing state-name→code utility (AddressList edit form has one).
- Confirm `providerId: 'braintree'` (not `braintree.credit_card`) — the spike's 201 used
  `braintree`; the 401s prevented earlier discrimination between the two.
- Verify dialog focus management and scroll containment given the parent-DOM portal
  (the page behind it lives in an iframe; MUI's Dialog focus trap operates on the parent
  document — sanity-check tab order).
- Live sandbox pass mirrors the spike: add (list refreshes, correct default), failure
  path with an invalid expiry (SDK field validation), delete the test card after.
