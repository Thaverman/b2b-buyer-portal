import { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, faker, renderHook } from 'tests/test-utils';

import { OrdergrooveError } from '@/shared/service/ordergroove/errors';

import { useSubscriptionsUsingInstrument } from './useSubscriptionsUsingInstrument';

// A lookup that never settles stands in for a hung auth mint or Ordergroove call.
vi.mock('@/shared/service/ordergroove', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/service/ordergroove')>()),
  getSubscriptionsUsingToken: vi.fn(() => new Promise<never>(() => {})),
}));

function Wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('gives up after five seconds so the dialog can settle instead of checking forever', async () => {
  // Fixed before rendering: a value drawn inside the callback would re-key the query every render.
  const customerId = faker.number.int({ min: 1, max: 1_000_000 });
  const { result } = renderHook(() => useSubscriptionsUsingInstrument(customerId, 'tok', true), {
    wrapper: Wrapper,
  });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(4_999);
  });
  expect(result.current.isPending).toBe(true);

  // The deadline fires at 5000; react-query then notifies subscribers through a zero-delay timer
  // of its own, so advance a little past it.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(result.current.isError).toBe(true);
  expect(result.current.error).toBeInstanceOf(OrdergrooveError);
  expect(result.current.error).toMatchObject({ kind: 'timeout' });
});
