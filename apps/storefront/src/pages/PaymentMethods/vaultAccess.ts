import { PaymentMethodsError } from './api';

// The BigCommerce storefront mints the vault access token (VAT, ~30 min TTL) into the
// native add-payment-method page context; checkout-sdk's stored-card hosted form only
// accepts that token flavor (it has NO code path for our backend's IAT — spike-verified
// 2026-09-01, see the spec §2.3). This module is the seam: if the SDK ever accepts IATs,
// swap the scrape for a VaultInstrumentToken call and delete the regexes.
export const NATIVE_ADD_PAYMENT_METHOD_PATH =
  '/account.php?action=add_payment_method&provider=braintree&method_type=CARD';

export type VaultAccess =
  | { state: 'available'; vaultToken: string; shopperId: string; storeHash: string }
  | { state: 'unavailable' };

// The hosted card form's field iframe. BigCommerce's checkout app only 302s it to the
// payments field when the session has an active cart; otherwise it is a blank 200 and the
// SDK's initialize() never settles (spec §2.9). The version must track the
// @bigcommerce/checkout-sdk pin in package.json.
export const HOSTED_FIELD_WRAPPER_PATH = '/checkout/payment/hosted-field?version=1.967.0';

// Preflight the wrapper without following the redirect: anything but a plain 200 means the
// checkout context exists. Never throws — an unreachable wrapper reads as "no context".
export const hasCheckoutContext = async (): Promise<boolean> => {
  try {
    const response = await fetch(HOSTED_FIELD_WRAPPER_PATH, {
      credentials: 'include',
      redirect: 'manual',
    });
    return response.status !== 200;
  } catch {
    return false;
  }
};

// The page context is a JSON *string* argument to stencilBootstrap, so quotes arrive
// escaped (\"vaultToken\":\"VAT …\"). Match the escaped and plain forms; the token
// charset is explicit because [^"]+ would swallow the escape backslash before the
// closing quote and poison the Authorization header.
const VAULT_TOKEN_PATTERN = /vaultToken\\?":\\?"(VAT [A-Za-z0-9._-]+)/;
const SHOPPER_ID_PATTERN = /shopperId\\?":\\?"?(\d+)/;
const STORE_HASH_PATTERN = /storeHash\\?":\\?"([a-z0-9]+)/;
// Present on every rendered theme page; a bot-challenge or outage page lacks it.
const THEME_PAGE_MARKER = 'stencilBootstrap';

export const getVaultAccess = async (): Promise<VaultAccess> => {
  let response: Response;
  try {
    response = await fetch(NATIVE_ADD_PAYMENT_METHOD_PATH, { credentials: 'include' });
  } catch {
    throw new PaymentMethodsError('upstream');
  }
  if (!response.ok) {
    throw new PaymentMethodsError('upstream');
  }

  const html = await response.text();
  if (!html.includes(THEME_PAGE_MARKER)) {
    throw new PaymentMethodsError('upstream');
  }

  const vaultToken = html.match(VAULT_TOKEN_PATTERN)?.[1];
  const shopperId = html.match(SHOPPER_ID_PATTERN)?.[1];
  const storeHash = html.match(STORE_HASH_PATTERN)?.[1];
  if (!vaultToken || !shopperId || !storeHash) {
    // A real theme page without a token = no configured gateway on this store.
    return { state: 'unavailable' };
  }

  return { state: 'available', vaultToken, shopperId, storeHash };
};
