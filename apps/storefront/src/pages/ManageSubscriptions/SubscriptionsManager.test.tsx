import {
  buildCompanyStateWith,
  buildOgAddressWith,
  buildOgItemWith,
  buildOgOrderWith,
  buildOgPaymentWith,
  buildOgProductWith,
  buildOgSubscriptionWith,
  buildStoreInfoStateWith,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
  waitFor,
  within,
} from 'tests/test-utils';

import {
  OgAddress,
  OgItem,
  OgOrder,
  OgPayment,
  OgProduct,
  OgSubscription,
} from '@/shared/service/ordergroove';
import { currencyFormat } from '@/utils/b3CurrencyFormat';
import { snackbar } from '@/utils/b3Tip';
import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';
import { formatOrderId } from '@/utils/orderId';

import SubscriptionsManager from './SubscriptionsManager';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const page = <T,>(results: T[], next: string | null = null) => ({
  count: results.length,
  next,
  previous: null,
  results,
});

interface Resources {
  subscriptions?: OgSubscription[];
  subscriptionsPage2?: OgSubscription[];
  payments?: OgPayment[];
  addresses?: OgAddress[];
  upcomingOrders?: OgOrder[];
  items?: OgItem[];
  /** external product id → product; a missing id answers 404 */
  products?: Record<string, OgProduct>;
  history?: OgOrder[];
  historyPage2?: OgOrder[];
}

// Every resource answers; anything not given is an empty page.
const mockResources = ({
  subscriptions = [],
  subscriptionsPage2,
  payments = [],
  addresses = [],
  upcomingOrders = [],
  items = [],
  products = {},
  history = [],
  historyPage2,
}: Resources) =>
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')),
    http.post(authEndpoint, () =>
      HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 }),
    ),
    http.get(`${ogBase}/subscriptions/`, ({ request }) =>
      new URL(request.url).searchParams.get('page') === '2'
        ? HttpResponse.json(page(subscriptionsPage2 ?? []))
        : HttpResponse.json(
            page(subscriptions, subscriptionsPage2 ? `${ogBase}/subscriptions/?page=2` : null),
          ),
    ),
    http.get(`${ogBase}/payments/`, () => HttpResponse.json(page(payments))),
    http.get(`${ogBase}/addresses/`, () => HttpResponse.json(page(addresses))),
    http.get(`${ogBase}/items/`, () => HttpResponse.json(page(items))),
    http.get(`${ogBase}/orders/`, ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get('status') === '1') {
        return HttpResponse.json(page(upcomingOrders));
      }
      if (url.searchParams.get('page') === '2') {
        return HttpResponse.json(page(historyPage2 ?? []));
      }

      return HttpResponse.json(page(history, historyPage2 ? `${ogBase}/orders/?page=2` : null));
    }),
    http.get(`${ogBase}/products/:id/`, ({ params }) => {
      const product = products[String(params.id)];

      return product ? HttpResponse.json(product) : new HttpResponse(null, { status: 404 });
    }),
  );

// A distinct customer per test keeps the module-level auth cache from leaking between tests.
// The store's date display format is blank by default; "2026-10-03" renders as "3 Oct 2026".
const renderPage = () =>
  renderWithProviders(<SubscriptionsManager />, {
    preloadedState: {
      company: buildCompanyStateWith({
        customer: { id: faker.number.int({ min: 1, max: 1_000_000 }) },
      }),
      storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } }),
    },
  });

beforeEach(() => {
  window.BC_CONTEXT = {
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint,
      appClientId: 'ssw-app-client-id',
      customManager: true,
    },
  };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('lists every active subscription across pages with its product, schedule, address and card', async () => {
  const address = buildOgAddressWith({
    first_name: 'Jane',
    last_name: 'Doe',
    company_name: 'Acme Co',
    address: '1 Main St',
    address2: null,
    city: 'Springfield',
    state_province_code: 'IL',
    zip_postal_code: '62701',
  });
  const payment = buildOgPaymentWith({
    cc_type: 1,
    cc_number_ending: '1111',
    cc_exp_date: '3/2028',
  });
  const bags = buildOgSubscriptionWith({
    product: '9537_12118',
    quantity: 2,
    frequency_days: 28,
    shipping_address: address.public_id,
    payment: payment.public_id,
  });
  const tissue = buildOgSubscriptionWith({
    product: '7674_9534',
    quantity: 1,
    frequency_days: 14,
    every: 2,
    every_period: 2,
    shipping_address: address.public_id,
    payment: payment.public_id,
  });
  const order = buildOgOrderWith({ status: 1, place: '2026-10-03 00:00:00' });

  mockResources({
    subscriptions: [bags],
    subscriptionsPage2: [tissue],
    payments: [payment],
    addresses: [address],
    upcomingOrders: [order],
    items: [buildOgItemWith({ order: order.public_id, subscription: bags.public_id })],
    products: {
      '9537_12118': buildOgProductWith({ name: 'Kraft Paper Shopping Bags', sku: '9537' }),
      '7674_9534': buildOgProductWith({ name: 'Tissue Paper', sku: '7674' }),
    },
  });

  renderPage();

  expect(await screen.findByText('Kraft Paper Shopping Bags')).toBeInTheDocument();
  expect(screen.getByText('Tissue Paper')).toBeInTheDocument();
  // An active card shows its schedule in the selects, which replace the "Qty · every" line.
  const bagsGroup = within(screen.getByRole('group', { name: 'Kraft Paper Shopping Bags' }));
  expect(bagsGroup.getByRole('combobox', { name: /^Quantity/ })).toHaveTextContent('2');
  expect(bagsGroup.getByRole('combobox', { name: /^Frequency/ })).toHaveTextContent(
    'every 4 weeks',
  );
  const tissueGroup = within(screen.getByRole('group', { name: 'Tissue Paper' }));
  expect(tissueGroup.getByRole('combobox', { name: /^Quantity/ })).toHaveTextContent('1');
  expect(tissueGroup.getByRole('combobox', { name: /^Frequency/ })).toHaveTextContent(
    'every 2 weeks',
  );
  expect(await screen.findByText('Next order 3 Oct 2026')).toBeInTheDocument();
  expect(screen.getByText('No upcoming order')).toBeInTheDocument();
  // The line now ends "· Change" after the address, which is a button of its own.
  expect(
    screen.getAllByText(/^Ships to Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701/),
  ).toHaveLength(2);
  expect(screen.getAllByText('Paid with Visa ending in 1111 · exp 03/2028')).toHaveLength(2);
  expect(screen.queryByText(/couldn't/)).not.toBeInTheDocument();
});

it('degrades cell by cell when secondary lookups fail and offers a retry', async () => {
  const subscription = buildOgSubscriptionWith({ product: '1_2' });
  mockResources({
    subscriptions: [subscription],
    payments: [
      buildOgPaymentWith({
        public_id: subscription.payment,
        cc_type: 2,
        cc_number_ending: '4444',
        cc_exp_date: '1/2029',
      }),
    ],
  });
  server.use(http.get(`${ogBase}/addresses/`, () => new HttpResponse(null, { status: 500 })));

  renderPage();

  expect(await screen.findByText('Product 1_2')).toBeInTheDocument();
  expect(await screen.findByText('Ships to Unavailable')).toBeInTheDocument();
  expect(screen.getByText('Paid with Mastercard ending in 4444 · exp 01/2029')).toBeInTheDocument();
  expect(screen.getByText("Some subscription details couldn't be loaded.")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});

it('shows the empty copy and keeps cancelled subscriptions behind a toggle', async () => {
  mockResources({
    subscriptions: [
      buildOgSubscriptionWith({ cancelled: '2026-08-01 10:00:00', live: false }),
      buildOgSubscriptionWith({ cancelled: '2026-07-01 10:00:00', live: false }),
    ],
  });

  const { user } = renderPage();

  expect(await screen.findByText("You don't have any active subscriptions.")).toBeInTheDocument();
  expect(screen.queryByText(/Cancelled on/)).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '2 cancelled subscriptions' }));

  expect(screen.getByText('Cancelled on 1 Aug 2026')).toBeInTheDocument();
  expect(screen.getByText('Cancelled on 1 Jul 2026')).toBeInTheDocument();
});

it('shows the session-expired alert and nothing to retry when Ordergroove rejects the signature', async () => {
  mockResources({});
  server.use(
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json({ detail: 'Authentication Failed' }, { status: 403 }),
    ),
  );

  renderPage();

  expect(
    await screen.findByText('Your session has expired — please sign in again.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  expect(screen.queryByText("We couldn't load your subscriptions.")).not.toBeInTheDocument();
});

it('recovers from a failed subscriptions request through Try again', async () => {
  const subscription = buildOgSubscriptionWith({ product: '1_2' });
  let attempts = 0;
  mockResources({ products: { '1_2': buildOgProductWith({ name: 'Labels' }) } });
  server.use(
    http.get(`${ogBase}/subscriptions/`, () => {
      attempts += 1;

      return attempts === 1
        ? new HttpResponse(null, { status: 500 })
        : HttpResponse.json(page([subscription]));
    }),
  );

  const { user } = renderPage();

  expect(await screen.findByText("We couldn't load your subscriptions.")).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByText('Labels')).toBeInTheDocument();
  expect(screen.queryByText("We couldn't load your subscriptions.")).not.toBeInTheDocument();
});

it('lists recent orders with web order links and failure messages, and pages with Show more', async () => {
  const merchantOrderId = '253011';
  mockResources({
    history: [
      buildOgOrderWith({
        status: 5,
        order_merchant_id: merchantOrderId,
        total: '81.50',
        place: '2026-09-05 01:37:45',
      }),
      buildOgOrderWith({
        status: 3,
        order_merchant_id: null,
        rejected_message: 'Card declined',
        place: '2026-08-08 00:00:00',
      }),
      buildOgOrderWith({ status: 17, place: '2026-08-01 00:00:00' }),
    ],
    historyPage2: [
      buildOgOrderWith({ status: 5, order_merchant_id: '253000', place: '2026-07-11 00:00:00' }),
    ],
  });

  const { user } = renderPage();

  const placed = await screen.findByRole('link', {
    name: `Order ${formatOrderId(merchantOrderId)}`,
  });
  expect(placed).toHaveAttribute('href', `/orderDetail/${merchantOrderId}`);
  expect(screen.getByText(currencyFormat('81.50'))).toBeInTheDocument();
  expect(screen.getByText('Card declined')).toBeInTheDocument();
  expect(screen.queryByText('1 Aug 2026')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Show more' }));

  expect(
    await screen.findByRole('link', { name: `Order ${formatOrderId('253000')}` }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument(),
  );
});

it('skips a subscription from its card and shows the moved date', async () => {
  const subscription = buildOgSubscriptionWith({
    product: '9537_12118',
    every: 4,
    every_period: 2,
  });
  const before = buildOgOrderWith({ status: 1, place: '2026-10-03 00:00:00' });
  const after = buildOgOrderWith({ status: 1, place: '2026-10-31 00:00:00' });
  const skipRequests = vi.fn();
  let skipped = false;
  mockResources({
    subscriptions: [subscription],
    products: { '9537_12118': buildOgProductWith({ name: 'Kraft Paper Shopping Bags' }) },
  });
  // Later handlers win in MSW: the upcoming order moves once the skip has landed.
  server.use(
    http.get(`${ogBase}/orders/`, ({ request }) =>
      new URL(request.url).searchParams.get('status') === '1'
        ? HttpResponse.json(page([skipped ? after : before]))
        : HttpResponse.json(page([])),
    ),
    http.get(`${ogBase}/items/`, () =>
      HttpResponse.json(
        page([
          buildOgItemWith({
            order: (skipped ? after : before).public_id,
            subscription: subscription.public_id,
            product: '9537_12118',
          }),
        ]),
      ),
    ),
    http.patch(`${ogBase}/orders/${before.public_id}/skip_subscription/`, async ({ request }) => {
      skipRequests(await request.json());
      skipped = true;

      return HttpResponse.json(after);
    }),
  );

  const { user } = renderPage();

  expect(await screen.findByText('Next order 3 Oct 2026')).toBeInTheDocument();
  // The dialog names the product, so wait for the lookup rather than its "Product {id}" fallback.
  expect(await screen.findByText('Kraft Paper Shopping Bags')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Skip' }));
  expect(screen.getByRole('dialog')).toHaveTextContent(
    'Kraft Paper Shopping Bags will leave your order on 3 Oct 2026. Your next order will be on 31 Oct 2026.',
  );
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Skip' }));

  expect(await screen.findByText('Next order 31 Oct 2026')).toBeInTheDocument();
  expect(skipRequests).toHaveBeenCalledWith({ subscription: subscription.public_id });
  expect(snackbar.success).toHaveBeenCalledWith('Next order skipped.');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('offers actions only on active cards with an upcoming order', async () => {
  const scheduled = buildOgSubscriptionWith({ product: '9537_12118', quantity: 2 });
  const unscheduled = buildOgSubscriptionWith({ product: '7674_9534', quantity: 3 });
  const cancelled = buildOgSubscriptionWith({
    product: '9492_11808',
    cancelled: '2026-08-01 10:00:00',
    live: false,
  });
  const order = buildOgOrderWith({ status: 1, place: '2026-10-03 00:00:00' });
  mockResources({
    subscriptions: [scheduled, unscheduled, cancelled],
    upcomingOrders: [order],
    items: [buildOgItemWith({ order: order.public_id, subscription: scheduled.public_id })],
    products: {
      '9537_12118': buildOgProductWith({ name: 'Scheduled' }),
      '7674_9534': buildOgProductWith({ name: 'Unscheduled' }),
      '9492_11808': buildOgProductWith({ name: 'Cancelled one' }),
    },
  });

  const { user } = renderPage();

  expect(await screen.findByText('Next order 3 Oct 2026')).toBeInTheDocument();
  // Groups are named by product once the lookup resolves; wait for it before querying by name.
  expect(
    within(await screen.findByRole('group', { name: 'Scheduled' })).getByRole('button', {
      name: 'Skip',
    }),
  ).toBeInTheDocument();
  const unscheduledGroup = within(screen.getByRole('group', { name: 'Unscheduled' }));
  expect(unscheduledGroup.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
  expect(unscheduledGroup.queryByRole('button', { name: 'Send now' })).not.toBeInTheDocument();
  expect(unscheduledGroup.queryByRole('button', { name: 'Change date' })).not.toBeInTheDocument();
  expect(unscheduledGroup.getByRole('button', { name: 'Change card' })).toBeInTheDocument();
  expect(unscheduledGroup.getByRole('button', { name: 'Cancel subscription' })).toBeInTheDocument();
  expect(unscheduledGroup.getByRole('combobox', { name: /^Quantity/ })).toBeInTheDocument();
  // Addresses were mocked empty, so there is nothing to move to and no Change control.
  expect(unscheduledGroup.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  // Two cards, two quantities: each select shows its own card's.
  expect(
    within(screen.getByRole('group', { name: 'Scheduled' })).getByRole('combobox', {
      name: /^Quantity/,
    }),
  ).toHaveTextContent('2');
  expect(unscheduledGroup.getByRole('combobox', { name: /^Quantity/ })).toHaveTextContent('3');
  // A select's id also feeds its aria-labelledby, so no two may match. The text checks above cannot
  // see a shared id: each select keeps its own text and accessible name either way.
  const selectIds = screen.getAllByRole('combobox').map((select) => select.id);
  expect(selectIds).toHaveLength(4);
  expect(new Set(selectIds).size).toBe(4);

  await user.click(screen.getByRole('button', { name: '1 cancelled subscription' }));
  const cancelledGroup = within(screen.getByRole('group', { name: 'Cancelled one' }));
  expect(cancelledGroup.getAllByRole('button').map((button) => button.textContent)).toEqual([
    'Reactivate',
  ]);
  expect(cancelledGroup.queryByRole('combobox')).not.toBeInTheDocument();
});

it('links back to the hosted manager in the top window', async () => {
  mockResources({});

  renderPage();

  const link = await screen.findByRole('link', { name: 'Manage in the subscription manager' });
  expect(link).toHaveAttribute('href', `${BigCommerceStorefrontAPIBaseURL}/subscriptions`);
  expect(link).toHaveAttribute('target', '_top');
});

it('changes the quantity from the card and shows the new value once Ordergroove has it', async () => {
  const subscription = buildOgSubscriptionWith({ product: '9537_12118', quantity: 2 });
  const received = vi.fn();
  let changed = false;
  mockResources({
    subscriptions: [subscription],
    products: { '9537_12118': buildOgProductWith({ name: 'Kraft Paper Shopping Bags' }) },
  });
  // Later handlers win in MSW: the list answers the new quantity once the write has landed.
  server.use(
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json(page([{ ...subscription, quantity: changed ? 3 : 2 }])),
    ),
    http.patch(
      `${ogBase}/subscriptions/${subscription.public_id}/change_quantity/`,
      async ({ request }) => {
        received(await request.json());
        changed = true;

        return HttpResponse.json({ ...subscription, quantity: 3 });
      },
    ),
  );

  const { user } = renderPage();

  const group = await screen.findByRole('group', { name: 'Kraft Paper Shopping Bags' });
  expect(within(group).getByRole('combobox', { name: /^Quantity/ })).toHaveTextContent('2');
  await user.click(within(group).getByRole('combobox', { name: /^Quantity/ }));
  await user.click(screen.getByRole('option', { name: '3' }));

  await waitFor(() =>
    expect(within(group).getByRole('combobox', { name: /^Quantity/ })).toHaveTextContent('3'),
  );
  expect(received).toHaveBeenCalledWith({ quantity: 3 });
  expect(snackbar.success).toHaveBeenCalledWith('Quantity updated.');
});

it('cancels a subscription without a reason and moves it to the cancelled list', async () => {
  const subscription = buildOgSubscriptionWith({ product: '9537_12118' });
  const received = vi.fn();
  let cancelled = false;
  mockResources({
    subscriptions: [subscription],
    products: { '9537_12118': buildOgProductWith({ name: 'Kraft Paper Shopping Bags' }) },
  });
  server.use(
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json(
        page([
          cancelled
            ? { ...subscription, cancelled: '2026-10-01 10:00:00', live: false }
            : subscription,
        ]),
      ),
    ),
    http.patch(`${ogBase}/subscriptions/${subscription.public_id}/cancel/`, async ({ request }) => {
      received(await request.json());
      cancelled = true;

      return HttpResponse.json({ ...subscription, cancelled: '2026-10-01 10:00:00', live: false });
    }),
  );

  const { user } = renderPage();

  await screen.findByRole('group', { name: 'Kraft Paper Shopping Bags' });
  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel subscription' }),
  );

  expect(await screen.findByText("You don't have any active subscriptions.")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '1 cancelled subscription' })).toBeInTheDocument();
  expect(received).toHaveBeenCalledWith({
    cancel_reason: '114|Cancelled without exit survey response',
  });
  expect(snackbar.success).toHaveBeenCalledWith('Subscription cancelled.');
});

it('reactivates a cancelled subscription and lists it among the active ones', async () => {
  const subscription = buildOgSubscriptionWith({
    product: '9537_12118',
    cancelled: '2026-08-01 10:00:00',
    live: false,
  });
  const received = vi.fn();
  let reactivated = false;
  mockResources({
    subscriptions: [subscription],
    products: { '9537_12118': buildOgProductWith({ name: 'Kraft Paper Shopping Bags' }) },
  });
  server.use(
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json(
        page([reactivated ? { ...subscription, cancelled: null, live: true } : subscription]),
      ),
    ),
    http.patch(
      `${ogBase}/subscriptions/${subscription.public_id}/reactivate/`,
      async ({ request }) => {
        received(await request.json());
        reactivated = true;

        return HttpResponse.json({ ...subscription, cancelled: null, live: true });
      },
    ),
  );

  const { user } = renderPage();

  await user.click(await screen.findByRole('button', { name: '1 cancelled subscription' }));
  const group = await screen.findByRole('group', { name: 'Kraft Paper Shopping Bags' });
  await user.click(within(group).getByRole('button', { name: 'Reactivate' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivate' }));

  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: '1 cancelled subscription' }),
    ).not.toBeInTheDocument(),
  );
  expect(
    within(screen.getByRole('group', { name: 'Kraft Paper Shopping Bags' })).getByRole('button', {
      name: 'Cancel subscription',
    }),
  ).toBeInTheDocument();
  expect(received).toHaveBeenCalledWith(
    expect.objectContaining({ every: subscription.every, every_period: subscription.every_period }),
  );
  expect(snackbar.success).toHaveBeenCalledWith('Subscription reactivated.');
});
