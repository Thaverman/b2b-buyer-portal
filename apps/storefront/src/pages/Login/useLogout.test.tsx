import {
  buildCompanyStateWith,
  faker,
  http,
  HttpResponse,
  startMockServer,
} from 'tests/test-utils';
import { renderHookWithProviders } from 'tests/utils/hook-test-utils';

import { useLogout } from './useLogout';

const { server } = startMockServer();

// The session clear sits in a `finally`, so a throw there propagates out of logout() and the
// logoutSession() call right after it never runs: the shopper stays signed in. Safari set to
// block all cookies throws on the `window.sessionStorage` getter, which is what denying it here
// reproduces.
const denySessionStorageAccess = () => {
  vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
};

const respondToLogout = () => {
  server.use(
    http.post(/graphql/, () => HttpResponse.json({ data: { logout: { result: 'success' } } })),
  );
};

it('clears the signed-in company state when the browser denies access to session storage', async () => {
  respondToLogout();
  const preloadedState = {
    company: buildCompanyStateWith({ tokens: { B2BToken: faker.string.uuid() } }),
  };
  denySessionStorageAccess();

  const { result, store } = renderHookWithProviders(() => useLogout(), { preloadedState });
  await result.result.current({ showLogoutBanner: false });

  expect(store.getState().company.tokens.B2BToken).toBe('');
});
