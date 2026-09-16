import { faker, renderWithProviders, screen } from 'tests/test-utils';

import { AffectedSubscription } from '../hooks/useSubscriptionsUsingInstrument';
import DeleteSubscriptionWarning from './DeleteSubscriptionWarning';

const affected = (overrides: Partial<AffectedSubscription> = {}): AffectedSubscription => ({
  publicId: faker.string.uuid(),
  productName: 'Kraft Paper Shopping Bags',
  frequencyDays: 28,
  ...overrides,
});

it('renders nothing when the card is clear', () => {
  const { result } = renderWithProviders(
    <DeleteSubscriptionWarning status="clear" subscriptions={[]} onManageSubscriptions={vi.fn()} />,
  );

  expect(result.container).toBeEmptyDOMElement();
});

it('says it is checking', () => {
  renderWithProviders(
    <DeleteSubscriptionWarning status="checking" subscriptions={[]} onManageSubscriptions={vi.fn()} />,
  );

  expect(screen.getByText('Checking your subscriptions…')).toBeInTheDocument();
});

it('discloses when the check failed', () => {
  renderWithProviders(
    <DeleteSubscriptionWarning status="failed" subscriptions={[]} onManageSubscriptions={vi.fn()} />,
  );

  expect(
    screen.getByText("We couldn't check whether any subscriptions use this card."),
  ).toBeInTheDocument();
});

it('lists the affected subscriptions with weekly or daily frequency and a manage link', async () => {
  const onManage = vi.fn();
  const { user } = renderWithProviders(
    <DeleteSubscriptionWarning
      status="affected"
      subscriptions={[
        affected({ productName: 'Kraft Paper Shopping Bags', frequencyDays: 28 }),
        affected({ productName: 'Tissue Paper', frequencyDays: 7 }),
        affected({ productName: null, frequencyDays: 10 }),
      ]}
      onManageSubscriptions={onManage}
    />,
  );

  expect(screen.getByText('This card is used by 3 active subscriptions:')).toBeInTheDocument();
  expect(screen.getByText('Kraft Paper Shopping Bags — every 4 weeks')).toBeInTheDocument();
  expect(screen.getByText('Tissue Paper — every week')).toBeInTheDocument();
  expect(screen.getByText('Subscription — every 10 days')).toBeInTheDocument();
  expect(
    screen.getByText(
      "If you delete it, these subscriptions can't be charged at their next order. Change their payment method first.",
    ),
  ).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Manage subscriptions' }));

  expect(onManage).toHaveBeenCalledTimes(1);
});

it('uses the singular and truncates the list after five entries', () => {
  renderWithProviders(
    <DeleteSubscriptionWarning
      status="affected"
      subscriptions={[affected()]}
      onManageSubscriptions={vi.fn()}
    />,
  );
  expect(screen.getByText('This card is used by 1 active subscription:')).toBeInTheDocument();

  renderWithProviders(
    <DeleteSubscriptionWarning
      status="affected"
      subscriptions={Array.from({ length: 14 }, () => affected())}
      onManageSubscriptions={vi.fn()}
    />,
  );
  expect(screen.getByText('This card is used by 14 active subscriptions:')).toBeInTheDocument();
  // five listed in the second render plus the single entry from the first, both still mounted
  expect(screen.getAllByText('Kraft Paper Shopping Bags — every 4 weeks')).toHaveLength(5 + 1);
  expect(screen.getByText('and 9 more')).toBeInTheDocument();
});
