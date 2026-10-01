import { ReactElement } from 'react';
import { builder, faker, renderWithProviders, screen, within } from 'tests/test-utils';

import { SubscriptionCard as SubscriptionCardModel } from '../../viewModel';

import CancelDialog from './CancelDialog';

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  externalProductId: '9537_12118',
  product: { name: faker.commerce.productName(), imageUrl: null, detailUrl: null, sku: null },
  quantity: 1,
  every: 4,
  everyPeriod: 2,
  nextOrderDate: '2026-10-03',
  nextOrder: { orderId: faker.string.hexadecimal({ length: 32, prefix: '' }), otherProducts: [] },
  shippingAddress: null,
  shippingAddressId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  payment: null,
  paymentId: 'pay-a',
  billingAddressId: 'addr-1',
  cancelledOn: null,
}));

// B3Dialog opens only on a re-render after its container ref exists: render closed, then open.
const renderOpen = (dialog: (isOpen: boolean) => ReactElement) => {
  const view = renderWithProviders(dialog(false));
  view.result.rerender(dialog(true));

  return view;
};

const dialog = (
  isOpen: boolean,
  {
    card = buildCardWith('WHATEVER_VALUES'),
    isPending = false,
    onClose = vi.fn(),
    onSkipInstead = vi.fn(),
    onConfirm = vi.fn(),
  }: Partial<Omit<Parameters<typeof CancelDialog>[0], 'isOpen'>> = {},
): ReactElement => (
  <CancelDialog
    card={card}
    isOpen={isOpen}
    isPending={isPending}
    onClose={onClose}
    onSkipInstead={onSkipInstead}
    onConfirm={onConfirm}
  />
);

it("sends the manager's no-survey value when no reason is chosen", async () => {
  const onConfirm = vi.fn();
  const { user } = renderOpen((isOpen) => dialog(isOpen, { onConfirm }));

  expect(screen.getByRole('dialog')).toHaveTextContent('Tell us why (optional)');
  expect(screen.getAllByRole('radio')).toHaveLength(8);
  expect(screen.getByRole('radio', { name: 'Other (please specify)' })).not.toBeChecked();

  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));

  expect(onConfirm).toHaveBeenCalledWith('114|Cancelled without exit survey response');
});

it('sends a listed reason with its canonical label', async () => {
  const onConfirm = vi.fn();
  const { user } = renderOpen((isOpen) => dialog(isOpen, { onConfirm }));

  await user.click(screen.getByRole('radio', { name: 'This product is too expensive' }));
  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));

  expect(onConfirm).toHaveBeenCalledWith('8 | This product is too expensive');
});

it('sends Other with the trimmed details', async () => {
  const onConfirm = vi.fn();
  const { user } = renderOpen((isOpen) => dialog(isOpen, { onConfirm }));

  expect(screen.queryByLabelText('Tell us more')).not.toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: 'Other (please specify)' }));
  await user.type(screen.getByLabelText('Tell us more'), '  Moving house  ');
  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));

  expect(onConfirm).toHaveBeenCalledWith('1 | Moving house');
});

it('sends the bare Other code when the details are blank', async () => {
  const onConfirm = vi.fn();
  const { user } = renderOpen((isOpen) => dialog(isOpen, { onConfirm }));

  await user.click(screen.getByRole('radio', { name: 'Other (please specify)' }));
  await user.type(screen.getByLabelText('Tell us more'), '   ');
  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));

  expect(onConfirm).toHaveBeenCalledWith('1');
});

it('offers to skip the next order instead, only while one is scheduled', async () => {
  const onSkipInstead = vi.fn();
  const { user } = renderOpen((isOpen) => dialog(isOpen, { onSkipInstead }));

  expect(screen.getByRole('dialog')).toHaveTextContent('Want to skip the next order instead?');
  await user.click(screen.getByRole('button', { name: 'Skip next order' }));
  expect(onSkipInstead).toHaveBeenCalledTimes(1);

  renderOpen((isOpen) =>
    dialog(isOpen, { card: buildCardWith({ nextOrder: null, nextOrderDate: null }) }),
  );
  const [, unscheduled] = screen.getAllByRole('dialog');
  expect(
    within(unscheduled).queryByRole('button', { name: 'Skip next order' }),
  ).not.toBeInTheDocument();
});

it('keeps the subscription from the left button and holds everything while pending', async () => {
  const onClose = vi.fn();
  const { user, result } = renderOpen((isOpen) => dialog(isOpen, { onClose }));

  await user.click(screen.getByRole('button', { name: 'Keep subscription' }));
  expect(onClose).toHaveBeenCalledTimes(1);

  result.rerender(dialog(true, { onClose, isPending: true }));
  expect(screen.getByRole('button', { name: 'Cancel subscription' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Skip next order' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Keep subscription' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('forgets the previous choice when reopened', async () => {
  const { user, result } = renderOpen((isOpen) => dialog(isOpen));

  await user.click(screen.getByRole('radio', { name: 'I stopped using this product' }));
  result.rerender(dialog(false));
  result.rerender(dialog(true));

  expect(screen.getByRole('radio', { name: 'I stopped using this product' })).not.toBeChecked();
});
