import { act, renderWithProviders, screen, waitFor } from 'tests/test-utils';

import { PaymentMethodsError, vaultBraintreeInstrument } from '../api';
import { emptyBillingValues, getBillingCountries, getBillingPrefill } from '../billingPrefill';
import { createDropinWithTimeout } from '../dropin';

import AddPaymentMethodBraintreeDialog from './AddPaymentMethodBraintreeDialog';

vi.mock('../dropin', () => ({
  createDropinWithTimeout: vi.fn(),
  DROPIN_INIT_TIMEOUT_MS: 20_000,
}));

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  vaultBraintreeInstrument: vi.fn(),
}));

vi.mock('../billingPrefill', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../billingPrefill')>()),
  getBillingCountries: vi.fn(),
  getBillingPrefill: vi.fn(),
}));

// A real jsdom Document in preloadedState makes RTK's immutableCheck blow the stack.
const themeFrame = { body: { style: {} } } as unknown as Document;

const filledBilling = {
  ...emptyBillingValues,
  firstName: 'Ada',
  lastName: 'Lovelace',
  address1: '1 Analytical Way',
  city: 'Austin',
  postalCode: '78701',
  countryCode: 'US',
};

const buildDropin = (payload = { nonce: 'fake-nonce', deviceData: '{"d":1}' }) => ({
  requestPaymentMethod: vi.fn().mockResolvedValue(payload),
  teardown: vi.fn().mockResolvedValue(undefined),
});

const renderDialog = ({ onAdded = vi.fn(), onClose = vi.fn() } = {}) =>
  renderWithProviders(
    <AddPaymentMethodBraintreeDialog
      clientToken="bt-client-token"
      customerEmail="ada@example.com"
      onAdded={onAdded}
      onClose={onClose}
    />,
    { preloadedState: { theme: { themeFrame } } },
  );

beforeEach(() => {
  vi.mocked(getBillingCountries).mockResolvedValue([]);
  vi.mocked(getBillingPrefill).mockResolvedValue(filledBilling);
});

it('mounts Drop-in into the ThemeFrame document, not the parent document', async () => {
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());

  renderDialog();

  await waitFor(() => expect(createDropinWithTimeout).toHaveBeenCalled());

  const [passedDocument, container, token] = vi.mocked(createDropinWithTimeout).mock.calls[0];
  expect(passedDocument).toBe(themeFrame);
  expect(container).toBeInstanceOf(HTMLElement);
  expect(token).toBe('bt-client-token');
});

it('vaults the nonce and reports success', async () => {
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());
  vi.mocked(vaultBraintreeInstrument).mockResolvedValue({ customerId: 1, instruments: [] });
  const onAdded = vi.fn();

  const { user } = renderDialog({ onAdded });

  await user.click(await screen.findByRole('button', { name: 'Save card' }));

  await waitFor(() =>
    expect(vaultBraintreeInstrument).toHaveBeenCalledWith({
      nonce: 'fake-nonce',
      deviceData: '{"d":1}',
      billing: filledBilling,
      email: 'ada@example.com',
      makeDefault: false,
    }),
  );
  expect(onAdded).toHaveBeenCalled();
});

it('shows the generic card failure copy on a decline and keeps the dialog open', async () => {
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());
  vi.mocked(vaultBraintreeInstrument).mockRejectedValue(new PaymentMethodsError('declined'));
  const onAdded = vi.fn();

  const { user } = renderDialog({ onAdded });

  await user.click(await screen.findByRole('button', { name: 'Save card' }));

  expect(
    await screen.findByText(
      "We couldn't save this card. Check the card details and billing address, or try a different card.",
    ),
  ).toBeInTheDocument();
  expect(onAdded).not.toHaveBeenCalled();
});

it('shows the rate-limit copy when the endpoint throttles', async () => {
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());
  vi.mocked(vaultBraintreeInstrument).mockRejectedValue(new PaymentMethodsError('rateLimited'));

  const { user } = renderDialog();

  await user.click(await screen.findByRole('button', { name: 'Save card' }));

  expect(
    await screen.findByText('Too many requests — please try again in a minute.'),
  ).toBeInTheDocument();
});

it('shows the generic system copy when the vault call fails upstream', async () => {
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());
  vi.mocked(vaultBraintreeInstrument).mockRejectedValue(new PaymentMethodsError('upstream'));

  const { user } = renderDialog();

  await user.click(await screen.findByRole('button', { name: 'Save card' }));

  expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
});

it('shows the form error when Drop-in cannot initialize', async () => {
  vi.mocked(createDropinWithTimeout).mockRejectedValue(new Error('timed out'));

  renderDialog();

  expect(
    await screen.findByText("The card form couldn't be loaded. Please try again."),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save card' })).not.toBeInTheDocument();
});

it('blocks submission and flags required fields when billing is incomplete', async () => {
  vi.mocked(getBillingPrefill).mockResolvedValue(emptyBillingValues);
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());

  const { user } = renderDialog();

  await user.click(await screen.findByRole('button', { name: 'Save card' }));

  expect(await screen.findAllByText('Required')).not.toHaveLength(0);
  expect(vaultBraintreeInstrument).not.toHaveBeenCalled();
});

it('tears Drop-in down on unmount', async () => {
  const dropin = buildDropin();
  vi.mocked(createDropinWithTimeout).mockResolvedValue(dropin);

  const { result } = renderDialog();
  await waitFor(() => expect(createDropinWithTimeout).toHaveBeenCalled());
  await screen.findByRole('button', { name: 'Save card' });

  await act(async () => {
    result.unmount();
  });

  expect(dropin.teardown).toHaveBeenCalled();
});
