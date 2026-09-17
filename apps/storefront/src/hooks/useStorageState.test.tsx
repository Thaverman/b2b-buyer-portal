import { act, faker, renderHook } from 'tests/test-utils';

import useStorageState from '@/hooks/useStorageState';

// Safari set to block all cookies throws a SecurityError on the `window.sessionStorage` getter
// itself. Callers used to hand the hook a storage object, so that access happened at the call
// site during render, outside any guard, and took down the whole tree (there are no error
// boundaries). The hook resolves its own storage so no caller can reintroduce that.
const denyAccessTo = (storage: 'localStorage' | 'sessionStorage') => {
  vi.spyOn(window, storage, 'get').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
};

it('persists the value to session storage when access is allowed', () => {
  const key = faker.string.alpha(10);
  const next = faker.string.alpha(10);

  const { result } = renderHook(() => useStorageState(key, faker.string.alpha(10), 'session'));
  act(() => result.current[1](next));

  expect(window.sessionStorage.getItem(key)).toBe(JSON.stringify(next));
});

it('renders without throwing when the browser denies access to session storage', () => {
  const initialState = faker.string.alpha(10);
  denyAccessTo('sessionStorage');

  const { result } = renderHook(() =>
    useStorageState(faker.string.alpha(10), initialState, 'session'),
  );

  expect(result.current[0]).toBe(initialState);
});

it('keeps tracking state in memory when the browser denies access to session storage', () => {
  const next = faker.string.alpha(10);
  denyAccessTo('sessionStorage');

  const { result } = renderHook(() =>
    useStorageState(faker.string.alpha(10), faker.string.alpha(10), 'session'),
  );
  act(() => result.current[1](next));

  expect(result.current[0]).toBe(next);
});

it('renders without throwing when the browser denies access to local storage', () => {
  const initialState = faker.string.alpha(10);
  denyAccessTo('localStorage');

  const { result } = renderHook(() => useStorageState(faker.string.alpha(10), initialState));

  expect(result.current[0]).toBe(initialState);
});
