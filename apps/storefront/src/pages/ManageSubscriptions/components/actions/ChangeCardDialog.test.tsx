import { ReactElement } from 'react';
import { renderWithProviders, screen } from 'tests/test-utils';

import { CardOption } from '@/shared/service/ssw/cardOptions';

import ChangeCardDialog from './ChangeCardDialog';

const visa: CardOption = {
  token: 'tok-a',
  brand: 'VISA',
  last4: '4242',
  expiry: '03/2028',
  isCurrent: true,
  paymentId: 'pay-a',
};
const amex: CardOption = {
  token: 'tok-b',
  brand: 'AMEX',
  last4: '1881',
  expiry: '11/2029',
  isCurrent: false,
  paymentId: null,
};

// B3Dialog opens only on a re-render after its container ref exists: render closed, then open.
const renderOpen = (dialog: (isOpen: boolean) => ReactElement) => {
  const view = renderWithProviders(dialog(false));
  view.result.rerender(dialog(true));

  return view;
};

it('lists the saved cards, marks the current one and saves the chosen one', async () => {
  const onConfirm = vi.fn();

  const { user } = renderOpen((isOpen) => (
    <ChangeCardDialog
      options={[visa, amex]}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  expect(
    screen.getByRole('radio', { name: 'VISA ending in 4242 · exp 03/2028 (current)' }),
  ).toBeChecked();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

  await user.click(screen.getByRole('radio', { name: 'AMEX ending in 1881 · exp 11/2029' }));
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(onConfirm).toHaveBeenCalledWith(amex);
});

it('explains itself when the only saved card is the one in use', async () => {
  const { user, navigation } = renderOpen((isOpen) => (
    <ChangeCardDialog
      options={[visa]}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('dialog')).toHaveTextContent('This is your only saved card.');
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  // /payment-methods is a portal route, so this navigates inside the SPA — the same pattern
  // DeleteSubscriptionWarning uses ("a button, not an anchor: internal router navigation").
  await user.click(screen.getByRole('button', { name: 'payment methods page' }));
  expect(navigation).toHaveBeenCalledWith('/payment-methods');
});

it('disables Save while the write is pending', () => {
  renderOpen((isOpen) => (
    <ChangeCardDialog
      options={[visa, amex]}
      isOpen={isOpen}
      isPending
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});
