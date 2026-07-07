import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { useInfiniteQuery } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';

import { fetchPointsHistory, LoyaltyIdentity, PointActivity } from '../api';

interface HistoryTabProps {
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

function HistoryTab({ identity }: HistoryTabProps) {
  const b3Lang = useB3Lang();

  const historyQuery = useInfiniteQuery({
    queryKey: ['loyaltyHistory', identity?.customerId ?? ''],
    queryFn: ({ pageParam }) => {
      if (!identity) {
        return Promise.reject(new Error('identity not loaded'));
      }
      return fetchPointsHistory(identity, pageParam);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextToken ?? undefined,
    enabled: Boolean(identity),
  });
  const activities: PointActivity[] = historyQuery.data?.pages.flatMap((page) => page.items) ?? [];

  if (historyQuery.isSuccess && activities.length === 0) {
    return <Typography>{b3Lang('loyalty.history.empty')}</Typography>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {activities.map((activity) => (
        <Card key={activity.id}>
          <CardContent sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="body2">
                {activity.customDescription || activity.action}
              </Typography>
              <Typography variant="caption">{formatDate(activity.createdAt)}</Typography>
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

export default HistoryTab;
