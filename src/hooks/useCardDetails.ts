import { useEffect, useState } from 'react';
import { getCardDetails, type CardDetails } from '@/api/scryfall';

/**
 * Datos en vivo de Scryfall (precios, F/R, fichas) para estas impresiones, por id de Scryfall. Empieza vacío
 * y se rellena cuando responde la petición (compartida, cacheada); sin conexión simplemente se queda vacío.
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

  // Los datos de un conjunto anterior de ids siguen valiendo para las cartas que comparten con este.
  return state.details;
}

/** Suma de cantidad × precio; `priced`/`total` cuentan las copias que tienen / necesitan precio. */
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
