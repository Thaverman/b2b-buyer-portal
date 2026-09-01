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

// The address book stores the state's display name ("Missouri"); the attach body wants
// the code ("MO"). The boolean on getB2BCountries only toggles a state-required flag we
// don't read.
const toStateCode = async (countryCode: string, stateOrProvince: string): Promise<string> => {
  if (!stateOrProvince) {
    return '';
  }
  try {
    const { countries } = await getB2BCountries(false);
    const states =
      countries.find((c: { countryCode: string }) => c.countryCode === countryCode)?.states ?? [];
    const match = states.find(
      (s: { stateCode: string; stateName: string }) =>
        s.stateName === stateOrProvince || s.stateCode === stateOrProvince,
    );
    return match?.stateCode ?? stateOrProvince;
  } catch {
    return stateOrProvince;
  }
};

export const getBillingPrefill = async (): Promise<BillingFormValues> => {
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
      stateOrProvinceCode: await toStateCode(node.countryCode ?? '', node.stateOrProvince ?? ''),
      postalCode: node.postalCode ?? '',
      countryCode: node.countryCode ?? '',
      phone: node.phone ?? '',
    };
  } catch {
    return emptyBillingValues;
  }
};
