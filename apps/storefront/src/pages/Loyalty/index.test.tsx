import {
  buildB2BFeaturesStateWith,
  buildCompanyStateWith,
  builder,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
} from 'tests/test-utils';

import { LoyaltyCustomer, LoyaltyIdentity } from './api';
import Loyalty from '.';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/utils/b3Logger');

const { server } = startMockServer();

const shopKey = 'store-key';
const apiBase = 'https://ssw.example.com/customers';
const appClientId = 'ssw-app-client-id';

beforeEach(() => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('shows the unavailable state when BC_CONTEXT is not configured', () => {
  delete window.BC_CONTEXT;

  renderWithProviders(<Loyalty />);

  expect(screen.getByText('Rewards are not available.')).toBeInTheDocument();
});

it('shows the unavailable state when the loyalty config is incomplete', () => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId: '' } };

  renderWithProviders(<Loyalty />);

  expect(screen.getByText('Rewards are not available.')).toBeInTheDocument();
});

it('shows the unavailable state while a sales rep is masquerading', () => {
  renderWithProviders(<Loyalty />, {
    preloadedState: {
      b2bFeatures: buildB2BFeaturesStateWith({ masqueradeCompany: { isAgenting: true } }),
    },
  });

  expect(screen.getByText('Rewards are not available.')).toBeInTheDocument();
});

const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';
const digestUrl = `${apiBase}/loyalty/digest`;
const launcherBase = 'https://launcher.api.influence.io/launcher/v1';

const buildLoyaltyIdentityWith = builder<LoyaltyIdentity>(() => ({
  digest: faker.string.hexadecimal({ length: 64, prefix: '' }).toLowerCase(),
  customerId: faker.number.int({ min: 1, max: 99999 }).toString(),
  email: faker.internet.email().toLowerCase(),
}));

const identity = buildLoyaltyIdentityWith({});

const buildLoyaltyCustomerWith = builder<LoyaltyCustomer>(() => ({
  pointBalance: faker.number.int({ min: 0, max: 9999 }),
  currentLoyaltyTierId: faker.string.uuid(),
  currentLoyaltyTierProgress: faker.number.int({ min: 0, max: 500 }),
  createdAt: faker.date.past().toISOString(),
  followInstagram: faker.datatype.boolean(),
  followTikTok: faker.datatype.boolean(),
  followTwitter: faker.datatype.boolean(),
  likeFacebook: faker.datatype.boolean(),
}));

const mockJwt = () => server.use(http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')));

const mockDigest = () => server.use(http.post(digestUrl, () => HttpResponse.json(identity)));

const mockCustomer = (customer: LoyaltyCustomer) =>
  server.use(http.get(`${launcherBase}/customer`, () => HttpResponse.json(customer)));

const mockLoyaltyApis = (customer: LoyaltyCustomer) => {
  mockJwt();
  mockDigest();
  mockCustomer(customer);
};

it('renders the hero with company name, member-since, and points balance', async () => {
  mockLoyaltyApis(
    buildLoyaltyCustomerWith({ pointBalance: 2465, createdAt: '2026-01-15T00:00:00.000Z' }),
  );

  renderWithProviders(<Loyalty />, {
    preloadedState: {
      company: buildCompanyStateWith({
        customer: { id: 123 },
        companyInfo: { companyName: 'Riverside Hardware Co.' },
      }),
    },
  });

  expect(await screen.findByText('Riverside Hardware Co.')).toBeInTheDocument();
  expect(await screen.findByText('Member since Jan 2026')).toBeInTheDocument();
  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
});

it('shows the session-expired state when the jwt fetch fails', async () => {
  server.use(http.get(currentJwtUrl, () => HttpResponse.text('{"errors":[]}', { status: 401 })));

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByText('Your session has expired — please sign in again.'),
  ).toBeInTheDocument();
});

it('shows a generic error without a re-login prompt when the Launcher API rejects the digest', async () => {
  mockJwt();
  mockDigest();
  server.use(http.get(`${launcherBase}/customer`, () => HttpResponse.json({}, { status: 401 })));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText("We couldn't load your rewards.")).toBeInTheDocument();
  expect(
    screen.queryByText('Your session has expired — please sign in again.'),
  ).not.toBeInTheDocument();
});

it('shows the not-enrolled invite when the customer is unknown to Influence.io', async () => {
  mockJwt();
  mockDigest();
  server.use(http.get(`${launcherBase}/customer`, () => HttpResponse.json({}, { status: 404 })));

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByText('Start earning points with your first order.'),
  ).toBeInTheDocument();
});

it('recovers from a load error via the retry button', async () => {
  mockJwt();
  mockDigest();
  server.use(http.get(`${launcherBase}/customer`, () => HttpResponse.json({}, { status: 502 })));

  const { user } = renderWithProviders(<Loyalty />);

  expect(await screen.findByText("We couldn't load your rewards.")).toBeInTheDocument();

  mockCustomer(buildLoyaltyCustomerWith({ pointBalance: 100 }));

  await user.click(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByText('You have 100 points')).toBeInTheDocument();
});
