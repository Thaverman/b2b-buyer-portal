import { renderHookWithProviders } from 'tests/utils/hook-test-utils';

import { AppStore, setupStore } from '@/store';

import { useScrollBar } from './useScrollBar';

// The reducer writes `body.style.overflow` on whatever frame the store holds. A stand-in does:
// a real jsdom document in the store sends the dev-mode state checks recursing through it.
const buildThemeFrame = () => ({ body: { style: {} } }) as unknown as Document;
const lock = (store: AppStore) => store.getState().theme.themeFrame?.body.style.overflow;

it('locks the theme frame while open and releases it once closed', () => {
  const { result, store } = renderHookWithProviders(({ open }) => useScrollBar(open), {
    preloadedState: { theme: { themeFrame: buildThemeFrame() } },
    initialProps: { open: true },
  });

  expect(lock(store)).toBe('hidden');

  result.rerender({ open: false });

  expect(lock(store)).toBe('initial');
});

// A dialog whose owner unmounts while it is open never gets to close: nothing else would release.
it('releases the lock when the component unmounts while still open', () => {
  const { result, store } = renderHookWithProviders(() => useScrollBar(true), {
    preloadedState: { theme: { themeFrame: buildThemeFrame() } },
  });

  expect(lock(store)).toBe('hidden');

  result.unmount();

  expect(lock(store)).toBe('initial');
});

it("leaves another component's lock in place when a closed one unmounts", () => {
  const store = setupStore({ theme: { themeFrame: buildThemeFrame() } });
  // Every closed instance releases on mount, so the open one has to mount after it.
  const { result: closed } = renderHookWithProviders(() => useScrollBar(false), { store });
  renderHookWithProviders(() => useScrollBar(true), { store });

  expect(lock(store)).toBe('hidden');

  closed.unmount();

  expect(lock(store)).toBe('hidden');
});
