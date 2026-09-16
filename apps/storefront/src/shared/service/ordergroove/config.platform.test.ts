import { isSubscriptionsAvailable } from './config';

vi.mock('@/utils/basicConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/basicConfig')>()),
  platform: 'catalyst',
}));

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('is unavailable off Stencil even when configured — there is no Current Customer JWT there', () => {
  window.BC_CONTEXT = {
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint: 'https://api.example.com/products/productclient/ordergroove-auth',
      appClientId: 'ssw-app-client-id',
    },
  };

  expect(isSubscriptionsAvailable()).toBe(false);
});
