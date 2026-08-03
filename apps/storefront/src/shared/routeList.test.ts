import { buildCompanyStateWith, builder } from 'tests/test-utils';

import { GlobalState, initState } from '@/shared/global/context/config';
import { store } from '@/store';
import { setCustomerInfo } from '@/store/slices/company';

import { getAllowedRoutesWithoutComponent } from './routeList';

const loyaltyConfig = {
  shopKey: 'shop-key',
  apiBase: 'https://ssw.example.com/customers',
  appClientId: 'app-client-id',
};

// getAllowedRoutesWithoutComponent takes the Context-flavored GlobalState (from
// @/shared/global/context/config), not the Redux-slice GlobalState the
// tests/storeStateBuilders builder of the same name produces — the two share a name but
// not a shape, so build off the real `initState` default here instead.
const buildGlobalStateWith = builder<GlobalState>(() => initState);

// The filter reads company.customer off the singleton store, so prime it by dispatching
// a complete Customer — the builder's default supplies every required field.
const primeCustomer = (isLoyaltyEntitled: boolean) => {
  const { customer } = buildCompanyStateWith({});
  store.dispatch(setCustomerInfo({ ...customer, isLoyaltyEntitled }));
};

const hasLoyaltyRoute = () =>
  getAllowedRoutesWithoutComponent(buildGlobalStateWith({})).some(
    (route) => route.path === '/loyalty',
  );

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('offers the loyalty route when the customer is loyalty-entitled', () => {
  window.BC_CONTEXT = { loyalty: loyaltyConfig };
  primeCustomer(true);

  expect(hasLoyaltyRoute()).toBe(true);
});

it('withholds the loyalty route when the customer is not loyalty-entitled', () => {
  window.BC_CONTEXT = { loyalty: loyaltyConfig };
  primeCustomer(false);

  expect(hasLoyaltyRoute()).toBe(false);
});

// The pre-existing host-config gate must still win on its own, so that adding the
// entitlement term did not accidentally make an unconfigured store show Loyalty.
it('withholds the loyalty route when the host has no loyalty config, even if entitled', () => {
  primeCustomer(true);

  expect(hasLoyaltyRoute()).toBe(false);
});

// A session rehydrated from a bundle that predates this field has no
// isLoyaltyEntitled at all; redux-persist's autoMergeLevel1 hard-sets the
// persisted `customer` over initialState, so the `true` seed is gone.
it('offers the loyalty route when the persisted customer predates isLoyaltyEntitled', () => {
  window.BC_CONTEXT = { loyalty: loyaltyConfig };
  const { customer } = buildCompanyStateWith({});
  const { isLoyaltyEntitled: discardedIsLoyaltyEntitled, ...withoutTheField } = customer;
  store.dispatch(setCustomerInfo(withoutTheField as typeof customer));

  expect(hasLoyaltyRoute()).toBe(true);
});
