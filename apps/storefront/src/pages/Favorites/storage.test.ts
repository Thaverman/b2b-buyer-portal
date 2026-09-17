import { buildGuestFavoriteWith, faker } from 'tests/test-utils';

import {
  clearDefaultListId,
  clearGuestFavorites,
  getDefaultListId,
  invalidateListsCache,
  readGuestFavorites,
  setDefaultListId,
} from './storage';

// The theme's storage-utils wrapper.
const wrap = (value: unknown, expiry: number | null = null) => JSON.stringify({ value, expiry });

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('readGuestFavorites', () => {
  it('reads the rows the theme saved for a guest', () => {
    const rows = [
      buildGuestFavoriteWith({ variantId: null }),
      buildGuestFavoriteWith({ variantId: faker.number.int({ min: 1 }) }),
    ];
    window.localStorage.setItem('favorites_guest', wrap(rows));

    expect(readGuestFavorites()).toEqual(rows);
  });

  it('is empty when nothing was saved', () => {
    expect(readGuestFavorites()).toEqual([]);
  });

  it('is empty when the stored value is not JSON, not wrapped, or not an array', () => {
    window.localStorage.setItem('favorites_guest', '{not json');
    expect(readGuestFavorites()).toEqual([]);

    window.localStorage.setItem(
      'favorites_guest',
      JSON.stringify([buildGuestFavoriteWith('WHATEVER_VALUES')]),
    );
    expect(readGuestFavorites()).toEqual([]);

    window.localStorage.setItem('favorites_guest', wrap({ productId: 1 }));
    expect(readGuestFavorites()).toEqual([]);
  });

  it('is empty once the wrapper has expired', () => {
    window.localStorage.setItem(
      'favorites_guest',
      wrap([buildGuestFavoriteWith('WHATEVER_VALUES')], Date.now() - 1),
    );

    expect(readGuestFavorites()).toEqual([]);
  });

  it('keeps rows with a future expiry', () => {
    const row = buildGuestFavoriteWith('WHATEVER_VALUES');
    window.localStorage.setItem('favorites_guest', wrap([row], Date.now() + 60_000));

    expect(readGuestFavorites()).toEqual([row]);
  });

  it('drops rows without a numeric productId and normalizes a missing variantId to null', () => {
    const productId = faker.number.int({ min: 1 });
    window.localStorage.setItem(
      'favorites_guest',
      wrap([{ productId: 'abc' }, { productId, addedAt: 5 }, 'junk']),
    );

    expect(readGuestFavorites()).toEqual([{ productId, variantId: null, addedAt: 5 }]);
  });

  it('reads as empty when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readGuestFavorites()).toEqual([]);
    expect(getDefaultListId()).toBeNull();
  });
});

describe('clearGuestFavorites', () => {
  it('writes an empty wrapper so the theme reads "no guest favorites"', () => {
    window.localStorage.setItem(
      'favorites_guest',
      wrap([buildGuestFavoriteWith('WHATEVER_VALUES')]),
    );

    clearGuestFavorites();

    expect(JSON.parse(window.localStorage.getItem('favorites_guest') ?? '')).toEqual({
      value: [],
      expiry: null,
    });
  });
});

describe('default list id', () => {
  it('round-trips the id as a string', () => {
    setDefaultListId(42);

    expect(window.localStorage.getItem('favorites_default_list')).toBe('42');
    expect(getDefaultListId()).toBe(42);
  });

  it('is null when absent or not a whole number', () => {
    expect(getDefaultListId()).toBeNull();

    window.localStorage.setItem('favorites_default_list', 'forty-two');
    expect(getDefaultListId()).toBeNull();
  });

  it('clears the key', () => {
    setDefaultListId(7);

    clearDefaultListId();

    expect(window.localStorage.getItem('favorites_default_list')).toBeNull();
  });
});

describe('invalidateListsCache', () => {
  it('removes the theme lists cache from session storage', () => {
    window.sessionStorage.setItem('favorites_lists', wrap([], Date.now() + 1000));

    invalidateListsCache();

    expect(window.sessionStorage.getItem('favorites_lists')).toBeNull();
  });
});

describe('when the browser denies access to storage', () => {
  // Safari set to block all cookies throws on the `window.localStorage` getter itself. The
  // access used to sit in the argument list of the guarded reader, so it threw before the
  // guard was entered.
  beforeEach(() => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
  });

  it('reads guest favorites as empty rather than throwing', () => {
    expect(readGuestFavorites()).toEqual([]);
  });

  it('swallows the write when the default list id is set', () => {
    expect(() => setDefaultListId(faker.number.int({ min: 1 }))).not.toThrow();
  });
});
