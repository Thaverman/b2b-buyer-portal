import { faker } from '@faker-js/faker';
import { builder } from 'tests/builder';

import { FavoriteItem, FavoriteList, FavoriteRow } from '@/pages/Favorites/favorites';
import { GuestFavorite } from '@/pages/Favorites/storage';
import { ProductSearch } from '@/shared/service/b2b/graphql/product';
import { WishlistItemNode, WishlistNode } from '@/shared/service/bc/graphql/wishlist';

export const buildWishlistItemNodeWith = builder<WishlistItemNode>(() => ({
  entityId: faker.number.int({ min: 1, max: 1_000_000 }),
  productEntityId: faker.number.int({ min: 1, max: 1_000_000 }),
  variantEntityId: null,
}));

export const buildWishlistNodeWith = builder<WishlistNode>(() => ({
  entityId: faker.number.int({ min: 1, max: 1_000_000 }),
  name: faker.commerce.department(),
  isPublic: false,
  items: [],
}));

export const buildGuestFavoriteWith = builder<GuestFavorite>(() => ({
  productId: faker.number.int({ min: 1, max: 1_000_000_000 }),
  variantId: null,
  addedAt: faker.date.recent().getTime(),
}));

export const buildFavoriteItemWith = builder<FavoriteItem>(() => ({
  id: faker.number.int({ min: 1, max: 1_000_000_000 }),
  productId: faker.number.int({ min: 1, max: 1_000_000_000 }),
  variantId: null,
}));

export const buildFavoriteListWith = builder<FavoriteList>(() => ({
  id: faker.number.int({ min: 1, max: 1_000_000_000 }),
  name: faker.commerce.department(),
  isPublic: false,
  items: [],
}));

export const buildFavoriteVariantWith = builder<ProductSearch['variants'][number]>(() => {
  const price = Number(faker.commerce.price());

  return {
    variant_id: faker.number.int({ min: 1, max: 1_000_000_000 }),
    product_id: faker.number.int({ min: 1, max: 1_000_000_000 }),
    sku: faker.string.alphanumeric(8).toUpperCase(),
    option_values: [],
    calculated_price: price,
    image_url: faker.image.url(),
    has_price_list: false,
    bulk_prices: [],
    purchasing_disabled: false,
    cost_price: price,
    inventory_level: faker.number.int({ min: 1, max: 100 }),
    bc_calculated_price: {
      as_entered: price,
      tax_inclusive: Number((price * 1.2).toFixed(2)),
      tax_exclusive: price,
      entered_inclusive: false,
    },
  };
});

export const buildFavoriteProductWith = builder<ProductSearch>(() => ({
  id: faker.number.int({ min: 1, max: 1_000_000_000 }),
  name: faker.commerce.productName(),
  sku: faker.string.alphanumeric(6).toUpperCase(),
  costPrice: faker.commerce.price(),
  inventoryLevel: faker.number.int({ min: 1, max: 100 }),
  inventoryTracking: 'none',
  availability: 'available',
  orderQuantityMinimum: 1,
  orderQuantityMaximum: 0,
  variants: [buildFavoriteVariantWith('WHATEVER_VALUES')],
  currencyCode: 'USD',
  imageUrl: faker.image.url(),
  modifiers: [],
  options: [],
  optionsV3: [],
  channelId: [],
  productUrl: faker.internet.url(),
  taxClassId: 0,
  isPriceHidden: false,
}));

export const buildFavoriteRowWith = builder<FavoriteRow>(() => ({
  item: buildFavoriteItemWith('WHATEVER_VALUES'),
  available: true,
  name: faker.commerce.productName(),
  sku: faker.string.alphanumeric(6).toUpperCase(),
  imageUrl: faker.image.url(),
  price: Number(faker.commerce.price()),
  productUrl: faker.internet.url(),
  requiresOptions: false,
  purchasable: true,
  orderQuantityMinimum: 1,
  cartVariantId: faker.number.int({ min: 1, max: 1_000_000_000 }),
}));
