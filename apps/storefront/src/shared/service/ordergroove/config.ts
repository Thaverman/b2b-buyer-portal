import { platform } from '@/utils/basicConfig';
import { isHostFlagEnabled } from '@/utils/hostFlag';

export const getSubscriptionsConfig = () => window.BC_CONTEXT?.subscriptions;

// Stencil-only: the Current Customer JWT the auth endpoint needs does not exist on other
// platforms, and the theme is what emits the config in the first place.
export const isSubscriptionsAvailable = () => {
  const config = getSubscriptionsConfig();
  if (platform !== 'bigcommerce' || !config) {
    return false;
  }

  // The theme emits `enabled` beside the config (a boolean, or a string from a template) and
  // keeps the block on stores where Ordergroove is off; absent means on (the Phase 1 contract).
  return config.enabled === undefined || isHostFlagEnabled(config.enabled);
};

/** Phase 2: the portal's own /manage-subscriptions page replaces the hosted iframe. */
export const isCustomManagerAvailable = () =>
  isSubscriptionsAvailable() && isHostFlagEnabled(getSubscriptionsConfig()?.customManager);
