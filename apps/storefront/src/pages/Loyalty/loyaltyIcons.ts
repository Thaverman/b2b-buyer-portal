import {
  CardGiftcard,
  Instagram,
  LocalOffer,
  LocalShipping,
  MailOutline,
  Person,
  RateReview,
  Redeem,
  ShoppingBag,
  Star,
  SvgIconComponent,
} from '@mui/icons-material';

import { EarnRule, RedeemRule } from './api';

// Heuristic keyword match on the rule's human-facing and template fields, mirroring
// getSocialCompletionFlag in api.ts. Order matters: earlier checks win.
export const earnRuleIcon = (rule: EarnRule): SvgIconComponent => {
  const haystack = `${rule.templateName} ${rule.title} ${rule.socialUrl}`.toLowerCase();
  if (haystack.includes('instagram')) {
    return Instagram;
  }
  if (haystack.includes('purchase') || haystack.includes('order') || haystack.includes('spend')) {
    return ShoppingBag;
  }
  if (
    haystack.includes('mail') ||
    haystack.includes('newsletter') ||
    haystack.includes('subscribe')
  ) {
    return MailOutline;
  }
  if (
    haystack.includes('account') ||
    haystack.includes('sign up') ||
    haystack.includes('signup') ||
    haystack.includes('register')
  ) {
    return Person;
  }
  if (haystack.includes('review')) {
    return RateReview;
  }
  return Star;
};

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
