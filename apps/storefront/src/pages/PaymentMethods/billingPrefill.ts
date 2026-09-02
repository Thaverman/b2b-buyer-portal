import { getB2BCountries, getBCCustomerAddress } from '@/shared/service/b2b';

export interface BillingFormValues {
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  stateOrProvinceCode: string;
  postalCode: string;
  countryCode: string;
  phone: string;
}

export const emptyBillingValues: BillingFormValues = {
  firstName: '',
  lastName: '',
  company: '',
  address1: '',
  address2: '',
  city: '',
  stateOrProvinceCode: '',
  postalCode: '',
  countryCode: '',
  phone: '',
};

export interface BillingStateOption {
  stateCode: string;
  stateName: string;
}

export interface BillingCountryOption {
  countryCode: string;
  countryName: string;
  states: BillingStateOption[];
}

interface RawState {
  stateCode?: string;
  stateName?: string;
}

interface RawCountry {
  countryCode?: string;
  countryName?: string;
  states?: RawState[];
}

// The attach body wants ISO codes; the dialog's country/state dropdowns display names and
// submit codes from this list. The boolean on getB2BCountries only toggles a
// state-required flag we don't read. Never throws — an empty list makes the form fall
// back to free-text fields rather than blocking the customer.
export const getBillingCountries = async (): Promise<BillingCountryOption[]> => {
  try {
    const { countries } = await getB2BCountries(false);
    return (countries ?? []).map((c: RawCountry) => ({
      countryCode: c.countryCode ?? '',
      countryName: c.countryName ?? '',
      states: (c.states ?? []).map((s: RawState) => ({
        stateCode: s.stateCode ?? '',
        stateName: s.stateName ?? '',
      })),
    }));
  } catch {
    return [];
  }
};

// The address book stores the state's display name ("Missouri"); the attach body wants
// the code ("MO").
const toStateCode = (
  countries: BillingCountryOption[],
  countryCode: string,
  stateOrProvince: string,
): string => {
  if (!stateOrProvince) {
    return '';
  }
  const states = countries.find((c) => c.countryCode === countryCode)?.states ?? [];
  const match = states.find(
    (s) => s.stateName === stateOrProvince || s.stateCode === stateOrProvince,
  );
  return match?.stateCode ?? stateOrProvince;
};

export const getBillingPrefill = async (
  countries: BillingCountryOption[],
): Promise<BillingFormValues> => {
  try {
    const { edges = [] } = await getBCCustomerAddress({ offset: 0, first: 1 });
    const node = edges[0]?.node;
    if (!node) {
      return emptyBillingValues;
    }

    return {
      firstName: node.firstName ?? '',
      lastName: node.lastName ?? '',
      company: node.company ?? '',
      address1: node.address1 ?? '',
      address2: node.address2 ?? '',
      city: node.city ?? '',
      stateOrProvinceCode: toStateCode(
        countries,
        node.countryCode ?? '',
        node.stateOrProvince ?? '',
      ),
      postalCode: node.postalCode ?? '',
      countryCode: node.countryCode ?? '',
      phone: node.phone ?? '',
    };
  } catch {
    return emptyBillingValues;
  }
};
