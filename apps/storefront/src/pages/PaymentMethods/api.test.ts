import { assertQueryParams, http, HttpResponse, startMockServer } from 'tests/test-utils';

import {
  deleteStoredInstrument,
  getVaultClientToken,
  listStoredInstruments,
  PaymentMethodsError,
  setDefaultStoredInstrument,
  vaultInstrument,
} from './api';

vi.mock('@/utils/b3Logger');

const { server } = startMockServer();

const apiBase = 'https://api.example.com';
const appClientId = 'ssw-app-client-id';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

beforeEach(() => {
  window.BC_CONTEXT = { paymentMethods: { apiBase, appClientId } };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

const mockJwt = (jwt = 'fresh-jwt') =>
  server.use(http.get(currentJwtUrl, () => HttpResponse.text(jwt)));

const emptyList = { customerId: 999, instruments: [] };

it('normalizes a PascalCase backend response (.NET serialization) to camelCase', async () => {
  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () =>
      HttpResponse.json({
        CustomerId: 999,
        Instruments: [
          {
            Token: 'tok-1',
            Last4: '1111',
            Brand: 'VISA',
            ExpiryMonth: 3,
            ExpiryYear: 2028,
            Type: 'stored_card',
            IsDefault: false,
            Source: 'braintree',
          },
        ],
      }),
    ),
  );

  const result = await listStoredInstruments();

  expect(result).toEqual({
    customerId: 999,
    instruments: [
      {
        token: 'tok-1',
        last4: '1111',
        brand: 'VISA',
        expiryMonth: 3,
        expiryYear: 2028,
        type: 'stored_card',
        isDefault: false,
        source: 'braintree',
      },
    ],
  });
});

it('defaults source to empty string when the backend omits it', async () => {
  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () =>
      HttpResponse.json({
        CustomerId: 999,
        Instruments: [
          {
            Token: 'tok-1',
            Last4: '1111',
            Brand: 'VISA',
            ExpiryMonth: 3,
            ExpiryYear: 2028,
            Type: 'card',
            IsDefault: false,
          },
        ],
      }),
    ),
  );

  const result = await listStoredInstruments();

  expect(result.instruments[0].source).toBe('');
});

it('listStoredInstruments posts the fresh jwt and returns the instrument list', async () => {
  const requestBody = vi.fn();

  server.use(
    http.get(currentJwtUrl, ({ request }) => {
      assertQueryParams(request, { app_client_id: appClientId });

      return HttpResponse.text('fresh-jwt');
    }),
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, async ({ request }) => {
      requestBody(await request.json());

      return HttpResponse.json(emptyList);
    }),
  );

  const result = await listStoredInstruments();

  expect(requestBody).toHaveBeenCalledWith({ Jwt: 'fresh-jwt' });
  expect(result).toEqual(emptyList);
});

it('setDefaultStoredInstrument posts the jwt and token', async () => {
  const requestBody = vi.fn();

  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/SetDefaultStoredInstrument`, async ({ request }) => {
      requestBody(await request.json());

      return HttpResponse.json(emptyList);
    }),
  );

  const result = await setDefaultStoredInstrument('tok-1');

  expect(requestBody).toHaveBeenCalledWith({ Jwt: 'fresh-jwt', Token: 'tok-1' });
  expect(result).toEqual(emptyList);
});

it('deleteStoredInstrument posts the jwt and token', async () => {
  const requestBody = vi.fn();

  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/DeleteStoredInstrument`, async ({ request }) => {
      requestBody(await request.json());

      return HttpResponse.json(emptyList);
    }),
  );

  const result = await deleteStoredInstrument('tok-2');

  expect(requestBody).toHaveBeenCalledWith({ Jwt: 'fresh-jwt', Token: 'tok-2' });
  expect(result).toEqual(emptyList);
});

it('maps a failed jwt fetch to sessionExpired', async () => {
  // getCurrentCustomerJWT returns undefined when the response body contains "errors"
  server.use(http.get(currentJwtUrl, () => HttpResponse.text('{"errors":[]}', { status: 401 })));

  const error = await listStoredInstruments().catch((e) => e);

  expect(error).toBeInstanceOf(PaymentMethodsError);
  expect(error.kind).toBe('sessionExpired');
});

it('maps a thrown jwt fetch to sessionExpired', async () => {
  // non-ok response without "errors" makes getCurrentCustomerJWT throw
  server.use(http.get(currentJwtUrl, () => HttpResponse.text('nope', { status: 500 })));

  const error = await listStoredInstruments().catch((e) => e);

  expect(error).toBeInstanceOf(PaymentMethodsError);
  expect(error.kind).toBe('sessionExpired');
});

it.each([
  [401, 'sessionExpired'],
  [404, 'notFound'],
  [429, 'rateLimited'],
  [500, 'upstream'],
  [502, 'upstream'],
])('maps API status %i to %s', async (status, kind) => {
  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () =>
      HttpResponse.json({ error: 'whatever' }, { status }),
    ),
  );

  const error = await listStoredInstruments().catch((e) => e);

  expect(error).toBeInstanceOf(PaymentMethodsError);
  expect(error.kind).toBe(kind);
});

it('maps a network failure to upstream', async () => {
  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () => HttpResponse.error()),
  );

  const error = await listStoredInstruments().catch((e) => e);

  expect(error).toBeInstanceOf(PaymentMethodsError);
  expect(error.kind).toBe('upstream');
});

describe('getVaultClientToken', () => {
  it('POSTs the Jwt and returns the clientToken', async () => {
    mockJwt();
    const requestBody = vi.fn();
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultClientToken`, async ({ request }) => {
        requestBody(await request.json());

        return HttpResponse.json({ clientToken: 'bt-client-token' });
      }),
    );

    expect(await getVaultClientToken()).toBe('bt-client-token');
    expect(requestBody).toHaveBeenCalledWith({ Jwt: 'fresh-jwt' });
  });

  it('maps 502 to an upstream error', async () => {
    mockJwt();
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultClientToken`, () =>
        HttpResponse.json({ error: 'upstream_unavailable' }, { status: 502 }),
      ),
    );

    await expect(getVaultClientToken()).rejects.toMatchObject({ kind: 'upstream' });
  });
});

describe('vaultInstrument', () => {
  it('POSTs Jwt, Nonce and DeviceData and normalizes the returned card', async () => {
    mockJwt();
    const requestBody = vi.fn();
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultInstrument`, async ({ request }) => {
        requestBody(await request.json());

        return HttpResponse.json({
          Token: 'tok-new',
          Last4: '1111',
          Brand: 'Visa',
          ExpiryMonth: 12,
          ExpiryYear: 2030,
          Type: 'card',
          IsDefault: true,
          Source: 'braintree',
        });
      }),
    );

    const card = await vaultInstrument({ nonce: 'fake-nonce', deviceData: '{"d":1}' });

    expect(requestBody).toHaveBeenCalledWith({
      Jwt: 'fresh-jwt',
      Nonce: 'fake-nonce',
      DeviceData: '{"d":1}',
    });
    expect(card).toEqual({
      token: 'tok-new',
      last4: '1111',
      brand: 'Visa',
      expiryMonth: 12,
      expiryYear: 2030,
      type: 'card',
      isDefault: true,
      source: 'braintree',
    });
  });

  it('omits DeviceData from the body when collection failed', async () => {
    mockJwt();
    const requestBody = vi.fn();
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultInstrument`, async ({ request }) => {
        requestBody(await request.json());

        return HttpResponse.json({ Token: 'tok-new', IsDefault: true });
      }),
    );

    await vaultInstrument({ nonce: 'fake-nonce' });

    expect(requestBody).toHaveBeenCalledWith({ Jwt: 'fresh-jwt', Nonce: 'fake-nonce' });
  });

  it('maps 422 to a declined error carrying the declineReason', async () => {
    mockJwt();
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultInstrument`, () =>
        HttpResponse.json({ declineReason: 'CVV verification failed' }, { status: 422 }),
      ),
    );

    await expect(vaultInstrument({ nonce: 'fake-nonce' })).rejects.toMatchObject({
      kind: 'declined',
      declineReason: 'CVV verification failed',
    });
  });

  it('maps 429 to rateLimited and 502 to upstream — a decline is neither', async () => {
    mockJwt();
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultInstrument`, () =>
        HttpResponse.json({}, { status: 429 }),
      ),
    );
    await expect(vaultInstrument({ nonce: 'fake-nonce' })).rejects.toMatchObject({
      kind: 'rateLimited',
    });

    server.use(
      http.post(`${apiBase}/customers/Customer/VaultInstrument`, () =>
        HttpResponse.json({ error: 'upstream_unavailable' }, { status: 502 }),
      ),
    );
    await expect(vaultInstrument({ nonce: 'fake-nonce' })).rejects.toMatchObject({
      kind: 'upstream',
    });
  });
});
