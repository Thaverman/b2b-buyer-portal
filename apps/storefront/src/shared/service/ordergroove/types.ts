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
