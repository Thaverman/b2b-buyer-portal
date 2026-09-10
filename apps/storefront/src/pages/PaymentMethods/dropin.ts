// The Braintree SDK must execute in the ThemeFrame iframe realm. Driven from the
// parent realm, dropin.create() hangs forever with no error: the hosted-field
// frames postMessage to the iframe window while the SDK's framebus listens on the
// top window. Spike-verified 2026-08-26 — see
// docs/superpowers/specs/2026-08-26-payment-methods-add-card-design.md §4.
// That is also why this is a CDN script injection (Captcha-style) and not an npm
// dependency: bundled code executes in the parent realm.
//
// Subresource integrity: evaluated 2026-09-10 and deliberately NOT used. Braintree
// publishes no hash for this bundle and serves the path mutably (max-age=3600, etag),
// so a self-computed hash would break add-card silently on their next patch release.
// The version pin below is the mitigation. PCI DSS v4 6.4.3/11.6.1 coverage therefore
// rests on the payment-page script inventory, not on SRI — see
// docs/superpowers/specs/2026-09-10-payment-methods-braintree-parallel-page-design.md §8.
export const DROPIN_SCRIPT_URL =
  'https://js.braintreegateway.com/web/dropin/1.44.1/js/dropin.min.js';

interface DropinPayload {
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

// Drop-in's create() has no timeout of its own. A stalled CDN fetch or a wedged
// handshake would otherwise spin forever with nothing in the console — the exact
// failure mode the hosted-form path hit on sandbox in September 2026.
export const DROPIN_INIT_TIMEOUT_MS = 20_000;

export const createDropinWithTimeout = (
  iframeDocument: Document,
  container: HTMLElement,
  clientToken: string,
): Promise<DropinInstance> =>
  new Promise<DropinInstance>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('Braintree Drop-in did not initialize in time'));
    }, DROPIN_INIT_TIMEOUT_MS);

    createDropin(iframeDocument, container, clientToken).then(
      (instance) => {
        clearTimeout(timer);
        if (settled) {
          // Arrived after we gave up: tear it down so it cannot mount hosted fields
          // into a dialog the customer has already dismissed.
          instance.teardown().catch(() => undefined);

          return;
        }
        settled = true;
        resolve(instance);
      },
      (error) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(error);
        }
      },
    );
  });
