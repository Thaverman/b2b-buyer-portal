import { act, renderWithProviders, waitFor, within } from 'tests/test-utils';

import { themeFrameSelector } from '@/store/selectors';

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

// The selector is mocked rather than seeding preloadedState, because a real jsdom Document
// in the store makes RTK's immutableCheck walk it and blow the stack. Mocking it lets these
// tests use a REAL iframe document, which is what makes the realm assertions meaningful.
vi.mock('@/store/selectors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/selectors')>()),
  themeFrameSelector: vi.fn(),
}));

let themeFrame: Document;

const filledBilling = {
  ...emptyBillingValues,
  firstName: 'Ada',
  lastName: 'Lovelace',
  address1: '1 Analytical Way',
  city: 'Austin',
  postalCode: '78701',
  countryCode: 'US',
};

// The dialog renders inside the ThemeFrame, so `screen` (which queries the top-level body)
// would find nothing; every query is scoped to the frame document.
const inFrame = () => within(themeFrame.body);

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
  );

beforeEach(() => {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  themeFrame = iframe.contentDocument as Document;
  vi.mocked(themeFrameSelector).mockReturnValue(themeFrame);

  vi.mocked(getBillingCountries).mockResolvedValue([]);
  vi.mocked(getBillingPrefill).mockResolvedValue(filledBilling);
});

it('mounts Drop-in into the ThemeFrame document, not the parent document', async () => {
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());

  renderDialog();

  await waitFor(() => expect(createDropinWithTimeout).toHaveBeenCalled());

  const [passedDocument, container, token] = vi.mocked(createDropinWithTimeout).mock.calls[0];
  expect(passedDocument).toBe(themeFrame);
  expect(token).toBe('bt-client-token');

  // The assertion that matters, and the one whose absence let a realm split ship: the SDK
  // runs in the ThemeFrame realm, so the container it is handed must belong to THAT
  // document. When MUI portalled the dialog to the parent instead, Drop-in created its
  // field iframes in the wrong realm and hung forever on a handshake that cannot cross.
  expect(container.ownerDocument).toBe(themeFrame);
  expect(themeFrame.body.contains(container)).toBe(true);
});

it('renders the dialog itself inside the ThemeFrame document', async () => {
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());

  renderDialog();

  await waitFor(() => expect(createDropinWithTimeout).toHaveBeenCalled());

  expect(themeFrame.querySelector('[role=dialog]')).not.toBeNull();
  expect(document.querySelector('[role=dialog]')).toBeNull();
});

it('vaults the nonce and reports success', async () => {
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());
  vi.mocked(vaultBraintreeInstrument).mockResolvedValue({ customerId: 1, instruments: [] });
  const onAdded = vi.fn();

  const { user } = renderDialog({ onAdded });

  await user.click(await inFrame().findByRole('button', { name: 'Save card' }));

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

  await user.click(await inFrame().findByRole('button', { name: 'Save card' }));

  expect(
    await inFrame().findByText(
      "We couldn't save this card. Check the card details and billing address, or try a different card.",
    ),
  ).toBeInTheDocument();
  expect(onAdded).not.toHaveBeenCalled();
});

it('shows the rate-limit copy when the endpoint throttles', async () => {
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());
  vi.mocked(vaultBraintreeInstrument).mockRejectedValue(new PaymentMethodsError('rateLimited'));

  const { user } = renderDialog();

  await user.click(await inFrame().findByRole('button', { name: 'Save card' }));

  expect(
    await inFrame().findByText('Too many requests — please try again in a minute.'),
  ).toBeInTheDocument();
});

it('shows the generic system copy when the vault call fails upstream', async () => {
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());
  vi.mocked(vaultBraintreeInstrument).mockRejectedValue(new PaymentMethodsError('upstream'));

  const { user } = renderDialog();

  await user.click(await inFrame().findByRole('button', { name: 'Save card' }));

  expect(await inFrame().findByText('Something went wrong. Please try again.')).toBeInTheDocument();
});

it('shows the form error when Drop-in cannot initialize', async () => {
  vi.mocked(createDropinWithTimeout).mockRejectedValue(new Error('timed out'));

  renderDialog();

  expect(
    await inFrame().findByText("The card form couldn't be loaded. Please try again."),
  ).toBeInTheDocument();
  expect(inFrame().queryByRole('button', { name: 'Save card' })).not.toBeInTheDocument();
});

it('blocks submission and flags required fields when billing is incomplete', async () => {
  vi.mocked(getBillingPrefill).mockResolvedValue(emptyBillingValues);
  vi.mocked(createDropinWithTimeout).mockResolvedValue(buildDropin());

  const { user } = renderDialog();

  await user.click(await inFrame().findByRole('button', { name: 'Save card' }));

  expect(await inFrame().findAllByText('Required')).not.toHaveLength(0);
  expect(vaultBraintreeInstrument).not.toHaveBeenCalled();
});

it('tears Drop-in down on unmount', async () => {
  const dropin = buildDropin();
  vi.mocked(createDropinWithTimeout).mockResolvedValue(dropin);

  const { result } = renderDialog();
  await waitFor(() => expect(createDropinWithTimeout).toHaveBeenCalled());
  await inFrame().findByRole('button', { name: 'Save card' });

  await act(async () => {
    result.unmount();
  });

  expect(dropin.teardown).toHaveBeenCalled();
});
