// Utilidades de MTG Arena (puras): qué cartas existen ahí y la lista de mazo que lee su importador.
import type { DeckCard } from '@/db/database';

/**
 * Si la carta existe en MTG Arena, por sus legalidades de Scryfall guardadas: cada carta de Arena tiene
 * un estado de Timeless / Historic / Brawl distinto de «not_legal» (banned sigue significando que existe).
 * Las legalidades desconocidas cuentan como sí.
 */
export function onArena(card: Pick<DeckCard, 'legalities'>): boolean {
  if (!card.legalities) return true;
  try {
    const legal = JSON.parse(card.legalities) as Record<string, string>;
    return ['timeless', 'historic', 'brawl', 'alchemy', 'standard'].some((f) => legal[f] && legal[f] !== 'not_legal');
  } catch {
    return true;
  }
}

/**
 * El nombre que espera el importador de Arena: las cartas divididas mantienen ambas mitades («Fire // Ice»);
 * las de doble cara, aventura y otras de dos partes usan solo la cara frontal.
 */
export function arenaName(card: Pick<DeckCard, 'name' | 'typeLine'>): string {
  if (!card.name.includes(' // ')) return card.name;
  const halves = card.typeLine.split(' // ');
  const split = halves.length > 1 && halves.every((t) => /\b(Instant|Sorcery)\b/.test(t) && !/Adventure/.test(t));
  return split ? card.name : card.name.split(' // ')[0];
}

/**
 * Lista de mazo en el formato de importación de MTG Arena (sección «Commander» para mazos estilo Brawl, luego
 * «Deck» y «Sideboard», un «N Nombre» por línea, nombres en inglés). Las cartas que no están en Arena se dejan
 * fuera y se devuelven en `skipped` (Arena rechazaría toda la importación).
 */
export function arenaDeckList(
  cards: DeckCard[],
  usesCommander: boolean,
  sideboard: DeckCard[] = [],
): { text: string; skipped: DeckCard[] } {
  const skipped = [...cards, ...sideboard].filter((c) => !onArena(c));
  const ok = cards.filter((c) => onArena(c));
  const side = sideboard.filter((c) => onArena(c));
  const line = (c: DeckCard) => `${c.quantity} ${arenaName(c)}`;
  const commanders = usesCommander ? ok.filter((c) => c.isCommander) : [];
  const main = ok.filter((c) => !commanders.includes(c));
  const parts: string[] = [];
  if (commanders.length) parts.push(['Commander', ...commanders.map(line)].join('\n'));
  parts.push(['Deck', ...main.map(line)].join('\n'));
  if (side.length) parts.push(['Sideboard', ...side.map(line)].join('\n'));
  return { text: parts.join('\n\n'), skipped };
}
