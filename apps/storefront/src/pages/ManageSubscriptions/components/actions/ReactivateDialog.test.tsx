import { ReactElement } from 'react';
import dayjs from 'dayjs';
import { builder, faker, fireEvent, renderWithProviders, screen } from 'tests/test-utils';

import { SubscriptionCard as SubscriptionCardModel } from '../../viewModel';

import ReactivateDialog from './ReactivateDialog';

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  externalProductId: '9537_12118',
  product: { name: 'Kraft Paper Shopping Bags', imageUrl: null, detailUrl: null, sku: null },
  quantity: 1,
  every: 4,
  everyPeriod: 2,
  nextOrderDate: null,
  nextOrder: null,
  shippingAddress: null,
  shippingAddressId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  payment: null,
  paymentId: 'pay-a',
  billingAddressId: 'addr-1',
  cancelledOn: '2026-08-01 10:00:00',
}));

const renderOpen = (dialog: (isOpen: boolean) => ReactElement) => {
  const view = renderWithProviders(dialog(false));
  view.result.rerender(dialog(true));

  return view;
};

const today = () => dayjs().format('YYYY-MM-DD');
const tomorrow = () => dayjs().add(1, 'day').format('YYYY-MM-DD');

it('names the product, preselects the old schedule, defaults to tomorrow and confirms', async () => {
  const onConfirm = vi.fn();
  const { user } = renderOpen((isOpen) => (
    <ReactivateDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  expect(screen.getByRole('dialog')).toHaveTextContent(
    "You'll receive Kraft Paper Shopping Bags again in an upcoming order.",
  );
  expect(screen.getByRole('combobox', { name: /^Frequency/ })).toHaveTextContent('every 4 weeks');
  const date = screen.getByLabelText('First order date');
  expect(date).toHaveValue(tomorrow());
  expect(date).toHaveAttribute('min', tomorrow());

  await user.click(screen.getByRole('button', { name: 'Reactivate' }));

  expect(onConfirm).toHaveBeenCalledWith({
    startDate: today(),
    every: 4,
    everyPeriod: 2,
    nextOrderDate: tomorrow(),
  });
});

it('lists a schedule SSW does not sell as the last option and keeps it selected', async () => {
  const { user } = renderOpen((isOpen) => (
    <ReactivateDialog
      card={buildCardWith({ every: 10, everyPeriod: 3 })}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('combobox', { name: /^Frequency/ })).toHaveTextContent('every 10 months');
  await user.click(screen.getByRole('combobox', { name: /^Frequency/ }));
  const options = screen.getAllByRole('option');
  expect(options).toHaveLength(14);
  expect(options[13]).toHaveTextContent('every 10 months');
  expect(options[0]).toHaveTextContent('every 2 days');
});

it('lets the customer pick another frequency', async () => {
  const onConfirm = vi.fn();
  const { user } = renderOpen((isOpen) => (
    <ReactivateDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  await user.click(screen.getByRole('combobox', { name: /^Frequency/ }));
  await user.click(screen.getByRole('option', { name: 'every 6 days' }));
  await user.click(screen.getByRole('button', { name: 'Reactivate' }));

  expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ every: 6, everyPeriod: 1 }));
});

it('refuses a first order date before the minimum', async () => {
  renderOpen((isOpen) => (
    <ReactivateDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));
  const date = screen.getByLabelText('First order date');

  fireEvent.change(date, { target: { value: today() } });
  expect(screen.getByRole('button', { name: 'Reactivate' })).toBeDisabled();
  expect(screen.getByText('Choose a date after today.')).toBeInTheDocument();

  fireEvent.change(date, { target: { value: dayjs().add(30, 'day').format('YYYY-MM-DD') } });
  expect(screen.getByRole('button', { name: 'Reactivate' })).toBeEnabled();
});

it('disables Reactivate while the write is pending', () => {
  renderOpen((isOpen) => (
    <ReactivateDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('button', { name: 'Reactivate' })).toBeDisabled();
});

it('forgets the previous choices when reopened', async () => {
  const dialog = (isOpen: boolean) => (
    <ReactivateDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  );
  const { user, result } = renderOpen(dialog);

  await user.click(screen.getByRole('combobox', { name: /^Frequency/ }));
  await user.click(screen.getByRole('option', { name: 'every 6 weeks' }));
  fireEvent.change(screen.getByLabelText('First order date'), {
    target: { value: dayjs().add(30, 'day').format('YYYY-MM-DD') },
  });
  result.rerender(dialog(false));
  result.rerender(dialog(true));

  expect(screen.getByRole('combobox', { name: /^Frequency/ })).toHaveTextContent('every 4 weeks');
  expect(screen.getByLabelText('First order date')).toHaveValue(tomorrow());
});
