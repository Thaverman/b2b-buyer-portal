# Ordergroove Phase 4 — change the card on a subscription (design)

**Date:** 2026-09-17
**Status:** Approved in review (sections 1–3), awaiting written-spec review
**Program spec:** [2026-09-15-ordergroove-subscriptions-custom-manager-design.md](2026-09-15-ordergroove-subscriptions-custom-manager-design.md) §9
**Builds on:** [Phase 3a — order actions](2026-09-17-ordergroove-phase3-subscription-actions-design.md), merged to `dev` and live on sandbox 2026-09-17
**Companion:** [Ordergroove auth path](2026-09-17-ordergroove-auth-path-design.md) — this phase is built on today's transport on purpose; see §3.4
**Evidence:** Ordergroove REST reference (§11.1); the 2026-09-15 spike's token findings (program spec §2)

This is the feature the whole program was for: a customer can move a subscription onto a different
saved card, and can rescue their subscriptions from the card they are about to delete.

---

## 1. Decisions

| # | Decision | Alternatives rejected |
|---|---|---|
| 1 | **Two entry points:** a *Change card* action on each active subscription card, and a *move* offer inside the Phase 1 delete dialog. | Subscription card only (a customer with fourteen affected subscriptions repoints them one at a time); delete dialog only (solves the breakage and nothing else). |
| 2 | **Saved cards only.** The picker lists cards already vaulted on the account; adding a card stays on `/payment-methods`. | Inline add-card, which couples this to the recently reworked Braintree flow and widens the PCI surface for no new capability. |
| 3 | **Reuse before create.** Use an existing **live** Ordergroove payment record whose `token_id` equals the chosen instrument's token; create one only when there is none. | Always create (Ordergroove already holds four token ids for three BigCommerce cards on the test account — always creating compounds that). |
| 4 | **The delete-dialog move uses `use_for_all`**, and the copy says so: "Use this card for all my subscriptions". On an account whose subscriptions are split across cards this moves **all** of them, not only the affected ones — so the copy must not promise otherwise. | Looping `change_payment` over just the affected subscriptions: precise, but N requests with partial-failure states and no atomicity, for a case (split cards) that does not exist on the fixture account. |
| 5 | **Moving never deletes.** After a successful move the dialog re-reads and shows that nothing uses the card any more; `Delete` stays unclicked. | Deleting in the same step — surprising, and the destructive half becomes un-reviewable. |
| 6 | **The live probe never creates a payment record.** Ordergroove has no delete for payment records (`PATCH /payments/{id}` only deactivates), so creation is one-way. The probe repoints between records the account already holds. | Probing creation live and leaving undeletable rows on the fixture account for every run. |
| 7 | **Built on today's browser-to-Ordergroove transport.** The auth companion's proxy is the target, and `request()` is the single seam, so this migrates with everything else in one change. | Blocking the feature on a middleware proxy that does not exist yet. |

## 2. Shape

### 2.1 Where things render

- **Subscription card** (`/manage-subscriptions`): a `Change card` action joins Skip, Send now and
  Change date in the Phase 3a actions row. Shown on active cards; unlike the order actions it does
  **not** require an upcoming order, because repointing a subscription with nothing scheduled is
  still meaningful.
- **Delete dialog** (`/payment-methods`): when the Phase 1 warning has found affected subscriptions
  **and** the customer has at least one other saved card, the dialog offers the move.
- Masquerade, the platform gate and the host flags are unchanged. The subscription-card action is
  behind `customManager` like the rest of the page; the delete-dialog move is behind the Phase 1
  parent flag, so it can reach production without the custom page.

### 2.2 Files

```
apps/storefront/src/shared/service/ssw/                         (new — §4)
  customerClient.ts            transport + StoredInstrument + listStoredInstruments
apps/storefront/src/shared/service/ordergroove/
  api.ts                       + assertOk/ogMutateNoContent, createPayment,
                               changeSubscriptionPayment, changeOrderPayment, usePaymentForAll
  index.ts                     + those four, + NewPaymentInput
apps/storefront/src/pages/ManageSubscriptions/
  viewModel.ts                 + buildCardOptions, resolvePaymentRecord, ccTypeFor, formatExpiry
  hooks/useSubscriptionActions.ts          + changeCard mutation
  components/actions/SubscriptionActions.tsx  + the Change card button and dialog
  components/actions/ChangeCardDialog.tsx  (new)
apps/storefront/src/pages/PaymentMethods/
  api.ts                       imports transport from the shared client; keeps its own actions
  index.tsx                    wires the move offer into the delete dialog
  components/DeleteSubscriptionWarning.tsx  + the move offer and its result
  hooks/useMoveSubscriptions.ts            (new)
apps/storefront/src/lib/lang/locales/en.json   subscriptions.actions.changeCard.*,
                                               paymentMethods.deleteDialog.move.*
```

Tests co-locate as `*.test.ts[x]`.

### 2.3 Delivery

One plan, merged once. The two entry points share the service functions and the resolve-or-create
rule, so splitting them would duplicate the interesting part and test it twice.

## 3. Service

### 3.1 A no-content helper

`POST /payments/{id}/use_for_all/` answers **200 with an empty body**. Today's `parse()` always calls
`response.json()`, which rejects on an empty body — and because `ogMutate` does not wrap that
rejection, a *successful* move would surface as a raw `SyntaxError`, miss the `OrdergrooveError`
branch in the hook's `onError`, and show the customer a failure. Split the status mapping out:

```ts
const assertOk = (response: Response) => {
  if (response.ok) {
    return;
  }
  if (response.status === 401 || response.status === 403) {
    throw new OrdergrooveError('sessionExpired');
  }
  if (response.status === 429) {
    throw new OrdergrooveError('rateLimited');
  }
  throw new OrdergrooveError('upstream');
};

const parse = async <T>(response: Response): Promise<T> => {
  assertOk(response);

  return response.json() as Promise<T>;
};

/** For endpoints that answer 200 with no body. */
const ogMutateNoContent = async (
  customerId: string,
  url: string,
  method: Write['method'],
  body?: object,
): Promise<void> => {
  assertOk(await request(customerId, url, true, { method, body }));
};
```

`ogFetch` and `ogMutate` keep their behaviour; only the mapping moves.

### 3.2 Endpoints

All four accept Storefront scope (reference, §11.1).

| Function | Call | Body |
|---|---|---|
| `createPayment(customerId, input)` → `OgPayment` | `POST /payments/create/` | see §3.3 |
| `changeSubscriptionPayment(customerId, subscriptionId, paymentId)` → `OgSubscription` | `PATCH /subscriptions/{id}/change_payment/` | `{ payment }` |
| `changeOrderPayment(customerId, orderId, paymentId)` → `OgOrder` | `PATCH /orders/{id}/change_payment/` | `{ payment }` |
| `usePaymentForAll(customerId, paymentId)` → `void` | `POST /payments/{id}/use_for_all/` | none |

`changeOrderPayment` exists because of the open question in §9.1: the reference does not say whether
an already-generated upcoming order follows its subscription's new payment. **If the probe shows it
does, delete `changeOrderPayment` before implementing** — the plan's Task 0 decides, and the spec is
written so the answer removes code rather than adding it.

### 3.3 Creating a record

```ts
export interface NewPaymentInput {
  /** the BigCommerce stored-instrument token — Ordergroove's token_id, byte for byte (spike §2) */
  tokenId: string;
  last4: string;
  /** "MM/YYYY", zero-padded */
  expiry: string;
  /** Ordergroove credit-card type code; omitted when the brand is not one we map */
  ccType?: number;
  /** the billing address of the subscription's current payment record, when known */
  billingAddress?: string;
}
```

Required by Ordergroove: `customer`, `cc_number_ending`, `token_id`. Optional and sent when known:
`cc_exp_date`, `cc_type`, `billing_address`. `cc_holder`, `label` and `payment_method` are not sent.
The response carries the new record's `public_id`, which is what the repoint then uses.

### 3.4 Transport

Unchanged: `request()` in `api.ts` remains the only place that calls `fetch` for Ordergroove and the
only place that attaches the credential, so the auth companion's proxy migration stays a
one-function change.

## 4. The shared middleware client

`listStoredInstruments` gets its second consumer, which the program spec (§12.6) anticipated.

**Move** the SSW customer-middleware transport out of `pages/PaymentMethods/api.ts` into
`src/shared/service/ssw/customerClient.ts`: `getPaymentMethodsConfig`, `isPaymentMethodsAvailable`,
`PaymentMethodsError`, `fetchJson`, the `RawInstrument`/`normalize` pair, `StoredInstrument` and
`listStoredInstruments`.

**Leave in the page:** `setDefaultStoredInstrument`, `deleteStoredInstrument`,
`getBraintreeClientToken` and `vaultAccess` — page-specific actions that import `fetchJson` from the
shared module.

**One canonical path.** The eight files that import `StoredInstrument` or `listStoredInstruments`
from `./api` are updated to import from the shared module rather than having the page re-export
them; two import paths for one symbol is worse than a mechanical edit, and most of the eight are
tests.

**The error type keeps its name.** `PaymentMethodsError` still describes what it is — failures of
the customer payment-method middleware, including the `declined` kind — and renaming it would churn
every call site for no gain.

## 5. View model (pure, `viewModel.ts`)

```ts
export interface CardOption {
  /** BigCommerce stored-instrument token */
  token: string;
  brand: string;
  last4: string;
  /** "M/YYYY" for display */
  expiry: string;
  isCurrent: boolean;
  /** the live Ordergroove record already holding this token, when there is one */
  paymentId: string | null;
}

export const buildCardOptions = (
  instruments: StoredInstrument[],
  payments: OgPayment[] | undefined,
  currentPaymentId: string,
): CardOption[]
```

- One option per BigCommerce instrument, in the order the middleware returns them (default first).
- `paymentId` is the `public_id` of a **live** Ordergroove record whose `token_id` equals the
  instrument's token, else `null` — which is exactly the reuse-or-create decision, computed before
  any write.
- `isCurrent` is true when that record is the subscription's current `payment`. A dead record
  carrying the same token does **not** mark the option current, and does not count as reusable: the
  spike found Ordergroove keeps records for cards BigCommerce no longer has.

```ts
/** Ordergroove "Credit Card Types" — the inverse of the table the cards already render. */
export const ccTypeFor = (brand: string): number | undefined
```

`VISA` → 1, `MASTERCARD` → 2, `AMEX` and `AMERICAN EXPRESS` → 3, `DISCOVER` → 4, `DINERS` and
`DINERS CLUB` → 5, `JCB` → 6; matching is case-insensitive and trimmed. Anything else returns
`undefined` and the field is simply omitted, because Ordergroove marks it optional. BigCommerce
sends upper-case brands (`VISA`, `MASTERCARD`, `AMEX` in the fixtures).

```ts
/** BigCommerce month and year → Ordergroove "MM/YYYY". */
export const formatExpiry = (month: number, year: number): string
```

Zero-padded month, four-digit year. Ordergroove's existing records read `3/2028`, and the reference
accepts `MM/YYYY`; we send the documented form.

## 6. UX

### 6.1 Change card, on a subscription

`Change card`, an outlined small button in the Phase 3a actions row, opens a `B3Dialog`:

| Element | Behaviour |
|---|---|
| Body | A `RadioGroup` of `CardOption`s, each "Visa ending in 1111 · exp 3/2028"; the current one preselected and suffixed "(current)". |
| Only one saved card | No radio list. A line explaining there are no other saved cards, and a link to the payment methods page in the top window (`target="_top"`, the ThemeFrame rule). Save hidden. |
| Right button | `Save`, disabled until the selection differs from the current card, spinner while pending. |
| Left button | `global.dialog.cancel`; ignored while pending. |

On confirm: resolve or create the record, repoint the subscription, repoint its upcoming order if
§9.1 says orders do not follow, refresh `subscriptions`, `upcoming` and `payments`, snackbar, close.

### 6.2 Move before delete, on payment methods

The Phase 1 dialog gains a third state between "this card is used by N subscriptions" and the
buttons. It appears only when the warning found subscriptions **and** another saved card exists.

| State | Rendering |
|---|---|
| offer | "Use this card for all my subscriptions" with a `RadioGroup` of the other saved cards, and a `Move subscriptions` button. |
| moving | the button spins; `Delete` and `Cancel` are disabled. |
| moved | the warning is replaced by "No subscriptions use this card." The offer disappears. `Delete` becomes enabled and is **not** clicked for the customer. |
| failed | the generic error snackbar; the offer stays with its button re-enabled. |

The wording is deliberately "all my subscriptions", not "these subscriptions", because `use_for_all`
moves every subscription and order the customer has (decision 4).

After a successful move the dialog re-runs the Phase 1 affected-subscriptions query rather than
assuming the result, so what the customer sees is what Ordergroove says.

## 7. Copy (`en.json`, all new)

```json
"subscriptions.actions.changeCard": "Change card",
"subscriptions.actions.changeCard.title": "Change card",
"subscriptions.actions.changeCard.option": "{brand} ending in {last4} · exp {expiry}",
"subscriptions.actions.changeCard.optionUnbranded": "Card ending in {last4} · exp {expiry}",
"subscriptions.actions.changeCard.current": "{card} (current)",
"subscriptions.actions.changeCard.onlyCard": "This is your only saved card. To use a different one, add it on the {link}.",
"subscriptions.actions.changeCard.onlyCardLink": "payment methods page",
"subscriptions.actions.changeCard.confirm": "Save",
"subscriptions.actions.changeCard.success": "Card updated.",

"paymentMethods.deleteDialog.move.title": "Use this card for all my subscriptions",
"paymentMethods.deleteDialog.move.confirm": "Move subscriptions",
"paymentMethods.deleteDialog.move.success": "Subscriptions moved to {card}.",
"paymentMethods.deleteDialog.move.none": "No subscriptions use this card."
```

Reused: `subscriptions.actions.error` for failures, `subscriptions.sessionExpired`,
`global.dialog.cancel`, and the Phase 1 warning strings.

## 8. Error handling

Unchanged kinds and the same generic snackbar as Phase 3a. Two cases are specific to this phase:

- **Created, then failed to repoint.** A live record exists that nothing references. Harmless and
  self-healing: the next attempt finds it by token and reuses it rather than creating a second. No
  compensating delete exists and none is attempted.
- **A partial `use_for_all`.** The endpoint's atomicity is not documented, so the dialog never
  assumes: it re-reads the affected-subscriptions query and renders whatever comes back. A partial
  move shows a smaller non-zero count and the offer stays.

## 9. Testing

### 9.1 Task 0 — live probe, reversible, creates nothing

Scratchpad script in the shape of Phase 3a's, customer 80591, every step reading back and restoring.
It answers one question and confirms two facts.

1. **Does an upcoming order follow its subscription's new payment?** Pick an active subscription
   with an upcoming order; record `subscription.payment` and that order's `payment`. Repoint the
   subscription to a **different live record the account already holds** with
   `change_payment`. Read back both. Then repoint to the original.
   - Order's `payment` changed → **delete `changeOrderPayment`** from §3.2 and skip it in the hook.
   - Order's `payment` unchanged → keep it; the hook repoints the order too, and the copy is
     unaffected.
2. **Record inventory.** `GET /payments/` — confirm the account still shows several records sharing
   a token and at least one non-live record, so the §5 reuse rule has live coverage.
3. **`use_for_all` round trip.** All fourteen active subscriptions currently share one record, so
   calling `use_for_all` with a second record and then with the original is cleanly reversible.
   Record whether orders moved too (the reference says they do) and whether cancelled subscriptions
   were touched.
4. **Never** call `POST /payments/create/`, and never delete anything.

Findings go into the plan's Task 0 record, and any contract difference comes back into this spec.

### 9.2 Unit and component

- **Service:** each of the four calls asserts method, path and body; `usePaymentForAll` succeeds on
  an empty 200 body and does **not** throw; 400 and 423 map to `upstream`; 403 twice maps to
  `sessionExpired`.
- **View model:** `buildCardOptions` across the three spike cases — a live record for the token, only
  a dead record, no record — plus current-card marking and ordering; `ccTypeFor` for every mapped
  brand, mixed case, and an unmapped brand returning `undefined`; `formatExpiry` zero-padding.
- **Hook:** reuse path makes no create call; create path sends the §3.3 body and repoints the new
  `public_id`; the invalidation set is subscriptions, upcoming and payments; a failed repoint after a
  create does not retry the create; snackbars by error kind.
- **Change card dialog:** preselect, Save disabled until changed, the single-card message and its
  `target="_top"` link, pending disables.
- **Delete dialog:** the offer appears only with affected subscriptions *and* another card; after a
  successful move the warning re-reads to "No subscriptions use this card."; **`Delete` is not
  called** during the move (assert the delete mutation never fired); failure keeps the offer.
- **Page:** one end-to-end change through MSW, asserting the card line on the subscription updates.
- Every new test gets the revert-and-rerun negative control.

### 9.3 Live check after merge

Phase 3a's recipe with the deployed flag. Repoint one subscription to a second saved card through
the real dialog, assert the card line and the snackbar, then repoint back. Open the delete dialog,
confirm the move offer renders with the other cards, and **cancel without moving and without ever
clicking Delete**. Assert exactly the expected writes and no `use_for_all` during that pass. The
first real `POST /payments/create/` happens here if and only if the second card has no live record;
record that it leaves one spare record on the fixture account.

## 10. Out of scope

- Adding, editing or deleting a card (stays on `/payment-methods`).
- Changing the billing address on a payment record; `PATCH /payments/{id}` (activate/deactivate).
- PayPal, Apple Pay and Google Pay payment methods — `payment_method` is not sent.
- Prepaid subscriptions.
- The cutover that retires the iframe, the theme redirect and the middleware's body `customerId`:
  program spec §9, after this lands.
- The auth hardening and the proxy: the companion document.

## 11. Evidence

### 11.1 Reference, read 2026-09-17

- `POST /payments/create/` — required `customer`, `cc_number_ending`, `token_id`; optional
  `cc_holder`, `cc_exp_date` ("MM/YYYY" or "MM/YY"), `billing_address`, `label`, `cc_type` (int32),
  `payment_method`. Returns the record including `public_id` and `live`. Application **and**
  Storefront scope. 200 / 400 / 403.
- `PATCH /subscriptions/{id}/change_payment/` — `{ payment }`, returns the subscription. Both scopes.
  200 / 400 / 403 / 404. Silent on upcoming orders → §9.1.
- `POST /payments/{id}/use_for_all/` — no body, **200 with an empty response**, both scopes.
  "Associates provided payment to all orders and subscriptions of a customer."
- `PATCH /orders/{id}/change_payment/` — "changes the payment method and associated billing address".

### 11.2 Carried from the 2026-09-15 spike (program spec §2)

The BigCommerce stored-instrument `token` **is** Ordergroove's `token_id`, byte for byte. Ordergroove
mints a new payment record per checkout, so several records share one token and five of eight did on
the fixture account; it also keeps records for cards BigCommerce no longer has, so it held four
token ids against BigCommerce's three instruments. Both facts are why §5 reuses only **live** records
and matches on token rather than on last four digits.
