# Loyalty SSW dual-quota tier progress — design

**Date:** 2026-07-20
**Status:** Approved (design)
**Area:** B2B buyer portal · Loyalty (`/loyalty`) Rewards page — Overview + Tiers tabs, hero
**Related:** [2026-07-17-loyalty-memberships-tab-design.md](2026-07-17-loyalty-memberships-tab-design.md),
[2026-07-14-loyalty-tier-allowlist-gate-design.md](2026-07-14-loyalty-tier-allowlist-gate-design.md),
[2026-07-06-loyalty-page-design.md](2026-07-06-loyalty-page-design.md).

## Problem

The page's tier-progress UI is built on Influence.io's single
`currentLoyaltyTierProgress` number measured against tier `threshold` strings
with an undocumented unit (spec S3 of the original loyalty design). It renders
the same modest one-bar box in two places (Overview and Tiers tabs) via
`findNextTier` (`tierProgress.ts`).

The SSW backend now exposes a much richer, purpose-built progress model:

`GET {apiBase}/loyaltycustomersclient/GetDetailWithProgress`
`?site=<site>&bigCommerceStoreId=<hash>&bigCommerceCustomerId=<id>&recentTransactionsTake=0`

Its `Result.TierProgress` carries dual quotas (orders **or** spend) over a
rolling activity window, exact remaining amounts, per-quota percentages, and a
server-composed `Summary` sentence ("36 more order(s) OR $2902.15 more spend
away from 'Signature'."). Observed latency ~1.7s (`ElapsedMs`), PascalCase
Newtonsoft serialization, same `/customers` host root as the existing
`/loyalty/digest` endpoint.

## Decisions (user-selected 2026-07-20)

1. **Call the endpoint as-is.** It is currently unauthenticated (verified by a
   cold fetch: 200 + full payload including PII with only a customer id in the
   query). Shipping now is the accepted trade-off — see **Accepted risk**.
2. **Replace both progress boxes.** Overview and Tiers tabs swap their
   Influence-threshold bar for the dual-quota display. The old bar (and its
   `findNextTier`/`parseThreshold` machinery) is removed, not kept as fallback.
3. **Hero follows SSW.** The hero's "Current tier" value displays
   `TierProgress.CurrentTierName` when available, falling back to the
   Influence-derived title. The **tier-allowlist gate keeps matching on the
   Influence-derived title unchanged** — display identity and gate identity are
   deliberately split variables.

## API contract (observed payload)

Envelope: `{ Message, Success, Result }`; `Result.TierProgress` fields used:

| Field | Type | Use |
|---|---|---|
| `CurrentTierName` | string | hero display title |
| `TargetKind` | string | only `"NextTier"` renders; anything else ⇒ no box (top tier) |
| `TargetTierName` | string | box header |
| `OrdersInWindow` / `TargetOrdersRequired` | number | orders bar (`39 / 75`); bar hidden when target ≤ 0 |
| `SpendInWindow` / `TargetAmountRequired` | number | spend bar (currency-formatted); hidden when target ≤ 0 |
| `OrdersProgressPct` / `SpendProgressPct` | number | bar fill (server-computed; clamp to 100) |
| `Summary` | string | caption, rendered verbatim (backend owns AND/OR phrasing); omitted when blank |

Ignored: `Ledger`, `RecentTransactions`, `PendingPoints`, `InfluenceCheck`,
window dates, remaining counts (derivable), `LocalTierAssociation`.
`recentTransactionsTake=0` is always sent. In the example payload the SSW tier
names ("Select"→"Signature") disagree with the Influence tier ("ESSENTIAL
Plus") — decision 3 governs display; upstream data configuration owns
reconciliation.

## Design

### 1. Config & availability — `src/index.d.ts`

Add to `BC_CONTEXT.loyalty`:

```ts
/** SSW site key for GetDetailWithProgress (e.g. "StoreSupply"); absent = tier progress off. */
progressSite?: string;
```

Established "dormant until the theme ships it" pattern (shipping tracker
precedent): with `progressSite` absent, no progress box renders anywhere and
nothing else changes. Host from the existing `apiBase`;
`bigCommerceStoreId` from `window.B3.setting.store_hash`.

### 2. Service layer — `src/pages/Loyalty/api.ts`

```ts
export interface LoyaltyTierProgress {
  currentTierName: string;
  targetTierName: string;
  ordersInWindow: number;
  targetOrdersRequired: number;
  spendInWindow: number;
  targetAmountRequired: number;
  ordersProgressPct: number;
  spendProgressPct: number;
  summary: string;
}

export const isTierProgressAvailable = (): boolean =>
  isLoyaltyAvailable() && Boolean(getLoyaltyConfig()?.progressSite);

export const fetchTierProgress = async (
  customerId: string | number,
): Promise<LoyaltyTierProgress | null>
```

- Plain `fetch` (not `launcherGet` — different host and envelope):
  `${config.apiBase}/loyaltycustomersclient/GetDetailWithProgress` with query
  `site=${config.progressSite}`, `bigCommerceStoreId=${window.B3.setting.store_hash}`,
  `bigCommerceCustomerId=${String(customerId)}`, `recentTransactionsTake=0`.
- Returns `null` (not an error) when `Success !== true`, `Result.TierProgress`
  is null/absent, or `TargetKind !== 'NextTier'` — all mean "nothing to show".
- PascalCase raw shape mapped with `??` defaults per field (Newtonsoft
  serialization; digest-endpoint precedent).
- Network failure / non-OK status → `LoyaltyError` per the existing mapping
  (`429` → `rateLimited`, else `upstream`; a 401 here is not a session issue).

### 3. Page wiring — `src/pages/Loyalty/index.tsx`

```ts
const tierProgressQuery = useQuery({
  queryKey: ['loyaltyTierProgress', customerId],
  queryFn: () => fetchTierProgress(customerId),
  enabled: isTierProgressAvailable() && Boolean(customerId),
  staleTime: Infinity,
});
const tierProgress = tierProgressQuery.data ?? null;
```

- **Hero:** `displayTierTitle = tierProgress?.currentTierName || tierTitle`
  passed to `LoyaltyHero`. The existing `tierTitle` (Influence-derived) remains
  the ONLY input to the allowlist verdict (`isTierAllowed(tierTitle, …)`),
  untouched.
- Props: `OverviewTab` gains `tierProgress`; `TiersTab` swaps
  `currentTierProgress` for `tierProgress`. `tierProgressQuery` joins neither
  the error aggregation nor the gate verdict (fail-quiet, memberships
  precedent).

### 4. Component — `src/pages/Loyalty/components/TierProgressCard.tsx` (new)

Shared by both tabs; replaces the two duplicated inline boxes.
`{ progress: LoyaltyTierProgress | null }` → renders `null` when no progress.

- Header: existing key `loyalty.tiers.progressTo` ("Progress to {tier}") with
  `targetTierName`.
- Orders row (when `targetOrdersRequired > 0`): label
  `loyalty.progress.orders` ("Orders"), `{ordersInWindow.toLocaleString()} /
  {targetOrdersRequired.toLocaleString()}`, `LinearProgress` at
  `Math.min(100, ordersProgressPct)`.
- Spend row (when `targetAmountRequired > 0`): label `loyalty.progress.spend`
  ("Spend"), value `` `${currencyFormat(spendInWindow)} / ${currencyFormat(targetAmountRequired)}` ``
  (`@/utils/b3CurrencyFormat`, ShippingTracker precedent), `LinearProgress` at
  `Math.min(100, spendProgressPct)`.
- Caption: `summary` verbatim, omitted when blank.
- Container styling mirrors the box it replaces (`border: 1, borderColor:
  'divider', borderRadius: 2, p: 3`).

New i18n keys (en.json, next to `loyalty.tiers.*`):
`"loyalty.progress.orders": "Orders"`, `"loyalty.progress.spend": "Spend"`.

### 5. Cleanup (orphaned by this change)

- Delete `src/pages/Loyalty/tierProgress.ts` (`findNextTier` — only consumers
  were the two replaced boxes).
- Remove `parseThreshold` from `api.ts` (only consumer was `tierProgress.ts`)
  and its `it.each` table in `api.test.ts`.
- `LoyaltyTier.threshold` and `LoyaltyCustomer.currentLoyaltyTierProgress`
  REMAIN on the types and mappings (payload fields, not exports; removing them
  would churn fetch tests for no gain) — they simply no longer drive UI.
- Existing page tests asserting the old box (`'240 / 300'`, the
  threshold-not-numeric progressbar test, progressbar assertions inside tier
  tests) are updated or removed **because the behavior they assert is
  removed** — this is a deliberate, spec-mandated exception to the
  "don't modify existing tests" rule, limited to assertions on the old box.

### 6. Failure handling

| Condition | Behavior |
|---|---|
| `progressSite` absent (older theme) | No box on either tab; hero uses Influence title; zero other change |
| Endpoint error / non-OK / network | No box (fail-quiet); no banner; page intact |
| `Success: false` or `TierProgress: null` | No box |
| `TargetKind !== 'NextTier'` (top tier) | No box (matches old top-tier behavior) |
| Query in flight (~1.7s endpoint) | Page renders without the box; box appears on resolve; hero shows Influence title then switches |
| Only one quota configured (`target ≤ 0`) | That bar omitted; the other renders |
| SSW vs Influence tier-name mismatch | SSW wins in hero + box; tier cards/benefits box stay Influence (perks are Influence data); allowlist gate stays Influence |
| Masquerading / non-Stencil / no BC_CONTEXT | Whole page already unavailable; unchanged |

## Non-goals

- Securing the endpoint (see Accepted risk — backend follow-up, not portal).
- Rendering `RecentTransactions`, `Ledger`, `PendingPoints`, or
  `InfluenceCheck` diagnostics.
- Changing allowlist-gate semantics or its Influence-title keying.
- Re-titling the Overview benefits box (its perks are Influence tier data; its
  title stays the Influence tier name — known, accepted seam with the hero).
- Localizing the server `Summary` string (rendered verbatim).

## Testing

- **api.test.ts** — `fetchTierProgress`: query-param assertion (site, store
  hash from the test environment's `window.B3.setting.store_hash`, customer
  id, `recentTransactionsTake=0`); PascalCase mapping; `Success:false` → null;
  `TierProgress:null` → null; `TargetKind:'AtTop'` → null; non-OK →
  `LoyaltyError('upstream')`. `isTierProgressAvailable` with/without
  `progressSite`. Remove the `parseThreshold` table.
- **index.test.tsx** — `buildTierProgressWith` builder + `mockTierProgress`
  MSW helper: dual bars + summary on Overview AND Tiers tabs; orders-only /
  spend-only variants; hero shows `currentTierName` (and falls back to the
  Influence title when progress is absent); no box on `Success:false`; the
  allowlist-gate tests pass untouched (they never mock this endpoint — the MSW
  catch-all hangs it ⇒ no box ⇒ unaffected). Old-box assertions updated per
  §5.
- Existing memberships/social/redeem/history tests: untouched.

## Verification

- Loyalty suite green; `yarn tsc --noEmit`; scoped eslint; knip clean
  (orphans deleted, new exports consumed).
- Live (sandbox, theme with `progressSite` set): Overview + Tiers show the
  dual-quota box with orders/spend bars matching
  `GetDetailWithProgress`; hero shows the SSW tier name; a store/theme without
  `progressSite` shows no box and today's page otherwise.

## Accepted risk (recorded)

`GetDetailWithProgress` is **unauthenticated**: verified 2026-07-20 that a cold
GET with only `bigCommerceCustomerId` in the query returns 200 with tier
progress **plus PII (email, first/last name) and order/spend history** for that
customer. Calling it from the browser makes the URL pattern public; anyone can
iterate customer ids. The user chose to ship as-is (test host:
`test-onlineservices.storesupply.com`; prod host comes from `apiBase`).
**Standing recommendation:** the SSW backend should verify identity (accept the
Current Customer JWT or the existing HMAC digest, as `/loyalty/digest` does)
— the portal call site is shaped so adding an auth parameter later is a
one-line change.
