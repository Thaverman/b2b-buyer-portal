import { renderWithProviders, screen } from 'tests/test-utils';

import SubscriptionActions from './SubscriptionActions';

it('offers the order actions only while an order is scheduled, and always Change card and Cancel', () => {
  const { result } = renderWithProviders(
    <SubscriptionActions hasUpcomingOrder disabled={false} onOpen={vi.fn()} />,
  );

  expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
    'Skip',
    'Send now',
    'Change date',
    'Change card',
    'Cancel subscription',
  ]);

  result.rerender(
    <SubscriptionActions hasUpcomingOrder={false} disabled={false} onOpen={vi.fn()} />,
  );

  expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
    'Change card',
    'Cancel subscription',
  ]);
});

it('tells its owner which dialog to open', async () => {
  const onOpen = vi.fn();
  const { user } = renderWithProviders(
    <SubscriptionActions hasUpcomingOrder disabled={false} onOpen={onOpen} />,
  );

  await user.click(screen.getByRole('button', { name: 'Skip' }));
  await user.click(screen.getByRole('button', { name: 'Send now' }));
  await user.click(screen.getByRole('button', { name: 'Change date' }));
  await user.click(screen.getByRole('button', { name: 'Change card' }));
  await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));

  expect(onOpen.mock.calls.map(([dialog]) => dialog)).toEqual([
    'skip',
    'sendNow',
    'changeDate',
    'changeCard',
    'cancel',
  ]);
});

it('holds every button while a write is in flight', () => {
  renderWithProviders(<SubscriptionActions hasUpcomingOrder disabled onOpen={vi.fn()} />);

  screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
});
