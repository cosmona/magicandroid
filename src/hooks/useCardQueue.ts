import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { getCardInLanguage, searchCards, type Card, type Filters } from '@/api/scryfall';

const PREFETCH_AHEAD = 6;
const LOAD_MORE_WHEN_LEFT = 8;
/** Cards ahead of the current one swapped to the preferred language in the background. */
const LOCALIZE_AHEAD = 4;
const NO_CARDS: Card[] = [];

interface Result {
  /** The filters + attempt this result belongs to; anything else is stale. */
  filters: Filters;
  attempt: number;
  cards: Card[];
  nextPage: string | null;
  total: number;
  error: string | null;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Infinite queue of Scryfall cards for the given filters.
 * `index` points at the current (top) card; pages are fetched as the user approaches the end.
 * A new `filters` object (or `reload()`) starts a fresh search from the first card.
 * With a `language` other than 'en', upcoming cards are swapped for their printing in
 * that language (when one exists) before the user reaches them.
 */
export function useCardQueue(filters: Filters, enabled: boolean, language = 'en') {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [index, setIndex] = useState(0);
  const loadingMore = useRef(false);
  // How many cards some view (the history list) wants loaded; pages are fetched until reached.
  const [wanted, setWanted] = useState(0);
  // `${cardId}|${lang}` already looked up (or chosen by hand), so they're never redone.
  const localized = useRef(new Set<string>());

  // Reset position when the search changes (state adjustment during render, no effect needed).
  const [searchKey, setSearchKey] = useState({ filters, attempt });
  if (searchKey.filters !== filters || searchKey.attempt !== attempt) {
    setSearchKey({ filters, attempt });
    setIndex(0);
    setWanted(0);
  }

  const fresh = result !== null && result.filters === filters && result.attempt === attempt;
  const cards = fresh ? result.cards : NO_CARDS;
  const nextPage = fresh ? result.nextPage : null;

  // First page.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    searchCards(filters)
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

  // Following pages, when running low or when a view asked for more (`loadUpTo`).
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

  // Swap the current and next few cards to the preferred language.
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

  // Warm the image cache for the next few cards so swiping feels instant.
  useEffect(() => {
    const urls = cards
      .slice(index, index + PREFETCH_AHEAD)
      .flatMap((c) => [c.imageUrl, c.backImageUrl])
      .filter((u): u is string => !!u);
    if (urls.length) Image.prefetch(urls);
  }, [cards, index]);

  return {
    /** Every card loaded so far for this search; `index` is the current one. */
    cards,
    index,
    current: cards[index] as Card | undefined,
    upcoming: cards[index + 1] as Card | undefined,
    position: index + 1,
    total: fresh ? result.total : 0,
    /** More pages exist on Scryfall. */
    hasMore: !!nextPage,
    /** Ask for at least `count` cards to be loaded (fetches further pages as needed). */
    loadUpTo: (count: number) => setWanted((w) => Math.max(w, count)),
    loading: enabled && !fresh,
    error: fresh ? result.error : null,
    reload: () => setAttempt((a) => a + 1),
    next: () => setIndex((i) => i + 1),
    back: () => setIndex((i) => Math.max(0, i - 1)),
    /** Swap the current card for another printing of it (e.g. another language). */
    replaceCurrent: (card: Card) => {
      // A language picked by hand wins over the preferred one.
      localized.current.add(`${card.id}|${language}`);
      setResult((r) => (r ? { ...r, cards: r.cards.map((c, i) => (i === index ? card : c)) } : r));
    },
  };
}
