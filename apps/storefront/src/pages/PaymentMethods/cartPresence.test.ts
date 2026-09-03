import { getCart } from '@/shared/service/bc/graphql/cart';

import { hasActiveCart } from './cartPresence';

vi.mock('@/shared/service/bc/graphql/cart', () => ({
  getCart: vi.fn(),
}));

it('reports an active cart when the storefront session has one', async () => {
  vi.mocked(getCart).mockResolvedValue({
    data: { site: { cart: { entityId: 'cart-1', lineItems: { physicalItems: [] } } } },
  } as unknown as Awaited<ReturnType<typeof getCart>>);

  await expect(hasActiveCart()).resolves.toBe(true);
});

it('reports no cart when the storefront returns a null cart', async () => {
  vi.mocked(getCart).mockResolvedValue({
    data: { site: { cart: null } },
  } as unknown as Awaited<ReturnType<typeof getCart>>);

  await expect(hasActiveCart()).resolves.toBe(false);
});

it('treats a failed cart lookup as no cart (fail closed to the honest copy)', async () => {
  vi.mocked(getCart).mockRejectedValue(new Error('boom'));

  await expect(hasActiveCart()).resolves.toBe(false);
});
