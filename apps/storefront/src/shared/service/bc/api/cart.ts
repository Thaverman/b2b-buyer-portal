import Cookies from 'js-cookie';

import b2bLogger from '@/utils/b3Logger';
import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';

// Same-origin REST Storefront API. On stencil BigCommerceStorefrontAPIBaseURL is
// window.origin, which is what these endpoints require — they take no bearer token.
const STOREFRONT_API_BASE = `${BigCommerceStorefrontAPIBaseURL}/api/storefront`;

// Writes are CSRF-protected with a double-submit cookie: the storefront sets a
// non-HttpOnly SF-CSRF-TOKEN cookie, and a write must echo its value in this header
// or BigCommerce answers 403 Forbidden. Verified against the live sandbox store:
// header matching the cookie -> processed; wrong value -> 403; cookie but no header
// -> 403; no cookie at all -> processed. Reads (GET /carts) are not protected.
// Do NOT trust @bigcommerce/checkout-sdk on this — the bundle vendored in the
// checkout fork (1.936.2) sends no such header, which predates this enforcement.
const CSRF_COOKIE = 'SF-CSRF-TOKEN';
const CSRF_HEADER = 'X-SF-CSRF-TOKEN';

export interface CartCoupons {
  cartId: string | null;
  appliedCodes: string[];
}

// BigCommerce documents only 200 and 409 for the coupon endpoints, so every other
// status is inferred: 'rejected' covers an invalid, expired or already-used code.
type CartCouponErrorKind = 'emptyCart' | 'rejected' | 'upstream';

export class CartCouponError extends Error {
  kind: CartCouponErrorKind;

  constructor(kind: CartCouponErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

interface RawCoupon {
  code?: string;
}

interface RawCart {
  id?: string;
  coupons?: RawCoupon[];
}

interface RawErrorBody {
  type?: string;
  title?: string;
}

const couponCodes = (coupons: RawCoupon[] | undefined): string[] =>
  (coupons ?? []).map((coupon) => coupon.code ?? '').filter((code) => code !== '');

// BigCommerce normalizes coupon codes, so what the loyalty provider issued and what
// the cart reports back can differ in case. Blank never matches blank.
export const isSameCouponCode = (a: string, b: string): boolean => {
  const left = a.trim().toLowerCase();
  return left !== '' && left === b.trim().toLowerCase();
};

export const fetchCartCoupons = async (): Promise<CartCoupons> => {
  let response: Response;
  try {
    response = await fetch(`${STOREFRONT_API_BASE}/carts`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    b2bLogger.error(`Cart coupon read failed: network error "${error}"`);
    throw new CartCouponError('upstream');
  }
  // Emptying a cart deletes it; both of these mean "no active cart", not a failure.
  if (response.status === 404 || response.status === 204) {
    // 404 is treated as "no cart" per BigCommerce's own troubleshooting docs, so this is
    // plausibly correct rather than a guess — but it's logged anyway so a support ticket
    // about a false "no cart" is diagnosable, not something we have to assume away. The
    // live sandbox probe (see design doc) will confirm this.
    if (response.status === 404) {
      b2bLogger.error(`Cart coupon read: 404 "${response.statusText}" (treated as no active cart)`);
    }
    return { cartId: null, appliedCodes: [] };
  }
  if (!response.ok) {
    b2bLogger.error(`Cart coupon read failed: ${response.status} "${response.statusText}"`);
    throw new CartCouponError('upstream');
  }

  // This endpoint returns an ARRAY of carts — an empty array means no active cart.
  const carts = (await response.json()) as RawCart[];
  const cart = Array.isArray(carts) ? carts[0] : undefined;
  if (!cart?.id) {
    return { cartId: null, appliedCodes: [] };
  }
  return { cartId: cart.id, appliedCodes: couponCodes(cart.coupons) };
};

const writeError = async (response: Response): Promise<CartCouponError> => {
  let body: RawErrorBody = {};
  try {
    body = (await response.json()) as RawErrorBody;
  } catch {
    // Non-JSON error body; fall through to the status check.
  }
  // The docs specify no error body for a bad coupon, so log what upstream actually
  // said — it is the only way to diagnose a mapping that turns out too coarse.
  b2bLogger.error(
    `Cart coupon write failed: ${response.status} "${body.title ?? response.statusText}" type "${body.type ?? 'none'}"`,
  );
  if (body.type === 'empty_cart') {
    return new CartCouponError('emptyCart');
  }
  if (response.status === 401 || response.status === 403) {
    // Never a statement about the coupon — a broken session or CSRF configuration.
    // The b2bLogger line above is the diagnostic path for this.
    return new CartCouponError('upstream');
  }
  // Any 4xx is the server refusing the code — which is what the buyer needs told.
  // BigCommerce documents no status for a bad coupon, so keying on the class rather
  // than guessing members makes the useful message the default, not the exception.
  // 5xx and network failures are our problem, not the code's.
  if (response.status >= 400 && response.status < 500) {
    return new CartCouponError('rejected');
  }
  return new CartCouponError('upstream');
};

const couponWrite = async (
  path: string,
  method: 'POST' | 'DELETE',
  body?: string,
): Promise<string[] | null> => {
  // Omitted rather than sent empty when the cookie is absent: a blank value reads as a
  // mismatch and is rejected, whereas presenting no token at all is accepted.
  const csrfToken = Cookies.get(CSRF_COOKIE);

  let response: Response;
  try {
    response = await fetch(`${STOREFRONT_API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
      },
      body,
    });
  } catch {
    throw new CartCouponError('upstream');
  }
  if (!response.ok) {
    throw await writeError(response);
  }
  // Both writes return the whole recomputed checkout, so the new applied set is normally
  // readable straight off the response with no follow-up read. But the write already
  // succeeded by this point, so a 204 or other empty/non-JSON body is not a failure —
  // just an unreadable one. Return null rather than throwing, so the caller can report
  // the write as the success it was and resync the applied codes from the server instead.
  try {
    const checkout = (await response.json()) as { coupons?: RawCoupon[] };
    return couponCodes(checkout.coupons);
  } catch {
    return null;
  }
};

export const applyCartCoupon = (cartId: string, code: string): Promise<string[] | null> =>
  couponWrite(`/checkouts/${cartId}/coupons`, 'POST', JSON.stringify({ couponCode: code }));

export const removeCartCoupon = (cartId: string, code: string): Promise<string[] | null> =>
  // The code travels in the PATH, so it must be encoded — codes may contain spaces.
  couponWrite(`/checkouts/${cartId}/coupons/${encodeURIComponent(code)}`, 'DELETE');
