// «Solo en mi colección»: Construir's filters applied on this computer to the cards you own (Scryfall
// doesn't know your collection). Pure: the screen loads the cards (Scryfall data by id, cached).
import { rulesQuery } from '@/api/rulesGlossary';
import { fold, textTerms, type Card, type Filters } from '@/api/scryfall';

const MAIN_COLORS = ['W', 'U', 'B', 'R', 'G'];
/** The card's colors from its mana cost (identity for the colorless / land cases). */
const colorsOf = (c: Card) => {
  const fromCost = MAIN_COLORS.filter((x) => (c.manaCost ?? '').toUpperCase().includes(`{${x}`) || (c.manaCost ?? '').toUpperCase().includes(`/${x}}`));
  return fromCost.length || c.manaCost ? fromCost : c.colorIdentity;
};

/** Whether a card passes Construir's filters (as close to Scryfall's search as the data allows). */
export function matchesFilters(c: Card, f: Filters): boolean {
  const name = fold(`${c.name} ${c.printedName ?? ''}`);
  for (const w of fold(f.name).split(/[^\p{L}\p{N}'-]+/u).filter(Boolean)) if (!name.includes(w)) return false;
  // The words as written in the card's own text (Spanish printings), or translated in its English text.
  if (f.text.trim()) {
    const oracle = fold(c.oracleText ?? '');
    const printed = fold((c as { printedText?: string }).printedText ?? '');
    const inPrinted = !!printed && textTerms(f.text).every((t) => printed.includes(fold(t)));
    const inOracle = rulesQuery(f.text).terms.every((t) => oracle.includes(fold(t)));
    if (!inPrinted && !inOracle) return false;
  }
  // Colors: identity = playable in a deck of these colors; exact; include.
  const sel = f.colors as string[];
  if (sel.length || f.colorless) {
    if (f.colorMode === 'identity') {
      const id = c.colorIdentity ?? [];
      if (sel.length ? !id.every((x) => sel.includes(x)) : id.length > 0) return false;
    } else {
      const cols = colorsOf(c);
      const colorless = cols.length === 0;
      if (f.colorMode === 'exact') {
        const same = cols.length === sel.length && sel.every((x) => cols.includes(x));
        if (!(same || (f.colorless && colorless))) return false;
      } else if (!sel.every((x) => cols.includes(x)) || (f.colorless && !sel.length && !colorless)) return false;
    }
  }
  const type = (c.typeLine ?? '').toLowerCase();
  if (f.types.length && !f.types.some((t) => type.includes(t.toLowerCase()))) return false;
  if (f.legendary && !type.includes('legendary')) return false;
  for (const w of f.subtype.toLowerCase().split(/[\s,]+/).filter(Boolean)) if (!type.includes(w)) return false;
  if (f.cmcMin !== null && c.cmc < f.cmcMin) return false;
  if (f.cmcMax !== null && c.cmc > f.cmcMax) return false;
  if (f.rarities.length && !(f.rarities as string[]).includes(c.rarity)) return false;
  // Keyword abilities: in the rules text (Scryfall's catalog names, in English).
  const text = fold(c.oracleText ?? '');
  for (const k of f.keywords) if (!text.includes(fold(k))) return false;
  if (f.format && c.legalities?.[f.format] && !['legal', 'restricted'].includes(c.legalities[f.format])) return false;
  if (f.set && c.set !== f.set) return false;
  return true;
}

/** Sorted as the filters ask (EDHREC / price unknown here: by name). */
export function sortCards(cards: Card[], f: Filters): Card[] {
  const out = [...cards];
  const dir = f.dir === 'desc' ? -1 : 1;
  const byName = (a: Card, b: Card) => (a.printedName ?? a.name).localeCompare(b.printedName ?? b.name, 'es');
  if (f.order === 'cmc') out.sort((a, b) => (a.cmc - b.cmc) * dir || byName(a, b));
  else if (f.order === 'released') out.sort((a, b) => (a.releasedAt ?? '').localeCompare(b.releasedAt ?? '') * (f.dir === 'asc' ? 1 : -1) || byName(a, b));
  else out.sort((a, b) => byName(a, b) * dir);
  return out;
}
