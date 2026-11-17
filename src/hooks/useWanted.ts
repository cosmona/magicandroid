// «La quiero»: which cards (and which printings of them) are marked, kept in sync across every
// screen that shows them. Each printing (edition + language + artwork) is marked on its own.
import { useEffect, useState } from 'react';
import type { Card } from '@/api/scryfall';
import { addWanted, getWantedIds, getWantedPrintings, removeWanted } from '@/db/database';
import type { SQLiteDatabase } from 'expo-sqlite';

const listeners = new Set<() => void>();

/** Tells every `useWantedIds` to reload (call after changing «La quiero» or after a sync). */
export function notifyWantedChanged() {
  for (const l of listeners) l();
}

/** Marks or unmarks this printing of `card` as «La quiero» (other printings are left as they are). */
export async function setWanted(db: SQLiteDatabase, card: Card, on: boolean) {
  if (on) await addWanted(db, card);
  else await removeWanted(db, card.id);
  notifyWantedChanged();
}

/** The oracle ids among `oracleIds` with some printing marked as «La quiero»; updates when any screen changes them. */
export function useWantedIds(db: SQLiteDatabase, oracleIds: string[]): Set<string> {
  return useWantedSet(db, oracleIds, getWantedIds);
}

/** The printings (Scryfall ids) among `scryfallIds` marked as «La quiero»; updates like `useWantedIds`. */
export function useWantedPrintings(db: SQLiteDatabase, scryfallIds: string[]): Set<string> {
  return useWantedSet(db, scryfallIds, getWantedPrintings);
}

function useWantedSet(db: SQLiteDatabase, ids: string[], load: (db: SQLiteDatabase, ids: string[]) => Promise<Set<string>>): Set<string> {
  const key = [...new Set(ids)].sort().join(',');
  const [state, setState] = useState<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(db, key ? key.split(',') : [])
      .then((found) => !cancelled && setState({ key, ids: found }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db, key, version, load]);

  return state.key === key ? state.ids : new Set();
}

/** A number that changes whenever «La quiero» changes anywhere (to reload lists that show it). */
export function useWantedVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return version;
}
