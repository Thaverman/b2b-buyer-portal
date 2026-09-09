import { renderWithProviders, screen } from 'tests/test-utils';

import Favorites from '.';

vi.mock('@/utils/basicConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/basicConfig')>()),
  platform: 'catalyst',
}));

beforeEach(() => {
  window.BC_CONTEXT = { favorites: { enabled: true } };
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('shows the unavailable state on non-bigcommerce platforms even when the host enables favorites', () => {
  renderWithProviders(<Favorites />);

  expect(screen.getByText('Favorites are not available for this account.')).toBeInTheDocument();
});
