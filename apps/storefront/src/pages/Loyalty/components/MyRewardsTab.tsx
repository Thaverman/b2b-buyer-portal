import { ContentCopy } from '@mui/icons-material';
import { alpha, Box, Button, IconButton, Typography } from '@mui/material';
import { useInfiniteQuery } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import { snackbar } from '@/utils/b3Tip';

import { EarnedReward, fetchEarnedRewards, LoyaltyIdentity } from '../api';

interface MyRewardsTabProps {
  identity: LoyaltyIdentity | undefined;
}

function MyRewardsTab({ identity }: MyRewardsTabProps) {
  const b3Lang = useB3Lang();

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

  const copyCode = async (couponCode: string) => {
    try {
      await navigator.clipboard.writeText(couponCode);
      snackbar.success(b3Lang('loyalty.redeem.copied'));
    } catch {
      snackbar.error(b3Lang('loyalty.errors.generic'));
    }
  };

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
            <Typography
              sx={{ textTransform: 'uppercase', fontWeight: 700, color: 'text.secondary' }}
            >
              {b3Lang('loyalty.myRewards.readyStatus')}
            </Typography>
            {reward.couponCode !== '' && (
              <IconButton
                size="small"
                aria-label={b3Lang('loyalty.redeem.copy')}
                onClick={() => copyCode(reward.couponCode)}
              >
                <ContentCopy fontSize="small" />
              </IconButton>
            )}
          </Box>
        </Box>
      ))}
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
