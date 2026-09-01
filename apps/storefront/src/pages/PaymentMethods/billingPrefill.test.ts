import { when } from 'vitest-when';

import { getB2BCountries, getBCCustomerAddress } from '@/shared/service/b2b';

import { emptyBillingValues, getBillingPrefill } from './billingPrefill';

vi.mock('@/shared/service/b2b', () => ({
  getBCCustomerAddress: vi.fn(),
  getB2BCountries: vi.fn(),
}));

const address = {
  firstName: 'Cass',
  lastName: 'Doe',
  company: 'Acme',
  address1: '1 Main St',
  address2: 'Suite 2',
  city: 'Bridgeton',
  stateOrProvince: 'Missouri',
  postalCode: '63044',
  countryCode: 'US',
  phone: '555-0100',
};

it('prefills from the first address-book entry and maps the state name to its code', async () => {
  when(vi.mocked(getBCCustomerAddress))
    .calledWith({ offset: 0, first: 1 })
    .thenResolve({ edges: [{ node: address }], totalCount: 1 });
  when(vi.mocked(getB2BCountries))
    .calledWith(false)
    .thenResolve({
      countries: [
        {
          countryCode: 'US',
          countryName: 'United States',
          id: 1,
          states: [{ stateCode: 'MO', stateName: 'Missouri' }],
        },
      ],
    });

  await expect(getBillingPrefill()).resolves.toEqual({
    firstName: 'Cass',
    lastName: 'Doe',
    company: 'Acme',
    address1: '1 Main St',
    address2: 'Suite 2',
    city: 'Bridgeton',
    stateOrProvinceCode: 'MO',
    postalCode: '63044',
    countryCode: 'US',
    phone: '555-0100',
  });
});

it('passes a state that already looks like a code through unmapped', async () => {
  when(vi.mocked(getBCCustomerAddress))
    .calledWith({ offset: 0, first: 1 })
    .thenResolve({ edges: [{ node: { ...address, stateOrProvince: 'MO' } }], totalCount: 1 });
  when(vi.mocked(getB2BCountries))
    .calledWith(false)
    .thenResolve({
      countries: [
        {
          countryCode: 'US',
          countryName: 'United States',
          id: 1,
          states: [{ stateCode: 'MO', stateName: 'Missouri' }],
        },
      ],
    });

  await expect(getBillingPrefill()).resolves.toMatchObject({ stateOrProvinceCode: 'MO' });
});

it('returns empty values when the customer has no addresses', async () => {
  when(vi.mocked(getBCCustomerAddress))
    .calledWith({ offset: 0, first: 1 })
    .thenResolve({ edges: [], totalCount: 0 });

  await expect(getBillingPrefill()).resolves.toEqual(emptyBillingValues);
});

it('returns empty values when the address fetch fails (prefill is a convenience, never a blocker)', async () => {
  vi.mocked(getBCCustomerAddress).mockRejectedValue(new Error('boom'));

  await expect(getBillingPrefill()).resolves.toEqual(emptyBillingValues);
});

it('keeps the raw state value when the countries lookup fails', async () => {
  when(vi.mocked(getBCCustomerAddress))
    .calledWith({ offset: 0, first: 1 })
    .thenResolve({ edges: [{ node: address }], totalCount: 1 });
  vi.mocked(getB2BCountries).mockRejectedValue(new Error('boom'));

  await expect(getBillingPrefill()).resolves.toMatchObject({ stateOrProvinceCode: 'Missouri' });
});
