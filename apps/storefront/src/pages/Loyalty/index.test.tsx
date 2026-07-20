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
  LoyaltyMembership,
  LoyaltyTier,
  LoyaltyTierProgress,
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
  delete window.loyaltyRolloutConfig;
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
  currentMembership: null,
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

const buildMembershipWith = builder<LoyaltyMembership>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productName(),
  description: faker.company.catchPhrase(),
  perks: [faker.company.catchPhrase()],
}));

const mockMemberships = (memberships: LoyaltyMembership[]) =>
  server.use(
    http.get(`${launcherBase}/shop/memberships`, () => HttpResponse.json({ memberships })),
  );

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

const buildTierProgressWith = builder<LoyaltyTierProgress>(() => ({
  currentTierName: faker.commerce.productAdjective(),
  targetTierName: faker.commerce.productAdjective(),
  ordersInWindow: faker.number.int({ min: 0, max: 50 }),
  targetOrdersRequired: faker.number.int({ min: 51, max: 100 }),
  spendInWindow: faker.number.float({ min: 0, max: 999, fractionDigits: 2 }),
  targetAmountRequired: faker.number.int({ min: 1000, max: 9999 }),
  ordersProgressPct: faker.number.int({ min: 0, max: 99 }),
  spendProgressPct: faker.number.int({ min: 0, max: 99 }),
  summary: faker.company.catchPhrase(),
}));

const progressUrl = `${apiBase}/loyaltycustomersclient/GetDetailWithProgress`;

// Sets the progressSite config AND the endpoint mock; callers must also pass a
// preloadedState customer id so the query's enabled gate opens.
const mockTierProgress = (progress: LoyaltyTierProgress) => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, progressSite: 'StoreSupply' } };
  server.use(
    http.get(progressUrl, () =>
      HttpResponse.json({
        Success: true,
        Result: {
          TierProgress: {
            CurrentTierName: progress.currentTierName,
            TargetKind: 'NextTier',
            TargetTierName: progress.targetTierName,
            OrdersInWindow: progress.ordersInWindow,
            TargetOrdersRequired: progress.targetOrdersRequired,
            SpendInWindow: progress.spendInWindow,
            TargetAmountRequired: progress.targetAmountRequired,
            OrdersProgressPct: progress.ordersProgressPct,
            SpendProgressPct: progress.spendProgressPct,
            Summary: progress.summary,
          },
        },
      }),
    ),
  );
};

const customerPreloadedState = {
  preloadedState: { company: buildCompanyStateWith({ customer: { id: 264074 } }) },
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
});

it('shows the Memberships tab and lists membership cards when the store has memberships', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships([
    buildMembershipWith({
      title: 'VIP Gold',
      description: 'Our premium program',
      perks: ['Free expedited shipping', 'Early access to sales'],
    }),
  ]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Memberships' }));

  expect(await screen.findByText('VIP Gold')).toBeInTheDocument();
  expect(screen.getByText('Our premium program')).toBeInTheDocument();
  expect(screen.getByText('Free expedited shipping')).toBeInTheDocument();
  expect(screen.getByText('Early access to sales')).toBeInTheDocument();
});

it('hides the Memberships tab when the store has no memberships', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships([]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByRole('tab', { name: 'Your rewards' })).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Memberships' })).not.toBeInTheDocument();
});

it('falls back to Your rewards when ?tab=memberships but the store has none', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships([]);

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=memberships' }] });

  expect(
    await screen.findByRole('tab', { name: 'Your rewards', selected: true }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Memberships' })).not.toBeInTheDocument();
});

it('omits the description line for a membership with no description', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockMemberships([
    buildMembershipWith({ title: 'Trade Pro', description: '', perks: ['Net-30 terms'] }),
  ]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Memberships' }));

  expect(await screen.findByText('Trade Pro')).toBeInTheDocument();
  expect(screen.getByText('Net-30 terms')).toBeInTheDocument();
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
});

it('shows the current membership benefits on the Your rewards tab', async () => {
  mockLoyaltyApis(
    buildLoyaltyCustomerWith({
      currentMembership: {
        id: 'm1',
        title: 'VIP Gold',
        perks: ['Free expedited shipping', 'Early access'],
      },
    }),
  );

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Your VIP Gold membership benefits')).toBeInTheDocument();
  expect(screen.getByText('Free expedited shipping')).toBeInTheDocument();
  expect(screen.getByText('Early access')).toBeInTheDocument();
});

it('omits the membership benefits block when the customer has no membership', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentMembership: null, pointBalance: 100 }));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 100 points')).toBeInTheDocument();
  expect(screen.queryByText(/membership benefits/)).not.toBeInTheDocument();
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

it('shows a zero bar with the full threshold remaining for an empty cart', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));
  mockShippingTracker(
    buildRawShippingCalculationWith({
      qualifies: false,
      threshold: 300,
      eligibleSubtotal: 0,
      remaining: 300,
    }),
  );

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('$300.00 away from FREE shipping')).toBeInTheDocument();
  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
  expect(screen.getByText('$0.00 / $300.00')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
});

it('renders the page when the customer tier is on the rollout allowlist', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: 'ESSENTIAL,SELECT,SIGNATURE' };
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't-sig', pointBalance: 2465 }));
  mockTiers([buildTierWith({ id: 't-sig', title: 'SIGNATURE' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Earn points' })).toBeInTheDocument();
});

it('shows the unavailable state when the customer tier is not on the allowlist', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: 'essential,select' };
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't-sig' }));
  mockTiers([buildTierWith({ id: 't-sig', title: 'SIGNATURE' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Rewards are not available.')).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Earn points' })).not.toBeInTheDocument();
});

it('fails closed to unavailable on a digest failure while the allowlist is set', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: 'signature' };
  server.use(http.get(currentJwtUrl, () => HttpResponse.text('{"errors":[]}', { status: 401 })));
  mockTiers([buildTierWith({ id: 't-sig', title: 'SIGNATURE' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Rewards are not available.')).toBeInTheDocument();
  expect(
    screen.queryByText('Your session has expired — please sign in again.'),
  ).not.toBeInTheDocument();
});

it('fails closed to unavailable when the customer is not enrolled while the allowlist is set', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: 'signature' };
  mockJwt();
  mockDigest();
  server.use(http.get(`${launcherBase}/customer`, () => HttpResponse.json({}, { status: 404 })));
  mockTiers([buildTierWith({ id: 't-sig', title: 'SIGNATURE' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Rewards are not available.')).toBeInTheDocument();
  expect(screen.queryByText('Start earning points with your first order.')).not.toBeInTheDocument();
});

it('fails closed to unavailable when the tiers lookup fails while the allowlist is set', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: 'signature' };
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't-sig' }));
  server.use(http.get(`${launcherBase}/shop/tiers`, () => HttpResponse.json({}, { status: 500 })));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Rewards are not available.')).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Earn points' })).not.toBeInTheDocument();
});

it('treats an empty allowedTiers string as lever-off (current behavior)', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: '' };
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 2,465 points')).toBeInTheDocument();
});

it('fails closed to unavailable on an upstream digest failure while the allowlist is set', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: 'signature' };
  mockJwt();
  server.use(http.post(digestUrl, () => HttpResponse.json({}, { status: 500 })));
  mockTiers([buildTierWith({ id: 't-sig', title: 'SIGNATURE' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Rewards are not available.')).toBeInTheDocument();
  expect(screen.queryByText("We couldn't load your rewards.")).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
});

it('shows dual-quota tier progress on the Your rewards tab', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockTierProgress(
    buildTierProgressWith({
      targetTierName: 'Signature',
      ordersInWindow: 39,
      targetOrdersRequired: 75,
      spendInWindow: 130.85,
      targetAmountRequired: 300,
      summary: "36 more order(s) OR $169.15 more spend away from 'Signature'.",
    }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('Progress to Signature')).toBeInTheDocument();
  expect(screen.getByText('Orders')).toBeInTheDocument();
  expect(screen.getByText('39 / 75')).toBeInTheDocument();
  expect(screen.getByText('Spend')).toBeInTheDocument();
  expect(screen.getByText('$130.85 / $300.00')).toBeInTheDocument();
  expect(
    screen.getByText("36 more order(s) OR $169.15 more spend away from 'Signature'."),
  ).toBeInTheDocument();
});

it('shows the same tier progress card on the Tiers tab', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockTierProgress(
    buildTierProgressWith({
      targetTierName: 'Signature',
      ordersInWindow: 39,
      targetOrdersRequired: 75,
    }),
  );

  const { user } = renderWithProviders(<Loyalty />, customerPreloadedState);

  await user.click(await screen.findByRole('tab', { name: 'Tiers' }));

  expect(await screen.findByText('Progress to Signature')).toBeInTheDocument();
  expect(screen.getByText('39 / 75')).toBeInTheDocument();
});

it('omits the orders row when only a spend quota is configured', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockTierProgress(
    buildTierProgressWith({
      targetOrdersRequired: 0,
      spendInWindow: 130.85,
      targetAmountRequired: 300,
    }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('$130.85 / $300.00')).toBeInTheDocument();
  expect(screen.queryByText('Orders')).not.toBeInTheDocument();
});

it('omits the spend row when only an orders quota is configured', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockTierProgress(
    buildTierProgressWith({
      ordersInWindow: 39,
      targetOrdersRequired: 75,
      targetAmountRequired: 0,
    }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('39 / 75')).toBeInTheDocument();
  expect(screen.queryByText('Spend')).not.toBeInTheDocument();
});

it('shows the SSW tier name in the hero when tier progress is available', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockTierProgress(buildTierProgressWith({ currentTierName: 'Select' }));

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('Current tier')).toBeInTheDocument();
  expect(await screen.findByText('Select')).toBeInTheDocument();
});

it('hides the tier progress card when the endpoint reports no progress', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, progressSite: 'StoreSupply' } };
  server.use(http.get(progressUrl, () => HttpResponse.json({ Success: false })));

  const { user } = renderWithProviders(<Loyalty />, customerPreloadedState);

  await user.click(await screen.findByRole('tab', { name: 'Tiers' }));

  expect(await screen.findByRole('tab', { name: 'Tiers', selected: true })).toBeInTheDocument();
  expect(screen.queryByText(/Progress to/)).not.toBeInTheDocument();
});
