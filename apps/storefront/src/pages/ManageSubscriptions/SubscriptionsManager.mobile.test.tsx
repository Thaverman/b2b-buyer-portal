import {
  buildCompanyStateWith,
  buildOgItemWith,
  buildOgOrderWith,
  buildOgProductWith,
  buildOgSubscriptionWith,
  buildStoreInfoStateWith,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
  within,
} from 'tests/test-utils';

import SubscriptionsManager from './SubscriptionsManager';

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

beforeEach(() => {
  // The repo's mobile-test convention: useMobile() treats a body narrower than 769px as a phone.
  vi.spyOn(document.body, 'clientWidth', 'get').mockReturnValue(500);
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

it('stacks the schedule under the product title on a phone', async () => {
  const subscription = buildOgSubscriptionWith({ product: '9537_12118' });
  const order = buildOgOrderWith({ status: 1, place: '2026-10-03 00:00:00' });
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')),
    http.post(authEndpoint, () =>
      HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 }),
    ),
    http.get(`${ogBase}/subscriptions/`, () => HttpResponse.json(page([subscription]))),
    http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([]))),
    http.get(`${ogBase}/addresses/`, () => HttpResponse.json(page([]))),
    http.get(`${ogBase}/items/`, () =>
      HttpResponse.json(
        page([buildOgItemWith({ order: order.public_id, subscription: subscription.public_id })]),
      ),
    ),
    http.get(`${ogBase}/orders/`, ({ request }) =>
      HttpResponse.json(
        page(new URL(request.url).searchParams.get('status') === '1' ? [order] : []),
      ),
    ),
    http.get(`${ogBase}/products/9537_12118/`, () =>
      HttpResponse.json(buildOgProductWith({ name: 'Kraft Paper Shopping Bags' })),
    ),
  );

  renderWithProviders(<SubscriptionsManager />, {
    preloadedState: {
      company: buildCompanyStateWith({
        customer: { id: faker.number.int({ min: 1, max: 1_000_000 }) },
      }),
      // The store's date display format is blank by default; "2026-10-03" renders as "3 Oct 2026".
      storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } }),
    },
  });

  const group = await screen.findByRole('group', { name: 'Kraft Paper Shopping Bags' });

  // On a phone the schedule sits inside the details group, right under the title; the desktop
  // card test asserts the inverse.
  expect(await within(group).findByText('Next order 3 Oct 2026')).toBeInTheDocument();
});
