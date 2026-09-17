import { ReactElement } from 'react';
import {
  builder,
  buildStoreInfoStateWith,
  faker,
  renderWithProviders,
  screen,
} from 'tests/test-utils';

import { SubscriptionCard as SubscriptionCardModel } from '../../viewModel';

import SendNowDialog from './SendNowDialog';

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

// The store's date display format is blank by default; dates render as "3 Oct 2026".
const withDateFormat = {
  preloadedState: { storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } }) },
};

// B3Dialog opens only on a re-render after its container ref exists: render closed, then open.
const renderOpen = (dialog: (isOpen: boolean) => ReactElement) => {
  const view = renderWithProviders(dialog(false), withDateFormat);
  view.result.rerender(dialog(true));

  return view;
};

it('names the card and lists the other products shipping in the same order', async () => {
  const onConfirm = vi.fn();
  const card = buildCardWith({
    payment: { brand: 'Visa', last4: '1111', expiry: '3/2028' },
    nextOrder: {
      orderId: 'o-1',
      otherProducts: [
        { externalProductId: '7674_9534', name: 'Kraft Bags' },
        { externalProductId: '1_2', name: null },
      ],
    },
  });

  const { user } = renderOpen((isOpen) => (
    <SendNowDialog
      card={card}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent(
    'Your order will be placed within 24 hours and charged to Visa ending in 1111 · exp 3/2028.',
  );
  expect(dialog).toHaveTextContent('This order also includes:');
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Kraft Bags',
    'Product 1_2',
  ]);
  await user.click(screen.getByRole('button', { name: 'Send now' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it('omits the card when the payment is unknown and the list when the subscription ships alone', () => {
  const card = buildCardWith({ payment: null, nextOrder: { orderId: 'o-1', otherProducts: [] } });

  renderOpen((isOpen) => (
    <SendNowDialog
      card={card}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('Your order will be placed within 24 hours.');
  expect(dialog).not.toHaveTextContent('charged to');
  expect(dialog).not.toHaveTextContent('This order also includes');
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

it('disables Send now while pending', () => {
  renderOpen((isOpen) => (
    <SendNowDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('button', { name: 'Send now' })).toBeDisabled();
});
