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
import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';
import { formatOrderId } from '@/utils/orderId';

import SubscriptionsManager from './SubscriptionsManager';

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
  expect(screen.getByText('Qty 2 · every 4 weeks')).toBeInTheDocument();
  expect(screen.getByText('Qty 1 · every 2 weeks')).toBeInTheDocument();
  expect(await screen.findByText('Next order 3 Oct 2026')).toBeInTheDocument();
  expect(screen.getByText('No upcoming order')).toBeInTheDocument();
  expect(
    screen.getAllByText('Ships to Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701'),
  ).toHaveLength(2);
  expect(screen.getAllByText('Paid with Visa ending in 1111 · exp 3/2028')).toHaveLength(2);
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
  expect(screen.getByText('Paid with Mastercard ending in 4444 · exp 1/2029')).toBeInTheDocument();
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

it('links back to the hosted manager in the top window', async () => {
  mockResources({});

  renderPage();

  const link = await screen.findByRole('link', { name: 'Manage in the subscription manager' });
  expect(link).toHaveAttribute('href', `${BigCommerceStorefrontAPIBaseURL}/subscriptions`);
  expect(link).toHaveAttribute('target', '_top');
});
