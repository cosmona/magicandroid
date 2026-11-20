import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { GalleryLayout, LayoutPlace, ListLayout } from '@/listLayout';
import { useSQLiteContext } from 'expo-sqlite';
import { initSeen } from '@/hooks/useSeen';
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

/** Nombre que recibe un mazo creado automáticamente por el primer swipe a la derecha (como el «(Not Saved)» de la web). */
export const UNNAMED_DECK = 'Mazo sin nombre';
// Se sube cuando la forma de Filters cambia de forma incompatible; los filtros guardados antiguos se ignoran.
const FILTERS_KEY = 'filters.v4';
const PREFS_KEY = 'prefs';

export type DeckView = 'list' | 'gallery' | 'big' | 'text';

/** Ajustes del usuario. Los campos nuevos necesitan un valor por defecto aquí; los prefs guardados se fusionan encima. */
export type DeckSort = 'cmc' | 'name' | 'added' | 'addedNew' | 'copies';

export interface Prefs {
  /** Código de idioma de Scryfall en el que se muestran las cartas si está disponible ('en' = como las devuelve). */
  language: string;
  /** Construir: búsquedas guardadas (nombre + filtros), sincronizadas con el PC. */
  savedSearches?: { name: string; filters: Filters; updatedAt?: number }[];
  /** Vibrar al añadir/descartar. */
  haptics: boolean;
  /** Vista con la que abre la hoja del mazo. */
  deckView: DeckView;
  /** Cómo agrupa las cartas la hoja del mazo. */
  deckGroup: DeckGroupBy;
  /** Vista de Colección (lista, galería, grande, texto). */
  collectionView?: 'list' | 'gallery' | 'big' | 'text';
  /** Ajustes → Cartas y listas: las líneas de cada vista lista y los iconos de cada galería. */
  listLayout?: Partial<Record<LayoutPlace, ListLayout>>;
  galleryLayout?: Partial<Record<LayoutPlace, GalleryLayout>>;
  /** Orden de las cartas dentro de cada grupo del mazo. */
  deckSort?: DeckSort;
  /** Segundo nivel de la agrupación del mazo ('none' = sin subgrupos). */
  deckSubGroup?: DeckGroupBy;
  /** Lo que tienes / te falta de cada carta («Faltan N», «✓», «En X · 1 libre»…). */
  showOwned?: boolean;
  /** Colores de las filas (verde si la tienes, rosa si la quieres…). */
  colorCode?: boolean;
  /** Grupos y subgrupos plegados o abiertos en cada lista (mazo, colección…), recordados. */
  openState?: Record<string, string[]>;
  /** «Mano» (beta): la cámara lee tu mano. Apagado salvo que se active en Ajustes. */
  handBeta?: boolean;
  /** Se vio la guía de «Mano» (cómo colocar la cámara). */
  handGuideSeen?: boolean;
  /** Construir: el riel lateral de botones (La quiero, La tengo, Ficha…) oculto. */
  swipeRailHidden?: boolean;
  /** Ocultar los botones de navegación de Android (desliza desde el borde inferior para mostrarlos). */
  hideNavBar: boolean;
  /** Botones de acciones y selector de mazo de la hoja del mazo ocultos (más sitio para las cartas). */
  deckToolsHidden: boolean;
  /** Dónde se muestran los precios (Ajustes → Precios). */
  pricesDeck: boolean;
  pricesDeckCards: boolean;
  pricesShopping: boolean;
  pricesCollection: boolean;
  pricesCardInfo: boolean;
  /** Etiquetas en cartas y mazos (los selectores de etiquetas siempre las muestran). */
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
  /** Cartas del mazo activo. */
  activeCards: DeckCard[];
  /** Banquillo del mazo activo (no cuenta en tamaño, curva ni estadísticas). */
  activeSideboard: DeckCard[];
  /** «Posibles» del mazo activo: cartas apartadas para probar; no cuentan para nada. */
  activeMaybe: DeckCard[];
  setActiveDeckId: (id: number | null) => void;
  /** Recarga los mazos + las cartas del mazo activo desde SQLite. Llámalo tras cualquier escritura. */
  refresh: (deckId?: number | null) => Promise<void>;
  /** Devuelve el mazo activo, creando uno sin nombre si no hay ninguno. */
  ensureActiveDeck: () => Promise<Deck>;
  filters: Filters;
  setFilters: (f: Filters) => void;
  prefs: Prefs;
  setPrefs: (p: Prefs | ((prev: Prefs) => Prefs)) => void;
}

const AppStateContext = createContext<AppState | null>(null);

/** Estado global compartido por el layout de pantalla única, persistido en SQLite. */
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
      initSeen(db);
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

  // `deckId` permite a quien acaba de crear/activar un mazo refrescarlo antes de que el estado se ponga al día.
  const refresh = useCallback((deckId: number | null = activeDeckId) => load(deckId), [load, activeDeckId]);

  const activeDeck = decks.find((d) => d.id === activeDeckId) ?? null;

  // Varias adiciones rápidas sin mazo deben compartir el único mazo que se está creando.
  const creatingDeck = useRef<Promise<Deck> | null>(null);
  const ensureActiveDeck = useCallback(async (): Promise<Deck> => {
    if (activeDeck) return activeDeck;
    creatingDeck.current ??= (async () => {
      const id = await createDeck(db, UNNAMED_DECK, null);
      setActiveDeckId(id);
      return (await getDeck(db, id)) ?? { id, uid: '', name: UNNAMED_DECK, format: null, cardCount: 0, coverImage: null, updatedAt: Date.now() };
    })().finally(() => {
      // Una vez el estado tiene el mazo nuevo, `activeDeck` toma el relevo.
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
    // Acepta un updater para que dos setPrefs en el mismo manejador (p. ej. «agrupar» cambiando deckGroup
    // y luego limpiando el plegado) se construyan uno sobre otro en vez de pisarse.
    (p: Prefs | ((prev: Prefs) => Prefs)) => {
      setPrefsState((prev) => {
        const next = typeof p === 'function' ? p(prev) : p;
        setSetting(db, PREFS_KEY, JSON.stringify(next));
        return next;
      });
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
