import {
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
const launcherBase = 'https://launcher.api.influence.io/launcher/v1';
const buildLoyaltyIdentityWith = builder<LoyaltyIdentity>(() => ({
  digest: faker.string.hexadecimal({ length: 64, prefix: '' }).toLowerCase(),
  customerId: faker.number.int({ min: 1, max: 99999 }).toString(),
  email: faker.internet.email().toLowerCase(),
}));

const identity = buildLoyaltyIdentityWith('WHATEVER_VALUES');

const buildLoyaltyCustomerWith = builder<LoyaltyCustomer>(() => ({
  pointBalance: faker.number.int({ min: 0, max: 9999 }),
  currentLoyaltyTierId: faker.string.uuid(),
  currentLoyaltyTierProgress: faker.number.int({ min: 0, max: 500 }),
  createdAt: faker.date.past().toISOString(),
  followInstagram: faker.datatype.boolean(),
  followTikTok: faker.datatype.boolean(),
  followTwitter: faker.datatype.boolean(),
  likeFacebook: faker.datatype.boolean(),
  currentMembership: null,
}));

beforeEach(() => {
  // The Loyalty page is CSS-responsive only (wrapping flex + scrollable tabs) and has no
  // viewport-conditional JS yet, so this 500px mock changes nothing today. It pins the
  // repo's mobile-test convention so any future useMobile() branching gets exercised here.
  vi.spyOn(document.body, 'clientWidth', 'get').mockReturnValue(500);
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('renders the hero and scrollable tabs on a mobile viewport', async () => {
  server.use(
    http.get('http://localhost:3000/customer/current.jwt', () => HttpResponse.text('fresh-jwt')),
    http.post(`${apiBase}/loyalty/digest`, () => HttpResponse.json(identity)),
    http.get(`${launcherBase}/customer`, () =>
      HttpResponse.json(buildLoyaltyCustomerWith({ pointBalance: 2465 })),
    ),
  );

  renderWithProviders(<Loyalty />, {
    preloadedState: {
      company: buildCompanyStateWith({
        customer: { id: 123 },
        companyInfo: { companyName: 'Riverside Hardware Co.' },
      }),
    },
  });

  expect(await screen.findByText('Welcome back, Riverside Hardware Co.')).toBeInTheDocument();
  expect(await screen.findByText('You have 2,465 points available.')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Your rewards' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument();
});
