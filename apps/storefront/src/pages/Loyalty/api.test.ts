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
  completeSocialRule,
  EarnRule,
  fetchEarnedRewards,
  fetchEarnRules,
  fetchLoyaltyCustomer,
  fetchPointsHistory,
  fetchRedeemRules,
  fetchTiers,
  getAllowedTiers,
  getLoyaltyDigest,
  getShippingCalculation,
  getSocialCompletionFlag,
  isEarnRuleForTier,
  isRedeemableCatalogRule,
  isShippingTrackerAvailable,
  isTierAllowed,
  LoyaltyError,
  LoyaltyIdentity,
  parseAllowedTiers,
  parseThreshold,
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

const buildEarnRuleWith = builder<EarnRule>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productName(),
  summary: '',
  earnType: '',
  templateName: '',
  socialUrl: '',
  earnValue: 0,
  limitTiers: false,
  loyaltyTierIds: [],
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

describe('parseThreshold', () => {
  it.each([
    ['300', 300],
    ['0', 0],
    ['not-a-number', null],
    ['', null],
  ])('parses %j to %j', (input, expected) => {
    expect(parseThreshold(input)).toBe(expected);
  });
});

describe('fetchEarnRules', () => {
  it('fetches earn rules with only the shop key and maps customTitle to title', async () => {
    server.use(
      http.get('https://launcher.api.influence.io/launcher/v1/shop/rules/earn', ({ request }) => {
        assertQueryParams(request, { shop: shopKey });

        return HttpResponse.json({
          rules: [
            {
              id: 'r1',
              customTitle: 'Make a purchase',
              summary: '2 points per $1',
              earnType: 'order',
              templateName: 'purchase',
            },
          ],
        });
      }),
    );

    const result = await fetchEarnRules();

    expect(result).toEqual([
      {
        id: 'r1',
        title: 'Make a purchase',
        summary: '2 points per $1',
        earnType: 'order',
        templateName: 'purchase',
        socialUrl: '',
        earnValue: 0,
        limitTiers: false,
        loyaltyTierIds: [],
      },
    ]);
  });

  it('falls back to title when customTitle is absent (real Launcher payload shape)', async () => {
    server.use(
      http.get('https://launcher.api.influence.io/launcher/v1/shop/rules/earn', () =>
        HttpResponse.json({
          rules: [
            {
              id: 'r2',
              title: 'Place an order',
              earnType: 'increments',
              templateName: 'placeorder',
            },
          ],
        }),
      ),
    );

    const result = await fetchEarnRules();

    expect(result).toEqual([
      {
        id: 'r2',
        title: 'Place an order',
        summary: '',
        earnType: 'increments',
        templateName: 'placeorder',
        socialUrl: '',
        earnValue: 0,
        limitTiers: false,
        loyaltyTierIds: [],
      },
    ]);
  });

  it('maps earnValue, limitTiers and loyaltyTierIds', async () => {
    server.use(
      http.get('https://launcher.api.influence.io/launcher/v1/shop/rules/earn', () =>
        HttpResponse.json({
          rules: [
            {
              id: 'r3',
              title: 'Place an order',
              earnType: 'increments',
              earnValue: 3,
              templateName: 'placeorder',
              limitTiers: true,
              loyaltyTierIds: ['29777d36-e455-44aa-a711-62f7c0ddad85'],
            },
          ],
        }),
      ),
    );

    const result = await fetchEarnRules();

    expect(result).toEqual([
      {
        id: 'r3',
        title: 'Place an order',
        summary: '',
        earnType: 'increments',
        templateName: 'placeorder',
        socialUrl: '',
        earnValue: 3,
        limitTiers: true,
        loyaltyTierIds: ['29777d36-e455-44aa-a711-62f7c0ddad85'],
      },
    ]);
  });
});

describe('completeSocialRule', () => {
  it('posts identity, shop, digest and ruleId in the body', async () => {
    const requestBody = vi.fn();

    server.use(
      http.post(
        'https://launcher.api.influence.io/launcher/v1/customer/social',
        async ({ request }) => {
          requestBody(await request.json());

          return HttpResponse.json({ success: true, points: 100, updatedBalance: 2565 });
        },
      ),
    );

    const result = await completeSocialRule(identity, 'r-social');

    expect(requestBody).toHaveBeenCalledWith({
      customer: { id: identity.customerId, email: identity.email },
      shop: shopKey,
      digest: identity.digest,
      ruleId: 'r-social',
    });
    expect(result).toEqual({ success: true, points: 100, updatedBalance: 2565 });
  });
});

describe('getSocialCompletionFlag', () => {
  it.each([
    ['instagram_follow', '', 'followInstagram'],
    ['', 'https://instagram.com/LoyaltyLionHQ', 'followInstagram'],
    ['tiktok_follow', '', 'followTikTok'],
    ['twitter_follow', '', 'followTwitter'],
    ['facebook_like', '', 'likeFacebook'],
    ['purchase', '', null],
  ])('maps templateName %j / socialUrl %j to %j', (templateName, socialUrl, expected) => {
    const rule = {
      id: 'r',
      title: '',
      summary: '',
      earnType: '',
      templateName,
      socialUrl,
      earnValue: 0,
      limitTiers: false,
      loyaltyTierIds: [],
    };

    expect(getSocialCompletionFlag(rule)).toBe(expected);
  });
});

describe('isEarnRuleForTier', () => {
  it.each([
    [false, [], 'tier-select', true],
    [true, ['tier-select'], 'tier-select', true],
    [true, ['tier-select'], 'tier-signature', false],
    [true, ['tier-select'], null, false],
  ] as [boolean, string[], string | null, boolean][])(
    'limitTiers=%j tierIds=%j currentTier=%j → %j',
    (limitTiers, loyaltyTierIds, currentTierId, expected) => {
      const rule = buildEarnRuleWith({ limitTiers, loyaltyTierIds });

      expect(isEarnRuleForTier(rule, currentTierId)).toBe(expected);
    },
  );
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
