# Obfuscate Order ID — Design Spec

- **Date:** 2026-06-01
- **Status:** Approved (design); ready for implementation planning
- **Area:** `apps/storefront` — orders, invoices, shared utils

## Summary

Display an obfuscated order identifier to users instead of the raw, sequential
BigCommerce order ID. Encoding uses [`sqids`](https://github.com/sqids/sqids-javascript)
(reversible, URL-safe), with a project-specific alphabet, a minimum length of 8,
and a blocklist. A store-specific suffix (read from `window.storeSuffix`, set by a
separate host project) is appended for display.

Example: order `123` → **`HZ4BIDUG-SW`**.

The obfuscated form appears both in displayed text **and** in the URL. Because
`sqids` is reversible, the order-detail page and the search box decode it back to
the real numeric ID before performing lookups.

## Goals

- Replace every user-facing **text** display of an order ID with the obfuscated form.
- Use the obfuscated form in `/orderDetail/:id` **URLs**, decoding on the detail page.
- Let the search box accept an obfuscated ID (smart-decode to the real ID).
- Degrade gracefully to the real numeric ID when `window.storeSuffix` is absent.

## Non-goals

- **Not** a security or access-control mechanism (see "Security note").
- No backend changes. The real numeric ID still flows in GraphQL lookups and to
  BigCommerce server endpoints.
- We do **not** obfuscate invoice numbers, quote IDs, PO numbers, or any
  non-order identifier.
- We do **not** attempt to mask the real ID in server-rendered artifacts
  (print invoice, return flow, PDF download, CSV export) — see "Boundaries".

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Scope | **Display + URL.** Detail page and search decode back to the real ID. |
| Suffix missing (`window.storeSuffix` empty/undefined) | **Fall back to the real numeric ID** everywhere. |
| Display surfaces | **All** — order list (My + Company), order detail header, invoice order numbers, dashboard, and any remaining text surfaces. |
| Search input | **Smart decode** — translate a clean obfuscated ID to the real ID; pass free text / PO numbers / real IDs through unchanged. |
| Blocklist | **Merge** sqids' built-in profanity blocklist **and** add `"Uline"`. |

## Security note (must not be misunderstood)

`sqids` is **reversible and is not encryption**. The alphabet and configuration
ship inside the client bundle, so anyone can decode an obfuscated ID. This feature
is **cosmetic / branding** obfuscation — it hides the raw sequential order count
and guarantees the string "Uline" never appears in an ID. It is **not** an
authorization boundary. Authorization remains enforced server-side via `B2BToken`.
Obfuscation must never be relied on to hide orders from users who should not see
them.

## Architecture

### Chosen approach: centralized pure-util module + thin wiring

A single domain-agnostic module owns one `Sqids` singleton and exports two pure
functions. Every display surface and link-builder calls `formatOrderId`; the detail
page and search box call `parseOrderId`. The `window.storeSuffix` gate lives inside
the module.

Rejected alternatives:

- **Encode/decode at the data/service layer** — corrupts the typed data model
  (`Order.entityId: number` would become a display string), breaks numeric
  sort/lookup, and fights the requirement that print/return/PDF still need the
  real number.
- **React hook + `<OrderId>` component** — `window.storeSuffix` is a global, not
  React state, so reactivity would be illusory; and the *parse* side must run in
  plain functions (route-param handling, search), where hooks cannot. The pure
  util covers both; a thin display component could still be layered on later if
  desired.

### Core module: `src/utils/orderId.ts`

```ts
import Sqids, { defaultOptions } from 'sqids';

const ALPHABET = 'JH4D0BET3UA1W5VO8XZYIRLCGK7FQS96N2MP'; // 36 unique chars, validated
const MIN_LENGTH = 8;

const sqids = new Sqids({
  alphabet: ALPHABET,
  minLength: MIN_LENGTH,
  blocklist: new Set([...defaultOptions.blocklist, 'Uline']),
});

/** The store suffix set by the host project; obfuscation is active only when present. */
function getStoreSuffix(): string {
  return (window.storeSuffix ?? '').trim();
}

/** Real numeric id -> display string. Falls back to the plain id when no suffix is set. */
export function formatOrderId(id: number | string): string {
  const numeric = Number(id);
  const suffix = getStoreSuffix();
  if (!suffix || !Number.isInteger(numeric) || numeric < 0) return String(id);
  return `${sqids.encode([numeric])}-${suffix}`;
}

/** Display string (or raw param) -> real numeric id, or null if it can't be resolved. */
export function parseOrderId(value: string): number | null {
  const raw = (value ?? '').trim();
  if (/^\d+$/.test(raw)) return Number(raw);   // pure digits = real id
  const encoded = raw.replace(/-[^-]*$/, '');  // strip trailing -SUFFIX
  const [decoded] = sqids.decode(encoded);
  return decoded ?? null;
}
```

#### Disambiguation rule

`parseOrderId` distinguishes the two forms reliably:

- A **pure-digit** string is a real ID and is returned as-is.
- Anything else is treated as obfuscated: strip an optional trailing `-SUFFIX`,
  then `sqids.decode`.

This never collides because `formatOrderId` only emits an obfuscated value when
`window.storeSuffix` exists, and such a value always carries a `-SUFFIX` and a
predominantly alphabetic body. When no suffix exists, every surface uses the plain
numeric form, which the digit path handles.

`parseOrderId` is tolerant: it round-trips whether or not a suffix is present, and
returns `null` on unparseable input so callers can fall back.

### Global typing

Augment the global `Window` type with `storeSuffix?: string` in a `.d.ts`,
alongside the existing `window.b2b` typing.

## Surface wiring

### Display — `formatOrderId(realId)`

| Location | Change |
|---|---|
| `pages/order/Order.tsx:264` | table cell → `formatOrderId(orderId)` |
| `pages/order/OrderItemCard.tsx:66` | `# ${formatOrderId(item.orderId)}` |
| `pages/OrderDetail/index.tsx:277` | header shows `formatOrderId(realId)` (normalized — see Lookup) |
| `pages/Invoice/index.tsx:602` | `formatOrderId(item.orderNumber)` |
| `pages/Invoice/InvoiceItemCard.tsx:80` | `formatOrderId(item.orderNumber)` |
| Dashboard + any remaining text surfaces | swept during implementation |

### Navigation — encode the ID into the URL (`formatOrderId`)

| Location | Change |
|---|---|
| `pages/order/Order.tsx:243` | `navigate('/orderDetail/' + formatOrderId(item.orderId))` |
| `pages/Invoice/index.tsx:599`, `Invoice/InvoiceItemCard.tsx:77`, `Invoice/components/B3Pulldown.tsx:95` | encode `orderNumber` in the URL |
| `pages/OrderDetail/index.tsx:141` | retry hash stays consistent (param round-trips) |

### Lookup / route param — `parseOrderId`

- `pages/OrderDetail/index.tsx:96-106`: replace `parseInt(orderId, 10)` with
  `const realId = parseOrderId(orderId)`. Use `realId` for
  `getB2B/BCOrderDetails(realId)` **and** for the header via `formatOrderId(realId)`.
  This normalizes the heading whether the user arrived via an obfuscated link, a
  numeric deep link, or prev/next pagination.
- `DetailPagination` needs **no** change — it displays the pagination index
  (`listIndex + 1`), not the ID, and feeds real numeric IDs that `parseOrderId`
  accepts.
- Digital-download lookups (`getDigitalDownloadElements.ts`, `OrderBilling.tsx`)
  already use the numeric ID from context — unchanged.

### Search — smart decode

At `pages/order/Order.tsx:331` (`handleChange`) and `pages/Invoice/index.tsx:210`:

```ts
// only translate a clean obfuscated id; otherwise pass through (PO #, free text, real id)
const decoded = parseOrderId(value);
const q = !/^\d+$/.test(value) && decoded != null ? String(decoded) : value;
```

### Boundaries (real numeric ID remains — server-side, not client-controllable)

Accepted per the chosen scope. These are server-rendered or server-generated and
cannot be obfuscated on the client without breaking reconciliation against the
BigCommerce back office:

- Print invoice (`account.php?action=print_invoice&order_id=`)
- Return flow (`account.php?action=new_return&order_id=`)
- PDF invoice download
- CSV export (`exportInvoicesAsCSV` returns a backend-generated URL)

## Testing strategy

Project stack: Vitest + jsdom, Testing Library, MSW, `vitest-when`, builders,
`renderWithProviders`. All test data via builders — no hardcoded fixtures.

### Unit — `src/utils/orderId.test.ts`

Set `window.storeSuffix` in `beforeEach`, delete in `afterEach`.

- Round-trip: `parseOrderId(formatOrderId(n)) === n` across a range of IDs.
- `formatOrderId` with suffix → matches `^[ALPHABET]{8,}-SW$`.
- `formatOrderId` with no suffix → returns the plain numeric string (fallback).
- `formatOrderId` with non-integer / negative / `NaN` → returns `String(id)`.
- `parseOrderId`: pure digits → number; encoded **with** suffix → real ID;
  encoded **without** suffix → real ID (tolerant); garbage → `null`.
- Blocklist proof: encode a few thousand sequential IDs; assert no output contains
  `"uline"` (case-insensitive), proving the merged blocklist is active.

### Integration (per page, `renderWithProviders` + builders + MSW)

- Order list shows the obfuscated ID when suffix set, the real ID when not.
- Row click navigates to `/orderDetail/<obfuscated>`.
- OrderDetail with an **obfuscated** route param decodes and queries with the real
  numeric `entityId` (assert the request variable via MSW / `when`); header renders
  the obfuscated form.
- OrderDetail with a **numeric** deep-link param still works (back-compat).
- Search: obfuscated input issues a server query with the decoded numeric ID; free
  text / PO number passes through unchanged.
- Invoice list: order-number column obfuscated; "View Order" navigates to the
  obfuscated URL.

## Dependencies

- Add `sqids` (npm) to `apps/storefront/package.json`, pinned to a specific version.
- Owned by the `infra` agent (dependency bumps / `package.json`).

## Rollout

No separate feature flag. The feature is **implicitly gated by `window.storeSuffix`**.
On stores where the host project has not set it, behavior is identical to today
(real IDs). It activates automatically once the suffix is present, and the host can
disable it simply by not setting the global. Safe, progressive, reversible.

## Verified facts (sqids JS)

- API: `encode(numbers: number[]): string`, `decode(id: string): number[]`; package name `sqids`.
- A custom `blocklist` **replaces** the built-in ~700-word profanity list
  (`options?.blocklist ?? defaultOptions.blocklist`); `defaultOptions` is exported,
  so the merge `new Set([...defaultOptions.blocklist, 'Uline'])` is supported.
- The constructor lowercases **both** the alphabet and blocklist words when
  filtering, so `"Uline"` is active even with the uppercase-only alphabet.
- Alphabet `JH4D0BET3UA1W5VO8XZYIRLCGK7FQS96N2MP`: 36 characters, all unique, no
  multibyte — valid.
