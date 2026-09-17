import { faker } from '@faker-js/faker';
import { builder } from 'tests/builder';

import {
  OgAddress,
  OgItem,
  OgOrder,
  OgPayment,
  OgProduct,
  OgSubscription,
} from '@/shared/service/ordergroove';

const hex = (length: number) => faker.string.hexadecimal({ length, prefix: '' }).toLowerCase();

const customerId = () => String(faker.number.int({ min: 1, max: 1_000_000 }));

const externalProductId = () =>
  `${faker.number.int({ min: 1000, max: 9999 })}_${faker.number.int({ min: 10000, max: 99999 })}`;

export const buildOgPaymentWith = builder<OgPayment>(() => ({
  public_id: hex(32),
  customer: customerId(),
  token_id: hex(64),
  cc_number_ending: faker.string.numeric(4),
  cc_exp_date: `${faker.number.int({ min: 1, max: 12 })}/${faker.number.int({ min: 2027, max: 2035 })}`,
  cc_type: faker.number.int({ min: 1, max: 6 }),
  cc_holder: null,
  billing_address: hex(32),
  live: true,
}));

export const buildOgSubscriptionWith = builder<OgSubscription>(() => ({
  public_id: hex(32),
  customer: customerId(),
  product: externalProductId(),
  payment: hex(32),
  shipping_address: hex(32),
  quantity: faker.number.int({ min: 1, max: 40 }),
  frequency_days: faker.helpers.arrayElement([7, 14, 21, 28, 30, 45, 60, 90]),
  start_date: faker.date.recent({ days: 365 }).toISOString().slice(0, 10),
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
  price: faker.commerce.price(),
}));

// Ordergroove sends `place` as "YYYY-MM-DD HH:mm:ss" (probe 2026-09-17).
const placeDateTime = (date: Date) => `${date.toISOString().slice(0, 10)} 00:00:00`;

export const buildOgOrderWith = builder<OgOrder>(() => ({
  public_id: hex(32),
  customer: customerId(),
  payment: hex(32),
  shipping_address: hex(32),
  currency_code: 'USD',
  sub_total: faker.commerce.price(),
  total: faker.commerce.price(),
  place: placeDateTime(faker.date.soon({ days: 60 })),
  status: 5,
  order_merchant_id: String(faker.number.int({ min: 250000, max: 259999 })),
  rejected_message: null,
  tries: 1,
  cancelled: null,
}));

export const buildOgItemWith = builder<OgItem>(() => ({
  public_id: hex(32),
  order: hex(32),
  subscription: hex(32),
  product: externalProductId(),
  quantity: faker.number.int({ min: 1, max: 10 }),
  price: faker.commerce.price(),
}));

export const buildOgAddressWith = builder<OgAddress>(() => ({
  public_id: hex(32),
  first_name: faker.person.firstName(),
  last_name: faker.person.lastName(),
  company_name: faker.company.name(),
  address: faker.location.streetAddress(),
  address2: null,
  city: faker.location.city(),
  state_province_code: faker.location.state({ abbreviated: true }),
  zip_postal_code: faker.location.zipCode('#####'),
  country_code: 'US',
  live: true,
}));
