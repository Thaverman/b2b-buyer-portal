import {
  buildB2BFeaturesStateWith,
  buildCompanyStateWith,
  buildFavoriteItemWith,
  buildFavoriteListWith,
  buildFavoriteProductWith,
  buildFavoriteVariantWith,
  buildGlobalStateWith,
  graphql,
  HttpResponse,
  renderWithProviders,
  screen,
  startMockServer,
  waitFor,
  within,
} from 'tests/test-utils';

import { ProductSearch } from '@/shared/service/b2b/graphql/product';
import { CustomerRole, UserTypes } from '@/types';
import { snackbar } from '@/utils/b3Tip';

import { FavoriteList } from './favorites';
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

// The storefront API shape of a normalized list.
const rawList = (list: FavoriteList) => ({
  entityId: list.id,
  name: list.name,
  isPublic: list.isPublic,
  items: connection(
    list.items.map((item) => ({
      entityId: item.id,
      productEntityId: item.productId,
      variantEntityId: item.variantId,
    })),
  ),
});

const mockLists = (lists: FavoriteList[]) =>
  server.use(
    graphql.query('FavoritesLists', () =>
      HttpResponse.json({ data: { customer: { wishlists: connection(lists.map(rawList)) } } }),
    ),
  );

const mockProducts = (products: ProductSearch[]) =>
  server.use(
    graphql.query('SearchProducts', () =>
      HttpResponse.json({ data: { productsSearch: products } }),
    ),
  );

// A list holding one product-only favorite of `product`.
const listWith = (product: ProductSearch, name = 'My Favorites') =>
  buildFavoriteListWith({
    name,
    items: [buildFavoriteItemWith({ productId: product.id, variantId: null })],
  });

beforeEach(() => {
  window.BC_CONTEXT = { favorites: { enabled: true } };
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.dataLayer = [];
});

afterEach(() => {
  delete window.BC_CONTEXT;
});

describe('availability', () => {
  it('shows the unavailable state when the host has not enabled favorites', () => {
    delete window.BC_CONTEXT;

    renderWithProviders(<Favorites />, { preloadedState });

    expect(screen.getByText('Favorites are not available for this account.')).toBeInTheDocument();
  });

  it('shows the unavailable state while a sales rep is masquerading', () => {
    renderWithProviders(<Favorites />, {
      preloadedState: {
        ...preloadedState,
        b2bFeatures: buildB2BFeaturesStateWith({ masqueradeCompany: { isAgenting: true } }),
      },
    });

    expect(screen.getByText('Favorites are not available for this account.')).toBeInTheDocument();
  });

  it('shows the signed-out state when the storefront session has no customer', async () => {
    server.use(
      graphql.query('FavoritesLists', () => HttpResponse.json({ data: { customer: null } })),
    );

    const { user, navigation } = renderWithProviders(<Favorites />, { preloadedState });

    expect(await screen.findByText('Sign in to see your favorites.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(navigation).toHaveBeenCalledWith('/login');
  });
});

describe('lists and rows', () => {
  it('shows the empty state with a top-window shopping link when the customer has no lists', async () => {
    mockLists([]);

    renderWithProviders(<Favorites />, { preloadedState });

    expect(
      await screen.findByText('No favorites yet. Look for the star on any product to save it.'),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Start shopping' });
    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveAttribute('target', '_top');
  });

  it('renders lists as tabs and the selected list rows with image, name, SKU and price', async () => {
    const variant = buildFavoriteVariantWith({
      sku: 'VAR-77',
      image_url: 'https://img.example/var.png',
      bc_calculated_price: {
        as_entered: 12.5,
        tax_inclusive: 15,
        tax_exclusive: 12.5,
        entered_inclusive: false,
      },
    });
    const product = buildFavoriteProductWith({ name: 'Slicker Brush', variants: [variant] });
    const first = buildFavoriteListWith({
      name: 'My Favorites',
      items: [buildFavoriteItemWith({ productId: product.id, variantId: variant.variant_id })],
    });
    const second = buildFavoriteListWith({ name: 'Spring order', items: [] });
    mockLists([first, second]);
    mockProducts([product]);

    renderWithProviders(<Favorites />, { preloadedState });

    expect(await screen.findByRole('tab', { name: 'My Favorites (1)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Spring order (0)' })).toBeInTheDocument();

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    expect(within(row).getByRole('presentation')).toHaveAttribute(
      'src',
      'https://img.example/var.png',
    );
    expect(within(row).getByText('VAR-77')).toBeInTheDocument();
    expect(within(row).getByText('$12.50')).toBeInTheDocument();
  });

  it('shows the tax-inclusive price when the store displays inclusive prices', async () => {
    const variant = buildFavoriteVariantWith({
      bc_calculated_price: {
        as_entered: 12.5,
        tax_inclusive: 15,
        tax_exclusive: 12.5,
        entered_inclusive: false,
      },
    });
    const product = buildFavoriteProductWith({ variants: [variant] });
    mockLists([listWith(product)]);
    mockProducts([product]);

    renderWithProviders(<Favorites />, {
      preloadedState: {
        ...preloadedState,
        global: buildGlobalStateWith({ showInclusiveTaxPrice: true }),
      },
    });

    expect(await screen.findByText('$15.00')).toBeInTheDocument();
  });

  it('hides the price when the catalog hides it for this buyer', async () => {
    const product = buildFavoriteProductWith({ name: 'Hidden Price Brush', isPriceHidden: true });
    mockLists([listWith(product)]);
    mockProducts([product]);

    renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Hidden Price Brush/ });
    expect(within(row).queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('selects the list named in the URL', async () => {
    const first = buildFavoriteListWith({ name: 'First', items: [] });
    const second = buildFavoriteListWith({ name: 'Second', items: [] });
    mockLists([first, second]);

    renderWithProviders(<Favorites />, {
      preloadedState,
      initialEntries: [`/favorites?list=${second.id}`],
    });

    expect(await screen.findByRole('tab', { name: 'Second (0)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('falls back to the first list when the URL names an unknown list', async () => {
    const first = buildFavoriteListWith({ name: 'First', items: [] });
    const second = buildFavoriteListWith({ name: 'Second', items: [] });
    mockLists([first, second]);

    renderWithProviders(<Favorites />, {
      preloadedState,
      initialEntries: ['/favorites?list=999999'],
    });

    expect(await screen.findByRole('tab', { name: 'First (0)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('switches lists through the URL when a tab is clicked', async () => {
    const first = buildFavoriteListWith({ name: 'First', items: [] });
    const second = buildFavoriteListWith({ name: 'Second', items: [] });
    mockLists([first, second]);

    const { user, navigation } = renderWithProviders(<Favorites />, { preloadedState });

    await user.click(await screen.findByRole('tab', { name: 'Second (0)' }));

    expect(navigation).toHaveBeenCalledWith(`/?list=${second.id}`);
    expect(screen.getByRole('heading', { name: 'Second' })).toBeInTheDocument();
  });

  it('shows the empty-list message for a list with no items', async () => {
    mockLists([buildFavoriteListWith({ items: [] })]);

    renderWithProviders(<Favorites />, { preloadedState });

    expect(await screen.findByText('This list is empty.')).toBeInTheDocument();
  });

  it('marks a favorite whose product is no longer in the catalog', async () => {
    mockLists([buildFavoriteListWith({ items: [buildFavoriteItemWith('WHATEVER_VALUES')] })]);
    mockProducts([]);

    renderWithProviders(<Favorites />, { preloadedState });

    expect(await screen.findByText('No longer available')).toBeInTheDocument();
  });

  it('keeps the page usable with placeholders when product details fail to load', async () => {
    mockLists([listWith(buildFavoriteProductWith('WHATEVER_VALUES'))]);
    server.use(
      graphql.query('SearchProducts', () =>
        HttpResponse.json({ errors: [{ message: 'B2B API down' }] }),
      ),
    );

    renderWithProviders(<Favorites />, { preloadedState });

    expect(
      await screen.findByText("We couldn't load product details for your favorites."),
    ).toBeInTheDocument();
    expect(screen.getByText('Product details unavailable')).toBeInTheDocument();
  });
});

describe('list management', () => {
  it('creates a list, trims the name, and selects the new list', async () => {
    const existing = buildFavoriteListWith({ name: 'Existing', items: [] });
    const created = buildFavoriteListWith({ name: 'Gift ideas', items: [] });
    const received = vi.fn();
    let lists = [existing];
    server.use(
      graphql.query('FavoritesLists', () =>
        HttpResponse.json({ data: { customer: { wishlists: connection(lists.map(rawList)) } } }),
      ),
      graphql.mutation('CreateFavoritesList', ({ variables }) => {
        received(variables);
        lists = [existing, created];

        return HttpResponse.json({
          data: {
            wishlist: { createWishlist: { result: { entityId: created.id, name: created.name } } },
          },
        });
      }),
    );

    const { user, navigation } = renderWithProviders(<Favorites />, { preloadedState });

    await user.click(await screen.findByRole('button', { name: 'New list' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'List name' }), '  Gift ideas ');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(received).toHaveBeenCalledWith({ name: 'Gift ideas' }));
    expect(await screen.findByRole('tab', { name: 'Gift ideas (0)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(navigation).toHaveBeenCalledWith(`/?list=${created.id}`);
    // The dialog closes through MUI's exit transition, so its removal is asynchronous.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('disables Create until a name is entered', async () => {
    mockLists([buildFavoriteListWith({ items: [] })]);

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    await user.click(await screen.findByRole('button', { name: 'New list' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();

    await user.type(within(dialog).getByRole('textbox', { name: 'List name' }), '   ');

    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(within(dialog).getByText('Enter a list name')).toBeInTheDocument();
  });

  it('renames the selected list', async () => {
    const list = buildFavoriteListWith({ name: 'Old name', items: [] });
    const received = vi.fn();
    mockLists([list]);
    server.use(
      graphql.mutation('RenameFavoritesList', ({ variables }) => {
        received(variables);

        return HttpResponse.json({
          data: {
            wishlist: { updateWishlist: { result: { entityId: list.id, name: variables.name } } },
          },
        });
      }),
    );

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    await user.click(await screen.findByRole('button', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByRole('textbox', { name: 'List name' });
    expect(input).toHaveValue('Old name');
    await user.clear(input);
    await user.type(input, 'New name');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(received).toHaveBeenCalledWith({ listId: list.id, name: 'New name' }),
    );
    expect(snackbar.success).toHaveBeenCalledWith('List renamed');
  });

  it('deletes the selected list, clears the default-list key, and falls back to the first remaining list', async () => {
    const keep = buildFavoriteListWith({ name: 'Keep', items: [] });
    const doomed = buildFavoriteListWith({
      name: 'Doomed',
      items: [buildFavoriteItemWith('WHATEVER_VALUES'), buildFavoriteItemWith('WHATEVER_VALUES')],
    });
    const received = vi.fn();
    let lists = [keep, doomed];
    window.localStorage.setItem('favorites_default_list', String(doomed.id));
    window.sessionStorage.setItem('favorites_lists', '{"value":[],"expiry":1}');
    server.use(
      graphql.query('FavoritesLists', () =>
        HttpResponse.json({ data: { customer: { wishlists: connection(lists.map(rawList)) } } }),
      ),
      graphql.mutation('DeleteFavoritesLists', ({ variables }) => {
        received(variables);
        lists = [keep];

        return HttpResponse.json({ data: { wishlist: { deleteWishlists: { result: 'ok' } } } });
      }),
    );
    mockProducts([]);

    const { user } = renderWithProviders(<Favorites />, {
      preloadedState,
      initialEntries: [`/favorites?list=${doomed.id}`],
    });

    await user.click(await screen.findByRole('button', { name: 'Delete list' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Delete Doomed? Its 2 favorites will be removed.'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete list' }));

    await waitFor(() => expect(received).toHaveBeenCalledWith({ listIds: [doomed.id] }));
    expect(await screen.findByRole('tab', { name: 'Keep (0)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('tab', { name: 'Doomed (2)' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('favorites_default_list')).toBeNull();
    expect(window.sessionStorage.getItem('favorites_lists')).toBeNull();
    expect(snackbar.success).toHaveBeenCalledWith('List deleted');
  });

  it('keeps the default-list key when a different list is deleted', async () => {
    const defaultList = buildFavoriteListWith({ name: 'Default', items: [] });
    const other = buildFavoriteListWith({ name: 'Other', items: [] });
    window.localStorage.setItem('favorites_default_list', String(defaultList.id));
    mockLists([defaultList, other]);
    server.use(
      graphql.mutation('DeleteFavoritesLists', () =>
        HttpResponse.json({ data: { wishlist: { deleteWishlists: { result: 'ok' } } } }),
      ),
    );

    const { user } = renderWithProviders(<Favorites />, {
      preloadedState,
      initialEntries: [`/favorites?list=${other.id}`],
    });

    await user.click(await screen.findByRole('button', { name: 'Delete list' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete list' }),
    );

    await waitFor(() => expect(snackbar.success).toHaveBeenCalledWith('List deleted'));
    expect(window.localStorage.getItem('favorites_default_list')).toBe(String(defaultList.id));
  });

  it('shows the generic error and keeps the dialog open when renaming fails', async () => {
    mockLists([buildFavoriteListWith({ name: 'Old', items: [] })]);
    server.use(
      graphql.mutation('RenameFavoritesList', () =>
        HttpResponse.json({ errors: [{ message: 'nope' }] }),
      ),
    );

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    await user.click(await screen.findByRole('button', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'List name' }), ' 2');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(snackbar.error).toHaveBeenCalledWith(
        'Something went wrong updating your favorites. Please try again.',
      ),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('remove and save to lists', () => {
  const addItemsHandler = (received: ReturnType<typeof vi.fn>) =>
    graphql.mutation('AddFavoritesItems', ({ variables }) => {
      received(variables);

      return HttpResponse.json({
        data: { wishlist: { addWishlistItems: { result: { entityId: variables.listId } } } },
      });
    });

  const deleteItemsHandler = (received: ReturnType<typeof vi.fn>) =>
    graphql.mutation('DeleteFavoritesItems', ({ variables }) => {
      received(variables);

      return HttpResponse.json({
        data: { wishlist: { deleteWishlistItems: { result: { entityId: variables.listId } } } },
      });
    });

  it('removes an item and invalidates the theme cache', async () => {
    const product = buildFavoriteProductWith({ name: 'Slicker Brush' });
    const list = listWith(product);
    const received = vi.fn();
    window.sessionStorage.setItem('favorites_lists', '{"value":[],"expiry":1}');
    mockLists([list]);
    mockProducts([product]);
    server.use(deleteItemsHandler(received));

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    await user.click(within(row).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(received).toHaveBeenCalledWith({ listId: list.id, itemIds: [list.items[0].id] }),
    );
    expect(snackbar.success).toHaveBeenCalledWith('Removed from My Favorites');
    expect(window.sessionStorage.getItem('favorites_lists')).toBeNull();
  });

  it('copies an item to another list from the save-to-lists dialog', async () => {
    const variant = buildFavoriteVariantWith('WHATEVER_VALUES');
    const product = buildFavoriteProductWith({ name: 'Slicker Brush', variants: [variant] });
    const current = buildFavoriteListWith({
      name: 'My Favorites',
      items: [buildFavoriteItemWith({ productId: product.id, variantId: variant.variant_id })],
    });
    const other = buildFavoriteListWith({ name: 'Spring order', items: [] });
    const received = vi.fn();
    mockLists([current, other]);
    mockProducts([product]);
    server.use(addItemsHandler(received));

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    await user.click(within(row).getByRole('button', { name: 'Save to lists' }));

    const dialog = await screen.findByRole('dialog', { name: 'Save Slicker Brush to lists' });
    expect(within(dialog).getByRole('checkbox', { name: 'My Favorites' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Spring order' })).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.click(within(dialog).getByRole('checkbox', { name: 'Spring order' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(received).toHaveBeenCalledWith({
        listId: other.id,
        items: [{ productEntityId: product.id, variantEntityId: variant.variant_id }],
      }),
    );
    expect(snackbar.success).toHaveBeenCalledWith('Saved to Spring order');
    expect(window.localStorage.getItem('favorites_default_list')).toBe(String(other.id));
    expect(window.dataLayer).toContainEqual({
      event: 'add_to_wishlist',
      ecommerce: {
        items: [
          {
            item_id: String(product.id),
            item_name: 'Slicker Brush',
            item_variant: String(variant.variant_id),
            item_list_name: 'Spring order',
            quantity: 1,
          },
        ],
      },
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('moves an item by checking another list and unchecking the current one', async () => {
    const product = buildFavoriteProductWith({ name: 'Slicker Brush' });
    const current = listWith(product);
    const other = buildFavoriteListWith({ name: 'Spring order', items: [] });
    const added = vi.fn();
    const deleted = vi.fn();
    mockLists([current, other]);
    mockProducts([product]);
    server.use(addItemsHandler(added), deleteItemsHandler(deleted));

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    await user.click(within(row).getByRole('button', { name: 'Save to lists' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Spring order' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'My Favorites' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(added).toHaveBeenCalledWith({
        listId: other.id,
        items: [{ productEntityId: product.id }],
      }),
    );
    expect(deleted).toHaveBeenCalledWith({ listId: current.id, itemIds: [current.items[0].id] });
    expect(snackbar.success).toHaveBeenCalledWith('Favorites updated');
  });

  it('warns that unchecking every list removes the product, then removes it on save', async () => {
    const product = buildFavoriteProductWith({ name: 'Slicker Brush' });
    const current = listWith(product);
    const added = vi.fn();
    const deleted = vi.fn();
    mockLists([current]);
    mockProducts([product]);
    server.use(addItemsHandler(added), deleteItemsHandler(deleted));

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    await user.click(within(row).getByRole('button', { name: 'Save to lists' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: 'My Favorites' }));

    expect(
      within(dialog).getByText('Unchecking every list removes this product from your favorites.'),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(deleted).toHaveBeenCalledWith({ listId: current.id, itemIds: [current.items[0].id] }),
    );
    expect(added).not.toHaveBeenCalled();
  });

  it('creates a new list from the dialog, pre-checks it, and saves into it', async () => {
    const product = buildFavoriteProductWith({ name: 'Slicker Brush' });
    const current = listWith(product);
    const created = buildFavoriteListWith({ name: 'Gift ideas', items: [] });
    const createReceived = vi.fn();
    const added = vi.fn();
    let lists = [current];
    server.use(
      graphql.query('FavoritesLists', () =>
        HttpResponse.json({ data: { customer: { wishlists: connection(lists.map(rawList)) } } }),
      ),
      graphql.mutation('CreateFavoritesList', ({ variables }) => {
        createReceived(variables);
        lists = [current, created];

        return HttpResponse.json({
          data: {
            wishlist: { createWishlist: { result: { entityId: created.id, name: created.name } } },
          },
        });
      }),
      addItemsHandler(added),
    );
    mockProducts([product]);

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    await user.click(within(row).getByRole('button', { name: 'Save to lists' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'New list name' }), 'Gift ideas');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createReceived).toHaveBeenCalledWith({ name: 'Gift ideas' }));
    expect(await within(dialog).findByRole('checkbox', { name: 'Gift ideas' })).toBeChecked();

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(added).toHaveBeenCalledWith({
        listId: created.id,
        items: [{ productEntityId: product.id }],
      }),
    );
    expect(snackbar.success).toHaveBeenCalledWith('Saved to Gift ideas');
  });
});

describe('add to cart', () => {
  const existingCart = { data: { site: { cart: { entityId: 'cart-1', lineItems: {} } } } };
  const sizeOption = { option_id: 1, display_name: 'Size', sort_order: 0, is_required: true };

  const mockCart = (received: ReturnType<typeof vi.fn>) =>
    server.use(
      graphql.query('getCart', () => HttpResponse.json(existingCart)),
      graphql.mutation('addCartLineItemsTwo', ({ variables }) => {
        received(variables);

        return HttpResponse.json({
          data: { cart: { addCartLineItems: { cart: { entityId: 'cart-1' } } } },
        });
      }),
    );

  it('adds an item to the cart at the catalog minimum quantity', async () => {
    const variant = buildFavoriteVariantWith('WHATEVER_VALUES');
    const product = buildFavoriteProductWith({
      name: 'Slicker Brush',
      variants: [variant],
      orderQuantityMinimum: 6,
    });
    const received = vi.fn();
    mockLists([listWith(product)]);
    mockProducts([product]);
    mockCart(received);

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    await user.click(within(row).getByRole('button', { name: 'Add to cart' }));

    await waitFor(() =>
      expect(received).toHaveBeenCalledWith({
        addCartLineItemsInput: {
          cartEntityId: 'cart-1',
          data: {
            lineItems: [
              {
                quantity: 6,
                productEntityId: product.id,
                variantEntityId: variant.variant_id,
                selectedOptions: { multipleChoices: [], textFields: [] },
              },
            ],
          },
        },
      }),
    );
    expect(snackbar.success).toHaveBeenCalledWith(
      'Added to cart',
      expect.objectContaining({ action: expect.objectContaining({ label: 'View cart' }) }),
    );
  });

  it('adds every addable row to the cart and reports the skipped rows', async () => {
    const addable = buildFavoriteProductWith({ name: 'Addable' });
    const needsOptions = buildFavoriteProductWith({ name: 'Needs options', options: [sizeOption] });
    const gone = buildFavoriteProductWith({ name: 'Gone' });
    const list = buildFavoriteListWith({
      name: 'My Favorites',
      items: [addable, needsOptions, gone].map((product) =>
        buildFavoriteItemWith({ productId: product.id, variantId: null }),
      ),
    });
    const received = vi.fn();
    mockLists([list]);
    mockProducts([addable, needsOptions]); // `gone` is missing from the catalog response
    mockCart(received);

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    await screen.findByRole('row', { name: /Addable/ });
    await user.click(screen.getByRole('button', { name: 'Add all to cart' }));

    await waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received.mock.calls[0][0].addCartLineItemsInput.data.lineItems).toEqual([
      {
        quantity: 1,
        productEntityId: addable.id,
        variantEntityId: addable.variants[0].variant_id,
        selectedOptions: { multipleChoices: [], textFields: [] },
      },
    ]);
    expect(snackbar.success).toHaveBeenCalledWith(
      '1 item added to cart',
      expect.objectContaining({
        description: '2 items skipped: they need options or are unavailable',
      }),
    );
  });

  it('says there is nothing to add when no row can go to the cart', async () => {
    const needsOptions = buildFavoriteProductWith({ name: 'Needs options', options: [sizeOption] });
    const received = vi.fn();
    mockLists([listWith(needsOptions)]);
    mockProducts([needsOptions]);
    mockCart(received);

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    await screen.findByRole('row', { name: /Needs options/ });
    await user.click(screen.getByRole('button', { name: 'Add all to cart' }));

    await waitFor(() =>
      expect(snackbar.info).toHaveBeenCalledWith(
        'Nothing to add: these items need options or are unavailable.',
      ),
    );
    expect(received).not.toHaveBeenCalled();
  });

  it('links option products to the product page in the top window instead of adding blindly', async () => {
    const needsOptions = buildFavoriteProductWith({
      name: 'Needs options',
      productUrl: 'https://store.example/needs-options/',
      options: [sizeOption],
    });
    mockLists([listWith(needsOptions)]);
    mockProducts([needsOptions]);

    renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Needs options/ });
    const link = within(row).getByRole('link', { name: 'Choose options' });
    expect(link).toHaveAttribute('href', 'https://store.example/needs-options/');
    expect(link).toHaveAttribute('target', '_top');
    expect(within(row).queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument();
  });

  it('offers no cart action for a favorite whose product is gone', async () => {
    mockLists([buildFavoriteListWith({ items: [buildFavoriteItemWith('WHATEVER_VALUES')] })]);
    mockProducts([]);

    renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /No longer available/ });
    expect(within(row).queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('link', { name: 'Choose options' })).not.toBeInTheDocument();
  });

  it('shows the storefront message when the cart rejects the add', async () => {
    const product = buildFavoriteProductWith({ name: 'Slicker Brush' });
    mockLists([listWith(product)]);
    mockProducts([product]);
    server.use(
      graphql.query('getCart', () => HttpResponse.json(existingCart)),
      graphql.mutation('addCartLineItemsTwo', () =>
        HttpResponse.json({ errors: [{ message: 'Not enough stock' }] }),
      ),
    );

    const { user } = renderWithProviders(<Favorites />, { preloadedState });

    const row = await screen.findByRole('row', { name: /Slicker Brush/ });
    await user.click(within(row).getByRole('button', { name: 'Add to cart' }));

    await waitFor(() => expect(snackbar.error).toHaveBeenCalledWith('Not enough stock'));
  });
});
