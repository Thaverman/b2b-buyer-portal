import type { BtnProperties } from '@/shared/customStyleButton/context/config';
import type { DispatchProps, QuoteConfigProps } from '@/shared/global/context/config';
import type { B3RequestType } from '@/shared/service/request/b3Fetch';
import type { LineItem } from '@/utils/b3Product/b3Product';

import type { EventType } from './hooks/useB2BCallback';
import type { ShoppingListsItemsProps } from './pages/ShoppingLists/config';
import type { BuyerPortalRoute } from './shared/routeList';
import type CallbackManager from './utils/b3CallbackManager';
import type { HeadlessRoute } from './constants';
import type { FormattedQuoteItem, ProductMappedAttributes } from './HeadlessController';
import type { InitializationEnvironment } from './load-functions';

declare global {
  /** @deprecated Please avoid using this interface */
  declare interface CustomFieldItems {
    [key: string]: any;
  }

  /** @deprecated Please avoid using this interface */
  declare interface CustomFieldStringItems {
    [key: string]: string;
  }

  type ChannelPlatform =
    | 'bigcommerce'
    | 'acquia'
    | 'bloomreach'
    | 'catalyst'
    | 'deity'
    | 'drupal'
    | 'gatsby'
    | 'next'
    | 'vue'
    | 'wordpress'
    | 'custom';

  type Position =
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'
    | 'top-center'
    | 'bottom-center';

  interface ToastOptions {
    action?: {
      label: string;
      onClick: () => void;
    };
    description?: string;
    position?: Position;
    dismissLabel?: string;
  }

  interface Window {
    tipDispatch: DispatchProps;
    globalTipDispatch: any;
    dataLayer?: Record<string, unknown>[];
    /** BigCommerce storefront context set by the host project; `storeSuffix` gates order-id obfuscation. */
    BC_CONTEXT?: {
      storeSuffix?: string;
      /** Gates the /payment-methods page; absent = feature off. */
      paymentMethods?: {
        apiBase: string;
        appClientId: string;
      };
      /** Gates the /loyalty page; absent (or any field missing) = feature off. */
      loyalty?: {
        /** Influence.io shop key (public). */
        shopKey: string;
        /** SSW digest-endpoint host, e.g. https://<gateway>/customers */
        apiBase: string;
        /** SSW app client id used to mint the Current Customer JWT. */
        appClientId: string;
        /**
         * entityId of the BigCommerce "Loyalty Tier" customer attribute. Absent =
         * the visibility gate is OFF and Loyalty shows for everyone, as before.
         * Find it with GET /v3/customers/attributes?name=Loyalty Tier (server-side).
         */
        tierAttributeId?: number;
        /** Theme override for the hero banner image; absent = the relative default. */
        bannerUrl?: string;
        /** Theme override for the My-benefits banner image; absent = the relative default. */
        benefitsBannerUrl?: string;
      };
    };
    /** Theme-set free-shipping config; absent = shipping tracker off. */
    loyaltyShippingConfig?: {
      threshold: number;
      excludedProductIds: string;
      excludedCategoryIds: string;
    };
    /** Theme-provided cart shipping-eligibility calculation; absent until the theme ships it. */
    getLoyaltyShippingCalculation?: () => Promise<{
      qualifies?: boolean;
      threshold?: number;
      eligibleSubtotal?: number;
      remaining?: number;
      excludedByProduct?: unknown[];
      excludedByCategory?: unknown[];
      ltlItems?: unknown[];
    }>;
    /** Theme-set rollout gate; absent (older theme deploys) = empty allowlist = everyone. */
    loyaltyRolloutConfig?: {
      allowedTiers?: string;
    };
    /** Theme-set FAQ content; absent or empty = the FAQ tab is hidden. */
    loyaltyFaqConfig?: {
      intro?: string;
      sections?: {
        title?: string;
        items?: { question?: string; answer?: string; bullets?: string[] }[];
      }[];
    };
    /** SSW site key for GetDetailWithProgress (e.g. "StoreSupply"); absent = tier progress off. */
    loyalty_site_name?: string;
    B3: {
      setting: {
        channel_id: number;
        store_hash: string;
        platform: ChannelPlatform;
        environment: string;
        disable_logout_button?: boolean;
        cart_url?: string;
      };
    };
    catalyst?: {
      toast: {
        error: (message: string, options?: ToastOptions) => void;
        success: (message: string, options?: ToastOptions) => void;
        info: (message: string, options?: ToastOptions) => void;
        warning: (message: string, options?: ToastOptions) => void;
      };
    };
    b2b: {
      __get_asset_location: (filename: string) => string;
      initializationEnvironment: InitializationEnvironment;
      callbacks: CallbackManager;
      utils: {
        openPage: (page: HeadlessRoute) => void;
        getRoutes: () => BuyerPortalRoute[];
        setConfig: (key: string, value: string) => void;
        quote: {
          addProductFromPage: (item: LineItem) => void;
          addProductsFromCart: () => Promise<void>;
          addProductsFromCartId: (cartId: string) => Promise<void>;
          addProducts: (items: LineItem[]) => Promise<void>;
          getQuoteConfigs: () => QuoteConfigProps[];
          getCurrent: () => {
            productList: FormattedQuoteItem[];
          };
          getButtonInfo: () => BtnProperties;
          getButtonInfoAddAllFromCartToQuote: () => BtnProperties;
        };
        user: {
          getProfile: () => Record<string, any>;
          getMasqueradeState: () => Promise<{
            current_company_id: number;
            companies: CustomFieldStringItems[];
          }>;
          getB2BToken: () => string;
          setMasqueradeCompany: (companyId: number) => void;
          endMasquerade: () => void;
          graphqlBCProxy: B3RequestType['graphqlBCProxy'];
          loginWithB2BStorefrontToken: (b2bStorefrontJWTToken: string) => Promise<void>;
          logout: () => Promise<void>;
        };
        shoppingList: {
          itemFromCurrentPage: ProductMappedAttributes;
          addProductFromPage: (item: LineItem) => void;
          addProducts: (shoppingListId: number, items: LineItem[]) => void;
          createNewShoppingList: (
            name: string,
            description: string,
          ) => Promise<{ id: number; name: string; description: string }>;
          getButtonInfo: () => BtnProperties;
          getLists: () => Promise<ShoppingListsItemsProps[]>;
        };
        cart: {
          setEntityId: (entityId: string) => void;
          getEntityId: () => undefined | string;
        };
      };
    };
  }

  declare interface CurrencyProps {
    token: string;
    location: string;
    currencyCode: string;
    decimalToken: string;
    decimalPlaces: number;
    thousandsToken: string;
    currencyExchangeRate: string;
  }

  declare interface Window {
    b2b: {
      callbacks: {
        dispatchEvent: (callbackKey: EventType, data?: Record<string, any>) => boolean;
      };
      isInit: boolean;
    };
  }
}
