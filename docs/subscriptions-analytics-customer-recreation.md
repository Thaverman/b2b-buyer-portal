# Subscriptions, Analytics, and Customer Creation — Recreation Guide

Technical implementation reference for porting these three features to another repo:

1. [`ManageSubscriptions`](#1-managesubscriptions) — iframe-hosted subscription manager page
2. [`pushDataLayerEvent`](#2-pushdatalayerevent-analytics) — GTM data layer helper for `login` / `sign_up` events
3. [Customer creation flow](#3-create-a-new-customer) — building the BC `customerCreate` GraphQL payload from form state and (optionally) chaining a B2B company registration

This guide gives you the full source for each piece, every dependency, route wiring, and the non-obvious behaviors that will bite you if you skip them.

> Companion: [docs/component-recreation-guide.md](component-recreation-guide.md) covers the `SavedPaymentMethods` iframe page using the same pattern as section 1.

---

## Shared prerequisites

### Runtime / libraries

- React 17+ (`useState`, `useContext`, `useEffect`, `ReactElement`)
- `@mui/material` (for `Box`, `CircularProgress`, `Alert`, `Typography`)
- `react-hook-form` (only for the customer-creation flow)
- A lazy-loaded router (React Router v6 style with `React.lazy`)
- `@/components/spin/B3Spin` — see minimal reproduction in [docs/component-recreation-guide.md](component-recreation-guide.md#loading-spinner-wrapper--b3spin)
- A global `window.B3.setting` runtime config (`store_hash`, `channel_id`, `platform`) injected by the host page — required by the customer-creation flow (`utils/basicConfig.ts`)

### Global type declarations

```ts
// types/global.d.ts
declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    B3: {
      setting: {
        store_hash: string;
        channel_id: number;
        platform?: 'bigcommerce' | 'custom' | 'catalyst';
        [k: string]: unknown;
      };
    };
  }
  // CustomFieldItems is used pervasively in the form layer as a loose object map.
  type CustomFieldItems = Record<string, any>;
}
export {};
```

---

## 1. `ManageSubscriptions`

**Source file:** [apps/storefront/src/pages/ManageSubscriptions/index.tsx](../apps/storefront/src/pages/ManageSubscriptions/index.tsx)

### What it does

Renders a full-page iframe pointed at an external subscription manager URL (default `https://sandbox.storesupply.com/subscriptions`, overridable via `VITE_SUBSCRIPTION_MANAGER_URL`). Wraps the iframe in `B3Spin` while loading and best-effort hides any header/footer from the embedded page (only succeeds if same-origin).

### Dependencies

| Import   | From                       | Purpose                  |
| -------- | -------------------------- | ------------------------ |
| `useState` | `react`                  | Local loading state      |
| `Box`    | `@mui/material`            | Layout                   |
| `B3Spin` | `@/components/spin/B3Spin` | Loading overlay          |

No Redux, no API, no props, no analytics fired from this page.

### Full source

```tsx
import { useState } from 'react';
import { Box } from '@mui/material';

import B3Spin from '@/components/spin/B3Spin';

const SUBSCRIPTION_MANAGER_URL =
  import.meta.env.VITE_SUBSCRIPTION_MANAGER_URL || 'https://sandbox.storesupply.com/subscriptions';

function ManageSubscriptions() {
  const [loading, setLoading] = useState(true);

  const handleIframeLoad = () => {
    setLoading(false);

    // Attempt to hide header/footer - will only work if same-origin
    try {
      const iframe = document.getElementById('subscriptions-iframe') as HTMLIFrameElement;
      if (iframe?.contentWindow?.document) {
        const iframeDoc = iframe.contentWindow.document;
        const header = iframeDoc.querySelector('header');
        const footer = iframeDoc.querySelector('footer');

        if (header) (header as HTMLElement).style.display = 'none';
        if (footer) (footer as HTMLElement).style.display = 'none';
      }
    } catch (error) {
      // Cross-origin access blocked - this is expected for different domains
      console.warn('Unable to modify iframe content due to cross-origin restrictions:', error);
    }
  };

  return (
    <B3Spin isSpinning={loading}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: '800px',
          position: 'relative',
        }}
      >
        <div id="og-msi" ng-jq=""></div>
        <iframe
          id="subscriptions-iframe"
          src={SUBSCRIPTION_MANAGER_URL}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            minHeight: '800px',
          }}
          title="Manage Subscriptions"
          onLoad={handleIframeLoad}
        />
      </Box>
    </B3Spin>
  );
}

export default ManageSubscriptions;
```

### Route wiring

```tsx
// shared/routes/index.tsx
const SubscriptionManager = lazy(() => import('@/pages/ManageSubscriptions'));

const routesMap = {
  // ...
  '/manage-subscriptions': SubscriptionManager,
};
```

```ts
// shared/routeList.ts
{
  path: '/manage-subscriptions',
  name: 'Manage Subscriptions',
  wsKey: 'manageSubscriptions',
  isMenuItem: true,
  permissions: accountSettingPermissions,
  isTokenLogin: true,
  idLang: 'global.navMenu.manageSubscriptions',
}
```

### Notes / gotchas

- **No Redux, no API calls, no props.** Purely a local `useState` for the loading flag.
- The `<div id="og-msi" ng-jq=""></div>` is a hook consumed by the embedded host (OG Manage Subscriptions Initializer). Drop it if your embed doesn't expect it.
- `minHeight: 800px` is duplicated on the wrapper `Box` and the `iframe` — both are needed because the iframe doesn't auto-size to content.
- The cross-origin DOM manipulation is defensive — most real deployments will be cross-origin, so the `try/catch` is the normal path. Use a `hideLayout=true` query string on the embedded URL or chrome stripping in the embed itself for the real solution.
- `isMenuItem: true` puts this page in the left nav.
- No analytics are fired from this page (no `pushDataLayerEvent` call).

---

## 2. `pushDataLayerEvent` (analytics)

**Source file:** [apps/storefront/src/utils/analytics.ts](../apps/storefront/src/utils/analytics.ts)

### What it does

Pushes an arbitrary event object to Google Tag Manager's `window.dataLayer`, lazily initializing the array on first use. Standard GTM idiom.

### Full source (4 lines)

```ts
export function pushDataLayerEvent(event: Record<string, unknown>): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(event);
}
```

### Type declaration

`window.dataLayer` is not a standard browser global. Declare it in your global types (already in the [shared prerequisites](#global-type-declarations) block above).

### Where it's called in this repo

All five call sites push one of two event shapes: `{ event: 'login', method: 'email' }` or `{ event: 'sign_up', method: 'email' }`. They fire **after** successful authentication or registration, synchronously, with no error handling.

| # | Site | Path | Fired when | Event shape |
| - | ---- | ---- | ---------- | ----------- |
| 1 | Login, checkout path | [`pages/Login/index.tsx:187`](../apps/storefront/src/pages/Login/index.tsx#L187) | `loginCheckout()` returns non-error response | `{ event: 'login', method: 'email' }` |
| 2 | Login, B2B portal path | [`pages/Login/index.tsx:219`](../apps/storefront/src/pages/Login/index.tsx#L219) | After `b2bLogin` mutation + `setB2BToken` + `customerLoginAPI` | `{ event: 'login', method: 'email' }` |
| 3 | Registered, checkout path | [`pages/Registered/index.tsx:97`](../apps/storefront/src/pages/Registered/index.tsx#L97) | After successful `loginCheckout` following signup | `{ event: 'sign_up', method: 'email' }` |
| 4 | Registered, B2B portal path | [`pages/Registered/index.tsx:117`](../apps/storefront/src/pages/Registered/index.tsx#L117) | After `bcLogin` + `getCurrentCustomerInfo` | `{ event: 'sign_up', method: 'email' }` |
| 5 | RegisteredBCToB2B conversion | [`pages/RegisteredBCToB2B/index.tsx:503`](../apps/storefront/src/pages/RegisteredBCToB2B/index.tsx#L503) | After successful BC→B2B company-user conversion | `{ event: 'sign_up', method: 'email' }` |

### Representative call pattern

```tsx
// pages/Login/index.tsx (B2B portal path, line 219)
const {
  login: { result: { token, storefrontLoginToken }, errors }
} = await b2bLogin({ loginData });

storeDispatch(setB2BToken(token));
customerLoginAPI(storefrontLoginToken);
dispatchEvent('on-login', { storefrontToken: storefrontLoginToken });
pushDataLayerEvent({ event: 'login', method: 'email' });
```

```tsx
// pages/Registered/index.tsx (handleFinish, B2B portal path)
const customer = await bcLogin({ email, password }).then((res) => res?.data?.login?.customer);
if (customer) B3SStorage.set('loginCustomer', { ...customer });
await getCurrentCustomerInfo();
pushDataLayerEvent({ event: 'sign_up', method: 'email' });
```

### Optional: typed events

The function accepts `Record<string, unknown>` — there is no compile-time schema. If you want stricter typing, switch to a discriminated union:

```ts
type AuthMethod = 'email' | 'google' | 'apple' | 'sso';

type DataLayerEvent =
  | { event: 'login'; method: AuthMethod }
  | { event: 'sign_up'; method: AuthMethod }
  | { event: string; [k: string]: unknown };

export function pushDataLayerEvent(event: DataLayerEvent): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(event);
}
```

### Notes / gotchas

- **GTM must be installed on the host page.** This function assumes the GTM container script runs and consumes `window.dataLayer`. If GTM isn't present the pushes are harmless no-ops.
- **Call after the happy-path side effects complete.** Every call site fires *after* the token/customer info is set. Front-loading the push can tag a user who is not yet authenticated.
- **Unguarded.** No `try/catch`. Keep the helper minimal — don't add error swallowing unless you can justify it.
- **No PII.** Only event name and auth method are pushed. Preserve this discipline when adding new call sites.

---

## 3. Create a new customer

The customer-creation flow has two layers:

- **`createCustomer`** — converts form state into a BigCommerce `customerCreate` mutation payload, fires it via `createBCCompanyUser`, and returns `{ customerId, customerEmail }`.
- **Optional company registration step** — gated by the feature flag `B2B-4466.use_register_company_flow`:
  - **flag ON:** the new Storefront GraphQL `registerCompany` mutation (`pages/Registered/RegisterSteps/steps/CompleteStep/registerCompany.ts`)
  - **flag OFF:** the legacy B2B GraphQL `companyCreate` mutation via `createCompany.ts` → `createB2BCompanyUser`

For B2C-only customers (`accountType === '2'`), only `createCustomer` runs. For B2B (`accountType === '1'`), `createCustomer` runs first and its `customerId` / `customerEmail` are passed into the company step.

### File map

| File | Role |
| ---- | ---- |
| [`pages/Registered/RegisterSteps/steps/CompleteStep/createCustomer.ts`](../apps/storefront/src/pages/Registered/RegisterSteps/steps/CompleteStep/createCustomer.ts) | Builds BC `customerCreate` payload + fires it |
| [`pages/Registered/RegisterSteps/steps/CompleteStep/createCompany.ts`](../apps/storefront/src/pages/Registered/RegisterSteps/steps/CompleteStep/createCompany.ts) | **Legacy** B2B `companyCreate` payload + fires it (flag OFF) |
| [`pages/Registered/RegisterSteps/steps/CompleteStep/registerCompany.ts`](../apps/storefront/src/pages/Registered/RegisterSteps/steps/CompleteStep/registerCompany.ts) | **New** Storefront `registerCompany` payload + fires it (flag ON) |
| [`pages/Registered/RegisterSteps/steps/CompleteStep/bcHelpers.ts`](../apps/storefront/src/pages/Registered/RegisterSteps/steps/CompleteStep/bcHelpers.ts) | Storefront token bootstrap, post-customer login, post-pending logout |
| [`pages/Registered/RegisterSteps/steps/CompleteStep/index.tsx`](../apps/storefront/src/pages/Registered/RegisterSteps/steps/CompleteStep/index.tsx) | UI + orchestration: password form, captcha, calls the helpers above |
| [`utils/registerUtils.ts`](../apps/storefront/src/utils/registerUtils.ts) | `deCodeField` (Base64-decode field name), `toHump` (snake→camel), form-field normalization |
| [`utils/base64.ts`](../apps/storefront/src/utils/base64.ts) | `Base64.decode/encode` used by `deCodeField` |
| [`shared/service/b2b/graphql/register.ts`](../apps/storefront/src/shared/service/b2b/graphql/register.ts) | `createBCCompanyUser` (`customerCreate` mutation), `createB2BCompanyUser`, `sendSubscribersState`, `getB2BAccountFormFields`, `getB2BCountries` |
| [`shared/service/bc/graphql/company.ts`](../apps/storefront/src/shared/service/bc/graphql/company.ts) | `registerCompany` Storefront mutation + `RegisterCompanyStatus` enum |
| [`pages/Registered/types.ts`](../apps/storefront/src/pages/Registered/types.ts) | `RegisterFields` interface |
| [`pages/Registered/Context.tsx`](../apps/storefront/src/pages/Registered/Context.tsx) | Reducer + provider holding form state across steps |

### Form-field shape

The form state stores values on each field's `default` property. Field names are Base64-encoded (except a small allowlist).

```ts
// pages/Registered/types.ts
export interface RegisterFields extends Record<string, any> {
  name: string;            // Base64-encoded (except 'country', 'state', 'email')
  label?: string;
  required?: boolean;
  fieldType?: string;      // 'text' | 'number' | 'password' | 'multiline' | 'checkbox'
                           // | 'dropdown' | 'radio' | 'date' | 'files'
  default?: string | Array<any> | number;
}
```

### Field-name helpers

```ts
// utils/registerUtils.ts (excerpt)
import { Base64 } from '@/utils/base64';

const noEncryptFieldList = ['country', 'state', 'email'];

export function deCodeField(fieldName: string): string {
  if (noEncryptFieldList.includes(fieldName)) return fieldName;
  return Base64.decode(fieldName);
}

export const toHump = (name: string) =>
  name.replace(/_(\w)/g, (_, letter) => letter.toUpperCase());
```

```ts
// utils/base64.ts
export const Base64 = {
  encode(str: string | number | boolean) {
    return window.btoa(encodeURIComponent(String(str)));
  },
  decode(str: string) {
    return decodeURIComponent(window.atob(str));
  },
};
```

### `createCustomer` — full source

```ts
// pages/Registered/RegisterSteps/steps/CompleteStep/createCustomer.ts
import { createBCCompanyUser } from '@/shared/service/b2b';
import { channelId, storeHash } from '@/utils/basicConfig';
import { deCodeField } from '@/utils/registerUtils';

import type { RegisterFields } from '../../../types';

interface CreateCustomerContext {
  emailMarketingNewsletter?: boolean;
  list?: RegisterFields[];           // contact info fields (B2B → contactInformation, B2C → bcContactInformation)
  additionalInfo?: RegisterFields[]; // additional / custom-form fields
  accountType?: string;              // '1' = B2B, '2' = B2C
  addressBasicList?: RegisterFields[];
  captchaKey: string;
}

export function createCustomer(
  data: CustomFieldItems,
  ctx: CreateCustomerContext,
): Promise<{ customerId: number; customerEmail: string }> {
  const {
    emailMarketingNewsletter,
    list,
    additionalInfo,
    accountType,
    addressBasicList = [],
    captchaKey,
  } = ctx;

  const bcFields: CustomFieldItems = {};

  bcFields.authentication = {
    force_password_reset: false,
    new_password: data.password,
  };

  bcFields.accepts_product_review_abandoned_cart_emails = emailMarketingNewsletter;

  if (list) {
    list.forEach((item: RegisterFields) => {
      const name = deCodeField(item.name);
      if (name === 'accepts_marketing_emails') {
        bcFields.accepts_product_review_abandoned_cart_emails = Array.isArray(item?.default)
          ? !!item.default.length
          : false;
      } else if (!item.custom) {
        bcFields[name] = item?.default || '';
      }
    });

    bcFields.form_fields = [];
    if (additionalInfo && (additionalInfo as Array<CustomFieldItems>).length) {
      additionalInfo.forEach((field: CustomFieldItems) => {
        bcFields.form_fields.push({
          name: field.bcLabel,
          value: field.default,
        });
      });
    }
  }

  bcFields.addresses = [];
  bcFields.origin_channel_id = channelId;
  bcFields.channel_ids = [channelId];

  if (accountType === '2') {
    const addresses: CustomFieldItems = {};

    const getBCAddressField = addressBasicList.filter((field: RegisterFields) => !field.custom);
    const getBCExtraAddressField = addressBasicList.filter((field: RegisterFields) => field.custom);

    if (getBCAddressField) {
      bcFields.addresses = {};
      getBCAddressField.forEach((field: RegisterFields) => {
        if (field.name === 'country') addresses.country_code = field.default;
        else if (field.name === 'state') addresses.state_or_province = field.default;
        else if (field.name === 'postalCode') addresses.postal_code = field.default;
        else if (field.name === 'firstName') addresses.first_name = field.default;
        else if (field.name === 'lastName') addresses.last_name = field.default;
        else addresses[field.name] = field.default;
      });
    }

    addresses.form_fields = [];
    if (getBCExtraAddressField && getBCExtraAddressField.length) {
      getBCExtraAddressField.forEach((field: RegisterFields) => {
        addresses.form_fields.push({
          name: field.bcLabel,
          value: field.default,
        });
      });
    }

    bcFields.addresses = [addresses];
    bcFields.trigger_account_created_notification = true;
  }

  const userItem = { storeHash, ...bcFields };

  return createBCCompanyUser(userItem, captchaKey).then((res) => ({
    customerId: res.customerCreate.customer.id,
    customerEmail: res.customerCreate.customer.email,
  }));
}
```

### Underlying GraphQL mutation (`customerCreate`)

```ts
// shared/service/b2b/graphql/register.ts (excerpt)
const customerCreateBC = `
mutation customerCreate(
  $customerData: CustomerInputType!,
  $recaptchaUserResponse: String
) {
  customerCreate(customerData: $customerData, recaptchaUserResponse: $recaptchaUserResponse) {
    customer {
      id
      email
      firstName
      lastName
      phone
      company
      customerGroupId
    }
  }
}`;

export const createBCCompanyUser = (
  customerData: Partial<CreateCustomer>,
  recaptchaUserResponse: string,
) =>
  B3Request.graphqlB2B({
    query: customerCreateBC,
    variables: {
      customerData: convertObjectOrArrayKeysToCamel(customerData),
      recaptchaUserResponse,
    },
  });
```

The `CustomerInputType` accepts (snake_case → auto-camelized by `convertObjectOrArrayKeysToCamel`):

```ts
interface CreateCustomer {
  storeHash: string;
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  phone: string;
  notes: string;
  tax_exempt_category: string;
  customer_group_id: number;
  addresses: Address[];
  authentication: { force_password_reset: boolean; new_password: string };
  accepts_product_review_abandoned_cart_emails: boolean;
  store_credit_amounts: { amount: number }[];
  origin_channel_id: number;
  channel_ids: number[];
  form_fields: { name: string; value: string }[];
}
```

### Optional B2B step A: legacy `createCompany` (flag OFF)

```ts
// pages/Registered/RegisterSteps/steps/CompleteStep/createCompany.ts
import { createB2BCompanyUser } from '@/shared/service/b2b';
import b2bLogger from '@/utils/b3Logger';
import { channelId, storeHash } from '@/utils/basicConfig';
import { deCodeField, toHump } from '@/utils/registerUtils';

import type { RegisterFields } from '../../../types';

interface CreateCompanyContext {
  list?: RegisterFields[];
  companyInformation: RegisterFields[];
  addressBasicList: RegisterFields[];
}

export async function createCompany(
  _data: CustomFieldItems,
  customerId: number | string,
  customerEmail: string,
  fileList: unknown,
  ctx: CreateCompanyContext,
) {
  const { list, companyInformation, addressBasicList } = ctx;

  try {
    const b2bFields: CustomFieldItems = {};
    b2bFields.customerId = customerId || '';
    b2bFields.customerEmail = customerEmail || '';
    b2bFields.storeHash = storeHash;

    // Contact-info user extra fields
    const b2bContactInformationList = list || [];
    const companyUserExtraFieldsList = b2bContactInformationList.filter((item) => !!item.custom);
    if (companyUserExtraFieldsList.length) {
      b2bFields.userExtraFields = companyUserExtraFieldsList.map((item) => ({
        fieldName: deCodeField(item.name),
        fieldValue: item?.default || '',
      }));
    }

    // Standard company fields → camelCase keys (companyName, companyEmail, ...)
    const companyInfo = companyInformation.filter(
      (li) => !li.custom && li.fieldType !== 'files',
    );
    const companyExtraInfo = companyInformation.filter((li) => !!li.custom);
    if (companyInfo.length) {
      companyInfo.forEach((item) => {
        b2bFields[toHump(deCodeField(item.name))] = item?.default || '';
      });
    }
    if (companyExtraInfo.length) {
      b2bFields.extraFields = companyExtraInfo.map((item) => ({
        fieldName: deCodeField(item.name),
        fieldValue: item?.default || '',
      }));
    }

    // Address fields (note: addressLine1/2 are duplicated alongside the raw decoded names)
    const addressBasicInfo = addressBasicList.filter((li) => !li.custom) || [];
    const addressExtraBasicInfo = addressBasicList.filter((li) => !!li.custom) || [];
    if (addressBasicInfo.length) {
      addressBasicInfo.forEach((field) => {
        const name = deCodeField(field.name);
        if (name === 'address1') b2bFields.addressLine1 = field.default;
        if (name === 'address2') b2bFields.addressLine2 = field.default;
        b2bFields[name] = field.default;
      });
    }
    if (addressExtraBasicInfo.length) {
      b2bFields.addressExtraFields = addressExtraBasicInfo.map((item) => ({
        fieldName: deCodeField(item.name),
        fieldValue: item?.default || '',
      }));
    }

    b2bFields.fileList = fileList;
    b2bFields.channelId = channelId;

    return await createB2BCompanyUser(b2bFields);
  } catch (error) {
    b2bLogger.error(error);
  }
  return undefined;
}
```

The underlying `companyCreate` mutation (in `shared/service/b2b/graphql/register.ts`) returns `{ company: { id, companyStatus } }`. Treat `Number(companyStatus) === CompanyStatus.APPROVED` as auto-approval.

### Optional B2B step B: new `registerCompany` (flag ON)

The newer flow uses BigCommerce's Storefront GraphQL `registerCompany` mutation, which requires an authenticated storefront session — so the orchestration logs the just-created customer in first.

Helper functions:

```ts
// pages/Registered/RegisterSteps/steps/CompleteStep/bcHelpers.ts
import { bcLogin, bcLogoutLogin } from '@/shared/service/bc';
import { store } from '@/store';
import b2bLogger from '@/utils/b3Logger';
import { loginInfo } from '@/utils/loginInfo';

interface Credentials { email: string; password: string }

/** registerCompany requires a storefront session token in the store. */
export async function ensureBcStorefrontGraphqlToken(): Promise<void> {
  if (store.getState().company.tokens.bcGraphqlToken) return;
  await loginInfo();
}

/** Storefront login after account creation; throws if the login mutation returns errors. */
export async function loginAndGetBcCustomer(credentials: Credentials, errorMessage: string) {
  const response = await bcLogin({ email: credentials.email, password: credentials.password });
  if (response.errors?.length) throw new Error(response.errors[0]?.message || errorMessage);
  const customer = response.data?.login?.customer;
  if (!customer) throw new Error(errorMessage);
  return customer;
}

/** Best-effort logout after registration completes with PENDING status. Never throws. */
export async function logoutBcCustomer(): Promise<void> {
  try {
    const res = await bcLogoutLogin();
    if (res.data?.logout?.result !== 'success') {
      b2bLogger.error('Storefront logout did not return success after registerCompany');
    }
  } catch (e) {
    b2bLogger.error(e);
  }
}
```

The `registerCompany` payload builder is the largest single piece — it groups extra fields by GraphQL kind (`texts`, `numbers`, `multilineTexts`, `multipleChoices`), coerces numeric inputs from string form values, and structures the address from form fields plus the just-logged-in customer's name/phone. See [`pages/Registered/RegisterSteps/steps/CompleteStep/registerCompany.ts`](../apps/storefront/src/pages/Registered/RegisterSteps/steps/CompleteStep/registerCompany.ts) for the full source.

The Storefront mutation:

```ts
// shared/service/bc/graphql/company.ts
const REGISTER_COMPANY_MUTATION = `mutation RegisterCompany($input: RegisterCompanyInput!) {
  company {
    registerCompany(input: $input) {
      entityId
      status
      errors {
        ... on ValidationError { message path }
      }
    }
  }
}`;

export enum RegisterCompanyStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  INACTIVE = 'INACTIVE',
  DELETED = 'DELETED',
}

export async function registerCompany(input: RegisterCompanyInput) {
  const variables = { input };
  return platform === 'bigcommerce'
    ? B3Request.graphqlBC<RegisterCompanyMutationResponse>({ query: REGISTER_COMPANY_MUTATION, variables })
    : B3Request.graphqlBCProxy<RegisterCompanyMutationResponse>({ query: REGISTER_COMPANY_MUTATION, variables });
}
```

### Orchestration (`CompleteStep/index.tsx` — relevant slice)

```tsx
const isRegisterCompanyFlowEnabled = useFeatureFlag('B2B-4466.use_register_company_flow');

// ...form, captcha, password matching, error display omitted for brevity...

let isAutoApproval = true;

if (accountType === '2') {
  // B2C: customer only.
  await createCustomer({ password, confirmPassword }, createCustomerContext);
} else {
  // B2B: customer first, then company.
  const attachmentsList = companyInformation.filter((l) => l.fieldType === 'files');
  const fileList = await getFileUrl(attachmentsList || []);
  const { customerId, customerEmail } = await createCustomer(
    { password, confirmPassword },
    createCustomerContext,
  );

  if (isRegisterCompanyFlowEnabled) {
    await ensureBcStorefrontGraphqlToken();
    const customerDetails = await loginAndGetBcCustomer(
      { email: customerEmail, password },
      b3Lang('global.error.genericMessage'),
    );
    const status = await registerCompany(customerDetails, fileList, createCompanyContext);
    isAutoApproval = status === RegisterCompanyStatus.APPROVED;
    if (!isAutoApproval) {
      await logoutBcCustomer(); // PENDING/REJECTED → drop the storefront session
    }
  } else {
    const accountInfo = await createCompany(
      { password, confirmPassword }, customerId, customerEmail, fileList, createCompanyContext,
    );
    const companyStatus = accountInfo?.companyCreate?.company?.companyStatus || '';
    isAutoApproval = Number(companyStatus) === CompanyStatus.APPROVED;
  }
}
```

### Newsletter subscription side effect

If the form's `field_email_marketing_newsletter` checkbox is checked AND has selected values, the orchestrator also fires `sendSubscribersState`:

```ts
await sendSubscribersState({
  storeHash,
  email: enterEmail,
  first_name: firstName.default,
  last_name: lastName.default,
  channel_id: channelId || 1,
});
```

### Notes / gotchas

- **Field name encoding.** Most field names on `RegisterFields.name` are Base64-encoded; always pipe them through `deCodeField` before using them as a key. The allowlist (`country`, `state`, `email`) bypasses encoding.
- **`accountType === '1'` is B2B, `'2'` is B2C.** The list selection and address handling diverge sharply on this flag.
- **Custom vs. standard fields.** `field.custom` is the discriminator. Standard fields go directly on the BC payload (`bcFields[name] = ...`). Custom fields go into `form_fields` (BC `customerCreate`) or `userExtraFields` / `extraFields` / `addressExtraFields` (B2B `companyCreate`) or the typed `extraFields.{texts,numbers,multilineTexts,multipleChoices}` (Storefront `registerCompany`).
- **B2C creates an address; B2B creates an empty address array.** The address belongs to the *company* in the B2B flow, not the customer.
- **`origin_channel_id` vs. `channel_ids`.** `createCustomer` sets both. The legacy `getBCFieldsValue` in `CompleteStep/index.tsx` deletes `channel_ids` — this dead code is left behind from the pre-refactor implementation; the live path is `createCustomer.ts`.
- **`trigger_account_created_notification` is only set for B2C.** B2B account-created emails are sent by the company-creation flow downstream.
- **`registerCompany` (Storefront) requires a session.** That's why `ensureBcStorefrontGraphqlToken` + `loginAndGetBcCustomer` run before the mutation. If the resulting status is not `APPROVED`, `logoutBcCustomer` is called best-effort to drop the session — failures are logged but never block the success UI (mirrors `useLogout`).
- **Captcha is optional.** If `getStorefrontToken().isEnabledOnStorefront` is true, the form requires a captcha key. The orchestrator surfaces a `missingCaptcha` error before submitting.
- **File uploads.** Only B2B `companyInformation` may contain `fieldType === 'files'` entries. They're uploaded via `uploadB2BFile` first, then the resulting `fileId`s are referenced in either `companyCreate.fileList` (legacy) or `registerCompany.input.fileList` (new).
- **Errors from BC's `customerCreate` propagate as a thrown promise rejection** — caught at the orchestrator level and rendered in the `<Alert severity="error">` strip. No retry.

### Recreation checklist (customer creation)

- [ ] Implement `Base64.encode/decode` and the `deCodeField` / `toHump` helpers (or replace the entire encoding scheme with plain field names — purely an internal convention).
- [ ] Define the `RegisterFields` type and the form-state reducer / context that holds it across steps.
- [ ] Implement `createCustomer` exactly as above; substitute your own GraphQL client for `B3Request.graphqlB2B`.
- [ ] Wire `customerCreate` (and `customerSubscribersCreate` if you support marketing opt-in).
- [ ] Decide whether to support B2B at all. If yes:
  - Pick **one** of the two company flows (don't ship both behind a flag unless you're mid-migration like this repo).
  - For the legacy flow, port `createB2BCompanyUser` and the `companyCreate` mutation.
  - For the new flow, port the Storefront `registerCompany` mutation and the post-customer login/logout helpers.
- [ ] Wire reCAPTCHA: fetch the storefront site key (`getStorefrontToken`) and pass `captchaKey` through to `createBCCompanyUser`.
- [ ] Add `pushDataLayerEvent({ event: 'sign_up', method: 'email' })` after the post-registration login completes (see analytics section above).
- [ ] Surface server errors in an `Alert`; never silently swallow.
- [ ] Confirm `channel_id` / `store_hash` are reachable from `utils/basicConfig.ts` (or your equivalent).

---

## Combined recreation checklist

- [ ] Install deps: `react`, `@mui/material`, `@emotion/react`, `@emotion/styled`, `react-hook-form`, React Router (or your router).
- [ ] Create `components/spin/B3Spin.tsx`.
- [ ] Create `utils/analytics.ts` with `pushDataLayerEvent`.
- [ ] Add `window.dataLayer` and `window.B3` to your global type declarations.
- [ ] Verify GTM snippet is present on the host page.
- [ ] **Subscriptions:** copy `pages/ManageSubscriptions/index.tsx`, set `VITE_SUBSCRIPTION_MANAGER_URL` (or the equivalent for your build tool — CRA `REACT_APP_*`, Next `NEXT_PUBLIC_*`).
- [ ] **Customer creation:** port `createCustomer.ts`, `registerUtils.ts`, `base64.ts`, `Registered/types.ts`, the BC `customerCreate` mutation, and (optionally) one of the two company-creation paths.
- [ ] Wire all routes into your router with lazy loading.
- [ ] Apply permission gates / feature flags matching your model (or drop them).
- [ ] Fire `pushDataLayerEvent({ event: 'login', method: 'email' })` after successful login and `{ event: 'sign_up', method: 'email' }` after successful registration at your own auth call sites.
