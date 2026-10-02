import { b2bCheckoutLogin } from '@/shared/service/b2b/graphql/checkout';

import { safeSessionStorage } from './safeStorage';

const redirect = (url: string, isReplaceCurrentUrl?: boolean) => {
  if (isReplaceCurrentUrl) {
    window.location.replace(url);
  } else {
    window.location.href = url;
  }
};

export const attemptCheckoutLoginAndRedirect = async (
  cartId: any,
  defaultCheckoutUrl: string,
  isReplaceCurrentUrl?: boolean,
) => {
  try {
    const resLogin = await b2bCheckoutLogin({
      cartData: { cartId },
    });

    const {
      checkoutLogin: { result },
    } = resLogin;

    redirect(result.redirectUrl, isReplaceCurrentUrl);
  } catch (e) {
    redirect(defaultCheckoutUrl, isReplaceCurrentUrl);
  }
};

export const setQuoteToStorage = (quoteId: string, date: any, quoteUuid?: string) => {
  safeSessionStorage.setItem('isNewStorefront', JSON.stringify(true));
  safeSessionStorage.setItem('quoteCheckoutId', quoteId);
  safeSessionStorage.setItem('quoteDate', date?.toString());
  safeSessionStorage.setItem('quoteCheckoutUuid', quoteUuid || '');
};
