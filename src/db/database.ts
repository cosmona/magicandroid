import type { SQLiteDatabase } from 'expo-sqlite';
import type { Card } from '@/api/scryfall';

export const DATABASE_NAME = 'magicswipe.db';
const DATABASE_VERSION = 5;

/** Runs on every app start (SQLiteProvider onInit). Schema changes = bump version + add a step. */
export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
      CREATE TABLE decks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        format TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE deck_cards (
        deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        oracle_id TEXT NOT NULL,
        scryfall_id TEXT NOT NULL,
        name TEXT NOT NULL,
        printed_name TEXT,
        type_line TEXT NOT NULL,
        mana_cost TEXT,
        cmc REAL NOT NULL DEFAULT 0,
        image_url TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (deck_id, oracle_id)
      );
      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    version = 1;
  }
  if (version === 1) {
    await db.execAsync(`
      ALTER TABLE decks ADD COLUMN cover_image TEXT;
      ALTER TABLE deck_cards ADD COLUMN oracle_text TEXT;
      ALTER TABLE deck_cards ADD COLUMN rarity TEXT;
    `);
    version = 2;
  }
  if (version === 2) {
    // Data for deck validation. Existing rows get NULLs and are backfilled from Scryfall
    // (`getCardsMissingData` + `updateCardData`) when the deck is opened.
    await db.execAsync(`
      ALTER TABLE deck_cards ADD COLUMN color_identity TEXT;
      ALTER TABLE deck_cards ADD COLUMN legalities TEXT;
      ALTER TABLE deck_cards ADD COLUMN is_commander INTEGER NOT NULL DEFAULT 0;
    `);
    version = 3;
  }
  if (version === 3) {
    // The user's own cards: one row per printing (edition + language), like a big deck.
    await db.execAsync(`
      CREATE TABLE collection_cards (
        scryfall_id TEXT PRIMARY KEY NOT NULL,
        oracle_id TEXT NOT NULL,
        name TEXT NOT NULL,
        printed_name TEXT,
        type_line TEXT NOT NULL,
        mana_cost TEXT,
        cmc REAL NOT NULL DEFAULT 0,
        image_url TEXT,
        rarity TEXT,
        set_code TEXT NOT NULL,
        lang TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        added_at INTEGER NOT NULL
      );
      CREATE INDEX collection_cards_oracle ON collection_cards (oracle_id);
    `);
    version = 4;
  }
  if (version === 4) {
    // Each deck's sideboard: same columns as deck_cards, its own table so a card can be in both.
    await db.execAsync(`
      CREATE TABLE deck_sideboard (
        deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        oracle_id TEXT NOT NULL,
        scryfall_id TEXT NOT NULL,
        name TEXT NOT NULL,
        printed_name TEXT,
        type_line TEXT NOT NULL,
        mana_cost TEXT,
        cmc REAL NOT NULL DEFAULT 0,
        image_url TEXT,
        oracle_text TEXT,
        rarity TEXT,
        color_identity TEXT,
        legalities TEXT,
        is_commander INTEGER NOT NULL DEFAULT 0,
        quantity INTEGER NOT NULL DEFAULT 1,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (deck_id, oracle_id)
      );
    `);
    version = 5;
  }
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

// ---------- Decks ----------

export interface Deck {
  id: number;
  name: string;
  format: string | null;
  cardCount: number;
  coverImage: string | null;
}

const DECK_SELECT = `
  SELECT d.id, d.name, d.format,
    COALESCE((SELECT SUM(quantity) FROM deck_cards WHERE deck_id = d.id), 0) AS cardCount,
    COALESCE(d.cover_image,
      (SELECT image_url FROM deck_cards WHERE deck_id = d.id ORDER BY added_at LIMIT 1)) AS coverImage
  FROM decks d`;

export const getDecks = (db: SQLiteDatabase) => db.getAllAsync<Deck>(`${DECK_SELECT} ORDER BY d.created_at DESC`);

export const getDeck = (db: SQLiteDatabase, id: number) => db.getFirstAsync<Deck>(`${DECK_SELECT} WHERE d.id = ?`, id);

export async function createDeck(db: SQLiteDatabase, name: string, format: string | null) {
  const r = await db.runAsync(
    'INSERT INTO decks (name, format, created_at) VALUES (?, ?, ?)',
    name,
    format,
    Date.now(),
  );
  return r.lastInsertRowId;
}

export const updateDeck = (db: SQLiteDatabase, id: number, name: string, format: string | null) =>
  db.runAsync('UPDATE decks SET name = ?, format = ? WHERE id = ?', name, format, id);

export const setDeckCover = (db: SQLiteDatabase, id: number, imageUrl: string | null) =>
  db.runAsync('UPDATE decks SET cover_image = ? WHERE id = ?', imageUrl, id);

/** Empties a deck (keeps the deck itself). */
/** Empties the deck: main deck and sideboard. */
export const clearDeck = (db: SQLiteDatabase, id: number) =>
  db.execAsync(
    `DELETE FROM deck_cards WHERE deck_id = ${Number(id)}; DELETE FROM deck_sideboard WHERE deck_id = ${Number(id)};`,
  );

export const deleteDeck = (db: SQLiteDatabase, id: number) => db.runAsync('DELETE FROM decks WHERE id = ?', id);

// ---------- Deck cards ----------

export interface DeckCard {
  oracleId: string;
  /** The printing (edition + language) that was added. */
  scryfallId: string;
  name: string;
  printedName: string | null;
  typeLine: string;
  manaCost: string | null;
  cmc: number;
  imageUrl: string | null;
  oracleText: string | null;
  rarity: string | null;
  quantity: number;
  /** Color identity letters, e.g. "WU"; "" = colorless; null = not loaded yet. */
  colorIdentity: string | null;
  /** JSON of Scryfall legalities; null = not loaded yet. */
  legalities: string | null;
  /** 1 = chosen as commander (Commander-style formats). */
  isCommander: number;
}

export const getDeckCards = (db: SQLiteDatabase, deckId: number) =>
  db.getAllAsync<DeckCard>(
    `SELECT oracle_id AS oracleId, scryfall_id AS scryfallId, name, printed_name AS printedName,
            type_line AS typeLine, mana_cost AS manaCost, cmc, image_url AS imageUrl,
            oracle_text AS oracleText, rarity, quantity, color_identity AS colorIdentity,
            legalities, is_commander AS isCommander
     FROM deck_cards WHERE deck_id = ? ORDER BY is_commander DESC, cmc, name`,
    deckId,
  );

/** Adds one copy of `card`. There is no limit here: rules are checked by `validateDeck`. */
export async function addCardToDeck(db: SQLiteDatabase, deckId: number, card: Card): Promise<number> {
  const existing = await db.getFirstAsync<{ quantity: number }>(
    'SELECT quantity FROM deck_cards WHERE deck_id = ? AND oracle_id = ?',
    deckId,
    card.oracleId,
  );
  if (existing) {
    await db.runAsync(
      'UPDATE deck_cards SET quantity = quantity + 1 WHERE deck_id = ? AND oracle_id = ?',
      deckId,
      card.oracleId,
    );
    return existing.quantity + 1;
  }
  await db.runAsync(
    `INSERT INTO deck_cards (deck_id, oracle_id, scryfall_id, name, printed_name, type_line,
       mana_cost, cmc, image_url, oracle_text, rarity, color_identity, legalities, quantity, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    deckId,
    card.oracleId,
    card.id,
    card.name,
    card.printedName,
    card.typeLine,
    card.manaCost,
    card.cmc,
    card.imageUrl,
    card.oracleText,
    card.rarity,
    card.colorIdentity.join(''),
    JSON.stringify(card.legalities),
    Date.now(),
  );
  return 1;
}

// ---------- Sideboard ----------

export const getSideboard = (db: SQLiteDatabase, deckId: number) =>
  db.getAllAsync<DeckCard>(
    `SELECT oracle_id AS oracleId, scryfall_id AS scryfallId, name, printed_name AS printedName,
            type_line AS typeLine, mana_cost AS manaCost, cmc, image_url AS imageUrl,
            oracle_text AS oracleText, rarity, quantity, color_identity AS colorIdentity,
            legalities, is_commander AS isCommander
     FROM deck_sideboard WHERE deck_id = ? ORDER BY cmc, name`,
    deckId,
  );

/** Adds `count` copies of `card` to the deck's sideboard. */
export const addCardToSideboard = (db: SQLiteDatabase, deckId: number, card: Card, count = 1) =>
  db.runAsync(
    `INSERT INTO deck_sideboard (deck_id, oracle_id, scryfall_id, name, printed_name, type_line,
       mana_cost, cmc, image_url, oracle_text, rarity, color_identity, legalities, quantity, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(deck_id, oracle_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
    deckId,
    card.oracleId,
    card.id,
    card.name,
    card.printedName,
    card.typeLine,
    card.manaCost,
    card.cmc,
    card.imageUrl,
    card.oracleText,
    card.rarity,
    card.colorIdentity.join(''),
    JSON.stringify(card.legalities),
    count,
    Date.now(),
  );

/** Changes a sideboard card's quantity by `delta`; removes it at 0. */
export async function changeSideboardQuantity(db: SQLiteDatabase, deckId: number, oracleId: string, delta: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE deck_sideboard SET quantity = quantity + ? WHERE deck_id = ? AND oracle_id = ?',
      delta,
      deckId,
      oracleId,
    );
    await db.runAsync('DELETE FROM deck_sideboard WHERE deck_id = ? AND quantity <= 0', deckId);
  });
}

/** Moves one copy between the main deck and the sideboard (`to`), keeping its printing. */
export async function moveCopy(db: SQLiteDatabase, deckId: number, oracleId: string, to: 'main' | 'side') {
  const [from, dest] = to === 'side' ? ['deck_cards', 'deck_sideboard'] : ['deck_sideboard', 'deck_cards'];
  await db.withTransactionAsync(async () => {
    const has = await db.getFirstAsync<{ quantity: number }>(
      `SELECT quantity FROM ${from} WHERE deck_id = ? AND oracle_id = ?`,
      deckId,
      oracleId,
    );
    if (!has) return;
    const there = await db.getFirstAsync<{ quantity: number }>(
      `SELECT quantity FROM ${dest} WHERE deck_id = ? AND oracle_id = ?`,
      deckId,
      oracleId,
    );
    if (there) {
      await db.runAsync(
        `UPDATE ${dest} SET quantity = quantity + 1 WHERE deck_id = ? AND oracle_id = ?`,
        deckId,
        oracleId,
      );
    } else {
      await db.runAsync(
        `INSERT INTO ${dest} (deck_id, oracle_id, scryfall_id, name, printed_name, type_line, mana_cost, cmc, image_url, oracle_text, rarity, color_identity, legalities, quantity, added_at)
         SELECT deck_id, oracle_id, scryfall_id, name, printed_name, type_line, mana_cost, cmc, image_url, oracle_text, rarity, color_identity, legalities, 1, ? FROM ${from} WHERE deck_id = ? AND oracle_id = ?`,
        Date.now(),
        deckId,
        oracleId,
      );
    }
    await db.runAsync(
      `UPDATE ${from} SET quantity = quantity - 1 WHERE deck_id = ? AND oracle_id = ?`,
      deckId,
      oracleId,
    );
    await db.runAsync(`DELETE FROM ${from} WHERE deck_id = ? AND quantity <= 0`, deckId);
  });
}

/** Marks/unmarks a card as (one of) the deck's commander(s). */
export const setCommander = (db: SQLiteDatabase, deckId: number, oracleId: string, on: boolean) =>
  db.runAsync(
    'UPDATE deck_cards SET is_commander = ? WHERE deck_id = ? AND oracle_id = ?',
    on ? 1 : 0,
    deckId,
    oracleId,
  );

/** Scryfall ids of cards added before validation data was stored (DB < v3). */
export const getCardsMissingData = (db: SQLiteDatabase, deckId: number) =>
  db.getAllAsync<{ scryfallId: string }>(
    `SELECT scryfall_id AS scryfallId FROM deck_cards
     WHERE deck_id = ? AND (legalities IS NULL OR color_identity IS NULL)`,
    deckId,
  );

/** Stores validation data (and fills older missing columns) for every row of that card. */
export const updateCardData = (db: SQLiteDatabase, card: Card) =>
  db.runAsync(
    `UPDATE deck_cards SET color_identity = ?, legalities = ?,
       oracle_text = COALESCE(oracle_text, ?), rarity = COALESCE(rarity, ?)
     WHERE oracle_id = ?`,
    card.colorIdentity.join(''),
    JSON.stringify(card.legalities),
    card.oracleText,
    card.rarity,
    card.oracleId,
  );

// ---------- Undo ----------

export type Row = Record<string, string | number | null>;

/** Raw rows of a deck (when `withDeck`) and its cards (or one card), to put back with `restoreSnapshot`. */
export interface DeckSnapshot {
  deck: Row | null;
  cards: Row[];
  /** Sideboard rows (whole-deck snapshots only). */
  side?: Row[];
}

export async function snapshotDeck(
  db: SQLiteDatabase,
  deckId: number,
  opts: { oracleId?: string; withDeck?: boolean } = {},
): Promise<DeckSnapshot> {
  const deck = opts.withDeck ? await db.getFirstAsync<Row>('SELECT * FROM decks WHERE id = ?', deckId) : null;
  const cards = opts.oracleId
    ? await db.getAllAsync<Row>('SELECT * FROM deck_cards WHERE deck_id = ? AND oracle_id = ?', deckId, opts.oracleId)
    : await db.getAllAsync<Row>('SELECT * FROM deck_cards WHERE deck_id = ?', deckId);
  const side = opts.oracleId ? [] : await db.getAllAsync<Row>('SELECT * FROM deck_sideboard WHERE deck_id = ?', deckId);
  return { deck, cards, side };
}

/** Puts the rows back as they were (same deck id, quantities, commander…). */
export async function restoreSnapshot(db: SQLiteDatabase, snap: DeckSnapshot): Promise<void> {
  const insert = (table: string, row: Row, verb: string) => {
    const cols = Object.keys(row);
    return db.runAsync(
      `${verb} INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      ...cols.map((c) => row[c]),
    );
  };
  await db.withTransactionAsync(async () => {
    if (snap.deck) await insert('decks', snap.deck, 'INSERT OR IGNORE');
    for (const card of snap.cards) await insert('deck_cards', card, 'INSERT OR REPLACE');
    for (const card of snap.side ?? []) await insert('deck_sideboard', card, 'INSERT OR REPLACE');
  });
}

/**
 * Swaps a deck card for another printing of it (other artwork / language): same oracle id, so
 * quantity and commander stay. A deck cover that showed the old printing follows it.
 */
export async function setDeckCardPrinting(db: SQLiteDatabase, deckId: number, oldImage: string | null, card: Card) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE deck_cards SET scryfall_id = ?, printed_name = ?, image_url = ?, rarity = ?
       WHERE deck_id = ? AND oracle_id = ?`,
      card.id,
      card.printedName,
      card.imageUrl,
      card.rarity,
      deckId,
      card.oracleId,
    );
    if (oldImage && card.imageUrl)
      await db.runAsync(
        'UPDATE decks SET cover_image = ? WHERE id = ? AND cover_image = ?',
        card.imageUrl,
        deckId,
        oldImage,
      );
  });
}

export const removeCardFromDeck = (db: SQLiteDatabase, deckId: number, oracleId: string) =>
  db.runAsync('DELETE FROM deck_cards WHERE deck_id = ? AND oracle_id = ?', deckId, oracleId);

/** Changes a card's quantity by `delta`; removes the row when it reaches 0. */
export async function changeQuantity(db: SQLiteDatabase, deckId: number, oracleId: string, delta: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE deck_cards SET quantity = quantity + ? WHERE deck_id = ? AND oracle_id = ?',
      delta,
      deckId,
      oracleId,
    );
    await db.runAsync('DELETE FROM deck_cards WHERE deck_id = ? AND quantity <= 0', deckId);
  });
}

// ---------- Collection ----------

export interface CollectionCard {
  scryfallId: string;
  oracleId: string;
  name: string;
  printedName: string | null;
  typeLine: string;
  manaCost: string | null;
  imageUrl: string | null;
  rarity: string | null;
  setCode: string;
  lang: string;
  quantity: number;
}

export const getCollection = (db: SQLiteDatabase) =>
  db.getAllAsync<CollectionCard>(
    `SELECT scryfall_id AS scryfallId, oracle_id AS oracleId, name, printed_name AS printedName,
            type_line AS typeLine, mana_cost AS manaCost, image_url AS imageUrl, rarity,
            set_code AS setCode, lang, quantity
     FROM collection_cards ORDER BY COALESCE(printed_name, name)`,
  );

/** Adds `count` copies of this exact printing to the collection; returns the new total. */
export async function addToCollection(db: SQLiteDatabase, card: Card, count = 1): Promise<number> {
  await db.runAsync(
    `INSERT INTO collection_cards (scryfall_id, oracle_id, name, printed_name, type_line, mana_cost,
       cmc, image_url, rarity, set_code, lang, quantity, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scryfall_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
    card.id,
    card.oracleId,
    card.name,
    card.printedName,
    card.typeLine,
    card.manaCost,
    card.cmc,
    card.imageUrl,
    card.rarity,
    card.set,
    card.lang,
    count,
    Date.now(),
  );
  const row = await db.getFirstAsync<{ quantity: number }>(
    'SELECT quantity FROM collection_cards WHERE scryfall_id = ?',
    card.id,
  );
  return row?.quantity ?? count;
}

/** Moves all copies of a collection printing to another printing of the same card (merging if owned). */
export async function changeCollectionPrinting(db: SQLiteDatabase, fromId: string, card: Card) {
  if (fromId === card.id) return;
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ quantity: number }>(
      'SELECT quantity FROM collection_cards WHERE scryfall_id = ?',
      fromId,
    );
    if (!row) return;
    await addToCollection(db, card, row.quantity);
    await db.runAsync('DELETE FROM collection_cards WHERE scryfall_id = ?', fromId);
  });
}

/** Changes a printing's quantity by `delta`; removes it at 0. */
export async function changeCollectionQuantity(db: SQLiteDatabase, scryfallId: string, delta: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE collection_cards SET quantity = quantity + ? WHERE scryfall_id = ?', delta, scryfallId);
    await db.runAsync('DELETE FROM collection_cards WHERE quantity <= 0');
  });
}

/** Raw collection row, to put back with `restoreCollectionRow` (undo). */
export const snapshotCollectionCard = (db: SQLiteDatabase, scryfallId: string) =>
  db.getFirstAsync<Row>('SELECT * FROM collection_cards WHERE scryfall_id = ?', scryfallId);

export async function restoreCollectionRow(db: SQLiteDatabase, row: Row): Promise<void> {
  const cols = Object.keys(row);
  await db.runAsync(
    `INSERT OR REPLACE INTO collection_cards (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    ...cols.map((c) => row[c]),
  );
}

export const removeFromCollection = (db: SQLiteDatabase, scryfallId: string) =>
  db.runAsync('DELETE FROM collection_cards WHERE scryfall_id = ?', scryfallId);

/** Oracle ids of every card in any deck (for the collection's "in a deck / free" filter). */
export async function getDeckOracleIds(db: SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ oracleId: string }>('SELECT DISTINCT oracle_id AS oracleId FROM deck_cards');
  return new Set(rows.map((r) => r.oracleId));
}

/** Copies owned of each card (any printing/language), by oracle id. */
export async function getOwnedCounts(db: SQLiteDatabase, oracleIds: string[]): Promise<Record<string, number>> {
  if (!oracleIds.length) return {};
  const rows = await db.getAllAsync<{ oracleId: string; owned: number }>(
    `SELECT oracle_id AS oracleId, SUM(quantity) AS owned FROM collection_cards
     WHERE oracle_id IN (${oracleIds.map(() => '?').join(',')}) GROUP BY oracle_id`,
    ...oracleIds,
  );
  return Object.fromEntries(rows.map((r) => [r.oracleId, r.owned]));
}

// ---------- Settings (key/value) ----------

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export const setSetting = (db: SQLiteDatabase, key: string, value: string | null) =>
  value === null
    ? db.runAsync('DELETE FROM settings WHERE key = ?', key)
    : db.runAsync(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        value,
      );
