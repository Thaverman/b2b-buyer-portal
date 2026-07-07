import {
  assertQueryParams,
  builder,
  faker,
  http,
  HttpResponse,
  startMockServer,
} from 'tests/test-utils';

import {
  fetchLoyaltyCustomer,
  fetchTiers,
  getLoyaltyDigest,
  LoyaltyError,
  LoyaltyIdentity,
  parseThreshold,
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
