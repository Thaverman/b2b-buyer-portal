import { getCart } from '@/shared/service/bc/graphql/cart';

// BigCommerce's stored-card hosted form is checkout infrastructure: its field iframe
// (/checkout/payment/hosted-field) only renders when the session has an active cart.
// Without one the checkout app answers with a blank 200 and the SDK's initialize() never
// settles (verified 2026-09-03 with a guest cart: no cart → 200, cart → 302). Never
// throws — a failed lookup gates closed to the honest "add an item first" copy rather than
// offering a dialog that cannot work.
export const hasActiveCart = async (): Promise<boolean> => {
  try {
    const { data } = await getCart();
    return Boolean(data.site.cart?.entityId);
  } catch {
    return false;
  }
};
