import { buildCompanyStateWith, builder } from 'tests/test-utils';

import { GlobalState, initState } from '@/shared/global/context/config';
import { setMasqueradeCompany, store } from '@/store';
import { setCompanyInfo, setCustomerInfo } from '@/store/slices/company';
import { CompanyStatus, CustomerRole, UserTypes } from '@/types';

import {
  getAllowedRoutesWithoutComponent,
  isNativePaymentMethodsPage,
  routeList,
} from './routeList';

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

describe('isNativePaymentMethodsPage', () => {
  // vitest-location-mock ignores history.replaceState; drive the mocked location directly
  const setUrl = (url: string) => window.location.assign(url);

  afterEach(() => setUrl('/'));

  it('matches the native payment-methods list and add pages', () => {
    setUrl('/account.php?action=payment_methods');
    expect(isNativePaymentMethodsPage()).toBe(true);

    setUrl('/account.php?action=add_payment_method&provider=braintree&method_type=CARD');
    expect(isNativePaymentMethodsPage()).toBe(true);
  });

  it('does not match other account pages', () => {
    setUrl('/account.php?action=order_status');
    expect(isNativePaymentMethodsPage()).toBe(false);

    setUrl('/account.php');
    expect(isNativePaymentMethodsPage()).toBe(false);
  });
});

describe('/favorites', () => {
  const hasFavoritesRoute = (globalState = buildGlobalStateWith({})) =>
    getAllowedRoutesWithoutComponent(globalState).some((route) => route.path === '/favorites');

  const primeCustomerRole = (role: CustomerRole, userType = UserTypes.B2C) => {
    const { customer } = buildCompanyStateWith({});
    store.dispatch(setCustomerInfo({ ...customer, role, userType }));
  };

  const setAgenting = (isAgenting: boolean) =>
    store.dispatch(
      setMasqueradeCompany({
        masqueradeCompany: { id: 0, isAgenting, companyName: '', customerGroupId: 0 },
      }),
    );

  beforeEach(() => {
    window.BC_CONTEXT = { favorites: { enabled: true } };
    setAgenting(false);
  });

  it('offers the route to a B2C customer when the host enables favorites', () => {
    primeCustomerRole(CustomerRole.B2C);

    expect(hasFavoritesRoute()).toBe(true);
  });

  it('offers the route to a B2B buyer of an approved company', () => {
    primeCustomerRole(CustomerRole.ADMIN, UserTypes.MULTIPLE_B2C);
    store.dispatch(
      setCompanyInfo({ id: '1', companyName: 'Acme', status: CompanyStatus.APPROVED }),
    );
    // B2B routes are only offered once the storefront config has loaded.
    const loadedConfig = buildGlobalStateWith({
      storefrontConfig: { shoppingLists: true, tradeProfessionalApplication: false },
    });

    expect(hasFavoritesRoute(loadedConfig)).toBe(true);
  });

  it('withholds the route when the host has no favorites config', () => {
    delete window.BC_CONTEXT;
    primeCustomerRole(CustomerRole.B2C);

    expect(hasFavoritesRoute()).toBe(false);
  });

  it('withholds the route when the host disables favorites', () => {
    window.BC_CONTEXT = { favorites: { enabled: false } };
    primeCustomerRole(CustomerRole.B2C);

    expect(hasFavoritesRoute()).toBe(false);
  });

  // Same setup as the approved-buyer case above, so only the agenting term can hide the route.
  it('withholds the route while a sales rep is masquerading as a buyer who could see it', () => {
    primeCustomerRole(CustomerRole.ADMIN, UserTypes.MULTIPLE_B2C);
    store.dispatch(
      setCompanyInfo({ id: '1', companyName: 'Acme', status: CompanyStatus.APPROVED }),
    );
    const loadedConfig = buildGlobalStateWith({
      storefrontConfig: { shoppingLists: true, tradeProfessionalApplication: false },
    });
    setAgenting(true);

    expect(hasFavoritesRoute(loadedConfig)).toBe(false);
  });

  it('withholds the route from a sales rep who is not masquerading', () => {
    primeCustomerRole(CustomerRole.SUPER_ADMIN, UserTypes.B2B_SUPER_ADMIN);

    expect(hasFavoritesRoute()).toBe(false);
  });
});

describe('braintree payment-methods route', () => {
  const paymentMethodsConfig = {
    apiBase: 'https://api.example.com',
    appClientId: 'app-client-id',
  };

  const hasBraintreePaymentRoute = () =>
    getAllowedRoutesWithoutComponent(buildGlobalStateWith({})).some(
      (route) => route.path === '/payment-methods-braintree',
    );

  it('is offered when the flag is enabled alongside the payment-methods config', () => {
    window.BC_CONTEXT = {
      paymentMethods: paymentMethodsConfig,
      paymentMethodsBraintree: { enabled: true },
    };
    primeCustomer(false);

    expect(hasBraintreePaymentRoute()).toBe(true);
  });

  it('is withheld when the flag is absent', () => {
    window.BC_CONTEXT = { paymentMethods: paymentMethodsConfig };
    primeCustomer(false);

    expect(hasBraintreePaymentRoute()).toBe(false);
  });

  it('is withheld when payment methods themselves are not configured', () => {
    window.BC_CONTEXT = { paymentMethodsBraintree: { enabled: true } };
    primeCustomer(false);

    expect(hasBraintreePaymentRoute()).toBe(false);
  });

  it('is never a nav menu item', () => {
    expect(routeList.find((route) => route.path === '/payment-methods-braintree')?.isMenuItem).toBe(
      false,
    );
  });
});
