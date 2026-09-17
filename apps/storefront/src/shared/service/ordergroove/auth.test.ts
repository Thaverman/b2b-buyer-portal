import { delay, faker, http, HttpResponse, startMockServer } from 'tests/test-utils';

import { getAuthorizationHeader, invalidateAuthorization } from './auth';

const { server } = startMockServer();

const authEndpoint = 'https://api.example.com/products/productclient/ordergroove-auth';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

// Each test uses a fresh customer id: the header cache is keyed by it and lives for the module.
const someCustomerId = () => String(faker.number.int({ min: 1, max: 1_000_000 }));

const mockJwt = () => server.use(http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')));

beforeEach(() => {
  window.BC_CONTEXT = {
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint,
      appClientId: 'ssw-app-client-id',
    },
  };
  invalidateAuthorization();
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('mints the Ordergroove header from the middleware triplet', async () => {
  const requestBody = vi.fn();

  mockJwt();
  server.use(
    http.post(authEndpoint, async ({ request }) => {
      requestBody(await request.json());

      return HttpResponse.json({
        success: true,
        cookieValue: '80591|1789495813|UPC2kmuw/c77nskIaDZqwn/u//YFNj4jVcfVM42uQck=',
        expiresIn: 7200,
      });
    }),
  );

  const header = await getAuthorizationHeader('80591');

  expect(JSON.parse(header)).toEqual({
    public_id: 'merchant-public-id',
    sig_field: '80591',
    ts: 1789495813,
    sig: 'UPC2kmuw/c77nskIaDZqwn/u//YFNj4jVcfVM42uQck=',
  });
  // Forward-compatible contract (spec §4): today's endpoint reads customerId, the hardened one reads Jwt.
  expect(requestBody).toHaveBeenCalledWith({
    Jwt: 'fresh-jwt',
    customerId: '80591',
    storeHash: expect.any(String),
  });
});

it('reuses the header for the same customer instead of minting again', async () => {
  const mints = vi.fn();
  const customerId = someCustomerId();

  mockJwt();
  server.use(
    http.post(authEndpoint, () => {
      mints();

      return HttpResponse.json({
        success: true,
        cookieValue: `${customerId}|1|sig`,
        expiresIn: 7200,
      });
    }),
  );

  const first = await getAuthorizationHeader(customerId);
  const second = await getAuthorizationHeader(customerId);

  expect(second).toBe(first);
  expect(mints).toHaveBeenCalledTimes(1);
});

it('shares one in-flight mint between concurrent callers', async () => {
  const mints = vi.fn();
  const customerId = someCustomerId();

  mockJwt();
  server.use(
    http.post(authEndpoint, async () => {
      mints();
      await delay(50);

      return HttpResponse.json({
        success: true,
        cookieValue: `${customerId}|1|sig`,
        expiresIn: 7200,
      });
    }),
  );

  // Six page queries start before the first mint resolves; they must not each mint their own.
  const headers = await Promise.all([
    getAuthorizationHeader(customerId),
    getAuthorizationHeader(customerId),
    getAuthorizationHeader(customerId),
  ]);

  expect(new Set(headers).size).toBe(1);
  expect(mints).toHaveBeenCalledTimes(1);
});

it('mints again after the cache is invalidated', async () => {
  const mints = vi.fn();
  const customerId = someCustomerId();

  mockJwt();
  server.use(
    http.post(authEndpoint, () => {
      mints();

      return HttpResponse.json({
        success: true,
        cookieValue: `${customerId}|1|sig`,
        expiresIn: 7200,
      });
    }),
  );

  await getAuthorizationHeader(customerId);
  invalidateAuthorization();
  await getAuthorizationHeader(customerId);

  expect(mints).toHaveBeenCalledTimes(2);
});

it('reports an expired session when there is no Current Customer JWT', async () => {
  server.use(http.get(currentJwtUrl, () => HttpResponse.text('{"errors":[]}', { status: 404 })));

  await expect(getAuthorizationHeader(someCustomerId())).rejects.toMatchObject({
    kind: 'sessionExpired',
  });
});

it('reports an expired session when the middleware rejects the JWT', async () => {
  mockJwt();
  server.use(http.post(authEndpoint, () => new HttpResponse(null, { status: 401 })));

  await expect(getAuthorizationHeader(someCustomerId())).rejects.toMatchObject({
    kind: 'sessionExpired',
  });
});

it('reports upstream when the middleware fails or returns a malformed triplet', async () => {
  mockJwt();
  server.use(http.post(authEndpoint, () => new HttpResponse(null, { status: 500 })));
  await expect(getAuthorizationHeader(someCustomerId())).rejects.toMatchObject({
    kind: 'upstream',
  });

  server.use(
    http.post(authEndpoint, () =>
      HttpResponse.json({ success: true, cookieValue: 'not-a-triplet' }),
    ),
  );
  await expect(getAuthorizationHeader(someCustomerId())).rejects.toMatchObject({
    kind: 'upstream',
  });
});

it('reports unavailable when the host config is missing', async () => {
  delete window.BC_CONTEXT;

  await expect(getAuthorizationHeader(someCustomerId())).rejects.toMatchObject({
    kind: 'unavailable',
  });
});
