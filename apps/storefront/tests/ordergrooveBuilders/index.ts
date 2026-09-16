import { faker } from '@faker-js/faker';

import { OgPayment, OgProduct, OgSubscription } from '@/shared/service/ordergroove';
import { builder } from 'tests/builder';

const hex = (length: number) => faker.string.hexadecimal({ length, prefix: '' }).toLowerCase();

const externalProductId = () =>
  `${faker.number.int({ min: 1000, max: 9999 })}_${faker.number.int({ min: 10000, max: 99999 })}`;

export const buildOgPaymentWith = builder<OgPayment>(() => ({
  public_id: hex(32),
  customer: '80591',
  token_id: hex(64),
  cc_number_ending: faker.string.numeric(4),
  cc_exp_date: '3/2028',
  cc_type: 1,
  cc_holder: null,
  billing_address: hex(32),
  live: true,
}));

export const buildOgSubscriptionWith = builder<OgSubscription>(() => ({
  public_id: hex(32),
  customer: '80591',
  product: externalProductId(),
  payment: hex(32),
  shipping_address: hex(32),
  quantity: faker.number.int({ min: 1, max: 40 }),
  frequency_days: 28,
  start_date: '2026-08-25',
  cancelled: null,
  merchant_order_id: String(faker.number.int({ min: 250000, max: 259999 })),
  live: true,
}));

export const buildOgProductWith = builder<OgProduct>(() => ({
  external_product_id: externalProductId(),
  name: faker.commerce.productName(),
  image_url: faker.image.url(),
  detail_url: faker.internet.url(),
  sku: faker.string.numeric(5),
  price: '81.50',
}));
