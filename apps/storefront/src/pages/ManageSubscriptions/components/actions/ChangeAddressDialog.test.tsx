import { ReactElement } from 'react';
import { builder, faker, renderWithProviders, screen } from 'tests/test-utils';

import { BigCommerceStorefrontAPIBaseURL } from '@/utils/basicConfig';

import { AddressOption } from '../../viewModel';

import ChangeAddressDialog from './ChangeAddressDialog';

const buildOptionWith = builder<AddressOption>(() => ({
  publicId: faker.string.hexadecimal({ length: 32, prefix: '' }),
  summary: {
    name: faker.person.fullName(),
    company: null,
    line1: faker.location.streetAddress(),
    line2: null,
    locality: 'Springfield, IL 62701',
  },
  isCurrent: false,
}));

const renderOpen = (dialog: (isOpen: boolean) => ReactElement) => {
  const view = renderWithProviders(dialog(false));
  view.result.rerender(dialog(true));

  return view;
};

const home = buildOptionWith({
  summary: {
    name: 'Jane Doe',
    company: 'Acme Co',
    line1: '1 Main St',
    line2: null,
    locality: 'Springfield, IL 62701',
  },
  isCurrent: true,
});
const office = buildOptionWith({
  summary: {
    name: 'Jane Doe',
    company: null,
    line1: '2 Oak Ave',
    line2: 'Suite 4',
    locality: 'Springfield, IL 62702',
  },
});

it('preselects the current address and saves only once another one is chosen', async () => {
  const onConfirm = vi.fn();
  const { user } = renderOpen((isOpen) => (
    <ChangeAddressDialog
      options={[home, office]}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  ));

  expect(
    screen.getByRole('radio', { name: 'Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701' }),
  ).toBeChecked();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

  await user.click(
    screen.getByRole('radio', { name: 'Jane Doe, 2 Oak Ave, Suite 4, Springfield, IL 62702' }),
  );
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(onConfirm).toHaveBeenCalledWith(office.publicId);
});

it('points at the hosted manager for a new address, in the top window', () => {
  renderOpen((isOpen) => (
    <ChangeAddressDialog
      options={[home]}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  ));

  expect(screen.getByRole('dialog')).toHaveTextContent(
    'To add a new address, use the subscription manager.',
  );
  const link = screen.getByRole('link', { name: 'subscription manager' });
  expect(link).toHaveAttribute('href', `${BigCommerceStorefrontAPIBaseURL}/subscriptions`);
  expect(link).toHaveAttribute('target', '_top');
});

it('returns to the current address when reopened', async () => {
  const dialog = (isOpen: boolean) => (
    <ChangeAddressDialog
      options={[home, office]}
      isOpen={isOpen}
      isPending={false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  );
  const { user, result } = renderOpen(dialog);

  await user.click(
    screen.getByRole('radio', { name: 'Jane Doe, 2 Oak Ave, Suite 4, Springfield, IL 62702' }),
  );
  result.rerender(dialog(false));
  result.rerender(dialog(true));

  expect(
    screen.getByRole('radio', { name: 'Jane Doe, Acme Co, 1 Main St, Springfield, IL 62701' }),
  ).toBeChecked();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

it('disables Save while the write is pending', async () => {
  const dialog = (isOpen: boolean, isPending: boolean) => (
    <ChangeAddressDialog
      options={[home, office]}
      isOpen={isOpen}
      isPending={isPending}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />
  );
  const { user, result } = renderOpen((isOpen) => dialog(isOpen, false));

  // The current address is preselected, so Save is disabled before the write starts too:
  // choose another one first, or `isPending` would not be what holds the button down.
  await user.click(
    screen.getByRole('radio', { name: 'Jane Doe, 2 Oak Ave, Suite 4, Springfield, IL 62702' }),
  );
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

  result.rerender(dialog(true, true));
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});
