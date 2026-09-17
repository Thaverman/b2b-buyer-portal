import { ReactElement } from 'react';
import dayjs from 'dayjs';
import {
  builder,
  buildStoreInfoStateWith,
  faker,
  fireEvent,
  renderWithProviders,
  screen,
} from 'tests/test-utils';

import { SubscriptionCard as SubscriptionCardModel } from '../../viewModel';

import ChangeDateDialog from './ChangeDateDialog';

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

// The store's date display format is blank by default; dates below render as "19 Jul 2027".
const withDateFormat = {
  preloadedState: { storeInfo: buildStoreInfoStateWith({ timeFormat: { display: 'j M Y' } }) },
};

// B3Dialog opens only on a re-render after its container ref exists: render closed, then open.
const renderOpen = (dialog: (isOpen: boolean) => ReactElement) => {
  const view = renderWithProviders(dialog(false), withDateFormat);
  view.result.rerender(dialog(true));

  return view;
};

it('offers three presets after the next order and saves the chosen one', async () => {
  const onConfirm = vi.fn();
  const card = buildCardWith({ nextOrderDate: '2026-09-19', every: 10, everyPeriod: 3 });

  const { user } = renderOpen((isOpen) => (
    <ChangeDateDialog
      card={card}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  // Role queries only: the testing-library lint rules forbid reaching for DOM nodes.
  expect(screen.getAllByRole('radio')).toHaveLength(4);
  expect(screen.getByRole('radio', { name: 'In 10 months (19 Jul 2027)' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'In 20 months (19 May 2028)' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'In 30 months (19 Mar 2029)' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Pick a date' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

  await user.click(screen.getByRole('radio', { name: 'In 20 months (19 May 2028)' }));
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(onConfirm).toHaveBeenCalledWith('2028-05-19');
});

it('labels week and day offsets in their own units', () => {
  const card = buildCardWith({ nextOrderDate: '2026-09-29', every: 2, everyPeriod: 2 });

  renderOpen((isOpen) => (
    <ChangeDateDialog
      card={card}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('radio', { name: 'In 2 weeks (13 Oct 2026)' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'In 6 weeks (10 Nov 2026)' })).toBeInTheDocument();
});

it('accepts a typed date only when it is after today', async () => {
  const onConfirm = vi.fn();
  const today = dayjs().format('YYYY-MM-DD');
  const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');

  const { user } = renderOpen((isOpen) => (
    <ChangeDateDialog
      card={buildCardWith('WHATEVER_VALUES')}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  await user.click(screen.getByRole('radio', { name: 'Pick a date' }));
  const input = screen.getByLabelText('Next order date');
  expect(input).toHaveAttribute('min', tomorrow);

  fireEvent.change(input, { target: { value: today } });
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.getByText('Choose a date after today.')).toBeInTheDocument();

  fireEvent.change(input, { target: { value: tomorrow } });
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(onConfirm).toHaveBeenCalledWith(tomorrow);
});

it('forgets the previous choice when reopened', async () => {
  const card = buildCardWith({ nextOrderDate: '2026-09-19', every: 10, everyPeriod: 3 });
  const dialog = (isOpen: boolean) => (
    <ChangeDateDialog
      card={card}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  );

  const { user, result } = renderOpen(dialog);
  await user.click(screen.getByRole('radio', { name: 'In 10 months (19 Jul 2027)' }));
  result.rerender(dialog(false));
  result.rerender(dialog(true));

  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.getByRole('radio', { name: 'In 10 months (19 Jul 2027)' })).not.toBeChecked();
});
