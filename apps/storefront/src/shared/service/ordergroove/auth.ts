import { getCurrentCustomerJWT } from '@/shared/service/bc';
import { storeHash } from '@/utils/basicConfig';

import { getSubscriptionsConfig } from './config';
import { OrdergrooveError } from './errors';

// The storefront signature is valid for 2h (the endpoint reports the TTL). Reuse it until it has
// less than this much life left so a request in flight never straddles the expiry.
const REFRESH_MARGIN_MS = 10 * 60 * 1000;
const DEFAULT_TTL_SECONDS = 7200;

interface CachedAuthorization {
  customerId: string;
  header: string;
  expiresAt: number;
}

interface AuthResponse {
  success?: boolean;
  /** "<customerId>|<epoch seconds>|<base64 HMAC>" — the value the theme stores as the og_auth cookie */
  cookieValue?: string;
  expiresIn?: number;
}

// Module memory only (spec §5.2): never storage, never Redux.
let cached: CachedAuthorization | undefined;

const mint = async (customerId: string): Promise<CachedAuthorization> => {
  const config = getSubscriptionsConfig();
  if (!config) {
    throw new OrdergrooveError('unavailable');
  }

  const jwt = await getCurrentCustomerJWT(config.appClientId).catch(() => undefined);
  if (!jwt) {
    throw new OrdergrooveError('sessionExpired');
  }

  let response: Response;
  try {
    // Both identifiers on purpose (spec §4): today's endpoint reads customerId and ignores Jwt;
    // the hardened endpoint reads Jwt and ignores customerId. No portal redeploy at cutover.
    response = await fetch(config.authEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Jwt: jwt, customerId, storeHash }),
    });
  } catch {
    throw new OrdergrooveError('upstream');
  }

  if (response.status === 401) {
    throw new OrdergrooveError('sessionExpired');
  }
  if (!response.ok) {
    throw new OrdergrooveError('upstream');
  }

  const body = (await response.json()) as AuthResponse;
  const [sigField, ts, sig] = (body.cookieValue ?? '').split('|');
  if (!body.success || !sigField || !ts || !sig) {
    throw new OrdergrooveError('upstream');
  }

  return {
    customerId,
    // Ordergroove's storefront-auth header is this JSON object as a string.
    header: JSON.stringify({ public_id: config.merchantId, sig_field: sigField, ts: Number(ts), sig }),
    expiresAt: Date.now() + (body.expiresIn ?? DEFAULT_TTL_SECONDS) * 1000,
  };
};

export const getAuthorizationHeader = async (customerId: string): Promise<string> => {
  const isFresh =
    cached?.customerId === customerId && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS;
  if (cached && isFresh) {
    return cached.header;
  }
  cached = await mint(customerId);

  return cached.header;
};

export const invalidateAuthorization = () => {
  cached = undefined;
};
