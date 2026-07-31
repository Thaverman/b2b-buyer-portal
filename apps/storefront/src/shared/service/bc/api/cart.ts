import b2bLogger from '@/utils/b3Logger';
import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';

// Same-origin REST Storefront API. On stencil BigCommerceStorefrontAPIBaseURL is
// window.origin, which is what these endpoints require — they take no token.
const STOREFRONT_API_BASE = `${BigCommerceStorefrontAPIBaseURL}/api/storefront`;

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
  } catch {
    throw new CartCouponError('upstream');
  }
  // Emptying a cart deletes it; both of these mean "no active cart", not a failure.
  if (response.status === 404 || response.status === 204) {
    return { cartId: null, appliedCodes: [] };
  }
  if (!response.ok) {
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
): Promise<string[]> => {
  let response: Response;
  try {
    response = await fetch(`${STOREFRONT_API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body,
    });
  } catch {
    throw new CartCouponError('upstream');
  }
  if (!response.ok) {
    throw await writeError(response);
  }
  // Both writes return the whole recomputed checkout, so the new applied set is
  // readable straight off the response with no follow-up read.
  const checkout = (await response.json()) as { coupons?: RawCoupon[] };
  return couponCodes(checkout.coupons);
};

export const applyCartCoupon = (cartId: string, code: string): Promise<string[]> =>
  couponWrite(`/checkouts/${cartId}/coupons`, 'POST', JSON.stringify({ couponCode: code }));

export const removeCartCoupon = (cartId: string, code: string): Promise<string[]> =>
  // The code travels in the PATH, so it must be encoded — codes may contain spaces.
  couponWrite(`/checkouts/${cartId}/coupons/${encodeURIComponent(code)}`, 'DELETE');
