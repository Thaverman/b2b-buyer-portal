import { renderWithProviders, screen } from 'tests/test-utils';

import PaymentMethods from '.';

vi.mock('@/utils/basicConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/basicConfig')>()),
  platform: 'catalyst',
}));

beforeEach(() => {
  window.BC_CONTEXT = {
    paymentMethods: { apiBase: 'https://api.example.com', appClientId: 'ssw-app-client-id' },
  };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('shows the unavailable state on non-bigcommerce platforms even when configured', () => {
  renderWithProviders(<PaymentMethods />);

  expect(screen.getByText('Payment methods are not available.')).toBeInTheDocument();
});
