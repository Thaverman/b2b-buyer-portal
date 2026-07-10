import { useState } from 'react';
import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';
import { snackbar } from '@/utils/b3Tip';

import {
  EarnedReward,
  fetchEarnedRewards,
  fetchRedeemRules,
  isRedeemableCatalogRule,
  LoyaltyError,
  LoyaltyIdentity,
  redeemReward,
  RedeemRule,
} from '../api';
import { redeemRuleIcon } from '../loyaltyIcons';

import SectionHeader from './SectionHeader';

interface RewardsTabProps {
  identity: LoyaltyIdentity | undefined;
  pointBalance: number;
  customerQueryKey: (string | number)[];
}

function RewardsTab({ identity, pointBalance, customerQueryKey }: RewardsTabProps) {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();
  const [pendingRedeem, setPendingRedeem] = useState<RedeemRule | null>(null);
  const [couponCode, setCouponCode] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey: ['loyaltyRedeemRules'],
    queryFn: fetchRedeemRules,
    staleTime: Infinity,
  });
  const catalog = (rulesQuery.data ?? []).filter(isRedeemableCatalogRule);

  const redeemMutation = useMutation({
    mutationFn: (ruleId: string) => {
      if (!identity) {
        return Promise.reject(new Error('identity not loaded'));
      }
      return redeemReward(identity, ruleId);
    },
    onSuccess: (result) => {
      setPendingRedeem(null);
      // Invalidate regardless of outcome: upstream may have deducted points even
      // when it returns no coupon code, so refetch the truth.
      queryClient.invalidateQueries({ queryKey: customerQueryKey });
      queryClient.invalidateQueries({ queryKey: ['loyaltyHistory'] });
      queryClient.invalidateQueries({ queryKey: ['loyaltyRewards'] });
      if (!result.couponCode) {
        snackbar.error(b3Lang('loyalty.errors.generic'));
        return;
      }
      setCouponCode(result.couponCode);
    },
    onError: (err) => {
      setPendingRedeem(null);
      if (err instanceof LoyaltyError && err.kind === 'rateLimited') {
        snackbar.error(b3Lang('loyalty.errors.rateLimited'));
        return;
      }
      snackbar.error(b3Lang('loyalty.errors.generic'));
    },
  });

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

  const handleCopy = async () => {
    if (!couponCode) {
      return;
    }
    try {
      await navigator.clipboard.writeText(couponCode);
      snackbar.success(b3Lang('loyalty.redeem.copied'));
    } catch {
      snackbar.error(b3Lang('loyalty.errors.generic'));
    }
  };

  return (
    <Box>
      <SectionHeader>{b3Lang('loyalty.tabs.redeem')}</SectionHeader>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {catalog.map((rule) => {
          const Icon = redeemRuleIcon(rule);
          return (
            <Card
              key={rule.id}
              variant="outlined"
              sx={{ minWidth: 240, flex: '1 1 40%', borderRadius: 2 }}
            >
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <Icon color="primary" sx={{ fontSize: 32, mb: 1 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {rule.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {b3Lang('loyalty.redeem.pointCost', {
                    points: (rule.pointCost ?? 0).toLocaleString(),
                  })}
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={redeemMutation.isPending || (rule.pointCost ?? 0) > pointBalance}
                  onClick={() => setPendingRedeem(rule)}
                >
                  {b3Lang('loyalty.redeem.getReward')}
                </Button>
              </CardContent>
            </Card>
          );
        })}
        {earnedRewards.length > 0 && (
          <Box sx={{ width: '100%', mt: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {b3Lang('loyalty.redeem.earnedTitle')}
            </Typography>
            {earnedRewards.map((reward) => (
              <Card key={reward.id} variant="outlined" sx={{ mb: 1, borderRadius: 2 }}>
                <CardContent
                  sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}
                >
                  <Typography variant="body2">{reward.title}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {reward.couponCode}
                  </Typography>
                </CardContent>
              </Card>
            ))}
            {earnedQuery.hasNextPage && (
              <Button
                size="small"
                disabled={earnedQuery.isFetchingNextPage}
                onClick={() => earnedQuery.fetchNextPage()}
              >
                {b3Lang('loyalty.loadMore')}
              </Button>
            )}
          </Box>
        )}
      </Box>
      {/* Dialogs live outside the card grid: B3Dialog renders an in-flow wrapper even
          when closed, and as a flex item it consumes grid gap, shrinking the last card. */}
      <B3Dialog
        isOpen={Boolean(pendingRedeem)}
        title={b3Lang('loyalty.redeem.confirmTitle')}
        leftSizeBtn={b3Lang('loyalty.redeem.cancel')}
        rightSizeBtn={b3Lang('loyalty.redeem.confirm')}
        loading={redeemMutation.isPending}
        handleLeftClick={() => {
          if (!redeemMutation.isPending) {
            setPendingRedeem(null);
          }
        }}
        handRightClick={() => {
          if (pendingRedeem) {
            redeemMutation.mutate(pendingRedeem.id);
          }
        }}
      >
        <Box>
          {pendingRedeem &&
            b3Lang('loyalty.redeem.confirmContent', {
              reward: pendingRedeem.title,
              points: (pendingRedeem.pointCost ?? 0).toLocaleString(),
            })}
        </Box>
      </B3Dialog>
      <B3Dialog
        isOpen={Boolean(couponCode)}
        title={b3Lang('loyalty.redeem.couponTitle')}
        leftSizeBtn={b3Lang('loyalty.redeem.copy')}
        rightSizeBtn={b3Lang('loyalty.redeem.close')}
        handleLeftClick={handleCopy}
        handRightClick={() => setCouponCode(null)}
      >
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h5" sx={{ mb: 1 }}>
            {couponCode}
          </Typography>
          <Typography variant="body2">{b3Lang('loyalty.redeem.applyAtCheckout')}</Typography>
        </Box>
      </B3Dialog>
    </Box>
  );
}

export default RewardsTab;
