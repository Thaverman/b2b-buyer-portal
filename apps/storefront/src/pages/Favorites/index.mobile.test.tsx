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

import { ProductSearch } from '@/shared/service/b2b/graphql/product';
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

const connection = <T,>(nodes: T[]) => ({
  pageInfo: lastPage,
  edges: nodes.map((node) => ({ node })),
});

// One list holding one favorite of `product`, in the storefront API shape.
const mockOneFavorite = (product: ProductSearch, variantId: number | null) => {
  const list = buildFavoriteListWith({
    name: 'My Favorites',
    items: [buildFavoriteItemWith({ productId: product.id, variantId })],
  });
  server.use(
    graphql.query('FavoritesLists', () =>
      HttpResponse.json({
        data: {
          customer: {
            wishlists: connection([
              {
                entityId: list.id,
                name: list.name,
                isPublic: false,
                items: connection(
                  list.items.map((item) => ({
                    entityId: item.id,
                    productEntityId: item.productId,
                    variantEntityId: item.variantId,
                  })),
                ),
              },
            ]),
          },
        },
      }),
    ),
    graphql.query('SearchProducts', () =>
      HttpResponse.json({ data: { productsSearch: [product] } }),
    ),
  );
};

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
  mockOneFavorite(product, variant.variant_id);

  renderWithProviders(<Favorites />, { preloadedState });

  const card = (await screen.findByText('Slicker Brush')).closest('.MuiCard-root') as HTMLElement;
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(within(card).getByText('VAR-77')).toBeInTheDocument();
  expect(within(card).getByText('$12.50')).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Add to cart' })).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Save to lists' })).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
});

it('stretches the page across the width of the mobile layout', async () => {
  const product = buildFavoriteProductWith({ name: 'Slicker Brush' });
  mockOneFavorite(product, null);

  renderWithProviders(<Favorites />, { preloadedState });
  await screen.findByText('Slicker Brush');

  // B3Spin wraps children in a `display: flex` context, so a page that never claims the
  // width shrinks to its own content instead of filling the layout column.
  expect(screen.getByTestId('favorites-page')).toHaveStyle({ width: '100%' });
});

it('gives every card action a 44px touch target', async () => {
  const product = buildFavoriteProductWith({ name: 'Slicker Brush' });
  mockOneFavorite(product, null);

  renderWithProviders(<Favorites />, { preloadedState });
  const card = (await screen.findByText('Slicker Brush')).closest('.MuiCard-root') as HTMLElement;

  const buttons = within(within(card).getByTestId('favorites-row-actions')).getAllByRole('button');
  expect(buttons.length).toBeGreaterThan(0);
  buttons.forEach((button) => expect(button).toHaveStyle({ minHeight: '44px' }));
});
