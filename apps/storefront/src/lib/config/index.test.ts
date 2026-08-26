const loadConfig = async () => (await import('@/lib/config')).default;

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '';
});

describe('dom.allOtherElement', () => {
  it('matches account links rendered with absolute urls (StoreSupply theme)', async () => {
    document.body.innerHTML =
      '<a href="https://sandbox.storesupply.com/account.php?action=order_status">Orders</a>';
    const config = await loadConfig();

    const matched = Array.from(document.querySelectorAll(config['dom.allOtherElement']));

    expect(matched).toContain(document.querySelector('a'));
  });

  it('matches login links rendered with absolute urls (StoreSupply theme)', async () => {
    document.body.innerHTML =
      '<a href="https://sandbox.storesupply.com/login.php?action=logout">Sign out</a>';
    const config = await loadConfig();

    const matched = Array.from(document.querySelectorAll(config['dom.allOtherElement']));

    expect(matched).toContain(document.querySelector('a'));
  });

  it('matches links in the mobile hamburger account list regardless of href', async () => {
    document.body.innerHTML =
      '<ul class="navPages-list navPages-list--user"><li><a href="#">Account</a></li></ul>';
    const config = await loadConfig();

    const matched = Array.from(document.querySelectorAll(config['dom.allOtherElement']));

    expect(matched).toContain(document.querySelector('a'));
  });
});

describe('window.B3 selector overrides', () => {
  it('lets the storefront snippet override a dom selector default', async () => {
    Object.assign(window.B3, { 'dom.registerElement': '#custom-register' });

    const config = await loadConfig();

    expect(config['dom.registerElement']).toBe('#custom-register');
  });

  it('ignores window.B3 keys that are not selector config entries', async () => {
    const config = await loadConfig();

    expect(config.setting).toBeUndefined();
  });
});
