import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { useInfiniteQuery } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';

import {
  EarnedReward,
  fetchEarnedRewards,
  fetchPointsHistory,
  LoyaltyIdentity,
  PointActivity,
} from '../api';

import SectionHeader from './SectionHeader';

interface MyRewardsTabProps {
  identity: LoyaltyIdentity | undefined;
}

const formatPoints = (points: number): string => (points > 0 ? `+${points}` : String(points));

const formatDate = (createdAt: string): string => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

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

  const historyQuery = useInfiniteQuery({
    queryKey: ['loyaltyHistory', identity?.customerId ?? ''],
    queryFn: ({ pageParam }) => {
      if (!identity) {
        return Promise.reject(new Error('identity not loaded'));
      }
      return fetchPointsHistory(identity, pageParam);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextToken || undefined,
    enabled: Boolean(identity),
  });
  const activities: PointActivity[] = historyQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const showEmptyHistory = historyQuery.isSuccess && activities.length === 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <SectionHeader>{b3Lang('loyalty.tabs.myRewards')}</SectionHeader>
      {earnedRewards.length > 0 && (
        <Box sx={{ mb: 2 }}>
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
      <Typography variant="h6" sx={{ mb: 1 }}>
        {b3Lang('loyalty.tabs.history')}
      </Typography>
      {showEmptyHistory && <Typography>{b3Lang('loyalty.history.empty')}</Typography>}
      {activities.map((activity) => (
        <Card key={activity.id} variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="body2">
                {activity.customDescription || activity.action}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatDate(activity.createdAt)}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {formatPoints(activity.points)}
            </Typography>
          </CardContent>
        </Card>
      ))}
      {historyQuery.hasNextPage && (
        <Button
          size="small"
          disabled={historyQuery.isFetchingNextPage}
          onClick={() => historyQuery.fetchNextPage()}
        >
          {b3Lang('loyalty.loadMore')}
        </Button>
      )}
    </Box>
  );
}

export default MyRewardsTab;
