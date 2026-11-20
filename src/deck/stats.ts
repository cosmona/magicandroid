// Estadísticas del mazo y utilidades de mano de prueba (funciones puras, sin React).
import { mainType, manaValue, type TypeKey } from '@/collection/organize';
import type { DeckCard } from '@/db/database';

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';
export const MANA_COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];

/** Última columna de la curva: «7+». */
export const CURVE_MAX = 7;

export interface DeckStats {
  /** Copias en el mazo (comandantes incluidos). */
  total: number;
  lands: number;
  /** Valor de maná medio de las copias que no son tierra. */
  averageCost: number;
  /** Copias que no son tierra por valor de maná (índice 0…CURVE_MAX, la última es «7+»). */
  curve: { creatures: number; others: number }[];
  /** Símbolos de color en los costes de maná (× copias). El híbrido cuenta para ambos colores. */
  symbols: Record<ManaColor, number>;
  /** Copias de tierra que pueden producir cada color. */
  sources: Record<ManaColor, number>;
  /** Copias por tipo principal, el más común primero. */
  types: { type: TypeKey; count: number }[];
  /** Número de tierras sugerido para un mazo de este tamaño. */
  landRange: [number, number];
  /** Tamaño de mazo para el que es el rango (el tamaño del formato, o el recuento actual). */
  landRangeSize: number;
}

const emptyColors = (): Record<ManaColor, number> => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });

const BASIC_TYPES: Record<string, ManaColor> = {
  Plains: 'W',
  Island: 'U',
  Swamp: 'B',
  Mountain: 'R',
  Forest: 'G',
};

/** Colores que puede dar una tierra: «Add {G}», «any color», tipos de tierra básica (duales) y básicas buscadas. */
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

/** Símbolos de color de un coste de maná: {W}=W, {W/U}=W+U, {2/W}={W/P}=W, {C}=C. */
function costSymbols(manaCost: string | null): ManaColor[] {
  const out: ManaColor[] = [];
  for (const [, sym] of (manaCost ?? '').matchAll(/\{([^}]+)\}/g))
    for (const c of sym.match(/[WUBRGC]/g) ?? []) out.push(c as ManaColor);
  return out;
}

/**
 * Valor de maná para la curva. Las cartas divididas y las Rooms («{1}{W} // {4}{W}{W}») cuentan como la
 * suma de ambas mitades para Scryfall, pero cada mitad se lanza por su cuenta: usa la más barata. Otras
 * cartas (aventuras, doble cara) mantienen el valor de Scryfall, que ya es la cara principal / frontal.
 */
export function curveCost(card: Pick<DeckCard, 'cmc' | 'manaCost'>): number {
  const halves = (card.manaCost ?? '').split(' // ').filter((h) => h.includes('{'));
  if (halves.length < 2) return card.cmc;
  const values = halves.map((h) => manaValue(h));
  // Solo las cartas divididas / Rooms suman ambas mitades; las aventuras y las de doble cara no.
  if (values.reduce((a, b) => a + b, 0) !== card.cmc) return card.cmc;
  return Math.min(...values);
}

/**
 * `format`: las reglas de tamaño del mazo para el consejo de tierras — el tamaño exacto de un mazo
 * estilo comandante (100 / 60), o 'limited' (40). Sin él, el consejo va por el número actual de cartas.
 */
export function deckStats(cards: DeckCard[], format?: { commanderSize?: number | null; limited?: boolean }): DeckStats {
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
    // Las tierras-criatura (Dryad Arbor) también son fuentes de maná, pero van en la curva como criaturas.
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

  // Los mazos estilo comandante juegan ~35-38 tierras; los de 60 cartas ~22-26 (40 % del mazo).
  const big = total >= 90;
  // Un mazo de Commander sin terminar sigue apuntando a su tamaño final (35-38 tierras en 100 cartas).
  const size = format?.commanderSize ?? (format?.limited ? 40 : total);
  const landRange: [number, number] = format?.commanderSize
    ? [Math.round(size * 0.35), Math.round(size * 0.38)]
    : format?.limited
      ? [16, 18]
      : [Math.round(total * (big ? 0.35 : 0.37)), Math.round(total * (big ? 0.38 : 0.43))];

  return {
    total,
    lands,
    averageCost: total - lands > 0 ? costSum / (total - lands) : 0,
    curve,
    symbols,
    sources,
    types: [...types].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    landRange,
    landRangeSize: size,
  };
}

// ---- Mano de prueba ----

/** Una copia de una carta en la biblioteca. */
export interface LibraryCard {
  key: string;
  card: DeckCard;
}

/** La biblioteca de la que robar: cada copia, sin los comandantes (empiezan en la zona de mando). */
export function buildLibrary(cards: DeckCard[], usesCommander: boolean): LibraryCard[] {
  return cards
    .filter((c) => !(usesCommander && c.isCommander))
    .flatMap((card) => Array.from({ length: card.quantity }, (_, i) => ({ key: `${card.oracleId}:${i}`, card })));
}

/** Barajado Fisher-Yates en un array nuevo. */
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

/** Probabilidad de robar entre `min` y `max` tierras en `draw` cartas de `size` cartas con `lands` tierras. */
export function landOdds(size: number, lands: number, draw: number, min: number, max: number): number {
  if (size < draw) return 0;
  let p = 0;
  for (let k = min; k <= max; k++) p += (choose(lands, k) * choose(size - lands, draw - k)) / choose(size, draw);
  return p;
}

// ---- Recomendación de tierras (como el «Recomendar tierras» de Arena) ----

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
  /** Tierras con las que debería acabar el mazo. */
  target: number;
  /** Básicas a añadir por color. */
  add: Record<BasicColor, number>;
  /** Cuántas básicas en total. */
  count: number;
  /** Tierras que aún faltan (objetivo − tierras). */
  needed: number;
}

/** Reparte `n` según `weights` con números enteros (mayor resto). */
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
 * Tierras básicas a añadir para que el mazo llegue a un número sensato de tierras, repartidas por colores:
 * cada color debería tener fuentes de tierra en proporción a sus símbolos de maná, así que las básicas van
 * primero a los colores cortos de fuentes.
 * - `deckSize`: tamaño exacto de los formatos estilo comandante (100 / 60), solo fija el objetivo: las tierras
 *   se añaden aunque el mazo se pase (el banner de validación lo avisa). null = construido (60+).
 * - `identity`: identidad de color del comandante («WG»), restringe los colores; null = usar los símbolos de maná.
 */
export function recommendLands(
  stats: DeckStats,
  deckSize: number | null,
  identity: string | null,
  limited = false,
): LandPlan {
  const nonLands = stats.total - stats.lands;
  // Limited (40 cartas): ~17 tierras. Construido: ~40 % y al menos 24. Commander: 37 %.
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
  // Fuentes que debería tener cada color una vez el mazo tenga `target` tierras, menos lo que ya tiene.
  const deficits = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const c of allowed) deficits[c] = Math.max(0, weights[c] * target - stats.sources[c]);
  const hasDeficit = allowed.some((c) => deficits[c] > 0);
  const add = apportion(count, hasDeficit ? deficits : weights);

  return { target, add, count: allowed.length ? count : 0, needed };
}
