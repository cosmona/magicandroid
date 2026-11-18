// Groups and subgroups folded or open in a list, remembered between sessions (saved with the
// preferences): a drop-in for `useState<Set<string>>`.
import { useCallback, useMemo, useState } from 'react';
import { useAppState } from '@/context/AppState';

type SetAction = Set<string> | ((prev: Set<string>) => Set<string>);

export function useRememberedSet(key: string, initial: () => Set<string> = () => new Set()) {
  const { prefs, setPrefs } = useAppState();
  const [fallback] = useState(initial);
  const stored = prefs.openState?.[key];
  const value = useMemo(() => (stored ? new Set(stored) : fallback), [stored, fallback]);
  const set = useCallback(
    (action: SetAction) => {
      const next = typeof action === 'function' ? action(value) : action;
      setPrefs({ ...prefs, openState: { ...prefs.openState, [key]: [...next] } });
    },
    [value, prefs, setPrefs, key],
  );
  return [value, set] as const;
}
