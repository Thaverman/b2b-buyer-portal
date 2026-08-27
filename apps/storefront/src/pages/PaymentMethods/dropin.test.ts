import { JSDOM } from 'jsdom';

import { createDropin, DROPIN_SCRIPT_URL, DropinInstance } from './dropin';

const fakeInstance: DropinInstance = {
  requestPaymentMethod: vi.fn(),
  teardown: vi.fn(),
};

const makeFrameDocument = () => {
  const { window } = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://store.example.com/',
  });

  return { window, document: window.document, container: window.document.createElement('div') };
};

it('creates the drop-in through the iframe realm global when it is already present', async () => {
  const { window, document, container } = makeFrameDocument();
  const create = vi.fn().mockResolvedValue(fakeInstance);
  (window as any).braintree = { dropin: { create } };

  const instance = await createDropin(document, container, 'bt-client-token');

  expect(instance).toBe(fakeInstance);
  expect(create).toHaveBeenCalledWith({
    authorization: 'bt-client-token',
    container,
    dataCollector: true,
  });
  // no script injected when the SDK is already loaded
  expect(document.head.querySelector('script')).toBeNull();
});

it('injects the pinned script into the iframe head when the SDK is absent', async () => {
  const { window, document, container } = makeFrameDocument();
  const create = vi.fn().mockResolvedValue(fakeInstance);

  const pending = createDropin(document, container, 'bt-client-token');

  const script = document.head.querySelector('script');
  expect(script).toMatchObject({ src: DROPIN_SCRIPT_URL });

  // simulate the CDN script arriving and defining the global in the iframe realm
  (window as any).braintree = { dropin: { create } };
  script?.dispatchEvent(new window.Event('load'));

  expect(await pending).toBe(fakeInstance);
});

it('reuses an in-flight script tag instead of injecting a second one', async () => {
  const { window, document, container } = makeFrameDocument();
  const create = vi.fn().mockResolvedValue(fakeInstance);

  const first = createDropin(document, container, 'bt-client-token');
  const second = createDropin(document, container, 'bt-client-token');

  expect(document.head.querySelectorAll('script')).toHaveLength(1);

  (window as any).braintree = { dropin: { create } };
  document.head.querySelector('script')?.dispatchEvent(new window.Event('load'));

  await expect(first).resolves.toBe(fakeInstance);
  await expect(second).resolves.toBe(fakeInstance);
});

it('rejects when the script fails to load', async () => {
  const { window, document, container } = makeFrameDocument();

  const pending = createDropin(document, container, 'bt-client-token');

  document.head.querySelector('script')?.dispatchEvent(new window.Event('error'));

  await expect(pending).rejects.toThrow('Failed to load the Braintree Drop-in script');
});
