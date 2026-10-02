import { faker } from 'tests/test-utils';

import { setQuoteToStorage } from '@/utils/b3checkout';

// Safari set to block all cookies throws a SecurityError on the `window.sessionStorage` getter.
// Reading it here used to abort the quote-to-checkout handhoff before the redirect.
const denySessionStorageAccess = () => {
  vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
};

it('hands the quote details to checkout through session storage', () => {
  const quoteId = faker.string.numeric(5);
  const quoteUuid = faker.string.uuid();
  const date = faker.number.int({ min: 1 });

  setQuoteToStorage(quoteId, date, quoteUuid);

  expect(window.sessionStorage.getItem('quoteCheckoutId')).toBe(quoteId);
  expect(window.sessionStorage.getItem('quoteCheckoutUuid')).toBe(quoteUuid);
  expect(window.sessionStorage.getItem('quoteDate')).toBe(String(date));
  expect(window.sessionStorage.getItem('isNewStorefront')).toBe('true');
});

it('does not throw when the browser denies access to session storage', () => {
  const quoteId = faker.string.numeric(5);
  denySessionStorageAccess();

  expect(() => setQuoteToStorage(quoteId, faker.number.int({ min: 1 }))).not.toThrow();
});
