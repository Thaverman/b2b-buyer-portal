import { fetchTierProgress, isTierProgressAvailable } from './api';
import { clearLoyaltyLanding, getPendingLanding, setPendingLanding } from './loyaltyLandingState';

export { clearLoyaltyLanding };

export const prefetchLoyaltyLanding = (customerId: number, isAgenting: boolean): void => {
  if (!isTierProgressAvailable() || isAgenting || !customerId) {
    setPendingLanding(Promise.resolve(null));
    return;
  }
  // Swallow errors: a failed check must never break the login flow.
  setPendingLanding(fetchTierProgress(customerId).catch(() => null));
};

// Safety net for flows where the early prefetch didn't run (and for tests that
// mock the login-info module): only fills an empty slot, never restarts an
// in-flight check — the production head start survives.
export const prefetchLoyaltyLandingIfIdle = (customerId: number, isAgenting: boolean): void => {
  if (getPendingLanding() === null) {
    prefetchLoyaltyLanding(customerId, isAgenting);
  }
};

// True only when the customer has an active tier journey (NextTier/PrePointsGate)
// AND the answer arrived within the budget. Callers use it once at navigation
// time — a late answer never causes a bounce.
export const resolveLoyaltyLanding = async (budgetMs = 1500): Promise<boolean> => {
  const pendingLanding = getPendingLanding();
  if (!pendingLanding) {
    return false;
  }
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), budgetMs);
  });
  const result = await Promise.race([pendingLanding, timeout]);
  return result !== null;
};
