import { pushDataLayerEvent } from '@/utils/analytics';

interface AddToWishlistEvent {
  productId: number;
  variantId: number | null;
  /** Unknown for guest-merge rows, which are saved before the catalog is loaded. */
  name?: string;
  listName: string;
}

/**
 * GA4 add_to_wishlist, one item per successful add (spec §11). item_id / item_variant are the
 * product and variant ids, mirroring what the theme's star has in its data attributes.
 */
export const trackAddToWishlist = ({ productId, variantId, name, listName }: AddToWishlistEvent) =>
  pushDataLayerEvent({
    event: 'add_to_wishlist',
    ecommerce: {
      items: [
        {
          item_id: String(productId),
          ...(name ? { item_name: name } : {}),
          ...(variantId === null ? {} : { item_variant: String(variantId) }),
          item_list_name: listName,
          quantity: 1,
        },
      ],
    },
  });
