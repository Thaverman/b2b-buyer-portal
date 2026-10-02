# Ordergroove Phase 3 — subscription actions (design)

**Date:** 2026-09-17
**Status:** Approved in review (sections 1–3), awaiting written-spec review
**Program spec:** [2026-09-15-ordergroove-subscriptions-custom-manager-design.md](2026-09-15-ordergroove-subscriptions-custom-manager-design.md) §8
**Builds on:** [Phase 2 — read-only subscriptions page](2026-09-17-ordergroove-phase2-subscriptions-page-design.md), live on sandbox since 2026-09-17
**Evidence:** read-only capture of the hosted manager as customer 80591 and of Ordergroove's merchant bundle, 2026-09-17 (§12); Ordergroove REST reference (developer.ordergroove.com/reference)

---

## 1. Decisions

| # | Decision | Alternatives rejected |
|---|---|---|
| 1 | **Full parity** with the hosted manager, minus swap product and add-new-address, delivered as **3a** (skip, send now, change next-order date) then **3b** (frequency, quantity, cancel with reasons, reactivate, change shipping address). Failed-order retry is out: the placement-log endpoint is merchant-key only. | Order actions only; subscription edits only; everything including swap. |
| 2 | **Every action lives on the subscription card** it applies to. "Send now" is the one order-scoped call; its confirm lists the other products shipping in that order. | A grouped "Upcoming orders" section mirroring the hosted manager (two places to look for actions). |
| 3 | **Live verification uses reversible writes only.** Send now is proven by mocked tests and never fired against customer 80591 — it places a real order within 24 hours. | Everything live including send now; no live writes at all. |
| 4 | **Quantity and frequency are inline selects** that save on change, as the hosted manager does. Everything else is a dialog. No optimistic updates. | One "Edit subscription" dialog with Save (three clicks for a quantity change). |
| 5 | **Pause folds into "change date".** The manager implements pause as a next-order-date change with presets at 1×, 2× and 3× the frequency; our change-date dialog offers a date picker plus those presets. | A separate Pause action. |
| 6 | **Skip is one call per card.** The manager's "skip order" and "skip product" both call the order's `skip_subscription` for one subscription; that is our single Skip. | Order-level skip that iterates every subscription in the order. |
| 7 | **The escape link stays until Phase 4.** Swap and add-address remain hosted-only, so the link keeps its purpose. Overrides Phase 2 spec §10 ("removed with Phase 3"). | Remove it with 3b. |
| 8 | **The cancel reason is optional.** No selection sends the manager's own no-survey value (code 114) so Ordergroove's reporting stays identical. | Mandatory reason. |
| 9 | **SSW's frequency list is a constant** copied from the manager bundle (§4.3). It is Ordergroove merchant configuration baked into their static bundle and not readable from the REST API. | Probe for an offers API first. |

## 2. Shape

### 2.1 Where things render

- The Phase 2 page (`SubscriptionsManager`) and switch (`isCustomManagerAvailable() && !isAgenting`)
  are unchanged. Masquerade, missing flag and non-BigCommerce platforms still render the iframe and
  never see these controls.
- An **active card** gets an actions row under its details: `Skip`, `Send now`, `Change date` (3a).
  3b turns the "Qty 2 · every 4 weeks" line into two labelled selects, adds a `Change` link beside
  the shipping address, and a text-style `Cancel subscription` at the row's end.
- A **cancelled card** shows only `Reactivate` (3b).
- Skip, Send now and Change date are **hidden on a card with no upcoming order** (`nextOrder` null).
- Phones: the row wraps; selects go full width.

### 2.2 Delivery

One spec, two plans, two merges to `dev`:

| Delivery | Contents |
|---|---|
| **3a** | write helper (§3.1), `skipSubscription` / `sendOrderNow` / `changeNextOrderDate`, type and builder additions (§3.3), view-model additions (§4), `useSubscriptionActions` with those three mutations (§5), `SubscriptionActions` row + `SkipDialog` / `SendNowDialog` / `ChangeDateDialog` (§6), copy (§7), Task 0 live probe (§10.1) |
| **3b** | `changeFrequency` / `changeQuantity` / `cancelSubscription` / `reactivateSubscription` / `changeShippingAddress`, remaining mutations, `QuantityFrequencySelects`, `CancelDialog` / `ReactivateDialog` / `ChangeAddressDialog`, address options (§4.6), copy |

### 2.3 Files

```
apps/storefront/src/shared/service/ordergroove/
  api.ts                      + ogMutate, eight action functions
  types.ts                    + every, every_period on OgSubscription; FrequencyPeriod
  index.ts                    + the eight functions, FrequencyPeriod, ReactivationInput
apps/storefront/tests/ordergrooveBuilders/index.ts
                              buildOgSubscriptionWith: every / every_period defaults
apps/storefront/src/pages/ManageSubscriptions/
  viewModel.ts                + card fields (§4.1), constants and pure helpers (§4.2–4.6)
  format.ts                   + describeFrequency, describeAddress, HOSTED_MANAGER_URL (3b)
  SubscriptionsManager.tsx    passes customerId and the addresses lookup down; renders
                              ActiveSubscriptionCard per active card
  components/SubscriptionCard.tsx
                              + `actions` slot (row under details), `scheduleControls` slot
                                (replaces the Qty/frequency text line when provided) and
                                `shippingAction` slot (after the shipping address, 3b)
  components/CancelledSubscriptions.tsx
                              takes customerId; renders ReactivateAction per card (3b)
  hooks/useSubscriptionActions.ts          (new)
  components/actions/SubscriptionActions.tsx (new) — the presentational button row; exports
                                             SubscriptionDialog (as built, see below)
  components/actions/SkipDialog.tsx          (new)
  components/actions/SendNowDialog.tsx       (new)
  components/actions/ChangeDateDialog.tsx    (new)
  components/actions/CancelDialog.tsx        (new, 3b)
  components/actions/ReactivateDialog.tsx    (new, 3b)
  components/actions/ChangeAddressDialog.tsx (new, 3b)
  components/actions/QuantityFrequencySelects.tsx (new, 3b)
  components/actions/ActiveSubscriptionCard.tsx (new, 3b) — per-card owner: the hook, the open
                                             dialog, the card-option queries, the card's three
                                             slots and every dialog
  components/actions/ReactivateAction.tsx    (new, 3b) — Reactivate button + dialog on a
                                             cancelled card
apps/storefront/src/hooks/useScrollBar.ts     + effect cleanup that releases the scroll lock on
                                              unmount while open (3b, §8)
apps/storefront/src/lib/lang/locales/en.json  subscriptions.actions.*
```

Tests co-locate with each file (`*.test.ts[x]`).

*As built in 3b (2026-10-01).* 3a's `SubscriptionActions` owned the hook and the dialogs and rendered
into the card's `actions` slot. 3b puts controls in three slots of one card — the schedule line, the
address line and the actions row — that must share one pending state and one open dialog, and the
Cancel dialog must be able to hand off to Skip. One owner above the card is the only shape that does
that without lifting the hook into the page, which would make every card's spinner shared. So
`ActiveSubscriptionCard` is that owner (one hook instance per card), `SubscriptionActions` shrank to
the presentational button row (no hook, no dialogs, no queries), and a cancelled card's one control
gets its own small owner, `ReactivateAction`. Read `ActiveSubscriptionCard` wherever §5.1, §6.1 and
§10.2 say the row owns the hook and the open dialog.

## 3. Service (`src/shared/service/ordergroove/`)

### 3.1 Write helper

```ts
// api.ts — beside ogFetch; not exported
const WRITE_TIMEOUT_MS = 10000;

const ogMutate = async <T>(
  customerId: string,
  url: string,
  method: 'PATCH' | 'POST',
  body?: object,
): Promise<T>
```

- Same `request()` path as reads: `getAuthorizationHeader` mint (cached, in-flight deduped), one
  re-mint and retry on 403, `withTimeout` — but with **10 s**, not 5 s. `request()` gains an
  `init` parameter (`method`, `body`); reads pass none.
- Body is `JSON.stringify(body)` with the existing `Content-Type: application/json`.
- Status mapping is unchanged: 401/403 after the retry → `sessionExpired`; 429 → `rateLimited`;
  anything else non-2xx → `upstream`. A **400** (validation, prepaid subscription) or **423**
  (locked) is therefore `upstream` and gets the generic copy (§7). No client-side retry.
- Returns the parsed JSON (the updated subscription or order). Callers ignore it beyond tests; the
  cache is refreshed by invalidation (§5.2).

### 3.2 Endpoints and functions

All accept Storefront scope (verified in the reference for each) and are the exact calls
Ordergroove's own manager bundle makes today (§12.3). Paths carry the trailing slash the reference
documents; the manager omits it on `change_next_order_date` and `items/{id}/change_quantity`. The
3a Task 0 probe (2026-09-17) sent `PATCH /subscriptions/{id}/change_next_order_date/` **with** the
slash and got `200` first time, so the documented form is the one the service uses.

| Function (exported from `index.ts`) | Call | Body |
|---|---|---|
| `skipSubscription(customerId, orderId, subscriptionId)` | `PATCH /orders/{orderId}/skip_subscription/` | `{ subscription }` |
| `sendOrderNow(customerId, orderId)` | `PATCH /orders/{orderId}/send_now/` | none |
| `changeNextOrderDate(customerId, subscriptionId, orderDate)` | `PATCH /subscriptions/{id}/change_next_order_date/` | `{ order_date: "YYYY-MM-DD" }` |
| `changeSubscriptionFrequency(customerId, subscriptionId, every, everyPeriod)` | `PATCH /subscriptions/{id}/change_frequency/` | `{ every, every_period }` |
| `changeSubscriptionQuantity(customerId, subscriptionId, quantity)` | `PATCH /subscriptions/{id}/change_quantity/` | `{ quantity }` |
| `cancelSubscription(customerId, subscriptionId, cancelReason)` | `PATCH /subscriptions/{id}/cancel/` | `{ cancel_reason }` |
| `reactivateSubscription(customerId, subscriptionId, { startDate, every, everyPeriod, nextOrderDate })` | `PATCH /subscriptions/{id}/reactivate/` | `{ start_date, every, every_period, next_order_date }` |
| `changeShippingAddress(customerId, subscriptionId, addressId)` | `PATCH /subscriptions/{id}/change_shipping/` | `{ shipping_address }` |

*As built in 3b (2026-10-01).* The two subscription edits are named `changeSubscriptionFrequency`
and `changeSubscriptionQuantity`, after Phase 4's `changeSubscriptionPayment`, so that the hook's
`changeFrequency` / `changeQuantity` keys (§5) do not collide with the functions they import; the
other three are named as listed. The 3b Task 0 probe (2026-10-01, §10.1) settled what three of the
rows do to the upcoming order:

- `changeSubscriptionFrequency` (finding E): answers 200 and the record's `every` / `every_period` /
  `frequency_days` follow, but the upcoming order's date does **not** move (a 10-month subscription
  changed to 6 weeks kept its next order on 2027-08-01, through the change and the restore). The
  hook refreshes `upcoming` regardless (§5.2). The response is presumably the subscription (33
  top-level keys, as `reactivate` returned) but only the key count was logged.
- `changeSubscriptionQuantity` (finding F): answers 200 and the upcoming order's item quantity
  **follows** the subscription.
- `changeShippingAddress` (finding G): answers 200 and the upcoming order's `shipping_address`
  **follows** the subscription (not displayed; recorded for the cutover).

Return types: the order functions return `OgOrder`; the subscription functions return
`OgSubscription`. All ids are Ordergroove `public_id`s (32 hex), URL-encoded as today.

Reference notes carried into the design:

- `skip_subscription` "removes all items belonging to the given subscription from the given order
  and generates the next order for those items" — the item reappears on an order one interval later.
- `send_now` "sets order placement within a 24-hour window".
- `change_next_order_date` requires a future date; `reactivate` requires `start_date` and, when
  given, a `next_order_date` that is not in the past.
- Mutations on a **prepaid** subscription return 400; every observed SSW subscription is
  `replenishment`, so this is the generic error path, not a feature.

### 3.3 Types and builders

```ts
// types.ts
/** Ordergroove period codes: 1 = days, 2 = weeks, 3 = months */
export type FrequencyPeriod = 1 | 2 | 3;

export interface OgSubscription {
  …existing fields…
  every: number;
  every_period: FrequencyPeriod;
}
```

Both fields were observed live on every subscription in the Phase 1 spike (memory note, "Data
observed"). `buildOgSubscriptionWith` defaults `every: 4, every_period: 2, frequency_days: 28`
together so fixtures stay consistent; tests that need months pass all three.

## 4. View model (`viewModel.ts`, pure)

### 4.1 Card additions

```ts
export interface SubscriptionCard {
  …existing fields…
  every: number;
  everyPeriod: FrequencyPeriod;
  /** Ordergroove address public_id the subscription ships to */
  shippingAddressId: string;
  /** the earliest upcoming order holding one of its items; null when nothing is scheduled */
  nextOrder: {
    orderId: string;
    /** other subscriptions' products in that same order, for the send-now confirm */
    otherProducts: { externalProductId: string; name: string | null }[];
  } | null;
}
```

`nextOrder` is built inside the existing `nextOrderDates` join: the order that supplies
`nextOrderDate` supplies `orderId`; `otherProducts` are the `product`s of the other
subscription-bearing items on that order (one-time items, `subscription === null`, are skipped),
named through the products lookup, `null` when unknown so the component can fall back to
`subscriptions.card.unnamedProduct`.

*As built in 3b (2026-10-01).* `frequencyDays` left the card model. Every schedule text — the card's
line, the selects' options, the Reactivate dialog's — comes from `every` / `everyPeriod` through
`describeFrequency` (`format.ts`). That also fixes a Phase 2 display defect: the card printed
Ordergroove's `frequency_days`, so a 10-month subscription (`frequency_days: 300`) read "every 300
days". `viewModel.ts` also exports `frequencyKey({ every, period })`, the string
`"{every}-{period}"`, which is the value of every select that offers a schedule (§4.3).

### 4.2 Period arithmetic

```ts
const PERIOD_UNITS: Record<FrequencyPeriod, 'day' | 'week' | 'month'> = { 1: 'day', 2: 'week', 3: 'month' };

/** `date` plus `multiplier` intervals of the card's frequency, "YYYY-MM-DD" */
export const addIntervals = (date: string, every: number, period: FrequencyPeriod, multiplier: number) =>
  dayjs(date).add(every * multiplier, PERIOD_UNITS[period]).format('YYYY-MM-DD');
```

Calendar arithmetic, not `frequency_days`: the manager shows Sep 19 + 10 months = **Jul 19, 2027**
and Sep 19 + 2 months = **Nov 19, 2026** (§12.1), which `frequency_days` (30-day months) would miss.

- **Skip projection:** `addIntervals(nextOrderDate, every, everyPeriod, 1)`.
- **Change-date presets:** multipliers 1, 2, 3 → `{ date, every: every * k, period }` for the label
  "In 10 months (Jul 19, 2027)".

### 4.3 Frequency options

```ts
// Ordergroove merchant configuration as baked into SSW's manager bundle, captured 2026-09-17 (§12.2).
// Not readable from the REST API; revisit here if SSW changes the offer in Ordergroove.
export const FREQUENCY_OPTIONS: { every: number; period: FrequencyPeriod }[] = [
  { every: 2, period: 1 }, { every: 4, period: 1 }, { every: 6, period: 1 }, { every: 8, period: 1 },
  { every: 10, period: 1 }, { every: 12, period: 1 }, { every: 1, period: 1 },
  { every: 2, period: 2 }, { every: 4, period: 2 }, { every: 6, period: 2 }, { every: 8, period: 2 },
  { every: 10, period: 2 }, { every: 12, period: 2 },
];

/** The list in SSW's order, with the card's current frequency appended when it is not in the list. */
export const frequencyOptions = (every: number, period: FrequencyPeriod) => …
```

The order is the manager's (days, then "1 day", then weeks). A current "10 months" appears as the
last, selected option, exactly as the manager renders it (`selected disabled` there; plain
selected here).

*As built in 3b:* `FREQUENCY_OPTIONS` stays private to `viewModel.ts` — components read the list
through `frequencyOptions` — and each option carries `frequencyKey` (§4.1) as its select value, so a
schedule SSW does not offer is selected rather than blank in the card's Frequency select and in the
Reactivate dialog alike.

### 4.4 Quantity options

`quantityOptions(current)` → `1…20`, plus `current` when greater (the manager shows 32 for one of
this customer's subscriptions).

### 4.5 Cancel reasons

```ts
// Codes and canonical English labels the manager sends; the API body is "{code} | {label}".
export const CANCEL_REASONS = [
  { code: 2, label: 'I have too many of this product' },
  { code: 8, label: 'This product is too expensive' },
  { code: 31, label: 'I had trouble managing my subscription' },
  { code: 70, label: 'I no longer have any use for this product and I will not need it in the near future' },
  { code: 3, label: 'I stopped using this product' },
  { code: 22, label: 'I wanted to switch to a different product/flavor' },
  { code: 15, label: "I don't like this product" },
] as const;
export const OTHER_REASON_CODE = 1;
const NO_SURVEY_REASON = '114|Cancelled without exit survey response';

export const cancelReasonBody = (selection: { code: number; details?: string } | null) => string
```

- A listed reason → `"{code} | {label}"` (spaces around the pipe, as the manager's radios).
- Other → `"1 | {details}"` with details trimmed; when the field is empty the body is the bare
  radio value the manager itself carries, `"1"`.
- No selection → the manager's hidden no-survey value verbatim, `114|Cancelled without exit survey response`.
- The UI labels come from `en.json`; the body always uses the canonical English label above so
  Ordergroove's reporting matches the hosted manager byte for byte.

### 4.6 Address options (3b)

`buildAddressOptions(addresses: OgAddress[] | undefined, currentId: string)` →
`{ publicId, summary: AddressSummary, isCurrent }[]`:

- live records only (`live === true`), plus the current address even if not live;
- deduplicated on normalised fields (lower-cased, whitespace-collapsed `first_name`, `last_name`,
  `company_name`, `address`, `address2`, `city`, `state_province_code`, `zip_postal_code`,
  `country_code`) — the Phase 1 display rule. Ordergroove address records carry **no type**, so
  billing records collapse into their shipping twins rather than being filtered;
- the record whose `public_id` is the subscription's `shipping_address` wins its duplicate group so
  the preselected radio is the id Ordergroove already holds; otherwise the first live record;
- sorted current first, then by summary name.

The hosted manager shows 10 "Ship to" choices for this customer's 24 records; the dedupe must land on
the same 10 (§10.1 checks the count).

*As built in 3b (2026-10-01), amended by Task 0 finding J.* `buildAddressOptions` (`viewModel.ts`)
returns `AddressOption { publicId, summary, isCurrent }[]`; each active card's owner builds it from
the page's addresses lookup and the card's `shippingAddressId`. The dedupe key is the normalised
**street line (`address`) alone**, not the nine fields above. The read-only dump of this customer's 24
live records gave 22 distinct nine-field identities against the manager's 10 — 18 on name + street +
address2 + ZIP, 18 on street + address2 + city + state + ZIP, 14 on street + ZIP — and exactly **10**
on the street line, the manager's count, so the street line is the key. Ordergroove mints an address
record per checkout, so one place accumulates records that differ in company, suite line, city
spelling or ZIP+4. The rest is as specified: live records plus the current one even when retired;
the current record wins its group, otherwise the first live record in API order; current first,
then by name. Known cost: two real addresses that share a street line in different cities collapse
into one choice (the hosted manager does the same). While the lookup is pending or failed there are
no options, and the address line shows no `Change` control rather than an empty dialog.

## 5. Page hook (`hooks/useSubscriptionActions.ts`)

```ts
export const useSubscriptionActions = (customerId: number) => ({
  skip:            useMutation<OgOrder, OrdergrooveError, { orderId: string; subscriptionId: string }>,
  sendNow:         useMutation<OgOrder, OrdergrooveError, { orderId: string }>,
  changeDate:      useMutation<OgSubscription, OrdergrooveError, { subscriptionId: string; orderDate: string }>,
  changeFrequency: useMutation<…, { subscriptionId: string; every: number; everyPeriod: FrequencyPeriod }>,
  changeQuantity:  useMutation<…, { subscriptionId: string; quantity: number }>,
  cancel:          useMutation<…, { subscriptionId: string; cancelReason: string }>,
  reactivate:      useMutation<…, { subscriptionId: string; startDate: string; every: number; everyPeriod: FrequencyPeriod; nextOrderDate: string }>,
  changeAddress:   useMutation<…, { subscriptionId: string; addressId: string }>,
});
```

### 5.1 Instances

Each `SubscriptionActions` row (one per card) calls the hook, so `isPending` is per card and two
cards can never share a spinner. `customerId` comes from Redux once in `SubscriptionsManager` and
is passed down (AGENTS.md: read Redux at the top of the page).

### 5.2 On success

1. `queryClient.invalidateQueries({ queryKey: ['ordergroove', customerId, 'subscriptions'] })` and
   `…'upcoming'`. `sendNow` also invalidates `…'orderHistory'` (the order leaves status 1 and
   appears in history). Products, payments and addresses are untouched.
2. Success snackbar (`snackbar.success`, `@/utils/b3Tip`) with the action's copy (§7).
3. The row closes its dialog.

Data stays present during the refetch (`isPending` false), so cards update in place with no skeleton.

### 5.3 On error

One `snackbar.error`: `subscriptions.sessionExpired` for `kind === 'sessionExpired'`, otherwise
`subscriptions.actions.error`. The dialog stays open with its button re-enabled so the customer can
retry or close. Inline selects fall back to the query value (they render from it).

## 6. UX

### 6.1 Actions row (`SubscriptionActions`)

```
[image] Product name                                            Next order Oct 3, 2026
        SKU 12345 · View product
        Quantity [ 2 ▾ ]   Frequency [ every 4 weeks ▾ ]                      (3b; 3a keeps the text line)
        Ships to  Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701 · Change   (3b)
        Paid with Visa ending in 1111 · exp 3/2028
        [ Skip ] [ Send now ] [ Change date ]                     Cancel subscription (3b)
```

- MUI `Button size="small" variant="outlined"` for the three order actions; `variant="text"` for
  Cancel subscription, right-aligned on desktop, wrapping under the others on phones.
- The row owns `open: 'skip' | 'sendNow' | 'changeDate' | 'cancel' | 'reactivate' | 'address' | null`
  and renders exactly one dialog. Every button is disabled while any of the row's mutations is
  pending.
- Cancelled card: a single `Reactivate` outlined button.

### 6.2 Dialogs

All on `B3Dialog` (`maxWidth="sm"`, `fullScreen` on phones by the component itself). The right
button carries the verb and uses `loading={isPending}` (spinner + disabled); the left button is
`global.dialog.cancel` unless stated. Dates render with `formatDate` from `format.ts` like the card.

**Calendar dates (found in 3a, fixes a Phase 2 defect).** `displayFormat` converts an instant into
the store's wall clock, so it shifts its argument by the store's timezone offset. Ordergroove's
`place` is a calendar day, not an instant, and on this store (offset `-21600`) every date on the
page rendered **one day early** — the live page showed "Nov 19th 2026" for an order Ordergroove
places on 2026-11-20, across all fourteen cards and the order history. The page now formats
calendar dates with `displayCalendarDate` (`src/utils/b3DateFormat`), which formats local midnight
of the given day and so cannot move it. Anything rendering an Ordergroove date — card, dialogs,
order rows — goes through `format.ts`'s `formatDate`.

| Dialog | Body | Right button | Notes |
|---|---|---|---|
| **Skip** | "{product} will leave your order on {date}. Your next order will be on {projectedDate}." | Skip | `projectedDate` from §4.2. |
| **Send now** | "Your order will be placed within 24 hours and charged to {card}." — `{card}` is the card's payment summary; the sentence without the charge clause when payment is unknown. When `nextOrder.otherProducts` is non-empty: "This order also includes:" and a bulleted list of names (fallback `Product {id}`). | Send now | |
| **Change date** | `RadioGroup`: three presets labelled "In {offset} ({date})" with offsets from §4.2 (e.g. "In 8 weeks (Nov 28, 2026)"), then "Pick a date" which reveals a native date input (MUI `TextField type="date"`, `min` = tomorrow) with the hint "Choose a date after today." when the typed date is not in the future. *As built in 3a: the native input replaced `B3Picker` because no test in the repo drives the MUI x-date-pickers input, the native input enforces `min` for free and `fireEvent.change` tests it reliably; on phones it opens the OS picker.* | Save | Save disabled until a preset is chosen or a valid picked date (after today) exists. |
| **Cancel** (3b) | First: "Want to skip the next order instead?" with a `Skip next order` link that closes this dialog and opens Skip (hidden when the card has no upcoming order). Then "Tell us why (optional)" `RadioGroup` of the seven reasons plus "Other (please specify)" with a `TextField` shown when Other is selected. | Cancel subscription (`color="error"`) | Left button reads "Keep subscription". *As built in 3b: the error colour is `B3Dialog`'s `rightStyleBtn={{ color: 'error.main' }}` on the confirm; the actions row's own `Cancel subscription` is a plain text button, right-aligned on desktop through MUI's `md` breakpoint (900 px) while the card switches layout on `useMobile` (768 px), so between 769 and 899 px the card is in its desktop layout but the button still follows the others instead of sitting at the row's end — cosmetic, left as is.* |
| **Reactivate** (3b) | "You'll receive {product} again in an upcoming order." `Select` "Frequency" (options from §4.3 with the old frequency preselected when in the list, else the first option) and `B3Picker` "First order date" defaulting to tomorrow, minimum tomorrow. Body sent: `start_date` today, `next_order_date` the picked date. | Reactivate | *As built in 3b: the date is a native `TextField type="date"` with `min` = today + `FIRST_ORDER_MIN_DAYS` (= 1; Task 0 finding H: Ordergroove accepted tomorrow), not `B3Picker`, for the reasons given under Change date; a date before `min`, or none, shows `subscriptions.actions.reactivate.dateHint` and disables the button. The "else the first option" branch never runs: §4.3 always appends the card's own schedule, so the old frequency is always on the list and always preselected.* |
| **Change address** (3b) | `RadioGroup` of address summaries (§4.6), current preselected. Footer: "To add a new address, use the subscription manager." where "subscription manager" is the existing escape link (`target="_top"`). | Save | Save disabled until the selection differs from the current id. |

Retention: the Skip nudge is the whole flow — the manager's "Options that may work for you" offers
only skip for SSW (no cancel-flow discount configured, §12.1).

### 6.3 Inline selects (3b, `QuantityFrequencySelects`)

- Two MUI `TextField select size="small"`, labelled "Quantity" and "Frequency", values from §4.3
  and §4.4; the option label for frequency reuses `subscriptions.card.everyWeeks` /
  `everyDays` and the new `everyMonths`.
- `onChange` calls the mutation immediately. While pending the select is disabled and a
  `CircularProgress size={16}` sits in its end adornment. Value is always the card's current value,
  so a failed save visibly snaps back. *As built in 3b: the spinner replaces the select's dropdown
  arrow (`SelectProps.IconComponent`) rather than sitting in an end adornment; only the select whose
  own write is in flight shows it, and both are disabled while any write on the card is pending.*

### 6.4 States

| State | Rendering |
|---|---|
| card has no upcoming order | Skip / Send now / Change date absent (the manager hides them too) |
| any mutation of the row pending | that row's buttons disabled, dialog button spinning, selects disabled |
| mutation failed | error snackbar; dialog stays open, re-enabled; select snaps back |
| mutation succeeded | success snackbar; dialog closes; the card re-renders from the refetched queries |
| `sessionExpired` from a mutation | snackbar with the existing session copy; the page-level warning appears too once the refetch fails |
| products lookup still pending | dialogs use the product-name fallback exactly like the card |

## 7. Copy (`en.json`, all new)

```json
"subscriptions.actions.skip": "Skip",
"subscriptions.actions.sendNow": "Send now",
"subscriptions.actions.changeDate": "Change date",
"subscriptions.actions.cancel": "Cancel subscription",
"subscriptions.actions.reactivate": "Reactivate",
"subscriptions.actions.changeAddress": "Change",
"subscriptions.actions.quantityLabel": "Quantity",
"subscriptions.actions.frequencyLabel": "Frequency",
"subscriptions.card.everyMonths": "every {count, plural, one {month} other {# months}}",
"subscriptions.actions.error": "We couldn't apply that change. Please try again.",

"subscriptions.actions.skip.title": "Skip next order",
"subscriptions.actions.skip.body": "{product} will leave your order on {date}. Your next order will be on {nextDate}.",
"subscriptions.actions.skip.confirm": "Skip",
"subscriptions.actions.skip.success": "Next order skipped.",

"subscriptions.actions.sendNow.title": "Send order now",
"subscriptions.actions.sendNow.body": "Your order will be placed within 24 hours and charged to {card}.",
"subscriptions.actions.sendNow.bodyNoCard": "Your order will be placed within 24 hours.",
"subscriptions.actions.sendNow.alsoIncludes": "This order also includes:",
"subscriptions.actions.sendNow.confirm": "Send now",
"subscriptions.actions.sendNow.success": "Order on its way. It will be placed within 24 hours.",

"subscriptions.actions.changeDate.title": "Change next order date",
"subscriptions.actions.changeDate.preset": "In {offset} ({date})",
"subscriptions.actions.changeDate.offsetDays": "{count, plural, one {# day} other {# days}}",
"subscriptions.actions.changeDate.offsetWeeks": "{count, plural, one {# week} other {# weeks}}",
"subscriptions.actions.changeDate.offsetMonths": "{count, plural, one {# month} other {# months}}",
"subscriptions.actions.changeDate.pick": "Pick a date",
"subscriptions.actions.changeDate.pickerLabel": "Next order date",
"subscriptions.actions.changeDate.pickerHint": "Choose a date after today.",
"subscriptions.actions.changeDate.confirm": "Save",
"subscriptions.actions.changeDate.success": "Next order date updated.",

"subscriptions.actions.frequency.success": "Frequency updated.",
"subscriptions.actions.quantity.success": "Quantity updated.",

"subscriptions.actions.cancel.title": "Cancel subscription",
"subscriptions.actions.cancel.skipInstead": "Want to skip the next order instead?",
"subscriptions.actions.cancel.skipInsteadLink": "Skip next order",
"subscriptions.actions.cancel.reasonsTitle": "Tell us why (optional)",
"subscriptions.actions.cancel.reason.2": "I have too many of this product",
"subscriptions.actions.cancel.reason.8": "This product is too expensive",
"subscriptions.actions.cancel.reason.31": "I had trouble managing my subscription",
"subscriptions.actions.cancel.reason.70": "I no longer have any use for this product and I will not need it in the near future",
"subscriptions.actions.cancel.reason.3": "I stopped using this product",
"subscriptions.actions.cancel.reason.22": "I wanted to switch to a different product/flavor",
"subscriptions.actions.cancel.reason.15": "I don't like this product",
"subscriptions.actions.cancel.reason.other": "Other (please specify)",
"subscriptions.actions.cancel.otherPlaceholder": "Tell us more",
"subscriptions.actions.cancel.keep": "Keep subscription",
"subscriptions.actions.cancel.confirm": "Cancel subscription",
"subscriptions.actions.cancel.success": "Subscription cancelled.",

"subscriptions.actions.reactivate.title": "Reactivate subscription",
"subscriptions.actions.reactivate.body": "You'll receive {product} again in an upcoming order.",
"subscriptions.actions.reactivate.dateLabel": "First order date",
"subscriptions.actions.reactivate.dateHint": "Choose a date after today.",
"subscriptions.actions.reactivate.confirm": "Reactivate",
"subscriptions.actions.reactivate.success": "Subscription reactivated.",

"subscriptions.actions.address.title": "Change shipping address",
"subscriptions.actions.address.addNew": "To add a new address, use the {link}.",
"subscriptions.actions.address.addNewLink": "subscription manager",
"subscriptions.actions.address.confirm": "Save",
"subscriptions.actions.address.success": "Shipping address updated."
```

Reused: `subscriptions.card.unnamedProduct`, `subscriptions.card.payment` /
`paymentUnbranded` (for `{card}`), `subscriptions.card.everyWeeks` / `everyDays`,
`subscriptions.sessionExpired`, `global.dialog.cancel`.

*As built in 3b (2026-10-01).* Three amendments to the list above. `everyMonths` lives at
`subscriptions.card.everyMonths`, beside `everyWeeks` / `everyDays`, because the card's own
schedule line uses it too — there is no `subscriptions.actions.everyMonths`.
`subscriptions.actions.reactivate.dateHint` is new, for the Reactivate date's validation message.
`subscriptions.actions.changeAddress` ("Change") is the label of the button on the address line.

## 8. Error handling

Unchanged kinds (`OrdergrooveError`): the write helper maps exactly as reads do (§3.1). Every
failure is a snackbar (§5.3); nothing is retried by the client; no partial state is ever written
locally, so a failed write leaves the page identical to the last successful read. Two safety
properties the tests pin:

- **No double submit:** a row's buttons and selects are disabled while any of its mutations is
  pending; `B3Dialog` disables its right button on `loading`.
- **Truth after timeout:** a write that times out client-side after succeeding server-side shows the
  error snackbar, and the next refetch (Try again, or any later success) shows the real state.

**Scroll lock released on unmount (found in 3b).** `B3Dialog` locks the ThemeFrame's scroll through
`useScrollBar(isOpen)`, which only unlocked when `open` turned false. A cancel moves its card out of
the active list: the `subscriptions` refetch usually lands before the `upcoming` one, so the card —
and the open Cancel dialog it owns — could unmount before the write finished and its `onSuccess:
close` ran. With the cancelled list collapsed, its default, nothing else released the lock and the
page stayed unscrollable. `src/hooks/useScrollBar.ts` now releases the lock in an effect cleanup when
a component unmounts while open. Pinned by `src/hooks/useScrollBar.test.ts` and by a page case that
holds the `upcoming` refetch so the card leaves with its dialog open.

## 9. Analytics

None. The theme emitted no dataLayer events for manager actions (`docs/subscriptions-analytics-customer-recreation.md`
covers login and sign-up only), so there is nothing to keep in parity.

## 10. Testing

### 10.1 Task 0 — live probe before code (reversible writes only, throwaway script)

Scratchpad script beside Phase 2's `og-probe.mjs`, header minted through the middleware as there,
customer 80591, every step reads back the record and prints a redacted summary:

1. `GET /subscriptions/` → pick one active subscription **S** with an upcoming order; record
   `every`, `every_period`, `quantity`, `shipping_address`, its item's order **O** and `place`.
2. `PATCH /subscriptions/{S}/change_next_order_date/` (trailing slash) to `place + 1 day`; on a
   redirect or 404 retry without the slash and record which form works. Read `/orders/?status=1` +
   `/items/?status=1` → S's item now sits on an order dated +1 day. Restore with the original date.
3. `PATCH /orders/{O}/skip_subscription/ { subscription: S }` → S's item is on an order dated
   `place + 1 interval` (§4.2 arithmetic checked to the day). Restore with
   `change_next_order_date` to the original date; note whether Ordergroove merges the item back into
   O or leaves a second order on the same date (status 17 "merged" exists, so either is plausible).
4. (3b, run 2026-10-01; findings E–G) `change_frequency` to `{ every: 6, every_period: 2 }` and back;
   `change_quantity` to `quantity + 1` and back; `change_shipping` to another live address and back.
5. (3b, run 2026-10-01; findings H, I) One **already-cancelled** subscription **C**: `reactivate/`
   with `{ start_date: today, every, every_period, next_order_date: tomorrow }`, then `cancel/` with
   `114|Cancelled without exit survey response`.
6. (3b, run 2026-10-01; finding J) `GET /addresses/` → the §4.6 dedupe offline against the manager's 10.
7. **Never** call `send_now`, `orders/{id}/cancel/`, `items/{id}/delete/` or `addresses/create/`.

Findings go into the plan's Task 0 record and, if any contract differs, back into this spec.

**3a findings (probe run 2026-09-17, steps 1–3; steps 4–6 belong to 3b):** subject was a
12-month subscription (`every: 12, every_period: 3, frequency_days: 360`) alone on an order due
2026-11-20. (A) `change_next_order_date/` with the trailing slash answered 200 first time; the
response carries `every` and `every_period`. (B) `skip_subscription` moved the item to an order
dated 2027-11-20 — exactly one calendar interval, where a `frequency_days` sum would have said
2027-11-15 — and the emptied order stayed in `/orders/?status=1`; the join derives dates from items,
so an empty order never reaches a card. (C) Changing the date back re-attached the item to the
**original** order id; one upcoming order carried that date afterwards. (D) `every`/`every_period`
are on every list record, alongside `cancel_reason`, `cancel_reason_code`, `offer`,
`subscription_type`, `price` and `reminder_days`. Every write returned 200 and the subject ended
exactly where it started.

**3b findings (probe run 2026-10-01, steps 4–6; the 3b plan's Task 0 holds the full record):**
subject for E–G was a 10-month subscription (`every: 10, every_period: 3`) with its next order due
2027-08-01. (E) `change_frequency/` `{ every: 6, every_period: 2 }` answered 200 and the record read
back `6` / `2` / `frequency_days: 42`, but the upcoming order did **not** move — 2027-08-01 before the
change, after it and after the restore; the hook refreshes `upcoming` regardless (§5.2). The response
is presumably the subscription (33 top-level keys, as `reactivate` returned), but only the key count
was logged. (F) `change_quantity/` answered 200 and the upcoming order's item quantity **followed**
(sent `quantity + 1`: record 2, item 2; after the restore both 1). (G) `change_shipping/` answered
200 and the upcoming order's `shipping_address` **followed**; a later read-only dump found every
upcoming-order line on its subscription's address, so the restore reached the order. (H)
`reactivate/` accepted `next_order_date` = **tomorrow** on the first attempt (200; `live: true`,
`cancelled: null`, `start_date` today, an upcoming order dated tomorrow appeared), so the Reactivate
dialog's minimum is today + 1 (`FIRST_ORDER_MIN_DAYS`, §6.2); today itself was not tried. (I)
`cancel/` straight afterwards with `114|Cancelled without exit survey response` answered 200;
`cancel_reason` is stored verbatim, code prefix included, `cancel_reason_code` is `114` (parsed from
the prefix), and the upcoming order disappeared. A side effect the API will not undo: that
subscription's `cancelled` timestamp (2026-03-08 → 2026-10-01) and its `cancel_reason`
(`113|Disengaged`) were overwritten. (J) `GET /addresses/`: 24 records, all live, **22** distinct
nine-field identities against the manager's **10** — the §4.6 normalisation differed from the
manager's. By candidate key the counts are 22 (nine fields), 18, 18, 14 and exactly 10 on the street
line alone, which is the picker's key (§4.6 as built).

### 10.2 Unit and component tests (Vitest, MSW, builders)

- **`api.test.ts`** — per function: method, path and JSON body asserted from the intercepted
  request; one 403 → re-mint → retry once; the 10 s deadline (fake timers, ids hoisted outside the
  callback); 400 → `upstream`; 401 after retry → `sessionExpired`.
- **`viewModel.test.ts`** — `nextOrder` join with sibling products and one-time items ignored;
  `frequencyOptions` with and without the appended current value and order preserved;
  `quantityOptions(32)`; `addIntervals` for days, weeks and months against the manager's observed
  dates (Sep 19 + 10 months = Jul 19, 2027; Sep 19 + 2 months = Nov 19, 2026; Sep 29 + 2 weeks =
  Oct 13, 2026); `cancelReasonBody` for a listed reason, Other with details, Other with empty
  details, and no selection; `buildAddressOptions` dedupe, current-wins and preselect.
- **`useSubscriptionActions.test.tsx`** — for each mutation: the right keys invalidated (spy on
  `queryClient.invalidateQueries`), order history only for `sendNow`, success snackbar text, error
  snackbar by kind. Fixed ids hoisted (never random inside `renderHook`).
- **Dialog tests** — each dialog renders its copy from a built card, disables its confirm while
  pending, calls `onConfirm` with the exact variables; Change date: Save disabled until a choice,
  picker rejects today; Cancel: no selection → 114 body, Other → `"1 | text"`, the skip-instead link
  calls `onSkipInstead`; Address: preselect and Save disabled until changed.
- **`SubscriptionActions.test.tsx`** — only one dialog open at a time; all buttons disabled while
  one mutation pends; cancelled variant renders only Reactivate; no-order card hides the three
  order actions. *As built in 3b: this file covers only the presentational row — its button set with
  and without an upcoming order, the dialog each button names through `onOpen`, every button held
  while `disabled`. The one-dialog-at-a-time, pending and wiring cases moved to
  `ActiveSubscriptionCard.test.tsx`; the cancelled variant is `ReactivateAction.test.tsx` and the
  page test.*
- **`SubscriptionsManager.test.tsx`** — one end-to-end skip: click Skip, confirm, MSW receives the
  PATCH, the subscriptions/upcoming handlers return the moved date, the card shows it; the
  `sessionExpired` snackbar path. *As built in 3b: the cancelled-card case expects exactly one
  `Reactivate` button on the card (and no select), where it used to expect none.*
- **`SubscriptionsManager.mobile.test.tsx`** — 3b only: the selects go full width. 3a added no
  phone case: its row merely wraps (`flexWrap`), which jsdom cannot observe, and nothing structural
  differs between layouts. *As built in 3b: the phone case asserts the `MuiFormControl-fullWidth`
  class on each select's form control, reached with `closest()` as the repo's tests already do for
  MUI wrappers.*
- **Negative control** for every new test: revert the code under test, watch it fail, restore.
- Lint: knip (export only what `src` consumes — `CANCEL_REASONS` is consumed by a component, so
  exported; `FREQUENCY_OPTIONS`, as built, is reached only through `frequencyOptions`, so it is not;
  helpers used only by tests are not), depcruise, eslint with
  `--fix` for prettier.

### 10.3 Live checks after each merge (sandbox, customer 80591, deployed flag)

Phase 2's Playwright recipe with injection off. Through the real UI: open Skip on one card, confirm,
assert the snackbar and the card's new date; open Change date, pick the original date, confirm,
assert restoration. Assert one auth mint per page load, no failed Ordergroove requests, and **zero
requests whose path contains `send_now`** across the run. 3b adds: change quantity and frequency
and restore; change address and restore; Reactivate one already-cancelled subscription then cancel
it again through the Cancel dialog with no reason selected.

## 11. Out of scope and follow-ups

- Swap product (the manager's SKU-swap search; requires Ordergroove swap groups, unverified for SSW).
- Add, edit or delete an address (`/addresses/create/`, `/addresses/{id}/update/`).
- Retention discounts (`cancel_flow_discount_enabled` is off for SSW) and the post-cancel exit
  survey (`/subscriptions/{id}/update/ { cancel_reason }`).
- Prepaid subscriptions, one-time item removal (`/items/{id}/delete/`), item-level quantity.
- Failed-order retry (`/placement_logs/responses/` is merchant-key only).
- Removing the escape link and the iframe fallback — Phase 4 cutover.
- Change payment method — Phase 4.

## 12. Evidence (2026-09-17, read-only)

### 12.1 Hosted manager as customer 80591 (`/subscriptions`, screenshot and redacted markup in the session scratchpad)

- Layout: "Upcoming Orders" grouped by order (Next Order Sep 19, then Future Orders), each order
  with **Change order date** (date picker + Apply), **Skip Order**, **Send Now**; per item
  **Quantity** select (1–20, plus 32 where current), **Frequency** select, **More Options** →
  Skip Product, Pause Subscription, Cancel Subscription; Shipping card with an address dropdown of
  10 "Ship to" choices, "+ Add new address", Edit, Delete; Billing shows the card, **no
  change-payment control**; "Inactive Subscriptions" with **Reactivate**.
- Skip order dialog: "By skipping your upcoming order, the order will instead send on the next
  available date based on the frequency you selected." listing each product's new date (Tissue
  paper, 10 months: Jul 19, 2027; Nutcracker bags, 2 months: Nov 19, 2026).
- Send now dialog: "Are you sure you want to change your order date to send as soon as possible?"
- Pause dialog: "Select when you would like your shipments to resume." — three radios
  (`shipment_date`, "YYYY-MM-DD") at 1×, 2×, 3× the frequency (10/20/30 months; 2/4/6 months;
  2/4/6 weeks for a 2-week subscription).
- Cancel flow: "Options that may work for you" offers **only** "Skip product"; then reasons (radio
  `cancel_reason` values `"2 | I have too many of this product"`, `8`, `31`, `70`, `3`, `22`,
  `15`, Other `"1"` + text `cancel_reason_details`); a hidden default
  `114|Cancelled without exit survey response`.
- Reactivate dialog: "Sending {qty} every [frequency]", "Order Date" picker showing Sep 19 (capture
  day Sep 17), button "Subscribe".
- Swap dialog: a product search reading "No products found" before any search.
- Network: `GET /addresses/`, `/subscriptions/`, `/orders/`, `/items/`, `/products/{id}/` ×9,
  `/payments/{id}/`, `/addresses/{id}/`, `/advanced_incentives/prepaid/list_by_offer/live/`,
  `bigcommerce.ordergroove.com/api/customer-auth`, `collect.ordergroove.com/c/`.

### 12.2 Merchant bundle (`static.ordergroove.com/<merchant>/msi.js`, 1.9 MB)

- Frequency options are a literal array in the templates: `{every, period}` pairs
  `2,4,6,8,10,12 ×1`, `1×1`, `2,4,6,8,10,12 ×2` — §4.3 verbatim. The current frequency is appended
  as `selected disabled` when absent; period labels `{1: days, 2: weeks, 3: months}`.
- Settings read by the bundle: `cancel_flow_discount_enabled`, `entitlements_enabled`.
- Store slices include `sku_swap`, `retention_incentives`, `prepaid_incentives` — none surfaced in
  the SSW capture beyond the empty swap search.

### 12.3 Endpoint map inside the bundle (what the manager itself calls)

```
orders.send_now           PATCH /orders/{id}/send_now/
orders.change_place_date  PATCH /orders/{id}/change_place_date/            { place }
orders.change_shipping    PATCH /orders/{id}/change_shipping/              { shipping_address }
orders.cancel             PATCH /orders/{id}/cancel/
orders.skip_subscription  PATCH /orders/{id}/skip_subscription/            { subscription }
subscriptions.cancel      PATCH /subscriptions/{id}/cancel/                { cancel_reason }
subscriptions.change_shipping        PATCH /subscriptions/{id}/change_shipping/       { shipping_address }
subscriptions.reactivate             PATCH /subscriptions/{id}/reactivate/            { start_date, every, every_period, next_order_date? }
subscriptions.change_next_order_date PATCH /subscriptions/{id}/change_next_order_date  { order_date: "YYYY-MM-DD" }   (no trailing slash)
subscriptions.change_product         PATCH /subscriptions/{id}/change_product/        { product }
subscriptions.change_quantity        PATCH /subscriptions/{id}/change_quantity/       { quantity }
subscriptions.change_frequency       PATCH /subscriptions/{id}/change_frequency/      { every, every_period }
subscriptions.update                 PATCH /subscriptions/{id}/update/                { cancel_reason }   (exit survey)
items.delete              DELETE /items/{id}/delete/                                              (one-time items)
items.change_quantity     PATCH /items/{id}/change_quantity                 { quantity }          (no trailing slash)
addresses.create          POST  /addresses/create/
addresses.edit            PATCH /addresses/{id}/update/
addresses.use_for_all     POST  addresses/{id}/use_for_all/  (204)
```

### 12.4 Reference pages consulted

`developer.ordergroove.com/reference/`: `skip-subscription`, `orders-send-now`,
`orders-change-place-date`, `orders-cancel`, `change-next-order-date`,
`subscriptions-change-frequency`, `subscriptions-change-quantity`, `subscriptions-cancel`,
`subscriptions-reactivate`, `subscriptions-change-shipping-address`, `subscriptions-change-product`,
`items-delete`, `items-change-quantity`, `addresses-create`, `order-placement-attempts`. Every
mutation used here lists the Storefront API scope as accepted.
