# Loyalty Memberships tab (read-only) for the buyer portal — design

**Date:** 2026-07-17
**Status:** Approved (design)
**Area:** B2B buyer portal · Loyalty (`/loyalty`) Rewards page
**Related:** [2026-07-14-loyalty-tier-allowlist-gate-design.md](2026-07-14-loyalty-tier-allowlist-gate-design.md),
[2026-07-09-loyalty-earn-points-tier-values-design.md](2026-07-09-loyalty-earn-points-tier-values-design.md),
[2026-07-06-loyalty-page-design.md](2026-07-06-loyalty-page-design.md).
Influence.io endpoint inventory: `.memory/b2b-buyer-portal--influence-api-surface-map.md`.

## Problem

Influence.io supports a **memberships** concept (VIP/program groupings, distinct
from the automatic points-based tiers the portal already renders). The Rewards
page today shows Overview / Earn / Redeem / Tiers / History but has no surface
for memberships, even though the store may configure them.

The Launcher API exposes `GET /shop/memberships` — shop-scoped, browser-safe,
already reachable through the portal's existing `launcherGet` transport. This
spec adds a read-only display of that data.

## Decision (user-selected): read-only display, new tab

Three decisions locked during brainstorming:

1. **Read-only now.** List available memberships only. **No enroll/join/leave.**
   Enroll/remove live on the Influence.io **Platform API**
   (`POST /v1/customers/{customerId}/membership/enroll` + `/remove`), which
   requires the secret `x-api-key` header and therefore a new **SSW backend
   proxy that does not exist yet**. The portal cannot call those directly.
   Additionally, no documented API returns a customer's *current* membership, so
   "you are a member of X" cannot be rendered reliably. Both are out of scope
   (see Non-goals / Future work).
2. **New "Memberships" tab** — a 6th tab alongside the existing five,
   auto-hidden when the store has no memberships.
3. **Card content = title + description + perks.** The `customerCount` field is
   fetched-but-not-shown (an admin metric, not buyer-facing).

## API contract (Launcher — used by the portal)

`GET https://launcher.api.influence.io/launcher/v1/shop/memberships?shop=<shopKey>`

- Auth: shop key query param only — **digest NOT required** (shop-scoped, like
  `GET /shop/tiers`). Runs in parallel with the digest handshake.
- `200` → `{ memberships: [ { id, title, description, customerCount, perks } ] }`
- `404` → "Shop not found with shopKey".

| Field | Type | Used? |
|---|---|---|
| `id` | string | yes (React key) |
| `title` | string | yes |
| `description` | string | yes |
| `perks` | string[] | yes |
| `customerCount` | integer | no (not rendered) |

Note the response envelope key is `memberships` — unlike tiers/earn/redeem which
nest under `rules`.

## Design

### 1. Service layer — `src/pages/Loyalty/api.ts`

New exported type + fetcher, defensively mapped like `fetchTiers`:

```ts
export interface LoyaltyMembership {
  id: string;
  title: string;
  description: string;
  perks: string[];
}

interface RawMembership {
  id?: string | number;
  title?: string;
  description?: string;
  perks?: string[];
}

export const fetchMemberships = async (): Promise<LoyaltyMembership[]> => {
  const config = requireConfig();
  const raw = (await launcherGet('/shop/memberships', { shop: config.shopKey }, 'upstream')) as {
    memberships?: RawMembership[];
  };
  return (raw.memberships ?? []).map((m) => ({
    id: String(m.id ?? ''),
    title: m.title ?? '',
    description: m.description ?? '',
    perks: m.perks ?? [],
  }));
};
```

`notFoundKind: 'upstream'` (a 404 here is a shop-key misconfiguration, not a
per-customer "not enrolled" — matches `fetchTiers`). `customerCount` is omitted
from `RawMembership` because it is never consumed (YAGNI).

### 2. Page wiring — `src/pages/Loyalty/index.tsx`

- Add `'memberships'` to `LOYALTY_TABS` (kept in the union so `toLoyaltyTab`
  validates `?tab=memberships`).
- New query, mirroring `tiersQuery` (no identity dependency):

```ts
const membershipsQuery = useQuery({
  queryKey: ['loyaltyMemberships'],
  queryFn: fetchMemberships,
  enabled: isAvailable,
  staleTime: Infinity,
});
const memberships = membershipsQuery.data ?? [];
```

- **Deep-link guard (single explicit approach):** compute one effective tab and
  use it for both the `Tabs` `value` and the panel switch, so MUI `Tabs` never
  receives a `value` with no matching `Tab` (which logs a warning and renders no
  indicator):

```tsx
const hasMemberships = memberships.length > 0;
const activeTab = tab === 'memberships' && !hasMemberships ? 'overview' : tab;
```

- Render the tab + panel **only when `hasMemberships`**, and drive everything off
  `activeTab`:

```tsx
<Tabs value={activeTab} ...>
  ...existing five <Tab> ...
  {hasMemberships && (
    <Tab value="memberships" icon={<CardMembership />} iconPosition="start"
         label={b3Lang('loyalty.tabs.memberships')} />
  )}
</Tabs>
...
{activeTab === 'memberships' && <MembershipsTab memberships={memberships} />}
```
- Icon: `CardMembership` — **named import** from `@mui/icons-material`
  (`import { CardMembership } from '@mui/icons-material'`), per the enforced
  import rule.

### 3. Component — `src/pages/Loyalty/components/MembershipsTab.tsx` (new)

Modeled on `TiersTab`, minus progress/current-tier highlighting, plus a
description line:

```tsx
interface MembershipsTabProps {
  memberships: LoyaltyMembership[];
}

function MembershipsTab({ memberships }: MembershipsTabProps) {
  const b3Lang = useB3Lang();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.memberships')}</SectionHeader>
      {memberships.map((m) => (
        <Card key={m.id} variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{m.title}</Typography>
            {m.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {m.description}
              </Typography>
            )}
            {m.perks.map((perk) => (
              <Typography key={perk} variant="body2" color="text.secondary">{perk}</Typography>
            ))}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
```

Reuses the page-local `SectionHeader`. No new domain-agnostic components.

### 4. i18n — `src/lib/lang/locales/en.json`

Add next to the other `loyalty.tabs.*` keys:

```json
"loyalty.tabs.memberships": "Memberships",
```

Implementation will confirm whether other locale files mirror the `loyalty.*`
namespace; if so, add the key there too (knip/lint parity).

### 5. Behavior / gating

- **Inherits every existing gate** — Stencil-only (`isLoyaltyAvailable`),
  `BC_CONTEXT.loyalty` present, not masquerading (`isAgenting`), and the tier
  allowlist verdict. No new gating logic; the tab renders inside the
  already-gated page body.
- **Empty or errored fetch ⇒ `memberships = []` ⇒ tab absent** (fail-quiet).
  Memberships are supplementary and do **not** participate in the tier-allowlist
  verdict (unlike `tiersQuery`, whose error fails the page closed). A failed
  memberships fetch must never affect page access.

## Edge cases

| Case | Behavior |
|---|---|
| Store has no memberships (`[]`) | Tab hidden; five tabs as today |
| `memberships` fetch errors / 404 | Tab hidden (fail-quiet); no error banner |
| `?tab=memberships` deep-link, memberships exist | Memberships tab active |
| `?tab=memberships` deep-link, none exist | Falls back to Overview (no MUI warning) |
| Membership with blank `description` | Description line omitted; title + perks only |
| Membership with empty `perks` | Title (+ description) only |
| Masquerading rep / gated-out tier / non-Stencil | Whole page unavailable already; tab never reached |
| Query in flight | Tab not yet shown; appears when data resolves (minor, acceptable) |

## Non-goals / Future work

- **Enroll / join / leave** — blocked on a new SSW Platform-API proxy
  (holds `x-api-key`, same trust boundary as `.../customers/loyalty/digest`).
  When that endpoint exists, a follow-up spec adds an `enrollMembership()`
  service fn + `useMutation` + invalidate, and a gated Join CTA.
- **Current-membership indicator** ("✓ Member") — no documented read-back API;
  requires either a new field on `GET /customer` or client-side tracking.
- **Showing `customerCount`** — deliberately omitted (admin metric).
- Any change to the other five tabs, gating, or non-loyalty surfaces.

## Testing

- **`api.test.ts`** — `fetchMemberships`: maps a full `memberships` payload;
  `?? ` fallbacks for missing fields; empty/missing `memberships` ⇒ `[]`; 404 ⇒
  `LoyaltyError('upstream')`. Uses a `buildMembershipWith` builder (no hardcoded
  fixtures).
- **`MembershipsTab` render test** — renders a card per membership with title,
  description, and perks; omits description when blank.
- **`index.test.tsx`** (+ `index.mobile.test.tsx` as pattern dictates) —
  MSW handler for `GET /shop/memberships`:
  - memberships present ⇒ Memberships tab visible; clicking it shows the cards;
  - empty list ⇒ tab absent, five tabs remain;
  - `?tab=memberships` with empty list ⇒ Overview renders, no console warning;
  - existing tests untouched (default MSW handler returns `[]` ⇒ tab absent ⇒
    no regression to current five-tab assertions).

## Verification

- `yarn tsc --noEmit` clean; Loyalty suite green; scoped `yarn lint:eslint` +
  `lint:knip` + `lint:dependencies` clean (new export consumed; named MUI icon
  import).
- Live (Stencil sandbox with memberships configured): the Memberships tab lists
  each membership's title/description/perks; on a store with no memberships the
  tab does not appear.
