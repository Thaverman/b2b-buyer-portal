import { LangFormatFunction } from '@/lib/lang';
import { FrequencyPeriod } from '@/shared/service/ordergroove';
import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';

import { AddressSummary, PaymentSummary } from './viewModel';

/**
 * Every date this page shows — next order, cancellation, order history — is an Ordergroove
 * calendar date, so it must not be shifted by the store's timezone offset.
 */
export { displayCalendarDate as formatDate } from '@/utils/b3DateFormat';

/** The theme's hosted manager — still the only home for swap product and add address (spec decision 7). */
export const HOSTED_MANAGER_URL = `${BigCommerceStorefrontAPIBaseURL}/subscriptions`;

const FREQUENCY_KEYS: Record<FrequencyPeriod, string> = {
  1: 'subscriptions.card.everyDays',
  2: 'subscriptions.card.everyWeeks',
  3: 'subscriptions.card.everyMonths',
};

/** "every 10 months" from the schedule as configured — `frequency_days` would say "every 300 days". */
export const describeFrequency = (
  every: number,
  period: FrequencyPeriod,
  b3Lang: LangFormatFunction,
) => b3Lang(FREQUENCY_KEYS[period], { count: every });

/** "Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701" — the card's line, reused by the address picker. */
export const describeAddress = (address: AddressSummary) =>
  [address.name, address.company, address.line1, address.line2, address.locality]
    .filter(Boolean)
    .join(', ');

/** "Visa ending in 1111 · exp 03/2028", or the unbranded form for a card type the table does not name. */
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
