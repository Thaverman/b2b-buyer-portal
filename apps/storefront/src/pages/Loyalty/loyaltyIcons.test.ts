import { CardGiftcard, LocalOffer, LocalShipping, Redeem } from '@mui/icons-material';
import { builder, faker } from 'tests/test-utils';

import { RedeemRule } from './api';
import { redeemRuleIcon } from './loyaltyIcons';

const buildRedeemRuleWith = builder<RedeemRule>(() => ({
  id: faker.string.uuid(),
  title: faker.commerce.productName(),
  pointCost: faker.number.int({ min: 100, max: 1000 }),
  redeemType: '',
  status: 'active',
  minRedeemablePoints: null,
  maxRedeemablePoints: null,
}));

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
