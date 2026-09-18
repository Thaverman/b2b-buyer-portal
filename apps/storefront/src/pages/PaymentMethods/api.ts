import { fetchJson, post } from '@/shared/service/ssw/customerClient';

import { BillingFormValues } from './billingPrefill';

export const setDefaultStoredInstrument = (token: string) =>
  post('SetDefaultStoredInstrument', { Token: token });

export const deleteStoredInstrument = (token: string) =>
  post('DeleteStoredInstrument', { Token: token });

export const getBraintreeClientToken = async (): Promise<string> => {
  const { clientToken } = await fetchJson('BraintreeClientToken', {});

  return clientToken;
};

export const vaultBraintreeInstrument = ({
  nonce,
  deviceData,
  billing,
  email,
  makeDefault = false,
}: {
  nonce: string;
  deviceData?: string;
  billing: BillingFormValues;
  email: string;
  makeDefault?: boolean;
}) =>
  post('VaultBraintreeInstrument', {
    Nonce: nonce,
    // Omit the key entirely when collection failed; an empty string is not the same
    // thing to the backend, and device data must never block a vault.
    ...(deviceData ? { DeviceData: deviceData } : {}),
    MakeDefault: makeDefault,
    Billing: {
      FirstName: billing.firstName.trim(),
      LastName: billing.lastName.trim(),
      Company: billing.company.trim() || null,
      Address1: billing.address1.trim(),
      Address2: billing.address2.trim() || null,
      City: billing.city.trim(),
      StateOrProvinceCode: billing.stateOrProvinceCode.trim(),
      PostalCode: billing.postalCode.trim(),
      CountryCode: billing.countryCode.trim(),
      Phone: billing.phone.trim() || null,
      Email: email.trim(),
    },
  });
