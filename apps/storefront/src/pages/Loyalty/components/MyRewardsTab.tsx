import { alpha, Box, Button, Typography } from '@mui/material';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import {
  applyCartCoupon,
  CartCouponError,
  CartCoupons,
  fetchCartCoupons,
  isSameCouponCode,
  removeCartCoupon,
} from '@/shared/service/bc/api/cart';
import { snackbar } from '@/utils/b3Tip';

import { EarnedReward, fetchEarnedRewards, LoyaltyIdentity } from '../api';

const CART_COUPONS_KEY = ['cartCoupons'];

interface MyRewardsTabProps {
  identity: LoyaltyIdentity | undefined;
}

function MyRewardsTab({ identity }: MyRewardsTabProps) {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();

  const earnedQuery = useInfiniteQuery({
    queryKey: ['loyaltyRewards', identity?.customerId ?? ''],
    queryFn: ({ pageParam }) => {
      if (!identity) {
        return Promise.reject(new Error('identity not loaded'));
      }
      return fetchEarnedRewards(identity, pageParam);
    },
    // v5 requires initialPageParam; undefined = first page (no nextToken param sent).
    initialPageParam: undefined as string | undefined,
    // || not ??: an empty-string token would count as "has next page" while the
    // fetcher drops it from the request — refetching page 1 forever.
    getNextPageParam: (last) => last.nextToken || undefined,
    enabled: Boolean(identity),
  });
  const earnedRewards: EarnedReward[] = earnedQuery.data?.pages.flatMap((page) => page.items) ?? [];

  // Independent of identity: the cart belongs to the storefront session, not to the
  // loyalty provider. One call yields both the checkout id and its applied codes.
  const cartQuery = useQuery({
    queryKey: CART_COUPONS_KEY,
    queryFn: fetchCartCoupons,
  });
  const cartId = cartQuery.data?.cartId ?? null;
  const appliedCodes = cartQuery.data?.appliedCodes ?? [];

  // Both writes return the cart's new applied-code set; the cart id is unchanged.
  const storeAppliedCodes = (codes: string[]) =>
    queryClient.setQueryData<CartCoupons>(CART_COUPONS_KEY, (previous) => ({
      cartId: previous?.cartId ?? null,
      appliedCodes: codes,
    }));

  const applyMutation = useMutation({
    mutationFn: (code: string) => {
      if (!cartId) {
        return Promise.reject(new CartCouponError('emptyCart'));
      }
      return applyCartCoupon(cartId, code);
    },
    onSuccess: (codes) => {
      storeAppliedCodes(codes);
      snackbar.success(b3Lang('loyalty.myRewards.applySuccess'));
    },
    onError: (error) => {
      // Resync: the write may have failed because our view of the cart was stale.
      queryClient.invalidateQueries({ queryKey: CART_COUPONS_KEY });
      const kind = error instanceof CartCouponError ? error.kind : 'upstream';
      if (kind === 'emptyCart') {
        snackbar.error(b3Lang('loyalty.myRewards.needsCart'));
        return;
      }
      if (kind === 'rejected') {
        snackbar.error(b3Lang('loyalty.myRewards.rejected'));
        return;
      }
      snackbar.error(b3Lang('loyalty.errors.generic'));
    },
  });

  const removeMutation = useMutation({
    mutationFn: (code: string) => {
      if (!cartId) {
        return Promise.reject(new CartCouponError('emptyCart'));
      }
      return removeCartCoupon(cartId, code);
    },
    onSuccess: (codes) => {
      storeAppliedCodes(codes);
      snackbar.success(b3Lang('loyalty.myRewards.removeSuccess'));
    },
    // Always generic: the apply-specific "may have already been used" copy is wrong
    // for a removal, and the refetch below is what resolves the real state anyway.
    onError: () => {
      queryClient.invalidateQueries({ queryKey: CART_COUPONS_KEY });
      snackbar.error(b3Lang('loyalty.errors.generic'));
    },
  });

  const isMutating = applyMutation.isPending || removeMutation.isPending;

  // The first reward whose code the cart reports as applied. Keyed by id so that
  // two rewards sharing a code cannot both render as applied.
  const appliedReward = earnedRewards.find((reward) =>
    appliedCodes.some((code) => isSameCouponCode(code, reward.couponCode)),
  );

  let hint = '';
  if (cartQuery.isSuccess && !cartId) {
    hint = b3Lang('loyalty.myRewards.needsCart');
  } else if (cartQuery.isError) {
    hint = b3Lang('loyalty.errors.generic');
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography color="text.secondary">{b3Lang('loyalty.myRewards.introRedeemed')}</Typography>
        <Typography color="text.secondary">{b3Lang('loyalty.myRewards.introApply')}</Typography>
      </Box>
      {earnedQuery.isSuccess && earnedRewards.length === 0 && (
        <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
          {b3Lang('loyalty.myRewards.empty')}
        </Typography>
      )}
      {earnedRewards.map((reward) => (
        <Box
          key={reward.id}
          sx={{
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
            borderRadius: 3,
            px: 4,
            py: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Typography sx={{ textTransform: 'uppercase' }}>{reward.title}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {reward.couponCode !== '' &&
              (appliedReward?.id === reward.id ? (
                <>
                  <Typography
                    sx={{ textTransform: 'uppercase', fontWeight: 700, color: 'text.secondary' }}
                  >
                    {b3Lang('loyalty.myRewards.appliedStatus')}
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={isMutating}
                    onClick={() => removeMutation.mutate(reward.couponCode)}
                  >
                    {b3Lang('loyalty.myRewards.remove')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outlined"
                  size="small"
                  // No cartId means the cart read is still in flight, failed, or found
                  // no cart — in none of those can a coupon be applied.
                  disabled={isMutating || !cartId}
                  onClick={() => applyMutation.mutate(reward.couponCode)}
                >
                  {b3Lang('loyalty.myRewards.apply')}
                </Button>
              ))}
          </Box>
        </Box>
      ))}
      {hint !== '' && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          {hint}
        </Typography>
      )}
      {earnedQuery.hasNextPage && (
        <Button
          size="small"
          disabled={earnedQuery.isFetchingNextPage}
          onClick={() => earnedQuery.fetchNextPage()}
          sx={{ alignSelf: 'flex-start' }}
        >
          {b3Lang('loyalty.loadMore')}
        </Button>
      )}
    </Box>
  );
}

export default MyRewardsTab;
