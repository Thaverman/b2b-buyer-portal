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
} from '@mui/icons-material';
import { builder, faker } from 'tests/test-utils';

import { EarnRule, RedeemRule } from './api';
import { earnRuleIcon, redeemRuleIcon } from './loyaltyIcons';

const buildEarnRuleWith = builder<EarnRule>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productName(),
  summary: faker.lorem.sentence(),
  earnType: 'flat',
  templateName: '',
  socialUrl: '',
  earnValue: faker.number.int({ min: 1, max: 100 }),
  limitTiers: false,
  loyaltyTierIds: [],
}));

const buildRedeemRuleWith = builder<RedeemRule>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productName(),
  pointCost: faker.number.int({ min: 100, max: 1000 }),
  redeemType: '',
  status: 'active',
  minRedeemablePoints: null,
  maxRedeemablePoints: null,
}));

describe('earnRuleIcon', () => {
  it('maps an Instagram rule to the Instagram icon', () => {
    expect(earnRuleIcon(buildEarnRuleWith({ templateName: 'follow_on_instagram' }))).toBe(
      Instagram,
    );
  });

  it('maps a purchase rule to the ShoppingBag icon', () => {
    expect(earnRuleIcon(buildEarnRuleWith({ title: 'Make a purchase' }))).toBe(ShoppingBag);
  });

  it('maps an account rule to the Person icon', () => {
    expect(earnRuleIcon(buildEarnRuleWith({ title: 'Create an account' }))).toBe(Person);
  });

  it('maps a mailing-list rule to the MailOutline icon', () => {
    expect(earnRuleIcon(buildEarnRuleWith({ title: 'Sign up to our mailing list' }))).toBe(
      MailOutline,
    );
  });

  it('maps a review rule to the RateReview icon', () => {
    expect(earnRuleIcon(buildEarnRuleWith({ title: 'Write a product review' }))).toBe(RateReview);
  });

  it('falls back to the Star icon for an unrecognized rule', () => {
    expect(
      earnRuleIcon(buildEarnRuleWith({ title: 'Attend our event', templateName: 'xyz' })),
    ).toBe(Star);
  });
});

describe('redeemRuleIcon', () => {
  it('maps a free-shipping reward to the LocalShipping icon', () => {
    expect(redeemRuleIcon(buildRedeemRuleWith({ title: 'Free shipping' }))).toBe(LocalShipping);
  });

  it('maps a gift-card reward to the Redeem icon', () => {
    expect(redeemRuleIcon(buildRedeemRuleWith({ title: '$5 gift card' }))).toBe(Redeem);
  });

  it('maps a discount reward to the LocalOffer icon', () => {
    expect(redeemRuleIcon(buildRedeemRuleWith({ title: '10% discount' }))).toBe(LocalOffer);
  });

  it('falls back to the CardGiftcard icon for an unrecognized reward', () => {
    expect(redeemRuleIcon(buildRedeemRuleWith({ title: 'Mystery box', redeemType: '' }))).toBe(
      CardGiftcard,
    );
  });
});
