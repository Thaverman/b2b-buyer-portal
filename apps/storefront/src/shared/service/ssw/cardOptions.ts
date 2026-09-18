import { OgPayment } from '@/shared/service/ordergroove';

import { StoredInstrument } from './customerClient';

export interface CardOption {
  /** BigCommerce stored-instrument token */
  token: string;
  brand: string;
  last4: string;
  /** "MM/YYYY" */
  expiry: string;
  /** true when the live record holding this token is the subscription's current payment */
  isCurrent: boolean;
  /** the live Ordergroove record already holding this token, else null — the reuse-or-create answer */
  paymentId: string | null;
}

// Ordergroove reference "Credit Card Types" — the inverse of CARD_BRANDS above. BigCommerce sends
// upper-case names; anything unmapped is left out because Ordergroove marks the field optional.
const CC_TYPES: Record<string, number> = {
  VISA: 1,
  MASTERCARD: 2,
  AMEX: 3,
  'AMERICAN EXPRESS': 3,
  DISCOVER: 4,
  DINERS: 5,
  'DINERS CLUB': 5,
  JCB: 6,
};

export const ccTypeFor = (brand: string) => CC_TYPES[brand.trim().toUpperCase()];

export const formatExpiry = (month: number, year: number) =>
  `${String(month).padStart(2, '0')}/${year}`;

/**
 * One option per saved BigCommerce card, in the order the middleware returns them (default first),
 * each joined to the LIVE Ordergroove record holding its token. `paymentId === null` is the signal
 * to create a record; a dead record with the same token is neither reusable nor current.
 */
export const buildCardOptions = (
  instruments: StoredInstrument[],
  payments: OgPayment[] | undefined,
  currentPaymentId: string,
): CardOption[] => {
  const liveByToken = new Map(
    (payments ?? [])
      .filter((payment) => payment.live)
      .map((payment) => [payment.token_id, payment]),
  );

  return instruments.map((instrument) => {
    const payment = liveByToken.get(instrument.token);

    return {
      token: instrument.token,
      brand: instrument.brand,
      last4: instrument.last4,
      expiry: formatExpiry(instrument.expiryMonth, instrument.expiryYear),
      isCurrent: payment?.public_id === currentPaymentId,
      paymentId: payment?.public_id ?? null,
    };
  });
};
