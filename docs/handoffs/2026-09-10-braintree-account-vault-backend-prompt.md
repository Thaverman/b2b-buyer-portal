# Backend hand-off prompt — Braintree account-page card vaulting (`VaultBraintreeInstrument`)

- **Date:** 2026-09-10
- **Target repo:** `Ssw.MicroServices` (`Ssw.MicroServices.CustomerServices` +
  `Ssw.MicroServices.OrderServices`)
- **Requested by:** the buyer-portal side. Frontend design spec:
  `b2b-buyer-portal/docs/superpowers/specs/2026-09-10-payment-methods-braintree-parallel-page-design.md`
- **Status:** not started. **Read §0 first — there is a go/no-go gate ahead of any code.**

This document is written to be pasted into a fresh backend session. It assumes no context.

## 0. Go/no-go gate — sandbox PASSED, production still unverified

**The whole feature is void if BigCommerce's configured `braintree` gateway is a different
Braintree merchant than the one `GuestVault:Braintree` holds credentials for.**

Why it is fatal: this feature vaults a card into *our* Braintree merchant and then registers
that token against the BigCommerce customer via BC's import endpoint. BigCommerce does not
validate imported instruments ("if you post incorrect data, the instrument will not work for
payment"). So if the merchants differ, the customer sees a saved card that fails at checkout.
That is strictly worse than shipping nothing.

### SANDBOX GATE: PASSED (verified 2026-09-10) — you may build against Testing

Verified live, read-only, signed in with a cart, no order placed.
`GET /api/storefront/payments/braintree` on `sandbox.storesupply.com` returns a Braintree
`clientToken` that decodes to:

- `merchantId` = **`7p3bsm9pq3dccypd`**
- `environment` = `sandbox`
- `merchantAccountId` = **`storesupplywarehouse`**

That merchant id is the same one `GuestVault:Braintree` uses in Testing, and that merchant
account name is exactly `GuestVault:MerchantAccounts:StoreSupply` for sandbox. So on Testing,
we vault into the same merchant **and** verify against the same merchant account that
BigCommerce settles through. Import-then-charge is viable.

**Production is NOT verified.** Both production blocks are `x876bp8kkc6bdwzx` and nobody has
checked production's BigCommerce gateway. Run the same one-line GET against the production
storefront, signed in with a cart, before go-live. Sandbox passing does not license a
production release, and if production differs the feature must stay flag-off there.

The reusable technique is worth keeping: this is answerable with a single authenticated
storefront GET per store and environment, not a checkout scrape.

Consequence for the "no Braintree-side tokens" claim below: it is now weakly supported, since
BigCommerce mints its card nonces on `7p3bsm9pq3dccypd` and such a nonce can only vault into
that merchant's vault. Treat Braintree-side records as likely but unproven; §4 step 1 settles
it empirically on the first customer with order history.

Related, also unresolved: whether BC-saved cards exist as Braintree Customer/PaymentMethod
records at all. A 2026-07-16 checkout spec claims they do not ("merchant-confirmed"), but that
claim is single-source, reversed the previous day's opposite assertion, and names no merchant,
environment or order inspected. BC's own docs read the other way (single DELETE "removes the
instrument from our system **and the payment gateway's vault**"). This feature does not depend
on settling it: identity discovery (§4) benefits if such records exist and degrades cleanly if
they do not.

## 1. What is being built, in one paragraph

The buyer portal is adding a second, flag-gated add-card page that uses **Braintree Drop-in**
instead of BigCommerce's stored-card hosted form. Reason: BC's hosted form is checkout
infrastructure and returns a blank 200 unless the session has an active cart, so empty-cart
customers cannot add a card from the account page at all today. Braintree's SDK has no cart
dependency. The browser tokenizes the card against Braintree and sends us a **nonce**; we vault
it and then import the resulting token into BigCommerce so BC stays the single source of truth
for the customer's card list.

We never receive a PAN or CVV. What arrives is a single-use nonce with a 3-hour lifetime.

## 2. What already exists and gets reused

| Thing | Where | Note |
| --- | --- | --- |
| Current Customer JWT validation | `CustomerServices/Security/CurrentCustomerJwtValidator.cs` | HS512; store resolved by `(aud, store_hash)`; yields `CustomerId`, `Email`, `StoreHash`, `StoreName`. **JWT TTL is 15 minutes**, not the ~15s some notes claim, and there is no `jti`. |
| Stored-instrument list / delete / set-default | `CustomerServices/Services/StoredInstrumentService.cs` | Pure BC proxies. Leave them alone. Set-default is a PUT on the **collection** with `is_default`, not `/{token}` with `make_default`; the BC docs guide is wrong about this and the real store 404s. |
| BC stored-instrument **import** request model | `OrderServices/Models/DataServiceModels/BigCommerceStoreInstrument.cs` | Already models `vault_token`, `provider_customer_id`, `payment_method_id`, `customer_id`, `default_instrument`, `billing_address`, `instrument{type, brand, expiry_*, last_4, iin}`. |
| BC import call | `OrderServices/Repositories/DataServices/BigCommercePaymentInstrumentDataService.BulkStoredInstruments` | Already POSTs `v3/payments/stored-instruments`. Today reachable only from migration services, with no `[Authorize]` and no customer scoping. Do not expose it as-is. |
| Braintree gateway construction, per-brand merchant accounts | `OrderServices/Services/Payments/BraintreeGuestVaultGateway.cs`, `GuestVault:MerchantAccounts:{site}` | `storesupplywarehouse_instant` etc. in prod; **no Preferred entry**. |
| Internal business service `txndetails` | `OrderServices` → IBS `api/payment/txndetails`; `TransactionDetailsResponse.cs:23` | Already returns and deserializes `CustomerDetails.Id`, the Braintree customer id BigCommerce used, and already throws it away. This is the basis of identity discovery in §4. |
| IP rate limiting | `CustomerServices/Filters/IpRateLimitAttribute.cs` | 20/60s. Needs `UseForwardedHeaders`. Not sufficient alone here; see §6. |
| The deleted account-vault bridge | `git show 9bca57ca^:<path>` | Read it for shape, **not** for correctness. Its identity handling has a real ownership bug; see §4 and §7. |

Braintree .NET SDK is pinned at **5.27.0** (`OrderServices.csproj:9`). That matters: the
per-customer duplicate guard `FailOnDuplicatePaymentMethodForCustomer` (error 81763) does not
exist until 5.28.0.

## 3. Endpoints to build

### 3.1 Service split — this is a decision, not a preference

**CustomerServices must hold no Braintree credentials and take no Braintree dependency.** It
calls an internal-only OrderServices endpoint over the same hop the deleted bridge used
(`OrderServicesVaultClient` → `Internal/CustomerVault/*`).

The reason is PCI scope. OrderServices already holds Braintree merchant credentials and
already vaults and charges with them, so it is already a system component that can affect the
cardholder data environment. Putting the SDK and keys into CustomerServices would pull a
second, internet-facing, JWT-handling service into that same scope for no functional gain.

| Owner | Responsibility |
| --- | --- |
| **CustomerServices** (public, gateway-routed) | JWT validation, request shape, rate limits, error mapping, and the re-list that returns the refreshed card list. |
| **OrderServices** (internal only, **not** gateway-routed) | One atomic unit: resolve the Braintree customer, `PaymentMethod.Create`, BC import, and the compensating delete on import failure. |

Compensation has to sit next to the Braintree call, so never split those across services.

Note on a past criticism: the old bridge made `SetDefaultStoredInstrument` return 502 whenever
OrderServices was unreachable, because it made an OrderServices write authoritative for a
BigCommerce-only operation. Do not repeat that. List, delete and set-default stay pure BC
proxies; only the new vault action uses the hop, so an OrderServices outage degrades one
button rather than the page.

### 3.2 `POST /customers/Customer/BraintreeClientToken`

Body `{ "Jwt": "..." }`. Response `200 { "clientToken": "..." }` (camelCase wrapper, matching
the old `VaultClientToken`).

**Mint the token without a customer id.** A customer-scoped client token would let Drop-in
enumerate and delete that shopper's Braintree-side cards through `vaultManager`, and would make
the token a bearer credential for their vault. BigCommerce's list is the source of truth; the
browser has no business reading the Braintree vault.

The portal uses this as its gating probe: any error means it renders no Add card affordance, so
brands without a Braintree gateway (Preferred) self-gate with no theme change.

Routing: the `Customer/[action]` convention means the existing YARP catch-all
`/customers/Customer/{**catch-all}` already covers this. **No gateway change needed.**

### 3.3 `POST /customers/Customer/VaultBraintreeInstrument`

Request (PascalCase, per the CustomerServices contract):

```json
{
  "Jwt": "...",
  "Nonce": "tokencc_bh_...",
  "DeviceData": "{...}",
  "MakeDefault": false,
  "Billing": {
    "FirstName": "...", "LastName": "...", "Company": null,
    "Address1": "...", "Address2": null,
    "City": "...", "StateOrProvinceCode": "TX",
    "PostalCode": "...", "CountryCode": "US",
    "Phone": null, "Email": "..."
  }
}
```

Response `200 { "CustomerId": 123, "Instruments": [ ... ] }` — the **refreshed BigCommerce
list**, same shape set-default and delete already return, so the portal re-renders from server
truth rather than trusting a local mutation.

Server sequence:

1. Validate the JWT → `CustomerId`, `Email`, `StoreName`. **The customer id comes only from the
   JWT, never from the request body.** The old IAT design's central flaw was a
   caller-controlled `customer_id`, which let any valid session attach a card to any customer
   in the store.
2. Resolve `GuestVault:MerchantAccounts:{StoreName}`. **Missing → fail closed with 502 before
   touching Braintree.** Defaulting would settle a brand's funds into another brand's merchant
   account. Preferred has no entry and must 502 here.
3. Resolve the Braintree customer (§4).
4. `PaymentMethod.Create`:
   ```csharp
   new PaymentMethodRequest {
       CustomerId = braintreeCustomerId,
       PaymentMethodNonce = request.Nonce,
       DeviceData = request.DeviceData,          // optional; absence must not block
       BillingAddress = new PaymentMethodAddressRequest {
           FirstName        = b.FirstName,
           LastName         = b.LastName,
           Company          = b.Company,
           StreetAddress    = b.Address1,             // NOT Address1
           ExtendedAddress  = b.Address2,             // NOT Address2
           Locality         = b.City,                 // NOT City
           Region           = b.StateOrProvinceCode,  // NOT State
           PostalCode       = b.PostalCode,
           CountryCodeAlpha2 = b.CountryCode,         // NOT CountryCode
       },
       Options = new PaymentMethodOptionsRequest {
           VerifyCard = true,
           VerificationMerchantAccountId = merchantAccountId,
           MakeDefault = request.MakeDefault,
           FailOnDuplicatePaymentMethod = false,
       },
   }
   ```
   `FailOnDuplicatePaymentMethod` stays **false**. A card BigCommerce already vaulted at
   checkout on the same merchant would otherwise block the add (error 81724), and the
   per-customer variant needs SDK 5.28.0+.

   Note the field-name mismatch called out in the block above: Braintree's address request uses
   `StreetAddress` / `ExtendedAddress` / `Locality` / `Region` / `CountryCodeAlpha2`, none of
   which match the wire names. Also, `Phone` and `Email` have **no place on a Braintree billing
   address**: they belong on `CustomerRequest` (so pass them only when step 2 of §4 creates the
   customer) and on the BigCommerce import's `billing_address`, which does accept `email` and
   `phone`.
5. Import into BigCommerce via `BulkStoredInstruments` with `payment_method_id:
   "braintree.credit_card"`, `customer_id`, `currency_code`, `default_instrument`,
   `billing_address`, and `instrument { vault_token = <Braintree token>, provider_customer_id =
   <Braintree customer id>, type = "credit_card", brand, last_4, iin, expiry_month,
   expiry_year }`.
6. **Compensation: if step 5 fails after step 4 succeeded, `PaymentMethod.Delete` the Braintree
   token**, log both outcomes, and return 502. Without this, every failed import leaves a live
   orphan token nothing owns, and each retry creates another. The old bridge could only log
   this case and shrug (`CustomerVaultService.cs:106-109`).
7. Re-list from BigCommerce and return.

Status mapping (the portal maps these onto existing error copy):

| Status | Meaning |
| --- | --- |
| 400 | `missing_jwt` / `missing_nonce` |
| 401 | JWT invalid or expired |
| 422 | Card failed verification (decline or gateway rejection) |
| 429 | Rate limited (IP or per-customer) |
| 502 | Braintree, BigCommerce, or internal-hop failure, including a compensated import failure |

**422 carries no body detail.** See §6.

### 3.4 Internal OrderServices endpoint

`{ Site, BcCustomerId, Email, Nonce, DeviceData?, Billing, MakeDefault }` in; an outcome plus
`BraintreeCustomerId` and `VaultToken` out, with a decline classification on 422-equivalent
outcomes.

Two hardening requirements, both because **no OrderServices controller carries an
`[Authorize]` attribute** today:

- The route must not appear in any gateway route table, in any environment. Commit `500f81af`
  made exactly this call when it internalized the old vault route.
- **State how the hop authenticates.** Right now network placement is doing all the work. Make
  that an explicit, documented decision (shared secret, mTLS, or an allow-list) rather than an
  accident of deployment topology.

## 4. Braintree customer identity resolution

Ordered; first match wins. This is the part the frontend specifically asked for: *attach to the
customer's already-existing Braintree vault record when one exists.*

**Step 1 — discovery (preferred).** Recover the Braintree customer id BigCommerce itself uses
for this shopper:

1. Find a past Braintree-paid BC order for this customer id.
2. Take its payment transaction id.
3. Call IBS `api/payment/txndetails`.
4. Read `CustomerDetails.Id`. That is BigCommerce's Braintree customer for this shopper.

On a hit, **write it into the mapping table** (step 3) so discovery is paid once per customer
and every later add is a single mapping read. Do not assume an id format; use whatever
BigCommerce chose, verbatim.

**Step 2 — deterministic fallback.** `bc-{site.ToLowerInvariant()}-{bcCustomerId}`, then:

- `Customer.Find(id)` succeeds → use it.
- `NotFoundException` → `Customer.Create(Id = …, Email, FirstName, LastName)` → use it.
- **Error 91609 (`Customer ID has already been taken`) after a NotFound → re-read and FAIL
  CLOSED.** It means another party owns that id: a concurrent request, or a leftover from the
  August 2026 bridge testing. **Do not treat 91609 as success.** The deleted bridge did exactly
  that with no ownership check (`BraintreeCustomerVaultGateway.cs:37-43`), which would silently
  attach one shopper's card to another shopper's vault record.

The **site segment is mandatory**. BC customer ids repeat across the four stores sharing one
Braintree gateway, so a site-less `bc-{id}` collides across brands. (For the record: the
2026-07-17 guest spec reserved the site-less form, the 2026-08-25 spec said a GUID, and the
shipped bridge code used the site-scoped form. Site-scoped is correct.)

**Step 3 — mapping.** Persist `(Site, BcCustomerId) → BraintreeCustomerId` with a **unique index
on the pair**, plus which step produced it and when. Forward `Email` and names on create; the
old internal payload dropped `Email` entirely, which left bridge-created Braintree customers
unidentifiable in the control panel.

**Do not use `Customer.Search` by email.** It returns 0..n (email is not unique in a Braintree
vault) and the matches include disposable `{32hex}_g` guest-checkout customers and legacy
Recharge migration records. Attaching to one of those commingles ownership models for no
benefit.

## 5. Config

- Reuse `GuestVault:Braintree` (merchant id, keys, environment) and
  `GuestVault:MerchantAccounts:{site}`. Do not introduce a second credential block.
- Reuse `Sites[]` for store resolution. Note the known trap: resolve `StoreInformation` from the
  `Sites[]` SiteInfo array, **never** the `"BigCommerce"` config array, whose display names
  ("DealerSupply Sandbox") match no named `HttpClient`.
- `StoreSecrets` currently has only a StoreSupply entry per environment, so every other brand
  fails `UnknownStore`. Enabling other brands is config-only and out of scope here.
- The BC import needs the per-store `X-Auth-Token` with stored-payment-instrument write scope.
  Confirm the sandbox token has it before assuming an import failure is a code bug.

## 6. Security requirements (not suggestions)

1. **Per-customer rate limit**, roughly 5/hour, in addition to the existing 20/60s IP limit.
   `VerifyCard = true` bills a live verification to our gateway on every attempt, so this
   endpoint is a card-testing oracle. The IP limit alone is insufficient, and the JWT's
   15-minute lifetime with no `jti` means a captured request is replayable for that long.
2. **422 responses carry no decline detail.** Log the full processor response code and gateway
   rejection reason to Seq; return nothing but the status. Drop-in already catches client-side
   the cases a customer can act on (number format, expiry, CVV presence), so a failure that
   reaches us is almost always a genuine decline or gateway rejection, which is precisely the
   signal a card tester wants. AVS is the sharpest case: "check your billing address" confirms
   the card itself is live.
3. **Never log** the nonce, device data, or any PAN or CVV. Braintree token, Braintree customer
   id, brand, last four and BIN are fine and match existing house style. Note that the legacy
   `BraintreePaymentManager` logs tokens at Information level; do not copy that pattern.
4. **Customer id from the JWT only**, never from the body (restating §3.3 step 1 because it is
   the single most important line in this document).
5. **Emit one terminal outcome event per request** so Seq can chart success, decline, upstream
   failure and compensation separately. Card-add currently has zero server-side observability,
   because the shipped hosted-form flow happens browser-direct at BigCommerce; this endpoint is
   the first chance to see add outcomes at all. Follow the existing
   `StoredInstrument {Operation} {Outcome}` message shape.

## 7. Traps — things a reasonable implementer would get wrong

- Treating Braintree error **91609 as "customer already exists, proceed"**. It means someone
  else owns that id. Fail closed. (The deleted bridge's actual bug.)
- Setting `FailOnDuplicatePaymentMethod = true` "for hygiene". It will reject cards BigCommerce
  already vaulted at checkout on the same merchant.
- Reaching for `FailOnDuplicatePaymentMethodForCustomer`. Not in SDK 5.27.0; needs 5.28.0+.
- Trying to **move** an existing Braintree token to a different customer. Impossible:
  `PaymentMethod.Update` has no `CustomerId`. Attaching to a specific customer always means
  vaulting a fresh nonce.
- Expecting `PaymentMethod.Create` to **throw** on a bad customer id. Customer-id problems come
  back on `result.Errors` (93104 required, 93105 invalid), not as exceptions.
- Assuming BC's read APIs can tell you the Braintree customer id. None of them do;
  `provider_customer_id` is **request-only**. Discovery via `txndetails` (§4) exists precisely
  because of this.
- Using BC's documented set-default shape `PUT /v3/payments/stored-instruments/{token}` with
  `make_default`. The docs guide says that; the real store returns 404. Use a PUT on the
  collection with `{ "token": "...", "is_default": true }`.
- Reusing a nonce. Single-use, 3-hour TTL (93107 reuse, 93108 unknown or expired).
- Putting the Braintree SDK into CustomerServices. See §3.1.
- Exposing the internal OrderServices route through the gateway. See §3.4.

## 8. Tests required

`Ssw.MicroServices.CustomerServicesTests` / `Ssw.MicroServices.OrderServicesTests`:

- Identity: discovery hit uses BigCommerce's id; discovery miss falls through to deterministic;
  deterministic `Find` hit reuses; `NotFound` creates; **91609 after NotFound fails closed**;
  the `(Site, BcCustomerId)` unique index handles a concurrent insert.
- Merchant account missing → 502 **before** any Braintree call (assert the gateway was never
  invoked).
- `PaymentMethod.Create` decline → 422 with no detail in the body, and the reason present in
  logs.
- **Import failure after a successful vault → `PaymentMethod.Delete` is called, and the
  response is 502.**
- Customer id in the body is ignored; only the JWT's id is used.
- Per-customer rate limit trips at the configured threshold independently of the IP limit.
- No nonce, device data, PAN or CVV appears in any emitted log.
- Client-token endpoint: 200 shape, and a 5xx from the upstream surfaces as 502.

## 9. Definition of done

1. §0 gate answered and recorded.
2. Both public endpoints and the internal endpoint deployed to Testing.
3. Frontend can add a card **with an empty cart** on the SSW sandbox and see it in the portal
   list.
4. **A sandbox order can be placed paying with that newly added card.** This is the real
   success criterion; steps 1-3 passing without this proves nothing about chargeability.
5. Tests above green; a memory note written per the repo's three-sink `memory-write` process;
   the Seq dashboard doc updated with the new `Operation` value.
