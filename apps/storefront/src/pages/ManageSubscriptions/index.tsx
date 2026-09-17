import { isCustomManagerAvailable } from '@/shared/service/ordergroove';
import { useAppSelector } from '@/store';

import HostedManagerFrame from './components/HostedManagerFrame';
import SubscriptionsManager from './SubscriptionsManager';

/**
 * Phase 2 switch. The Ordergroove credential is signed for the logged-in customer, so a
 * masquerading rep never gets the portal page; the hosted iframe keeps today's behaviour for
 * them and for stores that have not turned the flag on.
 */
export default function ManageSubscriptions() {
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);

  return isCustomManagerAvailable() && !isAgenting ? (
    <SubscriptionsManager />
  ) : (
    <HostedManagerFrame />
  );
}
