import { http, HttpResponse, startMockServer } from 'tests/test-utils';

import { getVaultAccess, NATIVE_ADD_PAYMENT_METHOD_PATH } from './vaultAccess';

const { server } = startMockServer();

// Escaped exactly like the live page: stencilBootstrap's second argument is a JSON *string*.
const availablePage = `<html><body><script>
window.stencilBootstrap("account_addpaymentmethod", "{\\"paymentsUrl\\":\\"https://payments.bigcommerce.com\\",\\"storeHash\\":\\"24erkpw9h6\\",\\"vaultToken\\":\\"VAT abc.DEF_12-3\\",\\"shopperId\\":\\"80591\\"}");
</script></body></html>`;

const noGatewayPage = `<html><body><script>
window.stencilBootstrap("account_addpaymentmethod", "{\\"paymentsUrl\\":\\"https://payments.bigcommerce.com\\"}");
</script></body></html>`;

const challengePage =
  '<html><head><title>Just a moment...</title></head><body>Verifying</body></html>';

const mockNativePage = (body: string, status = 200) =>
  server.use(
    http.get(
      '*/account.php',
      () => new HttpResponse(body, { status, headers: { 'Content-Type': 'text/html' } }),
    ),
  );

it('extracts the token, shopper id and store hash from the escaped page context', async () => {
  mockNativePage(availablePage);

  await expect(getVaultAccess()).resolves.toEqual({
    state: 'available',
    vaultToken: 'VAT abc.DEF_12-3', // exact — no trailing backslash from the JSON escaping
    shopperId: '80591',
    storeHash: '24erkpw9h6',
  });
});

it('reports unavailable when the theme page renders without a vault token (no gateway)', async () => {
  mockNativePage(noGatewayPage);

  await expect(getVaultAccess()).resolves.toEqual({ state: 'unavailable' });
});

it('throws upstream for a bot-challenge page (200 but not a theme page)', async () => {
  mockNativePage(challengePage);

  await expect(getVaultAccess()).rejects.toMatchObject({ kind: 'upstream' });
});

it('throws upstream on a non-200 response', async () => {
  mockNativePage('forbidden', 403);

  await expect(getVaultAccess()).rejects.toMatchObject({ kind: 'upstream' });
});

it('throws upstream on a network failure', async () => {
  server.use(http.get('*/account.php', () => HttpResponse.error()));

  await expect(getVaultAccess()).rejects.toMatchObject({ kind: 'upstream' });
});

it('fetches the native add-payment-method page path', () => {
  expect(NATIVE_ADD_PAYMENT_METHOD_PATH).toBe(
    '/account.php?action=add_payment_method&provider=braintree&method_type=CARD',
  );
});
