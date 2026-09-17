/**
 * One Ordergroove payment record. Ordergroove mints a NEW record on every checkout, so several
 * records routinely share one `token_id`; `live` marks the current one. `token_id` is the
 * BigCommerce stored-instrument token, byte-for-byte (spec §2).
 */
export interface OgPayment {
  public_id: string;
  customer: string;
  token_id: string;
  cc_number_ending: string;
  /** "M/YYYY" */
  cc_exp_date: string;
  cc_type: number;
  cc_holder: string | null;
  /** Ordergroove address public_id */
  billing_address: string;
  live: boolean;
}

export interface OgSubscription {
  public_id: string;
  customer: string;
  /** "<bcProductId>_<variantId>" — also the id for GET /products/{id}/ */
  product: string;
  /** payment public_id */
  payment: string;
  shipping_address: string;
  quantity: number;
  frequency_days: number;
  start_date: string;
  /** ISO timestamp when cancelled, null while active */
  cancelled: string | null;
  /** BigCommerce order id of the enrolling order */
  merchant_order_id: string | null;
  live: boolean;
}

export interface OgProduct {
  external_product_id: string;
  name: string;
  image_url: string;
  detail_url: string;
  sku: string;
  price: string;
}

/** One page of any Ordergroove list. `next` is an absolute URL or null. */
export interface OgPage<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * One Ordergroove order: a future placement (status 1) or a past attempt. Money fields are
 * decimal strings. Status codes are mapped in `pages/ManageSubscriptions/viewModel.ts`.
 */
export interface OgOrder {
  public_id: string;
  customer: string;
  /** payment public_id */
  payment: string;
  /** address public_id */
  shipping_address: string;
  currency_code: string;
  sub_total: string;
  total: string;
  /** "YYYY-MM-DD HH:mm:ss" — the day (and time) the order is or was due for placement */
  place: string;
  status: number;
  /** BigCommerce order id once placed, null before */
  order_merchant_id: string | null;
  rejected_message: string | null;
  tries: number;
  cancelled: string | null;
}

/** One line of an order; `subscription` links it to the subscription that generated it. */
export interface OgItem {
  public_id: string;
  /** order public_id */
  order: string;
  /** subscription public_id; null for one-time upsell items */
  subscription: string | null;
  product: string;
  quantity: number;
  price: string;
}

export interface OgAddress {
  public_id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  address: string;
  address2: string | null;
  city: string;
  state_province_code: string;
  zip_postal_code: string;
  country_code: string;
  live: boolean;
}
