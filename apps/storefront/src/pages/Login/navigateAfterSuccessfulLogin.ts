import { type NavigateFunction } from 'react-router-dom';

import { PATH_ROUTES } from '@/constants';
import {
  prefetchLoyaltyLandingIfIdle,
  resolveLoyaltyLanding,
} from '@/pages/Loyalty/loyaltyLanding';
import { store } from '@/store';
import { CustomerRole, UserTypes } from '@/types';
import { b2bJumpPath } from '@/utils/b3CheckPermissions/b2bPermissionPath';
import { loginJump } from '@/utils/b3Login';
import { CustomerInfo } from '@/utils/loginInfo';

export async function navigateAfterSuccessfulLogin(
  navigate: NavigateFunction,
  info: CustomerInfo | undefined,
  quoteDetailToCheckoutUrl: string,
): Promise<void> {
  // Safety net: the login sequence normally prefetches earlier (head start);
  // this fills the slot only if that didn't happen.
  const { company, b2bFeatures } = store.getState();
  prefetchLoyaltyLandingIfIdle(company.customer.id, b2bFeatures.masqueradeCompany.isAgenting);

  if (quoteDetailToCheckoutUrl) {
    navigate(quoteDetailToCheckoutUrl);
    return;
  }

  const isLoginLandLocation = loginJump(navigate);

  if (!isLoginLandLocation) return;

  // Active-tier customers land on Rewards ahead of every role default
  // (spec 2026-07-28). Budget-bounded: an unresolved check falls through.
  if (await resolveLoyaltyLanding()) {
    navigate('/loyalty');
    return;
  }

  if (info?.userType === UserTypes.MULTIPLE_B2C && info?.role === CustomerRole.SUPER_ADMIN) {
    navigate('/dashboard');
    return;
  }

  if (info?.userType === UserTypes.B2C) {
    navigate(PATH_ROUTES.ORDERS);
  }

  const path = b2bJumpPath(Number(info?.role));

  navigate(path);
}
