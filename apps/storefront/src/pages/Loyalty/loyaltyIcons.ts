import {
  CardGiftcard,
  LocalOffer,
  LocalShipping,
  Redeem,
  SvgIconComponent,
} from '@mui/icons-material';

import { RedeemRule } from './api';

export const redeemRuleIcon = (rule: RedeemRule): SvgIconComponent => {
  const haystack = `${rule.title} ${rule.redeemType}`.toLowerCase();
  if (haystack.includes('ship')) {
    return LocalShipping;
  }
  if (haystack.includes('gift')) {
    return Redeem;
  }
  if (
    haystack.includes('discount') ||
    haystack.includes('percent') ||
    haystack.includes('%') ||
    haystack.includes('off') ||
    haystack.includes('$')
  ) {
    return LocalOffer;
  }
  return CardGiftcard;
};
