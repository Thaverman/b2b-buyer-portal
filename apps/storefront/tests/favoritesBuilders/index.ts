import { faker } from '@faker-js/faker';
import { builder } from 'tests/builder';

import { GuestFavorite } from '@/pages/Favorites/storage';
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
