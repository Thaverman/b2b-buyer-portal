import { getCurrentCustomerJWT } from '@/shared/service/bc';
import b2bLogger from '@/utils/b3Logger';
import { platform } from '@/utils/basicConfig';

export interface StoredInstrument {
  token: string;
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  type: string;
  isDefault: boolean;
  /** Which vault the card lives in: 'bigcommerce' | 'braintree'. Not displayed in v1. */
  source: string;
}

interface StoredInstrumentsResponse {
  customerId: number;
  instruments: StoredInstrument[];
}

// The CustomerServices backend (.NET/Newtonsoft) serializes PascalCase keys
// (CustomerId/Instruments/Token/...), so accept either casing and normalize to
// our camelCase DTO. Tolerant of both so it keeps working whichever the backend emits.
interface RawInstrument {
  token?: string;
  Token?: string;
  last4?: string;
  Last4?: string;
  brand?: string;
  Brand?: string;
  expiryMonth?: number;
  ExpiryMonth?: number;
  expiryYear?: number;
  ExpiryYear?: number;
  type?: string;
  Type?: string;
  isDefault?: boolean;
  IsDefault?: boolean;
  source?: string;
  Source?: string;
}

interface RawStoredInstrumentsResponse {
  customerId?: number;
  CustomerId?: number;
  instruments?: RawInstrument[];
  Instruments?: RawInstrument[];
}

const normalizeInstrument = (i: RawInstrument): StoredInstrument => ({
  token: i.token ?? i.Token ?? '',
  last4: i.last4 ?? i.Last4 ?? '',
  brand: i.brand ?? i.Brand ?? '',
  expiryMonth: i.expiryMonth ?? i.ExpiryMonth ?? 0,
  expiryYear: i.expiryYear ?? i.ExpiryYear ?? 0,
  type: i.type ?? i.Type ?? '',
  isDefault: i.isDefault ?? i.IsDefault ?? false,
  source: i.source ?? i.Source ?? '',
});

const normalize = (raw: RawStoredInstrumentsResponse): StoredInstrumentsResponse => ({
  customerId: raw.customerId ?? raw.CustomerId ?? 0,
  instruments: (raw.instruments ?? raw.Instruments ?? []).map(normalizeInstrument),
});

type PaymentMethodsErrorKind = 'sessionExpired' | 'notFound' | 'rateLimited' | 'upstream';

export class PaymentMethodsError extends Error {
  kind: PaymentMethodsErrorKind;

  constructor(kind: PaymentMethodsErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

const getPaymentMethodsConfig = () => window.BC_CONTEXT?.paymentMethods;

// Stencil-only: getCurrentCustomerJWT early-returns undefined on every other platform,
// which would misrender as "session expired"; gate the feature out instead.
export const isPaymentMethodsAvailable = () =>
  platform === 'bigcommerce' && Boolean(getPaymentMethodsConfig());

const fetchJson = async (action: string, body: Record<string, string>) => {
  const config = getPaymentMethodsConfig();
  if (!config) {
    throw new Error('Payment methods are not configured on this store');
  }

  // The Current Customer JWT lives ~15s; fetch a fresh one for every call.
  const jwt = await getCurrentCustomerJWT(config.appClientId).catch(() => undefined);
  if (!jwt) {
    // Also fires when the SSW app is not installed / appClientId is wrong — without this
    // line a pure config error is indistinguishable from a real expired session.
    b2bLogger.error(
      'Payment methods: /customer/current.jwt returned no token — expired storefront session, or BC_CONTEXT.paymentMethods.appClientId does not belong to an app installed on this store',
    );
    throw new PaymentMethodsError('sessionExpired');
  }

  let response: Response;
  try {
    response = await fetch(`${config.apiBase}/customers/Customer/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Jwt: jwt, ...body }),
    });
  } catch {
    throw new PaymentMethodsError('upstream');
  }

  if (response.ok) {
    return response.json();
  }
  if (response.status === 401) {
    b2bLogger.error(
      'Payment methods: API rejected the JWT (401) — expired session, or BC_CONTEXT.paymentMethods.appClientId does not match the backend StoreSecrets ClientId',
    );
    throw new PaymentMethodsError('sessionExpired');
  }
  if (response.status === 404) {
    throw new PaymentMethodsError('notFound');
  }
  if (response.status === 429) {
    throw new PaymentMethodsError('rateLimited');
  }
  throw new PaymentMethodsError('upstream');
};

const post = async (
  action: string,
  body: Record<string, string>,
): Promise<StoredInstrumentsResponse> => normalize(await fetchJson(action, body));

export const listStoredInstruments = () => post('StoredInstruments', {});

export const setDefaultStoredInstrument = (token: string) =>
  post('SetDefaultStoredInstrument', { Token: token });

export const deleteStoredInstrument = (token: string) =>
  post('DeleteStoredInstrument', { Token: token });
