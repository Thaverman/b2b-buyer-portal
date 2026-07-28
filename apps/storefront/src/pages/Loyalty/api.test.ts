import {
  assertQueryParams,
  builder,
  faker,
  http,
  HttpResponse,
  startMockServer,
} from 'tests/test-utils';

import b2bLogger from '@/utils/b3Logger';

import {
  fetchEarnedRewards,
  fetchLoyaltyCustomer,
  fetchPointsHistory,
  fetchRedeemRules,
  fetchTierProgress,
  fetchTiers,
  getAllowedTiers,
  getBannerUrl,
  getFaqIntro,
  getFaqItems,
  getLoyaltyDigest,
  getShippingCalculation,
  isRedeemableCatalogRule,
  isShippingTrackerAvailable,
  isTierAllowed,
  isTierProgressAvailable,
  LoyaltyError,
  LoyaltyIdentity,
  LoyaltyTierProgress,
  parseAllowedTiers,
  redeemReward,
} from './api';

vi.mock('@/utils/b3Logger');

const { server } = startMockServer();

const shopKey = 'store-key';
const apiBase = 'https://ssw.example.com/customers';
const appClientId = 'ssw-app-client-id';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';
const digestUrl = `${apiBase}/loyalty/digest`;

const buildLoyaltyIdentityWith = builder<LoyaltyIdentity>(() => ({
  digest: faker.string.hexadecimal({ length: 64, prefix: '' }).toLowerCase(),
  customerId: faker.number.int({ min: 1, max: 99999 }).toString(),
  email: faker.internet.email().toLowerCase(),
}));

const identity = buildLoyaltyIdentityWith({});

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

const mockJwt = (jwt = 'fresh-jwt') =>
  server.use(
    http.get(currentJwtUrl, ({ request }) => {
      assertQueryParams(request, { app_client_id: appClientId });

      return HttpResponse.text(jwt);
    }),
  );

describe('getLoyaltyDigest', () => {
  it('posts the fresh jwt and returns the identity', async () => {
    const requestBody = vi.fn();

    mockJwt();
    server.use(
      http.post(digestUrl, async ({ request }) => {
        requestBody(await request.json());

        return HttpResponse.json(identity);
      }),
    );

    const result = await getLoyaltyDigest();

    expect(requestBody).toHaveBeenCalledWith({ jwt: 'fresh-jwt' });
    expect(result).toEqual(identity);
  });

  it('normalizes a PascalCase backend response (.NET serialization)', async () => {
    mockJwt();
    server.use(
      http.post(digestUrl, () =>
        HttpResponse.json({
          Digest: identity.digest,
          CustomerId: Number(identity.customerId),
          Email: identity.email,
        }),
      ),
    );

    const result = await getLoyaltyDigest();

    expect(result).toEqual(identity);
  });

  it('maps a failed jwt fetch to sessionExpired', async () => {
    // getCurrentCustomerJWT returns undefined when the response body contains "errors"
    server.use(http.get(currentJwtUrl, () => HttpResponse.text('{"errors":[]}', { status: 401 })));

    const error = await getLoyaltyDigest().catch((e) => e);

    expect(error).toBeInstanceOf(LoyaltyError);
    expect(error.kind).toBe('sessionExpired');
  });

  it.each([
    [401, 'sessionExpired'],
    [429, 'rateLimited'],
    [500, 'upstream'],
    [502, 'upstream'],
  ])('maps digest-endpoint status %i to %s', async (status, kind) => {
    mockJwt();
    server.use(http.post(digestUrl, () => HttpResponse.json({}, { status })));

    const error = await getLoyaltyDigest().catch((e) => e);

    expect(error).toBeInstanceOf(LoyaltyError);
    expect(error.kind).toBe(kind);
  });

  it('maps a network failure to upstream', async () => {
    mockJwt();
    server.use(http.post(digestUrl, () => HttpResponse.error()));

    const error = await getLoyaltyDigest().catch((e) => e);

    expect(error).toBeInstanceOf(LoyaltyError);
    expect(error.kind).toBe('upstream');
  });
});

const launcherCustomerUrl = 'https://launcher.api.influence.io/launcher/v1/customer';

describe('fetchLoyaltyCustomer', () => {
  it('sends the identity trio and digest as query params and normalizes the response', async () => {
    server.use(
      http.get(launcherCustomerUrl, ({ request }) => {
        assertQueryParams(request, {
          shop: shopKey,
          customer_id: identity.customerId,
          customer_email: identity.email,
          digest: identity.digest,
        });

        return HttpResponse.json({
          pointBalance: 2465,
          currentLoyaltyTierId: 'tier-2',
          currentLoyaltyTierProgress: 240,
          createdAt: '2026-01-15T00:00:00.000Z',
          followInstagram: true,
        });
      }),
    );

    const result = await fetchLoyaltyCustomer(identity);

    expect(result).toEqual({
      pointBalance: 2465,
      currentLoyaltyTierId: 'tier-2',
      currentLoyaltyTierProgress: 240,
      createdAt: '2026-01-15T00:00:00.000Z',
      followInstagram: true,
      followTikTok: false,
      followTwitter: false,
      likeFacebook: false,
      currentMembership: null,
    });
  });

  it.each([
    [401, 'misconfigured'],
    [404, 'notEnrolled'],
    [429, 'rateLimited'],
    [500, 'upstream'],
  ])('maps Launcher status %i to %s', async (status, kind) => {
    server.use(http.get(launcherCustomerUrl, () => HttpResponse.json({}, { status })));

    const error = await fetchLoyaltyCustomer(identity).catch((e) => e);

    expect(error).toBeInstanceOf(LoyaltyError);
    expect(error.kind).toBe(kind);
  });

  it('maps the currentMembership object when present', async () => {
    server.use(
      http.get(launcherCustomerUrl, () =>
        HttpResponse.json({
          pointBalance: 100,
          currentMembership: {
            id: 'm1',
            title: 'VIP Gold',
            perks: ['Free expedited shipping', 'Early access'],
          },
        }),
      ),
    );

    const result = await fetchLoyaltyCustomer(identity);

    expect(result.currentMembership).toEqual({
      id: 'm1',
      title: 'VIP Gold',
      perks: ['Free expedited shipping', 'Early access'],
    });
  });
});

describe('fetchTiers', () => {
  it('fetches shop tiers with only the shop key and normalizes them', async () => {
    server.use(
      http.get('https://launcher.api.influence.io/launcher/v1/shop/tiers', ({ request }) => {
        assertQueryParams(request, { shop: shopKey });

        return HttpResponse.json({
          rules: [
            { id: 't1', title: 'Select', threshold: '0', perks: ['5% credit on every order'] },
            { id: 't2', title: 'Elite', threshold: '300' },
          ],
        });
      }),
    );

    const result = await fetchTiers();

    expect(result).toEqual([
      { id: 't1', title: 'Select', threshold: '0', perks: ['5% credit on every order'] },
      { id: 't2', title: 'Elite', threshold: '300', perks: [] },
    ]);
  });
});

describe('fetchRedeemRules and isRedeemableCatalogRule', () => {
  it('normalizes redeem rules preferring customTitle', async () => {
    server.use(
      http.get('https://launcher.api.influence.io/launcher/v1/shop/rules/redeem', ({ request }) => {
        assertQueryParams(request, { shop: shopKey });

        return HttpResponse.json({
          rules: [
            { id: 'rr1', title: 'Free shipping', pointCost: 1000, redeemType: 'freeshipping' },
            {
              id: 'rr2',
              customTitle: '$5 gift card',
              title: 'Gift card',
              pointCost: 500,
              redeemType: 'giftcard',
              status: 'active',
            },
          ],
        });
      }),
    );

    const result = await fetchRedeemRules();

    expect(result).toEqual([
      {
        id: 'rr1',
        title: 'Free shipping',
        pointCost: 1000,
        redeemType: 'freeshipping',
        status: '',
        minRedeemablePoints: null,
        maxRedeemablePoints: null,
      },
      {
        id: 'rr2',
        title: '$5 gift card',
        pointCost: 500,
        redeemType: 'giftcard',
        status: 'active',
        minRedeemablePoints: null,
        maxRedeemablePoints: null,
      },
    ]);
  });

  it.each([
    [{ pointCost: 500, minRedeemablePoints: null, maxRedeemablePoints: null, status: '' }, true],
    [
      { pointCost: 500, minRedeemablePoints: null, maxRedeemablePoints: null, status: 'active' },
      true,
    ],
    [
      { pointCost: 500, minRedeemablePoints: null, maxRedeemablePoints: null, status: 'ACTIVE' },
      true,
    ],
    [{ pointCost: null, minRedeemablePoints: null, maxRedeemablePoints: null, status: '' }, false],
    [{ pointCost: 500, minRedeemablePoints: 100, maxRedeemablePoints: null, status: '' }, false],
    [{ pointCost: 500, minRedeemablePoints: null, maxRedeemablePoints: 900, status: '' }, false],
    [
      { pointCost: 500, minRedeemablePoints: null, maxRedeemablePoints: null, status: 'paused' },
      false,
    ],
  ])('filters catalog rules: %j -> %j', (partial, expected) => {
    const rule = { id: 'r', title: 't', redeemType: 'x', ...partial };

    expect(isRedeemableCatalogRule(rule)).toBe(expected);
  });
});

describe('redeemReward', () => {
  it('posts identity, shop, digest, ruleId and redemptionSource in the body', async () => {
    const requestBody = vi.fn();

    server.use(
      http.post(
        'https://launcher.api.influence.io/launcher/v1/customer/redeem',
        async ({ request }) => {
          requestBody(await request.json());

          return HttpResponse.json({ success: true, couponCode: 'SAVE-123' });
        },
      ),
    );

    const result = await redeemReward(identity, 'rr1');

    expect(requestBody).toHaveBeenCalledWith({
      customer: { id: identity.customerId, email: identity.email },
      shop: shopKey,
      digest: identity.digest,
      ruleId: 'rr1',
      redemptionSource: 'buyer-portal',
    });
    expect(result).toEqual({ success: true, couponCode: 'SAVE-123' });
  });
});

describe('fetchEarnedRewards', () => {
  it('sends identity as query params, forwards nextToken, and normalizes the page', async () => {
    server.use(
      http.get(
        'https://launcher.api.influence.io/launcher/v1/customer/all-rewards',
        ({ request }) => {
          assertQueryParams(request, {
            shop: shopKey,
            customer_id: identity.customerId,
            customer_email: identity.email,
            digest: identity.digest,
            nextToken: 'page-2',
          });

          return HttpResponse.json({
            items: [
              { id: 'w1', couponCode: 'SAVE-123', title: '$5 discount', createdAt: '2026-06-01' },
            ],
            nextToken: null,
          });
        },
      ),
    );

    const result = await fetchEarnedRewards(identity, 'page-2');

    expect(result).toEqual({
      items: [{ id: 'w1', couponCode: 'SAVE-123', title: '$5 discount', createdAt: '2026-06-01' }],
      nextToken: null,
    });
  });
});

describe('fetchPointsHistory', () => {
  it('sends identity and limit as query params and normalizes the page', async () => {
    server.use(
      http.get('https://launcher.api.influence.io/launcher/v1/customer/points', ({ request }) => {
        assertQueryParams(request, {
          shop: shopKey,
          customer_id: identity.customerId,
          customer_email: identity.email,
          digest: identity.digest,
          limit: '10',
        });

        return HttpResponse.json({
          items: [
            {
              id: 'a1',
              action: 'earned',
              status: 'approved',
              points: 50,
              createdAt: '2026-06-20',
              customDescription: 'Order #1001',
            },
          ],
          nextToken: 'page-2',
        });
      }),
    );

    const result = await fetchPointsHistory(identity);

    expect(result).toEqual({
      items: [
        {
          id: 'a1',
          action: 'earned',
          status: 'approved',
          points: 50,
          createdAt: '2026-06-20',
          customDescription: 'Order #1001',
        },
      ],
      nextToken: 'page-2',
    });
  });
});

const shippingConfig = { threshold: 300, excludedProductIds: '', excludedCategoryIds: '' };

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

describe('isShippingTrackerAvailable', () => {
  it('is false when loyaltyShippingConfig is absent', () => {
    window.getLoyaltyShippingCalculation = vi.fn();

    expect(isShippingTrackerAvailable()).toBe(false);
  });

  it('is false when getLoyaltyShippingCalculation is absent', () => {
    window.loyaltyShippingConfig = shippingConfig;

    expect(isShippingTrackerAvailable()).toBe(false);
  });

  it('is true when both theme globals are present', () => {
    window.loyaltyShippingConfig = shippingConfig;
    window.getLoyaltyShippingCalculation = vi.fn();

    expect(isShippingTrackerAvailable()).toBe(true);
  });
});

describe('getShippingCalculation', () => {
  it('normalizes a complete calculation result', async () => {
    window.loyaltyShippingConfig = shippingConfig;
    window.getLoyaltyShippingCalculation = vi.fn().mockResolvedValue(
      buildRawShippingCalculationWith({
        qualifies: false,
        threshold: 300,
        eligibleSubtotal: 130.85,
        remaining: 169.15,
      }),
    );

    const result = await getShippingCalculation();

    expect(result).toEqual({
      qualifies: false,
      threshold: 300,
      eligibleSubtotal: 130.85,
      remaining: 169.15,
    });
  });

  it('defaults missing fields, falling back to the config threshold', async () => {
    window.loyaltyShippingConfig = { ...shippingConfig, threshold: 500 };
    window.getLoyaltyShippingCalculation = vi.fn().mockResolvedValue({
      eligibleSubtotal: 130.85,
    });

    const result = await getShippingCalculation();

    expect(result).toEqual({
      qualifies: false,
      threshold: 500,
      eligibleSubtotal: 130.85,
      remaining: 369.15,
    });
  });

  it('defaults everything to zero on an empty result with no config', async () => {
    window.getLoyaltyShippingCalculation = vi.fn().mockResolvedValue({});

    const result = await getShippingCalculation();

    expect(result).toEqual({ qualifies: false, threshold: 0, eligibleSubtotal: 0, remaining: 0 });
  });

  it('logs and maps a rejection to upstream', async () => {
    window.loyaltyShippingConfig = shippingConfig;
    window.getLoyaltyShippingCalculation = vi.fn().mockRejectedValue(new Error('cart api down'));

    const error = await getShippingCalculation().catch((e) => e);

    expect(error).toBeInstanceOf(LoyaltyError);
    expect(error.kind).toBe('upstream');
    expect(b2bLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Loyalty: shipping calculation failed'),
    );
  });

  it('throws when the theme function is absent', async () => {
    const error = await getShippingCalculation().catch((e) => e);

    expect(error).toBeInstanceOf(Error);
  });
});

describe('parseAllowedTiers', () => {
  it.each([
    [undefined, []],
    ['', []],
    [' , ,', []],
    ['ESSENTIAL,SELECT,SIGNATURE', ['essential', 'select', 'signature']],
    ['  Signature , select ', ['signature', 'select']],
  ] as [string | undefined, string[]][])('parses %j to %j', (csv, expected) => {
    expect(parseAllowedTiers(csv)).toEqual(expected);
  });
});

describe('isTierAllowed', () => {
  it.each([
    ['SIGNATURE', [], true],
    [null, [], true],
    ['SIGNATURE', ['signature'], true],
    ['  Signature ', ['signature'], true],
    ['ELITE', ['signature', 'select'], false],
    [null, ['signature'], false],
    [undefined, ['signature'], false],
    ['', ['signature'], false],
  ] as [string | null | undefined, string[], boolean][])(
    'tier %j vs list %j → %j',
    (tierTitle, allowed, expected) => {
      expect(isTierAllowed(tierTitle, allowed)).toBe(expected);
    },
  );
});

describe('getAllowedTiers', () => {
  it('degrades a missing rollout global to an empty allowlist (fail open)', () => {
    expect(getAllowedTiers()).toEqual([]);
  });

  it('reads and parses the theme rollout global', () => {
    window.loyaltyRolloutConfig = { allowedTiers: 'ESSENTIAL,SELECT,SIGNATURE' };

    expect(getAllowedTiers()).toEqual(['essential', 'select', 'signature']);
  });
});

const progressUrl =
  'https://ssw.example.com/customers/loyaltycustomersclient/GetDetailWithProgress';

const withProgressSite = () => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, progressSite: 'StoreSupply' } };
};

describe('isTierProgressAvailable', () => {
  it('is false when progressSite is not configured', () => {
    expect(isTierProgressAvailable()).toBe(false);
  });

  it('is true when the loyalty config includes progressSite', () => {
    withProgressSite();

    expect(isTierProgressAvailable()).toBe(true);
  });
});

describe('fetchTierProgress', () => {
  it('sends site, store hash, customer id and take=0, and maps the PascalCase payload', async () => {
    withProgressSite();
    server.use(
      http.get(progressUrl, ({ request }) => {
        assertQueryParams(request, {
          site: 'StoreSupply',
          bigCommerceStoreId: 'store-hash',
          bigCommerceCustomerId: '264074',
          recentTransactionsTake: '0',
        });

        return HttpResponse.json({
          Success: true,
          Result: {
            TierProgress: {
              CurrentTierName: 'Select',
              TargetKind: 'NextTier',
              TargetTierName: 'Signature',
              OrdersInWindow: 39,
              TargetOrdersRequired: 75,
              SpendInWindow: 2097.85,
              TargetAmountRequired: 5000,
              OrdersProgressPct: 52,
              SpendProgressPct: 41.96,
              Summary: "36 more order(s) OR $2902.15 more spend away from 'Signature'.",
            },
          },
        });
      }),
    );

    const result: LoyaltyTierProgress | null = await fetchTierProgress(264074);

    expect(result).toEqual({
      targetKind: 'NextTier',
      currentTierName: 'Select',
      targetTierName: 'Signature',
      ordersInWindow: 39,
      targetOrdersRequired: 75,
      spendInWindow: 2097.85,
      targetAmountRequired: 5000,
      ordersProgressPct: 52,
      spendProgressPct: 41.96,
      summary: "36 more order(s) OR $2902.15 more spend away from 'Signature'.",
    });
  });

  it.each([
    ['Success false', { Success: false, Result: { TierProgress: { TargetKind: 'NextTier' } } }],
    ['TierProgress null', { Success: true, Result: { TierProgress: null } }],
    ['Result missing', { Success: true }],
    [
      'top tier (TargetKind not NextTier)',
      { Success: true, Result: { TierProgress: { TargetKind: 'AtTop' } } },
    ],
  ])('returns null for %s', async (_label, payload) => {
    withProgressSite();
    server.use(http.get(progressUrl, () => HttpResponse.json(payload)));

    expect(await fetchTierProgress(264074)).toBeNull();
  });

  it.each([
    [429, 'rateLimited'],
    [500, 'upstream'],
  ])('maps status %i to %s', async (status, kind) => {
    withProgressSite();
    server.use(http.get(progressUrl, () => HttpResponse.json({}, { status })));

    const error = await fetchTierProgress(264074).catch((e) => e);

    expect(error).toBeInstanceOf(LoyaltyError);
    expect(error.kind).toBe(kind);
  });

  it('maps a network failure to upstream', async () => {
    withProgressSite();
    server.use(http.get(progressUrl, () => HttpResponse.error()));

    const error = await fetchTierProgress(264074).catch((e) => e);

    expect(error).toBeInstanceOf(LoyaltyError);
    expect(error.kind).toBe('upstream');
  });
});

describe('fetchTierProgress target kinds', () => {
  it('maps a PrePointsGate payload, keeping the spend gate and summary', async () => {
    withProgressSite();
    server.use(
      http.get(progressUrl, () =>
        HttpResponse.json({
          Success: true,
          Result: {
            TierProgress: {
              CurrentTierName: 'Signature',
              TargetKind: 'PrePointsGate',
              TargetTierName: 'Signature',
              TargetOrdersRequired: 0,
              TargetAmountRequired: 5000,
              OrdersInWindow: 39,
              SpendInWindow: 2097.85,
              OrdersProgressPct: 0,
              SpendProgressPct: 41.96,
              Summary:
                "Spend $2902.15 more in the next 365-day window to start earning points on the 'Signature' tier.",
            },
          },
        }),
      ),
    );

    const result = await fetchTierProgress(264074);

    expect(result).toEqual({
      targetKind: 'PrePointsGate',
      currentTierName: 'Signature',
      targetTierName: 'Signature',
      ordersInWindow: 39,
      targetOrdersRequired: 0,
      spendInWindow: 2097.85,
      targetAmountRequired: 5000,
      ordersProgressPct: 0,
      spendProgressPct: 41.96,
      summary:
        "Spend $2902.15 more in the next 365-day window to start earning points on the 'Signature' tier.",
    });
  });

  it('still maps NextTier with its target kind', async () => {
    withProgressSite();
    server.use(
      http.get(progressUrl, () =>
        HttpResponse.json({
          Success: true,
          Result: { TierProgress: { TargetKind: 'NextTier', TargetTierName: 'Signature' } },
        }),
      ),
    );

    const result = await fetchTierProgress(264074);

    expect(result?.targetKind).toBe('NextTier');
    expect(result?.targetTierName).toBe('Signature');
  });

  it('returns null for AtTop', async () => {
    withProgressSite();
    server.use(
      http.get(progressUrl, () =>
        HttpResponse.json({ Success: true, Result: { TierProgress: { TargetKind: 'AtTop' } } }),
      ),
    );

    expect(await fetchTierProgress(264074)).toBeNull();
  });
});

describe('getBannerUrl', () => {
  it('defaults to the storefront-relative banner path', () => {
    window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };

    expect(getBannerUrl()).toBe('/content/images/loyalty/loyalty-account-banner.jpg');
  });

  it('prefers a non-blank theme override', () => {
    window.BC_CONTEXT = {
      loyalty: { shopKey, apiBase, appClientId, bannerUrl: 'https://cdn.example.com/hero.jpg' },
    };

    expect(getBannerUrl()).toBe('https://cdn.example.com/hero.jpg');
  });

  it('falls back to the default when the override is blank', () => {
    window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId, bannerUrl: '   ' } };

    expect(getBannerUrl()).toBe('/content/images/loyalty/loyalty-account-banner.jpg');
  });
});

describe('getFaqItems and getFaqIntro', () => {
  it('returns an empty list and intro when the theme global is absent', () => {
    expect(getFaqItems()).toEqual([]);
    expect(getFaqIntro()).toBe('');
  });

  it('drops items missing a question or an answer', () => {
    window.loyaltyFaqConfig = {
      intro: 'Ask away.',
      items: [
        { question: 'How do I earn?', answer: 'Place orders.' },
        { question: 'No answer' },
        { answer: 'No question' },
        { question: '  ', answer: 'blank question' },
      ],
    };

    expect(getFaqItems()).toEqual([{ question: 'How do I earn?', answer: 'Place orders.' }]);
    expect(getFaqIntro()).toBe('Ask away.');
  });

  it('degrades an items-less config to an empty list', () => {
    window.loyaltyFaqConfig = {};

    expect(getFaqItems()).toEqual([]);
  });
});
