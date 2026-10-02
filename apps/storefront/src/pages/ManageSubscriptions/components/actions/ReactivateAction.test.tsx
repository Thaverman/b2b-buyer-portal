import dayjs from 'dayjs';
import {
  builder,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
  waitFor,
  within,
} from 'tests/test-utils';

import { SubscriptionCard as SubscriptionCardModel } from '../../viewModel';

import ReactivateAction from './ReactivateAction';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: 'c-1',
  externalProductId: '9537_12118',
  product: { name: 'Kraft Paper Shopping Bags', imageUrl: null, detailUrl: null, sku: null },
  quantity: 1,
  every: 4,
  everyPeriod: 2,
  nextOrderDate: null,
  nextOrder: null,
  shippingAddress: null,
  shippingAddressId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  payment: null,
  paymentId: 'pay-a',
  billingAddressId: 'addr-1',
  cancelledOn: '2026-08-01 10:00:00',
}));

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
  );
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('reactivates with the old schedule from tomorrow and closes once Ordergroove has it', async () => {
  const received = vi.fn();
  server.use(
    http.patch(`${ogBase}/subscriptions/c-1/reactivate/`, async ({ request }) => {
      received(await request.json());

      return HttpResponse.json({});
    }),
  );
  const { user } = renderWithProviders(
    <ReactivateAction card={buildCardWith('WHATEVER_VALUES')} customerId={80591} />,
  );

  await user.click(screen.getByRole('button', { name: 'Reactivate' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Reactivate subscription');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivate' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(received).toHaveBeenCalledWith({
    start_date: dayjs().format('YYYY-MM-DD'),
    every: 4,
    every_period: 2,
    next_order_date: dayjs().add(1, 'day').format('YYYY-MM-DD'),
  });
});

it('holds the button while the write is in flight', async () => {
  let release: () => void = () => {};
  server.use(
    http.patch(`${ogBase}/subscriptions/c-1/reactivate/`, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });

      return HttpResponse.json({});
    }),
  );
  const { user } = renderWithProviders(
    <ReactivateAction card={buildCardWith('WHATEVER_VALUES')} customerId={80591} />,
  );

  await user.click(screen.getByRole('button', { name: 'Reactivate' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivate' }));

  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivate' }),
    ).toBeDisabled(),
  );
  // Both buttons carry the name while the dialog is open; the card's own is held too.
  const reactivateButtons = screen.getAllByRole('button', { name: 'Reactivate' });
  expect(reactivateButtons).toHaveLength(2);
  reactivateButtons.forEach((button) => expect(button).toBeDisabled());

  release();

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Reactivate' })).toBeEnabled();
});

it('closes the dialog on Cancel without writing', async () => {
  const received = vi.fn();
  server.use(
    http.patch(`${ogBase}/subscriptions/c-1/reactivate/`, async () => {
      received();

      return HttpResponse.json({});
    }),
  );
  const { user } = renderWithProviders(
    <ReactivateAction card={buildCardWith('WHATEVER_VALUES')} customerId={80591} />,
  );

  await user.click(screen.getByRole('button', { name: 'Reactivate' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(received).not.toHaveBeenCalled();
});

it('keeps the dialog open and re-enabled after a failed write', async () => {
  let release: () => void = () => {};
  server.use(
    http.patch(`${ogBase}/subscriptions/c-1/reactivate/`, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });

      return new HttpResponse(null, { status: 500 });
    }),
  );
  const { user } = renderWithProviders(
    <ReactivateAction card={buildCardWith('WHATEVER_VALUES')} customerId={80591} />,
  );

  await user.click(screen.getByRole('button', { name: 'Reactivate' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivate' }));
  // Hold the failure until the write is seen in flight, so "enabled again" can only mean settled.
  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivate' }),
    ).toBeDisabled(),
  );

  release();

  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivate' }),
    ).toBeEnabled(),
  );
  // A dialog that is closing stays in the DOM until its exit transition ends, but is not visible.
  expect(screen.getByRole('dialog')).toBeVisible();
});
