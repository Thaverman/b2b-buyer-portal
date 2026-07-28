import type { LoyaltyTierProgress } from './api';

// Leaf module: holds the pending landing check with no runtime imports, so
// logoutSession can clear it without joining the api.ts import cycle.
let pendingLanding: Promise<LoyaltyTierProgress | null> | null = null;

export const setPendingLanding = (pending: Promise<LoyaltyTierProgress | null>): void => {
  pendingLanding = pending;
};

export const getPendingLanding = (): Promise<LoyaltyTierProgress | null> | null => pendingLanding;

export const clearLoyaltyLanding = (): void => {
  pendingLanding = null;
};
