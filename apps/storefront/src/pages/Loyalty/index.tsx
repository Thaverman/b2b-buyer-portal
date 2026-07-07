import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { useAppSelector } from '@/store';

import { isLoyaltyAvailable } from './api';

function Loyalty() {
  const b3Lang = useB3Lang();
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  // The digest identifies the logged-in customer, so a masquerading rep must not see points here.
  const isAvailable = isLoyaltyAvailable() && !isAgenting;

  if (!isAvailable) {
    return (
      <Box>
        <Typography sx={{ mt: 2 }}>{b3Lang('loyalty.unavailable')}</Typography>
      </Box>
    );
  }

  return <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%' }} />;
}

export default Loyalty;
