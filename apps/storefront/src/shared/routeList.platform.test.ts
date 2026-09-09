import { buildCompanyStateWith, builder } from 'tests/test-utils';

import { GlobalState, initState } from '@/shared/global/context/config';
import { store } from '@/store';
import { setCustomerInfo } from '@/store/slices/company';
import { CustomerRole } from '@/types';

import { getAllowedRoutesWithoutComponent } from './routeList';

vi.mock('@/utils/basicConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/basicConfig')>()),
  platform: 'catalyst',
}));

// Context-flavored GlobalState (see the note in routeList.test.ts).
const buildGlobalStateWith = builder<GlobalState>(() => initState);

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('withholds the favorites route on non-bigcommerce platforms even when the host enables it', () => {
  window.BC_CONTEXT = { favorites: { enabled: true } };
  const { customer } = buildCompanyStateWith({});
  store.dispatch(setCustomerInfo({ ...customer, role: CustomerRole.B2C }));

  expect(
    getAllowedRoutesWithoutComponent(buildGlobalStateWith({})).some(
      (route) => route.path === '/favorites',
    ),
  ).toBe(false);
});
