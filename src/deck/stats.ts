// Deck statistics and sample-hand helpers (pure functions, no React).
import { mainType, manaValue, type TypeKey } from '@/collection/organize';
import type { DeckCard } from '@/db/database';

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';
export const MANA_COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];

/** Last column of the curve: "7+". */
export const CURVE_MAX = 7;

export interface DeckStats {
  /** Copies in the deck (commanders included). */
  total: number;
  lands: number;
  /** Average mana value of the non-land copies. */
  averageCost: number;
  /** Non-land copies per mana value (index 0…CURVE_MAX, the last one is "7+"). */
  curve: { creatures: number; others: number }[];
  /** Colored symbols in the mana costs (× copies). Hybrid counts for both colors. */
  symbols: Record<ManaColor, number>;
  /** Land copies that can produce each color. */
  sources: Record<ManaColor, number>;
  /** Copies per main type, most common first. */
  types: { type: TypeKey; count: number }[];
  /** Suggested number of lands for a deck of this size. */
  landRange: [number, number];
}

const emptyColors = (): Record<ManaColor, number> => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });

const BASIC_TYPES: Record<string, ManaColor> = {
  Plains: 'W',
  Island: 'U',
  Swamp: 'B',
  Mountain: 'R',
  Forest: 'G',
};

/** Colors a land can make: "Add {G}", "any color", basic land types (duals) and fetched basics. */
export function landColors(card: Pick<DeckCard, 'typeLine' | 'oracleText'>): Set<ManaColor> {
  const out = new Set<ManaColor>();
  const text = card.oracleText ?? '';
  if (/mana of any (one )?(color|type)|any color/i.test(text)) for (const c of 'WUBRG') out.add(c as ManaColor);
  for (const line of text.split('\n')) {
    if (!/\badd\b/i.test(line)) continue;
    for (const [, sym] of line.matchAll(/\{([WUBRGC])\}/g)) out.add(sym as ManaColor);
  }
  const words = `${card.typeLine} ${/search/i.test(text) ? text : ''}`;
  for (const [basic, color] of Object.entries(BASIC_TYPES))
    if (new RegExp(`\\b${basic}\\b`).test(words)) out.add(color);
  return out;
}

/** Colored symbols of one mana cost: {W}=W, {W/U}=W+U, {2/W}={W/P}=W, {C}=C. */
function costSymbols(manaCost: string | null): ManaColor[] {
  const out: ManaColor[] = [];
  for (const [, sym] of (manaCost ?? '').matchAll(/\{([^}]+)\}/g))
    for (const c of sym.match(/[WUBRGC]/g) ?? []) out.push(c as ManaColor);
  return out;
}

/**
 * Mana value for the curve. Split cards and Rooms ("{1}{W} // {4}{W}{W}") count as the sum of
 * both halves for Scryfall, but each half is cast on its own: use the cheaper one. Other cards
 * (adventures, double-faced) keep Scryfall's value, which is already the main / front face.
 */
export function curveCost(card: Pick<DeckCard, 'cmc' | 'manaCost'>): number {
  const halves = (card.manaCost ?? '').split(' // ').filter((h) => h.includes('{'));
  if (halves.length < 2) return card.cmc;
  const values = halves.map((h) => manaValue(h));
  // Only split cards / Rooms add both halves up; adventures and double-faced cards don't.
  if (values.reduce((a, b) => a + b, 0) !== card.cmc) return card.cmc;
  return Math.min(...values);
}

export function deckStats(cards: DeckCard[]): DeckStats {
  const curve = Array.from({ length: CURVE_MAX + 1 }, () => ({ creatures: 0, others: 0 }));
  const symbols = emptyColors();
  const sources = emptyColors();
  const types = new Map<TypeKey, number>();
  let total = 0;
  let lands = 0;
  let costSum = 0;

  for (const card of cards) {
    const n = card.quantity;
    const type = mainType(card.typeLine);
    total += n;
    types.set(type, (types.get(type) ?? 0) + n);
    // Creature lands (Dryad Arbor) are mana sources too, but go in the curve as creatures.
    if (/\bLand\b/.test(card.typeLine.split(' // ')[0])) for (const c of landColors(card)) sources[c] += n;
    if (type === 'land') {
      lands += n;
      continue;
    }
    const cost = curveCost(card);
    costSum += cost * n;
    const column = curve[Math.min(Math.floor(cost), CURVE_MAX)];
    if (type === 'creature') column.creatures += n;
    else column.others += n;
    for (const c of costSymbols(card.manaCost)) symbols[c] += n;
  }

  // Commander-size decks play ~35-38 lands; 60-card decks ~22-26 (40 % of the deck).
  const big = total >= 90;
  const landRange: [number, number] = [
    Math.round(total * (big ? 0.35 : 0.37)),
    Math.round(total * (big ? 0.38 : 0.43)),
  ];

  return {
    total,
    lands,
    averageCost: total - lands > 0 ? costSum / (total - lands) : 0,
    curve,
    symbols,
    sources,
    types: [...types].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    landRange,
  };
}

// ---- Sample hand ----

/** One copy of a card in the library. */
export interface LibraryCard {
  key: string;
  card: DeckCard;
}

/** The library to draw from: every copy, without the commanders (they start in the command zone). */
export function buildLibrary(cards: DeckCard[], usesCommander: boolean): LibraryCard[] {
  return cards
    .filter((c) => !(usesCommander && c.isCommander))
    .flatMap((card) => Array.from({ length: card.quantity }, (_, i) => ({ key: `${card.oracleId}:${i}`, card })));
}

/** Fisher-Yates shuffle into a new array. */
export function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Chance of drawing between `min` and `max` lands in `draw` cards from `size` cards holding `lands`. */
export function landOdds(size: number, lands: number, draw: number, min: number, max: number): number {
  if (size < draw) return 0;
  let p = 0;
  for (let k = min; k <= max; k++) p += (choose(lands, k) * choose(size - lands, draw - k)) / choose(size, draw);
  return p;
}

// ---- Land recommendation (like Arena's "Recommend lands") ----

export type BasicColor = 'W' | 'U' | 'B' | 'R' | 'G';
export const BASIC_COLORS: BasicColor[] = ['W', 'U', 'B', 'R', 'G'];
export const BASIC_NAMES: Record<BasicColor, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

export interface LandPlan {
  /** Lands the deck should end up with. */
  target: number;
  /** Basics to add per color. */
  add: Record<BasicColor, number>;
  /** How many basics in total. */
  count: number;
  /** Lands still missing (target − lands). */
  needed: number;
}

/** Splits `n` by `weights` with whole numbers (largest remainder). */
function apportion(n: number, weights: Record<BasicColor, number>): Record<BasicColor, number> {
  const out: Record<BasicColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const sum = BASIC_COLORS.reduce((s, c) => s + weights[c], 0);
  if (n <= 0 || sum <= 0) return out;
  const exact = BASIC_COLORS.map((c) => ({ c, v: (n * weights[c]) / sum }));
  for (const e of exact) out[e.c] = Math.floor(e.v);
  let left = n - BASIC_COLORS.reduce((s, c) => s + out[c], 0);
  for (const e of [...exact].sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)))) {
    if (left-- <= 0) break;
    out[e.c]++;
  }
  return out;
}

/**
 * Basic lands to add so the deck reaches a sensible land count, split by colors: each color
 * should have land sources in proportion to its mana symbols, so the basics go first to the
 * colors short of sources.
 * - `deckSize`: exact size of commander-style formats (100 / 60), only sets the target: lands are added even
 *   if the deck goes over it (the validation banner then says so). null = constructed (60+).
 * - `identity`: commander color identity ("WG"), restricts the colors; null = use the mana symbols.
 */
export function recommendLands(
  stats: DeckStats,
  deckSize: number | null,
  identity: string | null,
  limited = false,
): LandPlan {
  const nonLands = stats.total - stats.lands;
  // Limited (40 cards): ~17 lands. Constructed: ~40 % and at least 24. Commander: 37 %.
  const target =
    deckSize !== null
      ? Math.round(deckSize * 0.37)
      : limited
        ? Math.max(16, Math.round(Math.max(40, nonLands + 17) * 0.425))
        : Math.max(24, Math.round((nonLands + 24) * 0.4));
  const needed = Math.max(0, target - stats.lands);
  const count = needed;

  const allowed = BASIC_COLORS.filter((c) => (identity !== null ? identity.includes(c) : stats.symbols[c] > 0));
  const weights = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const symbolSum = allowed.reduce((s, c) => s + stats.symbols[c], 0);
  for (const c of allowed) weights[c] = symbolSum > 0 ? stats.symbols[c] / symbolSum : 1 / allowed.length;
  // Sources each color should have once the deck has `target` lands, minus what it already has.
  const deficits = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const c of allowed) deficits[c] = Math.max(0, weights[c] * target - stats.sources[c]);
  const hasDeficit = allowed.some((c) => deficits[c] > 0);
  const add = apportion(count, hasDeficit ? deficits : weights);

  return { target, add, count: allowed.length ? count : 0, needed };
}
