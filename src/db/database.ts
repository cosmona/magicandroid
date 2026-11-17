import type { SQLiteDatabase } from 'expo-sqlite';
import type { Card } from '@/api/scryfall';

export const DATABASE_NAME = 'magicswipe.db';
const DATABASE_VERSION = 12;

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
  if (version === 5) {
    // Two collections: paper (the cards you hold) and MTG Arena. Same printing can be in both,
    // so the key becomes (scryfall_id, place). Existing cards are paper.
    await db.execAsync(`
      CREATE TABLE collection_cards_v6 (
        scryfall_id TEXT NOT NULL,
        place TEXT NOT NULL DEFAULT 'paper',
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
        added_at INTEGER NOT NULL,
        PRIMARY KEY (scryfall_id, place)
      );
      INSERT INTO collection_cards_v6 (scryfall_id, place, oracle_id, name, printed_name, type_line, mana_cost, cmc,
        image_url, rarity, set_code, lang, quantity, added_at)
        SELECT scryfall_id, 'paper', oracle_id, name, printed_name, type_line, mana_cost, cmc, image_url, rarity,
          set_code, lang, quantity, added_at FROM collection_cards;
      DROP TABLE collection_cards;
      ALTER TABLE collection_cards_v6 RENAME TO collection_cards;
      CREATE INDEX collection_cards_oracle ON collection_cards (oracle_id, place);
    `);
    version = 6;
  }
  if (version === 6) {
    // Sync between devices (PC ⇄ phone): every deck gets a global id (uid) and a last-change time,
    // collection rows a last-change time, and deletions leave a tombstone. Triggers keep them
    // up to date, so the rest of the queries don't need to know about sync.
    const NOW = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
    await db.execAsync(`
      ALTER TABLE decks ADD COLUMN uid TEXT;
      ALTER TABLE decks ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
      UPDATE decks SET uid = lower(hex(randomblob(16))), updated_at = created_at;
      CREATE UNIQUE INDEX decks_uid ON decks (uid);
      ALTER TABLE collection_cards ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
      UPDATE collection_cards SET updated_at = added_at;
      CREATE TABLE sync_tombstones (
        kind TEXT NOT NULL,
        key TEXT NOT NULL,
        deleted_at INTEGER NOT NULL,
        PRIMARY KEY (kind, key)
      );

      CREATE TRIGGER decks_ai AFTER INSERT ON decks BEGIN
        UPDATE decks SET uid = COALESCE(NEW.uid, lower(hex(randomblob(16)))), updated_at = ${NOW} WHERE id = NEW.id;
        DELETE FROM sync_tombstones WHERE kind = 'deck' AND key = (SELECT uid FROM decks WHERE id = NEW.id);
      END;
      CREATE TRIGGER decks_au AFTER UPDATE OF name, format, cover_image ON decks BEGIN
        UPDATE decks SET updated_at = ${NOW} WHERE id = NEW.id;
      END;
      CREATE TRIGGER decks_ad AFTER DELETE ON decks WHEN OLD.uid IS NOT NULL BEGIN
        INSERT OR REPLACE INTO sync_tombstones (kind, key, deleted_at) VALUES ('deck', OLD.uid, ${NOW});
      END;

      CREATE TRIGGER deck_cards_ai AFTER INSERT ON deck_cards BEGIN
        UPDATE decks SET updated_at = ${NOW} WHERE id = NEW.deck_id;
      END;
      CREATE TRIGGER deck_cards_au AFTER UPDATE ON deck_cards BEGIN
        UPDATE decks SET updated_at = ${NOW} WHERE id = NEW.deck_id;
      END;
      CREATE TRIGGER deck_cards_ad AFTER DELETE ON deck_cards BEGIN
        UPDATE decks SET updated_at = ${NOW} WHERE id = OLD.deck_id;
      END;
      CREATE TRIGGER deck_sideboard_ai AFTER INSERT ON deck_sideboard BEGIN
        UPDATE decks SET updated_at = ${NOW} WHERE id = NEW.deck_id;
      END;
      CREATE TRIGGER deck_sideboard_au AFTER UPDATE ON deck_sideboard BEGIN
        UPDATE decks SET updated_at = ${NOW} WHERE id = NEW.deck_id;
      END;
      CREATE TRIGGER deck_sideboard_ad AFTER DELETE ON deck_sideboard BEGIN
        UPDATE decks SET updated_at = ${NOW} WHERE id = OLD.deck_id;
      END;

      CREATE TRIGGER collection_ai AFTER INSERT ON collection_cards BEGIN
        UPDATE collection_cards SET updated_at = ${NOW} WHERE scryfall_id = NEW.scryfall_id AND place = NEW.place;
        DELETE FROM sync_tombstones WHERE kind = 'card' AND key = NEW.scryfall_id || '|' || NEW.place;
      END;
      CREATE TRIGGER collection_au AFTER UPDATE OF scryfall_id, place, quantity, oracle_id, name, printed_name,
        type_line, mana_cost, cmc, image_url, rarity, set_code, lang ON collection_cards BEGIN
        UPDATE collection_cards SET updated_at = ${NOW} WHERE scryfall_id = NEW.scryfall_id AND place = NEW.place;
        INSERT OR REPLACE INTO sync_tombstones (kind, key, deleted_at)
          SELECT 'card', OLD.scryfall_id || '|' || OLD.place, ${NOW}
          WHERE OLD.scryfall_id <> NEW.scryfall_id OR OLD.place <> NEW.place;
      END;
      CREATE TRIGGER collection_ad AFTER DELETE ON collection_cards BEGIN
        INSERT OR REPLACE INTO sync_tombstones (kind, key, deleted_at)
          VALUES ('card', OLD.scryfall_id || '|' || OLD.place, ${NOW});
      END;
    `);
    version = 7;
  }
  if (version === 7) {
    // The MTG Arena collection was dropped: only the paper one is left. (The `place` column stays,
    // always 'paper'.) The delete triggers leave tombstones, so a synced device drops them too.
    await db.execAsync("DELETE FROM collection_cards WHERE place = 'arena';");
    version = 8;
  }
  if (version === 8) {
    // "Posibles": per deck, cards set aside to try (like a sideboard that isn't the game's one).
    // "La quiero": cards the user wants to get, one row per card (oracle id), shown in the collection.
    const NOW = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
    await db.execAsync(`
      CREATE TABLE deck_maybe (
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
      CREATE TRIGGER deck_maybe_ai AFTER INSERT ON deck_maybe BEGIN
        UPDATE decks SET updated_at = ${NOW} WHERE id = NEW.deck_id;
      END;
      CREATE TRIGGER deck_maybe_au AFTER UPDATE ON deck_maybe BEGIN
        UPDATE decks SET updated_at = ${NOW} WHERE id = NEW.deck_id;
      END;
      CREATE TRIGGER deck_maybe_ad AFTER DELETE ON deck_maybe BEGIN
        UPDATE decks SET updated_at = ${NOW} WHERE id = OLD.deck_id;
      END;

      CREATE TABLE wanted_cards (
        oracle_id TEXT PRIMARY KEY NOT NULL,
        scryfall_id TEXT NOT NULL,
        name TEXT NOT NULL,
        printed_name TEXT,
        type_line TEXT NOT NULL,
        mana_cost TEXT,
        cmc REAL NOT NULL DEFAULT 0,
        image_url TEXT,
        rarity TEXT,
        set_code TEXT NOT NULL,
        lang TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TRIGGER wanted_ai AFTER INSERT ON wanted_cards BEGIN
        UPDATE wanted_cards SET updated_at = ${NOW} WHERE oracle_id = NEW.oracle_id;
        DELETE FROM sync_tombstones WHERE kind = 'want' AND key = NEW.oracle_id;
      END;
      CREATE TRIGGER wanted_au AFTER UPDATE OF scryfall_id, name, printed_name, type_line, mana_cost, cmc, image_url,
        rarity, set_code, lang ON wanted_cards BEGIN
        UPDATE wanted_cards SET updated_at = ${NOW} WHERE oracle_id = NEW.oracle_id;
      END;
      CREATE TRIGGER wanted_ad AFTER DELETE ON wanted_cards BEGIN
        INSERT OR REPLACE INTO sync_tombstones (kind, key, deleted_at) VALUES ('want', OLD.oracle_id, ${NOW});
      END;
    `);
    version = 9;
  }
  if (version === 9) {
    // «La quiero» per printing (edition + language + artwork): the key goes from the card (oracle_id)
    // to the printing (scryfall_id), so several printings of one card can be wanted. Existing marks
    // keep the printing they were made on. (Dropping the old table drops its triggers too.)
    const NOW = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
    await db.execAsync(`
      CREATE TABLE wanted_cards_v10 (
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
        added_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO wanted_cards_v10 (scryfall_id, oracle_id, name, printed_name, type_line, mana_cost, cmc, image_url, rarity, set_code, lang, added_at, updated_at)
        SELECT scryfall_id, oracle_id, name, printed_name, type_line, mana_cost, cmc, image_url, rarity, set_code, lang, added_at, updated_at FROM wanted_cards;
      DROP TABLE wanted_cards;
      ALTER TABLE wanted_cards_v10 RENAME TO wanted_cards;
      CREATE INDEX wanted_cards_oracle ON wanted_cards (oracle_id);
      DELETE FROM sync_tombstones WHERE kind = 'want';
      CREATE TRIGGER wanted_ai AFTER INSERT ON wanted_cards BEGIN
        UPDATE wanted_cards SET updated_at = ${NOW} WHERE scryfall_id = NEW.scryfall_id;
        DELETE FROM sync_tombstones WHERE kind = 'want' AND key = NEW.scryfall_id;
      END;
      CREATE TRIGGER wanted_au AFTER UPDATE OF oracle_id, name, printed_name, type_line, mana_cost, cmc, image_url,
        rarity, set_code, lang ON wanted_cards BEGIN
        UPDATE wanted_cards SET updated_at = ${NOW} WHERE scryfall_id = NEW.scryfall_id;
      END;
      CREATE TRIGGER wanted_ad AFTER DELETE ON wanted_cards BEGIN
        INSERT OR REPLACE INTO sync_tombstones (kind, key, deleted_at) VALUES ('want', OLD.scryfall_id, ${NOW});
      END;
    `);
    version = 10;
  }
  if (version === 10) {
    // Tags the user defines (text, color and icon) and which cards (by oracle id, every printing)
    // carry them. Global ids (uid) so they travel between devices.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS tags (
        uid TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        icon TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS card_tags (
        tag_uid TEXT NOT NULL,
        oracle_id TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (tag_uid, oracle_id)
      );
      CREATE INDEX IF NOT EXISTS card_tags_oracle ON card_tags (oracle_id);
    `);
    version = 11;
  }
  if (version === 11) {
    // Supervised sync: tags get a last-change time, deleted tags and tag marks leave a tombstone (like
    // decks and the collection), and each device keeps copies of its data from before a sync.
    const NOW = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
    await db.execAsync(`
      ALTER TABLE tags ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
      UPDATE tags SET updated_at = created_at;
      CREATE TRIGGER tags_ai AFTER INSERT ON tags BEGIN
        UPDATE tags SET updated_at = ${NOW} WHERE uid = NEW.uid;
        DELETE FROM sync_tombstones WHERE kind = 'tag' AND key = NEW.uid;
      END;
      CREATE TRIGGER tags_au AFTER UPDATE OF name, color, icon ON tags BEGIN
        UPDATE tags SET updated_at = ${NOW} WHERE uid = NEW.uid;
      END;
      CREATE TRIGGER tags_ad AFTER DELETE ON tags BEGIN
        INSERT OR REPLACE INTO sync_tombstones (kind, key, deleted_at) VALUES ('tag', OLD.uid, ${NOW});
      END;
      CREATE TRIGGER card_tags_ai AFTER INSERT ON card_tags BEGIN
        DELETE FROM sync_tombstones WHERE kind = 'cardTag' AND key = NEW.tag_uid || '|' || NEW.oracle_id;
      END;
      CREATE TRIGGER card_tags_ad AFTER DELETE ON card_tags BEGIN
        INSERT OR REPLACE INTO sync_tombstones (kind, key, deleted_at)
          VALUES ('cardTag', OLD.tag_uid || '|' || OLD.oracle_id, ${NOW});
      END;
      CREATE TABLE IF NOT EXISTS sync_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        label TEXT NOT NULL,
        data TEXT NOT NULL
      );
    `);
    version = 12;
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

/** Empties the deck: main deck, sideboard and «Posibles» (keeps the deck itself). */
export const clearDeck = (db: SQLiteDatabase, id: number) =>
  db.execAsync(
    `DELETE FROM deck_cards WHERE deck_id = ${Number(id)}; DELETE FROM deck_sideboard WHERE deck_id = ${Number(id)};
     DELETE FROM deck_maybe WHERE deck_id = ${Number(id)};`,
  );

export const deleteDeck = (db: SQLiteDatabase, id: number) => db.runAsync('DELETE FROM decks WHERE id = ?', id);

const ZONE_COLUMNS =
  'oracle_id, scryfall_id, name, printed_name, type_line, mana_cost, cmc, image_url, oracle_text, rarity, color_identity, legalities, is_commander, quantity, added_at';

/** Copies a deck (name, format, cover, cards, sideboard and «Posibles») as a new deck; returns its id. */
export async function duplicateDeck(db: SQLiteDatabase, id: number, name: string): Promise<number> {
  let newId = 0;
  await db.withTransactionAsync(async () => {
    const r = await db.runAsync(
      'INSERT INTO decks (name, format, cover_image, created_at) SELECT ?, format, cover_image, ? FROM decks WHERE id = ?',
      name,
      Date.now(),
      id,
    );
    newId = r.lastInsertRowId;
    for (const table of ['deck_cards', 'deck_sideboard', 'deck_maybe']) {
      await db.runAsync(
        `INSERT INTO ${table} (deck_id, ${ZONE_COLUMNS}) SELECT ?, ${ZONE_COLUMNS} FROM ${table} WHERE deck_id = ?`,
        newId,
        id,
      );
    }
  });
  return newId;
}

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

/** Where a card of a deck sits: main deck, sideboard or «Posibles» (cards set aside to try). */
export type Zone = 'main' | 'side' | 'maybe';
const ZONE_TABLE: Record<Zone, string> = { main: 'deck_cards', side: 'deck_sideboard', maybe: 'deck_maybe' };

/** The deck's «Posibles»: not counted in size, validation, stats or price. */
export const getMaybe = (db: SQLiteDatabase, deckId: number) =>
  db.getAllAsync<DeckCard>(
    `SELECT oracle_id AS oracleId, scryfall_id AS scryfallId, name, printed_name AS printedName,
            type_line AS typeLine, mana_cost AS manaCost, cmc, image_url AS imageUrl,
            oracle_text AS oracleText, rarity, quantity, color_identity AS colorIdentity,
            legalities, is_commander AS isCommander
     FROM deck_maybe WHERE deck_id = ? ORDER BY cmc, name`,
    deckId,
  );

/** Adds `count` copies of `card` to the deck's «Posibles». */
export const addCardToMaybe = (db: SQLiteDatabase, deckId: number, card: Card, count = 1) =>
  db.runAsync(
    `INSERT INTO deck_maybe (deck_id, oracle_id, scryfall_id, name, printed_name, type_line,
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

/** Changes a «Posibles» card's quantity by `delta`; removes it at 0. */
export async function changeMaybeQuantity(db: SQLiteDatabase, deckId: number, oracleId: string, delta: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE deck_maybe SET quantity = quantity + ? WHERE deck_id = ? AND oracle_id = ?', delta, deckId, oracleId);
    await db.runAsync('DELETE FROM deck_maybe WHERE deck_id = ? AND quantity <= 0', deckId);
  });
}

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

/**
 * Moves one copy of a card from one zone of the deck to another (`fromZone` defaults to the main deck, or to the
 * sideboard when moving to the main deck), keeping its printing.
 */
export async function moveCopy(
  db: SQLiteDatabase,
  deckId: number,
  oracleId: string,
  to: Zone,
  fromZone: Zone = to === 'main' ? 'side' : 'main',
) {
  if (fromZone === to) return;
  const from = ZONE_TABLE[fromZone];
  const dest = ZONE_TABLE[to];
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
  /** Sideboard and «Posibles» rows (whole-deck snapshots only). */
  side?: Row[];
  maybe?: Row[];
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
  const maybe = opts.oracleId ? [] : await db.getAllAsync<Row>('SELECT * FROM deck_maybe WHERE deck_id = ?', deckId);
  return { deck, cards, side, maybe };
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
    for (const card of snap.maybe ?? []) await insert('deck_maybe', card, 'INSERT OR REPLACE');
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

/**
 * Swaps cards of a deck (main deck, sideboard and «Posibles») to other printings of them, e.g. the
 * same cards in another language; the cover follows its card.
 */
export async function setDeckPrintings(db: SQLiteDatabase, deckId: number, swaps: { oldImage: string | null; card: Card }[]) {
  await db.withTransactionAsync(async () => {
    for (const { oldImage, card } of swaps) {
      for (const table of ['deck_cards', 'deck_sideboard', 'deck_maybe']) {
        await db.runAsync(
          `UPDATE ${table} SET scryfall_id = ?, printed_name = ?, image_url = ?, rarity = ?
           WHERE deck_id = ? AND oracle_id = ? AND scryfall_id <> ?`,
          card.id,
          card.printedName,
          card.imageUrl,
          card.rarity,
          deckId,
          card.oracleId,
          card.id,
        );
      }
      if (oldImage && card.imageUrl)
        await db.runAsync('UPDATE decks SET cover_image = ? WHERE id = ? AND cover_image = ?', card.imageUrl, deckId, oldImage);
    }
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

/** Which collection. Only 'paper' is used since the MTG Arena collection was dropped (DB v8). */
export type Place = 'paper' | 'arena';

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

export const getCollection = (db: SQLiteDatabase, place: Place) =>
  db.getAllAsync<CollectionCard>(
    `SELECT scryfall_id AS scryfallId, oracle_id AS oracleId, name, printed_name AS printedName,
            type_line AS typeLine, mana_cost AS manaCost, image_url AS imageUrl, rarity,
            set_code AS setCode, lang, quantity
     FROM collection_cards WHERE place = ? ORDER BY COALESCE(printed_name, name)`,
    place,
  );

/** Adds `count` copies of this exact printing to the collection; returns the new total. */
export async function addToCollection(db: SQLiteDatabase, card: Card, place: Place, count = 1): Promise<number> {
  await db.runAsync(
    `INSERT INTO collection_cards (scryfall_id, place, oracle_id, name, printed_name, type_line, mana_cost,
       cmc, image_url, rarity, set_code, lang, quantity, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scryfall_id, place) DO UPDATE SET quantity = quantity + excluded.quantity`,
    card.id,
    place,
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
    'SELECT quantity FROM collection_cards WHERE scryfall_id = ? AND place = ?',
    card.id,
    place,
  );
  return row?.quantity ?? count;
}

/** Moves all copies of a collection printing to another printing of the same card (merging if owned). */
export async function changeCollectionPrinting(db: SQLiteDatabase, fromId: string, card: Card, place: Place) {
  if (fromId === card.id) return;
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ quantity: number }>(
      'SELECT quantity FROM collection_cards WHERE scryfall_id = ? AND place = ?',
      fromId,
      place,
    );
    if (!row) return;
    await addToCollection(db, card, place, row.quantity);
    await db.runAsync('DELETE FROM collection_cards WHERE scryfall_id = ? AND place = ?', fromId, place);
  });
}

/** Changes a printing's quantity by `delta`; removes it at 0. */
export async function changeCollectionQuantity(db: SQLiteDatabase, scryfallId: string, delta: number, place: Place) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE collection_cards SET quantity = quantity + ? WHERE scryfall_id = ? AND place = ?',
      delta,
      scryfallId,
      place,
    );
    await db.runAsync('DELETE FROM collection_cards WHERE quantity <= 0');
  });
}

/**
 * Removes one copy of a card from the collection: of the printing `preferId` if you have it,
 * else of your most recently added printing of the card. False if you had none.
 */
export async function removeOneFromCollection(
  db: SQLiteDatabase,
  oracleId: string,
  preferId: string,
  place: Place,
): Promise<boolean> {
  const row =
    (await db.getFirstAsync<{ id: string }>(
      'SELECT scryfall_id AS id FROM collection_cards WHERE scryfall_id = ? AND place = ?',
      preferId,
      place,
    )) ??
    (await db.getFirstAsync<{ id: string }>(
      'SELECT scryfall_id AS id FROM collection_cards WHERE oracle_id = ? AND place = ? ORDER BY added_at DESC LIMIT 1',
      oracleId,
      place,
    ));
  if (!row) return false;
  await changeCollectionQuantity(db, row.id, -1, place);
  return true;
}

/** Copies of one printing in the collection. */
export async function getPrintingCount(db: SQLiteDatabase, scryfallId: string, place: Place): Promise<number> {
  const row = await db.getFirstAsync<{ quantity: number }>(
    'SELECT quantity FROM collection_cards WHERE scryfall_id = ? AND place = ?',
    scryfallId,
    place,
  );
  return row?.quantity ?? 0;
}

/** Raw collection row, to put back with `restoreCollectionRow` (undo). */
export const snapshotCollectionCard = (db: SQLiteDatabase, scryfallId: string, place: Place) =>
  db.getFirstAsync<Row>('SELECT * FROM collection_cards WHERE scryfall_id = ? AND place = ?', scryfallId, place);

export async function restoreCollectionRow(db: SQLiteDatabase, row: Row): Promise<void> {
  const cols = Object.keys(row);
  await db.runAsync(
    `INSERT OR REPLACE INTO collection_cards (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    ...cols.map((c) => row[c]),
  );
}

export const removeFromCollection = (db: SQLiteDatabase, scryfallId: string, place: Place) =>
  db.runAsync('DELETE FROM collection_cards WHERE scryfall_id = ? AND place = ?', scryfallId, place);

/** Oracle ids of every card in any deck (for the collection's "in a deck / free" filter). */
export async function getDeckOracleIds(db: SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ oracleId: string }>('SELECT DISTINCT oracle_id AS oracleId FROM deck_cards');
  return new Set(rows.map((r) => r.oracleId));
}

/** Copies owned of each card (any printing/language), by oracle id. */
export async function getOwnedCounts(
  db: SQLiteDatabase,
  oracleIds: string[],
  place: Place,
): Promise<Record<string, number>> {
  if (!oracleIds.length) return {};
  const rows = await db.getAllAsync<{ oracleId: string; owned: number }>(
    `SELECT oracle_id AS oracleId, SUM(quantity) AS owned FROM collection_cards
     WHERE place = ? AND oracle_id IN (${oracleIds.map(() => '?').join(',')}) GROUP BY oracle_id`,
    place,
    ...oracleIds,
  );
  return Object.fromEntries(rows.map((r) => [r.oracleId, r.owned]));
}

// ---------- Settings (key/value) ----------

// ---------- «La quiero» (cards the user wants to get) ----------

export interface WantedCard {
  oracleId: string;
  /** The printing that was marked (shown in the collection). */
  scryfallId: string;
  name: string;
  printedName: string | null;
  typeLine: string;
  manaCost: string | null;
  imageUrl: string | null;
  rarity: string | null;
  setCode: string;
  lang: string;
}

export const getWanted = (db: SQLiteDatabase) =>
  db.getAllAsync<WantedCard>(
    `SELECT oracle_id AS oracleId, scryfall_id AS scryfallId, name, printed_name AS printedName, type_line AS typeLine,
            mana_cost AS manaCost, image_url AS imageUrl, rarity, set_code AS setCode, lang
     FROM wanted_cards ORDER BY name`,
  );

/** Oracle ids among `oracleIds` with some printing marked as «La quiero». */
export async function getWantedIds(db: SQLiteDatabase, oracleIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(oracleIds)];
  if (!unique.length) return new Set();
  const rows = await db.getAllAsync<{ oracleId: string }>(
    `SELECT oracle_id AS oracleId FROM wanted_cards WHERE oracle_id IN (${unique.map(() => '?').join(', ')})`,
    ...unique,
  );
  return new Set(rows.map((r) => r.oracleId));
}

/** Printings (Scryfall ids) among `scryfallIds` marked as «La quiero». */
export async function getWantedPrintings(db: SQLiteDatabase, scryfallIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(scryfallIds)];
  if (!unique.length) return new Set();
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT scryfall_id AS id FROM wanted_cards WHERE scryfall_id IN (${unique.map(() => '?').join(', ')})`,
    ...unique,
  );
  return new Set(rows.map((r) => r.id));
}

/** Marks `card` (this printing: edition + language + artwork) as «La quiero». */
export const addWanted = (db: SQLiteDatabase, card: Card) =>
  db.runAsync(
    `INSERT OR REPLACE INTO wanted_cards (oracle_id, scryfall_id, name, printed_name, type_line, mana_cost, cmc,
       image_url, rarity, set_code, lang, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    card.oracleId,
    card.id,
    card.name,
    card.printedName,
    card.typeLine,
    card.manaCost,
    card.cmc,
    card.imageUrl,
    card.rarity,
    card.set,
    card.lang,
    Date.now(),
  );

/** Takes this printing off «La quiero» (other printings of the card stay). */
export const removeWanted = (db: SQLiteDatabase, scryfallId: string) =>
  db.runAsync('DELETE FROM wanted_cards WHERE scryfall_id = ?', scryfallId);

/** Takes every printing of the card off «La quiero». */
export const removeWantedCard = (db: SQLiteDatabase, oracleId: string) =>
  db.runAsync('DELETE FROM wanted_cards WHERE oracle_id = ?', oracleId);

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

// ---------- Tags ----------

/** A tag the user made: its text, color (CSS hex) and icon (an icon name of the app). */
export interface Tag {
  uid: string;
  name: string;
  color: string;
  icon: string;
}

const newUid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const getTags = (db: SQLiteDatabase) =>
  db.getAllAsync<Tag>('SELECT uid, name, color, icon FROM tags ORDER BY created_at');

export async function createTag(db: SQLiteDatabase, name: string, color: string, icon: string): Promise<string> {
  const uid = newUid();
  await db.runAsync('INSERT INTO tags (uid, name, color, icon, created_at) VALUES (?, ?, ?, ?, ?)', uid, name, color, icon, Date.now());
  return uid;
}

export const updateTag = (db: SQLiteDatabase, tag: Tag) =>
  db.runAsync('UPDATE tags SET name = ?, color = ?, icon = ? WHERE uid = ?', tag.name, tag.color, tag.icon, tag.uid);

/** Deletes the tag and takes it off every card. */
export async function deleteTag(db: SQLiteDatabase, uid: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM card_tags WHERE tag_uid = ?', uid);
    await db.runAsync('DELETE FROM tags WHERE uid = ?', uid);
  });
}

/** Tag uids of each card (by oracle id); every card of the list has an entry (maybe empty). */
export async function getCardTags(db: SQLiteDatabase, oracleIds: string[]): Promise<Record<string, string[]>> {
  const unique = [...new Set(oracleIds)];
  const out: Record<string, string[]> = Object.fromEntries(unique.map((id) => [id, []]));
  for (let i = 0; i < unique.length; i += 500) {
    const part = unique.slice(i, i + 500);
    const rows = await db.getAllAsync<{ oracleId: string; uid: string }>(
      `SELECT oracle_id AS oracleId, tag_uid AS uid FROM card_tags WHERE oracle_id IN (${part.map(() => '?').join(', ')})
       ORDER BY added_at`,
      ...part,
    );
    for (const r of rows) out[r.oracleId].push(r.uid);
  }
  return out;
}

/** Puts the tag on the card (every printing of it) or takes it off. */
export async function setCardTag(db: SQLiteDatabase, tagUid: string, oracleId: string, on: boolean) {
  if (on) {
    await db.runAsync('INSERT OR IGNORE INTO card_tags (tag_uid, oracle_id, added_at) VALUES (?, ?, ?)', tagUid, oracleId, Date.now());
  } else {
    await db.runAsync('DELETE FROM card_tags WHERE tag_uid = ? AND oracle_id = ?', tagUid, oracleId);
  }
}
