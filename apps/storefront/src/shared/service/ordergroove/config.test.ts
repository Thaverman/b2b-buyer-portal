import { isCustomManagerAvailable, isSubscriptionsAvailable } from './config';

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('is unavailable when the host has not configured subscriptions', () => {
  window.BC_CONTEXT = { paymentMethods: { apiBase: 'https://api.example.com', appClientId: 'x' } };

  expect(isSubscriptionsAvailable()).toBe(false);
});

it('is available on Stencil when the host configures subscriptions', () => {
  window.BC_CONTEXT = {
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint: 'https://api.example.com/products/productclient/ordergroove-auth',
      appClientId: 'ssw-app-client-id',
    },
  };

  expect(isSubscriptionsAvailable()).toBe(true);
});

describe('isCustomManagerAvailable', () => {
  const configure = (customManager?: boolean | string) => {
    window.BC_CONTEXT = {
      subscriptions: {
        merchantId: 'merchant-public-id',
        authEndpoint: 'https://api.example.com/products/productclient/ordergroove-auth',
        appClientId: 'ssw-app-client-id',
        ...(customManager === undefined ? {} : { customManager }),
      },
    };
  };

  it('is off when the flag is absent, false, or the string "false"', () => {
    configure();
    expect(isCustomManagerAvailable()).toBe(false);
    configure(false);
    expect(isCustomManagerAvailable()).toBe(false);
    configure('false');
    expect(isCustomManagerAvailable()).toBe(false);
  });

  it('is on for true and for the string "true" that theme templates emit', () => {
    configure(true);
    expect(isCustomManagerAvailable()).toBe(true);
    configure('true');
    expect(isCustomManagerAvailable()).toBe(true);
  });

  it('is off without the parent subscriptions config, whatever the flag says', () => {
    window.BC_CONTEXT = {};

    expect(isCustomManagerAvailable()).toBe(false);
  });
});
