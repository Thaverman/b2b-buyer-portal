import { Box, Button, Card, CardContent, Chip, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useB3Lang } from '@/lib/lang';
import { snackbar } from '@/utils/b3Tip';

import {
  completeSocialRule,
  EarnRule,
  fetchEarnRules,
  getSocialCompletionFlag,
  LoyaltyCustomer,
  LoyaltyError,
  LoyaltyIdentity,
} from '../api';

interface EarnPointsTabProps {
  identity: LoyaltyIdentity | undefined;
  customer: LoyaltyCustomer | undefined;
  customerQueryKey: (string | number)[];
}

function EarnPointsTab({ identity, customer, customerQueryKey }: EarnPointsTabProps) {
  const b3Lang = useB3Lang();
  const queryClient = useQueryClient();

  const rulesQuery = useQuery({
    queryKey: ['loyaltyEarnRules'],
    queryFn: fetchEarnRules,
    staleTime: Infinity,
  });
  const rules = rulesQuery.data ?? [];

  const socialMutation = useMutation({
    mutationFn: (ruleId: string) => {
      if (!identity) {
        return Promise.reject(new Error('identity not loaded'));
      }
      return completeSocialRule(identity, ruleId);
    },
    onSuccess: (result) => {
      snackbar.success(b3Lang('loyalty.earn.followSuccess', { points: result.points }));
      queryClient.invalidateQueries({ queryKey: customerQueryKey });
    },
    onError: (err) => {
      if (err instanceof LoyaltyError && err.kind === 'rateLimited') {
        snackbar.error(b3Lang('loyalty.errors.rateLimited'));
        return;
      }
      snackbar.error(b3Lang('loyalty.errors.generic'));
    },
  });

  const renderAction = (rule: EarnRule) => {
    const flag = getSocialCompletionFlag(rule);
    if (!flag || !customer || !identity) {
      // Non-social rules (purchase, mailing list, review) are informational-only in v1;
      // their earning happens through integrations, not this page.
      return null;
    }
    if (customer[flag]) {
      return <Chip label={b3Lang('loyalty.earn.completed')} size="small" />;
    }
    return (
      <Button
        variant="outlined"
        size="small"
        disabled={socialMutation.isPending}
        onClick={() => socialMutation.mutate(rule.id)}
      >
        {b3Lang('loyalty.earn.follow')}
      </Button>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {rules.map((rule) => (
        <Card key={rule.id} sx={{ minWidth: 240, flex: '1 1 40%' }}>
          <CardContent sx={{ textAlign: 'center' }}>
            <Typography variant="subtitle1">{rule.title}</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {rule.summary}
            </Typography>
            {rule.earnValue > 0 && (
              <Typography variant="body2" sx={{ mb: 1 }}>
                {rule.earnType === 'increments'
                  ? b3Lang('loyalty.earn.perDollar', { points: rule.earnValue })
                  : b3Lang('loyalty.earn.flat', { points: rule.earnValue })}
              </Typography>
            )}
            {renderAction(rule)}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

export default EarnPointsTab;
