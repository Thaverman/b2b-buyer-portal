# Ordergroove auth path — hardening now, proxy as the target

**Date:** 2026-09-17
**Status:** Approved in review; the immediate fix is owned by `ssw-microservices`, not this repo
**Program spec:** [2026-09-15-ordergroove-subscriptions-custom-manager-design.md](2026-09-15-ordergroove-subscriptions-custom-manager-design.md) §4
**Companion to:** [Phase 4 — change the card on a subscription](2026-09-17-ordergroove-phase4-payment-change-design.md)
**Audience:** whoever owns `ssw-microservices`, plus the next portal engineer

This is not a portal feature. It is the contract for a change another team makes, and the
architecture the portal's Ordergroove service is aimed at. It exists because Phases 1–3a built on an
endpoint that authenticates nobody.

---

## 1. The problem, stated precisely

`POST https://test-onlineservices.storesupply.com/products/productclient/ordergroove-auth` accepts

```json
{ "customerId": "80591", "storeHash": "24erkpw9h6" }
```

with **no session cookie, no token, and no other proof the caller is that customer**, and answers

```json
{ "success": true, "cookieValue": "80591|<epoch>|<base64 HMAC>", "expiresIn": 7200 }
```

That triplet is a valid Ordergroove **Storefront-scope credential for customer 80591**, good for two
hours. BigCommerce customer ids are small sequential integers, and the Ordergroove merchant id is
readable by any logged-in shopper from the manager's script URL.

Verified live on 2026-09-02 and again on 2026-09-15 (program spec §2, spike #1).

**What the credential does.** Reads: names, phone numbers, every shipping and billing address, card
last four digits, expiry and gateway token ids. Writes, all confirmed browser-callable by Phase 3a's
probe on 2026-09-17: cancel a subscription, change its quantity or frequency, move its next order
date, skip an order, send an order now, and redirect a shipment to a different address. Phase 4 adds
repointing a subscription's card.

**This is pre-existing.** The Stencil theme has always called the endpoint this way, and the portal
copied the theme. Phases 1–3a did not introduce it. What they changed is the evidence: the mutation
surface is no longer theoretical.

## 2. Immediate fix — authenticate the mint

The portal already sends a Current Customer JWT on every call:

```jsonc
{ "Jwt": "<current customer JWT>", "customerId": "80591", "storeHash": "24erkpw9h6" }
```

(`apps/storefront/src/shared/service/ordergroove/auth.ts`, sent since Phase 1 precisely so this
change needs no portal redeploy.)

**The change.** Validate `Jwt` the same way `POST {apiBase}/customers/Customer/StoredInstruments`
already validates it, then:

| Field | Today | After |
|---|---|---|
| `Jwt` | ignored | **required**; reject with `401` when absent, malformed, expired, or not signed for this store |
| `customerId` (body) | trusted | **ignored**; take the customer id from the JWT's `customer.id` claim |
| `storeHash` (body) | trusted | ignored; derive from the JWT's `sub` |

The response shape does not change, so no portal redeploy is needed. Once the Stencil theme also
sends a JWT, delete the body fields entirely.

**Acceptance checks.** These are the tests that prove the fix:

1. `POST` with `{ customerId, storeHash }` and **no** `Jwt` → `401`, no credential in the body.
2. `POST` with a valid `Jwt` for customer A and `{ customerId: <customer B> }` → the credential is
   minted for **A**, never B.
3. `POST` with an expired or tampered `Jwt` → `401`.
4. `POST` with a valid `Jwt` → unchanged `200` and a working credential (the portal keeps working).

Check 2 is the one that matters: it is the difference between validating a token and actually using
it.

**Rate limiting.** Even authenticated, the mint hands out a two-hour bearer credential. Log each
mint with the customer id from the JWT, and cap mints per customer per minute. A customer's own page
needs one mint per page load — Phase 2 measured exactly that after the in-flight dedupe landed.

## 3. Target architecture — proxy the calls

Hardening closes the hole but leaves a two-hour bearer credential in the browser. Anything that can
run script on the storefront can take it and use it from anywhere, against Ordergroove directly,
where SSW cannot see it, rate-limit it or revoke it. The end state removes the credential from the
browser.

**Shape.** The portal stops calling `restapi.ordergroove.com`. It calls onlineServices, which holds
the signing key, mints its own credential server-side, and forwards. Every request carries the
Current Customer JWT and is authorised from its claims.

```
today   browser --(JWT)--> mint --> browser holds credential --(credential)--> Ordergroove
target  browser --(JWT)--> onlineServices --(credential, server-side)--> Ordergroove
```

**What this buys, beyond the hardening:** the credential and the merchant id never reach the
browser; every subscription mutation is logged and revocable on SSW infrastructure; the middleware
can check that the subscription, order or payment being mutated belongs to the authenticated
customer rather than relying on Ordergroove's scoping alone.

**The portal seam is one function.** Every Ordergroove call in the portal — reads and writes alike —
goes through `request()` in
[`apps/storefront/src/shared/service/ordergroove/api.ts`](../../../apps/storefront/src/shared/service/ordergroove/api.ts).
It is the only place that calls `fetch` for Ordergroove and the only place that attaches the
credential. Migrating the portal to the proxy is: change `request()` to send the JWT to the proxy
base instead of the credential to Ordergroove, delete `auth.ts`, and drop `merchantId` from
`BC_CONTEXT.subscriptions`. Every caller above it — `listSubscriptions`, `skipSubscription`,
`changeNextOrderDate` and the rest — keeps its signature.

**Build features on today's transport until the proxy exists.** Because the seam is one function,
work built now migrates for free. Phase 4 is specified against today's transport for exactly this
reason; blocking it on another team's build would buy nothing.

**Open for whoever builds the proxy**, not decided here: whether to expose one passthrough route or a
route per operation (a per-operation allowlist is the stronger posture, and the portal only needs
the dozen calls the service module exports); whether the middleware caches one credential per
customer or mints per request; and what it logs.

## 4. What not to do

- **Do not move the HMAC signing into the browser.** The private hash key stays server-side. This is
  already out of scope in the program spec §11 and stays out.
- **Do not widen the credential's scope.** Storefront scope, one customer, is correct. An
  Application-scope key must never reach a browser.
- **Do not gate the fix on the proxy.** They are independent. Section 2 can ship this week.

## 5. Sequencing

1. **Now:** Section 2, in `ssw-microservices`. No portal change; the portal already sends the JWT.
   Verify with the four acceptance checks, then re-run the portal's own live checks to confirm
   nothing regressed.
2. **Next, in parallel:** Phase 4 on today's transport (its own spec).
3. **Then:** the theme stops sending a body `customerId`, and the middleware deletes the field.
4. **Later:** Section 3, at which point the portal migration is the one-function change above.
