import { createStoredCardForm } from './hostedForm';

const initialize = vi.fn().mockResolvedValue(undefined);
const deinitialize = vi.fn();
const submitStoredCard = vi.fn().mockResolvedValue(undefined);

vi.mock('@bigcommerce/checkout-sdk', () => ({
  createStoredCardHostedFormService: vi.fn(() => ({ initialize, deinitialize, submitStoredCard })),
}));

const containers = { number: 'cc-number', expiry: 'cc-expiry', name: 'cc-name', cvv: 'cc-cvv' };

it('initializes the hosted form against the payments host with our container ids', async () => {
  const { createStoredCardHostedFormService } = await import('@bigcommerce/checkout-sdk');

  await createStoredCardForm(containers);

  expect(vi.mocked(createStoredCardHostedFormService)).toHaveBeenCalledWith(
    'https://payments.bigcommerce.com',
  );
  expect(initialize).toHaveBeenCalledWith({
    fields: {
      cardNumber: { containerId: 'cc-number' },
      cardExpiry: { containerId: 'cc-expiry' },
      cardName: { containerId: 'cc-name' },
      cardCode: { containerId: 'cc-cvv' },
    },
  });
});

it('submits with the flat billing fields and fills in the constant data values', async () => {
  const form = await createStoredCardForm(containers);

  await form.submit(
    {
      defaultInstrument: false,
      email: 'c@example.com',
      firstName: 'Cass',
      lastName: 'Doe',
      address1: '1 Main St',
      city: 'Nashville',
      postalCode: '37201',
      countryCode: 'US',
      stateOrProvinceCode: 'TN',
    },
    { shopperId: '80591', storeHash: '24erkpw9h6', vaultToken: 'VAT abc' },
  );

  expect(submitStoredCard).toHaveBeenCalledWith(
    {
      defaultInstrument: false,
      email: 'c@example.com',
      firstName: 'Cass',
      lastName: 'Doe',
      address1: '1 Main St',
      city: 'Nashville',
      postalCode: '37201',
      countryCode: 'US',
      stateOrProvinceCode: 'TN',
    },
    {
      currencyCode: 'USD',
      paymentsUrl: 'https://payments.bigcommerce.com',
      providerId: 'braintree',
      shopperId: '80591',
      storeHash: '24erkpw9h6',
      vaultToken: 'VAT abc',
    },
  );
});

it('tears down via deinitialize', async () => {
  const form = await createStoredCardForm(containers);

  form.teardown();

  expect(deinitialize).toHaveBeenCalled();
});
