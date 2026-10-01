import { builder, faker, renderWithProviders, screen } from 'tests/test-utils';

import { SubscriptionCard as SubscriptionCardModel } from '../../viewModel';

import QuantityFrequencySelects from './QuantityFrequencySelects';

const buildCardWith = builder<SubscriptionCardModel>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  externalProductId: '9537_12118',
  product: { name: faker.commerce.productName(), imageUrl: null, detailUrl: null, sku: null },
  quantity: 2,
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

type SelectsProps = Parameters<typeof QuantityFrequencySelects>[0];

// Explicit props with defaults, not a JSX spread: CLAUDE.md forbids new jsx-props-no-spreading violations.
const renderSelects = ({
  card = buildCardWith('WHATEVER_VALUES'),
  disabled = false,
  quantityPending = false,
  frequencyPending = false,
  onChangeQuantity = vi.fn(),
  onChangeFrequency = vi.fn(),
}: Partial<SelectsProps> = {}) =>
  renderWithProviders(
    <QuantityFrequencySelects
      card={card}
      disabled={disabled}
      quantityPending={quantityPending}
      frequencyPending={frequencyPending}
      onChangeQuantity={onChangeQuantity}
      onChangeFrequency={onChangeFrequency}
    />,
  );

// MUI names a select's combobox from its label and its shown value: "Quantity 2".
const quantity = () => screen.getByRole('combobox', { name: /^Quantity/ });
const frequency = () => screen.getByRole('combobox', { name: /^Frequency/ });

it("shows the card's quantity and schedule and saves a new quantity as soon as it is picked", async () => {
  const onChangeQuantity = vi.fn();
  const { user } = renderSelects({ onChangeQuantity });

  expect(quantity()).toHaveTextContent('2');
  expect(frequency()).toHaveTextContent('every 4 weeks');

  await user.click(quantity());
  expect(screen.getAllByRole('option')).toHaveLength(20);
  await user.click(screen.getByRole('option', { name: '3' }));

  expect(onChangeQuantity).toHaveBeenCalledWith(3);
});

it('saves a new frequency as the option the customer picked', async () => {
  const onChangeFrequency = vi.fn();
  const { user } = renderSelects({ onChangeFrequency });

  await user.click(frequency());
  await user.click(screen.getByRole('option', { name: 'every 6 weeks' }));

  expect(onChangeFrequency).toHaveBeenCalledWith({ every: 6, period: 2 });
});

it('offers a quantity above 20 and a schedule SSW does not sell, both selected', async () => {
  const { user } = renderSelects({
    card: buildCardWith({ quantity: 32, every: 10, everyPeriod: 3 }),
  });

  expect(quantity()).toHaveTextContent('32');
  expect(frequency()).toHaveTextContent('every 10 months');

  await user.click(quantity());
  const quantities = screen.getAllByRole('option');
  expect(quantities).toHaveLength(21);
  expect(quantities[20]).toHaveTextContent('32');
  expect(screen.getByRole('option', { name: '32' })).toHaveAttribute('aria-selected', 'true');
});

it('holds both selects while the row is busy and marks the one that is saving', () => {
  renderSelects({ disabled: true, quantityPending: true });

  expect(quantity()).toHaveAttribute('aria-disabled', 'true');
  expect(frequency()).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  expect(quantity().closest('.MuiFormControl-root')).toContainElement(
    screen.getByRole('progressbar'),
  );
});

it('marks the frequency select, and only it, when the frequency is the write in flight', () => {
  renderSelects({ disabled: true, frequencyPending: true });

  expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  expect(frequency().closest('.MuiFormControl-root')).toContainElement(
    screen.getByRole('progressbar'),
  );
});

it('stretches both selects to full width on a phone', () => {
  // The repo's mobile-test convention: useMobile() treats a body narrower than 769px as a phone.
  vi.spyOn(document.body, 'clientWidth', 'get').mockReturnValue(500);

  renderSelects();

  expect(quantity().closest('.MuiFormControl-root')).toHaveClass('MuiFormControl-fullWidth');
  expect(frequency().closest('.MuiFormControl-root')).toHaveClass('MuiFormControl-fullWidth');
});

it('leaves both selects at their natural width on a desktop', () => {
  renderSelects();

  expect(quantity().closest('.MuiFormControl-root')).not.toHaveClass('MuiFormControl-fullWidth');
  expect(frequency().closest('.MuiFormControl-root')).not.toHaveClass('MuiFormControl-fullWidth');
});
