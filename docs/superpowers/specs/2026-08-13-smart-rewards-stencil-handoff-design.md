# Smart Rewards — Stencil theme port (handoff design)

**Date:** 2026-08-13
**Status:** Approved (design)
**Area:** SSW Stencil theme (target repo) · ports `b2b-buyer-portal` `/loyalty`
**Audience:** the theme team building this page. You do not need access to the
buyer-portal repo — this document, its appendices, and the badge SVG beside it
(`assets/smart-rewards-badge.svg`) are the whole contract. The two photographic
banners are already hosted on the storefront (§8).
**Source of truth for behavior:** `apps/storefront/src/pages/Loyalty/` in
`b2b-buyer-portal` @ `dev`, 2026-08-13 (see §0.1 on uncommitted work).
**Visual reference:** https://claude.ai/code/artifact/ceb5eae1-8416-4e45-8a95-c4bf1ba60899
— annotated page anatomy plus every rendered state, as a companion to this prose.

## 0. What you are building

A native-feeling BigCommerce account page at `/smart-rewards/` that reproduces
the buyer portal's Smart Rewards page in full: a branded hero with the
customer's tier, point balance and free-shipping progress, and four tabs —
**My Benefits**, **Get Rewards**, **My Rewards**, **FAQs** — including the
live redeem flow and apply-a-certificate-to-cart flow.

It is a *port*, not a redesign. The layout came from a user-supplied mock
(2026-07-27) and the copy has been revised repeatedly since; both are settled.
Rebuild the same structure in theme SCSS with the storefront's own type scale,
colors and button styles rather than carrying MUI across.

### 0.1 The reference implementation has uncommitted work

As of 2026-08-13 the portal's working tree carries substantial uncommitted
changes to the Loyalty page — the tier-restricted benefit cards, the custom
badge icon, the membership-ladder rework, hero banner tuning, and FAQ copy
edits. **This document describes the working-tree behavior**, which matches the
decisions recorded on 2026-08-03 and 2026-08-07 and is the intended end state.
Before your final parity pass, re-diff against whatever has landed on `dev`.

One concrete artifact of that WIP worth knowing: the hero's ratio-floor
`padding-bottom` is `11.25%` in the working tree while the adjacent comment
still explains a `31.25%` (= 600/1920) derivation. The comment is stale, the
value is deliberate. Don't copy the comment's arithmetic.

## 1. Placement, routing, and the login gate

BigCommerce's account routes are a **closed set** — `account.php?action=…`
values are fixed, and Stencil custom templates are supported only under
`templates/pages/custom/{brand,category,product,page}`; account pages are
explicitly excluded. A new account route is therefore not available. Build the
achievable equivalent:

| Piece | Value |
|---|---|
| Web Page (Storefront → Web Pages) | `/smart-rewards/` |
| Custom template | `templates/pages/custom/page/smart-rewards.html` |
| Chrome | render the theme's account side-nav partial so it reads as an account page |
| Login gate | server-side `{{#if customer.id}}`; anonymous → `/login.php?from=/smart-rewards/` |

Two consequences that shape the implementation:

- **Handlebars cannot read query strings.** Tab selection must happen
  client-side. Read `?tab=` on load, update it with `history.replaceState` on
  tab change (never a navigation — a real query-string change reloads the page
  and re-runs the whole data chain).
- **The `customer` context object exposes only** `id`, `email`, `first_name`,
  `last_name`, `company`, `phone`, `store_credit` — **not** customer
  attributes. The "Loyalty Tier" entitlement gate (§5) therefore needs a
  Storefront GraphQL call, exactly as the portal does today.

### 1.1 Deep links

Accept the portal's current and legacy tab values so existing bookmarks and the
in-FAQ tab links keep working:

| `?tab=` value | Resolves to |
|---|---|
| `benefits`, `get-rewards`, `my-rewards`, `faq` | itself |
| `overview`, `earn`, `tiers`, `memberships` | `benefits` |
| `redeem` | `get-rewards` |
| `history` | `my-rewards` |
| anything else / absent | `benefits` |

## 2. Page anatomy

Six regions, top to bottom. Region ownership must be exclusive — no region
half-rendered by the template and half by JS.

### 2.1 Hero

A rounded panel, `primary` background, `primary.contrastText` copy, with a
full-bleed `object-fit: cover` photo behind it.

- **Brand row** — badge icon + "Smart Rewards".
- **Greeting** — "Welcome, {name}" where name is the customer's first name,
  falling back to the company name.
- **PrePointsGate block** — *only* when SSW progress reports
  `TargetKind === 'PrePointsGate'`: an outlined CTA "Start shopping to earn
  points" linking to the storefront home, with the server's `Summary` string
  rendered verbatim beneath it. Never localize or reword `Summary`; the backend
  owns its AND/OR phrasing.
- **Tier chip** — "Current tier" label above a black chip carrying the display
  tier name (§5.3). Rendered only when a name resolves.
- **Free-shipping bar** — see §2.1.1.
- **Image behavior** — the photo is a real `<img>` with an error handler that
  hides it, not a CSS background: a 404 or not-yet-uploaded file must degrade to
  the flat panel, never a broken image. `object-position: right top` — the
  default asset's subject sits in its right third and a centered crop pushes her
  out of frame on narrow boxes.
- **Height** — the panel is content-sized, so its own aspect ratio swings with
  customer state and `cover` silently crops the photo. From the `md` breakpoint
  up, hold a ratio floor with a floated zero-width `::before`
  (`padding-bottom: 11.25%`) plus an `::after` clearfix, with the percentage
  padding on the *inner* content box (percentage padding resolves against the
  content-box width). Do **not** substitute `aspect-ratio` — it pins the height
  and clips the tallest hero states under `overflow: hidden`. Mobile stays
  content-driven.

#### 2.1.1 Free-shipping tracker

In the portal this is driven by two theme-provided window globals
(`loyaltyShippingConfig` and an async `getLoyaltyShippingCalculation()`),
because the theme owns all eligibility math — exclusions, LTL, qualification.
**In the theme those globals are your own code**, so call the module directly
rather than round-tripping through `window`.

Render rules: hidden entirely while loading, on error, and whenever the
resolved threshold is `<= 0`. Bar value is `100` when `qualifies`, otherwise
`min(100, eligibleSubtotal / threshold * 100)`. Copy above the bar switches
between the qualified and "X away" strings; below it, "{current} / {threshold}".

### 2.2 Points line

Centered, bold, directly below the hero: "You have {n} points available.",
thousands-separated. Omitted entirely when no balance has resolved — the portal
distinguishes "no balance yet" from zero, and so should you.

### 2.3 My Benefits

Section order, top to bottom:

1. **Intro line** — "Here's a quick guide to your {tier} benefits…", or the
   generic variant when no tier name resolves.
2. **Membership perks panel** — blue panel, badge icon, "Your {membership}
   benefits" + the perk bullets. Rendered only when the customer has a current
   membership *with* at least one perk.
3. **Banner** — blue panel with an inset photo on its right 45% (`md` and up
   only; hidden on mobile) and an uppercase heading, "Here's how your {tier}
   rewards work". Same `<img>` + error-handler treatment as the hero. The photo
   is 3:2 with the subject's head near the top, so bias the crop upward
   (`object-position: center 20%`).
4. **Info cards** — see §2.3.1.
5. **Membership ladder** — see §2.3.2.
6. **Tier progress card** — see §2.3.3.
7. **Contact line** — "Questions? Contact us at 1-833-397-2619".
8. **Order CTA** — full-width green button, "Place your next order", to the
   storefront home. The green is literal (`#0e7d3b`, hover `#0b642f`), not a
   palette color: in the portal `primary` is merchant-configurable. Match the
   literal, or map it to the theme's own success/CTA token deliberately.

#### 2.3.1 Info cards

Grey (`#ededed`) cards, each with a colored title, an icon top-right, and a
bulleted list. Three are universal; two are tier-restricted.

| Card | Shown to | Notes |
|---|---|---|
| Earning and Redeeming Credit | everyone | 4 bullets; bullet 2 is the tier rate — see below |
| Free Shipping | everyone | 2 bullets, fixed |
| Your Tier Status | everyone | bullet 2 is a maintenance threshold, present only for Select/Signature |
| Account Rep | **Select and Signature only** | 1 bullet, contains the rep phone and email |
| Early Access | **Select and Signature only** | title and bullet 1 differ between the two tiers |

Two different tier signals are in play here and they are **not**
interchangeable:

- **Copy selection** (the credit-rate bullet) keys on the *display* tier name,
  which tolerates the Influence fallback. Unmatched → the rate-less generic
  line.
- **Visibility** (Account Rep, Early Access, the maintenance bullet) keys on
  the SSW `CurrentTierName` **only**, and fails closed. The display name's
  fallback is the Influence tier that was removed from this tab for placing
  customers on the wrong level; gating on it would leak the rep's direct phone
  number and an early-access promise to Essential customers whenever SSW is
  unavailable.

#### 2.3.2 Membership ladder

Heading "What's Available as Your Orders Grow?", an intro line whose wording
depends on how many levels remain (one vs. two), then one blue card per
membership above the customer's current one, then "When you reach the next
level, your tier upgrades automatically."

Anchoring rules:

- The ladder order is the literal `essential → select → signature`.
- The anchor is the SSW `CurrentTierName`, lowercased and trimmed. If it is
  absent or not in the ladder, **render nothing** — we cannot say what is
  "above" an unknown position.
- If SSW reports `AtTop`, render nothing.
- Cards are the memberships fetched from Influence, matched by title. If none
  of the levels above the anchor exist in that list, render nothing.
- Each card shows: "{Title} Tier" + an outward-arrow icon, a quota line, the
  membership `description` in parentheses when non-blank, and the perks joined
  by commas.
- **The quota line keys on the card's own membership, not the customer's
  tier.** Each card advertises the level it is selling. Keying it on the
  customer is a plausible-looking bug that only a per-card test catches.

#### 2.3.3 Tier progress card

Rendered **only** when SSW progress reports `TargetKind === 'NextTier'`.
Tinted panel, heading "Progress to {tier} Tier", then up to two labeled
progress bars: spend (only when a spend target is set) and orders (only when an
order target is set), each capped at 100%. `PrePointsGate` is surfaced by the
hero, not here; `AtTop` and any unrecognized kind render nothing.

### 2.4 Get Rewards

Section header "Get Rewards", the intro line "Redeem your available points for
certificates", then a wrapping grid of outlined cards — one per redeemable
rule, ascending by point cost. Each card: an icon, the rule title, "{n} points",
and a "Get reward" button disabled while a redeem is in flight or when the cost
exceeds the customer's balance.

**Catalog filtering** — a rule is shown only when all hold:

- it has a fixed point cost;
- it has neither a min nor a max redeemable-points value (variable-amount
  redemption is unsupported — log and hide);
- its status is empty or `active`, case-insensitively (anything else — log and
  hide).

**Icon selection** is a keyword match over `title + redeemType`, lowercased, in
this order: `ship` → shipping icon; `gift` → gift icon; any of
`discount`/`percent`/`%`/`off`/`$` → offer/tag icon; otherwise a generic
gift-card icon.

**Redeem flow** — click opens a confirm dialog ("Redeem {reward} for {points}
points?"). On confirm, POST the redemption, then:

- refresh the customer (point balance) and the earned-rewards list *regardless
  of outcome* — upstream may have deducted points even when it returns no
  coupon code;
- if the response carries **no coupon code**, treat it as a failure even on a
  200 and show the generic error;
- otherwise show a success dialog: "Your certificate is ready — you'll find it
  in the My Rewards tab."

Dialogs must not participate in the card grid's layout. In the portal, an
always-mounted dialog wrapper consumed grid gap and shrank the last card;
whatever your dialog mechanism, keep it out of the flex flow.

### 2.5 My Rewards

Two intro lines, then one tinted row per earned certificate showing the
uppercase title and an action, then a contextual hint line, then a "Load more"
button while the cursor says there are further pages.

Row actions:

- The row whose code the cart reports as applied shows "Applied to your cart"
  plus a **Remove** button.
- Every other row shows **Apply to cart**, disabled while any write is in
  flight, while *any* coupon is already on the cart, or when there is no cart.
- Rows with a blank coupon code show no action at all.

Matching a reward to an applied code is case-insensitive and trim-tolerant —
BigCommerce normalizes coupon codes, so what Influence issued and what the cart
reports back can differ in case. Blank never matches blank. Match on reward
**id**, so two rewards sharing a code cannot both render as applied.

Hint line, first match wins:

| Condition | Message |
|---|---|
| a reward is applied | only one reward per order; remove it to use a different one |
| some coupon applied, matching no loaded reward, **and** the reward list has resolved | a discount code is already applied |
| cart read succeeded but there is no cart | add items to your cart first |
| cart read failed | generic error |

The second row's "reward list has resolved" guard matters: the earned list
needs three hops (jwt → digest → all-rewards) while the cart read is one, so
without it the wrong hint flashes on every visit where a reward *is* applied.

Empty state (list resolved, zero items): "You haven't redeemed any rewards yet.
Visit Get Rewards to turn your points into store credit."

Write outcomes: both apply and remove return the recomputed cart, so the new
applied set is normally readable straight off the response — but a 204 or
otherwise unreadable body is **not** a failure, just unreadable; report success
and resync from the server. On any error, resync too: the write may have failed
because our view of the cart was stale. Apply errors map to specific copy
(empty cart / rejected / generic); remove errors are always generic, because
"may have already been used" is wrong for a removal.

### 2.6 FAQs

Section header "FAQs", then seven titled sections, each a group of accordions —
question as the summary, answer paragraph and/or bullet list as the body. No
data calls. Full content in **Appendix C**.

Three answers carry links mid-sentence: two `mailto:`/`tel:` contact links, and
three in-page links that switch tabs. The tab links must be real buttons that
change tab state, **not** anchors with fragment hrefs.

## 3. Configuration contract

The portal reads its config from `window.BC_CONTEXT.loyalty`, which the theme
emits. In the theme, read your own settings directly and keep emitting
`BC_CONTEXT` unchanged for the portal during the dual-run period (§7).

| Key | Required | Purpose |
|---|---|---|
| `shopKey` | yes | Influence.io shop key (public) |
| `apiBase` | yes | SSW gateway, **must end in `/customers`** |
| `appClientId` | yes | SSW app client id used to mint the Current Customer JWT |
| `siteName` | for tier progress | SSW site key, e.g. `StoreSupply` |
| `tierAttributeId` | for the entitlement gate | entityId of the "Loyalty Tier" customer attribute |
| `bannerUrl` | no | hero image override; default `/content/images/loyalty/loyalty-account-banner.jpg` |
| `benefitsBannerUrl` | no | benefits image override; default `/content/images/loyalty/loyalty-benefits-banner.jpg` |

### 3.1 Two config values are missing in production today

Measured on both environments on 2026-08-10: `BC_CONTEXT.loyalty` ships
`shopKey`, `apiBase`, `appClientId` and `bannerUrl`, but **no
`tierAttributeId`** at all, and production carries `siteName: ''`.

Consequences, both silent:

- Without `siteName`, SSW tier progress never resolves — which means **no
  progress card, no ladder, and none of the tier-restricted benefit cards**,
  because those fail closed by design. The page looks fine and is missing half
  its content.
- Without `tierAttributeId`, the entitlement gate is inert and Smart Rewards is
  visible to everyone (fail-open by design).

Fixing both is theme-side work and belongs in this port. Sandbox's attribute
entityId is `2`; confirm production's with
`GET /v3/customers/attributes?name=Loyalty Tier` on the Management API before
setting it. Re-verify current values by curling the storefront and grepping for
the key — this is the fourth time a `BC_CONTEXT` key has been assumed present
and wasn't, and absent keys log nothing.

## 4. Data contract

Five sources. Full request/response shapes, field-by-field, in **Appendix A**.

```
GET  /customer/current.jwt?app_client_id={appClientId}     same origin, ~15s TTL
  └─> POST {apiBase}/loyalty/digest  { jwt }               → { digest, customerId, email }
        └─> Influence Launcher  https://launcher.api.influence.io/launcher/v1
              GET  /customer                 (digest-gated)
              GET  /customer/all-rewards     (digest-gated, paginated)
              POST /customer/redeem          (digest-gated)
              GET  /shop/tiers               (shop-scoped, public)
              GET  /shop/memberships         (shop-scoped, public)
              GET  /shop/rules/redeem        (shop-scoped, public)

GET  {apiBase}/loyaltycustomersclient/GetDetailWithProgress   independent, unauthenticated
GET/POST/DELETE  /api/storefront/carts, /checkouts/{id}/coupons   same origin, CSRF-protected
```

Rules that are easy to get wrong and expensive to rediscover:

- **Mint a fresh JWT for every digest call.** It lives about 15 seconds.
- **Both SSW endpoints speak PascalCase** (.NET/Newtonsoft). The digest
  endpoint may return either casing — accept both.
- **Cart writes need `X-SF-CSRF-TOKEN`** echoing the `SF-CSRF-TOKEN` cookie, or
  BigCommerce answers 403. Omit the header entirely when the cookie is absent —
  a blank value reads as a mismatch and is rejected, while presenting no token
  at all is accepted.
- **`GET /api/storefront/carts` returns an array**, and 404 or 204 means "no
  active cart", not a failure.
- **Relabel "coupon" as "certificate"** on read, for both redeem-rule titles and
  earned-reward titles, preserving case (`coupons` → `certificates`, `COUPON` →
  `CERTIFICATE`, `Coupon` → `Certificate`). This is done on read rather than
  upstream because an issued reward keeps the title it was created with.
- **Tier progress must never block first paint** (~1.7s observed) and must
  never surface an error — it fails quiet.

### 4.1 Error taxonomy

| Kind | Raised by | Page treatment |
|---|---|---|
| `sessionExpired` | no JWT, or digest endpoint 401 | warning banner, "session has expired — please sign in again" |
| `notEnrolled` | Launcher 404 on a customer-scoped call | info banner, "Start earning points with your first order." |
| `misconfigured` | Launcher 401 | error banner + retry; **never** "sign in again" — the digest is a timeless HMAC and re-login cannot fix it |
| `rateLimited` | any 429 | on writes, a toast carrying the rate-limit copy; on reads it falls into the same load-error banner as `upstream` and the customer sees "We couldn't load your rewards." — the rate-limit wording is a write-path message only |
| `upstream` | network failure, 5xx, anything else | error banner + retry |

Log distinguishing diagnostics on the JWT-absent and 401 paths specifically —
a pure configuration error is otherwise indistinguishable from a genuinely
expired session, and the user-facing message is identical by design.

## 5. Gates and failure posture

| Gate | Source | Posture | Effect when it closes |
|---|---|---|---|
| Feature configured | `shopKey` + `apiBase` + `appClientId` all present | absent = off | page not linked; direct visit → generic unavailable message |
| Signed in | `customer.id` | — | redirect to login |
| Entitlement | "Loyalty Tier" customer attribute, via Storefront GraphQL | **fail open** | hidden only on a successfully-read, blank value |
| Rollout allowlist | `loyaltyRolloutConfig.allowedTiers` CSV vs the **Influence** tier title | **fail closed** when the list is non-empty | unavailable message, no hero/tab flash |
| Tier-restricted content | SSW `CurrentTierName` only | **fail closed** | those blocks absent |

### 5.1 Entitlement fails open, deliberately

The gate closes only on a successfully-read, blank attribute value. "We could
not find out" is not a verdict about this customer, and treating it as one
would hide Smart Rewards from everybody the moment the attribute id drifted or
the schema changed.

One BigCommerce quirk that has already cost a debugging cycle: `attribute` echoes
the attribute **name** only when the customer has a value record. A never-set
attribute arrives with an empty name and a null value. Any id-drift name check
must therefore fire only on a **non-empty, different** name — checking for
"name mismatch" against an empty string makes every unenrolled customer
fail open and the gate can never close.

### 5.2 Allowlist fails closed

Parse the CSV by trimming, lowercasing and dropping blanks. An empty list means
everyone. A null or blank tier title never matches a non-empty list. While the
verdict is still pending, render **nothing** — no hero, no tabs — so a
possibly-denied member never sees a flash of the page. This mirrors the theme's
own existing enforcement points; keep the two implementations identical.

### 5.3 Two tier names, three uses

SSW's tier model and Influence's can disagree for the same customer. Keep the
three uses separate:

| Use | Source |
|---|---|
| Display (hero chip, headings, intro copy) | SSW name, falling back to Influence |
| Rollout allowlist gate | Influence title **only** |
| Content visibility + ladder anchoring | SSW name **only**, fail closed |

## 6. State matrix

| Situation | Hero | My Benefits |
|---|---|---|
| `PrePointsGate` | CTA + `Summary` line | no progress card |
| `NextTier` | no CTA | progress card with up to two bars |
| `AtTop` | no CTA | no progress card, **no ladder** |
| progress unavailable (`siteName` absent, endpoint down, `Success:false`, unknown kind) | no CTA, display name falls back to Influence | no progress card, no ladder, no tier-restricted cards |
| Essential | — | generic-or-Essential credit line; no rep/early-access cards; no maintenance bullet |
| Select | — | 2% credit line; both restricted cards, 48-hour wording; Select maintenance bullet |
| Signature | — | 3% credit line; both restricted cards, one-week wording; Signature maintenance bullet |
| tier name unknown | chip hidden | generic intro and credit line; nothing restricted |
| first name blank | greeting falls back to company name | — |
| banner image 404s | flat panel, no broken image | same for the benefits banner |
| no memberships in Influence | — | membership panel and ladder both absent |
| zero earned rewards | — | My Rewards empty-state line |
| no cart | — | My Rewards apply buttons disabled + hint |
| another coupon applied | — | apply disabled + "a discount code is already applied" |

## 7. Cutover

Ship the theme page alongside the portal page. A new
`BC_CONTEXT.loyalty.themePageUrl` key makes the portal's `/loyalty` route
navigate the top-level window to the theme page instead of rendering its own —
absent key means today's behavior, so the switch is a config change and the
rollback is deleting a value. The portal keeps its nav item, so the entry point
and its entitlement gating are untouched.

The portal's page folder, locale keys, route and its 2,296-line test suite are
removed in a **separate** change, after the theme page is verified live on both
sandbox and production.

## 8. Assets and icons

| Asset | Where |
|---|---|
| Hero banner, 1920×600 | `/content/images/loyalty/loyalty-account-banner.jpg` — already live on both environments |
| Benefits banner, 1347×898 | `/content/images/loyalty/loyalty-benefits-banner.jpg` |
| Smart Rewards badge | `assets/smart-rewards-badge.svg`, beside this spec — extracted from the portal, `fill="currentColor"`, drop straight into the theme |

Both banners are storefront-hosted, never bundled: a bundled asset would bake a
per-environment URL into the artifact, and a seasonal swap would need a deploy.
They are served with a 10-second max-age, so overwriting over WebDAV goes live
in about ten seconds.

Icons in use, by role — map each to the theme's own icon set: badge/premium
(brand row, tier chip, membership panel), savings (credit card), local shipping
(shipping card and shipping-type rewards), trending-up (tier status), support
agent (account rep), lock-clock (early access), outward arrow (ladder cards),
chevron (accordion), gift and tag and gift-card (reward catalog).

## 9. Acceptance criteria

Parity is judged against the portal page, side by side, signed in as the same
customer.

1. Anonymous visit redirects to login and returns to the page after sign-in.
2. All four tabs render; every legacy `?tab=` value lands on the right tab;
   changing tabs updates the URL without reloading.
3. Hero shows the right tier chip, point balance and greeting, and the greeting
   falls back to company name when the first name is blank.
4. A `PrePointsGate` account shows the CTA and the server summary; a `NextTier`
   account shows neither, and shows the progress card instead.
5. An Essential account sees **no** Account Rep card, **no** Early Access card
   and **no** maintenance bullet — verified in **view-source**, not just
   visually.
6. A Select account sees the 48-hour wording; a Signature account sees the
   one-week wording and the higher maintenance thresholds.
7. The ladder shows exactly the levels above the customer's SSW tier, each
   card's quota line matching the level it advertises, and is absent for an
   `AtTop` customer.
8. Redeem deducts points, and the certificate appears under My Rewards without
   a manual refresh.
9. Apply puts the code on the cart and the row flips to "Applied"; remove
   reverses it; a second reward cannot be applied while one is on the cart.
10. With `siteName` unset, the page still renders — minus progress, ladder and
    restricted cards — with no error banner.
11. With the allowlist populated and the customer excluded, nothing renders
    but the unavailable message, with no flash of hero or tabs.
12. Mobile: hero copy legible over the photo, benefits banner photo hidden,
    tabs scrollable, nothing clipped.

## 10. Open questions for SSW

1. **`redemptionSource`** on redeem is `'buyer-portal'` today. Keep it for
   continuity in Influence reporting, or use a distinct value so the two
   surfaces are separable in analytics?
2. **Masquerade.** The portal hides Smart Rewards while a B2B rep is
   masquerading, because the identity chain resolves to the *rep*. The theme
   page has no masquerade concept and will show the rep their own loyalty data
   — technically correct, but easy to misread as the buyer's. Hide the account
   nav link while masquerading, or accept it?
3. **Config source of truth.** Recommendation: theme settings are canonical and
   `BC_CONTEXT` is emitted *from* them, so the two surfaces cannot drift.

## 11. Non-goals

- The points ledger / history, social-follow earning, membership enroll/join,
  referrals and stamp cards. All exist in Influence; none are in this page.
- Localization beyond `en`.
- Any copy rewrite. Appendix B is verbatim and settled.
- Authenticating `GetDetailWithProgress`. It is unauthenticated by accepted
  decision, with a standing backend follow-up; this port neither fixes nor
  worsens it. Do not add new PII to what the page reads from it.
- Deleting the portal page (§7 — separate change).

---

# Appendix A — API contract

## A.1 Current Customer JWT

```
GET {origin}/customer/current.jwt?app_client_id={appClientId}
→ 200 text/plain  <jwt>
```

Lives ~15 seconds; fetch fresh per digest call. Returns nothing useful when the
storefront session has expired, and also when the app that owns `appClientId`
is not installed on the store — log enough to tell those apart.

## A.2 SSW digest

```
POST {apiBase}/loyalty/digest
Content-Type: application/json
{ "jwt": "<jwt>" }

→ 200 { "Digest": "<64-char hex>", "CustomerId": "80591", "Email": "buyer@example.com" }
```

Accept either casing (`digest`/`Digest`, `customerId`/`CustomerId`,
`email`/`Email`). Coerce `customerId` to a string.

- `401` → `sessionExpired`; also fires when `appClientId` does not match the
  backend configuration.
- `429` → `rateLimited`. Other non-2xx and network failure → `upstream`.
- A `404` here means `apiBase` is missing its `/customers` path segment.

The digest is `HMAC-SHA256(shopKey + lowercase(email) + customerId)` keyed by
Influence's Platform API key. It is a timeless HMAC of stable inputs — never
log it, and never treat its rejection as a session problem.

## A.3 Influence Launcher

Base: `https://launcher.api.influence.io/launcher/v1`

Customer-scoped calls take these query params:
`shop={shopKey}`, `customer_id`, `customer_email`, `digest`.

### `GET /customer`

```json
{ "pointBalance": 46834,
  "currentLoyaltyTierId": "29777d36-…",
  "currentLoyaltyTierProgress": 0.42,
  "createdAt": "2026-03-11T…",
  "followInstagram": false, "followTikTok": false,
  "followTwitter": false, "likeFacebook": false,
  "currentMembership": { "id": 7, "title": "Select", "perks": ["…"] } }
```

Defaults on absence: balance `0`, ids/objects `null`, booleans `false`. `404`
→ `notEnrolled` (genuinely unknown customer, **or** a digest identity that does
not match Influence's records — log the customer id, never the digest).

### `GET /shop/tiers?shop=` → `{ "rules": [ { id, title, threshold, perks[] } ] }`

Public. Used for the Influence tier title behind the allowlist gate.

### `GET /shop/memberships?shop=` → `{ "memberships": [ { id, title, description, perks[] } ] }`

Public. Drives the ladder cards.

### `GET /shop/rules/redeem?shop=`

```json
{ "rules": [ { "id": 12, "title": "$5 off coupon", "customTitle": null,
               "pointCost": 500, "redeemType": "fixed_amount",
               "status": "active",
               "minRedeemablePoints": null, "maxRedeemablePoints": null } ] }
```

Prefer `customTitle` over `title`; relabel coupon→certificate. Filtering rules
in §2.4.

### `POST /customer/redeem`

```json
{ "customer": { "id": "80591", "email": "buyer@example.com" },
  "shop": "<shopKey>", "digest": "<digest>",
  "ruleId": "12", "redemptionSource": "buyer-portal" }

→ { "success": true, "couponCode": "SR-5OFF-ABC123" }
```

A 200 with no `couponCode` means nothing redeemable was created — treat as
failure. See open question 1 on `redemptionSource`.

### `GET /customer/all-rewards` (+ optional `nextToken`)

```json
{ "items": [ { "id": 991, "couponCode": "SR-5OFF-ABC123",
               "title": "$5 off coupon", "createdAt": "2026-08-01T…" } ],
  "nextToken": "…" }
```

Paginate on `nextToken`; treat an empty string as "no more pages", not as a
cursor — a blank token that round-trips refetches page one forever.

### Launcher status mapping

`401` → `misconfigured` (identity keying or shop key mismatch; log it).
`404` → `notEnrolled` on customer-scoped reads, `upstream` on shop-scoped ones.
`429` → `rateLimited`. Everything else → `upstream`.

## A.4 SSW tier progress

```
GET {apiBase}/loyaltycustomersclient/GetDetailWithProgress
    ?site={siteName}
    &bigCommerceStoreId={store hash}
    &bigCommerceCustomerId={customer id}
    &recentTransactionsTake=0
```

```json
{ "Success": true,
  "Result": { "TierProgress": {
      "CurrentTierName": "Select", "TargetKind": "NextTier",
      "TargetTierName": "Signature",
      "OrdersInWindow": 11, "TargetOrdersRequired": 16,
      "SpendInWindow": 3120.55, "TargetAmountRequired": 5000,
      "OrdersProgressPct": 68.75, "SpendProgressPct": 62.41,
      "Summary": "Spend $1,879.45 more to reach Signature." } } }
```

Treat as "no progress" when `Success` is not `true`, when `TierProgress` is
absent, or when `TargetKind` is anything other than `NextTier`,
`PrePointsGate`, `AtTop` — an unrecognized kind must opt **in**, never inherit
behavior. Keep `recentTransactionsTake=0` and map only these nine fields; the
endpoint returns PII this page has no use for.

`429` → `rateLimited`; anything else non-2xx → `upstream`. Either way the page
renders without the card and **without** an error banner.

## A.5 BigCommerce Storefront cart

```
GET    /api/storefront/carts                                  → RawCart[]
POST   /api/storefront/checkouts/{cartId}/coupons             { "couponCode": "…" }
DELETE /api/storefront/checkouts/{cartId}/coupons/{urlEncodedCode}
```

Same origin, `credentials: 'same-origin'`, no bearer token. Writes require
`X-SF-CSRF-TOKEN` = the `SF-CSRF-TOKEN` cookie value; omit the header entirely
when the cookie is absent. Reads are unprotected.

Write error mapping: an `empty_cart` error type → empty-cart copy; `401`/`403`
→ generic (a broken session or CSRF configuration, never a statement about the
coupon); any other `4xx` → "rejected" copy; `5xx` and network → generic. Both
writes return the recomputed checkout; an unreadable body is still a success.

The coupon code travels in the DELETE path and may contain spaces — URL-encode
it.

---

# Appendix B — Copy inventory

Verbatim from the portal's `en.json`, 2026-08-13. Placeholders in `{braces}`
are ICU-style single-substitution; map them to the theme's own i18n syntax.
Numbers are thousands-separated at the call site; currency uses the store's
format.

```json
{
  "loyalty.unavailable": "Rewards are not available.",
  "loyalty.sessionExpired": "Your session has expired — please sign in again.",
  "loyalty.notEnrolled": "Start earning points with your first order.",
  "loyalty.loadError": "We couldn't load your rewards.",
  "loyalty.retry": "Try again",
  "loyalty.shipping.away": "{amount} away from FREE shipping",
  "loyalty.shipping.progress": "{current} / {threshold}",
  "loyalty.shipping.qualified": "You've earned FREE shipping!",
  "loyalty.hero.brand": "Smart Rewards",
  "loyalty.hero.welcomeBack": "Welcome, {name}",
  "loyalty.hero.cta": "Start shopping to earn points",
  "loyalty.hero.currentTier": "Current tier",
  "loyalty.hero.points": "You have {points} points available.",
  "loyalty.tabs.benefits": "My Benefits",
  "loyalty.tabs.getRewards": "Get Rewards",
  "loyalty.tabs.myRewards": "My Rewards",
  "loyalty.tabs.faq": "FAQs",
  "loyalty.tiers.progressTo": "Progress to {tier} Tier",
  "loyalty.progress.spendOf": "{spent} of {target}",
  "loyalty.progress.ordersOf": "{current} of {target} orders",
  "loyalty.benefits.introGuide": "Here's a quick guide to your {tier} benefits and how to get the most from them.",
  "loyalty.benefits.introGuideGeneric": "Here's a quick guide to your benefits and how to get the most from them.",
  "loyalty.overview.membershipBenefitsTitle": "Your {membership} benefits",
  "loyalty.benefits.bannerTitle": "Here's how your {tier} rewards work",
  "loyalty.benefits.bannerTitleGeneric": "Here's how your rewards work",
  "loyalty.benefits.credit.title": "Earning and Redeeming Store Certificates",
  "loyalty.benefits.credit.point1": "Every purchase earns you points, based on your tier rate.",
  "loyalty.benefits.credit.point2Essential": "Once you reach $500 in annual purchases, your rate is 1% of your total order.",
  "loyalty.benefits.credit.point2Select": "Your rate is 2% of your total order.",
  "loyalty.benefits.credit.point2Signature": "Your rate is 3% of your total order.",
  "loyalty.benefits.credit.point2Generic": "Your rate depends on your membership tier.",
  "loyalty.benefits.credit.point3": "Redeem your points for a certificate on the 'Get Rewards' page.",
  "loyalty.benefits.credit.point4": "Certificates can be used alongside product discounts.",
  "loyalty.benefits.shipping.title": "Free Shipping",
  "loyalty.benefits.shipping.point1": "Orders over $300 ship ground for free, every time.",
  "loyalty.benefits.shipping.point2": "You'll see your progress toward the $300 threshold in your cart, so you always know where you stand before you check out.",
  "loyalty.benefits.tierStatus.title": "Your Tier Status",
  "loyalty.benefits.tierStatus.point1": "We look at your orders over the past 12 months, updated monthly, to determine your tier.",
  "loyalty.benefits.tierStatus.maintainSelect": "To maintain Select: place 8+ orders per year, and/or $2,000+ in annual purchases.",
  "loyalty.benefits.tierStatus.maintainSignature": "To maintain your Signature tier: place 16+ orders per year, and/or $5,000+ in annual purchases.",
  "loyalty.benefits.tierStatus.point2": "If your tier is ever going to change, we'll let you know 30 days in advance.",
  "loyalty.benefits.accountRep.title": "Account Rep",
  "loyalty.benefits.accountRep.point1": "You have an account rep for orders, product sourcing and stock questions. Reach our rep at 833-397-2619 or contactsmartrewards@storesupply.com.",
  "loyalty.benefits.earlyAccess.titleSignature": "One-Week Early Access",
  "loyalty.benefits.earlyAccess.titleSelect": "48-Hour Early Access",
  "loyalty.benefits.earlyAccess.point1Signature": "You'll see new products and closeout deals a full week early, with first pick on limited stock and new arrivals.",
  "loyalty.benefits.earlyAccess.point1Select": "You'll see closeout deals 48 hours early, with first pick on limited stock.",
  "loyalty.benefits.earlyAccess.point2": "When early access items are available, we'll email you.",
  "loyalty.benefits.nextTiersTitle": "What's Available as Your Orders Grow?",
  "loyalty.benefits.nextTiersIntroOne": "As your orders grow, so do your rewards. One more level is available:",
  "loyalty.benefits.nextTiersIntroMany": "As your orders grow, so do your rewards. Two more levels are available:",
  "loyalty.benefits.nextTierName": "{title} Tier",
  "loyalty.benefits.nextTierQuotaSelect": "(8+ orders/year and/or $2,000+ annual spend)",
  "loyalty.benefits.nextTierQuotaSignature": "(16+ orders/year and/or $5,000+ annual spend)",
  "loyalty.benefits.autoUpgrade": "When you reach the next level, your tier upgrades automatically.",
  "loyalty.benefits.contact": "Questions? Contact us at 1-833-397-2619",
  "loyalty.benefits.orderCta": "Place your next order",
  "loyalty.redeem.intro": "Redeem your available points for certificates",
  "loyalty.redeem.pointCost": "{points} points",
  "loyalty.redeem.getReward": "Get reward",
  "loyalty.redeem.confirmTitle": "Redeem reward?",
  "loyalty.redeem.confirmContent": "Redeem {reward} for {points} points?",
  "loyalty.redeem.cancel": "Cancel",
  "loyalty.redeem.confirm": "Redeem",
  "loyalty.redeem.couponTitle": "Your certificate",
  "loyalty.redeem.close": "Close",
  "loyalty.redeem.findInMyRewards": "Your certificate is ready — you'll find it in the My Rewards tab.",
  "loyalty.myRewards.introRedeemed": "Here's what you've redeemed and have ready to use.",
  "loyalty.myRewards.introApply": "Apply one to your cart below — only one reward can be used per order.",
  "loyalty.myRewards.empty": "You haven't redeemed any rewards yet. Visit Get Rewards to turn your points into store certificates.",
  "loyalty.myRewards.apply": "Apply to cart",
  "loyalty.myRewards.remove": "Remove",
  "loyalty.myRewards.removeSuccess": "Reward removed from your cart.",
  "loyalty.myRewards.appliedStatus": "Applied to your cart",
  "loyalty.myRewards.applySuccess": "Reward applied to your cart.",
  "loyalty.myRewards.needsCart": "Add items to your cart before applying a reward.",
  "loyalty.myRewards.oneAtATime": "Only one reward can be applied per order. Remove the applied reward to use a different one.",
  "loyalty.myRewards.otherCoupon": "A discount code is already applied to your cart. Only one code can be used per order.",
  "loyalty.myRewards.rejected": "This reward couldn't be applied. It may have already been used.",
  "loyalty.loadMore": "Load more",
  "loyalty.errors.rateLimited": "Too many requests — please try again in a minute.",
  "loyalty.errors.generic": "Something went wrong. Please try again."
}
```

### B.1 A "credit → certificates" wording migration is in flight

Two of the strings above changed while this document was being written:
`credit.title` became "Earning and Redeeming Store Certificates" and
`myRewards.empty` now ends "…into store certificates". The inventory carries the
newer wording, but the change is uncommitted, so the direction is settled and
the exact final strings are not. Several neighbouring strings still say
"credit" — `credit.point1`, `credit.point2*`, the FAQ's "Earning and Redeeming
Credit" section title — so expect a second pass. Re-sync the inventory against
`en.json` before launch rather than treating this appendix as frozen.

### B.2 The same thresholds live in three places

Changing a tier's quota means updating all three, and only two are copy:

1. `tierStatus.maintainSelect` / `maintainSignature` — "To maintain…"
2. `nextTierQuotaSelect` / `nextTierQuotaSignature` — the ladder parenthetical
3. The Influence admin's `membership.description`, which is deliberately
   buyer-facing admin-managed copy and renders on the ladder card *below* (2)

Because (2) sits above (3), a Select ladder card currently renders two
near-duplicate parentheticals differing only in "or" vs "and/or" and a trailing
" :". The fix is to clear or repurpose `description` in the Influence admin, not
to change code. Copy asymmetry between the two maintenance lines ("To maintain
Select:" vs "To maintain your Signature tier:") is as-authored — keep it.

---

# Appendix C — FAQ content

Seven sections, 32 items, verbatim as of 2026-08-13. Items marked **·link·**
contain inline links; everything else is plain text. See B.1 — this content is
mid-migration and should be re-synced before launch.

**Contact details used throughout:** `contactsmartrewards@storesupply.com`,
`1-833-397-2619` (dial `+18333972619`).

## About Smart Rewards

**What is Smart Rewards?**
A free rewards program for Store Supply Warehouse customers. Every qualifying
purchase earns you points that convert into store certificates you can use on
future orders. You also get free ground shipping on orders over $300, and at
higher tiers, early access to new products and an account rep.

**Does it cost anything to be in the program?**
No. There's no cost to be in Smart Rewards.

**Do I need to sign up?**
No. If you're an existing Store Supply Warehouse customer, you're already in.
Your tier is based on your ordering history.

**Who is eligible?**
All Store Supply Warehouse customers. Your tier is determined by your
purchasing activity over the past 12 months.

## Program Tiers

**What are the different program tiers?**
Smart Rewards has three tiers. Every purchase earns you points based on your
tier's rate, calculated on your order total after discounts, excluding tax and
shipping. Your points can be redeemed for store certificates.
- Essential: 1% rate (after $500 in annual purchases), free ground shipping on orders over $300.
- Select: 2% rate, free ground shipping on orders over $300, an account rep, and 48-hour early access to closeouts and new products.
- Signature: 3% rate (the highest), free ground shipping on orders over $300, an account rep, and 1-week early access to closeouts and new products.

**How is my tier determined?**
We look at your order count and annual spend over the past 12 months, updated
monthly.

**What do I need to qualify for each tier?**
- Essential: You're in after your first order.
- Select: 8+ orders per year, or $2,000+ in annual purchases.
- Signature: 16+ orders per year, or $5,000+ in annual purchases.

**How do I move up to a higher tier?**
When your orders reach the next tier's threshold, you move up automatically. No
application needed. We check monthly, so you'll move as soon as you qualify.

**Can my tier go down?**
Yes. If your ordering falls below your current tier's threshold over a 12-month
period, your tier may change. We'll give you 30 days' notice before any change
takes effect.

**How often is my tier reviewed?**
Monthly. We look at your orders from the past 12 months.

**Where can I see my current tier?** ·link·
Your tier and benefits are on the **My Benefits** tab. *(link switches to the
benefits tab)*

## Earning and Redeeming Store Certificates

**How do I earn store certificates?**
Each purchase earns you points based on your tier's rate (1% for Essential, 2%
for Select, 3% for Signature). Points are calculated on your order total after
any discounts, excluding tax and shipping charges.

**How do I redeem my points?**
You'll receive an email when points are in your account. You redeem points for
store certificates. You can then apply the certificates to any future order.

**How long are my store certificates valid?**
12 months from the date they're issued.

**Can I use store certificates with other discounts?**
Yes. Store certificates work alongside product discounts on the same order.

**Is there a limit on how many store certificates I can use per order?**
One store certificate per order. Certificates cannot be transferred to other
accounts.

**What counts toward my points calculation?**
Your invoice total after product discounts, excluding tax and shipping charges.
If you return an item, the refund amount is deducted from your next point
calculation.

**Do I earn points on every order at the Essential level?**
At the Essential tier, you earn at a 1% rate once you reach $500 in annual
purchases. After that threshold, your purchases earn points for the remainder of
the year.

## Free Shipping

**How does free shipping work?**
Every tier gets free ground shipping on all qualifying orders over $300.

**How do I know if my order qualifies for free shipping?**
Your cart shows your progress toward the $300 threshold as you shop. Once you
cross $300, free ground shipping applies automatically at checkout.

**Are there any shipping exclusions?**
Free shipping covers standard ground delivery. The following are excluded:
- Oversized items and items requiring LTL (less-than-truckload) freight
- Items requiring special handling
- Shipments to Alaska, Hawaii, and Puerto Rico

**Can I upgrade to faster shipping?**
If you are located more than 1 shipping day away via ground shipping from one of
our shipping locations, you may choose expedited shipping for an extra cost if
you need your item faster than standard ground shipping can get it to you.

## Your Account Rep (Select and Signature Tiers)

**What is an account rep?**
At the Select tier, you have access to an account rep who can help with orders,
product questions, stock availability, and recommendations. At Signature, you
have an account rep assigned specifically to your account.

**How do I reach my account rep?** ·link·
You can reach your rep by phone at **1-833-397-2619** or by email at
**contactsmartrewards@storesupply.com**. *(tel: and mailto: links)*

**How can my account rep help me?**
Placing orders, sourcing specific products, checking stock availability, product
recommendations for your store, and any questions about your account or
benefits.

## Early Access (Select and Signature Tiers)

**What is early access?**
Select and Signature members see closeout deals and new products before they're
available to all customers. Select gets 48 hours. Signature gets a full week.

**How do I find early access products?**
We'll email you when early access items are available.

**Can my rep help me find early access products?**
Yes. Your rep can flag items or categories that might be relevant based on your
ordering patterns.

## Questions and Troubleshooting

**Where can I see my benefits, points balance, and tier status?** ·link·
Your tier and benefits are on the **My Benefits** tab, your points balance is at
the top of this page, and any store certificates are under **My Rewards**.
*(both links switch tabs)*

**I think my tier is wrong. What do I do?** ·link·
Your tier is based on your orders over the past 12 months, updated monthly. If
something looks off, contact us at **contactsmartrewards@storesupply.com** and
we'll look into it.

**Can I combine Smart Rewards with other promotions?** ·link·
Store certificates work alongside product discounts. For questions about
specific promotions, contact us at **contactsmartrewards@storesupply.com**.

**I have a question that's not covered here. Who do I contact?** ·link·
Reach us at **contactsmartrewards@storesupply.com**. Select and Signature
members can also contact their account rep directly.

### C.1 Why this copy is not in a config global

The FAQ was theme-configurable through a `loyaltyFaqConfig` global until
2026-08-11, when it was hardcoded. Several answers carry a link mid-sentence,
which a flat message string cannot express. If you make it configurable again in
the theme, the config format has to carry rich text, not plain strings.
