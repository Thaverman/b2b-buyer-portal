import { LangFormatFunction } from '@/lib/lang';

import { PaymentSummary } from './viewModel';

/**
 * Every date this page shows — next order, cancellation, order history — is an Ordergroove
 * calendar date, so it must not be shifted by the store's timezone offset.
 */
export { displayCalendarDate as formatDate } from '@/utils/b3DateFormat';

/** "Visa ending in 1111 · exp 3/2028", or the unbranded form for a card type the table does not name. */
export const describePayment = (payment: PaymentSummary, b3Lang: LangFormatFunction) =>
  payment.brand
    ? b3Lang('subscriptions.card.payment', {
        brand: payment.brand,
        last4: payment.last4,
        expiry: payment.expiry,
      })
    : b3Lang('subscriptions.card.paymentUnbranded', {
        last4: payment.last4,
        expiry: payment.expiry,
      });
