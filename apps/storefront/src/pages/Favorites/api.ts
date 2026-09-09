import { platform } from '@/utils/basicConfig';

// Stencil-only: the favorites browser keys are shared with the theme on the same origin,
// and the storefront session cookie is what scopes the wishlist calls to the customer.
export const isFavoritesAvailable = () =>
  platform === 'bigcommerce' && Boolean(window.BC_CONTEXT?.favorites?.enabled);
