import { Tab, Tabs } from '@mui/material';

import { useB3Lang } from '@/lib/lang';

import { FavoriteList } from '../favorites';

interface ListTabsProps {
  lists: FavoriteList[];
  selectedId: number;
  onSelect: (listId: number) => void;
}

export default function ListTabs({ lists, selectedId, onSelect }: ListTabsProps) {
  const b3Lang = useB3Lang();

  return (
    <Tabs
      value={selectedId}
      onChange={(_, listId: number) => onSelect(listId)}
      variant="scrollable"
      allowScrollButtonsMobile
      sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
    >
      {lists.map((list) => (
        <Tab
          key={list.id}
          value={list.id}
          label={b3Lang('favorites.tabLabel', { name: list.name, count: list.items.length })}
        />
      ))}
    </Tabs>
  );
}
