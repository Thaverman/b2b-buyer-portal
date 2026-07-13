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
  waitFor,
  within,
} from 'tests/test-utils';

import { snackbar } from '@/utils/b3Tip';

import {
  EarnedReward,
  EarnRule,
  LoyaltyCustomer,
  LoyaltyIdentity,
  LoyaltyTier,
  PointActivity,
  RedeemRule,
} from './api';
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
  delete window.loyaltyShippingConfig;
  delete window.getLoyaltyShippingCalculation;
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

const buildTierWith = builder<LoyaltyTier>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productAdjective(),
  threshold: String(faker.number.int({ min: 0, max: 1000 })),
  perks: [faker.company.catchPhrase()],
}));

const mockTiers = (tiers: LoyaltyTier[]) =>
  server.use(http.get(`${launcherBase}/shop/tiers`, () => HttpResponse.json({ rules: tiers })));

const buildEarnRuleWith = builder<EarnRule>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productName(),
  summary: faker.company.catchPhrase(),
  earnType: 'custom',
  templateName: 'custom',
  socialUrl: '',
  earnValue: 0,
  limitTiers: false,
  loyaltyTierIds: [],
}));

const mockEarnRules = (rules: EarnRule[]) =>
  server.use(
    http.get(`${launcherBase}/shop/rules/earn`, () =>
      HttpResponse.json({
        rules: rules.map(({ title, ...rest }) => ({ ...rest, customTitle: title })),
      }),
    ),
  );

const buildRedeemRuleWith = builder<RedeemRule>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productName(),
  pointCost: faker.number.int({ min: 100, max: 1000 }),
  redeemType: faker.helpers.arrayElement(['freeshipping', 'fixedamountdiscount', 'percentageoff']),
  status: 'active',
  minRedeemablePoints: null,
  maxRedeemablePoints: null,
}));

const mockRedeemRules = (rules: RedeemRule[]) =>
  server.use(http.get(`${launcherBase}/shop/rules/redeem`, () => HttpResponse.json({ rules })));

const buildEarnedRewardWith = builder<EarnedReward>(() => ({
  id: faker.string.uuid(),
  couponCode: faker.string.alphanumeric(8).toUpperCase(),
  title: faker.commerce.productName(),
  createdAt: faker.date.past().toISOString(),
}));

const buildPointActivityWith = builder<PointActivity>(() => ({
  id: faker.string.uuid(),
  action: faker.helpers.arrayElement(['earned', 'redeemed']),
  status: 'approved',
  points: faker.number.int({ min: -500, max: 500 }),
  createdAt: faker.date.past().toISOString(),
  customDescription: faker.company.catchPhrase(),
}));

type RawShippingCalculation = Awaited<
  ReturnType<NonNullable<Window['getLoyaltyShippingCalculation']>>
>;

const buildRawShippingCalculationWith = builder<RawShippingCalculation>(() => ({
  qualifies: faker.datatype.boolean(),
  threshold: faker.number.int({ min: 100, max: 999 }),
  eligibleSubtotal: faker.number.float({ min: 0, max: 999, fractionDigits: 2 }),
  remaining: faker.number.float({ min: 0, max: 999, fractionDigits: 2 }),
  excludedByProduct: [],
  excludedByCategory: [],
  ltlItems: [],
}));

const mockShippingTracker = (
  result: RawShippingCalculation | Error,
  config = { threshold: 300, excludedProductIds: '', excludedCategoryIds: '' },
) => {
  window.loyaltyShippingConfig = config;
  window.getLoyaltyShippingCalculation = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
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

it('renders the five tabs with mockup labels and defaults to Your rewards', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByRole('tab', { name: 'Your rewards', selected: true }),
  ).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Earn points' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Rewards' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Tiers' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument();
});

it('selects the tab named by the URL search param', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=history' }] });

  expect(await screen.findByRole('tab', { name: 'History', selected: true })).toBeInTheDocument();
});

it('falls back to Your rewards for an unknown tab param', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=bogus' }] });

  expect(
    await screen.findByRole('tab', { name: 'Your rewards', selected: true }),
  ).toBeInTheDocument();
});

it('switches tabs on click', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Tiers' }));

  expect(screen.getByRole('tab', { name: 'Tiers', selected: true })).toBeInTheDocument();
});

it('renders the tier list with the current tier highlighted and its title in the hero', async () => {
  const select = buildTierWith({ id: 't1', title: 'Select', threshold: '0' });
  const elite = buildTierWith({ id: 't2', title: 'Elite', threshold: '300' });

  mockLoyaltyApis(
    buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1', currentLoyaltyTierProgress: 240 }),
  );
  mockTiers([select, elite]);

  const { user } = renderWithProviders(<Loyalty />);

  // hero shows the resolved tier title
  expect(await screen.findByText('Current tier')).toBeInTheDocument();
  expect(await screen.findByText('Select')).toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: 'Tiers' }));

  const currentCard = (await screen.findByText('Current tier: Select')).closest(
    '.MuiCard-root',
  ) as HTMLElement;
  expect(within(currentCard).getByText(select.perks[0])).toBeInTheDocument();
  expect(screen.getByText('Elite')).toBeInTheDocument();
  // progress toward Elite: 240 of 300
  expect(screen.getByText('240 / 300')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
});

it('hides the tier progress bar when a threshold is not numeric', async () => {
  mockLoyaltyApis(
    buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1', currentLoyaltyTierProgress: 240 }),
  );
  mockTiers([
    buildTierWith({ id: 't1', title: 'Select', threshold: '0' }),
    buildTierWith({ id: 't2', title: 'Elite', threshold: 'Gold Status' }),
  ]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Tiers' }));

  // wait for the tier list to render, then confirm no progress bar was attempted
  expect(await screen.findByText('Current tier: Select')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

it('shows the current tier benefits and points summary on the Your rewards tab', async () => {
  const select = buildTierWith({
    id: 't1',
    title: 'Select',
    threshold: '0',
    perks: ['5% credit on every order', 'Free ground shipping over $300'],
  });

  mockLoyaltyApis(
    buildLoyaltyCustomerWith({
      pointBalance: 2465,
      currentLoyaltyTierId: 't1',
      currentLoyaltyTierProgress: 240,
    }),
  );
  mockTiers([select, buildTierWith({ id: 't2', title: 'Elite', threshold: '300' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Your Select benefits')).toBeInTheDocument();
  expect(screen.getByText('5% credit on every order')).toBeInTheDocument();
  expect(screen.getByText('Free ground shipping over $300')).toBeInTheDocument();
  expect(screen.getByText('240 / 300')).toBeInTheDocument();
});

it('renders earn rules with title and summary', async () => {
  const rule = buildEarnRuleWith({ title: 'Make a purchase', summary: '2 points per $1' });

  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockEarnRules([rule]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));

  expect(await screen.findByText('Make a purchase')).toBeInTheDocument();
  expect(screen.getByText('2 points per $1')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument();
  expect(screen.queryByText('Completed')).not.toBeInTheDocument();
});

it('shows a per-dollar points line for increments earn rules', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockEarnRules([
    buildEarnRuleWith({ title: 'Place an order', earnType: 'increments', earnValue: 3 }),
  ]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));

  expect(await screen.findByText('Place an order')).toBeInTheDocument();
  expect(screen.getByText('Earn 3 points per $1 spent')).toBeInTheDocument();
});

it('shows a flat points line for non-increments earn rules', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockEarnRules([buildEarnRuleWith({ title: 'Sign up', earnType: '', earnValue: 10 })]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));

  expect(await screen.findByText('Sign up')).toBeInTheDocument();
  expect(screen.getByText('Earn 10 points')).toBeInTheDocument();
});

it('omits the points line when earnValue is 0', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockEarnRules([buildEarnRuleWith({ title: 'Mystery rule', earnValue: 0 })]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));

  expect(await screen.findByText('Mystery rule')).toBeInTheDocument();
  expect(screen.queryByText('Earn 0 points')).not.toBeInTheDocument();
});

it('shows only the earn rules for the customer current tier', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 'tier-signature' }));
  mockEarnRules([
    buildEarnRuleWith({
      title: 'Place an order',
      earnType: 'increments',
      earnValue: 3,
      limitTiers: true,
      loyaltyTierIds: ['tier-signature'],
    }),
    buildEarnRuleWith({
      title: 'Place an order',
      earnType: 'increments',
      earnValue: 2,
      limitTiers: true,
      loyaltyTierIds: ['tier-select'],
    }),
    buildEarnRuleWith({ title: 'Sign up', earnValue: 10 }),
  ]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));

  expect(await screen.findByText('Sign up')).toBeInTheDocument();
  expect(screen.getAllByText('Place an order')).toHaveLength(1);
  expect(screen.getByText('Earn 3 points per $1 spent')).toBeInTheDocument();
  expect(screen.queryByText('Earn 2 points per $1 spent')).not.toBeInTheDocument();
});

it('shows a completed chip on a social rule the customer already did', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ followInstagram: true }));
  mockEarnRules([buildEarnRuleWith({ templateName: 'instagram_follow', title: 'Follow us' })]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));

  expect(await screen.findByText('Completed')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument();
});

it('awards points through the social follow button', async () => {
  const requestBody = vi.fn();

  mockLoyaltyApis(buildLoyaltyCustomerWith({ followInstagram: false, pointBalance: 100 }));
  mockEarnRules([
    buildEarnRuleWith({
      id: 'r-ig',
      templateName: 'instagram_follow',
      socialUrl: 'https://instagram.com/example',
      title: 'Follow us on Instagram',
    }),
  ]);
  server.use(
    http.post(`${launcherBase}/customer/social`, async ({ request }) => {
      requestBody(await request.json());

      return HttpResponse.json({ success: true, points: 100, updatedBalance: 200 });
    }),
  );

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));
  await user.click(await screen.findByRole('button', { name: 'Follow' }));

  await waitFor(() => {
    expect(snackbar.success).toHaveBeenCalledWith('You earned 100 points!');
  });
  expect(requestBody).toHaveBeenCalledWith({
    customer: { id: identity.customerId, email: identity.email },
    shop: shopKey,
    digest: identity.digest,
    ruleId: 'r-ig',
  });
});

it('shows the rate-limited error when the social follow is throttled', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ followInstagram: false }));
  mockEarnRules([buildEarnRuleWith({ templateName: 'instagram_follow', title: 'Follow us' })]);
  server.use(
    http.post(`${launcherBase}/customer/social`, () => HttpResponse.json({}, { status: 429 })),
  );

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));
  await user.click(await screen.findByRole('button', { name: 'Follow' }));

  await waitFor(() => {
    expect(snackbar.error).toHaveBeenCalledWith(
      'Too many requests — please try again in a minute.',
    );
  });
});

it('shows the generic error when the social follow fails upstream', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ followInstagram: false }));
  mockEarnRules([buildEarnRuleWith({ templateName: 'instagram_follow', title: 'Follow us' })]);
  server.use(
    http.post(`${launcherBase}/customer/social`, () => HttpResponse.json({}, { status: 500 })),
  );

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Earn points' }));
  await user.click(await screen.findByRole('button', { name: 'Follow' }));

  await waitFor(() => {
    expect(snackbar.error).toHaveBeenCalledWith('Something went wrong. Please try again.');
  });
});

it('lists redeemable rewards and disables ones costing more than the balance', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 600 }));
  mockRedeemRules([
    buildRedeemRuleWith({ title: '$5 discount', pointCost: 500 }),
    buildRedeemRuleWith({ title: 'Free shipping', pointCost: 1000 }),
  ]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Rewards' }));

  const cheap = (await screen.findByText('$5 discount')).closest('.MuiCard-root') as HTMLElement;
  const dear = screen.getByText('Free shipping').closest('.MuiCard-root') as HTMLElement;
  expect(within(cheap).getByRole('button', { name: 'Get reward' })).toBeEnabled();
  expect(within(dear).getByRole('button', { name: 'Get reward' })).toBeDisabled();
});

it('hides increment-type and unknown-status rules from the catalog', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 5000 }));
  mockRedeemRules([
    buildRedeemRuleWith({ title: 'Point donation', minRedeemablePoints: 100 }),
    buildRedeemRuleWith({ title: 'Paused reward', status: 'paused' }),
    buildRedeemRuleWith({ title: '$5 discount' }),
  ]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Rewards' }));

  expect(await screen.findByText('$5 discount')).toBeInTheDocument();
  expect(screen.queryByText('Point donation')).not.toBeInTheDocument();
  expect(screen.queryByText('Paused reward')).not.toBeInTheDocument();
});

it('redeems a reward after confirmation and shows the coupon code', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 600 }));
  mockRedeemRules([buildRedeemRuleWith({ id: 'rr1', title: '$5 discount', pointCost: 500 })]);
  server.use(
    http.post(`${launcherBase}/customer/redeem`, () =>
      HttpResponse.json({ success: true, couponCode: 'SAVE-123' }),
    ),
  );

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Rewards' }));
  await user.click(await screen.findByRole('button', { name: 'Get reward' }));

  expect(await screen.findByText('Redeem $5 discount for 500 points?')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Redeem' }));

  expect(await screen.findByText('SAVE-123')).toBeInTheDocument();
  expect(screen.getByText('Apply this code at checkout.')).toBeInTheDocument();
});

it('copies the coupon code to the clipboard', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 600 }));
  mockRedeemRules([buildRedeemRuleWith({ title: '$5 discount', pointCost: 500 })]);
  server.use(
    http.post(`${launcherBase}/customer/redeem`, () =>
      HttpResponse.json({ success: true, couponCode: 'SAVE-123' }),
    ),
  );

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Rewards' }));
  await user.click(await screen.findByRole('button', { name: 'Get reward' }));
  await user.click(await screen.findByRole('button', { name: 'Redeem' }));

  expect(await screen.findByText('SAVE-123')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Copy code' }));

  await waitFor(() => {
    expect(snackbar.success).toHaveBeenCalledWith('Code copied');
  });
  expect(await window.navigator.clipboard.readText()).toBe('SAVE-123');
});

it('does not redeem when the confirmation is cancelled', async () => {
  const redeemRequests = vi.fn();

  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 600 }));
  mockRedeemRules([buildRedeemRuleWith({ title: '$5 discount', pointCost: 500 })]);
  server.use(
    http.post(`${launcherBase}/customer/redeem`, () => {
      redeemRequests();

      return HttpResponse.json({ success: true, couponCode: 'SAVE-123' });
    }),
  );

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Rewards' }));
  await user.click(await screen.findByRole('button', { name: 'Get reward' }));
  await user.click(await screen.findByRole('button', { name: 'Cancel' }));

  expect(redeemRequests).not.toHaveBeenCalled();
});

it('shows an error snackbar when the redemption fails', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 600 }));
  mockRedeemRules([buildRedeemRuleWith({ title: '$5 discount', pointCost: 500 })]);
  server.use(
    http.post(`${launcherBase}/customer/redeem`, () => HttpResponse.json({}, { status: 500 })),
  );

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Rewards' }));
  await user.click(await screen.findByRole('button', { name: 'Get reward' }));
  await user.click(await screen.findByRole('button', { name: 'Redeem' }));

  await waitFor(() => {
    expect(snackbar.error).toHaveBeenCalledWith('Something went wrong. Please try again.');
  });
});

it('shows an error snackbar when redemption succeeds without a coupon code', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 600 }));
  mockRedeemRules([buildRedeemRuleWith({ title: '$5 discount', pointCost: 500 })]);
  server.use(
    http.post(`${launcherBase}/customer/redeem`, () => HttpResponse.json({ success: false })),
  );

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Rewards' }));
  await user.click(await screen.findByRole('button', { name: 'Get reward' }));
  await user.click(await screen.findByRole('button', { name: 'Redeem' }));

  await waitFor(() => {
    expect(snackbar.error).toHaveBeenCalledWith('Something went wrong. Please try again.');
  });
  expect(screen.queryByText('Apply this code at checkout.')).not.toBeInTheDocument();
});

it('lists previously earned coupon codes and loads more pages', async () => {
  const first = buildEarnedRewardWith({ couponCode: 'FIRST-CODE' });
  const second = buildEarnedRewardWith({ couponCode: 'SECOND-CODE' });

  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockRedeemRules([]);
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, ({ request }) => {
      const token = new URL(request.url).searchParams.get('nextToken');
      if (token === 'page-2') {
        return HttpResponse.json({ items: [second], nextToken: null });
      }
      return HttpResponse.json({ items: [first], nextToken: 'page-2' });
    }),
  );

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Rewards' }));

  expect(await screen.findByText('FIRST-CODE')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Load more' }));

  expect(await screen.findByText('SECOND-CODE')).toBeInTheDocument();
  expect(screen.getByText('FIRST-CODE')).toBeInTheDocument();
});

it('lists points history and loads more pages', async () => {
  const first = buildPointActivityWith({ customDescription: 'Order #1001', points: 50 });
  const second = buildPointActivityWith({ customDescription: 'Order #1002', points: 80 });

  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  server.use(
    http.get(`${launcherBase}/customer/points`, ({ request }) => {
      const token = new URL(request.url).searchParams.get('nextToken');
      if (token === 'page-2') {
        return HttpResponse.json({ items: [second], nextToken: null });
      }
      return HttpResponse.json({ items: [first], nextToken: 'page-2' });
    }),
  );

  const { user } = renderWithProviders(<Loyalty />, {
    initialEntries: [{ search: '?tab=history' }],
  });

  expect(await screen.findByText('Order #1001')).toBeInTheDocument();
  expect(screen.getByText('+50')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Load more' }));

  expect(await screen.findByText('Order #1002')).toBeInTheDocument();
  expect(screen.getByText('Order #1001')).toBeInTheDocument();
});

it('shows the empty history state', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  server.use(
    http.get(`${launcherBase}/customer/points`, () =>
      HttpResponse.json({ items: [], nextToken: null }),
    ),
  );

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=history' }] });

  expect(await screen.findByText('No points activity yet.')).toBeInTheDocument();
});

it('shows the free-shipping progress bar with remaining amount and caption', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));
  mockShippingTracker(
    buildRawShippingCalculationWith({
      qualifies: false,
      threshold: 300,
      eligibleSubtotal: 130.85,
      remaining: 169.15,
    }),
  );

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('$169.15 away from FREE shipping')).toBeInTheDocument();
  expect(screen.getByText('$130.85 / $300.00')).toBeInTheDocument();
  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '44');
});

it('shows the qualified state with a full bar', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));
  mockShippingTracker(
    buildRawShippingCalculationWith({
      qualifies: true,
      threshold: 300,
      eligibleSubtotal: 350.1,
      remaining: 0,
    }),
  );

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText("You've earned FREE shipping!")).toBeInTheDocument();
  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
});

it('falls back to the config threshold when the calculation omits it', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockShippingTracker(
    {
      qualifies: false,
      threshold: undefined,
      eligibleSubtotal: 130.85,
      remaining: undefined,
      excludedByProduct: [],
      excludedByCategory: [],
      ltlItems: [],
    } as RawShippingCalculation,
    { threshold: 500, excludedProductIds: '', excludedCategoryIds: '' },
  );

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('$369.15 away from FREE shipping')).toBeInTheDocument();
  expect(screen.getByText('$130.85 / $500.00')).toBeInTheDocument();
});

it('hides the shipping tracker when the theme config is absent', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));
  window.getLoyaltyShippingCalculation = vi
    .fn()
    .mockResolvedValue(buildRawShippingCalculationWith({}));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
  expect(screen.queryByText(/away from FREE shipping/)).not.toBeInTheDocument();
  expect(window.getLoyaltyShippingCalculation).not.toHaveBeenCalled();
});

it('hides the shipping tracker when the theme function is absent', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));
  window.loyaltyShippingConfig = {
    threshold: 300,
    excludedProductIds: '',
    excludedCategoryIds: '',
  };

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
  expect(screen.queryByText(/away from FREE shipping/)).not.toBeInTheDocument();
});

it('hides the shipping tracker when the calculation rejects', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));
  mockShippingTracker(new Error('cart api down'));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
  expect(screen.queryByText(/away from FREE shipping/)).not.toBeInTheDocument();
  expect(screen.queryByText("You've earned FREE shipping!")).not.toBeInTheDocument();
});

it('hides the shipping tracker when the resolved threshold is zero', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));
  mockShippingTracker(
    {
      qualifies: false,
      threshold: undefined,
      eligibleSubtotal: 100,
      remaining: undefined,
      excludedByProduct: [],
      excludedByCategory: [],
      ltlItems: [],
    } as RawShippingCalculation,
    { threshold: 0, excludedProductIds: '', excludedCategoryIds: '' },
  );

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
  expect(screen.queryByText(/away from FREE shipping/)).not.toBeInTheDocument();
});
