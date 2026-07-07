import { useState } from 'react';
import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import B3Dialog from '@/components/B3Dialog';
import { useB3Lang } from '@/lib/lang';
import { snackbar } from '@/utils/b3Tip';

import {
  fetchRedeemRules,
  isRedeemableCatalogRule,
  LoyaltyError,
  LoyaltyIdentity,
  redeemReward,
  RedeemRule,
} from '../api';

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
      setCouponCode(result.couponCode);
      queryClient.invalidateQueries({ queryKey: customerQueryKey });
      queryClient.invalidateQueries({ queryKey: ['loyaltyHistory'] });
      queryClient.invalidateQueries({ queryKey: ['loyaltyRewards'] });
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

  const handleCopy = async () => {
    if (couponCode) {
      await navigator.clipboard.writeText(couponCode);
      snackbar.success(b3Lang('loyalty.redeem.copied'));
    }
  };

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {catalog.map((rule) => (
        <Card key={rule.id} sx={{ minWidth: 240, flex: '1 1 40%' }}>
          <CardContent sx={{ textAlign: 'center' }}>
            <Typography variant="subtitle1">{rule.title}</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
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
      ))}
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
