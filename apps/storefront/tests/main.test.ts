const { initApp, requestIdleCallbackFunction, bindLinks, unbindLinks } = vi.hoisted(() => ({
  initApp: vi.fn(),
  requestIdleCallbackFunction: vi.fn(),
  bindLinks: vi.fn(),
  unbindLinks: vi.fn(),
}));

vi.mock('@/load-functions', () => ({
  initApp,
  requestIdleCallbackFunction,
  bindLinks,
  unbindLinks,
}));

const runMain = () => import('../src/main');

describe('when main.ts is run', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // the real load-functions module creates this on import; it is mocked here
    window.b2b = { initializationEnvironment: {} } as unknown as typeof window.b2b;
  });

  it('loads the app immediately when the url has a buyer-portal hash route', async () => {
    window.location.href = 'https://store.example/some-page#/orders';

    await runMain();

    expect(initApp).toHaveBeenCalled();
    expect(requestIdleCallbackFunction).not.toHaveBeenCalled();
  });

  it.each(['/login.php', '/account.php', '/checkout', '/checkout/payment'])(
    'loads the app immediately on %s so the hidden native page never wins the race',
    async (pathname) => {
      window.location.href = `https://store.example${pathname}`;

      await runMain();

      expect(initApp).toHaveBeenCalled();
      expect(requestIdleCallbackFunction).not.toHaveBeenCalled();
    },
  );

  it('defers loading on other pages, but with an idle timeout so busy main threads still load it', async () => {
    window.location.href = 'https://store.example/retail-shopping-bags';

    await runMain();

    expect(initApp).not.toHaveBeenCalled();
    expect(requestIdleCallbackFunction).toHaveBeenCalledWith(initApp, { timeout: 3000 });
    expect(bindLinks).toHaveBeenCalled();
  });
});
