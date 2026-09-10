import { assertQueryParams, http, HttpResponse, startMockServer } from 'tests/test-utils';

import {
  deleteStoredInstrument,
  getBraintreeClientToken,
  listStoredInstruments,
  PaymentMethodsError,
  setDefaultStoredInstrument,
  vaultBraintreeInstrument,
} from './api';
import { emptyBillingValues } from './billingPrefill';

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

it('maps a 422 to the declined kind', async () => {
  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/SetDefaultStoredInstrument`, () =>
      HttpResponse.json({}, { status: 422 }),
    ),
  );

  await expect(setDefaultStoredInstrument('card-token')).rejects.toMatchObject({
    kind: 'declined',
  });
});

describe('getBraintreeClientToken', () => {
  it('returns the client token', async () => {
    mockJwt();
    server.use(
      http.post(`${apiBase}/customers/Customer/BraintreeClientToken`, async ({ request }) => {
        expect(await request.json()).toEqual({ Jwt: 'fresh-jwt' });

        return HttpResponse.json({ clientToken: 'bt-client-token' });
      }),
    );

    expect(await getBraintreeClientToken()).toBe('bt-client-token');
  });

  it('surfaces an upstream failure', async () => {
    mockJwt();
    server.use(
      http.post(`${apiBase}/customers/Customer/BraintreeClientToken`, () =>
        HttpResponse.json({}, { status: 502 }),
      ),
    );

    await expect(getBraintreeClientToken()).rejects.toMatchObject({ kind: 'upstream' });
  });
});

describe('vaultBraintreeInstrument', () => {
  const billing = {
    ...emptyBillingValues,
    firstName: 'Ada',
    lastName: 'Lovelace',
    address1: '1 Analytical Way',
    city: 'Austin',
    stateOrProvinceCode: 'TX',
    postalCode: '78701',
    countryCode: 'US',
  };

  it('sends a PascalCase body with nested billing and returns the refreshed list', async () => {
    mockJwt();
    let received: unknown;

    server.use(
      http.post(`${apiBase}/customers/Customer/VaultBraintreeInstrument`, async ({ request }) => {
        received = await request.json();

        return HttpResponse.json({ CustomerId: 42, Instruments: [{ Last4: '4242' }] });
      }),
    );

    const result = await vaultBraintreeInstrument({
      nonce: 'fake-nonce',
      deviceData: '{"d":1}',
      billing,
      email: 'ada@example.com',
      makeDefault: true,
    });

    expect(received).toEqual({
      Jwt: 'fresh-jwt',
      Nonce: 'fake-nonce',
      DeviceData: '{"d":1}',
      MakeDefault: true,
      Billing: {
        FirstName: 'Ada',
        LastName: 'Lovelace',
        Company: null,
        Address1: '1 Analytical Way',
        Address2: null,
        City: 'Austin',
        StateOrProvinceCode: 'TX',
        PostalCode: '78701',
        CountryCode: 'US',
        Phone: null,
        Email: 'ada@example.com',
      },
    });
    expect(result.customerId).toBe(42);
    expect(result.instruments[0].last4).toBe('4242');
  });

  it('omits DeviceData entirely when collection failed', async () => {
    mockJwt();
    let received: Record<string, unknown> = {};

    server.use(
      http.post(`${apiBase}/customers/Customer/VaultBraintreeInstrument`, async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;

        return HttpResponse.json({ CustomerId: 42, Instruments: [] });
      }),
    );

    await vaultBraintreeInstrument({ nonce: 'fake-nonce', billing, email: 'ada@example.com' });

    expect(received).not.toHaveProperty('DeviceData');
    expect(received.MakeDefault).toBe(false);
  });

  it('reports a declined card', async () => {
    mockJwt();
    server.use(
      http.post(`${apiBase}/customers/Customer/VaultBraintreeInstrument`, () =>
        HttpResponse.json({}, { status: 422 }),
      ),
    );

    await expect(
      vaultBraintreeInstrument({ nonce: 'fake-nonce', billing, email: 'ada@example.com' }),
    ).rejects.toMatchObject({ kind: 'declined' });
  });
});
