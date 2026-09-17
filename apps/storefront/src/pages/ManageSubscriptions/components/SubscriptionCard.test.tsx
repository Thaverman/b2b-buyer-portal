import {
  builder,
  buildStoreInfoStateWith,
  faker,
  renderWithProviders,
  screen,
  within,
} from 'tests/test-utils';

import { SubscriptionCard as SubscriptionCardModel } from '../viewModel';

import SubscriptionCard from './SubscriptionCard';

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  externalProductId: '9537_12118',
  product: {
    name: faker.commerce.productName(),
    imageUrl: faker.image.url(),
    detailUrl: faker.internet.url(),
    sku: faker.string.numeric(4),
  },
  quantity: faker.number.int({ min: 1, max: 9 }),
  frequencyDays: 28,
  every: 4,
  everyPeriod: 2,
  nextOrderDate: '2026-10-03',
  nextOrder: null,
  shippingAddressId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  shippingAddress: {
    name: 'Jane Doe',
    company: 'Acme Co',
    line1: '1 Main St',
    line2: null,
    locality: 'Springfield, IL 62701',
  },
  payment: { brand: 'Visa', last4: '1111', expiry: '3/2028' },
  cancelledOn: null,
}));

const settled = { product: false, shipping: false, payment: false, nextOrder: false };
const pending = { product: true, shipping: true, payment: true, nextOrder: true };
// The store's date display format is blank by default; dates below render as "3 Oct 2026".
const withDateFormat = {
  preloadedState: { storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } }) },
};

it('renders every field of a loaded active card', () => {
  const card = buildCardWith({
    product: {
      name: 'Kraft Paper Shopping Bags',
      imageUrl: 'https://cdn.example.com/bags.png',
      detailUrl: 'https://store.example.com/bags',
      sku: '9537',
    },
    quantity: 2,
    frequencyDays: 28,
  });

  renderWithProviders(
    <SubscriptionCard card={card} variant="active" loading={settled} />,
    withDateFormat,
  );

  expect(screen.getByText('Kraft Paper Shopping Bags')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Kraft Paper Shopping Bags' })).toHaveAttribute(
    'src',
    'https://cdn.example.com/bags.png',
  );
  expect(screen.getByText(/SKU 9537/)).toBeInTheDocument();
  const productLink = screen.getByRole('link', { name: 'View product' });
  expect(productLink).toHaveAttribute('href', 'https://store.example.com/bags');
  expect(productLink).toHaveAttribute('target', '_top');
  expect(screen.getByText('Qty 2 · every 4 weeks')).toBeInTheDocument();
  expect(
    screen.getByText('Ships to Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701'),
  ).toBeInTheDocument();
  expect(screen.getByText('Paid with Visa ending in 1111 · exp 3/2028')).toBeInTheDocument();
  expect(screen.getByText('Next order 3 Oct 2026')).toBeInTheDocument();
  // Desktop: the schedule is its own column, outside the details group (the mobile test checks the inverse).
  expect(
    within(screen.getByRole('group', { name: 'Kraft Paper Shopping Bags' })).queryByText(
      /Next order/,
    ),
  ).not.toBeInTheDocument();
});

it('renders the calendar date the store sent, whatever the store timezone offset', () => {
  // SSW's offset is US Central (-21600). A next-order date is a calendar day, not an instant:
  // shifting it by the store offset renders the day before (observed live 2026-09-17).
  const card = buildCardWith({ nextOrderDate: '2026-11-20' });

  renderWithProviders(<SubscriptionCard card={card} variant="active" loading={settled} />, {
    preloadedState: {
      storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'M jS Y', offset: -21600 } }),
    },
  });

  expect(screen.getByText('Next order Nov 20th 2026')).toBeInTheDocument();
});

it('shows neither values nor fallbacks while the lookups are still loading', () => {
  const card = buildCardWith({
    product: null,
    shippingAddress: null,
    payment: null,
    nextOrderDate: null,
  });

  renderWithProviders(<SubscriptionCard card={card} variant="active" loading={pending} />);

  expect(screen.getByText('Ships to')).toBeInTheDocument();
  expect(screen.getByText('Paid with')).toBeInTheDocument();
  expect(screen.queryByText('Product 9537_12118')).not.toBeInTheDocument();
  expect(screen.queryByText(/Unavailable/)).not.toBeInTheDocument();
  expect(screen.queryByText('No upcoming order')).not.toBeInTheDocument();
});

it('falls back cell by cell once the lookups settled without a record', () => {
  const card = buildCardWith({
    product: null,
    shippingAddress: null,
    payment: null,
    nextOrderDate: null,
  });

  renderWithProviders(<SubscriptionCard card={card} variant="active" loading={settled} />);

  expect(screen.getByText('Product 9537_12118')).toBeInTheDocument();
  expect(screen.getByText('Ships to Unavailable')).toBeInTheDocument();
  expect(screen.getByText('Paid with Unavailable')).toBeInTheDocument();
  expect(screen.getByText('No upcoming order')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

it('describes an unbranded card and a daily frequency', () => {
  const card = buildCardWith({
    payment: { brand: null, last4: '4242', expiry: '12/2027' },
    frequencyDays: 10,
    quantity: 1,
  });

  renderWithProviders(<SubscriptionCard card={card} variant="active" loading={settled} />);

  expect(screen.getByText('Paid with Card ending in 4242 · exp 12/2027')).toBeInTheDocument();
  expect(screen.getByText('Qty 1 · every 10 days')).toBeInTheDocument();
});

it('shows the cancellation instead of a next order on a cancelled card', () => {
  const dated = buildCardWith({ cancelledOn: '2026-08-01 10:00:00', nextOrderDate: null });
  const undated = buildCardWith({ cancelledOn: null, nextOrderDate: null });

  renderWithProviders(
    <>
      <SubscriptionCard card={dated} variant="cancelled" loading={settled} />
      <SubscriptionCard card={undated} variant="cancelled" loading={settled} />
    </>,
    withDateFormat,
  );

  expect(screen.getByText('Cancelled on 1 Aug 2026')).toBeInTheDocument();
  expect(screen.getByText('Cancelled')).toBeInTheDocument();
  expect(screen.queryByText('No upcoming order')).not.toBeInTheDocument();
});
