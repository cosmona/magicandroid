import { useEffect, useState } from 'react';
import { getCardDetails, type CardDetails } from '@/api/scryfall';

/**
 * Live Scryfall data (prices, P/T, tokens) for these printings, by Scryfall id. Starts empty
 * and fills in when the (shared, cached) request answers; offline it just stays empty.
 */
export function useCardDetails(ids: string[]): Record<string, CardDetails> {
  const key = [...new Set(ids)].sort().join(',');
  const [state, setState] = useState<{ key: string; details: Record<string, CardDetails> }>({
    key: '',
    details: {},
  });

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    getCardDetails(key.split(','))
      .then((details) => {
        if (!cancelled) setState({ key, details });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Details of a previous set of ids still apply to the cards they share with this one.
  return state.details;
}

/** Sum of quantity × price; `priced`/`total` count the copies that have / need a price. */
export function priceTotal(
  items: { scryfallId: string; quantity: number }[],
  details: Record<string, CardDetails>,
): { eur: number; priced: number; total: number } {
  let eur = 0;
  let priced = 0;
  let total = 0;
  for (const { scryfallId, quantity } of items) {
    total += quantity;
    const price = details[scryfallId]?.eur;
    if (price != null) {
      eur += price * quantity;
      priced += quantity;
    }
  }
  return { eur, priced, total };
}
