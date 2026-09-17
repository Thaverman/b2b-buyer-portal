import { ReactElement } from 'react';
import {
  builder,
  buildStoreInfoStateWith,
  faker,
  renderWithProviders,
  screen,
} from 'tests/test-utils';

import { SubscriptionCard as SubscriptionCardModel } from '../../viewModel';

import SkipDialog from './SkipDialog';

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  externalProductId: '9537_12118',
  product: {
    name: faker.commerce.productName(),
    imageUrl: null,
    detailUrl: null,
    sku: null,
  },
  quantity: 1,
  frequencyDays: 28,
  every: 4,
  everyPeriod: 2,
  nextOrderDate: '2026-10-03',
  nextOrder: { orderId: faker.string.hexadecimal({ length: 32, prefix: '' }), otherProducts: [] },
  shippingAddress: null,
  shippingAddressId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  payment: null,
  cancelledOn: null,
}));

// The store's date display format is blank by default; dates below render as "3 Oct 2026".
const withDateFormat = {
  preloadedState: { storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } }) },
};

// B3Dialog opens only on a re-render after its container ref exists: render closed, then open.
const renderOpen = (dialog: (isOpen: boolean) => ReactElement) => {
  const view = renderWithProviders(dialog(false), withDateFormat);
  view.result.rerender(dialog(true));

  return view;
};

it('says what leaves which order and when it comes back, then confirms', async () => {
  const onConfirm = vi.fn();
  const card = buildCardWith({
    product: { name: 'Kraft Paper Shopping Bags', imageUrl: null, detailUrl: null, sku: null },
    nextOrderDate: '2026-09-19',
    every: 10,
    everyPeriod: 3,
  });

  const { user } = renderOpen((isOpen) => (
    <SkipDialog
      card={card}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  expect(screen.getByRole('dialog')).toHaveTextContent(
    'Kraft Paper Shopping Bags will leave your order on 19 Sep 2026. Your next order will be on 19 Jul 2027.',
  );
  await user.click(screen.getByRole('button', { name: 'Skip' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it('falls back to the product id while the name is unknown', () => {
  const card = buildCardWith({ product: null, externalProductId: '1_2' });

  renderOpen((isOpen) => (
    <SkipDialog
      card={card}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('dialog')).toHaveTextContent('Product 1_2 will leave your order');
});

it('disables Skip while the write is pending and does not close on Cancel', async () => {
  const onClose = vi.fn();

  const { user } = renderOpen((isOpen) => (
    <SkipDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending
      onClose={onClose}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).not.toHaveBeenCalled();
});

it('closes on Cancel when idle', async () => {
  const onClose = vi.fn();

  const { user } = renderOpen((isOpen) => (
    <SkipDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending={false}
      onClose={onClose}
      onConfirm={vi.fn()}
    />
  ));

  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
