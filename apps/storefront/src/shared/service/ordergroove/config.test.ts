import { isSubscriptionsAvailable } from './config';

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
