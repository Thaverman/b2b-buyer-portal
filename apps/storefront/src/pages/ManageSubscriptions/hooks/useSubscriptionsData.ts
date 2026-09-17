import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import {
  getProduct,
  listAddresses,
  listOrdersPage,
  listPayments,
  listSubscriptions,
  listUpcomingOrders,
  OgProduct,
  orderHistoryUrl,
} from '@/shared/service/ordergroove';

// Product names are best-effort (spec §4.2): a failed lookup is a null entry, never an error.
const lookupProducts = async (customerId: string, productIds: string[]) =>
  new Map<string, OgProduct | null>(
    await Promise.all(
      productIds.map(
        async (productId): Promise<[string, OgProduct | null]> => [
          productId,
          await getProduct(customerId, productId).catch(() => null),
        ],
      ),
    ),
  );

/**
 * One query per Ordergroove resource so cards render while the slower lookups fill in, and so
 * Phase 3 mutations can invalidate just the resource they changed. All `retry: false`: the page
 * owns its Try again.
 */
export const useSubscriptionsData = (customerId: number) => {
  const id = String(customerId);
  const key = (resource: string) => ['ordergroove', customerId, resource];

  const subscriptions = useQuery({
    queryKey: key('subscriptions'),
    queryFn: () => listSubscriptions(id),
    retry: false,
  });
  const payments = useQuery({
    queryKey: key('payments'),
    queryFn: () => listPayments(id),
    retry: false,
  });
  const addresses = useQuery({
    queryKey: key('addresses'),
    queryFn: () => listAddresses(id),
    retry: false,
  });
  const upcoming = useQuery({
    queryKey: key('upcoming'),
    queryFn: () => listUpcomingOrders(id),
    retry: false,
  });

  const productIds = [...new Set((subscriptions.data ?? []).map((s) => s.product))].sort();
  const products = useQuery({
    queryKey: [...key('products'), productIds],
    queryFn: () => lookupProducts(id, productIds),
    enabled: productIds.length > 0,
    retry: false,
  });

  // Fixed once per mount so re-renders never move the "through today" boundary mid-pagination.
  const [firstPageUrl] = useState(() => orderHistoryUrl(dayjs().format('YYYY-MM-DD')));
  const orderHistory = useInfiniteQuery({
    queryKey: key('orderHistory'),
    queryFn: ({ pageParam }) => listOrdersPage(id, pageParam),
    initialPageParam: firstPageUrl,
    getNextPageParam: (last) => last.next ?? undefined,
    retry: false,
  });

  return { subscriptions, payments, addresses, upcoming, products, orderHistory };
};
