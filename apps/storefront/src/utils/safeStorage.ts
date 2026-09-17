export type KeyValueStorage = Pick<Storage, 'clear' | 'getItem' | 'removeItem' | 'setItem'>;

// Safari configured to block all cookies (and some in-app webviews) throws a SecurityError on
// `window.localStorage` itself, before any read or write. Reading these getters at module scope
// or during render aborts whichever chunk or component tree touched them, so resolve them once
// here behind a guard. In the blocked case values live in memory: they are lost on reload, but
// the portal runs. Prefer these over `window.localStorage` / `window.sessionStorage` anywhere
// the access is not already inside a try/catch.
function withMemoryFallback(getStorage: () => Storage): KeyValueStorage {
  try {
    return getStorage();
  } catch {
    const values = new Map<string, string>();

    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
      clear: () => {
        values.clear();
      },
    };
  }
}

export const safeLocalStorage = withMemoryFallback(() => window.localStorage);
export const safeSessionStorage = withMemoryFallback(() => window.sessionStorage);
