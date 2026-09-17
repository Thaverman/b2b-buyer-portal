import { faker } from 'tests/test-utils';

// Safari with "Block All Cookies" (and some in-app webviews) throws on `window.localStorage`
// itself, not on the read/write that follows. `b3Storage` touches both storages at module
// scope and is imported across the app's main chunk, so an unguarded access rejects the whole
// chunk's evaluation and the portal never boots. Reproduced in production as Noibu 9867.
const denyAccessTo = (storage: 'localStorage' | 'sessionStorage') => {
  vi.spyOn(window, storage, 'get').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
};

const loadB3Storage = async () => import('@/utils/b3Storage');

beforeEach(() => {
  vi.resetModules();
});

it('evaluates without throwing when the browser denies access to local storage', async () => {
  denyAccessTo('localStorage');

  await expect(loadB3Storage()).resolves.toHaveProperty('B3LStorage');
});

it('falls back to in-memory storage when the browser denies access to local storage', async () => {
  const salesRepCompanyId = faker.string.numeric(5);
  denyAccessTo('localStorage');

  const { B3LStorage } = await loadB3Storage();
  B3LStorage.set('salesRepCompanyId', salesRepCompanyId);

  expect(B3LStorage.get('salesRepCompanyId')).toBe(salesRepCompanyId);
});

it('falls back to in-memory storage when the browser denies access to session storage', async () => {
  const cartToQuoteId = faker.string.uuid();
  denyAccessTo('sessionStorage');

  const { B3SStorage } = await loadB3Storage();
  B3SStorage.set('cartToQuoteId', cartToQuoteId);

  expect(B3SStorage.get('cartToQuoteId')).toBe(cartToQuoteId);
});

it('writes through to the browser storage when access is allowed', async () => {
  const salesRepCompanyId = faker.string.numeric(5);
  const cartToQuoteId = faker.string.uuid();

  const { B3LStorage, B3SStorage } = await loadB3Storage();
  B3LStorage.set('salesRepCompanyId', salesRepCompanyId);
  B3SStorage.set('cartToQuoteId', cartToQuoteId);

  expect(window.localStorage.getItem('sf-salesRepCompanyId')).toBe(
    JSON.stringify(salesRepCompanyId),
  );
  expect(window.sessionStorage.getItem('sf-cartToQuoteId')).toBe(JSON.stringify(cartToQuoteId));
});
