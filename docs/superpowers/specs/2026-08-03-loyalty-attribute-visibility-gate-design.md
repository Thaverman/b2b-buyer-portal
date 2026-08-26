# Gate Loyalty on the "Loyalty Tier" customer attribute — design

**Date:** 2026-08-03
**Status:** Approved (design) — allowlist gate confirmed additive-only, 2026-08-03
**Area:** B2B buyer portal · nav + routing (`src/shared/routeList.ts`), login boot (`src/utils/loginInfo.ts`), Loyalty page and login-landing redirect
**Related:** [2026-07-14-loyalty-tier-allowlist-gate-design.md](2026-07-14-loyalty-tier-allowlist-gate-design.md)
(the existing rollout gate, which this does **not** replace — see Assumptions),
[2026-07-28-loyalty-login-landing-design.md](2026-07-28-loyalty-login-landing-design.md) (the login redirect that must also be gated).

## Problem

The Smart Rewards nav entry and `/loyalty` page are shown to every signed-in
customer on Stencil. They should be visible only to customers who are actually
enrolled — expressed as: the BigCommerce customer attribute **"Loyalty Tier"**
has a non-empty value.

Today nothing gates on enrolment. The one gate that hides the nav entry checks
only platform, host config presence, and masquerade
(`routeList.ts:298-304`). The tier-allowlist rollout gate hides the page *body*
but leaves the nav entry visible and clickable, and — see the finding below — is
currently inert.

## Feasibility: verified live, not inferred

Measured against `sandbox.storesupply.com` on 2026-08-03 with the test account,
via BigCommerce **Storefront** GraphQL:

```graphql
{ customer { attributes { loyaltyTier: attribute(entityId: 2) { entityId name value } } } }
```
```json
{ "loyaltyTier": { "entityId": 2, "name": "Loyalty Tier", "value": "Signature" } }
```

`customer.attributeCount` was `2`; the other attribute is `SxeCustomerNumber`
(`entityId: 1`). Two things this settles:

- **`name` is readable**, so the query can assert it and catch id drift.
- Lookup is **by numeric `entityId` only** — `CustomerAttributes` exposes just
  `attribute(entityId: Int)`. There is no lookup by name and no way to enumerate
  a customer's attributes, so the id must be supplied, and mapping name → id
  requires the server-side Management API (`GET /v3/customers/attributes`).

Ruled out, so nobody re-treads them:

| Source | Why not |
|---|---|
| **B2B API** | `CustomerType.attributes` exists in the schema but **no query returns `CustomerType`** — it is only the payload of the `customerCreate` mutation. No attribute definitions either. |
| **Current Customer JWT** | Carries only `customer.id`, `email`, `group_id`. |
| **Stencil handlebars `{{customer}}`** | Has no `attributes` property. |
| **Customer form fields / metafields** | Not on the Storefront GraphQL customer type. |
| **`window.LG_PAGE_DATA.gqlCustomer.attributes.loyaltyTier.value`** | Already on the page and synchronous — but it belongs to a third-party app. Coupling portal routing to another vendor's global is fragile; rejected. |

## Where the value comes from, and the one risk in it

The value must land in Redux **before the nav first renders**, so the natural
home is the customer query the portal already runs at login:
[bc/graphql/user.ts:1-12](../../apps/storefront/src/shared/service/bc/graphql/user.ts) →
`getCustomerInfo()` → consumed at
[loginInfo.ts:247-256](../../apps/storefront/src/utils/loginInfo.ts).

**That query is dispatched through `B3Request.graphqlBCProxy`, not the
same-origin `graphqlBC`.** The proxy posts to the B2B API
(`/api/v3/proxy/bc-storefront/graphql`) with the `B2BToken`; the shopper's
storefront session cookie is *not* sent, and customer identity is resolved by
the proxy. It demonstrably resolves `entityId`/`firstName` today — but the
attribute read was first verified only against the direct same-origin endpoint,
never through the proxy. That gap is now closed; see below.

### Measured 2026-08-03 — mostly resolved, Approach A is viable

Probed the proxy directly at
`https://api-b2b.bigcommerce.com/api/v3/proxy/bc-storefront/graphql` with
`Store-Hash: 24erkpw9h6` / `BC-Channel-Id: 1` (unauthenticated mode, no B2BToken):

| Query | Response |
|---|---|
| `customer { entityId firstName }` (control) | `{"data":{"customer":null}}` |
| `customer { attributeCount attributes { loyaltyTier: attribute(entityId: 2) { entityId name value } } }` | `{"data":{"customer":null}}` |

**The `attributes` selection produced no validation error.** GraphQL rejects
unknown fields at parse time, so had the proxied schema lacked
`attributes` / `attribute(entityId:)` the response would have been
`Cannot query field 'attributes' on type 'Customer'`. It passed the selection
through, so the schema supports it. `customer: null` is solely the absence of an
authenticated customer.

Combined with the fact that `getCustomerInfo()` already returns `entityId` and
`firstName` through this exact path for a logged-in shopper, **Approach A is the
plan of record.**

**Residual, small but real:** this proves the schema accepts the selection and
that the proxy resolves *some* customer context, not that it returns attribute
*values* for an authenticated customer — the proxy could resolve a restricted
context. So a live confirmation stays in the plan (run under `yarn dev` against
the sandbox, logged in), but as a verification step rather than a blocking gate
before implementation. If it comes back empty, fall back to Approach B, which is
already measured to work.

### Approach A (plan of record): extend the existing login query

Zero extra round trips; value present in Redux before first nav render.

### Approach B (fallback): a separate same-origin query

A dedicated `graphqlBC` call — the path measured to work — awaited during login
before the nav renders, adding one round trip to login. Costs latency on a
critical path, which is why it is the fallback and not the default.

Rejected outright: fetching lazily from the Loyalty page or a hook. The nav is
built in a `useMemo` whose deps
([B3Nav.tsx:145-169](../../apps/storefront/src/components/layout/B3Nav.tsx))
would not re-run when a late value lands, so the nav would keep a stale verdict.

## Design

### The gate value

Add one field to the existing customer type — **not** a new slice, Context, or
storage (all forbidden by AGENTS.md):

```ts
// src/types/company.ts, interface Customer
/**
 * Whether Loyalty is visible to this customer, decided once at login from the
 * BigCommerce "Loyalty Tier" customer attribute. TRUE when the attribute has a
 * value, and also when the gate is inactive (unconfigured id, name mismatch, or
 * the attribute object was not returned at all). FALSE only when the attribute
 * was genuinely read and is blank. Defaults to true so that no failure mode
 * hides Loyalty from everyone.
 */
isLoyaltyEntitled: boolean;
```

**Why a resolved boolean and not the raw tier string.** An optional
`loyaltyTier?: string` *cannot express the verdict this gate needs*: "the API did
not answer" and "the API answered, and the value is blank" would both arrive as
`undefined`/`''`, yet the gate semantics above require them to produce **opposite**
outcomes. Encoding that as `undefined` vs `null` on one field is exactly the kind
of subtlety that gets flattened by the next person's `if (!value)`. Resolving it
once, at the only place that knows whether an answer arrived, and storing the
answer as a boolean removes the ambiguity entirely — and gives all three surfaces
a single value to read instead of three copies of the same predicate.

The raw tier string is deliberately **not** stored: nothing consumes it (the hero
already gets its tier name from Influence/SSW), so keeping it would be
speculative.

`setCustomerInfo` already replaces the whole `Customer` payload
([company.ts:96-98](../../apps/storefront/src/store/slices/company.ts)), so no
reducer change is needed — but the slice's `initialState.customer` must seed
`isLoyaltyEntitled: true`, so that any code path reaching the gate before login
completes does not hide the nav.

### The resolver

One pure function, living beside the other loyalty predicates in
[Loyalty/api.ts](../../apps/storefront/src/pages/Loyalty/api.ts) (`isLoyaltyAvailable`,
`getAllowedTiers`, `isTierAllowed`):

```ts
resolveLoyaltyEntitlement(rawAttribute: unknown): boolean
```

It receives whatever the `loyaltyTier` alias produced and applies the table above.
`utils/loginInfo.ts` already imports from `@/pages/Loyalty/loyaltyLanding`
(loginInfo.ts:1), so this import direction is established. `routeList.ts` reads
only the resolved boolean out of Redux, so it never imports from `pages/`.

### Configuration, and why the id is not hardcoded

The attribute id is store-specific and changes if the attribute is ever
recreated in the control panel — after which a hardcoded id would silently
return `null` and hide Loyalty from **every** customer. So:

- Read the id from **`window.BC_CONTEXT.loyalty.tierAttributeId`** (extending the
  existing `LoyaltyConfig` in [Loyalty/api.ts:7-14](../../apps/storefront/src/pages/Loyalty/api.ts)),
  matching how every other loyalty knob is host-configured. Sandbox value: `2`.
- **Assert the returned `name` is `"Loyalty Tier"`.** On mismatch, log via
  `b2bLogger.error` with the id and the name actually received, and treat the
  read as unconfigured (gate off) rather than hiding the page from everyone.
  Id drift then degrades to today's behaviour and leaves a diagnosable trail,
  instead of silently hiding a feature.

### Gate semantics

Mirroring the allowlist gate's established split:

| State | Verdict | Rationale |
|---|---|---|
| `tierAttributeId` not configured | **Gate off** — Loyalty visible, exactly as today | Fail-open on the *config* surface: a store that has not opted in must not lose the feature |
| Attribute name mismatch | **Gate off** + error log | Drift must not hide the feature |
| Value is a non-blank string | **Visible** | The enrolled case |
| Value is `null`, `""`, or whitespace-only, and the `attributes` object **was returned** | **Hidden** | A real per-customer verdict. BigCommerce produces both `null` (never set) and `""` (cleared); the requirement treats them alike |
| The `attributes` object itself is **missing or the query errored** | **Gate off** + error log | See below — this is a systemic failure, not a verdict about this customer |

Comparison is `(value ?? '').trim() !== ''`. No tier-name matching — the
requirement is presence, not which tier.

**Why "no answer" must not mean "hidden".** These two look similar in a response
but mean opposite things:

- `attributes: { loyaltyTier: { entityId: 2, name: "Loyalty Tier", value: null } }`
  — the API answered with the attribute object; this customer has no tier.
  A verdict. **Hide.**
- `attributes` absent entirely, or the selection errored — the API did not answer.
  **No verdict.** If this were treated as "hidden", a BigCommerce schema change, a
  proxy regression, or a revoked token would hide Smart Rewards from *every*
  customer at once, silently and with no error to explain it. The safer failure
  is the status quo plus a loud log.

**Which shape BigCommerce actually returns — measured, not assumed.** During the
2026-08-03 live probe, aliases for entityIds 1–20 were requested at once. Every id
came back as a **non-null object** (`{ entityId, value: null }` for the eighteen with
no value), and introspection reports `attribute(entityId: Int)` with a NON_NULL
return type. So:

- A customer who has never had "Loyalty Tier" set yields
  `{ entityId: 2, name: "Loyalty Tier", value: null }` — name matches, value blank →
  **hidden**, which is the required behaviour.
- A `tierAttributeId` pointing at an id with no definition yields an object whose
  `name` is not `"Loyalty Tier"` → **name mismatch → visible + log**.
- A bare `loyaltyTier: null` does **not** occur. The resolver's `!rawAttribute`
  branch is therefore reachable only when `attributes` itself is missing — exactly
  the systemic case it is meant for, and not a per-customer verdict in disguise.

This closes the question of whether the two branches could be confused at runtime:
they key off different levels of the response, and only one of them is reachable
per-customer.

> **Correction, measured 2026-08-04.** The probe above generalized from an
> *enrolled* account. A customer who has **never** had the attribute set receives
> `{ entityId: 2, name: "", value: null }` (verified live via same-origin
> Storefront GraphQL, customer 40978): BigCommerce echoes the attribute **name
> only when a value record exists**. As first built, the empty name tripped the
> name-mismatch drift guard, so the unenrolled case fail-opened and the gate
> could never close for exactly the customers it exists to hide. The resolver now
> treats an **empty** name as the normal unenrolled shape (the value test applies
> → hidden, no log) and only a non-empty, *different* name as id drift
> (visible + log).

This is a deliberate departure from the allowlist gate's blanket "fail-closed on
the data surface". That gate is a *rollout* lever, where over-restricting is
cheap; this one is an *entitlement* check, where over-restricting is a total
feature outage. So the distinction is between "the customer has no tier" (hide)
and "we could not find out" (leave as-is, log). The implementation must therefore
check for the presence of the `attributes` object separately from the truthiness
of the value — not collapse both into one falsy test, which is the easy mistake
here.

### The three surfaces

A gate that only hides the page body is not enough; the nav entry and the login
redirect are separate surfaces.

| # | Surface | File | Change |
|---|---|---|---|
| 1 | **Nav entry + route** | [routeList.ts:298-304](../../apps/storefront/src/shared/routeList.ts) | Add `!isLoyaltyEntitled` to the existing `/loyalty` early-return. One edit covers both, because the same filtered list feeds `B3Nav` and the router. Reads `store.getState().company.customer.isLoyaltyEntitled` — the function already reads Redux imperatively, so no import from `pages/` is introduced. |
| 2 | **Page body** | [Loyalty/index.tsx:56](../../apps/storefront/src/pages/Loyalty/index.tsx) | Fold into `isAvailable` so a stale tab, a bookmark, or a programmatic push cannot render the page. Surface 1 removes the `<Route>`, but `gotoAllowedAppPage` checks the *unfiltered* `routes` array, so defence in depth is warranted. |
| 3 | **Login-landing redirect** | [loyaltyLanding.ts:6-13](../../apps/storefront/src/pages/Loyalty/loyaltyLanding.ts) | Add the condition to the prefetch gate. Without this a hidden-out customer is redirected to `/loyalty` as their post-login page and lands on a route that no longer exists. |

Surface 3 already has this bug today with the allowlist gate — an
allowlist-excluded customer with an active tier journey is still redirected. This
spec fixes it only for the new gate; see Non-goals.

## Edge cases

| Case | Behaviour |
|---|---|
| Attribute changed in the control panel mid-session | Stale until next login (read once at login). Accepted — the alternative is polling. |
| Masquerading rep | Already hidden by the existing `isAgenting` check; unchanged. The attribute read is for the logged-in rep, which is the same reasoning that hides Loyalty while agenting. |
| Non-Stencil platform | Already hidden by `platform !== 'bigcommerce'`; the new condition never gets a chance to matter. |
| `getCustomerInfo()` fails | Login already aborts, so there is no partial state where only the tier is missing. |
| Value present but a tier name we do not recognise | Visible. Presence is the test; unknown tier names are legitimate. |
| Customer enrolled but attribute never populated | Hidden. This is a data problem at the source, and the error log from the name assertion will not fire — worth calling out to whoever owns attribute population. |

## Testing

- **`routeList` / nav:** the Loyalty entry is absent when `loyaltyTier` is
  undefined, `''`, or whitespace, and present when it is non-blank; unchanged
  when `tierAttributeId` is unconfigured. There is currently **no nav-side test**
  for the existing `/loyalty` filter, so this adds the first one.
- **Route blocking:** navigating to `/loyalty` with the gate closed does not
  render the page.
- **Page body:** gate closed → the unavailable state, not the hero/tabs.
- **Login landing:** with the gate closed, no redirect to `/loyalty` even when
  tier progress would otherwise trigger one.
- **The query:** the attribute selection is sent with the configured id; a
  `name` mismatch logs and leaves the gate off; a blank/`null` value closes it.
- **The two failure modes must be distinguished by tests, not just by code:** a
  response carrying the attribute object with a blank value —
  `attributes: { loyaltyTier: { name: "Loyalty Tier", value: null } }` — hides
  Loyalty, while a response with **no `attributes` object at all** leaves it
  visible and logs. A single test cannot cover both, and collapsing them is the
  specific bug this design is guarding against.
- **Untouched:** the existing allowlist-gate tests, masquerade tests, and every
  Loyalty tab test must stay green.

Test data via builders (`buildCompanyStateWith`); `window.BC_CONTEXT` set in
`beforeEach` and deleted in `afterEach`, per the existing Loyalty test file.

## Verification

- `yarn tsc --noEmit`; scoped eslint; Loyalty + routing suites green against the
  branch's known-red baseline (3 pre-existing FAQ failures, plus the
  `ManageSubscriptions` eslint and `analytics.ts` knip/dep-cruiser items).
- **Live on sandbox:** the proxy probe above; then an enrolled customer sees the
  nav entry and page, and a customer whose attribute is cleared sees neither and
  is not redirected there at login.

## Non-goals

- **Removing or rewiring the tier-allowlist rollout gate.** It stays as-is; this
  gate is additive. See Assumptions.
- Fixing the allowlist gate's own missing login-redirect check (surface 3), or
  the pre-existing divergence where `routeList` checks `BC_CONTEXT.loyalty`
  *presence* while `isLoyaltyAvailable()` checks *completeness*.
- Reading any attribute other than Loyalty Tier; enumerating attributes;
  any write path.
- Live re-evaluation without a re-login.
- Headless/Catalyst — Loyalty is Stencil-only.

## Assumptions (confirm before implementation)

1. **This gate is additive; the existing tier-allowlist gate is left in place.**
   Chosen as the surgical option, but flagged because of a live finding:

   > The allowlist gate is currently **inert**. The live theme sets
   > `window.loyaltyRolloutConfig = { allowedMemberships: '', shippingAllowedMemberships: '' }`
   > — with **no `allowedTiers`**, which is the only key
   > `getAllowedTiers()` ([Loyalty/api.ts:546-547](../../apps/storefront/src/pages/Loyalty/api.ts)) reads.
   > An empty list means fail-open, so it currently admits everyone.

   If the intent was that the allowlist gate does the gating today, it is not.
   Options, for a follow-up rather than this spec: retire it as superseded, or
   repoint it at `allowedMemberships`. **If you want it retired as part of this
   work, say so and I will fold that in** — it changes the scope from additive
   to replacement.
2. **`tierAttributeId` is `2` in production too.** Confirm from the control panel
   or `GET /v3/customers/attributes?name=Loyalty Tier`; the config-driven id plus
   the name assertion mean a wrong value degrades to gate-off rather than
   breaking, but it should be right.
3. **"Not empty" means presence, not a specific tier.** Any non-blank value grants
   access.
