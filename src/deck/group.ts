// Groups of a deck's cards for the deck sheet (pure, no React).
import { cardColors, mainType, TYPE_GROUP_LABELS, type TypeKey } from '@/collection/organize';
import type { DeckCard } from '@/db/database';
import { CURVE_MAX, curveCost } from '@/deck/stats';

export type DeckGroupBy = 'none' | 'type' | 'cost' | 'color' | 'rarity';

export const DECK_GROUP_OPTIONS: { key: DeckGroupBy; label: string }[] = [
  { key: 'type', label: 'Tipo' },
  { key: 'cost', label: 'Coste' },
  { key: 'color', label: 'Color' },
  { key: 'rarity', label: 'Rareza' },
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
export function groupDeck(cards: DeckCard[], by: DeckGroupBy, usesCommander: boolean): DeckGroup[] {
  const groups = new Map<string, DeckGroup>();
  const commanders = usesCommander ? cards.filter((c) => c.isCommander) : [];
  for (const card of cards) {
    if (commanders.includes(card)) continue;
    const { key, label } = groupOf(card, by);
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { key, label, cards: [], count: 0 }));
    group.cards.push(card);
    group.count += card.quantity;
  }
  const sorted = [...groups.values()].sort((a, b) => orderOf(a.key, by) - orderOf(b.key, by));
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
