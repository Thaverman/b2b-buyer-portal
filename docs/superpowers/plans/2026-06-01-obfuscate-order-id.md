# Obfuscate Order ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display BigCommerce order IDs as reversible, branded, obfuscated strings (e.g. `123` → `HZ4BIDUG-SW`) in all UI text and in `/orderDetail` URLs, decoding back to the real numeric ID on the detail page and in search.

**Architecture:** A single pure utility module (`src/utils/orderId.ts`) owns one `sqids` instance and exports `formatOrderId` (real id → display string) and `parseOrderId` (display string / route param → real numeric id). Every display surface and link-builder calls `formatOrderId`; the detail page and search box call `parseOrderId`. Obfuscation is gated on `window.storeSuffix`: when it is absent, both functions pass the plain numeric id through, so behavior is identical to today.

**Tech Stack:** React 18, TypeScript, [`sqids`](https://github.com/sqids/sqids-javascript) `^0.3.0`, Vitest + jsdom + Testing Library + MSW + `vitest-when`, builders from `tests/test-utils`.

**Spec:** [docs/superpowers/specs/2026-06-01-obfuscate-order-id-design.md](../specs/2026-06-01-obfuscate-order-id-design.md)

**Working directory for ALL commands:** `apps/storefront/` (cd there first).

---

## Background the engineer needs

- **`sqids@0.3.0` API:** `import Sqids, { defaultOptions } from 'sqids'`. `new Sqids({ alphabet, minLength, blocklist })`. `sqids.encode(numbers: number[]): string`, `sqids.decode(id: string): number[]`. `defaultOptions.blocklist` is an exported `Set<string>` of ~700 profanity words. Passing a custom `blocklist` REPLACES the default, so we merge: `new Set([...defaultOptions.blocklist, 'Uline'])`.
- **The config (fixed):** alphabet `JH4D0BET3UA1W5VO8XZYIRLCGK7FQS96N2MP` (36 unique chars, validated), `minLength: 8`, blocklist = default profanity + `'Uline'`. The suffix comes from `window.storeSuffix` (set by a separate host project) and is appended as `-<suffix>` (e.g. `-SW`). The example `HZ4BIDUG-SW` is illustrative; the exact encoded body depends on the config — assert via round-trip, not against a hardcoded literal.
- **Disambiguation rule** (how `parseOrderId` tells the two forms apart): a pure-digit string is a real id; anything else is decoded. This is safe because `formatOrderId` only emits an obfuscated value when `window.storeSuffix` exists, and that value always carries a `-SUFFIX` and a predominantly-alphabetic body.
- **Why existing tests keep passing:** the test environment never sets `window.storeSuffix`, so `formatOrderId('66996') === '66996'` in every existing test. Existing assertions on `66996` / `4444` / `/orderDetail/66996` are unaffected. New behavior is tested in new `describe` blocks that set the suffix.
- **`MyOrders` and `CompanyOrderList` both render the same `pages/order/Order.tsx` component**, so editing `Order.tsx` fixes both lists.

## File structure

| File | Responsibility | Action |
|---|---|---|
| `apps/storefront/package.json` | dependency list | Modify — add `sqids` |
| `src/index.d.ts` | global `Window` typing | Modify — add `storeSuffix?: string` |
| `src/utils/orderId.ts` | encode/decode util (the only place that knows sqids) | Create |
| `src/utils/orderId.test.ts` | unit tests for the util | Create |
| `src/pages/order/Order.tsx` | order list: cell render, row navigation, search | Modify |
| `src/pages/order/OrderItemCard.tsx` | order list mobile card | Modify |
| `src/pages/OrderDetail/index.tsx` | detail: route-param decode + header display | Modify |
| `src/pages/Invoice/index.tsx` | invoice: order# column, navigation, search | Modify |
| `src/pages/Invoice/InvoiceItemCard.tsx` | invoice mobile card order# | Modify |
| `src/pages/Invoice/components/B3Pulldown.tsx` | invoice "View Order" action | Modify |
| Existing page test files | new obfuscation `describe` blocks | Modify (tests) |

---

## Task 1: Add the `sqids` dependency and the `window.storeSuffix` global type

**Files:**
- Modify: `apps/storefront/package.json` (dependencies)
- Modify: `apps/storefront/src/index.d.ts:56-59`

- [ ] **Step 1: Add the dependency**

In `apps/storefront/`, run:

```bash
yarn add sqids@^0.3.0
```

Expected: `package.json` gains `"sqids": "^0.3.0"` under `dependencies` and `yarn.lock` updates.

- [ ] **Step 2: Verify the install and exports**

Run:

```bash
node -e "const m=require('sqids'); const S=m.default??m.Sqids; const s=new S({alphabet:'JH4D0BET3UA1W5VO8XZYIRLCGK7FQS96N2MP',minLength:8,blocklist:new Set([...m.defaultOptions.blocklist,'Uline'])}); const id=s.encode([123]); console.log(id, s.decode(id));"
```

Expected: prints an 8+ char id and `[ 123 ]` (e.g. `HZ4BIDUG [ 123 ]`). Confirms the default export, `defaultOptions.blocklist`, and round-trip all work.

- [ ] **Step 3: Add the global type**

In `src/index.d.ts`, add `storeSuffix` to the first `Window` interface (the one starting at line 56). Insert after the `dataLayer` line:

```ts
  interface Window {
    tipDispatch: DispatchProps;
    globalTipDispatch: any;
    dataLayer?: Record<string, unknown>[];
    /** Store-specific suffix set by the host project; gates order-id obfuscation. */
    storeSuffix?: string;
    B3: {
```

- [ ] **Step 4: Type-check**

Run:

```bash
yarn tsc --noEmit
```

Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/package.json apps/storefront/yarn.lock apps/storefront/src/index.d.ts
git commit -m "feat: add sqids dependency and window.storeSuffix type for order-id obfuscation"
```

---

## Task 2: Create the core util `src/utils/orderId.ts` (TDD)

**Files:**
- Create: `apps/storefront/src/utils/orderId.test.ts`
- Create: `apps/storefront/src/utils/orderId.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/orderId.test.ts`:

```ts
import { formatOrderId, parseOrderId } from './orderId';

describe('with a store suffix set', () => {
  beforeEach(() => {
    window.storeSuffix = 'SW';
  });

  afterEach(() => {
    delete window.storeSuffix;
  });

  it('encodes a numeric id to an obfuscated string with the suffix', () => {
    const result = formatOrderId(66996);

    // encoded body uses only the configured alphabet (uppercase + digits), min length 8
    expect(result).toMatch(/^[A-Z0-9]{8,}-SW$/);
    expect(result).not.toContain('66996');
  });

  it('accepts a numeric string as input', () => {
    expect(formatOrderId('66996')).toBe(formatOrderId(66996));
  });

  it('round-trips every id back to the original number', () => {
    [0, 1, 42, 123, 66996, 999999, 2147483647].forEach((id) => {
      expect(parseOrderId(formatOrderId(id))).toBe(id);
    });
  });

  it('decodes an obfuscated value whose suffix is missing (tolerant)', () => {
    const withSuffix = formatOrderId(123); // e.g. "XXXXXXXX-SW"
    const withoutSuffix = withSuffix.replace(/-SW$/, '');

    expect(parseOrderId(withoutSuffix)).toBe(123);
  });

  it('treats a pure-digit string as a real id', () => {
    expect(parseOrderId('66996')).toBe(66996);
  });

  it('returns null for unparseable input', () => {
    expect(parseOrderId('not-an-id')).toBeNull();
    expect(parseOrderId('')).toBeNull();
  });

  it('never emits the blocklisted word "uline"', () => {
    for (let id = 1; id <= 3000; id += 1) {
      expect(formatOrderId(id).toLowerCase()).not.toContain('uline');
    }
  });

  it('falls back to the plain id for invalid numeric input', () => {
    expect(formatOrderId('abc')).toBe('abc');
    expect(formatOrderId(-5)).toBe('-5');
    expect(formatOrderId(1.5)).toBe('1.5');
  });
});

describe('without a store suffix', () => {
  beforeEach(() => {
    delete window.storeSuffix;
  });

  it('returns the plain numeric id', () => {
    expect(formatOrderId(66996)).toBe('66996');
    expect(formatOrderId('66996')).toBe('66996');
  });

  it('still parses pure-digit ids', () => {
    expect(parseOrderId('66996')).toBe(66996);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
yarn test src/utils/orderId.test.ts --run
```

Expected: FAIL — `Failed to resolve import "./orderId"` / module not found.

- [ ] **Step 3: Write the implementation**

Create `src/utils/orderId.ts`:

```ts
import Sqids, { defaultOptions } from 'sqids';

const ALPHABET = 'JH4D0BET3UA1W5VO8XZYIRLCGK7FQS96N2MP';
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

  if (!suffix || !Number.isInteger(numeric) || numeric < 0) {
    return String(id);
  }

  return `${sqids.encode([numeric])}-${suffix}`;
}

/** Display string (or raw route param) -> real numeric id, or null if it can't be resolved. */
export function parseOrderId(value: string): number | null {
  const raw = (value ?? '').trim();

  if (raw === '') {
    return null;
  }

  if (/^\d+$/.test(raw)) {
    return Number(raw); // pure digits = real id
  }

  const encoded = raw.replace(/-[^-]*$/, ''); // strip trailing -SUFFIX if present
  const [decoded] = sqids.decode(encoded);

  return decoded ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
yarn test src/utils/orderId.test.ts --run
```

Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/utils/orderId.ts src/utils/orderId.test.ts
git commit -m "feat: add order-id obfuscation util (formatOrderId/parseOrderId)"
```

---

## Task 3: Obfuscate the order list display + navigation (`Order.tsx`, `OrderItemCard.tsx`)

**Files:**
- Modify: `src/pages/order/Order.tsx:243` (navigation), `:264` (cell render), imports
- Modify: `src/pages/order/OrderItemCard.tsx:66` (mobile card), imports
- Test: `src/pages/MyOrders/index.test.tsx` (new `describe` block)

- [ ] **Step 1: Write the failing test**

Append this `describe` block to the END of `src/pages/MyOrders/index.test.tsx` (after the last existing top-level `describe`, before/after `describe.todo`). It reuses the file's existing builders (`buildCustomerOrderNodeWith`, `buildGetCustomerOrdersWith`, etc.) and imports the util:

```ts
describe('when order-id obfuscation is enabled', () => {
  const preloadedState = {
    company: buildCompanyStateWith({ customer: { role: CustomerRole.B2C } }),
    storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j F Y' } }),
  };

  beforeEach(() => {
    window.storeSuffix = 'SW';
    server.use(
      graphql.query('GetCustomerOrderStatuses', () =>
        HttpResponse.json(buildCustomerOrderStatusesWith('WHATEVER_VALUES')),
      ),
    );
  });

  afterEach(() => {
    delete window.storeSuffix;
  });

  it('displays the obfuscated order id instead of the raw id', async () => {
    server.use(
      graphql.query('GetCustomerOrders', () =>
        HttpResponse.json(
          buildGetCustomerOrdersWith({
            data: {
              customerOrders: {
                totalCount: 1,
                edges: [buildCustomerOrderNodeWith({ node: { orderId: '66996' } })],
              },
            },
          }),
        ),
      ),
    );

    renderWithProviders(<MyOrders />, { preloadedState });

    await waitForElementToBeRemoved(() => screen.queryAllByRole('progressbar'));

    const obfuscated = formatOrderId('66996');

    expect(screen.queryByRole('cell', { name: '66996' })).not.toBeInTheDocument();
    expect(screen.getByRole('cell', { name: obfuscated })).toBeInTheDocument();
  });

  it('navigates to the obfuscated order-detail url when clicking a row', async () => {
    server.use(
      graphql.query('GetCustomerOrders', () =>
        HttpResponse.json(
          buildGetCustomerOrdersWith({
            data: {
              customerOrders: {
                totalCount: 1,
                edges: [buildCustomerOrderNodeWith({ node: { orderId: '66996' } })],
              },
            },
          }),
        ),
      ),
    );

    const { navigation } = renderWithProviders(<MyOrders />, { preloadedState });

    await waitForElementToBeRemoved(() => screen.queryAllByRole('progressbar'));

    const obfuscated = formatOrderId('66996');

    await userEvent.click(screen.getByRole('cell', { name: obfuscated }));

    expect(navigation).toHaveBeenCalledWith(`/orderDetail/${obfuscated}`);
  });
});
```

Add the util import at the top of the file (with the other `@/` imports):

```ts
import { formatOrderId } from '@/utils/orderId';
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
yarn test src/pages/MyOrders/index.test.tsx --run -t "obfuscation"
```

Expected: FAIL — the cell shows `66996` (raw) and navigation is called with `/orderDetail/66996`, not the obfuscated value.

- [ ] **Step 3: Implement — `Order.tsx`**

In `src/pages/order/Order.tsx`, add the import (with the other `@/utils` imports near line 13):

```ts
import { formatOrderId } from '@/utils/orderId';
```

Change the navigation at line 243:

```ts
  const goToDetail = (item: ListItem, index: number) => {
    navigate(`/orderDetail/${formatOrderId(item.orderId)}`, {
```

Change the cell render at line 264:

```ts
    {
      key: 'orderId',
      title: b3Lang('orders.order'),
      width: '10%',
      isSortable: true,
      render: ({ orderId }) => formatOrderId(orderId),
    },
```

(Task 4 will extend this import to add `parseOrderId` when the search handler needs it.)

- [ ] **Step 4: Implement — `OrderItemCard.tsx`**

In `src/pages/order/OrderItemCard.tsx`, add the import:

```ts
import { formatOrderId } from '@/utils/orderId';
```

Change line 66:

```tsx
            <Typography
              variant="h5"
              sx={{
                color: 'rgba(0, 0, 0, 0.87)',
              }}
            >
              {`# ${formatOrderId(item.orderId)}`}
            </Typography>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
yarn test src/pages/MyOrders/index.test.tsx --run
```

Expected: PASS — both new obfuscation tests pass AND all existing tests still pass (they don't set `window.storeSuffix`).

- [ ] **Step 6: Run the sibling list + mobile tests**

Run:

```bash
yarn test src/pages/CompanyOrderList src/pages/MyOrders/index.mobile.test.tsx --run
```

Expected: PASS (these render the same `Order` component; no suffix set, so unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/pages/order/Order.tsx src/pages/order/OrderItemCard.tsx src/pages/MyOrders/index.test.tsx
git commit -m "feat: display obfuscated order id in order list and navigation"
```

---

## Task 4: Smart-decode the order list search box (`Order.tsx`)

**Files:**
- Modify: `src/pages/order/Order.tsx:331-338` (`handleChange`)
- Test: `src/pages/MyOrders/index.test.tsx` (add to the obfuscation `describe`)

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe('when order-id obfuscation is enabled', ...)` block created in Task 3:

```ts
  it('decodes an obfuscated id typed into the search box before querying', async () => {
    const getOrders = vi.fn().mockReturnValue(buildGetCustomerOrdersWith('WHATEVER_VALUES'));

    server.use(
      graphql.query('GetCustomerOrders', ({ query }) => HttpResponse.json(getOrders(query))),
    );

    renderWithProviders(<MyOrders />, { preloadedState });

    await waitForElementToBeRemoved(() => screen.queryAllByRole('progressbar'));

    when(getOrders)
      .calledWith(stringContainingAll('search: "66996"'))
      .thenReturn(
        buildGetCustomerOrdersWith({
          data: {
            customerOrders: {
              totalCount: 1,
              edges: [buildCustomerOrderNodeWith({ node: { orderId: '66996' } })],
            },
          },
        }),
      );

    const obfuscated = formatOrderId('66996'); // e.g. "HZ4BIDUG-SW"

    await userEvent.type(screen.getByPlaceholderText(/Search/), obfuscated);

    await waitFor(() => {
      expect(screen.getByRole('cell', { name: obfuscated })).toBeInTheDocument();
    });
  });

  it('passes free text through the search box unchanged', async () => {
    const getOrders = vi.fn().mockReturnValue(buildGetCustomerOrdersWith('WHATEVER_VALUES'));

    server.use(
      graphql.query('GetCustomerOrders', ({ query }) => HttpResponse.json(getOrders(query))),
    );

    renderWithProviders(<MyOrders />, { preloadedState });

    await waitForElementToBeRemoved(() => screen.queryAllByRole('progressbar'));

    when(getOrders)
      .calledWith(stringContainingAll('search: "PO-4567"'))
      .thenReturn(
        buildGetCustomerOrdersWith({
          data: {
            customerOrders: {
              totalCount: 1,
              edges: [buildCustomerOrderNodeWith({ node: { orderId: '66996' } })],
            },
          },
        }),
      );

    await userEvent.type(screen.getByPlaceholderText(/Search/), 'PO-4567');

    await waitFor(() => {
      expect(screen.getByRole('cell', { name: formatOrderId('66996') })).toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
yarn test src/pages/MyOrders/index.test.tsx --run -t "search box"
```

Expected: FAIL on the obfuscated-id test — the raw obfuscated string is sent as `search: "HZ4BIDUG-SW"`, not `search: "66996"`. (The free-text test may already pass; that's fine.)

- [ ] **Step 3: Implement**

In `src/pages/order/Order.tsx`, extend the util import to add `parseOrderId`:

```ts
import { formatOrderId, parseOrderId } from '@/utils/orderId';
```

Change `handleChange` (line 331):

```ts
  const handleChange = (key: string, value: string) => {
    if (key === 'search') {
      // translate a clean obfuscated id to the real id; pass free text / PO# / real id through
      const decoded = parseOrderId(value);
      const q = value !== '' && !/^\d+$/.test(value) && decoded != null ? String(decoded) : value;

      setFilterData((data) => ({
        ...data,
        q,
      }));
    }
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
yarn test src/pages/MyOrders/index.test.tsx --run
```

Expected: PASS (all tests, including the two new search tests and the existing `can search for orders` test which types `66996` → pure digits → passes through unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/pages/order/Order.tsx src/pages/MyOrders/index.test.tsx
git commit -m "feat: smart-decode obfuscated order ids in order list search"
```

---

## Task 5: Decode the route param + obfuscate the header on the detail page (`OrderDetail/index.tsx`)

**Files:**
- Modify: `src/pages/OrderDetail/index.tsx:106` (lookup), `:277` (header), imports
- Test: `src/pages/OrderDetail/index.test.tsx` (new `describe` block)

**Context (verified):** the existing detail tests mock the route param via `vi.mocked(useParams).mockReturnValue({ id: '6696' })` (the file calls `vi.mock('react-router-dom')` at the top). For a B2C role the order-details handler is `graphql.query('GetCustomerOrder', ...)`, the order builder is `buildCustomerOrderResponseWith`, and the heading renders the **route-param** id as `Order #6696` ([index.test.tsx:333,351,369](../../apps/storefront/src/pages/OrderDetail/index.test.tsx)). The detail query inlines the numeric id as `id: ${id}` ([orders.ts:251](../../apps/storefront/src/shared/service/b2b/graphql/orders.ts#L251)), so a request built from the decoded id contains the substring `6696`.

- [ ] **Step 1: Write the failing test**

Add the util import near the other `@/` imports at the top of `src/pages/OrderDetail/index.test.tsx`:

```ts
import { formatOrderId } from '@/utils/orderId';
```

Add this `describe` block to the file (sibling to the existing top-level `describe` that uses the B2C `preloadedState` — reuse that same `preloadedState`):

```ts
describe('when order-id obfuscation is enabled', () => {
  const preloadedState = {
    company: buildCompanyStateWith({ customer: { role: CustomerRole.B2C } }),
    storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j F Y' } }),
  };

  beforeEach(() => {
    window.storeSuffix = 'SW';
  });

  afterEach(() => {
    delete window.storeSuffix;
  });

  it('decodes the obfuscated route param to fetch by the real id and shows the obfuscated id in the header', async () => {
    const obfuscated = formatOrderId(6696);

    vi.mocked(useParams).mockReturnValue({ id: obfuscated });

    const getOrder = vi.fn();

    server.use(
      graphql.query('GetCustomerOrderStatuses', () =>
        HttpResponse.json(buildCustomerOrderStatusesWith('WHATEVER_VALUES')),
      ),
      graphql.query('AddressConfig', () =>
        HttpResponse.json(buildAddressConfigResponseWith('WHATEVER_VALUES')),
      ),
      graphql.query('GetCustomerOrder', ({ query }) => HttpResponse.json(getOrder(query))),
    );

    // only return the order when the request carries the DECODED numeric id (6696)
    when(getOrder)
      .calledWith(stringContainingAll('6696'))
      .thenReturn(
        buildCustomerOrderResponseWith({
          data: { customerOrder: { status: 'Pending', poNumber: '' } },
        }),
      );

    renderWithProviders(<OrderDetails />, { preloadedState });

    await waitForElementToBeRemoved(() => screen.queryAllByRole('progressbar'));

    // heading shows "Order #<obfuscated>" — proves both decode (order rendered) and re-encoded display
    expect(
      await screen.findByRole('heading', { name: new RegExp(`Order #${obfuscated}`) }),
    ).toBeVisible();
  });
});
```

> Note: if `buildCustomerOrderResponseWith` is named differently in the file, use the builder the existing `GetCustomerOrder` handlers use (it is the one passed to `graphql.query('GetCustomerOrder', ...)` in the existing tests). All other identifiers above (`buildCustomerOrderStatusesWith`, `buildAddressConfigResponseWith`, `OrderDetails`, `useParams`) are already defined/imported in the file.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
yarn test src/pages/OrderDetail/index.test.tsx --run -t "obfuscation"
```

Expected: FAIL — with the current code `parseInt(obfuscated, 10)` is `NaN`, so the lookup guard returns early, the order never loads, and `findByRole('heading', ...)` times out.

- [ ] **Step 3: Implement**

In `src/pages/OrderDetail/index.tsx`, add the import (with the other `@/utils` imports):

```ts
import { formatOrderId, parseOrderId } from '@/utils/orderId';
```

Change the lookup at line 106 (inside `getOrderDetails`):

```ts
      const getOrderDetails = async () => {
        const id = parseOrderId(orderId);
        if (!id) {
          return;
        }
```

Change the header at line 277 to display the obfuscated form (idempotent — re-encodes the decoded real id):

```tsx
              {b3Lang('orderDetail.orderId', {
                orderId: parseOrderId(orderId) != null ? formatOrderId(parseOrderId(orderId)!) : orderId,
              })}
```

> Note: `parseOrderId(orderId)!` is safe here because the surrounding ternary already checked it is non-null. The codebase allows non-null assertions (`@typescript-eslint/no-non-null-assertion` is disabled). If you prefer, hoist it: `const headerOrderId = parseOrderId(orderId); ... orderId: headerOrderId != null ? formatOrderId(headerOrderId) : orderId`.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
yarn test src/pages/OrderDetail/index.test.tsx --run
```

Expected: PASS — new obfuscation test passes; existing tests (numeric route params, no suffix) still pass because `parseOrderId('6696') === 6696` and `formatOrderId(6696) === '6696'` without a suffix.

- [ ] **Step 5: Commit**

```bash
git add src/pages/OrderDetail/index.tsx src/pages/OrderDetail/index.test.tsx
git commit -m "feat: decode obfuscated order id on detail page and header"
```

---

## Task 6: Obfuscate invoice order numbers + navigation (`Invoice/index.tsx`, `InvoiceItemCard.tsx`, `B3Pulldown.tsx`)

**Files:**
- Modify: `src/pages/Invoice/index.tsx:599` (nav), `:602` (display), imports
- Modify: `src/pages/Invoice/InvoiceItemCard.tsx:77` (nav), `:80` (display), imports
- Modify: `src/pages/Invoice/components/B3Pulldown.tsx:95` (nav), imports
- Test: `src/pages/Invoice/index.test.tsx` (new `describe` block)

**Context (verified):** the invoice list mocks two handlers, `graphql.query('GetInvoices', ...)` and `graphql.query('GetInvoiceStats', ...)`; builders are `buildInvoicesResponseWith` and `buildInvoiceWith` (node has `orderNumber`), and the stats builder is `buildInvoiceStatsResponseWith` (all defined in the file). The order number renders as a `role="button"` whose name is the order number, and the list waits via `waitForElementToBeRemoved(() => screen.queryByText(/loading/i))`. The module-scope `preloadedState` and a global `beforeEach` (`window.location.assign('/invoice')`) already exist.

- [ ] **Step 1: Write the failing test**

Add the util import near the other `@/` imports at the top of `src/pages/Invoice/index.test.tsx`:

```ts
import { formatOrderId } from '@/utils/orderId';
```

Add this `describe` block to the file (it reuses the module-scope `preloadedState`):

```ts
describe('when order-id obfuscation is enabled', () => {
  beforeEach(() => {
    window.storeSuffix = 'SW';

    server.use(
      graphql.query('GetInvoices', () =>
        HttpResponse.json(
          buildInvoicesResponseWith({
            data: { invoices: { edges: [buildInvoiceWith({ node: { orderNumber: '4444' } })] } },
          }),
        ),
      ),
      graphql.query('GetInvoiceStats', () =>
        HttpResponse.json(buildInvoiceStatsResponseWith('WHATEVER_VALUES')),
      ),
    );
  });

  afterEach(() => {
    delete window.storeSuffix;
  });

  it('displays the obfuscated order number instead of the raw number', async () => {
    renderWithProviders(<Invoice />, { preloadedState });

    await waitForElementToBeRemoved(() => screen.queryByText(/loading/i));

    const obfuscated = formatOrderId('4444');

    expect(screen.queryByRole('button', { name: '4444' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: obfuscated })).toBeInTheDocument();
  });

  it('navigates to the obfuscated order-detail url from the order-number cell', async () => {
    const { navigation } = renderWithProviders(<Invoice />, { preloadedState });

    await waitForElementToBeRemoved(() => screen.queryByText(/loading/i));

    const obfuscated = formatOrderId('4444');

    await userEvent.click(screen.getByRole('button', { name: obfuscated }));

    expect(navigation).toHaveBeenCalledWith(`/orderDetail/${obfuscated}`);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
yarn test src/pages/Invoice/index.test.tsx --run -t "obfuscation"
```

Expected: FAIL — the cell shows `4444` and navigation targets `/orderDetail/4444`.

- [ ] **Step 3: Implement — `Invoice/index.tsx`**

Add the import (with the other `@/utils` imports):

```ts
import { formatOrderId } from '@/utils/orderId';
```

Change the order-number column render (lines 598-602):

```tsx
          onClick={() => {
            navigate(`/orderDetail/${formatOrderId(item.orderNumber)}`);
          }}
        >
          {item?.orderNumber ? formatOrderId(item.orderNumber) : '-'}
        </Box>
```

(Task 7 will extend this import to add `parseOrderId` for the search handler.)

- [ ] **Step 4: Implement — `InvoiceItemCard.tsx`**

Add the import:

```ts
import { formatOrderId } from '@/utils/orderId';
```

Change lines 76-80:

```tsx
          onClick={() => {
            navigate(`/orderDetail/${formatOrderId(item.orderNumber)}`);
          }}
        >
          {item?.orderNumber ? formatOrderId(item.orderNumber) : '-'}
        </Box>
```

- [ ] **Step 5: Implement — `B3Pulldown.tsx`**

Add the import:

```ts
import { formatOrderId } from '@/utils/orderId';
```

Change `handleViewOrder` (line 92-96):

```ts
  const handleViewOrder = () => {
    const { orderNumber } = row;
    close();
    navigate(`/orderDetail/${formatOrderId(orderNumber)}`);
  };
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:

```bash
yarn test src/pages/Invoice --run
```

Expected: PASS — new obfuscation tests pass; existing invoice tests (no suffix → `formatOrderId('4444') === '4444'`) still pass, including `index.mobile.test.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Invoice/index.tsx src/pages/Invoice/InvoiceItemCard.tsx src/pages/Invoice/components/B3Pulldown.tsx src/pages/Invoice/index.test.tsx
git commit -m "feat: display obfuscated order numbers on invoice list and navigation"
```

---

## Task 7: Smart-decode the invoice search box (`Invoice/index.tsx`)

**Files:**
- Modify: `src/pages/Invoice/index.tsx:210-219` (`handleChange`)
- Test: `src/pages/Invoice/index.test.tsx` (add to the obfuscation `describe`)

**Context (verified):** the invoice list query inlines `search: "${data.q || ''}"` ([invoice.ts:7](../../apps/storefront/src/shared/service/b2b/graphql/invoice.ts#L7)), so `stringContainingAll('search: "4444"')` proves the decoded id reached the server. The list waits via `/loading/i`. The order number renders as a `role="button"`.

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe('when order-id obfuscation is enabled', ...)` block created in Task 6 (it already sets `window.storeSuffix` and the `GetInvoiceStats` handler in its `beforeEach`):

```ts
  it('decodes an obfuscated order id typed into the invoice search box', async () => {
    const getInvoices = vi.fn().mockReturnValue(buildInvoicesResponseWith('WHATEVER_VALUES'));

    server.use(
      graphql.query('GetInvoices', ({ query }) => HttpResponse.json(getInvoices(query))),
    );

    renderWithProviders(<Invoice />, { preloadedState });

    await waitForElementToBeRemoved(() => screen.queryByText(/loading/i));

    const obfuscated = formatOrderId('4444');

    when(getInvoices)
      .calledWith(stringContainingAll('search: "4444"'))
      .thenReturn(
        buildInvoicesResponseWith({
          data: { invoices: { edges: [buildInvoiceWith({ node: { orderNumber: '4444' } })] } },
        }),
      );

    await userEvent.type(screen.getByPlaceholderText(/Search/), obfuscated);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: obfuscated })).toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
yarn test src/pages/Invoice/index.test.tsx --run -t "search box"
```

Expected: FAIL — the obfuscated string is sent verbatim as the `search` value instead of `4444`.

- [ ] **Step 3: Implement**

In `src/pages/Invoice/index.tsx`, extend the util import to add `parseOrderId`:

```ts
import { formatOrderId, parseOrderId } from '@/utils/orderId';
```

Change `handleChange` (line 210):

```ts
  const handleChange = (key: string, value: string) => {
    if (key === 'search') {
      // translate a clean obfuscated id to the real id; pass free text / real id through
      const decoded = parseOrderId(value);
      const q = value !== '' && !/^\d+$/.test(value) && decoded != null ? String(decoded) : value;

      setFilterData({
        ...filterData,
        q,
      });
      setFilterChangeFlag(true);
      setType(InvoiceListType.NORMAL);
    }
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
yarn test src/pages/Invoice/index.test.tsx --run
```

Expected: PASS (all invoice tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Invoice/index.tsx src/pages/Invoice/index.test.tsx
git commit -m "feat: smart-decode obfuscated order ids in invoice search"
```

---

## Task 8: Verify completeness — no remaining order-id display or link-builder

**Files:** none (verification only)

- [ ] **Step 1: Confirm every `/orderDetail/` builder now encodes**

Run:

```bash
grep -rn "orderDetail/" src --include=*.ts --include=*.tsx | grep -v ".test." | grep -v "routeList" | grep -v "routes/index"
```

Expected: exactly these source lines, each wrapping its id in `formatOrderId(...)` (the `:id` route definitions are intentionally excluded):
- `src/pages/order/Order.tsx` → `formatOrderId(item.orderId)`
- `src/pages/Invoice/index.tsx` → `formatOrderId(item.orderNumber)`
- `src/pages/Invoice/InvoiceItemCard.tsx` → `formatOrderId(item.orderNumber)`
- `src/pages/Invoice/components/B3Pulldown.tsx` → `formatOrderId(orderNumber)`
- `src/pages/OrderDetail/index.tsx:141` → `window.location.hash = \`/orderDetail/${preOrderId}\`` (retry; `preOrderId` is the already-obfuscated route param, so this round-trips correctly — leave as-is)

If any other non-test line appears that builds an order-detail URL from a raw id, wrap it in `formatOrderId(...)`.

- [ ] **Step 2: Confirm there is no remaining raw order-id text display**

Run:

```bash
grep -rn "orderId\|orderNumber" src/pages --include=*.tsx | grep -i "render\|Typography\|# " | grep -v ".test." | grep -v formatOrderId
```

Expected: no line that renders an order id/number to the screen without `formatOrderId`. (Lines that pass numeric ids to lookups, context, or server endpoints — print/return/PDF/CSV — are correct to leave raw per the spec boundaries.) If a genuine display surface appears, wrap it in `formatOrderId(...)` and add a focused test in that page's test file following the Task 3 pattern.

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Type-check**

Run:

```bash
yarn tsc --noEmit
```

Expected: PASS.

- [ ] **Step 2: Full test suite**

Run:

```bash
yarn test --run
```

Expected: PASS — all suites, including the unchanged existing order/invoice/detail tests and the new obfuscation tests.

- [ ] **Step 3: Lint (eslint + dependency-cruiser + knip)**

Run:

```bash
yarn lint
```

Expected: PASS. In particular: no `lodash/...` deep imports, `@/` aliases used (not long relative paths), no deep `@mui/icons-material` paths, and `knip` reports no unused exports (both `formatOrderId` and `parseOrderId` are used). If `knip` flags an import added "early" (e.g. `parseOrderId` in `Order.tsx` before Task 4) as unused, ensure the dependent task was completed.

- [ ] **Step 4: Build**

Run:

```bash
yarn build
```

Expected: PASS (`tsc --noEmit` prebuild + `vite build`).

- [ ] **Step 5: Final commit (only if Steps 1-4 surfaced fixes)**

```bash
git add -A
git commit -m "test: finalize order-id obfuscation verification"
```

---

## Self-review checklist (completed by plan author)

- **Spec coverage:** Display (Tasks 3, 5, 6) ✓; URL/navigation (Tasks 3, 5, 6) ✓; route-param decode (Task 5) ✓; smart-decode search (Tasks 4, 7) ✓; suffix fallback (Task 2 unit tests) ✓; merged blocklist (Task 1 verify + Task 2 blocklist test) ✓; boundaries left raw (Task 8 confirms) ✓; dependency + global type (Task 1) ✓; rollout-by-suffix (covered by gating + existing tests passing unchanged) ✓.
- **Placeholder scan:** All test bodies now use the exact, verified handler names (`GetCustomerOrder`, `AddressConfig`, `GetCustomerOrderStatuses`, `GetInvoices`, `GetInvoiceStats`) and builders (`buildCustomerOrderResponseWith`, `buildCustomerOrderStatusesWith`, `buildAddressConfigResponseWith`, `buildInvoicesResponseWith`, `buildInvoiceWith`, `buildInvoiceStatsResponseWith`) defined in each existing test file. The only soft note is in Task 5 (use the file's existing `GetCustomerOrder` builder if its name differs) — every source edit shows complete code.
- **Type consistency:** `formatOrderId(id: number | string): string` and `parseOrderId(value: string): number | null` are used consistently across all tasks; `window.storeSuffix?: string` added in Task 1 matches usage in Task 2.
