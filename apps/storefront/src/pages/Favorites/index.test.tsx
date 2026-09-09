import { buildB2BFeaturesStateWith, renderWithProviders, screen } from 'tests/test-utils';

import Favorites from '.';

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('shows the unavailable state when the host has not enabled favorites', () => {
  renderWithProviders(<Favorites />);

  expect(screen.getByText('Favorites are not available for this account.')).toBeInTheDocument();
});

it('shows the unavailable state while a sales rep is masquerading', () => {
  window.BC_CONTEXT = { favorites: { enabled: true } };

  renderWithProviders(<Favorites />, {
    preloadedState: {
      b2bFeatures: buildB2BFeaturesStateWith({ masqueradeCompany: { isAgenting: true } }),
    },
  });

  expect(screen.getByText('Favorites are not available for this account.')).toBeInTheDocument();
});
