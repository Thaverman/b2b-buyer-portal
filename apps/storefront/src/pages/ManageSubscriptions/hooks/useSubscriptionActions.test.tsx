import { QueryClient, useQuery } from '@tanstack/react-query';
import {
  buildOgOrderWith,
  buildOgPaymentWith,
  buildOgSubscriptionWith,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  startMockServer,
  waitFor,
} from 'tests/test-utils';
import type { MockInstance } from 'vitest';

import { listPayments, OgPayment } from '@/shared/service/ordergroove';
import { buildCardOptions, CardOption } from '@/shared/service/ssw/cardOptions';
import { StoredInstrument } from '@/shared/service/ssw/customerClient';
import { snackbar } from '@/utils/b3Tip';

import { useSubscriptionActions } from './useSubscriptionActions';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

type Actions = ReturnType<typeof useSubscriptionActions>;
let latest: Actions | undefined;
// Every QueryClient instance shares the prototype, so this sees renderWithProviders' private client.
let invalidate: MockInstance;

function Probe({ customerId }: { customerId: number }) {
  latest = useSubscriptionActions(customerId);

  return null;
}

const actions = () => {
  if (!latest) {
    throw new Error('the probe has not rendered');
  }

  return latest;
};

const renderActions = () => {
  // Drawn outside the render: a value generated per render would re-key every query each render.
  const customerId = faker.number.int({ min: 1, max: 1_000_000 });
  renderWithProviders(<Probe customerId={customerId} />);

  return { customerId };
};

const invalidatedKeys = () =>
  invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown[] }).queryKey);

beforeEach(() => {
  window.BC_CONTEXT = {
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint,
      appClientId: 'ssw-app-client-id',
    },
  };
  invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')),
    http.post(authEndpoint, () =>
      HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 }),
    ),
  );
});

afterEach(() => {
  delete window.BC_CONTEXT;
  latest = undefined;
  invalidate.mockRestore();
  vi.clearAllMocks();
});

it('skips, then refreshes subscriptions and upcoming orders, then confirms', async () => {
  const received = vi.fn();
  server.use(
    http.patch(`${ogBase}/orders/o-1/skip_subscription/`, async ({ request }) => {
      received(await request.json());

      return HttpResponse.json(buildOgOrderWith('WHATEVER_VALUES'));
    }),
  );
  const { customerId } = renderActions();

  actions().skip.mutate({ orderId: 'o-1', subscriptionId: 's-1' });

  await waitFor(() => expect(actions().skip.isSuccess).toBe(true));
  expect(received).toHaveBeenCalledWith({ subscription: 's-1' });
  expect(invalidatedKeys()).toEqual([
    ['ordergroove', customerId, 'subscriptions'],
    ['ordergroove', customerId, 'upcoming'],
  ]);
  expect(snackbar.success).toHaveBeenCalledWith('Next order skipped.');
  expect(snackbar.error).not.toHaveBeenCalled();
});

it('sends now and also refreshes order history', async () => {
  server.use(
    http.patch(`${ogBase}/orders/o-1/send_now/`, () =>
      HttpResponse.json(buildOgOrderWith('WHATEVER_VALUES')),
    ),
  );
  const { customerId } = renderActions();

  actions().sendNow.mutate({ orderId: 'o-1' });

  await waitFor(() => expect(actions().sendNow.isSuccess).toBe(true));
  expect(invalidatedKeys()).toEqual([
    ['ordergroove', customerId, 'subscriptions'],
    ['ordergroove', customerId, 'upcoming'],
    ['ordergroove', customerId, 'orderHistory'],
  ]);
  expect(snackbar.success).toHaveBeenCalledWith(
    'Order on its way. It will be placed within 24 hours.',
  );
});

it('changes the next order date', async () => {
  const received = vi.fn();
  server.use(
    http.patch(`${ogBase}/subscriptions/s-1/change_next_order_date/`, async ({ request }) => {
      received(await request.json());

      return HttpResponse.json(buildOgSubscriptionWith('WHATEVER_VALUES'));
    }),
  );
  const { customerId } = renderActions();

  actions().changeDate.mutate({ subscriptionId: 's-1', orderDate: '2026-10-31' });

  await waitFor(() => expect(actions().changeDate.isSuccess).toBe(true));
  expect(received).toHaveBeenCalledWith({ order_date: '2026-10-31' });
  expect(invalidatedKeys()).toEqual([
    ['ordergroove', customerId, 'subscriptions'],
    ['ordergroove', customerId, 'upcoming'],
  ]);
  expect(snackbar.success).toHaveBeenCalledWith('Next order date updated.');
});

it('reports a failed write and leaves the cache alone', async () => {
  server.use(
    http.patch(`${ogBase}/orders/o-1/send_now/`, () => new HttpResponse(null, { status: 500 })),
  );
  renderActions();

  actions().sendNow.mutate({ orderId: 'o-1' });

  await waitFor(() => expect(actions().sendNow.isError).toBe(true));
  expect(invalidate).not.toHaveBeenCalled();
  expect(snackbar.error).toHaveBeenCalledWith("We couldn't apply that change. Please try again.");
  expect(snackbar.success).not.toHaveBeenCalled();
});

it('uses the session copy when Ordergroove rejects the signature twice', async () => {
  server.use(
    http.patch(`${ogBase}/orders/o-1/send_now/`, () =>
      HttpResponse.json({ detail: 'Authentication Failed' }, { status: 403 }),
    ),
  );
  renderActions();

  actions().sendNow.mutate({ orderId: 'o-1' });

  await waitFor(() => expect(actions().sendNow.isError).toBe(true));
  expect(snackbar.error).toHaveBeenCalledWith('Your session has expired — please sign in again.');
});

describe('changeCard', () => {
  const option = (over: Partial<CardOption> = {}): CardOption => ({
    token: 'tok-b',
    brand: 'VISA',
    last4: '4242',
    expiry: '03/2028',
    isCurrent: false,
    paymentId: null,
    ...over,
  });

  it('reuses an existing record without creating one', async () => {
    const created = vi.fn();
    const repointed = vi.fn();
    server.use(
      http.post(`${ogBase}/payments/create/`, () => {
        created();

        return HttpResponse.json(buildOgPaymentWith('WHATEVER_VALUES'));
      }),
      http.patch(`${ogBase}/subscriptions/s-1/change_payment/`, async ({ request }) => {
        repointed(await request.json());

        return HttpResponse.json(buildOgSubscriptionWith('WHATEVER_VALUES'));
      }),
    );
    const { customerId } = renderActions();

    actions().changeCard.mutate({
      subscriptionId: 's-1',
      option: option({ paymentId: 'pay-b' }),
      billingAddress: 'addr-1',
    });

    await waitFor(() => expect(actions().changeCard.isSuccess).toBe(true));
    expect(created).not.toHaveBeenCalled();
    expect(repointed).toHaveBeenCalledWith({ payment: 'pay-b' });
    expect(invalidatedKeys()).toEqual([
      ['ordergroove', customerId, 'subscriptions'],
      ['ordergroove', customerId, 'upcoming'],
      ['ordergroove', customerId, 'payments'],
    ]);
    expect(snackbar.success).toHaveBeenCalledWith('Card updated.');
  });

  it('creates a record from the card when Ordergroove has none, then repoints', async () => {
    const created = vi.fn();
    const repointed = vi.fn();
    server.use(
      http.post(`${ogBase}/payments/create/`, async ({ request }) => {
        created(await request.json());

        return HttpResponse.json(buildOgPaymentWith({ public_id: 'pay-new' }));
      }),
      http.patch(`${ogBase}/subscriptions/s-1/change_payment/`, async ({ request }) => {
        repointed(await request.json());

        return HttpResponse.json(buildOgSubscriptionWith('WHATEVER_VALUES'));
      }),
    );
    const { customerId } = renderActions();

    actions().changeCard.mutate({
      subscriptionId: 's-1',
      option: option(),
      billingAddress: 'addr-1',
    });

    await waitFor(() => expect(actions().changeCard.isSuccess).toBe(true));
    expect(created).toHaveBeenCalledWith({
      customer: String(customerId),
      token_id: 'tok-b',
      cc_number_ending: '4242',
      cc_exp_date: '03/2028',
      cc_type: 1,
      billing_address: 'addr-1',
    });
    expect(repointed).toHaveBeenCalledWith({ payment: 'pay-new' });
  });

  it('reports a failed repoint, invalidates payments, but leaves the other keys alone', async () => {
    server.use(
      http.patch(
        `${ogBase}/subscriptions/s-1/change_payment/`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const { customerId } = renderActions();

    actions().changeCard.mutate({
      subscriptionId: 's-1',
      option: option({ paymentId: 'pay-b' }),
      billingAddress: null,
    });

    await waitFor(() => expect(actions().changeCard.isError).toBe(true));
    // A create can have already succeeded before this repoint failed (Ordergroove has no delete
    // for payment records), so the payments query is invalidated even on failure — a retry must
    // see any record the failed attempt created rather than make a second, permanent one.
    expect(invalidatedKeys()).toEqual([['ordergroove', customerId, 'payments']]);
    expect(snackbar.error).toHaveBeenCalledWith("We couldn't apply that change. Please try again.");
  });

  it('invalidates payments on settle so a retry after a failed repoint reuses the created record', async () => {
    const created = vi.fn();
    let repointAttempts = 0;
    let paymentsList: ReturnType<typeof buildOgPaymentWith>[] = [];
    server.use(
      http.get(`${ogBase}/payments/`, () =>
        HttpResponse.json({
          count: paymentsList.length,
          next: null,
          previous: null,
          results: paymentsList,
        }),
      ),
      http.post(`${ogBase}/payments/create/`, async ({ request }) => {
        created();
        const body = (await request.json()) as { token_id: string };
        const payment = buildOgPaymentWith({
          public_id: 'pay-new',
          token_id: body.token_id,
          live: true,
        });
        paymentsList = [payment];

        return HttpResponse.json(payment);
      }),
      http.patch(`${ogBase}/subscriptions/s-1/change_payment/`, () => {
        repointAttempts += 1;

        return repointAttempts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(buildOgSubscriptionWith('WHATEVER_VALUES'));
      }),
    );

    // Mirrors SubscriptionActions.tsx: the options a real caller passes come from this same
    // payments query, so an invalidation of it is what lets a retry see the created record.
    let latestPayments: OgPayment[] | undefined;
    function ProbeWithPayments({ customerId }: { customerId: number }) {
      latest = useSubscriptionActions(customerId);
      const payments = useQuery({
        queryKey: ['ordergroove', customerId, 'payments'],
        queryFn: () => listPayments(String(customerId)),
      });
      latestPayments = payments.data;

      return null;
    }

    const customerId = faker.number.int({ min: 1, max: 1_000_000 });
    renderWithProviders(<ProbeWithPayments customerId={customerId} />);

    const instrument: StoredInstrument = {
      token: 'tok-b',
      brand: 'VISA',
      last4: '4242',
      expiryMonth: 3,
      expiryYear: 2028,
      type: 'card',
      isDefault: true,
      source: 'bigcommerce',
    };
    const optionFor = () => buildCardOptions([instrument], latestPayments, null)[0];

    await waitFor(() => expect(optionFor().paymentId).toBeNull());

    actions().changeCard.mutate({
      subscriptionId: 's-1',
      option: optionFor(),
      billingAddress: null,
    });

    await waitFor(() => expect(actions().changeCard.isError).toBe(true));
    expect(created).toHaveBeenCalledTimes(1);

    // The failed attempt's invalidation refetches payments, so the option now carries the record
    // the create call already made.
    await waitFor(() => expect(optionFor().paymentId).toBe('pay-new'));

    actions().changeCard.mutate({
      subscriptionId: 's-1',
      option: optionFor(),
      billingAddress: null,
    });

    await waitFor(() => expect(actions().changeCard.isSuccess).toBe(true));
    expect(created).toHaveBeenCalledTimes(1);
  });
});

describe('subscription edits', () => {
  // All five share the 3a contract: PATCH the subscription, refresh subscriptions and upcoming
  // orders, confirm with the action's own copy.
  const mockEdit = (action: string) => {
    const received = vi.fn();
    server.use(
      http.patch(`${ogBase}/subscriptions/s-1/${action}/`, async ({ request }) => {
        received(await request.json());

        return HttpResponse.json(buildOgSubscriptionWith('WHATEVER_VALUES'));
      }),
    );

    return received;
  };
  const subscriptionKeys = (customerId: number) => [
    ['ordergroove', customerId, 'subscriptions'],
    ['ordergroove', customerId, 'upcoming'],
  ];

  it('changes the frequency with Ordergroove field names', async () => {
    const received = mockEdit('change_frequency');
    const { customerId } = renderActions();

    actions().changeFrequency.mutate({ subscriptionId: 's-1', every: 6, everyPeriod: 2 });

    await waitFor(() => expect(actions().changeFrequency.isSuccess).toBe(true));
    expect(received).toHaveBeenCalledWith({ every: 6, every_period: 2 });
    expect(invalidatedKeys()).toEqual(subscriptionKeys(customerId));
    expect(snackbar.success).toHaveBeenCalledWith('Frequency updated.');
  });

  it('changes the quantity', async () => {
    const received = mockEdit('change_quantity');
    const { customerId } = renderActions();

    actions().changeQuantity.mutate({ subscriptionId: 's-1', quantity: 3 });

    await waitFor(() => expect(actions().changeQuantity.isSuccess).toBe(true));
    expect(received).toHaveBeenCalledWith({ quantity: 3 });
    expect(invalidatedKeys()).toEqual(subscriptionKeys(customerId));
    expect(snackbar.success).toHaveBeenCalledWith('Quantity updated.');
  });

  it('cancels with the reason body it is handed', async () => {
    const received = mockEdit('cancel');
    const { customerId } = renderActions();

    actions().cancel.mutate({
      subscriptionId: 's-1',
      cancelReason: '114|Cancelled without exit survey response',
    });

    await waitFor(() => expect(actions().cancel.isSuccess).toBe(true));
    expect(received).toHaveBeenCalledWith({
      cancel_reason: '114|Cancelled without exit survey response',
    });
    expect(invalidatedKeys()).toEqual(subscriptionKeys(customerId));
    expect(snackbar.success).toHaveBeenCalledWith('Subscription cancelled.');
  });

  it('reactivates with the schedule and the first order date', async () => {
    const received = mockEdit('reactivate');
    const { customerId } = renderActions();

    actions().reactivate.mutate({
      subscriptionId: 's-1',
      startDate: '2026-10-01',
      every: 4,
      everyPeriod: 2,
      nextOrderDate: '2026-10-02',
    });

    await waitFor(() => expect(actions().reactivate.isSuccess).toBe(true));
    expect(received).toHaveBeenCalledWith({
      start_date: '2026-10-01',
      every: 4,
      every_period: 2,
      next_order_date: '2026-10-02',
    });
    expect(invalidatedKeys()).toEqual(subscriptionKeys(customerId));
    expect(snackbar.success).toHaveBeenCalledWith('Subscription reactivated.');
  });

  it('changes the shipping address', async () => {
    const received = mockEdit('change_shipping');
    const { customerId } = renderActions();

    actions().changeAddress.mutate({ subscriptionId: 's-1', addressId: 'addr-2' });

    await waitFor(() => expect(actions().changeAddress.isSuccess).toBe(true));
    expect(received).toHaveBeenCalledWith({ shipping_address: 'addr-2' });
    expect(invalidatedKeys()).toEqual(subscriptionKeys(customerId));
    expect(snackbar.success).toHaveBeenCalledWith('Shipping address updated.');
  });

  it('reports a failed cancel and leaves the cache alone', async () => {
    server.use(
      http.patch(`${ogBase}/subscriptions/s-1/cancel/`, () =>
        HttpResponse.json({ detail: 'locked' }, { status: 423 }),
      ),
    );
    renderActions();

    actions().cancel.mutate({ subscriptionId: 's-1', cancelReason: '1' });

    await waitFor(() => expect(actions().cancel.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
    expect(snackbar.error).toHaveBeenCalledWith("We couldn't apply that change. Please try again.");
    expect(snackbar.success).not.toHaveBeenCalled();
  });
});
