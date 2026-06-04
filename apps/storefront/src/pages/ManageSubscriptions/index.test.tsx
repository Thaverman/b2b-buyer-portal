import { fireEvent, renderWithProviders, screen, waitFor } from 'tests/test-utils';

import ManageSubscriptions from '.';

describe('ManageSubscriptions', () => {
  it('renders the iframe with the subscription manager URL pointing at the storefront origin', () => {
    renderWithProviders(<ManageSubscriptions setOpenPage={vi.fn()} />);

    const iframe = screen.getByTitle('Manage Subscriptions') as HTMLIFrameElement;

    expect(iframe).toBeInTheDocument();
    expect(iframe.src).toContain('/subscriptions?hideLayout=true');
  });

  it('shows the spinner until the iframe finishes loading', async () => {
    renderWithProviders(<ManageSubscriptions setOpenPage={vi.fn()} />);

    expect(screen.getByText(/Loading/)).toBeInTheDocument();

    fireEvent.load(screen.getByTitle('Manage Subscriptions'));

    await waitFor(() => {
      expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
    });
  });
});
