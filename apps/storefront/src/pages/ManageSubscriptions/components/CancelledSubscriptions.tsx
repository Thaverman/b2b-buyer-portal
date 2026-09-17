import { useState } from 'react';
import { Box, Button, Collapse } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { SubscriptionCard as SubscriptionCardModel } from '../viewModel';

import SubscriptionCard, { CellLoading } from './SubscriptionCard';

interface CancelledSubscriptionsProps {
  cards: SubscriptionCardModel[];
  loading: CellLoading;
}

function CancelledSubscriptions({ cards, loading }: CancelledSubscriptionsProps) {
  const b3Lang = useB3Lang();
  const [open, setOpen] = useState(false);

  if (cards.length === 0) {
    return null;
  }

  return (
    <Box>
      <Button
        variant="text"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        sx={{ px: 0 }}
      >
        {b3Lang('subscriptions.cancelled.toggle', { count: cards.length })}
      </Button>
      {/* unmountOnExit: collapsed cards leave the DOM rather than hiding at zero height. */}
      <Collapse in={open} unmountOnExit>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {cards.map((card) => (
            <SubscriptionCard
              key={card.publicId}
              card={card}
              variant="cancelled"
              loading={loading}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

export default CancelledSubscriptions;
