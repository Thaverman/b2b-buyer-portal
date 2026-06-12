import {
  buildB2BFeaturesStateWith,
  builder,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
} from 'tests/test-utils';

import { StoredInstrument } from './api';
import PaymentMethods from '.';

vi.mock('@/utils/b3Logger');

const { server } = startMockServer();

const apiBase = 'https://api.example.com';
const appClientId = 'ssw-app-client-id';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const buildStoredInstrumentWith = builder<StoredInstrument>(() => ({
  token: faker.string.uuid(),
  last4: faker.string.numeric(4),
  brand: faker.helpers.arrayElement(['VISA', 'MASTERCARD', 'AMEX']),
  expiryMonth: faker.number.int({ min: 1, max: 12 }),
  expiryYear: faker.number.int({ min: 2030, max: 2035 }),
  type: 'card',
  isDefault: false,
}));

const mockJwt = () => server.use(http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')));

const mockList = (instruments: StoredInstrument[]) =>
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () =>
      HttpResponse.json({ customerId: 999, instruments }),
    ),
  );

beforeEach(() => {
  window.BC_CONTEXT = { paymentMethods: { apiBase, appClientId } };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('renders a saved card with brand, last4, expiry and default chip', async () => {
  mockJwt();
  mockList([
    buildStoredInstrumentWith({
      brand: 'VISA',
      last4: '4242',
      expiryMonth: 12,
      expiryYear: 2030,
      isDefault: true,
    }),
  ]);

  renderWithProviders(<PaymentMethods />);

  expect(await screen.findByText('VISA •••• 4242')).toBeInTheDocument();
  expect(screen.getByText('Expires 12/2030')).toBeInTheDocument();
  expect(screen.getByText('Default')).toBeInTheDocument();
  expect(screen.queryByText('Expired')).not.toBeInTheDocument();
});

it('marks a card whose expiry is in the past as expired', async () => {
  mockJwt();
  mockList([buildStoredInstrumentWith({ expiryMonth: 1, expiryYear: 2020 })]);

  renderWithProviders(<PaymentMethods />);

  expect(await screen.findByText('Expired')).toBeInTheDocument();
});

it('shows the empty state when the customer has no saved cards', async () => {
  mockJwt();
  mockList([]);

  renderWithProviders(<PaymentMethods />);

  expect(
    await screen.findByText('You have no saved cards. Cards can be saved during checkout.'),
  ).toBeInTheDocument();
});

it('shows the session-expired state when the jwt fetch fails', async () => {
  server.use(http.get(currentJwtUrl, () => HttpResponse.text('{"errors":[]}', { status: 401 })));

  renderWithProviders(<PaymentMethods />);

  expect(
    await screen.findByText('Your session has expired — please sign in again.'),
  ).toBeInTheDocument();
});

it('shows the load error with a working retry button', async () => {
  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () =>
      HttpResponse.json({ error: 'upstream_unavailable' }, { status: 502 }),
    ),
  );

  const { user } = renderWithProviders(<PaymentMethods />);

  expect(await screen.findByText("We couldn't load your saved cards.")).toBeInTheDocument();

  mockList([buildStoredInstrumentWith({ brand: 'AMEX', last4: '0005' })]);

  await user.click(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByText('AMEX •••• 0005')).toBeInTheDocument();
});

it('shows the unavailable state when BC_CONTEXT is not configured', () => {
  delete window.BC_CONTEXT;

  renderWithProviders(<PaymentMethods />);

  expect(screen.getByText('Payment methods are not available.')).toBeInTheDocument();
});

it('shows the unavailable state while a sales rep is masquerading', () => {
  renderWithProviders(<PaymentMethods />, {
    preloadedState: {
      b2bFeatures: buildB2BFeaturesStateWith({ masqueradeCompany: { isAgenting: true } }),
    },
  });

  expect(screen.getByText('Payment methods are not available.')).toBeInTheDocument();
});
