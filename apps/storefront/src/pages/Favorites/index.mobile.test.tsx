import {
  buildCompanyStateWith,
  buildFavoriteItemWith,
  buildFavoriteListWith,
  buildFavoriteProductWith,
  buildFavoriteVariantWith,
  graphql,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
  within,
} from 'tests/test-utils';

import { CustomerRole, UserTypes } from '@/types';

import Favorites from '.';

vi.mock('@/utils/b3Tip', () => ({
  snackbar: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/utils/b3Logger');

const { server } = startMockServer();

const preloadedState = {
  company: buildCompanyStateWith({
    customer: {
      id: 4242,
      emailAddress: 'buyer@example.com',
      role: CustomerRole.B2C,
      userType: UserTypes.B2C,
    },
    tokens: { bcGraphqlToken: 'storefront-token' },
  }),
};

const lastPage = { hasNextPage: false, endCursor: null };

beforeEach(() => {
  window.BC_CONTEXT = { favorites: { enabled: true } };
  // The portal's mobile breakpoint (useMobile) is 768px.
  vi.spyOn(document.body, 'clientWidth', 'get').mockReturnValue(500);
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

it('renders favorites as cards with name, SKU, price and actions on mobile', async () => {
  const variant = buildFavoriteVariantWith({
    sku: 'VAR-77',
    bc_calculated_price: {
      as_entered: 12.5,
      tax_inclusive: 15,
      tax_exclusive: 12.5,
      entered_inclusive: false,
    },
  });
  const product = buildFavoriteProductWith({ name: 'Slicker Brush', variants: [variant] });
  const list = buildFavoriteListWith({
    name: 'My Favorites',
    items: [buildFavoriteItemWith({ productId: product.id, variantId: variant.variant_id })],
  });
  server.use(
    graphql.query('FavoritesLists', () =>
      HttpResponse.json({
        data: {
          customer: {
            wishlists: {
              pageInfo: lastPage,
              edges: [
                {
                  node: {
                    entityId: list.id,
                    name: list.name,
                    isPublic: false,
                    items: {
                      pageInfo: lastPage,
                      edges: list.items.map((item) => ({
                        node: {
                          entityId: item.id,
                          productEntityId: item.productId,
                          variantEntityId: item.variantId,
                        },
                      })),
                    },
                  },
                },
              ],
            },
          },
        },
      }),
    ),
    graphql.query('SearchProducts', () =>
      HttpResponse.json({ data: { productsSearch: [product] } }),
    ),
  );

  renderWithProviders(<Favorites />, { preloadedState });

  const card = (await screen.findByText('Slicker Brush')).closest('.MuiCard-root') as HTMLElement;
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(within(card).getByText('VAR-77')).toBeInTheDocument();
  expect(within(card).getByText('$12.50')).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Add to cart' })).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Save to lists' })).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
});
