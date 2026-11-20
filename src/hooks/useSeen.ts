// Marcas locales (por dispositivo) de «visto por última vez» para las listas (mazos, colección, búsquedas
// guardadas), para que una lista que cambió desde la última vez que la miraste — sobre todo un cambio que
// llega por sync desde el otro dispositivo — pueda mostrar un badge «nuevo» hasta que la abras. Se guarda en
// una clave de settings que la sync nunca toca, así que «visto» es por dispositivo y nunca se comparte.
import { useSyncExternalStore } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';

const KEY = 'seenLists';

interface Store {
  since: number;
  seen: Record<string, number>;
  loaded: boolean;
}

let store: Store = { since: 0, seen: {}, loaded: false };
let db: SQLiteDatabase | null = null;
const subs = new Set<() => void>();

function emit() {
  subs.forEach((f) => f());
}

function persist() {
  if (!db) return;
  db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    KEY,
    JSON.stringify({ since: store.since, seen: store.seen }),
  ).catch(() => {});
}

/** Carga las marcas de «visto» una vez al arrancar (la primera ejecución toma todo como ya visto). */
export async function initSeen(database: SQLiteDatabase) {
  db = database;
  try {
    const row = await database.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', KEY);
    if (row?.value) {
      const s = JSON.parse(row.value) as { since?: number; seen?: Record<string, number> };
      store = { since: s.since ?? Date.now(), seen: s.seen ?? {}, loaded: true };
    } else {
      store = { since: Date.now(), seen: {}, loaded: true };
      persist();
    }
  } catch {
    store = { since: Date.now(), seen: {}, loaded: true };
  }
  emit();
}

export function markSeen(key: string, version: number | undefined) {
  if (!version) return;
  if ((store.seen[key] ?? 0) >= version) return;
  store = { ...store, seen: { ...store.seen, [key]: version } };
  emit();
  persist();
}

export function useSeen() {
  const snap = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => store,
  );
  return {
    isNew: (key: string, version: number | undefined) =>
      !!version && snap.loaded && version > Math.max(snap.since, snap.seen[key] ?? 0),
    markSeen,
  };
}
