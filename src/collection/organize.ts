// Filters and groupings of the collection (pure functions, no React).
import type { CardDetails, MtgSet } from '@/api/scryfall';
import type { CollectionCard } from '@/db/database';

export type ColorKey = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';
export type TypeKey =
  'creature' | 'planeswalker' | 'battle' | 'land' | 'instant' | 'sorcery' | 'artifact' | 'enchantment' | 'other';
export type Usage = 'all' | 'inDeck' | 'free';
export type GroupBy = 'none' | 'color' | 'type' | 'set' | 'rarity' | 'cost' | 'price' | 'lang' | 'subtype' | 'deck' | 'tag' | 'copies';

export interface CollectionFilter {
  /** Card has any of these colors ('C' = colorless). Empty = any. */
  colors: ColorKey[];
  types: TypeKey[];
  /** Mana value range (lands count as 0). */
  costMin: number | null;
  costMax: number | null;
  rarities: string[];
  sets: string[];
  langs: string[];
  /** € per copy. Cards without a price never pass a price limit. */
  priceMin: number | null;
  priceMax: number | null;
  usage: Usage;
  /** Only printings you own 2+ copies of. */
  duplicates: boolean;
}

export const EMPTY_FILTER: CollectionFilter = {
  colors: [],
  types: [],
  costMin: null,
  costMax: null,
  rarities: [],
  sets: [],
  langs: [],
  priceMin: null,
  priceMax: null,
  usage: 'all',
  duplicates: false,
};

export function activeFilterCount(f: CollectionFilter): number {
  return (
    (f.colors.length ? 1 : 0) +
    (f.types.length ? 1 : 0) +
    (f.costMin !== null || f.costMax !== null ? 1 : 0) +
    (f.rarities.length ? 1 : 0) +
    (f.sets.length ? 1 : 0) +
    (f.langs.length ? 1 : 0) +
    (f.priceMin !== null || f.priceMax !== null ? 1 : 0) +
    (f.usage !== 'all' ? 1 : 0) +
    (f.duplicates ? 1 : 0)
  );
}

export const COLOR_LABELS: Record<ColorKey, string> = {
  W: 'Blanco',
  U: 'Azul',
  B: 'Negro',
  R: 'Rojo',
  G: 'Verde',
  C: 'Incoloro',
};

export const TYPE_GROUP_LABELS: Record<TypeKey, string> = {
  creature: 'Criaturas',
  planeswalker: 'Planeswalkers',
  battle: 'Batallas',
  land: 'Tierras',
  instant: 'Instantáneos',
  sorcery: 'Conjuros',
  artifact: 'Artefactos',
  enchantment: 'Encantamientos',
  other: 'Otros',
};

export const GROUP_LABELS: Record<GroupBy, string> = {
  none: 'Sin agrupar',
  color: 'Color',
  type: 'Tipo',
  set: 'Edición',
  rarity: 'Rareza',
  cost: 'Coste',
  price: 'Precio',
  lang: 'Idioma',
  subtype: 'Subtipo',
  deck: 'En mazos',
  tag: 'Etiqueta',
  copies: 'Copias',
};

/** Colors in the mana cost (hybrid counts both). Colorless costs → []. */
export function cardColors(manaCost: string | null): Exclude<ColorKey, 'C'>[] {
  const found = new Set((manaCost ?? '').match(/[WUBRG]/g) ?? []);
  return (['W', 'U', 'B', 'R', 'G'] as const).filter((c) => found.has(c));
}

/** Mana value from the cost string: numbers add up, X is 0, every other symbol is 1 (front face only). */
export function manaValue(manaCost: string | null): number {
  const front = (manaCost ?? '').split(' // ')[0];
  let total = 0;
  for (const [, sym] of front.matchAll(/\{([^}]+)\}/g)) {
    if (/^\d+$/.test(sym)) total += Number(sym);
    else if (/^\d+\//.test(sym))
      total += Number(sym.split('/')[0]); // {2/W}
    else if (sym !== 'X' && sym !== 'Y' && sym !== 'Z') total += 1;
  }
  return total;
}

/** Main type for grouping: a creature land is a creature, an artifact land is a land. */
export function mainType(typeLine: string): TypeKey {
  const t = typeLine.split(' // ')[0];
  if (/\bCreature\b/.test(t)) return 'creature';
  if (/\bPlaneswalker\b/.test(t)) return 'planeswalker';
  if (/\bBattle\b/.test(t)) return 'battle';
  if (/\bLand\b/.test(t)) return 'land';
  if (/\bInstant\b/.test(t)) return 'instant';
  if (/\bSorcery\b/.test(t)) return 'sorcery';
  if (/\bArtifact\b/.test(t)) return 'artifact';
  if (/\bEnchantment\b/.test(t)) return 'enchantment';
  return 'other';
}

const isLand = (c: CollectionCard) => mainType(c.typeLine) === 'land';

export interface OrganizeContext {
  details: Record<string, CardDetails>;
  /** Oracle ids used in any deck. */
  inDecks: Set<string>;
  sets: Record<string, MtgSet>;
  /** Tag names of each card (by oracle id), for the «Etiqueta» grouping. */
  tags?: Record<string, string[]>;
  /** Language names, for the «Idioma» grouping. */
  langNames?: Record<string, string>;
}

export function applyFilter(cards: CollectionCard[], f: CollectionFilter, ctx: OrganizeContext): CollectionCard[] {
  return cards.filter((c) => {
    if (f.colors.length) {
      const cs = cardColors(c.manaCost);
      const ok = f.colors.some((k) => (k === 'C' ? cs.length === 0 : cs.includes(k)));
      if (!ok) return false;
    }
    if (f.types.length && !f.types.includes(mainType(c.typeLine))) return false;
    if (f.costMin !== null || f.costMax !== null) {
      const mv = isLand(c) ? 0 : manaValue(c.manaCost);
      if (f.costMin !== null && mv < f.costMin) return false;
      if (f.costMax !== null && mv > f.costMax) return false;
    }
    if (f.rarities.length && !f.rarities.includes(c.rarity ?? '')) return false;
    if (f.sets.length && !f.sets.includes(c.setCode)) return false;
    if (f.langs.length && !f.langs.includes(c.lang)) return false;
    if (f.priceMin !== null || f.priceMax !== null) {
      const eur = ctx.details[c.scryfallId]?.eur;
      if (eur == null) return false;
      if (f.priceMin !== null && eur < f.priceMin) return false;
      if (f.priceMax !== null && eur > f.priceMax) return false;
    }
    if (f.usage === 'inDeck' && !ctx.inDecks.has(c.oracleId)) return false;
    if (f.usage === 'free' && ctx.inDecks.has(c.oracleId)) return false;
    if (f.duplicates && c.quantity < 2) return false;
    return true;
  });
}

export interface CardGroup {
  key: string;
  title: string;
  /** Mana symbols to draw next to the title ("{R}", "{W}{U}"…), if any. */
  symbols?: string;
  cards: CollectionCard[];
  /** Copies (sum of quantities). */
  copies: number;
  /** Value in € of the priced copies. */
  value: number;
}

const COLOR_GROUP_ORDER = ['W', 'U', 'B', 'R', 'G', 'multi', 'C', 'land'];
const RARITY_ORDER = ['mythic', 'rare', 'uncommon', 'common'];
const RARITY_GROUP_LABELS: Record<string, string> = {
  mythic: 'Míticas',
  rare: 'Raras',
  uncommon: 'Infrecuentes',
  common: 'Comunes',
  other: 'Especiales',
};
const PRICE_BANDS = [
  { key: 'p20', title: 'Más de 20 €', min: 20 },
  { key: 'p5', title: '5 – 20 €', min: 5 },
  { key: 'p1', title: '1 – 5 €', min: 1 },
  { key: 'p0', title: 'Menos de 1 €', min: 0 },
];

/** Sections for `by` ('none' = one untitled group), each sorted by name. */
export function groupCards(cards: CollectionCard[], by: GroupBy, ctx: OrganizeContext): CardGroup[] {
  const groups = new Map<string, CardGroup>();
  const order: string[] = [];
  const put = (key: string, title: string, card: CollectionCard, symbols?: string) => {
    let g = groups.get(key);
    if (!g) {
      g = { key, title, symbols, cards: [], copies: 0, value: 0 };
      groups.set(key, g);
    }
    g.cards.push(card);
    g.copies += card.quantity;
    g.value += (ctx.details[card.scryfallId]?.eur ?? 0) * card.quantity;
  };

  for (const c of cards) {
    switch (by) {
      case 'none':
        put('all', '', c);
        break;
      case 'color': {
        const cs = cardColors(c.manaCost);
        if (isLand(c)) put('land', 'Tierras', c);
        else if (cs.length === 0) put('C', 'Incoloras', c, '{C}');
        else if (cs.length > 1) put('multi', 'Multicolor', c, cs.map((x) => `{${x}}`).join(''));
        else put(cs[0], COLOR_LABELS[cs[0]], c, `{${cs[0]}}`);
        break;
      }
      case 'type': {
        const t = mainType(c.typeLine);
        put(t, TYPE_GROUP_LABELS[t], c);
        break;
      }
      case 'set': {
        const set = ctx.sets[c.setCode];
        put(c.setCode, set ? `${set.name} (${c.setCode.toUpperCase()})` : c.setCode.toUpperCase(), c);
        break;
      }
      case 'rarity': {
        const r = RARITY_ORDER.includes(c.rarity ?? '') ? (c.rarity as string) : 'other';
        put(r, RARITY_GROUP_LABELS[r], c);
        break;
      }
      case 'cost': {
        if (isLand(c)) {
          put('land', 'Tierras', c);
        } else {
          const mv = manaValue(c.manaCost);
          const key = mv >= 7 ? '7' : String(mv);
          put(key, mv >= 7 ? 'Coste 7 o más' : `Coste ${mv}`, c);
        }
        break;
      }
      case 'lang':
        put(`l:${c.lang}`, ctx.langNames?.[c.lang] ?? c.lang.toUpperCase(), c);
        break;
      case 'subtype': {
        const sub = c.typeLine.split(' — ')[1]?.split(' // ')[0]?.trim();
        put(sub ? `s:${sub}` : '~', sub ?? 'Sin subtipo', c);
        break;
      }
      case 'deck':
        if (ctx.inDecks.has(c.oracleId)) put('d1', 'En algún mazo', c);
        else put('d2', 'En ningún mazo', c);
        break;
      case 'tag': {
        const names = ctx.tags?.[c.oracleId] ?? [];
        if (names.length) for (const n of names) put(`t:${n}`, n, c);
        else put('~', 'Sin etiqueta', c);
        break;
      }
      case 'copies':
        if (c.quantity === 0) put('c0', 'Las quieres (no las tienes)', c);
        else if (c.quantity === 1) put('c1', '1 copia', c);
        else if (c.quantity < 4) put('c2', '2 – 3 copias', c);
        else put('c4', '4 o más copias', c);
        break;
      case 'price': {
        const eur = ctx.details[c.scryfallId]?.eur;
        const band = eur == null ? null : PRICE_BANDS.find((b) => eur >= b.min);
        if (band) put(band.key, band.title, c);
        else put('none', 'Sin precio', c);
        break;
      }
    }
  }

  // Section order.
  let keys = [...groups.keys()];
  if (by === 'color') keys = COLOR_GROUP_ORDER.filter((k) => groups.has(k));
  else if (by === 'type') keys = (Object.keys(TYPE_GROUP_LABELS) as TypeKey[]).filter((k) => groups.has(k));
  else if (by === 'rarity') keys = [...RARITY_ORDER, 'other'].filter((k) => groups.has(k));
  else if (by === 'cost') keys = ['0', '1', '2', '3', '4', '5', '6', '7', 'land'].filter((k) => groups.has(k));
  else if (by === 'price') keys = [...PRICE_BANDS.map((b) => b.key), 'none'].filter((k) => groups.has(k));
  else if (by === 'set') {
    // Newest edition first; unknown sets at the end.
    keys.sort((a, b) => (ctx.sets[b]?.releasedAt ?? '').localeCompare(ctx.sets[a]?.releasedAt ?? ''));
  }
  else if (by === 'lang' || by === 'subtype' || by === 'tag') {
    keys.sort((a, b) => (a === '~' ? 1 : b === '~' ? -1 : (groups.get(a)!.title).localeCompare(groups.get(b)!.title, 'es')));
  } else if (by === 'deck' || by === 'copies') keys.sort();
  order.push(...keys);

  const byName = (a: CollectionCard, b: CollectionCard) =>
    (a.printedName ?? a.name).localeCompare(b.printedName ?? b.name);
  return order.map((k) => {
    const g = groups.get(k) as CardGroup;
    g.cards.sort(byName);
    return g;
  });
}
