import { fetchTierProgress, isTierProgressAvailable, LoyaltyTierProgress } from './api';

// Module-level so the login flow can start the check early and the navigation
// decision can await (a slice of) it later without threading state through callers.
let pendingLanding: Promise<LoyaltyTierProgress | null> | null = null;

export const prefetchLoyaltyLanding = (customerId: number, isAgenting: boolean): void => {
  if (!isTierProgressAvailable() || isAgenting || !customerId) {
    pendingLanding = Promise.resolve(null);
    return;
  }
  // Swallow errors: a failed check must never break the login flow.
  pendingLanding = fetchTierProgress(customerId).catch(() => null);
};

// Safety net for flows where the early prefetch didn't run (and for tests that
// mock the login-info module): only fills an empty slot, never restarts an
// in-flight check — the production head start survives.
export const prefetchLoyaltyLandingIfIdle = (customerId: number, isAgenting: boolean): void => {
  if (pendingLanding === null) {
    prefetchLoyaltyLanding(customerId, isAgenting);
  }
};

// Logout must forget the previous customer's answer: the module outlives a
// same-page logout→login, and IfIdle would otherwise keep serving it if the
// next login's replacing prefetch is skipped by a degraded getCurrentCustomerInfo.
export const clearLoyaltyLanding = (): void => {
  pendingLanding = null;
};

// True only when the customer has an active tier journey (NextTier/PrePointsGate)
// AND the answer arrived within the budget. Callers use it once at navigation
// time — a late answer never causes a bounce.
export const resolveLoyaltyLanding = async (budgetMs = 1500): Promise<boolean> => {
  if (!pendingLanding) {
    return false;
  }
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), budgetMs);
  });
  const result = await Promise.race([pendingLanding, timeout]);
  return result !== null;
};
