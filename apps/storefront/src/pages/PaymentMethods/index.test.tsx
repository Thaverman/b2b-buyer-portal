import {
  buildB2BFeaturesStateWith,
  builder,
  delay,
  faker,
  http,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
  waitFor,
  within,
} from 'tests/test-utils';

import { snackbar } from '@/utils/b3Tip';

import { StoredInstrument } from './api';
import { createDropin, DropinInstance } from './dropin';
import PaymentMethods from '.';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/utils/b3Logger');

vi.mock('./dropin', () => ({
  createDropin: vi.fn(),
}));

const { server } = startMockServer();

const apiBase = 'https://api.example.com';
const appClientId = 'ssw-app-client-id';
const currentJwtUrl = 'http://localhost:3000/customer/current.jwt';

const buildStoredInstrumentWith = builder<StoredInstrument>(() => ({
  token: faker.string.uuid(),
  last4: faker.string.numeric(4),
  brand: faker.helpers.arrayElement(['VISA', 'MASTERCARD', 'AMEX']),
  expiryMonth: faker.number.int({ min: 1, max: 12 }),
  expiryYear: faker.number.int({ min: 2030, max: 2035 }),
  type: 'card',
  isDefault: false,
  source: faker.helpers.arrayElement(['bigcommerce', 'braintree']),
}));

const mockJwt = () => server.use(http.get(currentJwtUrl, () => HttpResponse.text('fresh-jwt')));

const mockList = (instruments: StoredInstrument[]) =>
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () =>
      HttpResponse.json({ customerId: 999, instruments }),
    ),
  );

const fakeDropinInstance = (): DropinInstance => ({
  requestPaymentMethod: vi.fn().mockResolvedValue({ nonce: 'fake-nonce', deviceData: '{"d":1}' }),
  teardown: vi.fn().mockResolvedValue(undefined),
});

const mockClientToken = () =>
  server.use(
    http.post(`${apiBase}/customers/Customer/VaultClientToken`, () =>
      HttpResponse.json({ clientToken: 'bt-client-token' }),
    ),
  );

// A real (jsdom) Document in preloadedState blows the stack in RTK's dev-mode
// immutable-check traversal; the component only hands it to the mocked createDropin,
// so a stub with just what the theme slice touches (updateOverflowStyle) is enough.
const fakeThemeFrame = {
  body: { style: {} },
} as NonNullable<HTMLIFrameElement['contentDocument']>;

const mockClientTokenUnavailable = () =>
  server.use(
    http.post(`${apiBase}/customers/Customer/VaultClientToken`, () =>
      HttpResponse.json({ error: 'upstream_unavailable' }, { status: 502 }),
    ),
  );

beforeEach(() => {
  window.BC_CONTEXT = { paymentMethods: { apiBase, appClientId } };
  vi.mocked(createDropin).mockResolvedValue(fakeDropinInstance());
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('renders cards when the backend returns PascalCase keys (.NET serialization)', async () => {
  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () =>
      HttpResponse.json({
        CustomerId: 999,
        Instruments: [
          {
            Token: 'tok-pascal',
            Last4: '4242',
            Brand: 'VISA',
            ExpiryMonth: 3,
            ExpiryYear: 2030,
            Type: 'stored_card',
            IsDefault: true,
          },
        ],
      }),
    ),
  );

  renderWithProviders(<PaymentMethods />);

  expect(await screen.findByText('VISA •••• 4242')).toBeInTheDocument();
  expect(screen.getByText('Default')).toBeInTheDocument();
});

it('renders a saved card with brand, last4, expiry and default chip', async () => {
  mockJwt();
  mockList([
    buildStoredInstrumentWith({
      brand: 'VISA',
      last4: '4242',
      expiryMonth: 12,
      expiryYear: 2030,
      isDefault: true,
    }),
  ]);

  renderWithProviders(<PaymentMethods />);

  expect(await screen.findByText('VISA •••• 4242')).toBeInTheDocument();
  expect(screen.getByText('Expires 12/2030')).toBeInTheDocument();
  expect(screen.getByText('Default')).toBeInTheDocument();
  expect(screen.queryByText('Expired')).not.toBeInTheDocument();
});

it('marks a card whose expiry is in the past as expired', async () => {
  mockJwt();
  mockList([buildStoredInstrumentWith({ expiryMonth: 1, expiryYear: 2020 })]);

  renderWithProviders(<PaymentMethods />);

  expect(await screen.findByText('Expired')).toBeInTheDocument();
});

it('shows the empty state when the customer has no saved cards', async () => {
  mockJwt();
  mockList([]);

  renderWithProviders(<PaymentMethods />);

  expect(
    await screen.findByText('You have no saved cards. Cards can be saved during checkout.'),
  ).toBeInTheDocument();
});

it('shows the session-expired state when the jwt fetch fails', async () => {
  server.use(http.get(currentJwtUrl, () => HttpResponse.text('{"errors":[]}', { status: 401 })));

  renderWithProviders(<PaymentMethods />);

  expect(
    await screen.findByText('Your session has expired — please sign in again.'),
  ).toBeInTheDocument();
});

it('shows the load error with a working retry button', async () => {
  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () =>
      HttpResponse.json({ error: 'upstream_unavailable' }, { status: 502 }),
    ),
  );

  const { user } = renderWithProviders(<PaymentMethods />);

  expect(await screen.findByText("We couldn't load your saved cards.")).toBeInTheDocument();

  mockList([buildStoredInstrumentWith({ brand: 'AMEX', last4: '0005' })]);

  await user.click(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByText('AMEX •••• 0005')).toBeInTheDocument();
});

it('shows the unavailable state when BC_CONTEXT is not configured', () => {
  delete window.BC_CONTEXT;

  renderWithProviders(<PaymentMethods />);

  expect(screen.getByText('Payment methods are not available.')).toBeInTheDocument();
});

it('shows the unavailable state while a sales rep is masquerading', () => {
  renderWithProviders(<PaymentMethods />, {
    preloadedState: {
      b2bFeatures: buildB2BFeaturesStateWith({ masqueradeCompany: { isAgenting: true } }),
    },
  });

  expect(screen.getByText('Payment methods are not available.')).toBeInTheDocument();
});

it('sets a card as default and re-renders from the refreshed list', async () => {
  const visa = buildStoredInstrumentWith({ brand: 'VISA', last4: '4242', isDefault: true });
  const amex = buildStoredInstrumentWith({ brand: 'AMEX', last4: '0005', isDefault: false });

  mockJwt();
  mockList([visa, amex]);

  const requestBody = vi.fn();

  server.use(
    http.post(`${apiBase}/customers/Customer/SetDefaultStoredInstrument`, async ({ request }) => {
      requestBody(await request.json());

      return HttpResponse.json({
        customerId: 999,
        instruments: [
          { ...visa, isDefault: false },
          { ...amex, isDefault: true },
        ],
      });
    }),
  );

  const { user } = renderWithProviders(<PaymentMethods />);

  // only the non-default AMEX row offers the action
  await user.click(await screen.findByRole('button', { name: 'Set as default' }));

  await waitFor(() => {
    expect(snackbar.success).toHaveBeenCalledWith('Default card updated');
  });
  expect(requestBody).toHaveBeenCalledWith({ Jwt: 'fresh-jwt', Token: amex.token });

  // the refreshed list moved the default: the chip is now in the AMEX card and
  // the set-as-default action moved to the VISA card
  const amexCard = screen.getByText('AMEX •••• 0005').closest('.MuiCard-root') as HTMLElement;
  const visaCard = screen.getByText('VISA •••• 4242').closest('.MuiCard-root') as HTMLElement;
  expect(within(amexCard).getByText('Default')).toBeInTheDocument();
  expect(
    within(amexCard).queryByRole('button', { name: 'Set as default' }),
  ).not.toBeInTheDocument();
  expect(within(visaCard).getByRole('button', { name: 'Set as default' })).toBeInTheDocument();
});

it('does not offer set-as-default on the default card', async () => {
  mockJwt();
  mockList([buildStoredInstrumentWith({ isDefault: true })]);

  renderWithProviders(<PaymentMethods />);

  expect(await screen.findByText('Default')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Set as default' })).not.toBeInTheDocument();
});

it('disables row actions while a mutation is pending', async () => {
  mockJwt();
  mockList([
    buildStoredInstrumentWith({ isDefault: false }),
    buildStoredInstrumentWith({ isDefault: false }),
  ]);
  server.use(
    http.post(`${apiBase}/customers/Customer/SetDefaultStoredInstrument`, async () => {
      await delay('infinite');

      return HttpResponse.json({ customerId: 999, instruments: [] });
    }),
  );

  const { user } = renderWithProviders(<PaymentMethods />);

  const buttons = await screen.findAllByRole('button', { name: 'Set as default' });

  await user.click(buttons[0]);

  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: 'Set as default' })[1]).toBeDisabled();
  });
});

it('refetches the list when set-as-default reports the card no longer exists', async () => {
  const card = buildStoredInstrumentWith({ isDefault: false });
  const listRequests = vi.fn();

  mockJwt();
  server.use(
    http.post(`${apiBase}/customers/Customer/StoredInstruments`, () => {
      listRequests();

      return HttpResponse.json({ customerId: 999, instruments: [card] });
    }),
    http.post(`${apiBase}/customers/Customer/SetDefaultStoredInstrument`, () =>
      HttpResponse.json({ error: 'instrument_not_found' }, { status: 404 }),
    ),
  );

  const { user } = renderWithProviders(<PaymentMethods />);

  await user.click(await screen.findByRole('button', { name: 'Set as default' }));

  await waitFor(() => {
    expect(snackbar.error).toHaveBeenCalledWith('That card no longer exists.');
  });
  await waitFor(() => {
    expect(listRequests).toHaveBeenCalledTimes(2);
  });
});

it('deletes a card after confirmation and re-renders from the refreshed list', async () => {
  const visa = buildStoredInstrumentWith({ brand: 'VISA', last4: '4242', isDefault: true });
  const amex = buildStoredInstrumentWith({ brand: 'AMEX', last4: '0005', isDefault: false });

  mockJwt();
  mockList([visa, amex]);

  const requestBody = vi.fn();

  server.use(
    http.post(`${apiBase}/customers/Customer/DeleteStoredInstrument`, async ({ request }) => {
      requestBody(await request.json());

      return HttpResponse.json({ customerId: 999, instruments: [visa] });
    }),
  );

  const { user } = renderWithProviders(<PaymentMethods />);

  await screen.findByText('AMEX •••• 0005');

  // each row has a Delete button; the second belongs to the AMEX row
  await user.click(screen.getAllByRole('button', { name: 'Delete' })[1]);

  expect(
    await screen.findByText(
      'AMEX •••• 0005 will be permanently removed from your saved cards and from your payment provider, and will no longer be available at checkout. This cannot be undone.',
    ),
  ).toBeInTheDocument();

  // the dialog's confirm button is the last "Delete" button in the document
  const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
  await user.click(deleteButtons[deleteButtons.length - 1]);

  await waitFor(() => {
    expect(snackbar.success).toHaveBeenCalledWith('Card deleted');
  });
  expect(requestBody).toHaveBeenCalledWith({ Jwt: 'fresh-jwt', Token: amex.token });
  await waitFor(() => {
    expect(screen.queryByText('AMEX •••• 0005')).not.toBeInTheDocument();
  });
});

it('does not delete when the confirmation dialog is cancelled', async () => {
  const deleteRequests = vi.fn();

  mockJwt();
  mockList([buildStoredInstrumentWith({ brand: 'VISA', last4: '4242' })]);
  server.use(
    http.post(`${apiBase}/customers/Customer/DeleteStoredInstrument`, () => {
      deleteRequests();

      return HttpResponse.json({ customerId: 999, instruments: [] });
    }),
  );

  const { user } = renderWithProviders(<PaymentMethods />);

  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  await user.click(await screen.findByRole('button', { name: 'Cancel' }));

  expect(deleteRequests).not.toHaveBeenCalled();
  expect(screen.getByText('VISA •••• 4242')).toBeInTheDocument();
});

it('closes the dialog and shows an error when the delete fails', async () => {
  mockJwt();
  mockList([buildStoredInstrumentWith({ brand: 'VISA', last4: '4242' })]);
  server.use(
    http.post(`${apiBase}/customers/Customer/DeleteStoredInstrument`, () =>
      HttpResponse.json({ error: 'upstream_unavailable' }, { status: 502 }),
    ),
  );

  const { user } = renderWithProviders(<PaymentMethods />);

  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  await screen.findByText('Delete card?');

  const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
  await user.click(deleteButtons[deleteButtons.length - 1]);

  await waitFor(() => {
    expect(snackbar.error).toHaveBeenCalledWith('Something went wrong. Please try again.');
  });
  await waitFor(() => {
    expect(screen.queryByText('Delete card?')).not.toBeInTheDocument();
  });
  expect(screen.getByText('VISA •••• 4242')).toBeInTheDocument();
});

describe('add card gating', () => {
  it('shows the add-card button when the store supports vaulting', async () => {
    mockJwt();
    mockList([]);
    mockClientToken();

    renderWithProviders(<PaymentMethods />);

    expect(await screen.findByRole('button', { name: 'Add card' })).toBeInTheDocument();
  });

  it('hides the add-card button when the vault client token is unavailable (no Braintree on this brand)', async () => {
    mockJwt();
    mockList([buildStoredInstrumentWith({ brand: 'VISA', last4: '4242' })]);
    mockClientTokenUnavailable();

    renderWithProviders(<PaymentMethods />);

    // the list still renders — managing existing cards works everywhere
    expect(await screen.findByText('VISA •••• 4242')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add card' })).not.toBeInTheDocument();
  });

  it('invites adding a first card in the empty state when vaulting is available', async () => {
    mockJwt();
    mockList([]);
    mockClientToken();

    renderWithProviders(<PaymentMethods />);

    expect(
      await screen.findByText(
        'You have no saved cards. Add your first card and it will become your default.',
      ),
    ).toBeInTheDocument();
  });
});

describe('add card form', () => {
  it('opens the drop-in section with the fetched client token and closes on cancel with teardown', async () => {
    const instance = fakeDropinInstance();
    vi.mocked(createDropin).mockResolvedValue(instance);
    mockJwt();
    mockList([]);
    mockClientToken();

    const { user } = renderWithProviders(<PaymentMethods />, {
      preloadedState: { theme: { themeFrame: fakeThemeFrame } },
    });

    await user.click(await screen.findByRole('button', { name: 'Add card' }));

    await waitFor(() => {
      expect(createDropin).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'bt-client-token',
      );
    });
    expect(screen.getByRole('button', { name: 'Save card' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('button', { name: 'Save card' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(instance.teardown).toHaveBeenCalled();
    });
  });

  it('shows the system-error message when drop-in initialization fails', async () => {
    vi.mocked(createDropin).mockRejectedValue(new Error('script failed'));
    mockJwt();
    mockList([]);
    mockClientToken();

    const { user } = renderWithProviders(<PaymentMethods />, {
      preloadedState: { theme: { themeFrame: fakeThemeFrame } },
    });

    await user.click(await screen.findByRole('button', { name: 'Add card' }));

    expect(
      await screen.findByText(
        'Something went wrong on our end — your card was not saved. Please try again.',
      ),
    ).toBeInTheDocument();
  });
});
