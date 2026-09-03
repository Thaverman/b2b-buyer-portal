import {
  act,
  buildB2BFeaturesStateWith,
  buildCompanyStateWith,
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
import { emptyBillingValues, getBillingCountries, getBillingPrefill } from './billingPrefill';
import { hasActiveCart } from './cartPresence';
import { createStoredCardForm, StoredCardForm } from './hostedForm';
import PaymentMethods from '.';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/utils/b3Logger');

vi.mock('./hostedForm', () => ({
  createStoredCardForm: vi.fn(),
}));

vi.mock('./cartPresence', () => ({
  hasActiveCart: vi.fn(),
}));

vi.mock('./billingPrefill', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./billingPrefill')>()),
  getBillingPrefill: vi.fn(),
  getBillingCountries: vi.fn(),
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

const fakeStoredCardForm = (): StoredCardForm => ({
  submit: vi.fn().mockResolvedValue(undefined),
  teardown: vi.fn(),
});

// Mirrors the live page: the context is a JSON string, so quotes arrive escaped.
const availableNativePage = `<script>window.stencilBootstrap("account_addpaymentmethod", "{\\"storeHash\\":\\"24erkpw9h6\\",\\"vaultToken\\":\\"VAT test-token\\",\\"shopperId\\":\\"80591\\"}")</script>`;
const noGatewayNativePage = `<script>window.stencilBootstrap("account_addpaymentmethod", "{}")</script>`;

const mockNativePage = (body: string, status = 200) =>
  server.use(
    http.get(
      '*/account.php',
      () => new HttpResponse(body, { status, headers: { 'Content-Type': 'text/html' } }),
    ),
  );

// The hosted-field wrapper only redirects when the session has a cart; a plain 200 means
// "no checkout context". Healthy by default so the dialog tests keep working.
const mockHostedFieldWrapper = (status: 302 | 200) =>
  server.use(
    http.get('*/checkout/payment/hosted-field', () =>
      status === 302
        ? HttpResponse.redirect('https://payments.bigcommerce.com/pay/hosted_forms/x/field', 302)
        : new HttpResponse('', { status: 200 }),
    ),
  );

beforeEach(() => {
  window.BC_CONTEXT = { paymentMethods: { apiBase, appClientId } };
  vi.mocked(hasActiveCart).mockResolvedValue(true);
  mockHostedFieldWrapper(302);
  vi.mocked(createStoredCardForm).mockResolvedValue(fakeStoredCardForm());
  vi.mocked(getBillingCountries).mockResolvedValue([
    {
      countryCode: 'US',
      countryName: 'United States',
      states: [{ stateCode: 'MO', stateName: 'Missouri' }],
    },
    { countryCode: 'AW', countryName: 'Aruba', states: [] },
  ]);
  vi.mocked(getBillingPrefill).mockResolvedValue({
    firstName: 'Cass',
    lastName: 'Doe',
    company: '',
    address1: '1 Main St',
    address2: '',
    city: 'Bridgeton',
    stateOrProvinceCode: 'MO',
    postalCode: '63044',
    countryCode: 'US',
    phone: '',
  });
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
  it('shows the add-card button when the native page carries a vault token', async () => {
    mockJwt();
    mockList([]);
    mockNativePage(availableNativePage);

    renderWithProviders(<PaymentMethods />);

    expect(await screen.findByRole('button', { name: 'Add card' })).toBeInTheDocument();
    expect(
      await screen.findByText(
        'You have no saved cards. Add your first card and it will become your default.',
      ),
    ).toBeInTheDocument();
  });

  it('hides the affordance entirely when the store has no gateway', async () => {
    mockJwt();
    mockList([buildStoredInstrumentWith({ brand: 'VISA', last4: '4242' })]);
    mockNativePage(noGatewayNativePage);

    renderWithProviders(<PaymentMethods />);

    expect(await screen.findByText('VISA •••• 4242')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add card' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add card' })).not.toBeInTheDocument();
  });

  it('falls back to a top-frame link to the native page when vault access cannot be read', async () => {
    mockJwt();
    mockList([]);
    mockNativePage('<html>challenge</html>', 200);

    renderWithProviders(<PaymentMethods />);

    const link = await screen.findByRole('link', { name: 'Add card' });
    expect(link).toHaveAttribute(
      'href',
      '/account.php?action=add_payment_method&provider=braintree&method_type=CARD',
    );
    // the portal renders inside an iframe — a plain anchor would navigate the frame
    expect(link).toHaveAttribute('target', '_top');
    // fallback keeps today's empty-state copy
    expect(
      await screen.findByText('You have no saved cards. Cards can be saved during checkout.'),
    ).toBeInTheDocument();
  });

  it('explains the cart requirement instead of offering the dialog when there is no active cart', async () => {
    vi.mocked(hasActiveCart).mockResolvedValue(false);
    mockJwt();
    mockList([buildStoredInstrumentWith({ brand: 'VISA', last4: '4242' })]);
    mockNativePage(availableNativePage);

    renderWithProviders(<PaymentMethods />);

    expect(
      await screen.findByText(
        'To add a card here, add an item to your cart first — or save a card during checkout.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add card' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add card' })).not.toBeInTheDocument();
  });

  it('keeps the neutral empty-list copy when the dialog is withheld for lack of a cart', async () => {
    vi.mocked(hasActiveCart).mockResolvedValue(false);
    mockJwt();
    mockList([]);
    mockNativePage(availableNativePage);

    renderWithProviders(<PaymentMethods />);

    // anchor on the settled gate before asserting what is absent
    await screen.findByText(
      'To add a card here, add an item to your cart first — or save a card during checkout.',
    );
    expect(
      screen.getByText('You have no saved cards. Cards can be saved during checkout.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'You have no saved cards. Add your first card and it will become your default.',
      ),
    ).not.toBeInTheDocument();
  });
});

describe('add card dialog', () => {
  const openDialog = async () => {
    mockJwt();
    mockList([]);
    mockNativePage(availableNativePage);

    const utils = renderWithProviders(<PaymentMethods />, {
      // the dialog's email field prefills from Redux and is REQUIRED at submit time
      preloadedState: {
        company: buildCompanyStateWith({ customer: { emailAddress: 'cass@example.com' } }),
      },
    });

    await utils.user.click(await screen.findByRole('button', { name: 'Add card' }));

    return utils;
  };

  it('opens with hosted-field containers wired and billing prefilled and editable', async () => {
    await openDialog();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => {
      expect(createStoredCardForm).toHaveBeenCalledWith({
        number: 'bpm-card-number',
        expiry: 'bpm-card-expiry',
        name: 'bpm-card-name',
        cvv: 'bpm-card-cvv',
      });
    });
    // containers exist in the document for the SDK to mount into
    expect(document.getElementById('bpm-card-number')).toBeInTheDocument();

    // prefilled and editable; country and state are name-displaying dropdowns
    const first = await screen.findByLabelText('First name');
    expect(first).toHaveValue('Cass');
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveTextContent('United States');
    expect(screen.getByRole('combobox', { name: 'State/Province' })).toHaveTextContent('Missouri');
  });

  it('clears the state and offers free text when the picked country has no states', async () => {
    const form = fakeStoredCardForm();
    vi.mocked(createStoredCardForm).mockResolvedValue(form);

    const { user } = await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled());

    await user.click(screen.getByRole('combobox', { name: 'Country' }));
    await user.click(screen.getByRole('option', { name: 'Aruba' }));

    const stateInput = screen.getByRole('textbox', { name: 'State/Province' });
    expect(stateInput).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Save card' }));

    await waitFor(() => expect(form.submit).toHaveBeenCalled());
    const [fields] = vi.mocked(form.submit).mock.calls[0];
    expect(fields).toMatchObject({ countryCode: 'AW' });
    expect(fields).not.toHaveProperty('stateOrProvinceCode');
  });

  it('falls back to free-text country and state fields when the country list is unavailable', async () => {
    vi.mocked(getBillingCountries).mockResolvedValue([]);

    await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled());

    expect(screen.getByRole('textbox', { name: 'Country' })).toHaveValue('US');
    expect(screen.getByRole('textbox', { name: 'State/Province' })).toHaveValue('MO');
    expect(screen.queryByRole('combobox', { name: 'Country' })).not.toBeInTheDocument();
  });

  it('neutralizes storefront theme CSS that bleeds into the parent-document dialog', async () => {
    // The dialog escapes the ThemeFrame, so the theme's global element rules apply to it.
    // Reproduce the hostile rules the live theme ships for legend/label.
    const themeCss = document.createElement('style');
    themeCss.textContent =
      'legend{background:0 0;border:solid #999;border-width:0 0 1px;display:block;line-height:32px;margin-bottom:.75rem;padding:0;width:100%}' +
      'label{display:inline-block;font-size:1rem;margin-bottom:.375rem;padding-left:1.875rem;position:relative;width:100%}';
    document.head.prepend(themeCss);

    try {
      await openDialog();
      await screen.findByRole('dialog');
      await screen.findByLabelText('First name');

      const legend = document.querySelector('[role=dialog] fieldset legend') as HTMLElement;
      expect(getComputedStyle(legend).borderBottomWidth).toBe('0px');
      const label = document.querySelector('[role=dialog] label') as HTMLElement;
      expect(getComputedStyle(label).paddingLeft).toBe('0px');
    } finally {
      themeCss.remove();
    }
  });

  it('stacks the dialog above the ThemeFrame overlay (iframe sits at z-index 12000)', async () => {
    await openDialog();

    await screen.findByRole('dialog');
    expect(document.querySelector('.MuiDialog-root')).toHaveStyle({ zIndex: '12005' });
  });

  it('tears the hosted form down on cancel', async () => {
    const form = fakeStoredCardForm();
    vi.mocked(createStoredCardForm).mockResolvedValue(form);

    const { user } = await openDialog();

    await screen.findByRole('dialog');
    await waitFor(() => expect(createStoredCardForm).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(form.teardown).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stops before creating the hosted form when the checkout has no cart context', async () => {
    // cart present at page load, gone by the time the customer clicks: the wrapper answers 200
    mockHostedFieldWrapper(200);

    await openDialog();

    expect(
      await screen.findByText(
        'To add a card here, add an item to your cart first — or save a card during checkout.',
      ),
    ).toBeInTheDocument();
    expect(createStoredCardForm).not.toHaveBeenCalled();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('gives up on a hosted form that never finishes initializing and offers the native page', async () => {
    // checkout-sdk's initialize() has no timeout — a stalled field iframe hangs it forever
    vi.mocked(createStoredCardForm).mockReturnValue(new Promise(() => {}));
    vi.useFakeTimers({ shouldAdvanceTime: true });

    try {
      await openDialog();
      await screen.findByRole('dialog');
      expect(screen.getByRole('progressbar')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(20_000);
      });

      expect(
        await screen.findByText(
          "The card form couldn't be loaded. Please try again, or add your card on the payment methods page.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Add card' })).toHaveAttribute('target', '_top');
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the form error with a native-page link when the hosted form fails to initialize', async () => {
    vi.mocked(createStoredCardForm).mockRejectedValue(new Error('sdk failed'));

    await openDialog();

    expect(
      await screen.findByText(
        "The card form couldn't be loaded. Please try again, or add your card on the payment methods page.",
      ),
    ).toBeInTheDocument();
  });

  it('submits flat billing fields with the scraped access data and refreshes the list', async () => {
    const form = fakeStoredCardForm();
    vi.mocked(createStoredCardForm).mockResolvedValue(form);
    const newCard = buildStoredInstrumentWith({ brand: 'Visa', last4: '4242', isDefault: true });

    const { user } = await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled());

    mockList([newCard]); // the refetch after success returns the new card
    await user.click(screen.getByRole('button', { name: 'Save card' }));

    await waitFor(() => {
      expect(form.submit).toHaveBeenCalledWith(
        {
          defaultInstrument: false,
          email: 'cass@example.com',
          firstName: 'Cass',
          lastName: 'Doe',
          address1: '1 Main St',
          city: 'Bridgeton',
          postalCode: '63044',
          countryCode: 'US',
          stateOrProvinceCode: 'MO',
        },
        { shopperId: '80591', storeHash: '24erkpw9h6', vaultToken: 'VAT test-token' },
      );
    });
    expect(await screen.findByText('Visa •••• 4242')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(snackbar.success).toHaveBeenCalledWith('Card added');
  });

  it('omits empty optional billing fields from the submit payload', async () => {
    const form = fakeStoredCardForm();
    vi.mocked(createStoredCardForm).mockResolvedValue(form);

    const { user } = await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save card' }));

    await waitFor(() => expect(form.submit).toHaveBeenCalled());
    const [fields] = vi.mocked(form.submit).mock.calls[0];
    expect(fields).not.toHaveProperty('company');
    expect(fields).not.toHaveProperty('address2');
    expect(fields).not.toHaveProperty('phone');
  });

  it('shows one honest generic message on failure and keeps the dialog open', async () => {
    const form = fakeStoredCardForm();
    vi.mocked(form.submit).mockRejectedValue(new Error('STORED_CARD_FAILED'));
    vi.mocked(createStoredCardForm).mockResolvedValue(form);

    const { user } = await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save card' }));

    expect(
      await screen.findByText(
        "We couldn't save this card. Check the card details and billing address, or try a different card.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled();
  });

  it('blocks submit and marks the missing required billing fields', async () => {
    const form = fakeStoredCardForm();
    vi.mocked(createStoredCardForm).mockResolvedValue(form);
    // the vi.mock spreads importOriginal, so emptyBillingValues is the real export
    vi.mocked(getBillingPrefill).mockResolvedValue({ ...emptyBillingValues });

    const { user } = await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save card' }));

    expect(form.submit).not.toHaveBeenCalled();
    expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(4);
  });

  it('disables save while the submit is in flight', async () => {
    const form = fakeStoredCardForm();
    let resolveSubmit: () => void = () => {};
    vi.mocked(form.submit).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    vi.mocked(createStoredCardForm).mockResolvedValue(form);

    const { user } = await openDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save card' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save card' })).toBeDisabled());

    // settle the in-flight submit so its state updates land inside the test
    resolveSubmit();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
