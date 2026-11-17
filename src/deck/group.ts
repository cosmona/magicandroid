// Groups of a deck's cards for the deck sheet (pure, no React).
import { cardColors, mainType, TYPE_GROUP_LABELS, type TypeKey } from '@/collection/organize';
import type { DeckCard } from '@/db/database';
import { CURVE_MAX, curveCost } from '@/deck/stats';

export type DeckGroupBy = 'none' | 'type' | 'cost' | 'color' | 'rarity' | 'set' | 'subtype' | 'owned' | 'price' | 'tag';

export const DECK_GROUP_OPTIONS: { key: DeckGroupBy; label: string }[] = [
  { key: 'type', label: 'Tipo' },
  { key: 'cost', label: 'Coste' },
  { key: 'color', label: 'Color' },
  { key: 'rarity', label: 'Rareza' },
  { key: 'set', label: 'Edición' },
  { key: 'subtype', label: 'Subtipo' },
  { key: 'owned', label: 'Colección' },
  { key: 'price', label: 'Precio' },
  { key: 'tag', label: 'Etiqueta' },
  { key: 'none', label: 'Sin agrupar' },
];

export interface DeckGroup {
  key: string;
  label: string;
  cards: DeckCard[];
  /** Copies in the group. */
  count: number;
}

const TYPE_ORDER: TypeKey[] = [
  'creature',
  'planeswalker',
  'battle',
  'instant',
  'sorcery',
  'artifact',
  'enchantment',
  'land',
  'other',
];
const COLOR_NAMES: Record<string, string> = { W: 'Blanco', U: 'Azul', B: 'Negro', R: 'Rojo', G: 'Verde' };
const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G', 'multi', 'colorless', 'land'];
const RARITY_ORDER = ['mythic', 'rare', 'uncommon', 'common', 'special', 'bonus', 'unknown'];
const RARITY_NAMES: Record<string, string> = {
  mythic: 'Míticas',
  rare: 'Raras',
  uncommon: 'Infrecuentes',
  common: 'Comunes',
  special: 'Especiales',
  bonus: 'Bonus',
  unknown: 'Sin rareza',
};

const isLand = (c: DeckCard) => mainType(c.typeLine) === 'land';

/**
 * What some groupings need that the deck card doesn't have: its edition, copies in the collection,
 * price and tags. Without it those cards go to a «Sin datos» group.
 */
export interface DeckGroupContext {
  /** Edition of the printing: code, name and release date (for the order). */
  setOf?: (c: DeckCard) => { code: string; name: string; releasedAt: string } | undefined;
  owned?: (c: DeckCard) => number | undefined;
  price?: (c: DeckCard) => number | null | undefined;
  /** Tag names of the card. */
  tags?: (c: DeckCard) => string[];
}

const PRICE_BANDS = [
  { key: 'p50', label: 'Más de 50 €', min: 50 },
  { key: 'p20', label: '20 – 50 €', min: 20 },
  { key: 'p5', label: '5 – 20 €', min: 5 },
  { key: 'p1', label: '1 – 5 €', min: 1 },
  { key: 'p0', label: 'Menos de 1 €', min: 0 },
];

/** Key + label of the groups a card goes in (several only for tags). */
function groupsOf(card: DeckCard, by: DeckGroupBy, ctx: DeckGroupContext): { key: string; label: string; order?: string }[] {
  switch (by) {
    case 'set': {
      const set = ctx.setOf?.(card);
      return [set ? { key: set.code, label: `${set.name} (${set.code.toUpperCase()})`, order: set.releasedAt } : { key: '~', label: 'Sin datos' }];
    }
    case 'subtype': {
      const sub = card.typeLine.split(' — ')[1]?.split(' // ')[0]?.trim();
      return [sub ? { key: `s:${sub}`, label: sub } : { key: '~', label: 'Sin subtipo' }];
    }
    case 'owned': {
      const have = ctx.owned?.(card);
      if (have === undefined) return [{ key: '~', label: 'Sin datos' }];
      if (have >= card.quantity) return [{ key: 'o0', label: 'Las tienes todas' }];
      if (have > 0) return [{ key: 'o1', label: 'Te faltan algunas copias' }];
      return [{ key: 'o2', label: 'No la tienes' }];
    }
    case 'price': {
      const eur = ctx.price?.(card);
      const band = eur == null ? null : PRICE_BANDS.find((b) => eur >= b.min);
      return [band ? { key: band.key, label: band.label } : { key: '~', label: 'Sin precio' }];
    }
    case 'tag': {
      const names = ctx.tags?.(card) ?? [];
      return names.length ? names.map((n) => ({ key: `t:${n}`, label: n })) : [{ key: '~', label: 'Sin etiqueta' }];
    }
    default:
      return [groupOf(card, by)];
  }
}

/** Key + label of the group a card goes in. */
function groupOf(card: DeckCard, by: DeckGroupBy): { key: string; label: string } {
  switch (by) {
    case 'type': {
      const t = mainType(card.typeLine);
      return { key: t, label: TYPE_GROUP_LABELS[t] };
    }
    case 'cost': {
      if (isLand(card)) return { key: 'land', label: 'Tierras' };
      const cost = Math.min(Math.floor(curveCost(card)), CURVE_MAX);
      return { key: `c${cost}`, label: cost === CURVE_MAX ? `Coste ${CURVE_MAX} o más` : `Coste ${cost}` };
    }
    case 'color': {
      if (isLand(card)) return { key: 'land', label: 'Tierras' };
      const colors = cardColors(card.manaCost);
      if (colors.length === 0) return { key: 'colorless', label: 'Incoloras' };
      if (colors.length > 1) return { key: 'multi', label: 'Multicolor' };
      return { key: colors[0], label: COLOR_NAMES[colors[0]] };
    }
    case 'rarity': {
      const r = card.rarity && RARITY_NAMES[card.rarity] ? card.rarity : 'unknown';
      return { key: r, label: RARITY_NAMES[r] };
    }
    default:
      return { key: 'all', label: 'Cartas' };
  }
}

function orderOf(key: string, by: DeckGroupBy): number {
  if (by === 'type') return TYPE_ORDER.indexOf(key as TypeKey);
  if (by === 'cost') return key === 'land' ? 99 : Number(key.slice(1));
  if (by === 'color') return COLOR_ORDER.indexOf(key);
  if (by === 'rarity') return RARITY_ORDER.indexOf(key);
  return 0;
}

/**
 * The deck's cards in groups, in a fixed order, keeping each group's cards in the incoming
 * order. Commanders (when the format uses them) always go first in their own group.
 */
export function groupDeck(cards: DeckCard[], by: DeckGroupBy, usesCommander: boolean, ctx: DeckGroupContext = {}): DeckGroup[] {
  const groups = new Map<string, DeckGroup>();
  const sortKey = new Map<string, string>();
  const commanders = usesCommander ? cards.filter((c) => c.isCommander) : [];
  for (const card of cards) {
    if (commanders.includes(card)) continue;
    for (const { key, label, order } of groupsOf(card, by, ctx)) {
      let group = groups.get(key);
      if (!group) groups.set(key, (group = { key, label, cards: [], count: 0 }));
      if (order) sortKey.set(key, order);
      group.cards.push(card);
      group.count += card.quantity;
    }
  }
  const sorted = [...groups.values()].sort((a, b) => {
    // «Sin datos / Sin precio / Sin etiqueta» always last.
    if (a.key === '~' || b.key === '~') return a.key === '~' ? 1 : -1;
    if (by === 'set') return (sortKey.get(b.key) ?? '').localeCompare(sortKey.get(a.key) ?? '');
    if (by === 'subtype' || by === 'tag') return a.label.localeCompare(b.label, 'es');
    if (by === 'owned') return a.key.localeCompare(b.key);
    if (by === 'price') return PRICE_BANDS.findIndex((x) => x.key === a.key) - PRICE_BANDS.findIndex((x) => x.key === b.key);
    return orderOf(a.key, by) - orderOf(b.key, by);
  });
  if (commanders.length) {
    sorted.unshift({
      key: 'commander',
      label: commanders.length > 1 ? 'Comandantes' : 'Comandante',
      cards: commanders,
      count: commanders.reduce((n, c) => n + c.quantity, 0),
    });
  }
  return sorted;
}
