/**
 * Adapter for the Stencil theme's favorites browser keys (spec §2.2, §7).
 *
 * This is the ONLY portal module that touches localStorage/sessionStorage for favorites,
 * and it is a deliberate exception to the repo rule against web storage for state: these
 * keys are another system's storage (the theme's favorites star, same origin). They are
 * read and written through this adapter and never used as a React state source. Values
 * use the theme's storage-utils `{ value, expiry }` wrapper.
 */

const GUEST_KEY = 'favorites_guest';
const LISTS_CACHE_KEY = 'favorites_lists';
const DEFAULT_LIST_KEY = 'favorites_default_list';

export interface GuestFavorite {
  productId: number;
  variantId: number | null;
  addedAt: number;
}

interface Wrapped {
  value: unknown;
  expiry: unknown;
}

const isWrapped = (parsed: unknown): parsed is Wrapped =>
  typeof parsed === 'object' && parsed !== null && 'value' in parsed;

// Storage can throw (private windows, blocked site data); a throw reads as "nothing there".
const readWrappedValue = (getStorage: () => Storage, key: string): unknown => {
  try {
    const raw = getStorage().getItem(key);

    if (!raw) {
      return undefined;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!isWrapped(parsed)) {
      return undefined;
    }

    if (typeof parsed.expiry === 'number' && parsed.expiry <= Date.now()) {
      return undefined;
    }

    return parsed.value;
  } catch {
    return undefined;
  }
};

const write = (action: () => void) => {
  try {
    action();
  } catch {
    // best effort: the theme tolerates a missing key
  }
};

const toGuestFavorite = (row: unknown): GuestFavorite[] => {
  if (typeof row !== 'object' || row === null) {
    return [];
  }

  const { productId, variantId, addedAt } = row as Record<string, unknown>;

  if (typeof productId !== 'number' || !Number.isFinite(productId)) {
    return [];
  }

  return [
    {
      productId,
      variantId: typeof variantId === 'number' ? variantId : null,
      addedAt: typeof addedAt === 'number' ? addedAt : 0,
    },
  ];
};

export const readGuestFavorites = (): GuestFavorite[] => {
  const value = readWrappedValue(() => window.localStorage, GUEST_KEY);

  return Array.isArray(value) ? value.flatMap(toGuestFavorite) : [];
};

/** Writes an empty wrapper rather than removing the key, so either style of theme reader sees "empty". */
export const clearGuestFavorites = () =>
  write(() => window.localStorage.setItem(GUEST_KEY, JSON.stringify({ value: [], expiry: null })));

export const getDefaultListId = (): number | null => {
  try {
    const raw = window.localStorage.getItem(DEFAULT_LIST_KEY);
    const id = Number(raw);

    return raw && Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
};

/** The theme's one-click save goes to "the last list the customer saved to"; keep it current. */
export const setDefaultListId = (listId: number) =>
  write(() => window.localStorage.setItem(DEFAULT_LIST_KEY, String(listId)));

export const clearDefaultListId = () =>
  write(() => window.localStorage.removeItem(DEFAULT_LIST_KEY));

/** The theme caches the customer's lists for five minutes; drop it after every mutation. */
export const invalidateListsCache = () =>
  write(() => window.sessionStorage.removeItem(LISTS_CACHE_KEY));
