import { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  buildOgAddressWith,
  buildOgItemWith,
  buildOgOrderWith,
  buildOgPaymentWith,
  buildOgProductWith,
  buildOgSubscriptionWith,
  faker,
  http,
  HttpResponse,
  renderHook,
  startMockServer,
  waitFor,
} from 'tests/test-utils';

import { useSubscriptionsData } from './useSubscriptionsData';

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

// A distinct customer per test keeps the module-level auth cache from leaking between tests.
const someCustomerId = () => faker.number.int({ min: 1, max: 1_000_000 });

beforeEach(() => {
  window.BC_CONTEXT = {
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint,
      appClientId: 'ssw-app-client-id',
    },
  };
  server.use(
    http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')),
    http.post(authEndpoint, () =>
      HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 }),
    ),
    http.get(`${ogBase}/payments/`, () =>
      HttpResponse.json(page([buildOgPaymentWith('WHATEVER_VALUES')])),
    ),
    http.get(`${ogBase}/addresses/`, () =>
      HttpResponse.json(page([buildOgAddressWith('WHATEVER_VALUES')])),
    ),
    http.get(`${ogBase}/items/`, () =>
      HttpResponse.json(page([buildOgItemWith('WHATEVER_VALUES')])),
    ),
    http.get(`${ogBase}/orders/`, () =>
      HttpResponse.json(page([buildOgOrderWith('WHATEVER_VALUES')])),
    ),
  );
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('loads every resource and looks each distinct product up once', async () => {
  const productRequests = vi.fn();
  server.use(
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json(
        page([
          buildOgSubscriptionWith({ product: '9537_12118' }),
          buildOgSubscriptionWith({ product: '9537_12118' }),
          buildOgSubscriptionWith({ product: '7674_9534' }),
        ]),
      ),
    ),
    http.get(`${ogBase}/products/:id/`, ({ params }) => {
      productRequests(params.id);

      return HttpResponse.json(buildOgProductWith({ name: `Product ${params.id}` }));
    }),
  );

  // Drawn outside the callback: a value generated per render would re-key every query each render.
  const customerId = someCustomerId();
  const { result } = renderHook(() => useSubscriptionsData(customerId), { wrapper });

  await waitFor(() => expect(result.current.products.isSuccess).toBe(true));
  expect(result.current.subscriptions.data).toHaveLength(3);
  expect(result.current.payments.data).toHaveLength(1);
  expect(result.current.addresses.data).toHaveLength(1);
  expect(result.current.upcoming.data?.orders).toHaveLength(1);
  expect(result.current.upcoming.data?.items).toHaveLength(1);
  expect([...(result.current.products.data?.keys() ?? [])].sort()).toEqual([
    '7674_9534',
    '9537_12118',
  ]);
  expect(result.current.products.data?.get('9537_12118')?.name).toBe('Product 9537_12118');
  expect(productRequests).toHaveBeenCalledTimes(2);
});

it('keeps a failed product lookup as null instead of failing the query', async () => {
  server.use(
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json(page([buildOgSubscriptionWith({ product: '1_2' })])),
    ),
    http.get(`${ogBase}/products/1_2/`, () => new HttpResponse(null, { status: 500 })),
  );

  // Drawn outside the callback: a value generated per render would re-key every query each render.
  const customerId = someCustomerId();
  const { result } = renderHook(() => useSubscriptionsData(customerId), { wrapper });

  await waitFor(() => expect(result.current.products.isSuccess).toBe(true));
  expect(result.current.products.data?.get('1_2')).toBeNull();
});

it('starts order history at today, newest first, and pages through next', async () => {
  const requestedUrls: string[] = [];
  const today = dayjs().format('YYYY-MM-DD');
  const first = buildOgOrderWith({ place: '2026-09-05 00:00:00' });
  const second = buildOgOrderWith({ place: '2026-08-08 00:00:00' });
  server.use(
    http.get(`${ogBase}/subscriptions/`, () => HttpResponse.json(page([]))),
    http.get(`${ogBase}/orders/`, ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get('status') === '1') {
        return HttpResponse.json(page([]));
      }
      requestedUrls.push(request.url);

      return url.searchParams.get('page') === '2'
        ? HttpResponse.json(page([second]))
        : HttpResponse.json(page([first], `${ogBase}/orders/?place_end=${today}&page=2`));
    }),
  );

  // Drawn outside the callback: a value generated per render would re-key every query each render.
  const customerId = someCustomerId();
  const { result } = renderHook(() => useSubscriptionsData(customerId), { wrapper });

  await waitFor(() => expect(result.current.orderHistory.isSuccess).toBe(true));
  expect(requestedUrls[0]).toContain(`place_end=${today}`);
  expect(requestedUrls[0]).toContain('ordering=-place');
  expect(result.current.orderHistory.hasNextPage).toBe(true);

  result.current.orderHistory.fetchNextPage();

  await waitFor(() => expect(result.current.orderHistory.data?.pages).toHaveLength(2));
  expect(result.current.orderHistory.data?.pages.flatMap((p) => p.results)).toEqual([
    first,
    second,
  ]);
  expect(result.current.orderHistory.hasNextPage).toBe(false);
});
