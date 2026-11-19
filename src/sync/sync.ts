// Passing decks and collection between Magic Swipe on the PC and on the phone (pure DB code, the
// same file in both apps).
// - Sincronizar (supervised, see merge.ts): the phone sends its data, the PC shows every difference,
//   the user picks what stays, and each device applies its part. Before that, each one saves a copy
//   of its data (sync_backups) that can be restored.
// Advanced: one device is the origin and the other the destination.
// - Copiar: everything the origin has is copied into the destination. What both have (the same deck,
//   the same printing of the collection, the same «La quiero») takes the origin's version; whatever
//   only the destination has stays.
// - Mover: the same, and once the destination has saved it, the origin deletes what it sent.
// Decks are matched by their global id (`decks.uid`, DB v7).
import type { SQLiteDatabase } from 'expo-sqlite';

/** Bumped when the payload or the protocol changes; both apps must speak the same version. */
export const SYNC_VERSION = 6;

type Row = Record<string, string | number | null>;

/** Copiar leaves the origin as it was; Mover empties it after the destination saved everything. */
export type SyncMode = 'copy' | 'move';
/** Origin → destination. */
export type SyncDirection = 'toPc' | 'toPhone';

export interface SyncDeck {
  /** Raw `decks` row (uid, name, format, cover_image, created_at…). */
  deck: Row;
  /** `deck_cards` / `deck_sideboard` / `deck_maybe` rows without `deck_id`. */
  cards: Row[];
  side: Row[];
  maybe: Row[];
}

/** A saved search (Construir's filters with a name). Kept in the `settings` «prefs» JSON. */
export interface SavedSearch {
  name: string;
  filters: unknown;
  updatedAt?: number;
}

export interface SyncData {
  app: 'magicswipe';
  version: number;
  /** Device that made it ("PC" / "Android"), only for messages. */
  device: string;
  decks: SyncDeck[];
  /** Raw `collection_cards` rows (key: scryfall_id + place). */
  collection: Row[];
  /** Raw `wanted_cards` rows («La quiero», key: scryfall_id — one per printing since DB v10). */
  wanted: Row[];
  /** Raw `tags` rows (key: uid) and `card_tags` rows (key: tag_uid + oracle_id), DB v11. */
  tags: Row[];
  cardTags: Row[];
  /** Tags on decks (`deck_tags`: tag_uid + deck_uid), DB v13; missing from older apps. */
  deckTags?: Row[];
  /** Deletions (`sync_tombstones`: kind + key + deleted_at), to tell «deleted there» from «new here». */
  tombstones: Row[];
  /** Saved searches (from the `settings` «prefs» JSON); missing from older apps. */
  savedSearches?: SavedSearch[];
}

/**
 * What one device has to change after the review: rows to write (replacing what it has with the same
 * key) and keys to delete.
 */
export interface SyncPatch {
  decks: SyncDeck[];
  deleteDecks: string[];
  collection: Row[];
  /** `scryfall_id|place`. */
  deleteCollection: string[];
  wanted: Row[];
  /** scryfall_id. */
  deleteWanted: string[];
  tags: Row[];
  deleteTags: string[];
  cardTags: Row[];
  /** `tag_uid|oracle_id`. */
  deleteCardTags: string[];
  /** Tags on decks, and `tag_uid|deck_uid` to take off (missing in patches from older apps). */
  deckTags?: Row[];
  deleteDeckTags?: string[];
  /** The whole saved-searches list to write into «prefs» (missing = leave as is). */
  savedSearches?: SavedSearch[];
}

/** Answer of the PC to the phone's `poll` while the user reviews the differences. */
export type SyncReview =
  | { state: 'waiting' }
  | { state: 'equal' }
  | { state: 'cancelled' }
  | { state: 'ready'; patch: SyncPatch; pcSummary: string };

/** What the phone asks the PC (body of `POST /sync`). */
export type SyncRequest =
  | { version: number; op: 'offer'; data: SyncData } // phone → PC: compare with this, the user reviews on the PC
  | { version: number; op: 'poll' } // phone → PC: has the user decided? (SyncReview)
  | { version: number; op: 'applied'; error?: string } // phone → PC: the phone saved its part
  | { version: number; op: 'receive'; mode: SyncMode; data: SyncData } // phone → PC: save this
  | { version: number; op: 'send'; mode: SyncMode } // PC → phone: give me everything
  | { version: number; op: 'clear' }; // PC → phone, Mover: the phone saved it, delete it on the PC

export interface CopySummary {
  decksAdded: number;
  decksReplaced: number;
  /** Collection rows (printings) copied. */
  cards: number;
  /** «La quiero» rows copied. */
  wanted: number;
  /** Tags copied. */
  tags: number;
}

export const EMPTY_SUMMARY: CopySummary = { decksAdded: 0, decksReplaced: 0, cards: 0, wanted: 0, tags: 0 };

const withoutDeck = ({ deck_id: _ignored, ...rest }: Row) => rest;

export async function exportSyncData(db: SQLiteDatabase, device: string): Promise<SyncData> {
  const decks = await db.getAllAsync<Row>('SELECT * FROM decks WHERE uid IS NOT NULL');
  const out: SyncDeck[] = [];
  for (const deck of decks) {
    const cards = await db.getAllAsync<Row>('SELECT * FROM deck_cards WHERE deck_id = ?', deck.id);
    const side = await db.getAllAsync<Row>('SELECT * FROM deck_sideboard WHERE deck_id = ?', deck.id);
    const maybe = await db.getAllAsync<Row>('SELECT * FROM deck_maybe WHERE deck_id = ?', deck.id);
    const { id: _id, ...rest } = deck;
    out.push({ deck: rest, cards: cards.map(withoutDeck), side: side.map(withoutDeck), maybe: maybe.map(withoutDeck) });
  }
  return {
    app: 'magicswipe',
    version: SYNC_VERSION,
    device,
    decks: out,
    collection: await db.getAllAsync<Row>('SELECT * FROM collection_cards'),
    wanted: await db.getAllAsync<Row>('SELECT * FROM wanted_cards'),
    tags: await db.getAllAsync<Row>('SELECT * FROM tags'),
    cardTags: await db.getAllAsync<Row>('SELECT * FROM card_tags'),
    tombstones: await db.getAllAsync<Row>('SELECT * FROM sync_tombstones'),
    deckTags: await db.getAllAsync<Row>('SELECT * FROM deck_tags'),
    savedSearches: await readSavedSearches(db),
  };
}

/** The saved searches stored inside the `settings` «prefs» JSON. */
export async function readSavedSearches(db: SQLiteDatabase): Promise<SavedSearch[]> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'prefs'");
  try {
    const arr = (JSON.parse(row?.value ?? '{}') as { savedSearches?: SavedSearch[] }).savedSearches;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Replaces the saved searches inside the `settings` «prefs» JSON (other prefs untouched). */
export async function writeSavedSearches(db: SQLiteDatabase, searches: SavedSearch[]): Promise<void> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'prefs'");
  let prefs: Record<string, unknown> = {};
  try {
    prefs = JSON.parse(row?.value ?? '{}');
  } catch {
    prefs = {};
  }
  prefs.savedSearches = searches;
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES ('prefs', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    JSON.stringify(prefs),
  );
}

/** Throws a readable error if `data` isn't a payload this app understands. */
export function checkSyncData(data: unknown): asserts data is SyncData {
  const d = data as Partial<SyncData> | null;
  if (!d || d.app !== 'magicswipe') throw new Error('Los datos recibidos no son de Magic Swipe.');
  if (
    d.version !== SYNC_VERSION ||
    !Array.isArray(d.decks) ||
    !Array.isArray(d.collection) ||
    !Array.isArray(d.wanted) ||
    !Array.isArray(d.tags) ||
    !Array.isArray(d.cardTags) ||
    !Array.isArray(d.tombstones)
  ) {
    throw new Error('Las dos apps tienen versiones distintas de la sincronización: actualiza la más antigua.');
  }
}

/** Columns of a table, to copy only what this database has (rows may come from a newer app). */
async function columnsOf(db: SQLiteDatabase, table: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(rows.map((r) => r.name));
}

function insertRow(db: SQLiteDatabase, table: string, row: Row, cols: Set<string>, verb = 'INSERT OR REPLACE') {
  const keys = Object.keys(row).filter((k) => cols.has(k));
  return db.runAsync(
    `${verb} INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    ...keys.map((k) => row[k]),
  );
}

/**
 * Copies everything in `data` into the local database (the destination). A deck that already exists
 * here (same uid) is replaced by the origin's: name, format, cover, cards, sideboard and «Posibles».
 * Collection and «La quiero» rows take the origin's copies. Nothing that only exists here is touched.
 */
export async function copySyncData(db: SQLiteDatabase, data: SyncData): Promise<CopySummary> {
  checkSyncData(data);
  let summary = EMPTY_SUMMARY;
  await db.withTransactionAsync(async () => {
    summary = await writeRows(db, data);
  });
  return summary;
}

type Rows = Pick<SyncData, 'decks' | 'collection' | 'wanted' | 'tags' | 'cardTags' | 'deckTags'>;

/** Writes the rows (decks by uid replaced whole; other rows replace the one with the same key). No transaction. */
async function writeRows(db: SQLiteDatabase, data: Rows): Promise<CopySummary> {
  const summary = { ...EMPTY_SUMMARY };
  const deckCols = await columnsOf(db, 'decks');
  const cardCols = await columnsOf(db, 'deck_cards');
  const sideCols = await columnsOf(db, 'deck_sideboard');
  const maybeCols = await columnsOf(db, 'deck_maybe');
  const collCols = await columnsOf(db, 'collection_cards');
  const wantedCols = await columnsOf(db, 'wanted_cards');
  const tagCols = await columnsOf(db, 'tags');
  const cardTagCols = await columnsOf(db, 'card_tags');

  {
    for (const { deck, cards, side, maybe } of data.decks) {
      const local = await db.getFirstAsync<{ id: number }>('SELECT id FROM decks WHERE uid = ?', deck.uid);
      let id: number;
      if (local) {
        id = local.id;
        await db.runAsync('UPDATE decks SET name = ?, format = ?, cover_image = ? WHERE id = ?', deck.name, deck.format, deck.cover_image ?? null, id);
        await db.runAsync('DELETE FROM deck_cards WHERE deck_id = ?', id);
        await db.runAsync('DELETE FROM deck_sideboard WHERE deck_id = ?', id);
        await db.runAsync('DELETE FROM deck_maybe WHERE deck_id = ?', id);
        summary.decksReplaced++;
      } else {
        const { updated_at: _u, ...fields } = deck;
        id = (await insertRow(db, 'decks', fields, deckCols, 'INSERT')).lastInsertRowId;
        summary.decksAdded++;
      }
      for (const c of cards) await insertRow(db, 'deck_cards', { ...c, deck_id: id }, cardCols);
      for (const c of side) await insertRow(db, 'deck_sideboard', { ...c, deck_id: id }, sideCols);
      for (const c of maybe) await insertRow(db, 'deck_maybe', { ...c, deck_id: id }, maybeCols);
    }
    for (const row of data.collection) {
      await insertRow(db, 'collection_cards', row, collCols);
      summary.cards++;
    }
    for (const row of data.wanted) {
      await insertRow(db, 'wanted_cards', row, wantedCols);
      summary.wanted++;
    }
    for (const row of data.tags) {
      await insertRow(db, 'tags', row, tagCols);
      summary.tags++;
    }
    for (const row of data.cardTags) await insertRow(db, 'card_tags', row, cardTagCols);
    if (data.deckTags?.length) {
      const deckTagCols = await columnsOf(db, 'deck_tags');
      for (const row of data.deckTags) await insertRow(db, 'deck_tags', row, deckTagCols);
    }
  }
  return summary;
}

/** Applies what the review decided for this device: writes and deletions, all or nothing. */
export async function applyPatch(db: SQLiteDatabase, patch: SyncPatch): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const key of patch.deleteCardTags) {
      const [tag, oracle] = key.split('|');
      await db.runAsync('DELETE FROM card_tags WHERE tag_uid = ? AND oracle_id = ?', tag, oracle);
    }
    for (const key of patch.deleteDeckTags ?? []) {
      const [tag, deck] = key.split('|');
      await db.runAsync('DELETE FROM deck_tags WHERE tag_uid = ? AND deck_uid = ?', tag, deck);
    }
    for (const uid of patch.deleteDecks) await db.runAsync('DELETE FROM decks WHERE uid = ?', uid);
    for (const key of patch.deleteCollection) {
      const [id, place] = key.split('|');
      await db.runAsync('DELETE FROM collection_cards WHERE scryfall_id = ? AND place = ?', id, place);
    }
    for (const id of patch.deleteWanted) await db.runAsync('DELETE FROM wanted_cards WHERE scryfall_id = ?', id);
    for (const uid of patch.deleteTags) {
      await db.runAsync('DELETE FROM card_tags WHERE tag_uid = ?', uid);
      await db.runAsync('DELETE FROM deck_tags WHERE tag_uid = ?', uid);
      await db.runAsync('DELETE FROM tags WHERE uid = ?', uid);
    }
    await writeRows(db, patch);
    if (patch.savedSearches !== undefined) await writeSavedSearches(db, patch.savedSearches);
  });
}

// ---------- Copies from before a sync ----------

export interface SyncBackup {
  id: number;
  created_at: number;
  label: string;
}

const KEEP_BACKUPS = 3;

/** Saves everything this device has (the last few copies are kept). */
export async function saveBackup(db: SQLiteDatabase, label: string): Promise<void> {
  const data = await exportSyncData(db, 'backup');
  await db.runAsync('INSERT INTO sync_backups (created_at, label, data) VALUES (?, ?, ?)', Date.now(), label, JSON.stringify(data));
  await db.runAsync(
    `DELETE FROM sync_backups WHERE id NOT IN (SELECT id FROM sync_backups ORDER BY id DESC LIMIT ${KEEP_BACKUPS})`,
  );
}

export const listBackups = (db: SQLiteDatabase) =>
  db.getAllAsync<SyncBackup>('SELECT id, created_at, label FROM sync_backups ORDER BY id DESC');

/** Leaves decks, collection, «La quiero» and tags exactly as they were in that copy. */
export async function restoreBackup(db: SQLiteDatabase, id: number): Promise<void> {
  const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM sync_backups WHERE id = ?', id);
  if (!row) throw new Error('Esa copia ya no existe.');
  const data = JSON.parse(row.data) as SyncData;
  await db.withTransactionAsync(async () => {
    for (const table of ['deck_tags', 'card_tags', 'tags', 'wanted_cards', 'collection_cards', 'decks']) await db.runAsync(`DELETE FROM ${table}`);
    await db.runAsync('DELETE FROM sync_tombstones');
    await writeRows(db, data);
    for (const t of data.tombstones ?? []) {
      await db.runAsync('INSERT OR REPLACE INTO sync_tombstones (kind, key, deleted_at) VALUES (?, ?, ?)', t.kind, t.key, t.deleted_at);
    }
  });
}

/** Mover, on the origin once the destination saved everything: deletes what was sent. */
export async function clearSentData(db: SQLiteDatabase, sent: SyncData): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const { deck } of sent.decks) await db.runAsync('DELETE FROM decks WHERE uid = ?', deck.uid);
    for (const row of sent.collection) {
      await db.runAsync('DELETE FROM collection_cards WHERE scryfall_id = ? AND place = ?', row.scryfall_id, row.place);
    }
    for (const row of sent.wanted) await db.runAsync('DELETE FROM wanted_cards WHERE scryfall_id = ?', row.scryfall_id);
    for (const row of sent.cardTags) {
      await db.runAsync('DELETE FROM card_tags WHERE tag_uid = ? AND oracle_id = ?', row.tag_uid, row.oracle_id);
    }
    for (const row of sent.tags) await db.runAsync('DELETE FROM tags WHERE uid = ?', row.uid);
  });
}

/** "3 mazos nuevos, 1 mazo sustituido, 120 cartas de la colección, 4 de «La quiero»" — or nothing. */
export function describeSummary(s: CopySummary): string {
  const parts: string[] = [];
  if (s.decksAdded) parts.push(`${s.decksAdded} ${s.decksAdded === 1 ? 'mazo nuevo' : 'mazos nuevos'}`);
  if (s.decksReplaced) parts.push(`${s.decksReplaced} ${s.decksReplaced === 1 ? 'mazo sustituido' : 'mazos sustituidos'}`);
  if (s.cards) parts.push(`${s.cards} ${s.cards === 1 ? 'carta' : 'cartas'} de la colección`);
  if (s.wanted) parts.push(`${s.wanted} de «La quiero»`);
  if (s.tags) parts.push(`${s.tags} ${s.tags === 1 ? 'etiqueta' : 'etiquetas'}`);
  return parts.length ? parts.join(', ') : 'nada que copiar';
}

/** Contents of the PC's QR code: `magicswipe://sync?h=<ip>,<ip>&p=<port>&t=<code>`. */
export interface SyncTarget {
  hosts: string[];
  port: number;
  token: string;
}

export const syncUrl = (t: SyncTarget) => `magicswipe://sync?h=${t.hosts.join(',')}&p=${t.port}&t=${t.token}`;

export function parseSyncUrl(text: string): SyncTarget | null {
  const m = /^magicswipe:\/\/sync\?(.*)$/.exec(text.trim());
  if (!m) return null;
  const params = new Map(m[1].split('&').map((kv) => kv.split('=') as [string, string]));
  const hosts = (params.get('h') ?? '').split(',').filter(Boolean);
  const port = Number(params.get('p'));
  const token = params.get('t') ?? '';
  return hosts.length && port && token ? { hosts, port, token } : null;
}
