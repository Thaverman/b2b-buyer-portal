import {
  builder,
  buildOgAddressWith,
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

import { OgAddress } from '@/shared/service/ordergroove';

import { SubscriptionCard as SubscriptionCardModel } from '../../viewModel';

import ActiveSubscriptionCard from './ActiveSubscriptionCard';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const { server } = startMockServer();

const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const homeId = faker.string.hexadecimal({ length: 32, prefix: '' });

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: 's-1',
  externalProductId: '9537_12118',
  product: { name: 'Kraft Paper Shopping Bags', imageUrl: null, detailUrl: null, sku: null },
  quantity: 2,
  every: 4,
  everyPeriod: 2,
  nextOrderDate: '2026-10-03',
  nextOrder: { orderId: 'o-1', otherProducts: [] },
  shippingAddress: {
    name: 'Jane Doe',
    company: 'Acme Co',
    line1: '1 Main St',
    line2: null,
    locality: 'Springfield, IL 62701',
  },
  shippingAddressId: homeId,
  payment: null,
  paymentId: 'pay-a',
  billingAddressId: 'addr-1',
  cancelledOn: null,
}));

const settled = { product: false, shipping: false, payment: false, nextOrder: false };
const home = buildOgAddressWith({
  public_id: homeId,
  first_name: 'Jane',
  last_name: 'Doe',
  company_name: 'Acme Co',
  address: '1 Main St',
  address2: null,
  city: 'Springfield',
  state_province_code: 'IL',
  zip_postal_code: '62701',
});
const office = buildOgAddressWith({
  first_name: 'Jane',
  last_name: 'Doe',
  company_name: null,
  address: '2 Oak Ave',
  address2: null,
  city: 'Springfield',
  state_province_code: 'IL',
  zip_postal_code: '62702',
});

// `null` stands for a lookup that has not loaded: an explicit `undefined` would take the default.
const renderCard = (card: SubscriptionCardModel, addresses: OgAddress[] | null = [home, office]) =>
  renderWithProviders(
    <ActiveSubscriptionCard
      card={card}
      loading={settled}
      customerId={80591}
      addresses={addresses ?? undefined}
    />,
    {
      preloadedState: { storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } }) },
    },
  );

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
      HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
    ),
  );
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

// One dialog per case: opening and closing MUI dialogs costs real time, and a case that cycles
// through all of them crosses the 5 s per-test limit whenever the suite runs under load.
it.each([
  ['Skip', 'Skip next order'],
  ['Send now', 'Send order now'],
  ['Change date', 'Change next order date'],
  ['Change card', 'Change card'],
  ['Cancel subscription', 'Cancel subscription'],
  ['Change', 'Change shipping address'],
])('opens only the %s dialog', async (button, title) => {
  const { user } = renderCard(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('button', { name: button }));

  expect(screen.getByRole('dialog')).toHaveTextContent(title);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

it('hides the three order actions, and nothing else, when no order is scheduled', () => {
  renderCard(buildCardWith({ nextOrder: null, nextOrderDate: null }));

  expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Send now' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Change date' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Change card' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel subscription' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /^Quantity/ })).toBeInTheDocument();
});

// Spec §6.4: only Skip, Send now and Change date need the scheduled order.
it.each([
  ['Change card', 'Change card'],
  ['Cancel subscription', 'Cancel subscription'],
  ['Change', 'Change shipping address'],
])('opens the %s dialog although no order is scheduled', async (button, title) => {
  const { user } = renderCard(buildCardWith({ nextOrder: null, nextOrderDate: null }));

  await user.click(screen.getByRole('button', { name: button }));

  expect(screen.getByRole('dialog')).toHaveTextContent(title);
});

it('closes the dialog again on Cancel', async () => {
  const { user } = renderCard(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('button', { name: 'Skip' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('offers no address change until the addresses have loaded', () => {
  const { result } = renderCard(buildCardWith('WHATEVER_VALUES'), null);

  expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();

  result.rerender(
    <ActiveSubscriptionCard
      card={buildCardWith('WHATEVER_VALUES')}
      loading={settled}
      customerId={80591}
      addresses={[home, office]}
    />,
  );

  expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
});

it('offers the deduplicated addresses with the current one preselected', async () => {
  const { user } = renderCard(buildCardWith('WHATEVER_VALUES'), [
    home,
    office,
    buildOgAddressWith({
      ...office,
      public_id: faker.string.hexadecimal({ length: 32, prefix: '' }),
    }),
  ]);

  await user.click(screen.getByRole('button', { name: 'Change' }));

  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getAllByRole('radio')).toHaveLength(2);
  expect(
    dialog.getByRole('radio', { name: 'Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701' }),
  ).toBeChecked();
});

it('moves from the cancel dialog to the skip dialog', async () => {
  const { user } = renderCard(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Skip next order' }),
  );

  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Skip next order'));
  expect(screen.getByRole('dialog')).not.toHaveTextContent('Tell us why');
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

it('saves a quantity straight from the select and holds every control meanwhile', async () => {
  let release: () => void = () => {};
  const received = vi.fn();
  server.use(
    http.patch(`${ogBase}/subscriptions/s-1/change_quantity/`, async ({ request }) => {
      received(await request.json());
      await new Promise<void>((resolve) => {
        release = resolve;
      });

      return HttpResponse.json({});
    }),
  );
  const { user } = renderCard(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('combobox', { name: /^Quantity/ }));
  await user.click(screen.getByRole('option', { name: '3' }));

  await waitFor(() => expect(received).toHaveBeenCalledWith({ quantity: 3 }));
  expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel subscription' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Change' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: /^Frequency/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  expect(screen.getByRole('progressbar')).toBeInTheDocument();

  release();

  await waitFor(() => expect(screen.getByRole('button', { name: 'Skip' })).toBeEnabled());
  // The select never moved on its own: the card still says 2 until the refetched card says otherwise.
  expect(screen.getByRole('combobox', { name: /^Quantity/ })).toHaveTextContent('2');
});

it('saves a frequency straight from the select, with its period', async () => {
  const received = vi.fn();
  server.use(
    http.patch(`${ogBase}/subscriptions/s-1/change_frequency/`, async ({ request }) => {
      received(await request.json());

      return HttpResponse.json({});
    }),
  );
  const { user } = renderCard(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('combobox', { name: /^Frequency/ }));
  await user.click(screen.getByRole('option', { name: 'every 6 days' }));

  await waitFor(() => expect(received).toHaveBeenCalledWith({ every: 6, every_period: 1 }));
});

it('moves the subscription to the chosen address and closes the dialog', async () => {
  let release: () => void = () => {};
  const received = vi.fn();
  server.use(
    http.patch(`${ogBase}/subscriptions/s-1/change_shipping/`, async ({ request }) => {
      received(await request.json());
      await new Promise<void>((resolve) => {
        release = resolve;
      });

      return HttpResponse.json({});
    }),
  );
  const { user } = renderCard(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('button', { name: 'Change' }));
  const dialog = within(screen.getByRole('dialog'));
  await user.click(
    dialog.getByRole('radio', { name: 'Jane Doe, 2 Oak Ave, Springfield, IL 62702' }),
  );
  await user.click(dialog.getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(received).toHaveBeenCalledWith({ shipping_address: office.public_id }),
  );
  // The address write holds the card like every other write.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled());

  release();

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('holds every control while a dialog write is in flight, then closes the dialog on success', async () => {
  let release: () => void = () => {};
  server.use(
    http.patch(`${ogBase}/orders/o-1/skip_subscription/`, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });

      return HttpResponse.json({});
    }),
  );
  const { user } = renderCard(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('button', { name: 'Skip' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Skip' }));

  await waitFor(() => expect(screen.getByRole('button', { name: 'Send now' })).toBeDisabled());
  expect(screen.getByRole('button', { name: 'Change date' })).toBeDisabled();
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Skip' })).toBeDisabled();

  release();

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Send now' })).toBeEnabled();
});

it('keeps a dialog open after a failed write so the customer can retry or leave', async () => {
  server.use(
    http.patch(
      `${ogBase}/subscriptions/s-1/cancel/`,
      () => new HttpResponse(null, { status: 500 }),
    ),
  );
  const { user } = renderCard(buildCardWith('WHATEVER_VALUES'));

  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel subscription' }),
  );

  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel subscription' }),
    ).toBeEnabled(),
  );
  // A dialog that is closing stays in the DOM until its exit transition ends, but is not visible.
  expect(screen.getByRole('dialog')).toBeVisible();
});
