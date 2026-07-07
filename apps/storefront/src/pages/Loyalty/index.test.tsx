import {
  buildB2BFeaturesStateWith,
  renderWithProviders,
  screen,
  startMockServer,
} from 'tests/test-utils';

import Loyalty from '.';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/utils/b3Logger');

startMockServer();

const shopKey = 'store-key';
const apiBase = 'https://ssw.example.com/customers';
const appClientId = 'ssw-app-client-id';

beforeEach(() => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId } };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('shows the unavailable state when BC_CONTEXT is not configured', () => {
  delete window.BC_CONTEXT;

  renderWithProviders(<Loyalty />);

  expect(screen.getByText('Rewards are not available.')).toBeInTheDocument();
});

it('shows the unavailable state when the loyalty config is incomplete', () => {
  window.BC_CONTEXT = { loyalty: { shopKey, apiBase, appClientId: '' } };

  renderWithProviders(<Loyalty />);

  expect(screen.getByText('Rewards are not available.')).toBeInTheDocument();
});

it('shows the unavailable state while a sales rep is masquerading', () => {
  renderWithProviders(<Loyalty />, {
    preloadedState: {
      b2bFeatures: buildB2BFeaturesStateWith({ masqueradeCompany: { isAgenting: true } }),
    },
  });

  expect(screen.getByText('Rewards are not available.')).toBeInTheDocument();
});
