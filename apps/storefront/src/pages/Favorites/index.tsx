import { Box, Typography } from '@mui/material';

import { useB3Lang } from '@/lib/lang';
import { useAppSelector } from '@/store';

import { isFavoritesAvailable } from './api';

function Favorites() {
  const b3Lang = useB3Lang();
  const isAgenting = useAppSelector(({ b2bFeatures }) => b2bFeatures.masqueradeCompany.isAgenting);
  // The storefront session cookie identifies the logged-in rep, so a masquerading rep must
  // not see or edit favorites here. Belt and braces with the route filter: gotoAllowedAppPage
  // checks the unfiltered routes array, so a programmatic push could still mount this page.
  const isAvailable = isFavoritesAvailable() && !isAgenting;

  if (!isAvailable) {
    return <Typography>{b3Lang('favorites.unavailable')}</Typography>;
  }

  // Task 8 renders the lists here.
  return <Box />;
}

export default Favorites;
