// Cliente de la API de Scryfall (https://scryfall.com/docs/api).
// Scryfall exige una cabecera User-Agent + Accept y pide a los clientes que dejen
// ~100 ms entre peticiones, así que cada petición pasa por `scryfallFetch`.

import { rulesQuery } from '@/api/rulesGlossary';
import { ARENA_FORMATS, DECK_ONLY_FORMATS } from '@/theme';

const BASE_URL = 'https://api.scryfall.com';
const HEADERS = { 'User-Agent': 'MagicSwipe/1.0', Accept: 'application/json' };
const MIN_INTERVAL_MS = 100;

export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';
export type SortOrder = 'edhrec' | 'name' | 'released' | 'cmc' | 'usd';
export type SortDir = 'auto' | 'asc' | 'desc';
/**
 * Cómo se cruzan los colores seleccionados:
 * - identity: jugable en un mazo de estos colores (identidad de color ⊆ selección, incoloro incluido)
 * - exact: exactamente estos colores
 * - include: tiene al menos estos colores
 */
export type ColorMode = 'identity' | 'exact' | 'include';

export interface Filters {
  /** Parte del nombre (español o inglés). */
  name: string;
  /** Texto de reglas (Scryfall busca en el texto oracle en inglés). */
  text: string;
  colors: Color[];
  colorless: boolean;
  colorMode: ColorMode;
  /** Tipos de carta principales (valores del catálogo de Scryfall), combinados con OR. */
  types: string[];
  legendary: boolean;
  /** Palabras libres de subtipo en inglés (p. ej. «elf wizard»), todas deben cruzar. */
  subtype: string;
  cmcMin: number | null;
  cmcMax: number | null;
  rarities: Rarity[];
  /** Habilidades de palabra clave (valores del catálogo de Scryfall), todas deben cruzar. */
  keywords: string[];
  /** Clave de formato de Scryfall (`f:`), null = cualquiera. */
  format: string | null;
  /** Código de edición (`e:`), null = cualquiera. */
  set: string | null;
  /** Solo cartas que existen en MTG Arena (`game:arena` en vez de `game:paper`). */
  arena: boolean;
  /** Solo las cartas de tu colección (buscadas en el móvil, no en Scryfall). */
  onlyCollection?: boolean;
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
  arena: false,
  onlyCollection: false,
  order: 'edhrec',
  dir: 'auto',
};

/** Carta tal como la usa la app (aplanada del objeto de carta de Scryfall). */
export interface Card {
  id: string;
  /** Igual para cada impresión/idioma de una carta: se usa para contar copias en un mazo. */
  oracleId: string;
  name: string;
  /** Nombre localizado (p. ej. en español) cuando la impresión no es inglesa. */
  printedName: string | null;
  typeLine: string;
  manaCost: string;
  cmc: number;
  rarity: string;
  oracleText: string;
  imageUrl: string | null;
  /** Imagen de la cara trasera de las cartas de doble cara. */
  backImageUrl: string | null;
  /** Código de idioma de Scryfall de esta impresión (en, es, fr, de, it, pt, ja, ko, ru, zhs, zht…). */
  lang: string;
  set: string;
  collectorNumber?: string;
  /** Letras de la identidad de color, p. ej. ['W', 'U']; [] = incoloro. */
  colorIdentity: string[];
  /** Clave de formato de Scryfall → 'legal' | 'not_legal' | 'banned' | 'restricted'. */
  legalities: Record<string, string>;
  /** Igual para cada impresión que reutiliza un arte (los artes alternativos tienen el suyo). */
  illustrationId?: string;
  setName?: string;
  /** 'AAAA-MM-DD' */
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

/**
 * La búsqueda por texto de reglas partida en términos: cada palabra por su cuenta (todas, en
 * cualquier orden: «cost less» encuentra «costs {1} less»), y «palabras entre comillas» como frase exacta.
 */
export function textTerms(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/"([^"]*)"|(\S+)/g)) {
    const t = (m[1] ?? m[2] ?? '').trim();
    if (t) out.push(t);
  }
  return out;
}

/** Minúsculas sin acentos («Relámpago» → «relampago»). */
export const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

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
 * Traduce los filtros a una consulta de búsqueda de Scryfall (https://scryfall.com/docs/syntax).
 * Los resultados vienen en inglés; `anyLanguage` también cruza con nombres impresos extranjeros (se usa
 * como respaldo cuando una búsqueda por nombre no encuentra nada, p. ej. un nombre en español).
 */
export function buildQuery(f: Filters, anyLanguage = false): string {
  // Los formatos solo de Arena (Historic, Alchemy…) son de cartas de Arena, algunas de las cuales no están en papel.
  const arena = f.arena || (!!f.format && ARENA_FORMATS.includes(f.format));
  const parts: (string | null)[] = [arena ? 'game:arena' : 'game:paper'];
  // Un `name:` sin comillas por palabra: los términos sin comillas ignoran los acentos del lado de la carta
  // («relampago» encuentra «Relámpago», un «relampago» entrecomillado no), pero los acentos de la propia
  // consulta nunca cruzan, así que quítalos también.
  const nameWords = fold(clean(f.name))
    .split(/[^\p{L}\p{N}'-]+/u)
    .filter(Boolean);
  for (const word of nameWords) parts.push(`name:${word}`);
  // Palabra por palabra («entre comillas» = frase exacta); el español se traduce al texto de reglas en inglés.
  for (const t of rulesQuery(f.text).terms) parts.push(`o:"${clean(t)}"`);
  parts.push(colorTerm(f));
  if (f.types.length) parts.push(anyOf(f.types.map((t) => `t:${t.toLowerCase()}`)));
  if (f.legendary) parts.push('t:legendary');
  for (const word of clean(f.subtype)
    .split(/[\s,]+/)
    .filter(Boolean))
    parts.push(`t:${word}`);
  if (f.cmcMin !== null) parts.push(`cmc>=${f.cmcMin}`);
  if (f.cmcMax !== null) parts.push(`cmc<=${f.cmcMax}`);
  if (f.rarities.length) parts.push(anyOf(f.rarities.map((r) => `r:${r}`)));
  for (const k of f.keywords) parts.push(`keyword:"${k}"`);
  if (f.format && !DECK_ONLY_FORMATS.includes(f.format)) parts.push(`f:${f.format}`);
  if (f.set) parts.push(`e:${f.set}`);
  if (anyLanguage) parts.push('lang:any');
  return parts.filter(Boolean).join(' ');
}

/** Número de filtros que difieren de los valores por defecto (ignorando el orden), para la insignia de la barra de estado. */
export function activeFilterCount(f: Filters): number {
  const ignore: (keyof Filters)[] = ['order', 'dir', 'colorMode'];
  return (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).filter(
    (k) => !ignore.includes(k) && JSON.stringify(f[k]) !== JSON.stringify(DEFAULT_FILTERS[k]),
  ).length;
}

// Forma mínima de los campos de Scryfall que leemos.
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
  collector_number?: string;
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
    manaCost:
      c.mana_cost ??
      faces
        .map((f) => f.mana_cost)
        .filter(Boolean)
        .join(' // '),
    cmc: c.cmc ?? 0,
    rarity: c.rarity,
    oracleText: c.oracle_text ?? faces.map((f) => f.oracle_text ?? '').join('\n'),
    imageUrl: c.image_uris?.normal ?? faces[0]?.image_uris?.normal ?? null,
    backImageUrl: c.image_uris ? null : (faces[1]?.image_uris?.normal ?? null),
    lang: c.lang,
    set: c.set,
    collectorNumber: c.collector_number,
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

/** Pide la primera página para `filters`, o una página siguiente vía su URL `nextPage`. */
export async function searchCards(filters: Filters, nextPage?: string): Promise<SearchPage> {
  if (nextPage) return fetchPage(nextPage);
  const page = await fetchPage(searchUrl(filters, false));
  // Un nombre escrito en otro idioma (p. ej. «relámpago») solo cruza con impresiones extranjeras:
  // si ningún nombre en inglés contiene las palabras, busca en todos los idiomas.
  const words = fold(filters.name)
    .split(/[^\p{L}\p{N}'-]+/u)
    .filter(Boolean);
  const englishHit = page.cards.some((c) => words.every((w) => fold(c.name).includes(w)));
  if (words.length && !englishHit) return fetchPage(searchUrl(filters, true));
  return page;
}

/** Cartas por id de Scryfall, 75 por petición (POST /cards/collection). Los ids desconocidos se saltan. */
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

/** Cartas por nombre inglés exacto (cara frontal para las de doble cara), 75 por petición. Los nombres desconocidos se saltan. */
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

/** Una carta de una lista pegada: nombre, y edición + número de coleccionista cuando la lista los da. */
export interface ListEntry {
  name: string;
  set?: string;
  number?: string;
}

async function collectionCards(identifiers: object[]): Promise<Card[]> {
  const out: Card[] = [];
  for (let i = 0; i < identifiers.length; i += 75) {
    const res = await scryfallFetch(`${BASE_URL}/cards/collection`, {
      method: 'POST',
      body: JSON.stringify({ identifiers: identifiers.slice(i, i + 75) }),
    });
    if (!res.ok) throw new Error(`Error ${res.status} de Scryfall`);
    out.push(...((await res.json()).data as ScryfallCard[]).map(toCard));
  }
  return out;
}

const nameKey = (name: string) => name.split(' // ')[0].trim().toLowerCase();

/**
 * Encuentra las cartas de una lista pegada, manteniendo su orden: la impresión exacta cuando se dan
 * edición + número de coleccionista (los códigos de edición propios de Arena no siempre existen en
 * Scryfall, así que esos recurren al respaldo), si no por nombre inglés. null = no encontrada.
 */
export async function resolveCardList(entries: ListEntry[]): Promise<(Card | null)[]> {
  const out: (Card | null)[] = entries.map(() => null);

  const printed = entries.map((e, i) => ({ e, i })).filter(({ e }) => e.set && e.number);
  if (printed.length) {
    const found = await collectionCards(printed.map(({ e }) => ({ set: e.set, collector_number: e.number })));
    const byPrint = new Map(found.map((c) => [`${c.set}/${c.collectorNumber}`, c]));
    for (const { e, i } of printed) {
      const card = byPrint.get(`${e.set}/${e.number}`);
      // Se fía aunque el nombre difiera: las listas exportadas en otro idioma (Arena en español)
      // dan el nombre localizado con la edición + número.
      if (card) out[i] = card;
    }
  }

  const rest = [...new Set(entries.filter((_, i) => !out[i]).map((e) => nameKey(e.name)))];
  if (rest.length) {
    const found = await collectionCards(rest.map((name) => ({ name })));
    const byName = new Map<string, Card>();
    for (const c of found) {
      byName.set(c.name.toLowerCase(), c);
      byName.set(nameKey(c.name), c);
    }
    entries.forEach((e, i) => {
      if (!out[i]) out[i] = byName.get(nameKey(e.name)) ?? null;
    });
  }

  // Nombres en otro idioma (español…): búsqueda por nombre impreso exacto, en la edición de la lista primero.
  const localized = new Map<string, Card | null>();
  for (const [i, e] of entries.entries()) {
    if (out[i]) continue;
    const key = `${e.name}|${e.set ?? ''}`;
    if (!localized.has(key)) localized.set(key, await findByPrintedName(e.name, e.set));
    out[i] = localized.get(key) ?? null;
  }
  return out;
}

async function findByPrintedName(name: string, set?: string): Promise<Card | null> {
  const exact = `!"${name.replace(/"/g, '')}" lang:any`;
  for (const q of set ? [`${exact} e:${set}`, exact] : [exact]) {
    const page = await fetchPage(`${BASE_URL}/cards/search?q=${encodeURIComponent(q)}`).catch(() => null);
    if (page?.cards.length) return page.cards[0];
  }
  return null;
}

/** Una carta de un endpoint de Scryfall que devuelve una sola carta; null en 404. */
async function getSingleCard(path: string): Promise<Card | null> {
  const res = await scryfallFetch(`${BASE_URL}${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Error ${res.status} de Scryfall`);
  return toCard(await res.json());
}

/** Una impresión por código de edición + número de coleccionista, opcionalmente en un idioma (`/cards/:set/:number/:lang`). */
export const getCardBySetNumber = (set: string, number: string, lang?: string) =>
  getSingleCard(
    `/cards/${encodeURIComponent(set.toLowerCase())}/${encodeURIComponent(number)}` +
      (lang ? `/${encodeURIComponent(lang)}` : ''),
  );

/** Mejor coincidencia para un nombre inglés posiblemente mal escrito (`/cards/named?fuzzy=`). */
export const getCardByFuzzyName = (name: string) =>
  getSingleCard(`/cards/named?${new URLSearchParams({ fuzzy: name }).toString()}`);

/** `card` impresa en `set` (en `lang` si hay uno), o null. */
export async function getCardInSet(card: Card, set: string, lang?: string): Promise<Card | null> {
  const q = `oracleid:${card.oracleId} e:${set.toLowerCase()}`;
  if (lang) {
    const inLang = await fetchPage(printsUrl(`${q} lang:${lang}`));
    if (inLang.cards[0]) return inLang.cards[0];
  }
  return (await fetchPage(printsUrl(q))).cards[0] ?? null;
}

/** Nombres de cara al usuario (en español) de los códigos de idioma de Scryfall. */
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
 * Una impresión por idioma disponible para `card` (Scryfall `oracleid:` + `lang:any`).
 * Prefiere la misma edición que `card`, si no la impresión más reciente en ese idioma.
 * Cacheado por carta durante la vida de la app.
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

/** Idiomas ofrecidos como idioma de carta por defecto en los ajustes. */
export const MAIN_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'ru', 'zhs', 'zht'];

const localizedCache = new Map<string, Promise<Card | null>>();

const printsUrl = (q: string) =>
  `${BASE_URL}/cards/search?` +
  new URLSearchParams({ q, unique: 'prints', include_multilingual: 'true', order: 'released' }).toString();

/**
 * `card` impresa en `lang`, o null si Scryfall no tiene ninguna. Prueba la misma edición primero
 * (una consulta de un resultado) y solo entonces cualquier edición, para mantener respuestas pequeñas. Cacheado.
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
 * Una impresión por arte de `card` (Scryfall `unique=art`), la más nueva primero, la actual
 * la primera. Prefiere impresiones en el idioma de la carta; los artes nunca impresos en él vienen
 * en inglés. Cacheado.
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

/** Memoiza un fetch durante la vida de la app; un intento fallido se puede reintentar. */
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

/** Habilidades de palabra clave para el filtro de palabra clave, alfabéticamente. */
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

// Solo ediciones que contienen cartas jugables normales (sin fichas, promos, memorabilia...).
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

/** Cada edición (promos, fichas… incluidas) por código: nombres y fechas para la colección. */
export const getAllSets = cached(async (): Promise<Record<string, MtgSet>> =>
  Object.fromEntries((await getSetCatalog()).map((s) => [s.code, toSet(s)])),
);

/** Ediciones en papel para el filtro de edición, la más nueva primero. */
export const getSets = cached(async (): Promise<MtgSet[]> => {
  return (await getSetCatalog())
    .filter((s) => !s.digital && PLAYABLE_SET_TYPES.has(s.set_type))
    .map(toSet)
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
});

/** CDN de Scryfall: la versión `art_crop` de una URL de imagen `normal` (solo la ilustración). */
export const artCropUrl = (imageUrl: string) => imageUrl.replace('/normal/', '/art_crop/');

/** CDN de Scryfall: miniatura de ~15 KB (146×204) de una URL de imagen `normal` (~105 KB). */
export const smallImageUrl = (imageUrl: string) => imageUrl.replace('/normal/', '/small/');

export const displayName = (c: { name: string; printedName: string | null }) => c.printedName ?? c.name;

// ---------- Precios, estadísticas y fichas de las cartas guardadas ----------

/** Datos en vivo de una impresión que no se guarda localmente (los precios cambian a diario). */
export interface CardDetails {
  /** Precio de tendencia de Cardmarket en €, no-foil (foil si es el único); null = desconocido. */
  eur: number | null;
  /** La página de producto de la carta en Cardmarket (sitio en español). */
  cardmarketUrl: string | null;
  /** La página de la impresión en scryfall.com (sin parámetros de seguimiento). */
  scryfallUrl: string | null;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  /** Fichas/emblemas que crea la carta (`all_parts` con componente «token»). */
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
  scryfall_uri?: string;
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
  // Scryfall solo pone precio a las impresiones inglesas (y algunas más): valora el resto con la
  // impresión inglesa de la misma edición + número.
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
      scryfallUrl: c.scryfall_uri ? c.scryfall_uri.split('?')[0] : null,
      power: c.power ?? face.power,
      toughness: c.toughness ?? face.toughness,
      loyalty: c.loyalty ?? face.loyalty,
      defense: c.defense ?? face.defense,
      // Las impresiones no inglesas vienen sin `all_parts`: la inglesa las tiene.
      tokens: (c.all_parts ?? en?.all_parts ?? [])
        .filter((p) => p.component === 'token' && p.id !== c.id)
        .map((p) => ({ id: p.id, name: p.name, typeLine: p.type_line })),
    };
  }
  return out;
}

const detailsCache = new Map<string, Promise<CardDetails | null>>();

/** Precios, estadísticas y fichas de estas impresiones; se piden una vez por ejecución y se comparten. */
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

/** Símbolos de maná/girar («{2}», «{W/U}», «{T}») → URL de SVG. */
export const getSymbols = cached(async (): Promise<Record<string, string>> => {
  const body = await getJson('/symbology');
  const out: Record<string, string> = {};
  for (const s of body.data as { symbol: string; svg_uri?: string }[]) if (s.svg_uri) out[s.symbol] = s.svg_uri;
  return out;
});

// ---------- Datos completos de la carta (pantalla de info de carta) ----------

/** El objeto de carta completo de Scryfall, tal cual lo devuelve (`/cards/:id`). */
export type RawCard = Record<string, unknown>;

export async function getRawCard(id: string): Promise<RawCard> {
  return getJson(`/cards/${encodeURIComponent(id)}`);
}

export interface Ruling {
  source: string;
  published_at: string;
  comment: string;
}

/** Rulings/aclaraciones oficiales de una carta (su `rulings_uri`). */
export async function getRulings(rulingsUri: string): Promise<Ruling[]> {
  const res = await scryfallFetch(rulingsUri);
  if (!res.ok) throw new Error(`Error ${res.status} de Scryfall`);
  return (await res.json()).data as Ruling[];
}
