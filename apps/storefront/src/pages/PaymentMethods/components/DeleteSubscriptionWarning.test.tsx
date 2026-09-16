import { builder, faker, renderWithProviders, screen } from 'tests/test-utils';

import { AffectedSubscription } from '../hooks/useSubscriptionsUsingInstrument';

import DeleteSubscriptionWarning from './DeleteSubscriptionWarning';

const buildAffectedSubscriptionWith = builder<AffectedSubscription>(() => ({
  publicId: faker.string.uuid(),
  productName: faker.commerce.productName(),
  frequencyDays: faker.helpers.arrayElement([7, 10, 14, 28, 30]),
}));

it('renders nothing when the card is clear', () => {
  const { result } = renderWithProviders(
    <DeleteSubscriptionWarning status="clear" subscriptions={[]} onManageSubscriptions={vi.fn()} />,
  );

  expect(result.container).toBeEmptyDOMElement();
});

it('announces that it is checking', () => {
  renderWithProviders(
    <DeleteSubscriptionWarning
      status="checking"
      subscriptions={[]}
      onManageSubscriptions={vi.fn()}
    />,
  );

  // A live region: the confirm button is disabled meanwhile, and assistive tech needs to know why.
  expect(screen.getByRole('status')).toHaveTextContent('Checking your subscriptions…');
});

it('discloses when the check failed', () => {
  renderWithProviders(
    <DeleteSubscriptionWarning
      status="failed"
      subscriptions={[]}
      onManageSubscriptions={vi.fn()}
    />,
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
        buildAffectedSubscriptionWith({
          productName: 'Kraft Paper Shopping Bags',
          frequencyDays: 28,
        }),
        buildAffectedSubscriptionWith({ productName: 'Tissue Paper', frequencyDays: 7 }),
        buildAffectedSubscriptionWith({ productName: 'Labels', frequencyDays: 1 }),
        buildAffectedSubscriptionWith({ productName: null, frequencyDays: 10 }),
      ]}
      onManageSubscriptions={onManage}
    />,
  );

  expect(screen.getByText('This card is used by 4 active subscriptions:')).toBeInTheDocument();
  expect(screen.getByText('Kraft Paper Shopping Bags — every 4 weeks')).toBeInTheDocument();
  expect(screen.getByText('Tissue Paper — every week')).toBeInTheDocument();
  expect(screen.getByText('Labels — every day')).toBeInTheDocument();
  expect(screen.getByText('Subscription — every 10 days')).toBeInTheDocument();
  expect(
    screen.getByText(
      "If you delete it, these subscriptions can't be charged at their next order. Change their payment method first.",
    ),
  ).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Manage subscriptions' }));

  expect(onManage).toHaveBeenCalledTimes(1);
});

it('uses the singular for one subscription', () => {
  renderWithProviders(
    <DeleteSubscriptionWarning
      status="affected"
      subscriptions={[buildAffectedSubscriptionWith('WHATEVER_VALUES')]}
      onManageSubscriptions={vi.fn()}
    />,
  );

  expect(screen.getByText('This card is used by 1 active subscription:')).toBeInTheDocument();
});

it('truncates the list after five entries', () => {
  renderWithProviders(
    <DeleteSubscriptionWarning
      status="affected"
      subscriptions={Array.from({ length: 14 }, () =>
        buildAffectedSubscriptionWith({
          productName: 'Kraft Paper Shopping Bags',
          frequencyDays: 28,
        }),
      )}
      onManageSubscriptions={vi.fn()}
    />,
  );

  expect(screen.getByText('This card is used by 14 active subscriptions:')).toBeInTheDocument();
  expect(screen.getAllByText('Kraft Paper Shopping Bags — every 4 weeks')).toHaveLength(5);
  expect(screen.getByText('and 9 more')).toBeInTheDocument();
});
