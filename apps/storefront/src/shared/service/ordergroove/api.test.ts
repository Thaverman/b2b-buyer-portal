import {
  buildOgAddressWith,
  buildOgItemWith,
  buildOgOrderWith,
  buildOgPaymentWith,
  buildOgProductWith,
  buildOgSubscriptionWith,
  delay,
  faker,
  http,
  HttpResponse,
  startMockServer,
} from 'tests/test-utils';

import {
  changeNextOrderDate,
  getProduct,
  getSubscriptionsUsingToken,
  listAddresses,
  listOrdersPage,
  listPayments,
  listSubscriptions,
  listUpcomingOrders,
  orderHistoryUrl,
  sendOrderNow,
  skipSubscription,
} from './api';
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
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint,
      appClientId: 'ssw-app-client-id',
    },
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

it('lists every page of subscriptions, payments and addresses', async () => {
  const customerId = someCustomerId();
  const first = buildOgSubscriptionWith('WHATEVER_VALUES');
  const second = buildOgSubscriptionWith('WHATEVER_VALUES');
  server.use(
    http.get(`${ogBase}/subscriptions/`, ({ request }) =>
      new URL(request.url).searchParams.get('page') === '2'
        ? HttpResponse.json(page([second]))
        : HttpResponse.json(page([first], `${ogBase}/subscriptions/?page=2`)),
    ),
    http.get(`${ogBase}/payments/`, () =>
      HttpResponse.json(page([buildOgPaymentWith('WHATEVER_VALUES')])),
    ),
    http.get(`${ogBase}/addresses/`, () =>
      HttpResponse.json(page([buildOgAddressWith('WHATEVER_VALUES')])),
    ),
  );

  expect(await listSubscriptions(customerId)).toEqual([first, second]);
  expect(await listPayments(customerId)).toHaveLength(1);
  expect(await listAddresses(customerId)).toHaveLength(1);
});

it('lists upcoming orders together with their items, both filtered to status 1', async () => {
  const requested = vi.fn();
  const order = buildOgOrderWith({ status: 1 });
  const item = buildOgItemWith({ order: order.public_id });
  server.use(
    http.get(`${ogBase}/orders/`, ({ request }) => {
      requested(`orders:${new URL(request.url).searchParams.get('status')}`);

      return HttpResponse.json(page([order]));
    }),
    http.get(`${ogBase}/items/`, ({ request }) => {
      requested(`items:${new URL(request.url).searchParams.get('status')}`);

      return HttpResponse.json(page([item]));
    }),
  );

  expect(await listUpcomingOrders(someCustomerId())).toEqual({ orders: [order], items: [item] });
  expect(requested.mock.calls.map(([call]) => call).sort()).toEqual(['items:1', 'orders:1']);
});

it('fetches one page of order history, newest first, at exactly the URL it is given', async () => {
  const requestedUrl = vi.fn();
  const order = buildOgOrderWith('WHATEVER_VALUES');
  server.use(
    http.get(`${ogBase}/orders/`, ({ request }) => {
      requestedUrl(request.url);

      return HttpResponse.json(page([order], `${ogBase}/orders/?place_end=2026-09-17&page=2`));
    }),
  );

  const result = await listOrdersPage(someCustomerId(), orderHistoryUrl('2026-09-17'));

  // Task 0 finding C: the API's default order is not by place, but ordering=-place is honoured.
  expect(requestedUrl).toHaveBeenCalledWith(
    `${ogBase}/orders/?place_end=2026-09-17&ordering=-place`,
  );
  expect(result.results).toEqual([order]);
  expect(result.next).toBe(`${ogBase}/orders/?place_end=2026-09-17&page=2`);
});

describe('writes', () => {
  it('skips one subscription on its upcoming order with a PATCH and a JSON body', async () => {
    const received = vi.fn();
    const order = buildOgOrderWith({ status: 1 });
    server.use(
      http.patch(`${ogBase}/orders/:orderId/skip_subscription/`, async ({ params, request }) => {
        received(params.orderId, await request.json(), request.headers.get('Content-Type'));

        return HttpResponse.json(order);
      }),
    );

    expect(await skipSubscription(someCustomerId(), order.public_id, 'sub-1')).toEqual(order);
    expect(received).toHaveBeenCalledWith(
      order.public_id,
      { subscription: 'sub-1' },
      'application/json',
    );
  });

  it('sends an order now with an empty PATCH', async () => {
    const bodies = vi.fn();
    const order = buildOgOrderWith({ status: 1 });
    server.use(
      http.patch(`${ogBase}/orders/${order.public_id}/send_now/`, async ({ request }) => {
        bodies(await request.text());

        return HttpResponse.json(order);
      }),
    );

    expect(await sendOrderNow(someCustomerId(), order.public_id)).toEqual(order);
    expect(bodies).toHaveBeenCalledWith('');
  });

  it("changes a subscription's next order date", async () => {
    const received = vi.fn();
    const subscription = buildOgSubscriptionWith('WHATEVER_VALUES');
    server.use(
      http.patch(
        `${ogBase}/subscriptions/${subscription.public_id}/change_next_order_date/`,
        async ({ request }) => {
          received(await request.json());

          return HttpResponse.json(subscription);
        },
      ),
    );

    expect(
      await changeNextOrderDate(someCustomerId(), subscription.public_id, '2026-10-31'),
    ).toEqual(subscription);
    expect(received).toHaveBeenCalledWith({ order_date: '2026-10-31' });
  });

  it('re-mints once on a 403 and repeats the same write', async () => {
    const mints = vi.fn();
    let calls = 0;
    server.use(
      http.post(authEndpoint, () => {
        mints();

        return HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 });
      }),
      http.patch(`${ogBase}/orders/o-1/send_now/`, () => {
        calls += 1;

        return calls === 1
          ? HttpResponse.json({ detail: 'Authentication Failed' }, { status: 403 })
          : HttpResponse.json(buildOgOrderWith('WHATEVER_VALUES'));
      }),
    );

    await sendOrderNow(someCustomerId(), 'o-1');

    expect(calls).toBe(2);
    expect(mints).toHaveBeenCalledTimes(2);
  });

  it('maps a 400 and a 423 to upstream', async () => {
    server.use(
      http.patch(`${ogBase}/orders/o-1/send_now/`, () =>
        HttpResponse.json({ detail: 'prepaid' }, { status: 400 }),
      ),
    );
    await expect(sendOrderNow(someCustomerId(), 'o-1')).rejects.toMatchObject({ kind: 'upstream' });

    server.use(
      http.patch(`${ogBase}/orders/o-1/send_now/`, () => new HttpResponse(null, { status: 423 })),
    );
    await expect(sendOrderNow(someCustomerId(), 'o-1')).rejects.toMatchObject({ kind: 'upstream' });
  });

  it('gives a write ten seconds, not five', async () => {
    const customerId = someCustomerId();

    // Prime the header with real timers so only the Ordergroove call is under the fake clock.
    mockPayments([]);
    await listPayments(customerId);

    vi.useFakeTimers();
    server.use(
      http.patch(`${ogBase}/orders/o-1/send_now/`, async () => {
        await delay('infinite');

        return HttpResponse.json({});
      }),
    );

    let settled = false;
    const pending = sendOrderNow(customerId, 'o-1').catch((error: unknown) => {
      settled = true;
      throw error;
    });
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });

    await vi.advanceTimersByTimeAsync(5000);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(settled).toBe(true);
  });
});
