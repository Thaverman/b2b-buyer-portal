import { LangFormatFunction } from '@/lib/lang';
import { displayFormat } from '@/utils/b3DateFormat';

import { PaymentSummary } from './viewModel';

/** "YYYY-MM-DD" (or an Ordergroove timestamp) in the store's display date format. */
export const formatDate = (date: string) => String(displayFormat(date, true));

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
