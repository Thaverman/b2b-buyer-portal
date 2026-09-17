import {
  buildOgAddressWith,
  buildOgItemWith,
  buildOgOrderWith,
  buildOgPaymentWith,
  buildOgProductWith,
  buildOgSubscriptionWith,
} from 'tests/test-utils';

import { formatOrderId } from '@/utils/orderId';

import {
  addIntervals,
  buildRecentOrders,
  buildSubscriptionCards,
  changeDatePresets,
} from './viewModel';

const nothingLoaded = {
  products: undefined,
  addresses: undefined,
  payments: undefined,
  upcoming: undefined,
};

describe('upcoming order and schedule on a card', () => {
  it("names the upcoming order and the other subscriptions' products on it, once each", () => {
    const subscription = buildOgSubscriptionWith({ product: '9537_12118' });
    const sibling = buildOgSubscriptionWith({ product: '7674_9534' });
    const twin = buildOgSubscriptionWith({ product: '7674_9534' });
    const unnamed = buildOgSubscriptionWith({ product: '1_2' });
    const order = buildOgOrderWith({ status: 1, place: '2026-10-03 00:00:00' });
    const items = [
      buildOgItemWith({
        order: order.public_id,
        subscription: subscription.public_id,
        product: '9537_12118',
      }),
      buildOgItemWith({
        order: order.public_id,
        subscription: sibling.public_id,
        product: '7674_9534',
      }),
      buildOgItemWith({
        order: order.public_id,
        subscription: twin.public_id,
        product: '7674_9534',
      }),
      buildOgItemWith({ order: order.public_id, subscription: unnamed.public_id, product: '1_2' }),
      // A one-time upsell line has no subscription and never counts as a sibling.
      buildOgItemWith({ order: order.public_id, subscription: null, product: '5_5' }),
    ];

    const [card] = buildSubscriptionCards([subscription], {
      ...nothingLoaded,
      products: new Map([['7674_9534', buildOgProductWith({ name: 'Kraft Bags' })]]),
      upcoming: { orders: [order], items },
    }).active;

    expect(card.nextOrderDate).toBe('2026-10-03');
    expect(card.nextOrder).toEqual({
      orderId: order.public_id,
      otherProducts: [
        { externalProductId: '7674_9534', name: 'Kraft Bags' },
        { externalProductId: '1_2', name: null },
      ],
    });
  });

  it('points at the earliest order when the subscription has items on several', () => {
    const subscription = buildOgSubscriptionWith('WHATEVER_VALUES');
    const later = buildOgOrderWith({ status: 1, place: '2026-11-07 00:00:00' });
    const sooner = buildOgOrderWith({ status: 1, place: '2026-10-10 00:00:00' });

    const [card] = buildSubscriptionCards([subscription], {
      ...nothingLoaded,
      upcoming: {
        orders: [later, sooner],
        items: [
          buildOgItemWith({ order: later.public_id, subscription: subscription.public_id }),
          buildOgItemWith({ order: sooner.public_id, subscription: subscription.public_id }),
        ],
      },
    }).active;

    expect(card.nextOrder?.orderId).toBe(sooner.public_id);
    expect(card.nextOrder?.otherProducts).toEqual([]);
  });

  it('carries the raw schedule and the address id, and no order while nothing is scheduled', () => {
    const subscription = buildOgSubscriptionWith({
      every: 6,
      every_period: 2,
      shipping_address: 'addr-1',
    });

    const [card] = buildSubscriptionCards([subscription], nothingLoaded).active;

    expect(card).toMatchObject({
      every: 6,
      everyPeriod: 2,
      shippingAddressId: 'addr-1',
      nextOrder: null,
    });
  });
});

describe('date arithmetic', () => {
  it('adds calendar intervals the way the hosted manager does', () => {
    // Observed on the manager 2026-09-17: Sep 19 + 10 months = Jul 19 2027; + 2 months = Nov 19.
    expect(addIntervals('2026-09-19', 10, 3, 1)).toBe('2027-07-19');
    expect(addIntervals('2026-09-19', 2, 3, 1)).toBe('2026-11-19');
    expect(addIntervals('2026-09-29', 2, 2, 1)).toBe('2026-10-13');
    expect(addIntervals('2026-09-29', 2, 2, 3)).toBe('2026-11-10');
    expect(addIntervals('2026-09-19', 12, 1, 2)).toBe('2026-10-13');
    // Month arithmetic clamps to the last day, as dayjs does.
    expect(addIntervals('2026-01-31', 1, 3, 1)).toBe('2026-02-28');
  });

  it('offers presets at one, two and three intervals after the next order', () => {
    const subscription = buildOgSubscriptionWith({ every: 10, every_period: 3 });
    const order = buildOgOrderWith({ status: 1, place: '2026-09-19 00:00:00' });
    const [card] = buildSubscriptionCards([subscription], {
      ...nothingLoaded,
      upcoming: {
        orders: [order],
        items: [buildOgItemWith({ order: order.public_id, subscription: subscription.public_id })],
      },
    }).active;

    expect(changeDatePresets(card)).toEqual([
      { every: 10, period: 3, date: '2027-07-19' },
      { every: 20, period: 3, date: '2028-05-19' },
      { every: 30, period: 3, date: '2029-03-19' },
    ]);
  });

  it('has no presets without an upcoming order', () => {
    const [card] = buildSubscriptionCards(
      [buildOgSubscriptionWith('WHATEVER_VALUES')],
      nothingLoaded,
    ).active;

    expect(changeDatePresets(card)).toEqual([]);
  });
});

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
