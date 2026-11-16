// MTG Arena helpers (pure): which cards exist there and the deck list its importer reads.
import type { DeckCard } from '@/db/database';

/**
 * Whether the card exists in MTG Arena, from its stored Scryfall legalities: every Arena card
 * has a Timeless / Historic / Brawl status other than "not_legal" (banned still means it exists).
 * Unknown legalities count as yes.
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
 * The name Arena's importer expects: split cards keep both halves ("Fire // Ice"); double-faced,
 * adventure and other two-part cards use the front face only.
 */
export function arenaName(card: Pick<DeckCard, 'name' | 'typeLine'>): string {
  if (!card.name.includes(' // ')) return card.name;
  const halves = card.typeLine.split(' // ');
  const split = halves.length > 1 && halves.every((t) => /\b(Instant|Sorcery)\b/.test(t) && !/Adventure/.test(t));
  return split ? card.name : card.name.split(' // ')[0];
}

/**
 * Deck list in MTG Arena's import format ("Commander" section for Brawl-style decks, then
 * "Deck" and "Sideboard", one "N Name" per line, English names). Cards that aren't on Arena are left out and
 * returned in `skipped` (Arena would refuse the whole import).
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
