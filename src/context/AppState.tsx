import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { DEFAULT_FILTERS, type Filters } from '@/api/scryfall';
import type { DeckGroupBy } from '@/deck/group';
import {
  createDeck,
  getDeck,
  getDeckCards,
  getSideboard,
  getMaybe,
  getDecks,
  getSetting,
  setSetting,
  type Deck,
  type DeckCard,
} from '@/db/database';

/** Name given to a deck auto-created by the first right swipe (like the web's "(Not Saved)"). */
export const UNNAMED_DECK = 'Mazo sin nombre';
// Bumped whenever the Filters shape changes incompatibly; older saved filters are ignored.
const FILTERS_KEY = 'filters.v4';
const PREFS_KEY = 'prefs';

export type DeckView = 'list' | 'gallery' | 'big' | 'text';

/** User settings (Ajustes). New fields need a default here; saved prefs are merged over it. */
export interface Prefs {
  /** Scryfall language code cards are shown in when available ('en' = as returned). */
  language: string;
  /** Vibrate on add/discard. */
  haptics: boolean;
  /** View the deck sheet opens with. */
  deckView: DeckView;
  /** How the deck sheet groups the cards. */
  deckGroup: DeckGroupBy;
  /** Second level of the deck's grouping ('none' = no subgroups). */
  deckSubGroup?: DeckGroupBy;
  /** What you have / miss of each card («Faltan N», «✓», «En X · 1 libre»…). */
  showOwned?: boolean;
  /** Colors of the rows (owned green, wanted pink…). */
  colorCode?: boolean;
  /** Hide Android's navigation buttons (swipe up from the bottom edge to show them). */
  hideNavBar: boolean;
  /** Deck sheet's action buttons and deck picker hidden (more room for the cards). */
  deckToolsHidden: boolean;
  /** Where prices are shown (Ajustes → Precios). */
  pricesDeck: boolean;
  pricesDeckCards: boolean;
  pricesShopping: boolean;
  pricesCollection: boolean;
  pricesCardInfo: boolean;
  /** Tags on cards and decks (the tag pickers always show them). */
  showTags?: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  language: 'en',
  haptics: true,
  deckView: 'list',
  deckGroup: 'type',
  hideNavBar: false,
  deckToolsHidden: false,
  pricesDeck: true,
  pricesDeckCards: true,
  pricesShopping: true,
  pricesCollection: true,
  pricesCardInfo: true,
};

interface AppState {
  ready: boolean;
  decks: Deck[];
  activeDeck: Deck | null;
  /** Cards of the active deck. */
  activeCards: DeckCard[];
  /** Sideboard of the active deck (not counted in size, curve or stats). */
  activeSideboard: DeckCard[];
  /** «Posibles» of the active deck: cards set aside to try; they don't count for anything. */
  activeMaybe: DeckCard[];
  setActiveDeckId: (id: number | null) => void;
  /** Reload decks + active deck cards from SQLite. Call after any write. */
  refresh: (deckId?: number | null) => Promise<void>;
  /** Returns the active deck, creating an unnamed one if there is none. */
  ensureActiveDeck: () => Promise<Deck>;
  filters: Filters;
  setFilters: (f: Filters) => void;
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
}

const AppStateContext = createContext<AppState | null>(null);

/** Global state shared by the single-screen layout, persisted in SQLite. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [activeDeckId, setActiveDeckIdState] = useState<number | null>(null);
  const [activeCards, setActiveCards] = useState<DeckCard[]>([]);
  const [activeSideboard, setActiveSideboard] = useState<DeckCard[]>([]);
  const [activeMaybe, setActiveMaybe] = useState<DeckCard[]>([]);
  const [filters, setFiltersState] = useState<Filters>(DEFAULT_FILTERS);
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);

  const load = useCallback(
    async (deckId: number | null) => {
      const list = await getDecks(db);
      const exists = deckId !== null && list.some((d) => d.id === deckId);
      setDecks(list);
      setActiveCards(exists ? await getDeckCards(db, deckId) : []);
      setActiveSideboard(exists ? await getSideboard(db, deckId) : []);
      setActiveMaybe(exists ? await getMaybe(db, deckId) : []);
      if (deckId !== null && !exists) {
        setActiveDeckIdState(null);
        setSetting(db, 'activeDeckId', null);
      }
    },
    [db],
  );

  useEffect(() => {
    (async () => {
      const savedDeck = await getSetting(db, 'activeDeckId');
      const savedFilters = await getSetting(db, FILTERS_KEY);
      const savedPrefs = await getSetting(db, PREFS_KEY);
      const deckId = savedDeck ? Number(savedDeck) : null;
      setActiveDeckIdState(deckId);
      if (savedFilters) setFiltersState({ ...DEFAULT_FILTERS, ...JSON.parse(savedFilters) });
      if (savedPrefs) setPrefsState({ ...DEFAULT_PREFS, ...JSON.parse(savedPrefs) });
      await load(deckId);
      setReady(true);
    })();
  }, [db, load]);

  const setActiveDeckId = useCallback(
    (id: number | null) => {
      setActiveDeckIdState(id);
      setSetting(db, 'activeDeckId', id === null ? null : String(id));
      load(id);
    },
    [db, load],
  );

  // `deckId` lets callers that just created/activated a deck refresh it before state catches up.
  const refresh = useCallback((deckId: number | null = activeDeckId) => load(deckId), [load, activeDeckId]);

  const activeDeck = decks.find((d) => d.id === activeDeckId) ?? null;

  // Several quick adds without a deck must share the one deck being created.
  const creatingDeck = useRef<Promise<Deck> | null>(null);
  const ensureActiveDeck = useCallback(async (): Promise<Deck> => {
    if (activeDeck) return activeDeck;
    creatingDeck.current ??= (async () => {
      const id = await createDeck(db, UNNAMED_DECK, null);
      setActiveDeckId(id);
      return (await getDeck(db, id)) ?? { id, uid: '', name: UNNAMED_DECK, format: null, cardCount: 0, coverImage: null };
    })().finally(() => {
      // Once the state has the new deck, `activeDeck` takes over.
      setTimeout(() => (creatingDeck.current = null), 1000);
    });
    return creatingDeck.current;
  }, [activeDeck, db, setActiveDeckId]);

  const setFilters = useCallback(
    (f: Filters) => {
      setFiltersState(f);
      setSetting(db, FILTERS_KEY, JSON.stringify(f));
    },
    [db],
  );

  const setPrefs = useCallback(
    (p: Prefs) => {
      setPrefsState(p);
      setSetting(db, PREFS_KEY, JSON.stringify(p));
    },
    [db],
  );

  return (
    <AppStateContext.Provider
      value={{
        ready,
        decks,
        activeDeck,
        activeCards,
        activeSideboard,
        activeMaybe,
        setActiveDeckId,
        refresh,
        ensureActiveDeck,
        filters,
        setFilters,
        prefs,
        setPrefs,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
