// Client for the Scryfall API (https://scryfall.com/docs/api).
// Scryfall requires a User-Agent + Accept header and asks clients to keep
// requests ~100 ms apart, so every request goes through `scryfallFetch`.

const BASE_URL = 'https://api.scryfall.com';
const HEADERS = { 'User-Agent': 'MagicSwipe/1.0', Accept: 'application/json' };
const MIN_INTERVAL_MS = 100;

export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';
export type SortOrder = 'edhrec' | 'name' | 'released' | 'cmc';

export interface Filters {
  /** Color identity subset: cards playable in a deck of these colors. Empty = any. */
  colors: Color[];
  rarities: Rarity[];
  /** Card types (Scryfall `t:` values), OR-combined. */
  types: string[];
  name: string;
  text: string;
  /** Scryfall format key (`f:`), null = any. */
  format: string | null;
  /** Only Spanish printings (Spanish name + image). */
  spanish: boolean;
  order: SortOrder;
}

export const DEFAULT_FILTERS: Filters = {
  colors: [],
  rarities: [],
  types: [],
  name: '',
  text: '',
  format: null,
  spanish: true,
  order: 'edhrec',
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

export function buildQuery(f: Filters): string {
  const parts: string[] = ['game:paper'];
  if (f.colors.length) parts.push(`id<=${f.colors.join('').toLowerCase()}`);
  if (f.rarities.length) parts.push(`(${f.rarities.map((r) => `r:${r}`).join(' or ')})`);
  if (f.types.length) parts.push(`(${f.types.map((t) => `t:${t}`).join(' or ')})`);
  if (clean(f.name)) parts.push(`name:"${clean(f.name)}"`);
  if (clean(f.text)) parts.push(`o:"${clean(f.text)}"`);
  if (f.format) parts.push(`f:${f.format}`);
  if (f.spanish) parts.push('lang:es');
  return parts.join(' ');
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
      new URLSearchParams({ q: buildQuery(filters), order: filters.order }).toString();

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

export const displayName = (c: { name: string; printedName: string | null }) =>
  c.printedName ?? c.name;
