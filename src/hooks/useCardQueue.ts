import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { getCardInLanguage, searchCards, type Card, type Filters } from '@/api/scryfall';

const PREFETCH_AHEAD = 6;
const LOAD_MORE_WHEN_LEFT = 8;
/** Cartas por delante de la actual cambiadas al idioma preferido en segundo plano. */
const LOCALIZE_AHEAD = 4;
const NO_CARDS: Card[] = [];

interface Result {
  /** Los filtros + intento a los que pertenece este resultado; cualquier otra cosa está obsoleta. */
  filters: Filters;
  attempt: number;
  cards: Card[];
  nextPage: string | null;
  total: number;
  error: string | null;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Cola infinita de cartas de Scryfall para los filtros dados.
 * `index` apunta a la carta actual (la de arriba); las páginas se piden según el usuario se acerca al final.
 * Un nuevo objeto `filters` (o `reload()`) empieza una búsqueda nueva desde la primera carta.
 * Con un `language` distinto de 'en', las cartas próximas se cambian por su impresión en
 * ese idioma (cuando existe) antes de que el usuario llegue a ellas.
 */
/** «Solo en mi colección»: las cartas vienen de aquí (todas de golpe), no de Scryfall. */
export type LocalSearch = (filters: Filters) => Promise<Card[]>;

export function useCardQueue(filters: Filters, enabled: boolean, language = 'en', localSearch?: LocalSearch) {
  const localRef = useRef(localSearch);
  useEffect(() => {
    localRef.current = localSearch;
  });
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [index, setIndex] = useState(0);
  const loadingMore = useRef(false);
  // Cuántas cartas quiere cargadas alguna vista (la lista de historial); se piden páginas hasta llegar.
  const [wanted, setWanted] = useState(0);
  // `${cardId}|${lang}` ya consultados (o elegidos a mano), así que nunca se repiten.
  const localized = useRef(new Set<string>());

  // Reinicia la posición al cambiar la búsqueda (ajuste de estado durante el render, sin necesidad de efecto).
  const [searchKey, setSearchKey] = useState({ filters, attempt });
  if (searchKey.filters !== filters || searchKey.attempt !== attempt) {
    setSearchKey({ filters, attempt });
    setIndex(0);
    setWanted(0);
  }

  const fresh = result !== null && result.filters === filters && result.attempt === attempt;
  const cards = fresh ? result.cards : NO_CARDS;
  const nextPage = fresh ? result.nextPage : null;

  // Primera página.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const local = filters.onlyCollection ? localRef.current : undefined;
    (local ? local(filters).then((cards) => ({ cards, nextPage: null, total: cards.length })) : searchCards(filters))
      .then((page) => {
        if (!cancelled) setResult({ filters, attempt, ...page, error: null });
      })
      .catch((e) => {
        if (!cancelled)
          setResult({ filters, attempt, cards: [], nextPage: null, total: 0, error: errorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, filters, attempt]);

  // Páginas siguientes, cuando quedan pocas o cuando una vista pidió más (`loadUpTo`).
  useEffect(() => {
    const runningLow = cards.length - index <= LOAD_MORE_WHEN_LEFT;
    if (!nextPage || loadingMore.current || (!runningLow && cards.length >= wanted)) return;
    loadingMore.current = true;
    const isSame = (r: Result | null): r is Result => r?.filters === filters && r.attempt === attempt;
    searchCards(filters, nextPage)
      .then((page) =>
        setResult((r) =>
          isSame(r) ? { ...r, cards: [...r.cards, ...page.cards], nextPage: page.nextPage } : r,
        ),
      )
      .catch((e) => setResult((r) => (isSame(r) ? { ...r, nextPage: null, error: errorMessage(e) } : r)))
      .finally(() => {
        loadingMore.current = false;
      });
  }, [index, cards.length, nextPage, filters, attempt, wanted]);

  // Cambia la carta actual y las siguientes al idioma preferido.
  useEffect(() => {
    if (language === 'en') return;
    for (const card of cards.slice(index, index + 1 + LOCALIZE_AHEAD)) {
      const key = `${card.id}|${language}`;
      if (card.lang === language || localized.current.has(key)) continue;
      localized.current.add(key);
      getCardInLanguage(card, language)
        .then((loc) => {
          if (!loc || loc.id === card.id) return;
          localized.current.add(`${loc.id}|${language}`);
          setResult((r) => (r ? { ...r, cards: r.cards.map((c) => (c.id === card.id ? loc : c)) } : r));
        })
        .catch(() => localized.current.delete(key));
    }
  }, [cards, index, language]);

  // Precalienta la caché de imágenes de las próximas cartas para que el swipe sea instantáneo.
  useEffect(() => {
    const urls = cards
      .slice(index, index + PREFETCH_AHEAD)
      .flatMap((c) => [c.imageUrl, c.backImageUrl])
      .filter((u): u is string => !!u);
    if (urls.length) Image.prefetch(urls);
  }, [cards, index]);

  return {
    /** Todas las cartas cargadas hasta ahora para esta búsqueda; `index` es la actual. */
    cards,
    index,
    current: cards[index] as Card | undefined,
    upcoming: cards[index + 1] as Card | undefined,
    position: index + 1,
    total: fresh ? result.total : 0,
    /** Existen más páginas en Scryfall. */
    hasMore: !!nextPage,
    /** Pide que se carguen al menos `count` cartas (pide más páginas según haga falta). */
    loadUpTo: (count: number) => setWanted((w) => Math.max(w, count)),
    loading: enabled && !fresh,
    error: fresh ? result.error : null,
    reload: () => setAttempt((a) => a + 1),
    next: () => setIndex((i) => i + 1),
    back: () => setIndex((i) => Math.max(0, i - 1)),
    /** Salta a cualquier carta cargada (historial, deshacer). */
    goTo: (position: number) => setIndex(Math.max(0, position)),
    /** Cambia la carta actual por otra impresión de ella (p. ej. otro idioma). */
    replaceCurrent: (card: Card) => {
      // Un idioma elegido a mano gana sobre el preferido.
      localized.current.add(`${card.id}|${language}`);
      setResult((r) => (r ? { ...r, cards: r.cards.map((c, i) => (i === index ? card : c)) } : r));
    },
  };
}
