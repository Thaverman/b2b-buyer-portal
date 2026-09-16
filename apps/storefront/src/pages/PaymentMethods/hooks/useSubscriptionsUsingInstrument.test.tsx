import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren } from 'react';

import {
  buildOgPaymentWith,
  buildOgProductWith,
  buildOgSubscriptionWith,
  http,
  HttpResponse,
  renderHook,
  startMockServer,
  waitFor,
} from 'tests/test-utils';

import { useSubscriptionsUsingInstrument } from './useSubscriptionsUsingInstrument';

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const page = <T,>(results: T[]) => ({
  count: results.length,
  next: null,
  previous: null,
  results,
});

function Wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}
const wrapper = Wrapper;

beforeEach(() => {
  window.BC_CONTEXT = {
    subscriptions: { merchantId: 'merchant-public-id', authEndpoint, appClientId: 'ssw-app-client-id' },
  };
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')),
    http.post(authEndpoint, () =>
      HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 }),
    ),
  );
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('does nothing while disabled or without a token', () => {
  const requests = vi.fn();
  server.use(
    http.get(`${ogBase}/payments/`, () => {
      requests();

      return HttpResponse.json(page([]));
    }),
  );

  const disabled = renderHook(() => useSubscriptionsUsingInstrument(1, 'tok', false), { wrapper });
  const noToken = renderHook(() => useSubscriptionsUsingInstrument(1, undefined, true), {
    wrapper,
  });

  expect(disabled.result.current.fetchStatus).toBe('idle');
  expect(noToken.result.current.fetchStatus).toBe('idle');
  expect(requests).not.toHaveBeenCalled();
});

it('resolves product names for the affected subscriptions', async () => {
  const payment = buildOgPaymentWith({ token_id: 'tok' });
  const bags = buildOgSubscriptionWith({
    payment: payment.public_id,
    product: '9537_12118',
    frequency_days: 28,
  });
  const tissue = buildOgSubscriptionWith({
    payment: payment.public_id,
    product: '7674_9534',
    frequency_days: 14,
  });

  server.use(
    http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([payment]))),
    http.get(`${ogBase}/subscriptions/`, () => HttpResponse.json(page([bags, tissue]))),
    http.get(`${ogBase}/products/9537_12118/`, () =>
      HttpResponse.json(buildOgProductWith({ name: 'Kraft Paper Shopping Bags' })),
    ),
    http.get(`${ogBase}/products/7674_9534/`, () =>
      HttpResponse.json(buildOgProductWith({ name: 'Tissue Paper' })),
    ),
  );

  const { result } = renderHook(() => useSubscriptionsUsingInstrument(80591, 'tok', true), {
    wrapper,
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual([
    { publicId: bags.public_id, productName: 'Kraft Paper Shopping Bags', frequencyDays: 28 },
    { publicId: tissue.public_id, productName: 'Tissue Paper', frequencyDays: 14 },
  ]);
});

it('keeps the subscription with a null name when its product lookup fails', async () => {
  const payment = buildOgPaymentWith({ token_id: 'tok' });
  const subscription = buildOgSubscriptionWith({ payment: payment.public_id, product: '1_2' });

  server.use(
    http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([payment]))),
    http.get(`${ogBase}/subscriptions/`, () => HttpResponse.json(page([subscription]))),
    http.get(`${ogBase}/products/1_2/`, () => new HttpResponse(null, { status: 500 })),
  );

  const { result } = renderHook(() => useSubscriptionsUsingInstrument(80591, 'tok', true), {
    wrapper,
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual([
    { publicId: subscription.public_id, productName: null, frequencyDays: 28 },
  ]);
});

it('surfaces an Ordergroove failure as an error', async () => {
  server.use(http.get(`${ogBase}/payments/`, () => new HttpResponse(null, { status: 500 })));

  const { result } = renderHook(() => useSubscriptionsUsingInstrument(80591, 'tok', true), {
    wrapper,
  });

  await waitFor(() => expect(result.current.isError).toBe(true));
});
