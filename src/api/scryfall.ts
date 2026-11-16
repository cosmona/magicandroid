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
  /** Scryfall language code of this printing (en, es, fr, de, it, pt, ja, ko, ru, zhs, zht…). */
  lang: string;
  set: string;
  /** Color identity letters, e.g. ['W', 'U']; [] = colorless. */
  colorIdentity: string[];
  /** Scryfall format key → 'legal' | 'not_legal' | 'banned' | 'restricted'. */
  legalities: Record<string, string>;
  /** Same for every printing that reuses an artwork (alternate arts have their own). */
  illustrationId?: string;
  setName?: string;
  /** 'YYYY-MM-DD' */
  releasedAt?: string;
}

export interface SearchPage {
  cards: Card[];
  nextPage: string | null;
  total: number;
}

let lastRequest = 0;

async function scryfallFetch(url: string, init?: { method: 'POST'; body: string }): Promise<Response> {
  const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  if (!init) return fetch(url, { headers: HEADERS });
  return fetch(url, { ...init, headers: { ...HEADERS, 'Content-Type': 'application/json' } });
}

const clean = (s: string) => s.replace(/"/g, '').trim();

/** Lowercase without accents ("Relámpago" → "relampago"). */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

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

/**
 * Translates the filters into a Scryfall search query (https://scryfall.com/docs/syntax).
 * Results come in English; `anyLanguage` also matches foreign printed names (used as a
 * fallback when a name search finds nothing, e.g. a Spanish name).
 */
export function buildQuery(f: Filters, anyLanguage = false): string {
  const parts: (string | null)[] = ['game:paper'];
  // One unquoted `name:` per word: unquoted terms ignore accents on the card side
  // ("relampago" finds "Relámpago", a quoted "relampago" doesn't), but accents in the
  // query itself never match, so strip them too.
  const nameWords = fold(clean(f.name))
    .split(/[^\p{L}\p{N}'-]+/u)
    .filter(Boolean);
  for (const word of nameWords) parts.push(`name:${word}`);
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
  if (anyLanguage) parts.push('lang:any');
  return parts.filter(Boolean).join(' ');
}

/** Number of filters that differ from the defaults (ignoring sort), for the status bar badge. */
export function activeFilterCount(f: Filters): number {
  const ignore: (keyof Filters)[] = ['order', 'dir', 'colorMode'];
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
  illustration_id?: string;
}
interface ScryfallCard extends ScryfallFace {
  id: string;
  name: string;
  printed_name?: string;
  type_line?: string;
  printed_type_line?: string;
  cmc?: number;
  rarity: string;
  lang: string;
  set: string;
  set_name?: string;
  released_at?: string;
  color_identity?: string[];
  legalities?: Record<string, string>;
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
    lang: c.lang,
    set: c.set,
    colorIdentity: c.color_identity ?? [],
    legalities: c.legalities ?? {},
    illustrationId: c.illustration_id ?? faces[0]?.illustration_id,
    setName: c.set_name,
    releasedAt: c.released_at,
  };
}

async function fetchPage(url: string): Promise<SearchPage> {
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

const searchUrl = (filters: Filters, anyLanguage: boolean) =>
  `${BASE_URL}/cards/search?` +
  new URLSearchParams({ q: buildQuery(filters, anyLanguage), order: filters.order, dir: filters.dir }).toString();

/** Fetch the first page for `filters`, or a follow-up page via its `nextPage` URL. */
export async function searchCards(filters: Filters, nextPage?: string): Promise<SearchPage> {
  if (nextPage) return fetchPage(nextPage);
  const page = await fetchPage(searchUrl(filters, false));
  // A name typed in another language (e.g. "relámpago") only matches foreign printings:
  // if no English name contains the words, search every language instead.
  const words = fold(filters.name).split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);
  const englishHit = page.cards.some((c) => words.every((w) => fold(c.name).includes(w)));
  if (words.length && !englishHit) return fetchPage(searchUrl(filters, true));
  return page;
}

/** Cards by Scryfall id, 75 per request (POST /cards/collection). Unknown ids are skipped. */
export async function getCardsByIds(ids: string[]): Promise<Card[]> {
  const out: Card[] = [];
  for (let i = 0; i < ids.length; i += 75) {
    const res = await scryfallFetch(`${BASE_URL}/cards/collection`, {
      method: 'POST',
      body: JSON.stringify({ identifiers: ids.slice(i, i + 75).map((id) => ({ id })) }),
    });
    if (!res.ok) throw new Error(`Error ${res.status} de Scryfall`);
    out.push(...((await res.json()).data as ScryfallCard[]).map(toCard));
  }
  return out;
}

/** Cards by exact English name (front face for double-faced ones), 75 per request. Unknown names are skipped. */
export async function getCardsByNames(names: string[]): Promise<Card[]> {
  const out: Card[] = [];
  for (let i = 0; i < names.length; i += 75) {
    const res = await scryfallFetch(`${BASE_URL}/cards/collection`, {
      method: 'POST',
      body: JSON.stringify({ identifiers: names.slice(i, i + 75).map((n) => ({ name: n.split(' // ')[0] })) }),
    });
    if (!res.ok) throw new Error(`Error ${res.status} de Scryfall`);
    out.push(...((await res.json()).data as ScryfallCard[]).map(toCard));
  }
  return out;
}

/** One card from a Scryfall endpoint that returns a single card; null on 404. */
async function getSingleCard(path: string): Promise<Card | null> {
  const res = await scryfallFetch(`${BASE_URL}${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Error ${res.status} de Scryfall`);
  return toCard(await res.json());
}

/** A printing by set code + collector number, optionally in a language (`/cards/:set/:number/:lang`). */
export const getCardBySetNumber = (set: string, number: string, lang?: string) =>
  getSingleCard(
    `/cards/${encodeURIComponent(set.toLowerCase())}/${encodeURIComponent(number)}` +
      (lang ? `/${encodeURIComponent(lang)}` : ''),
  );

/** Best match for a possibly misspelled English name (`/cards/named?fuzzy=`). */
export const getCardByFuzzyName = (name: string) =>
  getSingleCard(`/cards/named?${new URLSearchParams({ fuzzy: name }).toString()}`);

/** `card` printed in `set` (in `lang` if there is one), or null. */
export async function getCardInSet(card: Card, set: string, lang?: string): Promise<Card | null> {
  const q = `oracleid:${card.oracleId} e:${set.toLowerCase()}`;
  if (lang) {
    const inLang = await fetchPage(printsUrl(`${q} lang:${lang}`));
    if (inLang.cards[0]) return inLang.cards[0];
  }
  return (await fetchPage(printsUrl(q))).cards[0] ?? null;
}

/** Spanish-facing names of Scryfall language codes. */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский',
  zhs: '简体中文',
  zht: '繁體中文',
  he: 'עברית',
  la: 'Latina',
  grc: 'Ἑλληνική',
  ar: 'العربية',
  sa: 'संस्कृतम्',
  ph: 'Phyrexian',
};

const languageCache = new Map<string, Promise<Card[]>>();

/**
 * One printing per language available for `card` (Scryfall `oracleid:` + `lang:any`).
 * Prefers the same set as `card`, otherwise the most recent printing in that language.
 * Cached per card for the app's lifetime.
 */
export function getCardLanguages(card: Card): Promise<Card[]> {
  const key = `${card.oracleId}|${card.set}`;
  let promise = languageCache.get(key);
  if (!promise) {
    const url =
      `${BASE_URL}/cards/search?` +
      new URLSearchParams({
        q: `oracleid:${card.oracleId} lang:any`,
        unique: 'prints',
        include_multilingual: 'true',
        order: 'released',
      }).toString();
    promise = fetchPage(url).then(({ cards }) => {
      const byLang = new Map<string, Card>();
      for (const c of cards) {
        const prev = byLang.get(c.lang);
        if (!prev || (c.set === card.set && prev.set !== card.set)) byLang.set(c.lang, c);
      }
      byLang.set(card.lang, card);
      const order = Object.keys(LANGUAGE_NAMES);
      return [...byLang.values()].sort((a, b) => order.indexOf(a.lang) - order.indexOf(b.lang));
    });
    promise.catch(() => languageCache.delete(key));
    languageCache.set(key, promise);
  }
  return promise;
}

/** Languages offered as the default card language in settings. */
export const MAIN_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'ru', 'zhs', 'zht'];

const localizedCache = new Map<string, Promise<Card | null>>();

const printsUrl = (q: string) =>
  `${BASE_URL}/cards/search?` +
  new URLSearchParams({ q, unique: 'prints', include_multilingual: 'true', order: 'released' }).toString();

/**
 * `card` printed in `lang`, or null if Scryfall has none. Tries the same set first
 * (a one-result query) and only then any set, to keep responses small. Cached.
 */
export function getCardInLanguage(card: Card, lang: string): Promise<Card | null> {
  if (card.lang === lang) return Promise.resolve(card);
  const key = `${card.oracleId}|${card.set}|${lang}`;
  let promise = localizedCache.get(key);
  if (!promise) {
    promise = (async () => {
      const sameSet = await fetchPage(printsUrl(`oracleid:${card.oracleId} lang:${lang} e:${card.set}`));
      if (sameSet.cards[0]) return sameSet.cards[0];
      const anySet = await fetchPage(printsUrl(`oracleid:${card.oracleId} lang:${lang}`));
      return anySet.cards[0] ?? null;
    })();
    promise.catch(() => localizedCache.delete(key));
    localizedCache.set(key, promise);
  }
  return promise;
}

const artsCache = new Map<string, Promise<Card[]>>();

/**
 * One printing per artwork of `card` (Scryfall `unique=art`), newest first, the current
 * one first. Prefers printings in the card's language; artworks never printed in it come
 * in English. Cached.
 */
export function getCardArts(card: Card): Promise<Card[]> {
  const key = `${card.oracleId}|${card.lang}`;
  let promise = artsCache.get(key);
  if (!promise) {
    const artsUrl = (lang: string) =>
      `${BASE_URL}/cards/search?` +
      new URLSearchParams({
        q: `oracleid:${card.oracleId} lang:${lang}`,
        unique: 'art',
        include_multilingual: 'true',
        order: 'released',
        dir: 'desc',
      }).toString();
    promise = (async () => {
      const own = card.lang === 'en' ? [] : (await fetchPage(artsUrl(card.lang))).cards;
      const english = (await fetchPage(artsUrl('en'))).cards;
      const byArt = new Map<string, Card>();
      for (const c of [...own, ...english]) {
        const art = c.illustrationId ?? c.id;
        if (!byArt.has(art)) byArt.set(art, c);
      }
      return [...byArt.values()];
    })();
    promise.catch(() => artsCache.delete(key));
    artsCache.set(key, promise);
  }
  const current = card.illustrationId ?? card.id;
  return promise.then((arts) => [card, ...arts.filter((c) => (c.illustrationId ?? c.id) !== current)]);
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

interface RawSet {
  code: string;
  name: string;
  released_at?: string;
  set_type: string;
  digital: boolean;
  icon_svg_uri: string;
}
const toSet = (s: RawSet): MtgSet => ({
  code: s.code,
  name: s.name,
  releasedAt: s.released_at ?? '',
  iconUrl: s.icon_svg_uri,
});
const getSetCatalog = cached(async (): Promise<RawSet[]> => (await getJson('/sets')).data as RawSet[]);

/** Every set (promos, tokens… included) by code: names and dates for the collection. */
export const getAllSets = cached(async (): Promise<Record<string, MtgSet>> =>
  Object.fromEntries((await getSetCatalog()).map((s) => [s.code, toSet(s)])),
);

/** Paper sets for the set filter, newest first. */
export const getSets = cached(async (): Promise<MtgSet[]> => {
  return (await getSetCatalog())
    .filter((s) => !s.digital && PLAYABLE_SET_TYPES.has(s.set_type))
    .map(toSet)
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
});

/** Scryfall CDN: the `art_crop` version of a `normal` image URL (illustration only). */
export const artCropUrl = (imageUrl: string) => imageUrl.replace('/normal/', '/art_crop/');

/** Scryfall CDN: ~15 KB thumbnail (146×204) of a `normal` image URL (~105 KB). */
export const smallImageUrl = (imageUrl: string) => imageUrl.replace('/normal/', '/small/');

export const displayName = (c: { name: string; printedName: string | null }) =>
  c.printedName ?? c.name;

// ---------- Prices, stats and tokens of saved cards ----------

/** Live data of a printing that isn't stored locally (prices change daily). */
export interface CardDetails {
  /** Cardmarket trend price in €, non-foil (foil if that's the only one); null = unknown. */
  eur: number | null;
  /** The card's product page on Cardmarket (Spanish site). */
  cardmarketUrl: string | null;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  /** Tokens/emblems the card makes (`all_parts` with component "token"). */
  tokens: { id: string; name: string; typeLine: string }[];
}

interface ScryfallStats {
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
}
interface ScryfallDetailsCard extends ScryfallStats {
  id: string;
  lang: string;
  set: string;
  collector_number: string;
  prices?: { eur?: string | null; eur_foil?: string | null };
  purchase_uris?: { cardmarket?: string };
  card_faces?: ScryfallStats[];
  all_parts?: { id: string; component: string; name: string; type_line: string }[];
}

const priceOf = (c: ScryfallDetailsCard) => {
  const raw = c.prices?.eur ?? c.prices?.eur_foil;
  return raw ? Number(raw) : null;
};
const spanishSite = (url?: string) => (url ? url.replace('cardmarket.com/en/', 'cardmarket.com/es/') : null);

async function postCollection(identifiers: object[]): Promise<ScryfallDetailsCard[]> {
  const out: ScryfallDetailsCard[] = [];
  for (let i = 0; i < identifiers.length; i += 75) {
    const res = await scryfallFetch(`${BASE_URL}/cards/collection`, {
      method: 'POST',
      body: JSON.stringify({ identifiers: identifiers.slice(i, i + 75) }),
    });
    if (!res.ok) throw new Error(`Error ${res.status} de Scryfall`);
    out.push(...((await res.json()).data as ScryfallDetailsCard[]));
  }
  return out;
}

async function loadDetails(ids: string[]): Promise<Record<string, CardDetails>> {
  const cards = await postCollection(ids.map((id) => ({ id })));
  // Scryfall only prices English printings (and a few others): price the rest with the
  // English printing of the same set + number.
  const unpriced = cards.filter((c) => priceOf(c) === null && c.lang !== 'en');
  const english = new Map<string, ScryfallDetailsCard>();
  if (unpriced.length) {
    const found = await postCollection(
      unpriced.map((c) => ({ set: c.set, collector_number: c.collector_number })),
    ).catch(() => []);
    for (const e of found) english.set(`${e.set}/${e.collector_number}`, e);
  }
  const out: Record<string, CardDetails> = {};
  for (const c of cards) {
    const en = english.get(`${c.set}/${c.collector_number}`);
    const face = c.card_faces?.[0] ?? {};
    out[c.id] = {
      eur: priceOf(c) ?? (en ? priceOf(en) : null),
      cardmarketUrl: spanishSite(en?.purchase_uris?.cardmarket ?? c.purchase_uris?.cardmarket),
      power: c.power ?? face.power,
      toughness: c.toughness ?? face.toughness,
      loyalty: c.loyalty ?? face.loyalty,
      defense: c.defense ?? face.defense,
      tokens: (c.all_parts ?? [])
        .filter((p) => p.component === 'token' && p.id !== c.id)
        .map((p) => ({ id: p.id, name: p.name, typeLine: p.type_line })),
    };
  }
  return out;
}

const detailsCache = new Map<string, Promise<CardDetails | null>>();

/** Prices, stats and tokens for these printings; fetched once per app run and shared. */
export async function getCardDetails(ids: string[]): Promise<Record<string, CardDetails>> {
  const missing = [...new Set(ids)].filter((id) => !detailsCache.has(id));
  if (missing.length) {
    const batch = loadDetails(missing);
    for (const id of missing) {
      detailsCache.set(
        id,
        batch.then(
          (all) => all[id] ?? null,
          () => {
            detailsCache.delete(id); // retry next time
            return null;
          },
        ),
      );
    }
  }
  const entries = await Promise.all(ids.map(async (id) => [id, await detailsCache.get(id)] as const));
  const out: Record<string, CardDetails> = {};
  for (const [id, d] of entries) if (d) out[id] = d;
  return out;
}

/** Mana/tap symbols ("{2}", "{W/U}", "{T}") → SVG URL. */
export const getSymbols = cached(async (): Promise<Record<string, string>> => {
  const body = await getJson('/symbology');
  const out: Record<string, string> = {};
  for (const s of body.data as { symbol: string; svg_uri?: string }[]) if (s.svg_uri) out[s.symbol] = s.svg_uri;
  return out;
});

// ---------- Full card data (card info screen) ----------

/** The complete Scryfall card object, as returned (`/cards/:id`). */
export type RawCard = Record<string, unknown>;

export async function getRawCard(id: string): Promise<RawCard> {
  return getJson(`/cards/${encodeURIComponent(id)}`);
}

export interface Ruling {
  source: string;
  published_at: string;
  comment: string;
}

/** Official rulings/clarifications of a card (its `rulings_uri`). */
export async function getRulings(rulingsUri: string): Promise<Ruling[]> {
  const res = await scryfallFetch(rulingsUri);
  if (!res.ok) throw new Error(`Error ${res.status} de Scryfall`);
  return (await res.json()).data as Ruling[];
}
