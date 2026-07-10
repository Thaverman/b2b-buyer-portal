import { render, screen } from 'tests/test-utils';

import SectionHeader from './SectionHeader';

it('renders its text as a level-2 heading', () => {
  render(<SectionHeader>Earn points</SectionHeader>);

  expect(screen.getByRole('heading', { level: 2, name: 'Earn points' })).toBeInTheDocument();
});
