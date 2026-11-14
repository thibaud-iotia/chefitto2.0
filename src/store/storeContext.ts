import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { AppActions, AppState, AppStore } from './appStore';

export const StoreContext = createContext<AppStore | null>(null);

export function useApp<T>(selector: (s: AppState & AppActions) => T): T {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useApp doit être utilisé dans <StoreProvider>');
  return useStore(store, selector);
}
