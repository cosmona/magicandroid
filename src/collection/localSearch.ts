// «Solo en mi colección»: los filtros de Construir aplicados en este dispositivo a las cartas que tienes
// (Scryfall no conoce tu colección). Puro: la pantalla carga las cartas (datos de Scryfall por id, cacheados).
import { rulesQuery } from '@/api/rulesGlossary';
import { fold, textTerms, type Card, type Filters } from '@/api/scryfall';

const MAIN_COLORS = ['W', 'U', 'B', 'R', 'G'];
/** Los colores de la carta de su coste de maná (identidad para los casos de incoloro / tierra). */
const colorsOf = (c: Card) => {
  const fromCost = MAIN_COLORS.filter((x) => (c.manaCost ?? '').toUpperCase().includes(`{${x}`) || (c.manaCost ?? '').toUpperCase().includes(`/${x}}`));
  return fromCost.length || c.manaCost ? fromCost : c.colorIdentity;
};

/** Si una carta pasa los filtros de Construir (lo más cerca de la búsqueda de Scryfall que permiten los datos). */
export function matchesFilters(c: Card, f: Filters): boolean {
  const name = fold(`${c.name} ${c.printedName ?? ''}`);
  for (const w of fold(f.name).split(/[^\p{L}\p{N}'-]+/u).filter(Boolean)) if (!name.includes(w)) return false;
  // Las palabras tal como están en el propio texto de la carta (impresiones en español), o traducidas en su texto en inglés.
  if (f.text.trim()) {
    const oracle = fold(c.oracleText ?? '');
    const printed = fold((c as { printedText?: string }).printedText ?? '');
    const inPrinted = !!printed && textTerms(f.text).every((t) => printed.includes(fold(t)));
    const inOracle = rulesQuery(f.text).terms.every((t) => oracle.includes(fold(t)));
    if (!inPrinted && !inOracle) return false;
  }
  // Colores: identity = jugable en un mazo de estos colores; exact; include.
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
  // Habilidades de palabra clave: en el texto de reglas (nombres del catálogo de Scryfall, en inglés).
  const text = fold(c.oracleText ?? '');
  for (const k of f.keywords) if (!text.includes(fold(k))) return false;
  if (f.format && c.legalities?.[f.format] && !['legal', 'restricted'].includes(c.legalities[f.format])) return false;
  if (f.set && c.set !== f.set) return false;
  return true;
}

/** Ordenado como piden los filtros (EDHREC / precio desconocidos aquí: por nombre). */
export function sortCards(cards: Card[], f: Filters): Card[] {
  const out = [...cards];
  const dir = f.dir === 'desc' ? -1 : 1;
  const byName = (a: Card, b: Card) => (a.printedName ?? a.name).localeCompare(b.printedName ?? b.name, 'es');
  if (f.order === 'cmc') out.sort((a, b) => (a.cmc - b.cmc) * dir || byName(a, b));
  else if (f.order === 'released') out.sort((a, b) => (a.releasedAt ?? '').localeCompare(b.releasedAt ?? '') * (f.dir === 'asc' ? 1 : -1) || byName(a, b));
  else out.sort((a, b) => byName(a, b) * dir);
  return out;
}
