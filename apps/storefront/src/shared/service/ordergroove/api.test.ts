import {
  buildOgPaymentWith,
  buildOgProductWith,
  buildOgSubscriptionWith,
  delay,
  faker,
  http,
  HttpResponse,
  startMockServer,
} from 'tests/test-utils';

import { getProduct, getSubscriptionsUsingToken } from './api';
import { invalidateAuthorization } from './auth';

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const someCustomerId = () => String(faker.number.int({ min: 1, max: 1_000_000 }));
const someToken = () => faker.string.hexadecimal({ length: 64, prefix: '' }).toLowerCase();

const page = <T>(results: T[], next: string | null = null) => ({
  count: results.length,
  next,
  previous: null,
  results,
});

const mockAuth = () =>
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')),
    http.post(authEndpoint, () =>
      HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 }),
    ),
  );

const mockPayments = (payments: ReturnType<typeof buildOgPaymentWith>[]) =>
  server.use(http.get(`${ogBase}/payments/`, () => HttpResponse.json(page(payments))));

const mockSubscriptions = (subscriptions: ReturnType<typeof buildOgSubscriptionWith>[]) =>
  server.use(http.get(`${ogBase}/subscriptions/`, () => HttpResponse.json(page(subscriptions))));

beforeEach(() => {
  window.BC_CONTEXT = {
    subscriptions: { merchantId: 'merchant-public-id', authEndpoint, appClientId: 'ssw-app-client-id' },
  };
  invalidateAuthorization();
  mockAuth();
});

afterEach(() => {
  delete window.BC_CONTEXT;
  vi.useRealTimers();
});

it('sends the Ordergroove header on every request', async () => {
  const authorization = vi.fn();

  server.use(
    http.get(`${ogBase}/payments/`, ({ request }) => {
      authorization(request.headers.get('Authorization'));

      return HttpResponse.json(page([]));
    }),
  );

  await getSubscriptionsUsingToken(someCustomerId(), 'tok');

  expect(JSON.parse(authorization.mock.calls[0][0])).toMatchObject({
    public_id: 'merchant-public-id',
    sig_field: '80591',
    sig: 'sig',
  });
});

it('returns only active subscriptions whose payment record carries the token', async () => {
  const token = someToken();
  const livePayment = buildOgPaymentWith({ token_id: token, live: true });
  const otherPayment = buildOgPaymentWith({ live: true });
  const wanted = buildOgSubscriptionWith({ payment: livePayment.public_id });
  const cancelled = buildOgSubscriptionWith({
    payment: livePayment.public_id,
    cancelled: '2026-01-01 00:00:00',
  });
  const dead = buildOgSubscriptionWith({ payment: livePayment.public_id, live: false });
  const otherCard = buildOgSubscriptionWith({ payment: otherPayment.public_id });

  mockPayments([livePayment, otherPayment]);
  mockSubscriptions([wanted, cancelled, dead, otherCard]);

  const result = await getSubscriptionsUsingToken(someCustomerId(), token);

  expect(result.map((s) => s.public_id)).toEqual([wanted.public_id]);
});

it('matches a live subscription through a dead payment record with the same token', async () => {
  // Ordergroove mints a payment record per checkout; a subscription can still point at an older,
  // no-longer-live record for the very same card.
  const token = someToken();
  const deadRecord = buildOgPaymentWith({ token_id: token, live: false });
  const subscription = buildOgSubscriptionWith({ payment: deadRecord.public_id });

  mockPayments([deadRecord, buildOgPaymentWith({ token_id: token, live: true })]);
  mockSubscriptions([subscription]);

  const result = await getSubscriptionsUsingToken(someCustomerId(), token);

  expect(result.map((s) => s.public_id)).toEqual([subscription.public_id]);
});

it('does not fetch subscriptions when no payment record carries the token', async () => {
  const subscriptionRequests = vi.fn();

  mockPayments([buildOgPaymentWith('WHATEVER_VALUES')]);
  server.use(
    http.get(`${ogBase}/subscriptions/`, () => {
      subscriptionRequests();

      return HttpResponse.json(page([]));
    }),
  );

  expect(await getSubscriptionsUsingToken(someCustomerId(), 'unknown-token')).toEqual([]);
  expect(subscriptionRequests).not.toHaveBeenCalled();
});

it('follows pagination until next is null', async () => {
  const token = someToken();
  const payment = buildOgPaymentWith({ token_id: token });
  const first = buildOgSubscriptionWith({ payment: payment.public_id });
  const second = buildOgSubscriptionWith({ payment: payment.public_id });

  mockPayments([payment]);
  server.use(
    http.get(`${ogBase}/subscriptions/`, ({ request }) =>
      new URL(request.url).searchParams.get('page') === '2'
        ? HttpResponse.json(page([second]))
        : HttpResponse.json(page([first], `${ogBase}/subscriptions/?page=2`)),
    ),
  );

  const result = await getSubscriptionsUsingToken(someCustomerId(), token);

  expect(result.map((s) => s.public_id)).toEqual([first.public_id, second.public_id]);
});

it('re-mints the header once on a 403 and retries', async () => {
  const mints = vi.fn();
  let paymentCalls = 0;

  server.use(
    http.post(authEndpoint, () => {
      mints();

      return HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 });
    }),
    http.get(`${ogBase}/payments/`, () => {
      paymentCalls += 1;

      return paymentCalls === 1
        ? HttpResponse.json({ detail: 'Authentication Failed' }, { status: 403 })
        : HttpResponse.json(page([]));
    }),
  );

  expect(await getSubscriptionsUsingToken(someCustomerId(), 'tok')).toEqual([]);
  expect(mints).toHaveBeenCalledTimes(2);
});

it('reports an expired session when the retry is also forbidden', async () => {
  server.use(
    http.get(`${ogBase}/payments/`, () =>
      HttpResponse.json({ detail: 'Authentication Failed' }, { status: 403 }),
    ),
  );

  await expect(getSubscriptionsUsingToken(someCustomerId(), 'tok')).rejects.toMatchObject({
    kind: 'sessionExpired',
  });
});

it('maps 429 to rateLimited and other failures to upstream', async () => {
  server.use(http.get(`${ogBase}/payments/`, () => new HttpResponse(null, { status: 429 })));
  await expect(getSubscriptionsUsingToken(someCustomerId(), 'tok')).rejects.toMatchObject({
    kind: 'rateLimited',
  });

  server.use(http.get(`${ogBase}/payments/`, () => new HttpResponse(null, { status: 500 })));
  await expect(getSubscriptionsUsingToken(someCustomerId(), 'tok')).rejects.toMatchObject({
    kind: 'upstream',
  });
});

it('gives up after five seconds', async () => {
  const customerId = someCustomerId();

  // Prime the header with real timers so only the Ordergroove call is under the fake clock.
  mockPayments([]);
  await getSubscriptionsUsingToken(customerId, 'tok');

  vi.useFakeTimers();
  server.use(
    http.get(`${ogBase}/payments/`, async () => {
      await delay('infinite');

      return HttpResponse.json(page([]));
    }),
  );

  const pending = getSubscriptionsUsingToken(customerId, 'tok');
  const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
  await vi.advanceTimersByTimeAsync(5000);

  await assertion;
});

it('fetches a product by its Ordergroove external id', async () => {
  const product = buildOgProductWith({ external_product_id: '9537_12118' });

  server.use(http.get(`${ogBase}/products/9537_12118/`, () => HttpResponse.json(product)));

  expect(await getProduct(someCustomerId(), '9537_12118')).toEqual(product);
});
