import { QueryClient } from '@tanstack/react-query';
import {
  buildOgPaymentWith,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  startMockServer,
  waitFor,
} from 'tests/test-utils';
import type { MockInstance } from 'vitest';

import { snackbar } from '@/utils/b3Tip';

import { useMoveSubscriptions } from './useMoveSubscriptions';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const { server } = startMockServer();

const apiBase = 'https://api.example.com';
const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = `${apiBase}/products/productclient/ordergroove-auth`;
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

type Hook = ReturnType<typeof useMoveSubscriptions>;
let latest: Hook | undefined;
let invalidate: MockInstance;

function Probe({ customerId, token }: { customerId: number; token: string }) {
  latest = useMoveSubscriptions(customerId, token, true);

  return null;
}

const hook = () => {
  if (!latest) {
    throw new Error('the probe has not rendered');
  }

  return latest;
};

const renderHookProbe = () => {
  const customerId = faker.number.int({ min: 1, max: 1_000_000 });
  renderWithProviders(<Probe customerId={customerId} token="tok-a" />);

  return { customerId };
};

beforeEach(() => {
  window.BC_CONTEXT = {
    paymentMethods: { apiBase, appClientId: 'ssw-app-client-id' },
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
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () =>
      HttpResponse.json({
        customerId: 80591,
        instruments: [
          {
            token: 'tok-a',
            last4: '4242',
            brand: 'VISA',
            expiryMonth: 3,
            expiryYear: 2028,
            type: 'card',
            isDefault: true,
            source: 'bigcommerce',
          },
          {
            token: 'tok-b',
            last4: '1881',
            brand: 'AMEX',
            expiryMonth: 11,
            expiryYear: 2029,
            type: 'card',
            isDefault: false,
            source: 'bigcommerce',
          },
        ],
      }),
    ),
    http.get(`${ogBase}/payments/`, () =>
      HttpResponse.json({
        count: 1,
        next: null,
        previous: null,
        results: [buildOgPaymentWith({ public_id: 'pay-b', token_id: 'tok-b', live: true })],
      }),
    ),
  );
});

afterEach(() => {
  delete window.BC_CONTEXT;
  latest = undefined;
  invalidate.mockRestore();
  vi.clearAllMocks();
});

it('offers every saved card except the one being deleted', async () => {
  renderHookProbe();

  await waitFor(() => expect(hook().options).toHaveLength(1));
  expect(hook().options[0]).toMatchObject({ token: 'tok-b', paymentId: 'pay-b' });
});

it('moves every subscription onto the chosen card and refreshes the check', async () => {
  const used = vi.fn();
  server.use(
    http.post(`${ogBase}/payments/pay-b/use_for_all/`, () => {
      used();

      // Verified live 2026-09-18 (api.test.ts): 200 with a parseable JSON body.
      return HttpResponse.json({});
    }),
  );
  const { customerId } = renderHookProbe();
  await waitFor(() => expect(hook().options).toHaveLength(1));

  hook().move.mutate(hook().options[0]);

  await waitFor(() => expect(hook().move.isSuccess).toBe(true));
  expect(used).toHaveBeenCalled();
  expect(
    invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown[] }).queryKey),
  ).toContainEqual(['subscriptionsUsingToken', customerId, 'tok-a']);
  expect(snackbar.success).toHaveBeenCalledWith(
    'Subscriptions moved to AMEX ending in 1881 · exp 11/2029.',
  );
});

it('creates a record first when Ordergroove does not hold the chosen card', async () => {
  const created = vi.fn();
  server.use(
    http.get(`${ogBase}/payments/`, () =>
      HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
    ),
    http.post(`${ogBase}/payments/create/`, async ({ request }) => {
      created(await request.json());

      return HttpResponse.json(buildOgPaymentWith({ public_id: 'pay-made' }));
    }),
    http.post(`${ogBase}/payments/pay-made/use_for_all/`, () => HttpResponse.json({})),
  );
  renderHookProbe();
  await waitFor(() => expect(hook().options).toHaveLength(1));

  hook().move.mutate(hook().options[0]);

  await waitFor(() => expect(hook().move.isSuccess).toBe(true));
  expect(created).toHaveBeenCalledWith(
    expect.objectContaining({ token_id: 'tok-b', cc_number_ending: '1881', cc_type: 3 }),
  );
});

it('invalidates payments on settle so a retry after a failed move reuses the created record', async () => {
  const created = vi.fn();
  let moveAttempts = 0;
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
        public_id: 'pay-made',
        token_id: body.token_id,
        live: true,
      });
      paymentsList = [payment];

      return HttpResponse.json(payment);
    }),
    http.post(`${ogBase}/payments/pay-made/use_for_all/`, () => {
      moveAttempts += 1;

      return moveAttempts === 1 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json({});
    }),
  );
  renderHookProbe();
  await waitFor(() => expect(hook().options).toHaveLength(1));
  expect(hook().options[0].paymentId).toBeNull();

  hook().move.mutate(hook().options[0]);

  await waitFor(() => expect(hook().move.isError).toBe(true));
  expect(created).toHaveBeenCalledTimes(1);

  // The failed attempt's invalidation refetches payments, so the retried option now carries the
  // record the create call already made.
  await waitFor(() => expect(hook().options[0].paymentId).toBe('pay-made'));

  hook().move.mutate(hook().options[0]);

  await waitFor(() => expect(hook().move.isSuccess).toBe(true));
  expect(created).toHaveBeenCalledTimes(1);
});

it('reports a failed move', async () => {
  server.use(
    http.post(
      `${ogBase}/payments/pay-b/use_for_all/`,
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  renderHookProbe();
  await waitFor(() => expect(hook().options).toHaveLength(1));

  hook().move.mutate(hook().options[0]);

  await waitFor(() => expect(hook().move.isError).toBe(true));
  expect(snackbar.error).toHaveBeenCalledWith("We couldn't apply that change. Please try again.");
});
