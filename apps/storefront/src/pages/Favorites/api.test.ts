import { isFavoritesAvailable } from './api';

afterEach(() => {
  delete window.BC_CONTEXT;
});

describe('isFavoritesAvailable', () => {
  it('is available when the host enables favorites on a bigcommerce storefront', () => {
    window.BC_CONTEXT = { favorites: { enabled: true } };

    expect(isFavoritesAvailable()).toBe(true);
  });

  it('is unavailable when the host config has no favorites key', () => {
    window.BC_CONTEXT = {};

    expect(isFavoritesAvailable()).toBe(false);
  });

  it('is unavailable when the host disables favorites', () => {
    window.BC_CONTEXT = { favorites: { enabled: false } };

    expect(isFavoritesAvailable()).toBe(false);
  });

  it('is unavailable when there is no host config at all', () => {
    expect(isFavoritesAvailable()).toBe(false);
  });
});
