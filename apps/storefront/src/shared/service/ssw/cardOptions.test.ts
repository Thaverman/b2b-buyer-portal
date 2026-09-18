import { buildOgPaymentWith } from 'tests/test-utils';

import { buildCardOptions, ccTypeFor, formatExpiry } from './cardOptions';
import { StoredInstrument } from './customerClient';

describe('card options', () => {
  const instrument = (over: Partial<StoredInstrument> = {}): StoredInstrument => ({
    token: 'tok-a',
    last4: '4242',
    brand: 'VISA',
    expiryMonth: 3,
    expiryYear: 2028,
    type: 'card',
    isDefault: true,
    source: 'bigcommerce',
    ...over,
  });

  it('joins each saved card to the live Ordergroove record holding its token', () => {
    const live = buildOgPaymentWith({ public_id: 'pay-a', token_id: 'tok-a', live: true });
    const other = buildOgPaymentWith({ public_id: 'pay-b', token_id: 'tok-b', live: true });

    const options = buildCardOptions(
      [
        instrument(),
        instrument({ token: 'tok-b', last4: '1881', brand: 'AMEX', isDefault: false }),
      ],
      [live, other],
      'pay-a',
    );

    expect(options).toEqual([
      {
        token: 'tok-a',
        brand: 'VISA',
        last4: '4242',
        expiry: '03/2028',
        isCurrent: true,
        paymentId: 'pay-a',
      },
      {
        token: 'tok-b',
        brand: 'AMEX',
        last4: '1881',
        expiry: '03/2028',
        isCurrent: false,
        paymentId: 'pay-b',
      },
    ]);
  });

  it('will not reuse a dead record, and a dead record never marks a card current', () => {
    // Ordergroove keeps records for cards BigCommerce no longer has, and mints a new record per
    // checkout, so several records share a token and only the live one is reusable (spec §11.2).
    const dead = buildOgPaymentWith({ public_id: 'pay-old', token_id: 'tok-a', live: false });

    const [option] = buildCardOptions([instrument()], [dead], 'pay-old');

    expect(option.paymentId).toBeNull();
    expect(option.isCurrent).toBe(false);
  });

  it('prefers the live record when a token carries both', () => {
    const dead = buildOgPaymentWith({ public_id: 'pay-old', token_id: 'tok-a', live: false });
    const live = buildOgPaymentWith({ public_id: 'pay-new', token_id: 'tok-a', live: true });

    const [option] = buildCardOptions([instrument()], [dead, live], 'pay-new');

    expect(option).toMatchObject({ paymentId: 'pay-new', isCurrent: true });
  });

  it('leaves the record unknown while payments have not loaded', () => {
    const [option] = buildCardOptions([instrument()], undefined, 'pay-a');

    expect(option).toMatchObject({ paymentId: null, isCurrent: false });
  });
});

describe('card type and expiry', () => {
  it('maps the brands Ordergroove names and ignores the rest', () => {
    expect(ccTypeFor('VISA')).toBe(1);
    expect(ccTypeFor('MASTERCARD')).toBe(2);
    expect(ccTypeFor('AMEX')).toBe(3);
    expect(ccTypeFor('American Express')).toBe(3);
    expect(ccTypeFor('DISCOVER')).toBe(4);
    expect(ccTypeFor(' diners club ')).toBe(5);
    expect(ccTypeFor('JCB')).toBe(6);
    // Optional on Ordergroove's side, so an unmapped brand simply omits the field.
    expect(ccTypeFor('SOLO')).toBeUndefined();
    expect(ccTypeFor('')).toBeUndefined();
  });

  it('formats expiry as zero-padded MM/YYYY', () => {
    expect(formatExpiry(3, 2028)).toBe('03/2028');
    expect(formatExpiry(12, 2030)).toBe('12/2030');
  });
});
