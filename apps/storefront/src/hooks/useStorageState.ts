import { Dispatch, useEffect, useState } from 'react';

import { safeLocalStorage, safeSessionStorage } from '@/utils/safeStorage';

export default function useStorageState<T>(
  key: string,
  initialState: T,
  storageType: 'local' | 'session' = 'local',
): [T, Dispatch<T>] {
  // Resolved here rather than passed in: reading `window.sessionStorage` in a caller's
  // argument list throws during render in browsers that block storage.
  const storage = storageType === 'session' ? safeSessionStorage : safeLocalStorage;

  const initialValue = () => {
    try {
      const item = storage.getItem(key);
      return item ? JSON.parse(item) : initialState;
    } catch (error) {
      // If parsing fails, return initial state
      return initialState;
    }
  };

  const [value, setValue] = useState(initialValue());

  // Update state and storage on change
  useEffect(() => {
    storage.setItem(key, JSON.stringify(value));
  }, [key, value, storage]);

  return [value, setValue];
}
