import {
  builder,
  buildStoreInfoStateWith,
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

import SubscriptionActions from './SubscriptionActions';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  externalProductId: '9537_12118',
  product: { name: 'Kraft Paper Shopping Bags', imageUrl: null, detailUrl: null, sku: null },
  quantity: 1,
  frequencyDays: 28,
  every: 4,
  everyPeriod: 2,
  nextOrderDate: '2026-10-03',
  nextOrder: { orderId: 'o-1', otherProducts: [] },
  shippingAddress: null,
  shippingAddressId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  payment: null,
  cancelledOn: null,
}));

const renderRow = (card: SubscriptionCardModel) =>
  renderWithProviders(<SubscriptionActions card={card} customerId={80591} />, {
    preloadedState: { storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } }) },
  });

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

it('renders nothing for a card with no upcoming order', () => {
  renderRow(buildCardWith({ nextOrder: null, nextOrderDate: null }));

  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('opens one dialog per button and closes it again', async () => {
  const { user } = renderRow(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('button', { name: 'Skip' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Skip next order');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  await user.click(screen.getByRole('button', { name: 'Send now' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Send order now');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  await user.click(screen.getByRole('button', { name: 'Change date' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Change next order date');
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

it('disables every action while a write is in flight, then closes the dialog on success', async () => {
  let release: () => void = () => {};
  server.use(
    http.patch(`${ogBase}/orders/o-1/skip_subscription/`, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });

      return HttpResponse.json({});
    }),
  );
  const { user } = renderRow(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('button', { name: 'Skip' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Skip' }));

  await waitFor(() => expect(screen.getByRole('button', { name: 'Send now' })).toBeDisabled());
  expect(screen.getByRole('button', { name: 'Change date' })).toBeDisabled();
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Skip' })).toBeDisabled();

  release();

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Send now' })).toBeEnabled();
});

it('keeps the dialog open after a failed write so the customer can retry or leave', async () => {
  server.use(
    http.patch(`${ogBase}/orders/o-1/send_now/`, () => new HttpResponse(null, { status: 500 })),
  );
  const { user } = renderRow(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('button', { name: 'Send now' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send now' }));

  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Send now' }),
    ).toBeEnabled(),
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
