import {
  buildB2BFeaturesStateWith,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from 'tests/test-utils';

import ManageSubscriptions from '.';

// The page has its own tests; here only the switch matters.
vi.mock('./SubscriptionsManager', () => ({
  default: () => <div>portal subscriptions page</div>,
}));

const configure = (customManager?: boolean) => {
  window.BC_CONTEXT = {
    subscriptions: {
      merchantId: 'merchant-public-id',
      authEndpoint: 'https://api.example.com/products/productclient/ordergroove-auth',
      appClientId: 'ssw-app-client-id',
      ...(customManager === undefined ? {} : { customManager }),
    },
  };
};

afterEach(() => {
  delete window.BC_CONTEXT;
});

describe('without the custom manager flag', () => {
  it('renders the hosted iframe pointing at the storefront subscriptions page', () => {
    configure();

    renderWithProviders(<ManageSubscriptions />);

    const iframe = screen.getByTitle('Manage Subscriptions') as HTMLIFrameElement;
    expect(iframe.src).toContain('/subscriptions?hideLayout=true');
    expect(screen.queryByText('portal subscriptions page')).not.toBeInTheDocument();
  });

  it('shows the spinner until the iframe finishes loading', async () => {
    configure(false);

    renderWithProviders(<ManageSubscriptions />);

    expect(screen.getByText(/Loading/)).toBeInTheDocument();
    fireEvent.load(screen.getByTitle('Manage Subscriptions'));
    await waitFor(() => {
      expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
    });
  });
});

it('renders the portal page when the flag is on', () => {
  configure(true);

  renderWithProviders(<ManageSubscriptions />);

  expect(screen.getByText('portal subscriptions page')).toBeInTheDocument();
  expect(screen.queryByTitle('Manage Subscriptions')).not.toBeInTheDocument();
});

it('keeps the hosted iframe for a masquerading rep even with the flag on', () => {
  configure(true);

  renderWithProviders(<ManageSubscriptions />, {
    preloadedState: {
      b2bFeatures: buildB2BFeaturesStateWith({ masqueradeCompany: { isAgenting: true } }),
    },
  });

  expect(screen.getByTitle('Manage Subscriptions')).toBeInTheDocument();
  expect(screen.queryByText('portal subscriptions page')).not.toBeInTheDocument();
});
