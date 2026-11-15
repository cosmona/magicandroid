import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { searchCards, type Card, type Filters } from '@/api/scryfall';

const PREFETCH_AHEAD = 4;
const LOAD_MORE_WHEN_LEFT = 8;
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
 */
export function useCardQueue(filters: Filters, enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [index, setIndex] = useState(0);
  const loadingMore = useRef(false);

  // Reset position when the search changes (state adjustment during render, no effect needed).
  const [searchKey, setSearchKey] = useState({ filters, attempt });
  if (searchKey.filters !== filters || searchKey.attempt !== attempt) {
    setSearchKey({ filters, attempt });
    setIndex(0);
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

  // Following pages, when running low.
  useEffect(() => {
    if (!nextPage || loadingMore.current || cards.length - index > LOAD_MORE_WHEN_LEFT) return;
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
  }, [index, cards.length, nextPage, filters, attempt]);

  // Warm the image cache for the next few cards so swiping feels instant.
  useEffect(() => {
    const urls = cards
      .slice(index, index + PREFETCH_AHEAD)
      .flatMap((c) => [c.imageUrl, c.backImageUrl])
      .filter((u): u is string => !!u);
    if (urls.length) Image.prefetch(urls);
  }, [cards, index]);

  return {
    current: cards[index] as Card | undefined,
    upcoming: cards[index + 1] as Card | undefined,
    position: index + 1,
    total: fresh ? result.total : 0,
    loading: enabled && !fresh,
    error: fresh ? result.error : null,
    reload: () => setAttempt((a) => a + 1),
    next: () => setIndex((i) => i + 1),
    back: () => setIndex((i) => Math.max(0, i - 1)),
  };
}
