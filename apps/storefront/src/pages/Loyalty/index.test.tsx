import {
  buildB2BFeaturesStateWith,
  buildCompanyStateWith,
  builder,
  faker,
  fireEvent,
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
  LoyaltyCustomer,
  LoyaltyIdentity,
  LoyaltyTier,
  LoyaltyTierProgress,
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
  delete window.loyaltyFaqConfig;
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
  targetKind: 'NextTier' as const,
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
            TargetKind: progress.targetKind,
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

  expect(await screen.findByText('Welcome back, Riverside Hardware Co.')).toBeInTheDocument();
  expect(await screen.findByText('Member since Jan 2026')).toBeInTheDocument();
  expect(await screen.findByText('You have 2,465 points available.')).toBeInTheDocument();
});

it('renders the storefront-hosted banner image and hides it if it fails to load', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 1044 }));

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('Smart Rewards')).toBeInTheDocument();
  const image = document.querySelector(
    'img[src="/content/images/loyalty/loyalty-account-banner.jpg"]',
  );
  expect(image).toBeInTheDocument();

  fireEvent.error(image as Element);

  expect(
    document.querySelector('img[src="/content/images/loyalty/loyalty-account-banner.jpg"]'),
  ).not.toBeInTheDocument();
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

it('renders no benefits sections while the customer record is unavailable', async () => {
  mockJwt();
  mockDigest();
  server.use(http.get(`${launcherBase}/customer`, () => HttpResponse.json({}, { status: 502 })));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText("We couldn't load your rewards.")).toBeInTheDocument();
  expect(
    screen.queryByText("You're officially part of the SSW Smart Rewards family", { exact: false }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/Progress to/)).not.toBeInTheDocument();
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

  expect(await screen.findByText('You have 100 points available.')).toBeInTheDocument();
});

it('renders the tabs with mockup labels and defaults to My benefits', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByRole('tab', { name: 'My benefits', selected: true }),
  ).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Get rewards' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'My rewards' })).toBeInTheDocument();
});

it('selects the tab named by the URL search param', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=my-rewards' }] });

  expect(
    await screen.findByRole('tab', { name: 'My rewards', selected: true }),
  ).toBeInTheDocument();
});

it('falls back to My benefits for an unknown tab param', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=bogus' }] });

  expect(
    await screen.findByRole('tab', { name: 'My benefits', selected: true }),
  ).toBeInTheDocument();
});

it('switches tabs on click', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Get rewards' }));

  expect(screen.getByRole('tab', { name: 'Get rewards', selected: true })).toBeInTheDocument();
});

it('falls back to the Influence tier title in the hero when tier progress is absent', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1' }));
  mockTiers([buildTierWith({ id: 't1', title: 'Select' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Current tier')).toBeInTheDocument();
  expect(await screen.findByText('Select')).toBeInTheDocument();
});

it('shows the current tier benefits and points summary on My benefits', async () => {
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

  // Scoped to the highlighted benefits box — the same tier's perks also appear in the tier list below.
  const benefitsBox = (await screen.findByText('Your Select benefits')).closest(
    '.MuiBox-root',
  ) as HTMLElement;
  expect(within(benefitsBox).getByText('5% credit on every order')).toBeInTheDocument();
  expect(within(benefitsBox).getByText('Free ground shipping over $300')).toBeInTheDocument();
});

it('shows the current membership benefits on My benefits', async () => {
  mockLoyaltyApis(
    buildLoyaltyCustomerWith({
      currentMembership: {
        id: 'm1',
        title: 'Signature Membership',
        perks: ['Free expedited shipping', 'Early access'],
      },
    }),
  );

  renderWithProviders(<Loyalty />);

  // Membership titles already end in "Membership", so the heading must not double it.
  expect(await screen.findByText('Your Signature Membership benefits')).toBeInTheDocument();
  expect(screen.queryByText(/membership\s+membership/i)).not.toBeInTheDocument();
  expect(screen.getByText('Free expedited shipping')).toBeInTheDocument();
  expect(screen.getByText('Early access')).toBeInTheDocument();
});

it('omits the membership benefits block when the customer has no membership', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentMembership: null, pointBalance: 100 }));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 100 points available.')).toBeInTheDocument();
  // No membership and no tiers mocked here, so neither highlighted benefits box renders
  // (the "My benefits" tab/section heading itself is unconditional, so this can't be /benefits/i).
  expect(screen.queryByText(/Your .+ benefits/)).not.toBeInTheDocument();
});

it('lists redeemable rewards and disables ones costing more than the balance', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 600 }));
  mockRedeemRules([
    buildRedeemRuleWith({ title: '$5 discount', pointCost: 500 }),
    buildRedeemRuleWith({ title: 'Free shipping', pointCost: 1000 }),
  ]);

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'Get rewards' }));

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

  await user.click(await screen.findByRole('tab', { name: 'Get rewards' }));

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

  await user.click(await screen.findByRole('tab', { name: 'Get rewards' }));
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

  await user.click(await screen.findByRole('tab', { name: 'Get rewards' }));
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

  await user.click(await screen.findByRole('tab', { name: 'Get rewards' }));
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

  await user.click(await screen.findByRole('tab', { name: 'Get rewards' }));
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

  await user.click(await screen.findByRole('tab', { name: 'Get rewards' }));
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

  await user.click(await screen.findByRole('tab', { name: 'My rewards' }));

  expect(await screen.findByText('FIRST-CODE')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Load more' }));

  expect(await screen.findByText('SECOND-CODE')).toBeInTheDocument();
  expect(screen.getByText('FIRST-CODE')).toBeInTheDocument();
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
  expect(await screen.findByText('You have 2,465 points available.')).toBeInTheDocument();
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
  expect(await screen.findByText('You have 2,465 points available.')).toBeInTheDocument();
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

  expect(await screen.findByText('You have 2,465 points available.')).toBeInTheDocument();
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

  expect(await screen.findByText('You have 2,465 points available.')).toBeInTheDocument();
  expect(screen.queryByText(/away from FREE shipping/)).not.toBeInTheDocument();
});

it('hides the shipping tracker when the calculation rejects', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));
  mockShippingTracker(new Error('cart api down'));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 2,465 points available.')).toBeInTheDocument();
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

  expect(await screen.findByText('You have 2,465 points available.')).toBeInTheDocument();
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
  expect(await screen.findByText('You have 2,465 points available.')).toBeInTheDocument();
  expect(screen.getByText('$0.00 / $300.00')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
});

it('renders the page when the customer tier is on the rollout allowlist', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: 'ESSENTIAL,SELECT,SIGNATURE' };
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't-sig', pointBalance: 2465 }));
  mockTiers([buildTierWith({ id: 't-sig', title: 'SIGNATURE' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 2,465 points available.')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'My benefits' })).toBeInTheDocument();
});

it('shows the unavailable state when the customer tier is not on the allowlist', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: 'essential,select' };
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't-sig' }));
  mockTiers([buildTierWith({ id: 't-sig', title: 'SIGNATURE' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Rewards are not available.')).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'My benefits' })).not.toBeInTheDocument();
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
  expect(screen.queryByRole('tab', { name: 'My benefits' })).not.toBeInTheDocument();
});

it('treats an empty allowedTiers string as lever-off (current behavior)', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: '' };
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('You have 2,465 points available.')).toBeInTheDocument();
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

it('shows dual-quota tier progress on My benefits', async () => {
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

  expect(await screen.findByText('Progress to Signature Tier')).toBeInTheDocument();
  expect(screen.getByText('39 of 75 orders')).toBeInTheDocument();
  expect(screen.getByText('$130.85 of $300.00')).toBeInTheDocument();
  expect(
    screen.queryByText("36 more order(s) OR $169.15 more spend away from 'Signature'."),
  ).not.toBeInTheDocument();
});

it('shows the tier progress card once on My benefits', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockTierProgress(
    buildTierProgressWith({
      targetTierName: 'Signature',
      ordersInWindow: 39,
      targetOrdersRequired: 75,
    }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findAllByText('Progress to Signature Tier')).toHaveLength(1);
  expect(screen.getByText('39 of 75 orders')).toBeInTheDocument();
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

  expect(await screen.findByText('$130.85 of $300.00')).toBeInTheDocument();
  expect(screen.queryByText(/orders$/)).not.toBeInTheDocument();
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

  expect(await screen.findByText('39 of 75 orders')).toBeInTheDocument();
  expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
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

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(
    await screen.findByRole('tab', { name: 'My benefits', selected: true }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Progress to/)).not.toBeInTheDocument();
});

it('shows no error banner when the tier-progress endpoint fails', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 2465 }));
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, progressSite: 'StoreSupply' } };
  server.use(http.get(progressUrl, () => HttpResponse.json({}, { status: 500 })));

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('You have 2,465 points available.')).toBeInTheDocument();
  expect(screen.queryByText("We couldn't load your rewards.")).not.toBeInTheDocument();
  expect(screen.queryByText(/Progress to/)).not.toBeInTheDocument();
});

it('keeps the allowlist gate keyed to the Influence tier when SSW disagrees', async () => {
  window.loyaltyRolloutConfig = { allowedTiers: 'signature' };
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't-sig', pointBalance: 2465 }));
  mockTiers([buildTierWith({ id: 't-sig', title: 'SIGNATURE' })]);
  mockTierProgress(buildTierProgressWith({ currentTierName: 'NotOnTheList' }));

  renderWithProviders(<Loyalty />, customerPreloadedState);

  // Influence tier SIGNATURE is allowed -> page renders even though SSW's name isn't listed
  expect(await screen.findByText('You have 2,465 points available.')).toBeInTheDocument();
  expect(screen.getByText('NotOnTheList')).toBeInTheDocument();
});

it('greets the customer by first name in the Smart Rewards banner', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 1044 }));

  renderWithProviders(<Loyalty />, {
    preloadedState: {
      company: buildCompanyStateWith({
        customer: { id: 264074, firstName: 'Lisa' },
        companyInfo: { companyName: 'Riverside Hardware Co.' },
      }),
    },
  });

  expect(await screen.findByText('Smart Rewards')).toBeInTheDocument();
  expect(await screen.findByText('Welcome back, Lisa')).toBeInTheDocument();
  expect(await screen.findByText('You have 1,044 points available.')).toBeInTheDocument();
});

it('falls back to the company name when the customer has no first name', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />, {
    preloadedState: {
      company: buildCompanyStateWith({
        customer: { id: 264074, firstName: '' },
        companyInfo: { companyName: 'Riverside Hardware Co.' },
      }),
    },
  });

  expect(await screen.findByText('Welcome back, Riverside Hardware Co.')).toBeInTheDocument();
});

it('shows the shopping CTA and gate summary for a PrePointsGate customer', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));
  mockTierProgress(
    buildTierProgressWith({
      targetKind: 'PrePointsGate',
      summary: 'Spend $2902.15 more in the next 365-day window to start earning points.',
    }),
  );

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(
    await screen.findByRole('link', { name: 'Start shopping to earn points' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Spend $2902.15 more in the next 365-day window to start earning points.'),
  ).toBeInTheDocument();
  // The CTA above is driven by tierProgressQuery alone; BenefitsTab (and the
  // TierProgressCard the next assertion rules out) gates on the independent, slower
  // customerQuery. Anchor on customer-dependent content first so the negative assertion
  // below isn't a mount race (see storefront-pages memory: pattern_negative-assertion-race.md).
  expect(await screen.findByText(/points available/)).toBeInTheDocument();
  expect(screen.queryByText(/Progress to/)).not.toBeInTheDocument();
});

it('shows no CTA for a customer who is already earning', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 1044 }));
  mockTierProgress(buildTierProgressWith({ targetKind: 'NextTier', summary: 'Two more orders.' }));

  renderWithProviders(<Loyalty />, customerPreloadedState);

  expect(await screen.findByText('You have 1,044 points available.')).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Start shopping to earn points' }),
  ).not.toBeInTheDocument();
});

it('lists earned coupon codes away from the catalog', async () => {
  const earned = buildEarnedRewardWith({ couponCode: 'SAVE-123', title: '$5 discount' });

  mockLoyaltyApis(buildLoyaltyCustomerWith({ pointBalance: 600 }));
  mockRedeemRules([buildRedeemRuleWith({ title: 'Free shipping', pointCost: 500 })]);
  server.use(
    http.get(`${launcherBase}/customer/all-rewards`, () =>
      HttpResponse.json({ items: [earned], nextToken: null }),
    ),
  );

  const { user } = renderWithProviders(<Loyalty />);

  // Catalog tab shows the redeemable rule but no longer the earned codes.
  await user.click(await screen.findByRole('tab', { name: 'Get rewards' }));
  expect(await screen.findByText('Free shipping')).toBeInTheDocument();
  expect(screen.queryByText('SAVE-123')).not.toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: 'My rewards' }));
  expect(await screen.findByText('SAVE-123')).toBeInTheDocument();
  expect(screen.getByText('Your earned rewards')).toBeInTheDocument();
});

it('renders the four Smart Rewards tabs and defaults to My benefits', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByRole('tab', { name: 'My benefits', selected: true }),
  ).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Get rewards' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'My rewards' })).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Earn points' })).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Tiers' })).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'History' })).not.toBeInTheDocument();
});

it('shows membership status and tier benefits on My benefits', async () => {
  const select = buildTierWith({ id: 't1', title: 'Select', perks: ['5% credit'] });

  mockLoyaltyApis(
    buildLoyaltyCustomerWith({
      currentLoyaltyTierId: 't1',
      currentMembership: {
        id: 'm1',
        title: 'Signature Membership',
        perks: ['Dedicated account representative'],
      },
    }),
  );
  mockTiers([select]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Your Signature Membership benefits')).toBeInTheDocument();
  expect(screen.getByText('Dedicated account representative')).toBeInTheDocument();
  expect(await screen.findByText('Your Select benefits')).toBeInTheDocument();
});

it.each([
  ['overview', 'My benefits'],
  ['earn', 'My benefits'],
  ['tiers', 'My benefits'],
  ['memberships', 'My benefits'],
  ['redeem', 'Get rewards'],
  ['history', 'My rewards'],
  ['bogus', 'My benefits'],
])('maps the legacy ?tab=%s deep link to %s', async (legacy, expected) => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: `?tab=${legacy}` }] });

  expect(await screen.findByRole('tab', { name: expected, selected: true })).toBeInTheDocument();
});

it('hides the FAQ tab when the theme ships no FAQ content', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />);

  expect(await screen.findByRole('tab', { name: 'My benefits' })).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'FAQ' })).not.toBeInTheDocument();
});

it('renders theme-provided FAQ questions and answers', async () => {
  window.loyaltyFaqConfig = {
    intro: 'Ask away.',
    items: [{ question: 'How do I earn points?', answer: 'Place an order.' }],
  };
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'FAQ' }));

  expect(await screen.findByText('Ask away.')).toBeInTheDocument();
  expect(screen.getByText('How do I earn points?')).toBeInTheDocument();
  expect(screen.getByText('Place an order.')).toBeInTheDocument();
});

it('uses the default FAQ intro when the theme supplies none', async () => {
  window.loyaltyFaqConfig = { items: [{ question: 'Q?', answer: 'A.' }] };
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  const { user } = renderWithProviders(<Loyalty />);

  await user.click(await screen.findByRole('tab', { name: 'FAQ' }));

  expect(
    await screen.findByText(
      "Got questions? Here's what our customers ask most about SSW Smart Rewards.",
    ),
  ).toBeInTheDocument();
});

it('falls back to My benefits for ?tab=faq with no FAQ content', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />, { initialEntries: [{ search: '?tab=faq' }] });

  expect(
    await screen.findByRole('tab', { name: 'My benefits', selected: true }),
  ).toBeInTheDocument();
});

it('introduces My benefits with the customer tier name', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1' }));
  mockTiers([buildTierWith({ id: 't1', title: 'Essential' })]);

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByText(
      "You're officially part of the SSW Smart Rewards family. We want to make sure every order works harder for you.",
    ),
  ).toBeInTheDocument();
  expect(
    await screen.findByText(
      "Here's a quick guide to your Essential benefits and how to get the most from them.",
    ),
  ).toBeInTheDocument();
});

it('uses the generic intro line when no tier name is known', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: null }));

  renderWithProviders(<Loyalty />);

  expect(
    await screen.findByText(
      "Here's a quick guide to your benefits and how to get the most from them.",
    ),
  ).toBeInTheDocument();
});

it('shows the benefits banner and explainer cards with the tier name', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1' }));
  mockTiers([buildTierWith({ id: 't1', title: 'Essential' })]);

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText("Here's how your Essential rewards work")).toBeInTheDocument();
  expect(screen.getByText('Each purchase earns you points.')).toBeInTheDocument();
  expect(
    document.querySelector('img[src="/content/images/loyalty/loyalty-benefits-banner.jpg"]'),
  ).toBeInTheDocument();
  expect(screen.getByText('Earning and Redeeming Credit')).toBeInTheDocument();
  expect(
    screen.getByText(
      'At the Essential level, you earn at a 1% rate once you reach $500 in annual purchases.',
    ),
  ).toBeInTheDocument();
  expect(screen.getByText('Free Shipping')).toBeInTheDocument();
  expect(
    screen.getByText('Orders over $300 ship ground for free, every time.'),
  ).toBeInTheDocument();
  expect(screen.getByText('Your Tier Status')).toBeInTheDocument();
  expect(
    screen.getByText(
      'We look at your orders over the past 12 months, updated monthly, to determine your tier.',
    ),
  ).toBeInTheDocument();
});

it('hides the benefits banner image when it fails to load', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith('WHATEVER_VALUES'));

  renderWithProviders(<Loyalty />);

  const image = await waitFor(() => {
    const el = document.querySelector(
      'img[src="/content/images/loyalty/loyalty-benefits-banner.jpg"]',
    );
    expect(el).toBeInTheDocument();
    return el;
  });

  fireEvent.error(image as Element);

  expect(
    document.querySelector('img[src="/content/images/loyalty/loyalty-benefits-banner.jpg"]'),
  ).not.toBeInTheDocument();
});

const rewardTiers = () => [
  buildTierWith({ id: 't1', title: 'Essential', threshold: '' }),
  buildTierWith({
    id: 't2',
    title: 'Select',
    threshold: '8+ orders/year or $2,000+ annual spend',
    perks: ['2% monthly credit', 'an account rep'],
  }),
  buildTierWith({
    id: 't3',
    title: 'Signature',
    threshold: '16+ orders/year or $5,000+ annual spend',
    perks: ['3% monthly credit'],
  }),
];

it('shows the tiers above the customer with their quota and perks', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't1' }));
  mockTiers(rewardTiers());

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText("What's Available as Your Orders Grow?")).toBeInTheDocument();
  expect(
    screen.getByText('As your orders grow, so do your rewards. 2 more levels are available:'),
  ).toBeInTheDocument();
  expect(screen.getByText('Select Tier')).toBeInTheDocument();
  expect(screen.getByText('(8+ orders/year or $2,000+ annual spend) :')).toBeInTheDocument();
  expect(screen.getByText('2% monthly credit, an account rep')).toBeInTheDocument();
  expect(screen.getByText('Signature Tier')).toBeInTheDocument();
  expect(
    screen.getByText('When you reach the next level, your tier upgrades automatically.'),
  ).toBeInTheDocument();
});

it('shows only the tiers above the customer, not current or lower ones', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't2' }));
  mockTiers(rewardTiers());

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Signature Tier')).toBeInTheDocument();
  expect(
    screen.getByText('As your orders grow, so do your rewards. 1 more level is available:'),
  ).toBeInTheDocument();
  expect(screen.queryByText('Select Tier')).not.toBeInTheDocument();
  expect(screen.queryByText('Essential Tier')).not.toBeInTheDocument();
});

it('hides the tier ladder for a top-tier customer but keeps the contact footer', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 't3' }));
  mockTiers(rewardTiers());

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Questions? Contact us at 1-833-397-2619')).toBeInTheDocument();
  expect(screen.queryByText("What's Available as Your Orders Grow?")).not.toBeInTheDocument();
  expect(
    screen.queryByText('When you reach the next level, your tier upgrades automatically.'),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Place your next order' })).toBeInTheDocument();
});

it('hides the tier ladder when the customer tier is unknown', async () => {
  mockLoyaltyApis(buildLoyaltyCustomerWith({ currentLoyaltyTierId: 'not-in-list' }));
  mockTiers(rewardTiers());

  renderWithProviders(<Loyalty />);

  expect(await screen.findByText('Questions? Contact us at 1-833-397-2619')).toBeInTheDocument();
  expect(screen.queryByText("What's Available as Your Orders Grow?")).not.toBeInTheDocument();
});
