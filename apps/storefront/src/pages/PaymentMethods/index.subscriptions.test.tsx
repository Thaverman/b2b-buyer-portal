import {
  buildCompanyStateWith,
  builder,
  buildOgPaymentWith,
  buildOgProductWith,
  buildOgSubscriptionWith,
  delay,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
  waitFor,
} from 'tests/test-utils';

import { StoredInstrument } from './api';
import { hasActiveCart } from './cartPresence';
import PaymentMethods from '.';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/utils/b3Logger');

vi.mock('./hostedForm', () => ({
  createStoredCardForm: vi.fn(),
}));

vi.mock('./cartPresence', () => ({
  hasActiveCart: vi.fn(),
}));

// Guards against a real CDN script injection if a future test opens the Braintree dialog.
vi.mock('./dropin', () => ({
  createDropinWithTimeout: vi.fn(),
  DROPIN_INIT_TIMEOUT_MS: 20_000,
}));

vi.mock('./billingPrefill', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./billingPrefill')>()),
  getBillingPrefill: vi.fn(),
  getBillingCountries: vi.fn(),
}));

const { server } = startMockServer();

const apiBase = 'https://api.example.com';
const appClientId = 'ssw-app-client-id';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';
const ogBase = 'https://restapi.ordergroove.com';
const authEndpoint = `${apiBase}/products/productclient/ordergroove-auth`;

const buildStoredInstrumentWith = builder<StoredInstrument>(() => ({
  token: faker.string.hexadecimal({ length: 64, prefix: '' }).toLowerCase(),
  last4: faker.string.numeric(4),
  brand: faker.helpers.arrayElement(['VISA', 'MASTERCARD', 'AMEX']),
  expiryMonth: faker.number.int({ min: 1, max: 12 }),
  expiryYear: faker.number.int({ min: 2030, max: 2035 }),
  type: 'card',
  isDefault: false,
  source: 'bigcommerce',
}));

const page = <T,>(results: T[], next: string | null = null) => ({
  count: results.length,
  next,
  previous: null,
  results,
});

const mockJwt = () => server.use(http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')));

const mockList = (instruments: StoredInstrument[]) =>
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () =>
      HttpResponse.json({ customerId: 999, instruments }),
    ),
  );

const configureSubscriptions = () => {
  window.BC_CONTEXT = {
    paymentMethods: { apiBase, appClientId },
    subscriptions: { merchantId: 'merchant-public-id', authEndpoint, appClientId },
  };
};

const mockOgAuth = () => {
  const mints = vi.fn();
  server.use(
    http.post(authEndpoint, () => {
      mints();

      return HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 });
    }),
  );

  return mints;
};

// Every test renders a distinct customer so the module-level header cache cannot leak between tests.
const renderPage = () =>
  renderWithProviders(<PaymentMethods />, {
    preloadedState: {
      company: buildCompanyStateWith({
        customer: { id: faker.number.int({ min: 1, max: 1_000_000 }) },
      }),
    },
  });

const openDeleteDialog = async (user: ReturnType<typeof renderWithProviders>['user']) => {
  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  await screen.findByText(/will be permanently removed from your saved cards/);
};

const confirmButton = () => {
  const buttons = screen.getAllByRole('button', { name: 'Delete' });

  return buttons[buttons.length - 1];
};

beforeEach(() => {
  // Ordergroove off by default; each test that needs it calls configureSubscriptions().
  window.BC_CONTEXT = { paymentMethods: { apiBase, appClientId } };
  vi.mocked(hasActiveCart).mockResolvedValue(false);
  // The vault-token scrape hits the native page; a page without a token means "no affordance",
  // which keeps the add-card UI out of these tests entirely.
  server.use(
    http.get(
      '*/account.php',
      () =>
        new HttpResponse(
          '<script>window.stencilBootstrap("account_addpaymentmethod", "{}")</script>',
          { status: 200, headers: { 'Content-Type': 'text/html' } },
        ),
    ),
  );
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('leaves the dialog untouched and calls nothing when the host has not configured subscriptions', async () => {
  const ogRequests = vi.fn();
  const authRequests = vi.fn();

  mockJwt();
  mockList([buildStoredInstrumentWith({ brand: 'VISA', last4: '4242' })]);
  server.use(
    http.get(`${ogBase}/*`, () => {
      ogRequests();

      return HttpResponse.json(page([]));
    }),
    http.post(authEndpoint, () => {
      authRequests();

      return HttpResponse.json({ success: true, cookieValue: '80591|1|sig', expiresIn: 7200 });
    }),
  );

  const { user } = renderPage();
  await openDeleteDialog(user);

  expect(confirmButton()).toBeEnabled();
  expect(screen.queryByText('Checking your subscriptions…')).not.toBeInTheDocument();
  expect(screen.queryByText(/active subscription/)).not.toBeInTheDocument();
  expect(ogRequests).not.toHaveBeenCalled();
  expect(authRequests).not.toHaveBeenCalled();
});

it('shows no warning for a card that no subscription uses', async () => {
  const card = buildStoredInstrumentWith({ brand: 'VISA', last4: '4242' });

  configureSubscriptions();
  mockJwt();
  mockList([card]);
  mockOgAuth();
  server.use(
    http.get(`${ogBase}/payments/`, () =>
      HttpResponse.json(page([buildOgPaymentWith('WHATEVER_VALUES')])),
    ),
  );

  const { user } = renderPage();
  await openDeleteDialog(user);

  await waitFor(() => expect(confirmButton()).toBeEnabled());
  expect(screen.queryByText(/active subscription/)).not.toBeInTheDocument();
  expect(screen.queryByText('Checking your subscriptions…')).not.toBeInTheDocument();
});

it('lists the affected subscriptions across pages and disables confirm until the check resolves', async () => {
  const card = buildStoredInstrumentWith({ brand: 'VISA', last4: '1111' });
  const payment = buildOgPaymentWith({ token_id: card.token });
  const bags = Array.from({ length: 12 }, () =>
    buildOgSubscriptionWith({
      payment: payment.public_id,
      product: '9537_12118',
      frequency_days: 28,
    }),
  );
  const tissue = Array.from({ length: 2 }, () =>
    buildOgSubscriptionWith({
      payment: payment.public_id,
      product: '7674_9534',
      frequency_days: 14,
    }),
  );

  configureSubscriptions();
  mockJwt();
  mockList([card]);
  mockOgAuth();
  server.use(
    // A short delay keeps the "checking" state observable before the chain resolves.
    http.get(`${ogBase}/payments/`, async () => {
      await delay(100);

      return HttpResponse.json(page([payment]));
    }),
    http.get(`${ogBase}/subscriptions/`, ({ request }) =>
      new URL(request.url).searchParams.get('page') === '2'
        ? HttpResponse.json(page(tissue))
        : HttpResponse.json(page(bags, `${ogBase}/subscriptions/?page=2`)),
    ),
    http.get(`${ogBase}/products/9537_12118/`, () =>
      HttpResponse.json(buildOgProductWith({ name: 'Kraft Paper Shopping Bags' })),
    ),
    http.get(`${ogBase}/products/7674_9534/`, () =>
      HttpResponse.json(buildOgProductWith({ name: 'Tissue Paper' })),
    ),
  );

  const { user } = renderPage();
  await openDeleteDialog(user);

  expect(screen.getByText('Checking your subscriptions…')).toBeInTheDocument();
  expect(confirmButton()).toBeDisabled();

  expect(
    await screen.findByText('This card is used by 14 active subscriptions:'),
  ).toBeInTheDocument();
  expect(screen.getAllByText('Kraft Paper Shopping Bags — every 4 weeks')).toHaveLength(5);
  expect(screen.getByText('and 9 more')).toBeInTheDocument();
  expect(confirmButton()).toBeEnabled();
});

it('falls back to a count-only list when a product lookup fails', async () => {
  const card = buildStoredInstrumentWith('WHATEVER_VALUES');
  const payment = buildOgPaymentWith({ token_id: card.token });

  configureSubscriptions();
  mockJwt();
  mockList([card]);
  mockOgAuth();
  server.use(
    http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([payment]))),
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json(
        page([buildOgSubscriptionWith({ payment: payment.public_id, frequency_days: 10 })]),
      ),
    ),
    http.get(`${ogBase}/products/*`, () => new HttpResponse(null, { status: 500 })),
  );

  const { user } = renderPage();
  await openDeleteDialog(user);

  expect(
    await screen.findByText('This card is used by 1 active subscription:'),
  ).toBeInTheDocument();
  expect(screen.getByText('Subscription — every 10 days')).toBeInTheDocument();
});

it('discloses a failed check and still allows deletion', async () => {
  configureSubscriptions();
  mockJwt();
  mockList([buildStoredInstrumentWith('WHATEVER_VALUES')]);
  mockOgAuth();
  server.use(
    http.get(`${ogBase}/payments/`, () =>
      HttpResponse.json({ detail: 'Authentication Failed' }, { status: 403 }),
    ),
  );

  const { user } = renderPage();
  await openDeleteDialog(user);

  expect(
    await screen.findByText("We couldn't check whether any subscriptions use this card."),
  ).toBeInTheDocument();
  expect(confirmButton()).toBeEnabled();
});

it('discloses when the signature cannot be minted', async () => {
  configureSubscriptions();
  mockJwt();
  mockList([buildStoredInstrumentWith('WHATEVER_VALUES')]);
  server.use(http.post(authEndpoint, () => new HttpResponse(null, { status: 500 })));

  const { user } = renderPage();
  await openDeleteDialog(user);

  expect(
    await screen.findByText("We couldn't check whether any subscriptions use this card."),
  ).toBeInTheDocument();
  expect(confirmButton()).toBeEnabled();
});

it('mints the signature once across two dialog opens', async () => {
  configureSubscriptions();
  mockJwt();
  mockList([buildStoredInstrumentWith('WHATEVER_VALUES')]);
  const mints = mockOgAuth();
  server.use(http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([]))));

  const { user } = renderPage();
  await openDeleteDialog(user);
  await waitFor(() => expect(confirmButton()).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Cancel' }));

  await openDeleteDialog(user);
  await waitFor(() => expect(confirmButton()).toBeEnabled());

  expect(mints).toHaveBeenCalledTimes(1);
});

it('navigates to the subscriptions page from the warning', async () => {
  const card = buildStoredInstrumentWith('WHATEVER_VALUES');
  const payment = buildOgPaymentWith({ token_id: card.token });

  configureSubscriptions();
  mockJwt();
  mockList([card]);
  mockOgAuth();
  server.use(
    http.get(`${ogBase}/payments/`, () => HttpResponse.json(page([payment]))),
    http.get(`${ogBase}/subscriptions/`, () =>
      HttpResponse.json(page([buildOgSubscriptionWith({ payment: payment.public_id })])),
    ),
    http.get(`${ogBase}/products/*`, () =>
      HttpResponse.json(buildOgProductWith('WHATEVER_VALUES')),
    ),
  );

  const { user, navigation } = renderPage();
  await openDeleteDialog(user);

  await user.click(await screen.findByRole('button', { name: 'Manage subscriptions' }));

  await waitFor(() => expect(navigation).toHaveBeenCalledWith('/manage-subscriptions'));
});
