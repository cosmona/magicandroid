import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { DEFAULT_FILTERS, type Filters } from '@/api/scryfall';
import { getSetting, setSetting } from '@/db/database';

interface AppState {
  ready: boolean;
  activeDeckId: number | null;
  setActiveDeckId: (id: number | null) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
}

const AppStateContext = createContext<AppState | null>(null);

/** Global UI state (active deck + search filters), persisted in the SQLite `settings` table. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);
  const [activeDeckId, setActiveDeckIdState] = useState<number | null>(null);
  const [filters, setFiltersState] = useState<Filters>(DEFAULT_FILTERS);

  useEffect(() => {
    (async () => {
      const deck = await getSetting(db, 'activeDeckId');
      const savedFilters = await getSetting(db, 'filters');
      if (deck) setActiveDeckIdState(Number(deck));
      if (savedFilters) setFiltersState({ ...DEFAULT_FILTERS, ...JSON.parse(savedFilters) });
      setReady(true);
    })();
  }, [db]);

  const setActiveDeckId = useCallback(
    (id: number | null) => {
      setActiveDeckIdState(id);
      setSetting(db, 'activeDeckId', id === null ? null : String(id));
    },
    [db],
  );

  const setFilters = useCallback(
    (f: Filters) => {
      setFiltersState(f);
      setSetting(db, 'filters', JSON.stringify(f));
    },
    [db],
  );

  return (
    <AppStateContext.Provider value={{ ready, activeDeckId, setActiveDeckId, filters, setFilters }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
