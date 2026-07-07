# Loyalty Page (Influence.io) — Design Spec

- **Date:** 2026-07-06
- **Status:** Approved (design) 2026-07-06 — Q1–Q6/S1–S6 remain open; Q1 blocks Rewards-tab go-live, not implementation start
- **Area:** `apps/storefront` — new page `src/pages/Loyalty/`, routing, i18n; plus one small
  backend endpoint (digest minting) in `Ssw.MicroServices` (separate repo)
- **Reviewed:** adversarially checked against the mockup, the API research, and the
  codebase by three independent review passes; all findings applied 2026-07-06

## Summary

A new buyer-portal page at `/#/loyalty` presenting the customer's loyalty program
(per the approved mockup): points balance, member-since, current tier + benefits,
ways to earn points, a redeemable-rewards catalog, tier list, and points history.
Data comes from **Influence.io**, gated by a variable the custom Stencil theme sets
on `window.BC_CONTEXT` — same mechanism as `storeSuffix` (order-id obfuscation) and
`paymentMethods`. Absent ⇒ the route is never registered and the menu item never
renders.

### The critical API finding

Influence.io exposes **two** APIs, and the one linked in the request is the wrong
one to call from a browser:

| | Platform API | Launcher API |
|---|---|---|
| Base | `https://platform.api.influence.io/v1` | `https://launcher.api.influence.io/launcher/v1` |
| Auth | Secret `x-api-key` (full admin: award points, create customers) | Per-customer HMAC digest + public `shop` key |
| Audience | Server-side only | **Browser** — "the foundational API for all of our widgets" |

The SPA therefore uses the **Launcher API** directly (CORS is `*`, empirically
verified). Customer-scoped calls need a `digest` =
`HMAC-SHA256(shopKey + lowercase(email) + customerId, key = Platform API key)`.
Since the Platform API key is the HMAC secret, the digest must be minted by **our
backend** — a single tiny endpoint, authenticated with the BigCommerce Current
Customer JWT exactly like the payment-methods backend. The digest itself is
customer-specific and safe to hand to the browser. Shop-level data (tiers, earn
rules, redeem rules) needs only the public `shop` key — no backend involved.

This is Influence.io's officially supported "Headless Widget" path (requires their
**Plus plan**, as does the Platform API).

## Goals (v1)

- New gated `/loyalty` page (menu item "Rewards") with tab navigation driven by a
  URL search param. Tab map (labels must match the approved mockup; the menu-item
  "Rewards" / tab "Rewards" name collision comes from the mockup itself and is
  accepted):

| `?tab=` param | Label (mockup) | en.json key |
|---|---|---|
| `overview` (default) | Your rewards | `loyalty.tabs.overview` |
| `earn` | Earn points | `loyalty.tabs.earn` |
| `redeem` | Rewards | `loyalty.tabs.redeem` |
| `tiers` | Tiers | `loyalty.tabs.tiers` |
| `history` | History | `loyalty.tabs.history` |

- **Header/hero**: welcome + company name, "Member since {date}" chip
  (Influence.io `createdAt` — this is the loyalty-enrollment date, not the BC
  account date; for customers backfilled by the native app it shows the sync date,
  accepted for a membership chip, verify during sandbox), current-tier chip,
  points balance. Note: `B3Layout` also auto-renders the route's `idLang`
  ("Rewards") as the page heading — accepted; the hero is designed beneath it
  (payment-methods ships the same doubling). No hardcoded mockup blue: hero uses
  `bgcolor: 'primary.main'`; if the pilot theme's primary differs from the mockup
  blue, that divergence is accepted (mockup was illustrative).
- **Your rewards (overview) tab**: current tier benefits card (tier `perks[]`
  strings) plus a points/next-tier progress summary as interim content — three of
  the mockup's four overview elements are de-scoped (below), and this keeps the
  default tab from shipping visibly empty.
- **Earn points tab**: earn-rule cards from `GET /shop/rules/earn` — `customTitle`
  (the API has no `title` on earn rules) + `summary` text + points value.
  `earnValue` semantics depend on the undocumented `earnType` (purchase rules are
  plausibly points-per-currency-unit), so cards render the rule's own
  `summary`/`message` copy rather than formatting `earnValue` as a bare number
  when `earnType` is unrecognized. Completion chips only where knowable:
  social-follow flags come from the customer object; "create an account" is
  **inferred** (membership exists), not an API flag. Mailing-list and
  product-review cards are **informational-only in v1** (no in-page action, no
  completion chip — their earning happens through integrations). The Instagram
  card is actionable: `POST /customer/social` awards the points in-page. The
  mockup's "Learn more" buttons are de-scoped (see Non-goals).
- **Rewards (redeem) tab**: redeem-rule cards (`title`/`customTitle`, `pointCost`)
  with "Get reward" — confirm dialog → `POST /customer/redeem` → display returned
  coupon code with a copy button; disable rewards costing more than the current
  balance. **v1 handles fixed-cost rules only**: rules indicating variable
  ("increment-type") redemption via `minRedeemablePoints`/`maxRedeemablePoints`
  are filtered out of the catalog (a points-amount selector is v2); rules with an
  unrecognized `status` value are logged and hidden. **Addition beyond the
  mockup**: previously earned coupon codes listed from `all-rewards` — added so
  users can retrieve a code after closing the redeem dialog; cheap because the
  endpoint exists. Upstream provides no used/expired status on these, so codes
  list as-issued.
- **Tiers tab**: all tiers with thresholds and perks, current tier highlighted,
  progress toward next tier. Tier `threshold` is a **string** with no documented
  unit and `currentLoyaltyTierProgress` is only "an absolute value" — the progress
  bar parses defensively and hides itself if the two aren't commensurable numbers
  (sandbox item S3).
- **History tab**: paginated points activity (`nextToken` cursor, "Load more").
- Gate: theme-set `window.BC_CONTEXT.loyalty`, Stencil only, not while agenting.

## Non-goals / de-scoped from the mockup (v1)

Influence.io has **no API** for four mockup elements; shipping them requires
product decisions and backend work, so v1 omits or reinterprets them:

| Mockup element | Why de-scoped | Path to v2 |
|---|---|---|
| Store credit card ($300, expires in 45 days) | No store-credit endpoints exist in either API | Our backend issues BC store credit on the `points/redeemed` webhook and exposes balance/expiry |
| "(0 pending)" points | No pending-points total; activity `status` enums are undocumented | Compute server-side from webhook events, or drop permanently |
| Free-shipping progress bar ($240/$300) | No spend-threshold endpoint | Only viable if modeled as a tier threshold (then it's the Tiers progress), else needs our own order-data endpoint |
| Mission banner ("2 more orders this month") | No missions/campaigns API | Entirely our feature: backend tracks progress, awards via Platform `POST /customers/{id}/points` |
| "Learn more" buttons on earn cards | Earn rules expose no long-form description to link to; cards already show the rule's full `summary`/`message` copy | Link to a program-terms CMS page if one exists later |

Also out of scope: Influence.io's prebuilt widgets (don't match the design, can't
be gated our way), referral UI, birthday collection, order/customer sync into
Influence.io (the native BigCommerce app's job — see Q1), variable-amount
redemptions, any new Redux slice/Context/storage, and non-Stencil platforms.

## Approaches considered

1. **Launcher API from the browser + one digest endpoint (chosen).** Matches how
   Influence.io's own widgets work; smallest backend surface; portal stays a pure
   consumer. Follows the payment-methods precedent exactly.
2. **Full proxy through Ssw.MicroServices using the Platform API key.** Every read
   round-trips through our backend. More code, more latency, and the Platform API
   lacks several read endpoints the Launcher API has (e.g. `all-rewards`);
   rejected — the digest mechanism exists precisely to avoid this.
3. **Embed Influence.io's no-code widget.** No custom design, no theme-variable
   gating, no portal integration. Rejected.

## Decisions

| Decision | Choice |
|---|---|
| API surface | Launcher API from the browser; Platform API only server-side (digest secret, future webhooks/missions) |
| Config source / gate | `window.BC_CONTEXT.loyalty = { shopKey, apiBase, appClientId }` set by the host Stencil theme. Absent ⇒ feature off (same posture as `storeSuffix` / `paymentMethods`) |
| Route gate location | **Inline predicate** in `getAllowedRoutesWithoutComponent` (`routeList.ts`, beside the `/payment-methods` gate at :279-286): `platform !== 'bigcommerce' \|\| !window.BC_CONTEXT?.loyalty \|\| isAgenting` ⇒ drop. Inlined — not imported from the page — exactly like payment-methods actually does it, so `shared/` never imports from `pages/` and the lazy page chunk stays lazy |
| Page-local availability | `isLoyaltyAvailable()` in the page's `api.ts` = `platform === 'bigcommerce' && all three loyalty config fields present` (mirrors `PaymentMethods/api.ts:73-76`, platform check included because `getCurrentCustomerJWT` early-returns `undefined` off-Stencil and would misrender as session-expired) |
| Loyalty identity | The **individual logged-in BC customer** (Influence.io is customer-keyed). Company name appears in the hero as presentation only (from Redux `company`) |
| Digest auth | Portal fetches a fresh Current Customer JWT (`getCurrentCustomerJWT(loyalty.appClientId)`) per digest request; backend validates it and derives customer id + email **from the JWT** (never trusts client-supplied identity) |
| Digest email-casing contract (normative) | Backend **lowercases** the JWT email, uses the lowercased value in the HMAC, and returns it in the response; the client sends the returned `email`/`customerId` **verbatim** on every Launcher call. This kills the digest-mismatch casing trap end-to-end |
| Digest caching | The digest is a pure function of stable inputs — cache with `staleTime: Infinity` per session (`queryKey: ['loyaltyDigest', customerId]`) |
| Agenting | Suppressed while masquerading (`isAgenting`) — the JWT identifies the rep, who would see/redeem their own points against a customer's screen |
| HTTP client | Page-local `api.ts` with raw `fetch` (payment-methods pattern). `B3Request` is hard-wired to B2B/BC tokens — wrong for both Influence.io and the digest endpoint |
| Server state | react-query v5: one `useQuery` per data family, `useInfiniteQuery` for history and all-rewards, `useMutation` for redeem/social with targeted `invalidateQueries` |
| Tab state | URL search param via `useSearchParams` (AGENTS.md URL-driven-state rule); default `overview` |
| File placement | Everything in `src/pages/Loyalty/` (matroska); nothing added to `src/shared/` beyond route registration |
| Route permissions | `permissions: accountSettingPermissions`, no `permissionCodes`, no `configKey` (mirrors `/payment-methods`; loyalty belongs to the individual customer, not a company capability) — see Q6 |
| Styling | MUI components + theme palette (no hardcoded blues); hero = `Box` with `bgcolor: 'primary.main'`; mobile via `useMobile()` + `sx` branching; MUI `Tabs variant="scrollable"` |

## Theme contract (the gating variable)

The custom Stencil theme adds, as a **classic inline `<script>` after the deferred
module script tag** (same placement as the existing `window.B3` snippet — ordering
guarantees it runs before the app chunk evaluates):

```html
<script>
  window.BC_CONTEXT = Object.assign(window.BC_CONTEXT || {}, {
    loyalty: {
      shopKey: 'store-xxxx',                       // Influence.io shop key (public)
      apiBase: 'https://<ssw-gateway>/customers',  // digest endpoint host
      appClientId: '<ssw-app-client-id>',          // for the Current Customer JWT
    },
  });
</script>
```

- All three fields required; any missing ⇒ treat as feature off.
- Type added to the existing `BC_CONTEXT` declaration in `src/index.d.ts:61-68`.
- Presence of the object **is** the feature flag — no second toggle anywhere.
- Per-store rollout = theme change only; zero portal code change for new stores.

## Architecture

```
Stencil theme ──sets──▶ window.BC_CONTEXT.loyalty ──gates──▶ route + page
                                                                │
Browser (page api.ts)                                           │
 ├─ shop-level reads (shopKey only, no auth):                   ▼
 │    GET launcher/v1/shop/rules/earn | rules/redeem | tiers
 ├─ digest bootstrap:
 │    getCurrentCustomerJWT(appClientId) ─▶ POST {apiBase}/loyalty/digest ─▶ { digest, customerId, email }
 ├─ customer-scoped READS (identity trio + digest as QUERY PARAMS):
 │    GET  launcher/v1/customer            (balance, tier id/progress, createdAt, social flags)
 │    GET  launcher/v1/customer/points     (history, nextToken)
 │    GET  launcher/v1/customer/all-rewards (earned coupon codes, nextToken)
 └─ customer-scoped WRITES (identity + digest in the JSON BODY):
      POST launcher/v1/customer/redeem  { customer: { id, email }, shop, digest, ruleId, redemptionSource }
      POST launcher/v1/customer/social  { customer: { id, email }, shop, digest, ruleId }

Ssw.MicroServices (separate repo)
 ├─ POST /loyalty/digest : validate JWT → HMAC-SHA256(shopKey + lowercase(email) + customerId,
 │                          key = Platform API key) → { digest, customerId, email (lowercased) }
 └─ (v2, pending Q1) points/redeemed webhook → create BC coupon / store credit
```

### Page structure

```
src/pages/Loyalty/
├── index.tsx                    # gate re-check, hero, tab nav (URL param), tab switch
├── api.ts                       # digest + Launcher clients, DTOs, LoyaltyError
├── api.test.ts                  # MSW status→error table, digest flow, param/body assertions
├── components/
│   ├── LoyaltyHero.tsx          # welcome, company name, member-since & tier chips, balance
│   ├── OverviewTab.tsx          # benefits card + points/next-tier summary
│   ├── EarnPointsTab.tsx        # earn-rule cards + social action button
│   ├── RewardsTab.tsx           # redeem-rule cards, Get-reward dialog, earned coupons
│   ├── TiersTab.tsx             # tier list + defensive progress to next tier
│   └── HistoryTab.tsx           # activity list + Load more
├── index.test.tsx               # behavioral tests (desktop)
├── index.mobile.test.tsx        # viewport-500 variant
└── index.platform.test.tsx      # non-Stencil gate (vi.mock '@/utils/basicConfig')
```

### Data layer (`api.ts`)

- `getLoyaltyConfig()` / `isLoyaltyAvailable()` — lazy reads of
  `window.BC_CONTEXT?.loyalty`, **page-local only** (routeList inlines its own
  window check; see Decisions).
- `class LoyaltyError extends Error { kind: 'sessionExpired' | 'notEnrolled' | 'misconfigured' | 'rateLimited' | 'upstream' }`
  - JWT-undefined or digest-endpoint 401 → `sessionExpired` (that path is
    JWT-based, so re-login can genuinely fix it).
  - **Launcher 401 → `misconfigured`**, not `sessionExpired`: the digest is a
    timeless HMAC of stable inputs, so a Launcher 401 means identity keying or
    shop key is wrong — "sign in again" would be an unfixable lie.
  - Customer 404 → `notEnrolled` — **provisional** (sandbox item S1): the docs
    never define unknown-customer behavior, and the deprecated
    `POST /customer/auth` → "use `GET /customer`" hint suggests the GET may
    auto-enroll. A 404 is also what a keying mismatch produces, so this path
    always emits a `b2bLogger.error` diagnostic (customer id, no digest values) —
    a systemic keying bug must be distinguishable from genuine non-enrollment.
  - 429 → `rateLimited`; other/network → `upstream`.
- Normalize responses into camelCase DTOs the components own
  (`LoyaltyCustomer`, `EarnRule` — mapping `customTitle` → `title`, `RedeemRule`,
  `LoyaltyTier`, `PointActivity`, `EarnedReward`) — never leak raw API shapes into
  JSX. Unknown enum strings (`earnType`, `templateName`, activity `status`, redeem
  `status` — all undocumented upstream) pass through as plain strings and render
  generically; no exhaustive switches on them.
- react-query wiring (all `enabled` on the availability gate; customer queries
  additionally `enabled: Boolean(digest)`):

| queryKey | Fetch | Notes |
|---|---|---|
| `['loyaltyDigest', customerId]` | JWT → digest endpoint | `staleTime: Infinity` |
| `['loyaltyCustomer', customerId]` | `GET /customer` | balance, tier, createdAt, social flags |
| `['loyaltyTiers']` | `GET /shop/tiers` | shop-level, `staleTime: Infinity` |
| `['loyaltyEarnRules']` | `GET /shop/rules/earn` | shop-level, `staleTime: Infinity` |
| `['loyaltyRedeemRules']` | `GET /shop/rules/redeem` | shop-level, `staleTime: Infinity` |
| `['loyaltyRewards', customerId]` | `useInfiniteQuery`, `GET /customer/all-rewards` | paginated like history |
| `['loyaltyHistory', customerId]` | `useInfiniteQuery`, `GET /customer/points` | see below |

  Both infinite queries: `initialPageParam: undefined` (mandatory in v5),
  `getNextPageParam: (last) => last.nextToken ?? undefined`. First
  `useInfiniteQuery` usage in the repo — no in-repo precedent to copy, hence
  spelled out here.
- Mutations (auth in the **body**, not query params):
  - **redeem**: `POST /customer/redeem` body
    `{ customer: { id, email }, shop, digest, ruleId, redemptionSource }`
    (`redemptionSource` accepted values unconfirmed — sandbox item S4) → on
    success show coupon code (dialog with copy button) + invalidate
    `loyaltyCustomer`, `loyaltyRewards`, `loyaltyHistory`.
  - **social follow**: `POST /customer/social` body
    `{ customer: { id, email }, shop, digest, ruleId }` → response carries
    `updatedBalance`/`newTierId`; invalidate `loyaltyCustomer` (+ snackbar).
  - Buttons disabled while any mutation `isPending`.
- Money display (`discountValue`, gift-card amounts) through `currencyFormat`;
  point values through plain `toLocaleString`.

### Routing & gating (four registrations + the gate)

1. `routeList.ts` — entry `{ path: '/loyalty', name: 'Loyalty', wsKey: 'loyalty',
   isMenuItem: true, permissions: accountSettingPermissions, isTokenLogin: true,
   idLang: 'global.navMenu.loyalty' }`.
2. `routeList.ts` `getAllowedRoutesWithoutComponent` — inline predicate beside the
   payment-methods gate (:279-286): drop `/loyalty` when
   `platform !== 'bigcommerce' || !window.BC_CONTEXT?.loyalty || isAgenting`.
3. `routes/index.tsx` — `lazy(() => import('@/pages/Loyalty'))` + `routesMap`
   entry (skipping this crashes the route at render).
4. `en.json` — `global.navMenu.loyalty: "Rewards"` + `loyalty.*` page strings
   (tab labels per the tab map above).
5. The page early-returns a friendly "not available" state when
   `isLoyaltyAvailable()` fails or `isAgenting` (defensive fallback; unreachable
   through normal routing — tests render the component directly).

## UI states

| State | Rendering |
|---|---|
| Loading | `<B3Spin isSpinning>` overlay |
| Loaded | hero + tabs per mockup |
| Not enrolled (provisional, S1) | invite copy: "Start earning points with your first order" + earn-rules still shown (shop-level data needs no customer); always logged diagnostically |
| Session expired | warning `Alert`: sign in again |
| Misconfigured (Launcher 401) | generic error `Alert` (no re-login prompt) + `b2bLogger.error` diagnostics |
| Load error | error `Alert` + retry button (`refetch`) |
| Rate limited (429) | snackbar "Too many requests — try again in a minute" |
| Redeem success | dialog: coupon code + copy button + "apply at checkout" copy |
| Insufficient points | "Get reward" disabled with points-needed hint |
| Unavailable | friendly not-available copy (gate fallback) |

## Testing

- MSW handlers for absolute URLs on `launcher.api.influence.io` and the digest
  endpoint. Note: `startMockServer()`'s catch-all makes unmatched requests **hang**
  (tests fail by timeout, not a descriptive error) — so assert on captured
  requests (`assertQueryParams`, body captures) rather than relying on
  unhandled-request errors; a typo'd host manifests as a hang.
- Builders (faker, no hardcoded data): `buildLoyaltyCustomerWith`,
  `buildEarnRuleWith`, `buildRedeemRuleWith`, `buildTierWith`,
  `buildPointActivityWith`, `buildEarnedRewardWith`.
- `window.BC_CONTEXT = { loyalty: {...} }` set/deleted per test in
  `beforeEach`/`afterEach`; global setup never sets it, so every pre-existing test
  stays on the feature-off path.
- `index.test.tsx`: hero renders balance/tier/member-since; tab switching updates
  the URL param; earn rules render with completion chips (social flags) and
  informational-only cards; redeem happy path (confirm dialog → captured POST
  body asserted to carry `{ customer: { id, email }, shop, digest, ruleId }` →
  coupon code shown → balance query invalidated); increment-type rules filtered
  out; insufficient-points disable; history Load-more appends via `nextToken`;
  not-enrolled state; session-expired; misconfigured (Launcher 401); agenting
  (via `buildB2BFeaturesStateWith`); unavailable when `BC_CONTEXT` missing.
- `api.test.ts`: digest flow (JWT fetched fresh; **GETs** carry identity trio +
  digest as query params via `assertQueryParams`, **POSTs** carry them in the JSON
  body); `it.each` status→error-kind table including Launcher-401→`misconfigured`
  vs digest-endpoint-401→`sessionExpired`; normalization of raw payloads.
- `index.platform.test.tsx`: `platform: 'catalyst'` renders unavailable.
- `index.mobile.test.tsx`: single-column cards, scrollable tabs.

## Trust boundary & security

- `window.BC_CONTEXT.loyalty` is host-controlled trusted input (same accepted
  posture as `storeSuffix`/`paymentMethods`: the storefront host page is the trust
  boundary; XSS there already means arbitrary script).
- The Platform API key lives **only** in Ssw.MicroServices config. The digest that
  reaches the browser authorizes **reads plus self-service actions (social-earn,
  redeem) for exactly one customer**; it cannot touch other customers or perform
  admin point operations. It also **never expires** (no timestamp in the HMAC
  inputs) — a leaked digest is a permanent single-customer credential; accepted
  residual risk, same class as Influence.io's own widget deployments.
- The digest endpoint derives identity from the validated JWT server-side; the
  browser never chooses whose digest it gets.
- Coupon codes are customer-visible by design; still, don't write them (or the
  digest) to `dataLayer`/console/analytics.

## Dependencies, risks, open questions

Product/commercial questions (need answers before or early in implementation):

1. **Q1 — Who turns `couponCode` into a working BigCommerce discount?** Redemption
   returns only text; Influence.io docs: "the method by which you create a
   discount coupon in your store is completely up to you." Their native
   BigCommerce app *may* create the BC promotion itself. **Blocking for the
   Rewards tab's end-to-end value** — verify on a sandbox store / ask support. If
   the app doesn't, Ssw.MicroServices needs a `points/redeemed` webhook handler
   that creates the BC coupon (note: their webhooks document no signing — plan
   IP/secret-URL mitigation).
2. **Q2 — Undocumented `X-Bc-Auth-Token` header.** The Launcher API's CORS
   preflight whitelists it, hinting the official BC widget authenticates with a
   BigCommerce token instead of a digest. If support confirms it works for
   headless builds, the digest endpoint (our only new backend piece) disappears.
   Worth one email before building.
3. **Q3 — Customer identity keying.** The digest embeds `customerId` = "your
   internal ID". With the native BC app installed, verify it registers customers
   under the **BigCommerce customer id** (and which email casing) so our digests
   match the records the app creates; a mismatch means 404s/duplicate members.
4. **Q4 — Plan tier.** Platform API + headless widgets require Influence.io
   **Plus**. Confirm the subscription before committing.
5. **Q5 — De-scoped mockup elements** (store credit, pending points,
   free-shipping progress, missions, "Learn more"): confirm v1 omission is
   acceptable, or which (if any) justify the backend build-out in the Non-goals
   table.
6. **Q6 — Audience.** v1 shows the individual buyer's own points with
   `accountSettingPermissions`. If loyalty should instead aggregate at the
   *company* level (B2B reality: many buyers, one account), that's a different
   product — Influence.io has no company concept, and our backend would have to
   own aggregation. Confirm individual-buyer scope is intended.

Sandbox verification checklist (fold into one support thread + sandbox session):

- **S1** — What does `GET /customer` return for a valid digest of an unknown
  customer: 404, empty member, or auto-created member? (Determines whether the
  not-enrolled state exists at all.)
- **S2** — Which redeem-rule shapes does our store use — any increment-type
  (min/max redeemable points) rules that v1's fixed-cost flow would filter out?
- **S3** — Are tier `threshold` (string) and `currentLoyaltyTierProgress`
  numeric and in the same unit, so the progress bar can render?
- **S4** — Is `redemptionSource` free-form? What `status` values do redeem rules
  and point activities actually carry?
- **S5** — Does `perks[]` accept the mockup's free-text benefit copy ("shared
  account rep", "48-hour early access to closeouts")?
- **S6** — What `createdAt` do customers backfilled by the native BC app get?

Engineering risks already mitigated in the design:

- **Rate limits undocumented** upstream → app-wide `retry: false`,
  `staleTime: Infinity` on static data, single-flight queries, disabled buttons
  while pending.
- **Enum drift** (`earnType`/`templateName`/`status` undocumented) → DTOs treat
  them as opaque strings; UI renders generic fallbacks; new values degrade
  gracefully rather than crash.

## Rollout

1. Answer Q1–Q4 + run the S1–S6 sandbox checklist (one support thread + one
   sandbox session with the native BC app installed).
2. Ssw.MicroServices: digest endpoint (+ CORS for the storefront origin — same
   lesson as payment-methods Risk 1).
3. **Configure the Influence.io dashboard for the pilot store to match the
   approved mockup**: tier "SELECT" with the four benefit lines as `perks[]`,
   earn rules (2 pts/$1 purchase, 250 account creation, 100 Instagram / mailing
   list / review), and the four-reward catalog with its point costs. The page is
   fully data-driven — without this step it renders correctly but shows none of
   the approved content.
4. Portal implementation per this spec (feature-branch off `dev`; commit format
   `feat: B2B-#### Add loyalty page`).
5. Theme: add `BC_CONTEXT.loyalty` snippet on the pilot store (StoreSupply).
6. Staging smoke test: digest accepted, balance renders, redeem produces a coupon
   that actually applies at checkout (Q1 verification), history paginates, and
   **content parity with the mockup** (tier name, benefits copy, earn values,
   reward catalog).
7. Additional stores: theme snippet + Influence.io shop config only.

## Implementation slices (once approved → full plan via writing-plans)

1. Theme-contract gate: `index.d.ts` type, `isLoyaltyAvailable()`, route
   registration + inline routeList gate, empty page shell + unavailable state,
   gate tests.
2. `api.ts` digest + customer read path, hero with balance/tier/member-since.
3. Shop-level reads: Earn / Rewards(catalog) / Tiers tabs (read-only).
4. History + earned-rewards (`useInfiniteQuery`).
5. Mutations: redeem flow + coupon dialog; social-follow action.
6. Mobile pass + `index.mobile.test.tsx`; i18n sweep; lint/tsc/test gate.
