import { waitFor } from 'tests/test-utils';

import {
  createDropin,
  createDropinWithTimeout,
  DROPIN_INIT_TIMEOUT_MS,
  DROPIN_SCRIPT_URL,
} from './dropin';

const buildThemeFrameDocument = () => {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);

  return iframe.contentDocument as Document;
};

const buildDropinInstance = () => ({
  requestPaymentMethod: vi.fn().mockResolvedValue({ nonce: 'fake-nonce' }),
  teardown: vi.fn().mockResolvedValue(undefined),
});

// Stand in for the CDN script finishing: publish the global on the FRAME's window, then
// fire the load event the loader is waiting on.
const satisfyScriptLoad = (
  iframeDocument: Document,
  script: HTMLScriptElement,
  create: ReturnType<typeof vi.fn>,
) => {
  Object.assign(iframeDocument.defaultView as Window, { braintree: { dropin: { create } } });
  script.dispatchEvent(new Event('load'));
};

const findInjectedScript = (iframeDocument: Document) =>
  waitFor(() => {
    const script = iframeDocument.head.querySelector<HTMLScriptElement>(
      `script[src="${DROPIN_SCRIPT_URL}"]`,
    );
    expect(script).not.toBeNull();

    return script as HTMLScriptElement;
  });

afterEach(() => {
  document.body.innerHTML = '';
});

it('injects the pinned script into the ThemeFrame document and not the parent document', async () => {
  const iframeDocument = buildThemeFrameDocument();
  const container = iframeDocument.createElement('div');
  const create = vi.fn().mockResolvedValue(buildDropinInstance());

  const pending = createDropin(iframeDocument, container, 'client-token');
  const script = await findInjectedScript(iframeDocument);

  expect(document.head.querySelector(`script[src="${DROPIN_SCRIPT_URL}"]`)).toBeNull();

  satisfyScriptLoad(iframeDocument, script, create);
  await pending;

  expect(create).toHaveBeenCalledWith({
    authorization: 'client-token',
    container,
    dataCollector: true,
  });
});

it('reuses an already-injected script instead of adding a second one', async () => {
  const iframeDocument = buildThemeFrameDocument();
  const container = iframeDocument.createElement('div');
  const create = vi.fn().mockResolvedValue(buildDropinInstance());

  const first = createDropin(iframeDocument, container, 'client-token');
  const script = await findInjectedScript(iframeDocument);
  satisfyScriptLoad(iframeDocument, script, create);
  await first;

  await createDropin(iframeDocument, container, 'client-token');

  expect(iframeDocument.head.querySelectorAll(`script[src="${DROPIN_SCRIPT_URL}"]`)).toHaveLength(
    1,
  );
});

it('rejects when the script fails to load', async () => {
  const iframeDocument = buildThemeFrameDocument();
  const container = iframeDocument.createElement('div');

  const pending = createDropin(iframeDocument, container, 'client-token');
  const script = await findInjectedScript(iframeDocument);
  script.dispatchEvent(new Event('error'));

  await expect(pending).rejects.toThrow('Failed to load the Braintree Drop-in script');
});

describe('createDropinWithTimeout', () => {
  // Pinned independently of the tests below: they advance by a literal 20s, so without
  // this assertion a change to the budget would silently move the tests with it.
  it('bounds initialization at 20 seconds', () => {
    expect(DROPIN_INIT_TIMEOUT_MS).toBe(20_000);
  });

  it('rejects once the init budget elapses and tears down a late arrival', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const iframeDocument = buildThemeFrameDocument();
    const container = iframeDocument.createElement('div');
    const instance = buildDropinInstance();
    let releaseCreate: (value: unknown) => void = () => undefined;
    const create = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        releaseCreate = resolve;
      }),
    );

    const pending = createDropinWithTimeout(iframeDocument, container, 'client-token');
    const script = await findInjectedScript(iframeDocument);
    satisfyScriptLoad(iframeDocument, script, create);

    const assertion = expect(pending).rejects.toThrow(
      'Braintree Drop-in did not initialize in time',
    );
    // A literal, not the constant under test: advancing by the implementation's own
    // budget would make this pass for any budget at all.
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;

    // The SDK answering after we gave up must not leave live hosted fields behind.
    releaseCreate(instance);
    await waitFor(() => expect(instance.teardown).toHaveBeenCalled());

    vi.useRealTimers();
  });

  it('resolves with the instance when init finishes inside the budget', async () => {
    const iframeDocument = buildThemeFrameDocument();
    const container = iframeDocument.createElement('div');
    const instance = buildDropinInstance();
    const create = vi.fn().mockResolvedValue(instance);

    const pending = createDropinWithTimeout(iframeDocument, container, 'client-token');
    const script = await findInjectedScript(iframeDocument);
    satisfyScriptLoad(iframeDocument, script, create);

    await expect(pending).resolves.toBe(instance);
    expect(instance.teardown).not.toHaveBeenCalled();
  });
});
