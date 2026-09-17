import {
  buildOgAddressWith,
  buildOgItemWith,
  buildOgOrderWith,
  buildOgPaymentWith,
  buildOgProductWith,
  buildOgSubscriptionWith,
} from 'tests/test-utils';

import { formatOrderId } from '@/utils/orderId';

import { buildRecentOrders, buildSubscriptionCards } from './viewModel';

const nothingLoaded = {
  products: undefined,
  addresses: undefined,
  payments: undefined,
  upcoming: undefined,
};

describe('buildSubscriptionCards', () => {
  it('splits active from cancelled and keeps the cancellation date', () => {
    const active = buildOgSubscriptionWith({ cancelled: null, live: true });
    const cancelled = buildOgSubscriptionWith({ cancelled: '2026-08-01 10:00:00', live: false });
    const retired = buildOgSubscriptionWith({ cancelled: null, live: false });

    const cards = buildSubscriptionCards([active, cancelled, retired], nothingLoaded);

    expect(cards.active.map((card) => card.publicId)).toEqual([active.public_id]);
    expect(cards.cancelled.map((card) => [card.publicId, card.cancelledOn])).toEqual([
      [cancelled.public_id, '2026-08-01 10:00:00'],
      [retired.public_id, null],
    ]);
    expect(cards.active[0].cancelledOn).toBeNull();
  });

  it('leaves every cell null while nothing has loaded', () => {
    const [card] = buildSubscriptionCards(
      [buildOgSubscriptionWith('WHATEVER_VALUES')],
      nothingLoaded,
    ).active;

    expect(card).toMatchObject({
      product: null,
      shippingAddress: null,
      payment: null,
      nextOrderDate: null,
    });
  });

  it('summarises the product, address and payment records the subscription points at', () => {
    const product = buildOgProductWith({
      name: 'Kraft Paper Shopping Bags',
      sku: '9537',
      image_url: 'https://cdn.example.com/bags.png',
      detail_url: 'https://store.example.com/bags',
    });
    const address = buildOgAddressWith({
      first_name: 'Jane',
      last_name: 'Doe',
      company_name: 'Acme Co',
      address: '1 Main St',
      address2: 'Suite 4',
      city: 'Springfield',
      state_province_code: 'IL',
      zip_postal_code: '62701',
    });
    const payment = buildOgPaymentWith({
      cc_type: 1,
      cc_number_ending: '1111',
      cc_exp_date: '3/2028',
    });
    const subscription = buildOgSubscriptionWith({
      product: '9537_12118',
      shipping_address: address.public_id,
      payment: payment.public_id,
      quantity: 2,
      frequency_days: 28,
    });

    const [card] = buildSubscriptionCards([subscription], {
      ...nothingLoaded,
      products: new Map([['9537_12118', product]]),
      addresses: [address],
      payments: [payment],
    }).active;

    expect(card).toMatchObject({
      externalProductId: '9537_12118',
      quantity: 2,
      frequencyDays: 28,
      product: {
        name: 'Kraft Paper Shopping Bags',
        sku: '9537',
        imageUrl: 'https://cdn.example.com/bags.png',
        detailUrl: 'https://store.example.com/bags',
      },
      shippingAddress: {
        name: 'Jane Doe',
        company: 'Acme Co',
        line1: '1 Main St',
        line2: 'Suite 4',
        locality: 'Springfield, IL 62701',
      },
      payment: { brand: 'Visa', last4: '1111', expiry: '3/2028' },
    });
  });

  it('maps every documented card type and leaves an unknown code unbranded', () => {
    const brands = [1, 2, 3, 4, 5, 6, 99].map((code) => {
      const payment = buildOgPaymentWith({ cc_type: code });
      const subscription = buildOgSubscriptionWith({ payment: payment.public_id });

      return buildSubscriptionCards([subscription], { ...nothingLoaded, payments: [payment] })
        .active[0].payment?.brand;
    });

    expect(brands).toEqual([
      'Visa',
      'Mastercard',
      'American Express',
      'Discover',
      'Diners',
      'JCB',
      null,
    ]);
  });

  it('yields null summaries when a referenced record is missing from a loaded list', () => {
    const subscription = buildOgSubscriptionWith('WHATEVER_VALUES');

    const [card] = buildSubscriptionCards([subscription], {
      products: new Map([[subscription.product, null]]),
      addresses: [],
      payments: [],
      upcoming: { orders: [], items: [] },
    }).active;

    expect(card).toMatchObject({
      product: null,
      shippingAddress: null,
      payment: null,
      nextOrderDate: null,
    });
  });

  it('takes the earliest upcoming order holding one of the subscription items as the next order date', () => {
    const subscription = buildOgSubscriptionWith('WHATEVER_VALUES');
    const later = buildOgOrderWith({ status: 1, place: '2026-11-01 00:00:00' });
    const sooner = buildOgOrderWith({ status: 1, place: '2026-10-03 00:00:00' });
    const items = [
      buildOgItemWith({ order: later.public_id, subscription: subscription.public_id }),
      buildOgItemWith({ order: sooner.public_id, subscription: subscription.public_id }),
      buildOgItemWith({ order: sooner.public_id, subscription: null }),
    ];

    const [card] = buildSubscriptionCards([subscription], {
      ...nothingLoaded,
      upcoming: { orders: [later, sooner], items },
    }).active;

    expect(card.nextOrderDate).toBe('2026-10-03');
  });

  it('orders active cards by next order date, unscheduled last, then by product name', () => {
    const products = new Map([
      ['a_1', buildOgProductWith({ name: 'Bags' })],
      ['b_1', buildOgProductWith({ name: 'Tissue' })],
      ['c_1', buildOgProductWith({ name: 'Labels' })],
    ]);
    const bags = buildOgSubscriptionWith({ product: 'a_1' });
    const tissue = buildOgSubscriptionWith({ product: 'b_1' });
    const labels = buildOgSubscriptionWith({ product: 'c_1' });
    const order = buildOgOrderWith({ status: 1, place: '2026-10-03 00:00:00' });
    const items = [buildOgItemWith({ order: order.public_id, subscription: tissue.public_id })];

    const { active } = buildSubscriptionCards([labels, bags, tissue], {
      ...nothingLoaded,
      products,
      upcoming: { orders: [order], items },
    });

    expect(active.map((card) => card.product?.name)).toEqual(['Tissue', 'Bags', 'Labels']);
  });

  it('orders cancelled cards newest cancellation first', () => {
    const older = buildOgSubscriptionWith({ cancelled: '2026-01-01 00:00:00', live: false });
    const newer = buildOgSubscriptionWith({ cancelled: '2026-06-01 00:00:00', live: false });

    const { cancelled } = buildSubscriptionCards([older, newer], nothingLoaded);

    expect(cancelled.map((card) => card.publicId)).toEqual([newer.public_id, older.public_id]);
  });
});

describe('buildRecentOrders', () => {
  it('maps every status code to an outcome and drops merged orders', () => {
    const outcomes = [5, 3, 12, 13, 14, 15, 18, 19, 20, 4, 1, 6, 9, 10, 11, 17, 42].map(
      (status) => {
        const [order] = buildRecentOrders([buildOgOrderWith({ status })]);

        return order?.outcome ?? 'dropped';
      },
    );

    expect(outcomes).toEqual([
      'success',
      'failed',
      'failed',
      'failed',
      'failed',
      'failed',
      'failed',
      'failed',
      'failed',
      'cancelled',
      'processing',
      'processing',
      'processing',
      'processing',
      'processing',
      'dropped',
      'processing',
    ]);
  });

  it('links a placed order to the portal order detail by its web order number', () => {
    const merchantOrderId = '253011';
    const [order] = buildRecentOrders([
      buildOgOrderWith({
        status: 5,
        order_merchant_id: merchantOrderId,
        total: '81.50',
        currency_code: 'USD',
        place: '2026-09-05 01:37:45',
      }),
    ]);

    expect(order).toMatchObject({
      placedOn: '2026-09-05',
      webOrderNumber: formatOrderId(merchantOrderId),
      orderDetailPath: `/orderDetail/${merchantOrderId}`,
      total: '81.50',
      currencyCode: 'USD',
      outcome: 'success',
      message: null,
    });
  });

  it('carries the rejection message only for failed orders and no link without a BigCommerce order', () => {
    const [failed, placed] = buildRecentOrders([
      buildOgOrderWith({
        status: 3,
        order_merchant_id: null,
        rejected_message: 'Card declined',
        place: '2026-09-06 00:00:00',
      }),
      buildOgOrderWith({ status: 5, rejected_message: 'stale note', place: '2026-09-01 00:00:00' }),
    ]);

    expect(failed).toMatchObject({
      webOrderNumber: null,
      orderDetailPath: null,
      message: 'Card declined',
    });
    expect(placed.message).toBeNull();
  });

  it('sorts newest first', () => {
    const orders = buildRecentOrders([
      buildOgOrderWith({ place: '2026-07-01 00:00:00' }),
      buildOgOrderWith({ place: '2026-09-01 00:00:00' }),
      buildOgOrderWith({ place: '2026-08-01 00:00:00' }),
    ]);

    expect(orders.map((order) => order.placedOn)).toEqual([
      '2026-09-01',
      '2026-08-01',
      '2026-07-01',
    ]);
  });
});
