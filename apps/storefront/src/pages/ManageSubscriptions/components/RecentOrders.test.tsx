import { ComponentProps, createElement } from 'react';
import {
  builder,
  buildStoreInfoStateWith,
  faker,
  renderWithProviders,
  screen,
} from 'tests/test-utils';

import { currencyFormat } from '@/utils/b3CurrencyFormat';

import { RecentOrder } from '../viewModel';

import RecentOrders from './RecentOrders';

const buildRecentOrderWith = builder<RecentOrder>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  placedOn: '2026-09-05',
  webOrderNumber: 'A1B2C',
  orderDetailPath: '/orderDetail/253011',
  total: '81.50',
  currencyCode: 'USD',
  outcome: 'success',
  message: null,
}));

type Props = ComponentProps<typeof RecentOrders>;

// createElement with a merged props object: the project does not add JSX prop spreading.
const renderOrders = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    orders: [],
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    onShowMore: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };

  return {
    ...renderWithProviders(createElement(RecentOrders, props), {
      // The store's date display format is blank by default; "2026-09-05" renders as "5 Sep 2026".
      preloadedState: { storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } }) },
    }),
    props,
  };
};

it('lists each order with its date, web order link, total and outcome', () => {
  renderOrders({
    orders: [
      buildRecentOrderWith({
        placedOn: '2026-09-05',
        webOrderNumber: 'A1B2C',
        orderDetailPath: '/orderDetail/253011',
        total: '81.50',
        outcome: 'success',
      }),
      buildRecentOrderWith({
        placedOn: '2026-08-08',
        webOrderNumber: null,
        orderDetailPath: null,
        outcome: 'failed',
        message: 'Card declined',
      }),
      buildRecentOrderWith({
        outcome: 'cancelled',
        placedOn: '2026-07-11',
        webOrderNumber: 'C3D4E',
        orderDetailPath: '/orderDetail/253012',
      }),
      buildRecentOrderWith({
        outcome: 'processing',
        placedOn: '2026-06-02',
        webOrderNumber: 'D5E6F',
        orderDetailPath: '/orderDetail/253013',
      }),
    ],
  });

  expect(screen.getByRole('heading', { name: 'Recent subscription orders' })).toBeInTheDocument();
  expect(screen.getByText('5 Sep 2026')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Order A1B2C' })).toHaveAttribute(
    'href',
    '/orderDetail/253011',
  );
  expect(screen.getAllByText(currencyFormat('81.50'))).toHaveLength(4);
  expect(screen.getByText('Placed')).toBeInTheDocument();
  expect(screen.getByText('Failed')).toBeInTheDocument();
  expect(screen.getByText('Card declined')).toBeInTheDocument();
  expect(screen.getByText('Cancelled')).toBeInTheDocument();
  expect(screen.getByText('Processing')).toBeInTheDocument();
  // the failed order never placed in BigCommerce, so it has no web order number
  expect(screen.getByText('—')).toBeInTheDocument();
});

it('says so when there are no orders, and stays quiet while loading', () => {
  renderOrders();
  expect(screen.getByText('No subscription orders yet.')).toBeInTheDocument();

  renderOrders({ isPending: true });
  expect(screen.getAllByText('No subscription orders yet.')).toHaveLength(1);
});

it('offers a retry when the history failed to load', async () => {
  const { user, props } = renderOrders({ isError: true });

  expect(screen.getByText("We couldn't load your orders.")).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Try again' }));

  expect(props.onRetry).toHaveBeenCalledTimes(1);
});

it('shows more only while another page exists', async () => {
  const { user, props } = renderOrders({
    orders: [buildRecentOrderWith('WHATEVER_VALUES')],
    hasNextPage: true,
  });

  await user.click(screen.getByRole('button', { name: 'Show more' }));
  expect(props.onShowMore).toHaveBeenCalledTimes(1);

  renderOrders({ orders: [buildRecentOrderWith('WHATEVER_VALUES')], hasNextPage: false });
  expect(screen.getAllByRole('button', { name: 'Show more' })).toHaveLength(1);
});

it('disables show more while the next page is loading', () => {
  renderOrders({
    orders: [buildRecentOrderWith('WHATEVER_VALUES')],
    hasNextPage: true,
    isFetchingNextPage: true,
  });

  expect(screen.getByRole('button', { name: 'Show more' })).toBeDisabled();
});
