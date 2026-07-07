import { renderWithProviders, screen } from 'tests/test-utils';

import Loyalty from '.';

vi.mock('@/utils/basicConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/basicConfig')>()),
  platform: 'catalyst',
}));

beforeEach(() => {
  window.BC_CONTEXT = {
    loyalty: {
      shopKey: 'store-key',
      apiBase: 'https://ssw.example.com/customers',
      appClientId: 'ssw-app-client-id',
    },
  };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('shows the unavailable state on non-bigcommerce platforms even when configured', () => {
  renderWithProviders(<Loyalty />);

  expect(screen.getByText('Rewards are not available.')).toBeInTheDocument();
});
