import type { SQLiteDatabase } from 'expo-sqlite';
import type { Card } from '@/api/scryfall';

export const DATABASE_NAME = 'magicswipe.db';
const DATABASE_VERSION = 1;

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
    (SELECT image_url FROM deck_cards WHERE deck_id = d.id ORDER BY added_at LIMIT 1) AS coverImage
  FROM decks d`;

export const getDecks = (db: SQLiteDatabase) =>
  db.getAllAsync<Deck>(`${DECK_SELECT} ORDER BY d.created_at DESC`);

export const getDeck = (db: SQLiteDatabase, id: number) =>
  db.getFirstAsync<Deck>(`${DECK_SELECT} WHERE d.id = ?`, id);

export async function createDeck(db: SQLiteDatabase, name: string, format: string | null) {
  const r = await db.runAsync(
    'INSERT INTO decks (name, format, created_at) VALUES (?, ?, ?)',
    name,
    format,
    Date.now(),
  );
  return r.lastInsertRowId;
}

export const renameDeck = (db: SQLiteDatabase, id: number, name: string) =>
  db.runAsync('UPDATE decks SET name = ? WHERE id = ?', name, id);

export const deleteDeck = (db: SQLiteDatabase, id: number) =>
  db.runAsync('DELETE FROM decks WHERE id = ?', id);

// ---------- Deck cards ----------

export interface DeckCard {
  oracleId: string;
  name: string;
  printedName: string | null;
  typeLine: string;
  manaCost: string | null;
  cmc: number;
  imageUrl: string | null;
  quantity: number;
}

export const getDeckCards = (db: SQLiteDatabase, deckId: number) =>
  db.getAllAsync<DeckCard>(
    `SELECT oracle_id AS oracleId, name, printed_name AS printedName, type_line AS typeLine,
            mana_cost AS manaCost, cmc, image_url AS imageUrl, quantity
     FROM deck_cards WHERE deck_id = ? ORDER BY cmc, name`,
    deckId,
  );

/** Max copies of a card allowed in a deck of `format`; Infinity for basic lands & similar. */
export function copyLimit(
  card: { typeLine: string; oracleText?: string },
  format: string | null,
): number {
  if (/\bBasic\b/.test(card.typeLine)) return Infinity;
  if (card.oracleText && /any number of cards named/i.test(card.oracleText)) return Infinity;
  return format === 'commander' ? 1 : 4;
}

export type AddResult = { added: true; quantity: number } | { added: false; limit: number };

/** Adds one copy of `card`, respecting the deck format's copy limit. */
export async function addCardToDeck(
  db: SQLiteDatabase,
  deckId: number,
  format: string | null,
  card: Card,
): Promise<AddResult> {
  const limit = copyLimit(card, format);
  const existing = await db.getFirstAsync<{ quantity: number }>(
    'SELECT quantity FROM deck_cards WHERE deck_id = ? AND oracle_id = ?',
    deckId,
    card.oracleId,
  );
  const current = existing?.quantity ?? 0;
  if (current >= limit) return { added: false, limit };

  if (existing) {
    await db.runAsync(
      'UPDATE deck_cards SET quantity = quantity + 1 WHERE deck_id = ? AND oracle_id = ?',
      deckId,
      card.oracleId,
    );
  } else {
    await db.runAsync(
      `INSERT INTO deck_cards (deck_id, oracle_id, scryfall_id, name, printed_name, type_line,
         mana_cost, cmc, image_url, quantity, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      deckId,
      card.oracleId,
      card.id,
      card.name,
      card.printedName,
      card.typeLine,
      card.manaCost,
      card.cmc,
      card.imageUrl,
      Date.now(),
    );
  }
  return { added: true, quantity: current + 1 };
}

/** Changes a card's quantity by `delta`; removes the row when it reaches 0. */
export async function changeQuantity(
  db: SQLiteDatabase,
  deckId: number,
  oracleId: string,
  delta: number,
) {
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

// ---------- Settings (key/value) ----------

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
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
