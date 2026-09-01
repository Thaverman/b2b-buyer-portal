// The stored-card hosted form only works from the TOP realm with containers in the TOP
// document — driven from the ThemeFrame realm the field handshake deadlocks (mirror image
// of the old Braintree finding; spike-verified 2026-09-01, spec §2.1). Our bundle already
// executes in the top realm, so a pinned npm dependency is fine; the dynamic import keeps
// the ~1.4 MB SDK out of the main chunk.
const PAYMENTS_URL = 'https://payments.bigcommerce.com';
const PROVIDER_ID = 'braintree';
const CURRENCY_CODE = 'USD';

interface StoredCardFormContainers {
  number: string;
  expiry: string;
  name: string;
  cvv: string;
}

interface StoredCardBillingFields {
  defaultInstrument: boolean;
  email: string;
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  postalCode: string;
  countryCode: string;
  address2?: string;
  company?: string;
  phone?: string;
  stateOrProvinceCode?: string;
}

interface StoredCardSubmitData {
  shopperId: string;
  storeHash: string;
  vaultToken: string;
}

export interface StoredCardForm {
  submit(fields: StoredCardBillingFields, data: StoredCardSubmitData): Promise<void>;
  teardown(): void;
}

export const createStoredCardForm = async (
  containers: StoredCardFormContainers,
): Promise<StoredCardForm> => {
  const { createStoredCardHostedFormService } = await import('@bigcommerce/checkout-sdk');
  const service = createStoredCardHostedFormService(PAYMENTS_URL);

  await service.initialize({
    fields: {
      cardNumber: { containerId: containers.number },
      cardExpiry: { containerId: containers.expiry },
      cardName: { containerId: containers.name },
      cardCode: { containerId: containers.cvv },
    },
  });

  return {
    submit: (fields, data) =>
      service.submitStoredCard(fields, {
        currencyCode: CURRENCY_CODE,
        paymentsUrl: PAYMENTS_URL,
        providerId: PROVIDER_ID,
        ...data,
      }),
    teardown: () => service.deinitialize(),
  };
};
