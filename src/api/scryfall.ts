// Client for the Scryfall API (https://scryfall.com/docs/api).
// Scryfall requires a User-Agent + Accept header and asks clients to keep
// requests ~100 ms apart, so every request goes through `scryfallFetch`.

const BASE_URL = 'https://api.scryfall.com';
const HEADERS = { 'User-Agent': 'MagicSwipe/1.0', Accept: 'application/json' };
const MIN_INTERVAL_MS = 100;

export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';
export type SortOrder = 'edhrec' | 'name' | 'released' | 'cmc' | 'usd';
export type SortDir = 'auto' | 'asc' | 'desc';
/**
 * How the selected colors are matched:
 * - identity: playable in a deck of these colors (color identity ⊆ selection, colorless included)
 * - exact: exactly these colors
 * - include: has at least these colors
 */
export type ColorMode = 'identity' | 'exact' | 'include';

export interface Filters {
  /** Part of the name (Spanish or English). */
  name: string;
  /** Rules text (Scryfall searches the English oracle text). */
  text: string;
  colors: Color[];
  colorless: boolean;
  colorMode: ColorMode;
  /** Main card types (Scryfall catalog values), OR-combined. */
  types: string[];
  legendary: boolean;
  /** Free subtype words in English (e.g. "elf wizard"), all must match. */
  subtype: string;
  cmcMin: number | null;
  cmcMax: number | null;
  rarities: Rarity[];
  /** Keyword abilities (Scryfall catalog values), all must match. */
  keywords: string[];
  /** Scryfall format key (`f:`), null = any. */
  format: string | null;
  /** Set code (`e:`), null = any. */
  set: string | null;
  /** Only Spanish printings (Spanish name + image). */
  spanish: boolean;
  order: SortOrder;
  dir: SortDir;
}

export const DEFAULT_FILTERS: Filters = {
  name: '',
  text: '',
  colors: [],
  colorless: false,
  colorMode: 'identity',
  types: [],
  legendary: false,
  subtype: '',
  cmcMin: null,
  cmcMax: null,
  rarities: [],
  keywords: [],
  format: null,
  set: null,
  spanish: true,
  order: 'edhrec',
  dir: 'auto',
};

/** Card as used by the app (flattened from Scryfall's card object). */
export interface Card {
  id: string;
  /** Same for every printing/language of a card: used to count copies in a deck. */
  oracleId: string;
  name: string;
  /** Localized name (e.g. Spanish) when the printing isn't English. */
  printedName: string | null;
  typeLine: string;
  manaCost: string;
  cmc: number;
  rarity: string;
  oracleText: string;
  imageUrl: string | null;
  /** Back face image for double-faced cards. */
  backImageUrl: string | null;
}

export interface SearchPage {
  cards: Card[];
  nextPage: string | null;
  total: number;
}

let lastRequest = 0;

async function scryfallFetch(url: string): Promise<Response> {
  const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  return fetch(url, { headers: HEADERS });
}

const clean = (s: string) => s.replace(/"/g, '').trim();

const anyOf = (terms: string[]) => (terms.length === 1 ? terms[0] : `(${terms.join(' or ')})`);

function colorTerm(f: Filters): string | null {
  const c = f.colors.join('').toLowerCase();
  if (!c) {
    if (!f.colorless) return null;
    return f.colorMode === 'identity' ? 'id:c' : 'c:c';
  }
  switch (f.colorMode) {
    case 'identity':
      return `id<=${c}`; // colorless cards always fit
    case 'exact':
      return f.colorless ? `(c=${c} or c:c)` : `c=${c}`;
    case 'include':
      return `c>=${c}`;
  }
}

/** Translates the filters into a Scryfall search query (https://scryfall.com/docs/syntax). */
export function buildQuery(f: Filters): string {
  const parts: (string | null)[] = ['game:paper'];
  // Scryfall folds accents in card names but not in the query: "dragon" finds "Dragón", "dragón" finds nothing.
  const name = clean(f.name).normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (name) parts.push(`name:"${name}"`);
  if (clean(f.text)) parts.push(`o:"${clean(f.text)}"`);
  parts.push(colorTerm(f));
  if (f.types.length) parts.push(anyOf(f.types.map((t) => `t:${t.toLowerCase()}`)));
  if (f.legendary) parts.push('t:legendary');
  for (const word of clean(f.subtype).split(/[\s,]+/).filter(Boolean)) parts.push(`t:${word}`);
  if (f.cmcMin !== null) parts.push(`cmc>=${f.cmcMin}`);
  if (f.cmcMax !== null) parts.push(`cmc<=${f.cmcMax}`);
  if (f.rarities.length) parts.push(anyOf(f.rarities.map((r) => `r:${r}`)));
  for (const k of f.keywords) parts.push(`keyword:"${k}"`);
  if (f.format) parts.push(`f:${f.format}`);
  if (f.set) parts.push(`e:${f.set}`);
  if (f.spanish) parts.push('lang:es');
  return parts.filter(Boolean).join(' ');
}

/** Number of filters that differ from the defaults (ignoring sort), for the status bar badge. */
export function activeFilterCount(f: Filters): number {
  const ignore: (keyof Filters)[] = ['order', 'dir', 'colorMode', 'spanish'];
  return (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).filter(
    (k) => !ignore.includes(k) && JSON.stringify(f[k]) !== JSON.stringify(DEFAULT_FILTERS[k]),
  ).length;
}

// Minimal shape of the Scryfall fields we read.
interface ScryfallFace {
  oracle_id?: string;
  oracle_text?: string;
  mana_cost?: string;
  image_uris?: { normal: string };
}
interface ScryfallCard extends ScryfallFace {
  id: string;
  name: string;
  printed_name?: string;
  type_line?: string;
  printed_type_line?: string;
  cmc?: number;
  rarity: string;
  card_faces?: ScryfallFace[];
}

function toCard(c: ScryfallCard): Card {
  const faces = c.card_faces ?? [];
  return {
    id: c.id,
    oracleId: c.oracle_id ?? faces[0]?.oracle_id ?? c.id,
    name: c.name,
    printedName: c.printed_name ?? null,
    typeLine: c.type_line ?? '',
    manaCost: c.mana_cost ?? faces.map((f) => f.mana_cost).filter(Boolean).join(' // '),
    cmc: c.cmc ?? 0,
    rarity: c.rarity,
    oracleText: c.oracle_text ?? faces.map((f) => f.oracle_text ?? '').join('\n'),
    imageUrl: c.image_uris?.normal ?? faces[0]?.image_uris?.normal ?? null,
    backImageUrl: c.image_uris ? null : faces[1]?.image_uris?.normal ?? null,
  };
}

/** Fetch the first page for `filters`, or a follow-up page via its `nextPage` URL. */
export async function searchCards(filters: Filters, nextPage?: string): Promise<SearchPage> {
  const url =
    nextPage ??
    `${BASE_URL}/cards/search?` +
      new URLSearchParams({ q: buildQuery(filters), order: filters.order, dir: filters.dir }).toString();

  const res = await scryfallFetch(url);
  const body = await res.json();
  if (res.status === 404 && body.code === 'not_found') {
    return { cards: [], nextPage: null, total: 0 };
  }
  if (!res.ok) throw new Error(body.details ?? `Error ${res.status} de Scryfall`);

  return {
    cards: (body.data as ScryfallCard[]).map(toCard).filter((c) => c.imageUrl),
    nextPage: body.has_more ? body.next_page : null,
    total: body.total_cards ?? 0,
  };
}

/** Memoizes a fetch for the app's lifetime; a failed attempt can be retried. */
function cached<T>(load: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => {
    promise ??= load().catch((e) => {
      promise = null;
      throw e;
    });
    return promise;
  };
}

async function getJson(path: string) {
  const res = await scryfallFetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Error ${res.status} de Scryfall`);
  return res.json();
}

/** Keyword abilities for the keyword filter, alphabetically. */
export const getKeywords = cached(async (): Promise<string[]> => {
  const body = await getJson('/catalog/keyword-abilities');
  return (body.data as string[]).sort((a, b) => a.localeCompare(b));
});

export interface MtgSet {
  code: string;
  name: string;
  releasedAt: string;
  iconUrl: string;
}

// Only sets that contain normal playable cards (no tokens, promos, memorabilia...).
const PLAYABLE_SET_TYPES = new Set([
  'core',
  'expansion',
  'masters',
  'draft_innovation',
  'commander',
  'starter',
  'funny',
  'eternal',
  'duel_deck',
]);

/** Paper sets for the set filter, newest first. */
export const getSets = cached(async (): Promise<MtgSet[]> => {
  const body = await getJson('/sets');
  return (
    body.data as {
      code: string;
      name: string;
      released_at?: string;
      set_type: string;
      digital: boolean;
      icon_svg_uri: string;
    }[]
  )
    .filter((s) => !s.digital && PLAYABLE_SET_TYPES.has(s.set_type))
    .map((s) => ({ code: s.code, name: s.name, releasedAt: s.released_at ?? '', iconUrl: s.icon_svg_uri }))
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
});

/** Scryfall CDN: the `art_crop` version of a `normal` image URL (illustration only). */
export const artCropUrl = (imageUrl: string) => imageUrl.replace('/normal/', '/art_crop/');

export const displayName = (c: { name: string; printedName: string | null }) =>
  c.printedName ?? c.name;
