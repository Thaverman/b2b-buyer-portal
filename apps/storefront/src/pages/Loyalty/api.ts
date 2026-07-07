import { platform } from '@/utils/basicConfig';

// Module-internal: knip fails the build on unused exports, so this file only
// exports what other files actually import.
interface LoyaltyConfig {
  shopKey: string;
  apiBase: string;
  appClientId: string;
}

const getLoyaltyConfig = (): LoyaltyConfig | undefined => {
  const config = window.BC_CONTEXT?.loyalty;
  if (!config?.shopKey || !config?.apiBase || !config?.appClientId) {
    return undefined;
  }
  return config;
};

// Stencil-only: getCurrentCustomerJWT early-returns undefined on every other platform,
// which would misrender as "session expired"; gate the feature out instead.
export const isLoyaltyAvailable = () => platform === 'bigcommerce' && Boolean(getLoyaltyConfig());
