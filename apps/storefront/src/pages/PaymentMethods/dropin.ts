// The Braintree SDK must execute in the ThemeFrame iframe realm. Driven from the
// parent realm, dropin.create() hangs forever with no error: the hosted-field
// frames postMessage to the iframe window while the SDK's framebus listens on the
// top window. Spike-verified 2026-08-26 — see
// docs/superpowers/specs/2026-08-26-payment-methods-add-card-design.md §4.
// That is also why this is a CDN script injection (Captcha-style) and not an npm
// dependency: bundled code executes in the parent realm.
export const DROPIN_SCRIPT_URL = 'https://js.braintreegateway.com/web/dropin/1.44.1/js/dropin.min.js';

export interface DropinPayload {
  nonce: string;
  deviceData?: string;
}

export interface DropinInstance {
  requestPaymentMethod(): Promise<DropinPayload>;
  teardown(): Promise<void>;
}

interface DropinWindow extends Window {
  braintree?: {
    dropin: {
      create(options: {
        authorization: string;
        container: HTMLElement;
        dataCollector: boolean;
      }): Promise<DropinInstance>;
    };
  };
}

const getDropinWindow = (iframeDocument: Document) =>
  iframeDocument.defaultView as DropinWindow | null;

const loadDropinScript = (iframeDocument: Document) =>
  new Promise<void>((resolve, reject) => {
    if (getDropinWindow(iframeDocument)?.braintree?.dropin) {
      resolve();
      return;
    }

    const existing = iframeDocument.head.querySelector<HTMLScriptElement>(
      `script[src="${DROPIN_SCRIPT_URL}"]`,
    );
    const script = existing ?? iframeDocument.createElement('script');

    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () =>
      reject(new Error('Failed to load the Braintree Drop-in script')),
    );

    if (!existing) {
      script.src = DROPIN_SCRIPT_URL;
      iframeDocument.head.appendChild(script);
    }
  });

export const createDropin = async (
  iframeDocument: Document,
  container: HTMLElement,
  clientToken: string,
): Promise<DropinInstance> => {
  await loadDropinScript(iframeDocument);

  const dropin = getDropinWindow(iframeDocument)?.braintree?.dropin;
  if (!dropin) {
    throw new Error('Braintree Drop-in script loaded but the braintree global is missing');
  }

  return dropin.create({ authorization: clientToken, container, dataCollector: true });
};
