import { platform } from '@/utils/basicConfig';

export const getSubscriptionsConfig = () => window.BC_CONTEXT?.subscriptions;

// Stencil-only: the Current Customer JWT the auth endpoint needs does not exist on other
// platforms, and the theme is what emits the config in the first place.
export const isSubscriptionsAvailable = () =>
  platform === 'bigcommerce' && Boolean(getSubscriptionsConfig());
