// Synergy data for a card or a deck, from two community sites (not Scryfall):
// - EDHREC (edhrec.com): how Commander decks use a card. No official API: these are the JSON
//   files its own web pages load (json.edhrec.com), so the shape may change without notice.
// - Commander Spellbook (commanderspellbook.com): combos, through its public API.

const HEADERS = { 'User-Agent': 'MagicSwipe/1.0', Accept: 'application/json' };
const EDHREC = 'https://json.edhrec.com/pages';
const SPELLBOOK = 'https://backend.commanderspellbook.com';

/** EDHREC's URL name: "Lim-Dûl, the Necromancer" → "lim-dul-the-necromancer". */
export function edhrecSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’,.!?:"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slugs to try: the front face first (double-faced cards), then the whole name (split cards). */
const slugsFor = (name: string) => {
  const front = edhrecSlug(name.split(' // ')[0]);
  const full = edhrecSlug(name);
  return front === full ? [front] : [front, full];
};

export const edhrecCardUrl = (name: string) => `https://edhrec.com/cards/${slugsFor(name)[0]}`;
export const edhrecCommanderUrl = (name: string) => `https://edhrec.com/commanders/${slugsFor(name)[0]}`;

/** A card in an EDHREC list. */
export interface EdhrecEntry {
  /** Scryfall id. */
  id: string;
  name: string;
  /** Decks that play it, out of `potentialDecks` that could (its colors fit). */
  numDecks: number;
  potentialDecks: number;
  /** Commander pages: how much more this commander's decks play it than the average deck (-1…1). */
  synergy?: number;
}

interface RawEntry {
  id: string;
  name: string;
  num_decks?: number;
  potential_decks?: number;
  synergy?: number;
}
interface RawList {
  tag?: string;
  header?: string;
  cardviews?: RawEntry[];
}

const toEntry = (e: RawEntry): EdhrecEntry => ({
  id: e.id,
  name: e.name,
  numDecks: e.num_decks ?? 0,
  potentialDecks: e.potential_decks ?? 0,
  synergy: e.synergy,
});

const cache = new Map<string, Promise<unknown>>();
function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load().catch((e) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, p);
  }
  return p;
}

/** The page's JSON, trying each slug; null if EDHREC doesn't have it. */
async function edhrecPage(kind: 'cards' | 'commanders', name: string) {
  for (const slug of slugsFor(name)) {
    const res = await fetch(`${EDHREC}/${kind}/${slug}.json`, { headers: HEADERS });
    // Missing pages answer 404 (or 403 for commander pages of non-commanders).
    if (res.status === 404 || res.status === 403) continue;
    if (!res.ok) throw new Error(`Error ${res.status} de EDHREC`);
    const body = await res.json();
    // Some missing pages come back as a redirect stub instead of an error.
    if (!body?.container?.json_dict) continue;
    return body as { container: { json_dict: { card?: Record<string, unknown>; cardlists?: RawList[] } } };
  }
  return null;
}

export interface EdhrecCard {
  /** Commander decks on EDHREC that play it, out of those whose colors allow it. */
  numDecks: number;
  potentialDecks: number;
  /** Salt score: how much it annoys opponents (0-4, community vote). */
  salt: number | null;
  /** Commanders that play it most. */
  topCommanders: EdhrecEntry[];
  /** Cards most often played alongside it. */
  topCards: EdhrecEntry[];
}

/** How Commander decks use a card; null if EDHREC doesn't know it (e.g. not legal in Commander). */
export function getEdhrecCard(name: string): Promise<EdhrecCard | null> {
  return memo(`card:${name}`, async () => {
    const page = await edhrecPage('cards', name);
    if (!page) return null;
    const { card = {}, cardlists = [] } = page.container.json_dict;
    const list = (tag: string) => (cardlists.find((l) => l.tag === tag)?.cardviews ?? []).map(toEntry);
    return {
      numDecks: Number(card.num_decks ?? 0),
      potentialDecks: Number(card.potential_decks ?? 0),
      salt: typeof card.salt === 'number' ? card.salt : null,
      topCommanders: list('topcommanders'),
      topCards: list('topcards'),
    };
  });
}

export interface EdhrecCommander {
  /** Decks on EDHREC led by this commander. */
  numDecks: number;
  /** Every card EDHREC lists for it, highest synergy first. */
  cards: EdhrecEntry[];
}

/** The commander's page: the cards its decks play, by synergy. Null if it isn't a commander. */
export function getEdhrecCommander(name: string): Promise<EdhrecCommander | null> {
  return memo(`commander:${name}`, async () => {
    const page = await edhrecPage('commanders', name);
    if (!page) return null;
    const { card = {}, cardlists = [] } = page.container.json_dict;
    const byId = new Map<string, EdhrecEntry>();
    for (const l of cardlists) for (const e of l.cardviews ?? []) if (!byId.has(e.id)) byId.set(e.id, toEntry(e));
    return {
      numDecks: Number(card.num_decks ?? 0),
      cards: [...byId.values()].sort((a, b) => (b.synergy ?? 0) - (a.synergy ?? 0)),
    };
  });
}

// ---------- Commander Spellbook ----------

export interface Combo {
  id: string;
  /** Card names, in the order the combo lists them. */
  cards: string[];
  /** What it achieves ("Infinite mana", "Win the game"…), translated when known. */
  results: string[];
  /** Mana needed to start it, as a cost string ("{U}{U}{B}"); '' if none. */
  manaNeeded: string;
  /** Step by step (English). */
  description: string;
  /** Other conditions (English), e.g. "A creature on the battlefield". */
  prerequisites: string;
  /** Decks on EDHREC playing it. */
  popularity: number;
  url: string;
}

interface RawCombo {
  id: string;
  uses: { card: { name: string } }[];
  produces: { feature: { name: string } }[];
  requires?: { template: { name: string } }[];
  manaNeeded?: string;
  description?: string;
  easyPrerequisites?: string;
  notablePrerequisites?: string;
  popularity?: number;
}

/** Spanish for the most common combo results; anything else stays in English. */
const RESULTS: [RegExp, string][] = [
  [/^Win the game$/i, 'Ganar la partida'],
  [/^Infinite colorless mana$/i, 'Maná incoloro infinito'],
  [/^Infinite colored mana$/i, 'Maná de color infinito'],
  [/^Infinite mana$/i, 'Maná infinito'],
  [/^Infinite (\w+) mana$/i, 'Maná $1 infinito'],
  [/^Infinite damage$/i, 'Daño infinito'],
  [/^Infinite lifegain$/i, 'Vidas infinitas'],
  [/^Infinite life ?loss$/i, 'Pérdida de vidas infinita'],
  [/^Infinite draw triggers$/i, 'Robar cartas infinitas'],
  [/^Infinite card draw$/i, 'Robar cartas infinitas'],
  [/^Infinite tokens$/i, 'Fichas infinitas'],
  [/^Infinite (.+) tokens$/i, 'Fichas de $1 infinitas'],
  [/^Infinite ETB$/i, 'Entradas al campo infinitas'],
  [/^Infinite LTB$/i, 'Salidas del campo infinitas'],
  [/^Infinite death triggers$/i, 'Muertes infinitas'],
  [/^Infinite sacrifice triggers$/i, 'Sacrificios infinitos'],
  [/^Infinite storm count$/i, 'Tormenta infinita'],
  [/^Infinite magecraft triggers$/i, 'Magia arcana infinita'],
  [/^Infinite untap$/i, 'Enderezar infinito'],
  [/^Infinite turns$/i, 'Turnos infinitos'],
  [/^Infinite combat phases$/i, 'Combates infinitos'],
  [/^Infinite mill$/i, 'Molienda infinita'],
  [/^Infinite self-mill$/i, 'Automolienda infinita'],
  [/^Infinite \+1\/\+1 counters$/i, 'Contadores +1/+1 infinitos'],
  [/^Infinite power$/i, 'Fuerza infinita'],
  [/^Infinite scry$/i, 'Adivinar infinito'],
  [/^Exile your library$/i, 'Exiliar tu biblioteca'],
  [/^Draw the game$/i, 'Empatar la partida'],
  [/^Each opponent loses the game$/i, 'Todos los rivales pierden'],
  [/^Lock$/i, 'Bloqueo'],
];
const translate = (r: string) => {
  for (const [re, es] of RESULTS) if (re.test(r)) return r.replace(re, es);
  return r;
};

const toCombo = (c: RawCombo): Combo => ({
  id: c.id,
  cards: c.uses.map((u) => u.card.name),
  results: c.produces.map((p) => translate(p.feature.name)),
  manaNeeded: c.manaNeeded ?? '',
  description: c.description ?? '',
  // Generic pieces ("A creature with flying") aren't cards: they go with the other conditions.
  prerequisites: [...(c.requires ?? []).map((r) => r.template.name), c.easyPrerequisites, c.notablePrerequisites]
    .filter(Boolean)
    .join('\n'),
  popularity: c.popularity ?? 0,
  url: `https://commanderspellbook.com/combo/${c.id}/`,
});

/** The most played combos that include this card. */
export function getCardCombos(name: string, limit = 10): Promise<{ total: number; combos: Combo[] }> {
  return memo(`combos:${name}:${limit}`, async () => {
    const q = `card:"${name.split(' // ')[0]}"`;
    const url = `${SPELLBOOK}/variants/?${new URLSearchParams({ q, ordering: '-popularity', limit: String(limit) })}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`Error ${res.status} de Commander Spellbook`);
    const body = await res.json();
    return { total: body.count ?? body.results.length, combos: (body.results as RawCombo[]).map(toCombo) };
  });
}

export interface DeckCombos {
  /** Combos the deck already has. */
  included: Combo[];
  /** Combos missing cards: `missing` are the ones not in the deck. */
  almost: { combo: Combo; missing: string[] }[];
}

/** Commander Spellbook's "Find my combos" for a deck (card names; commanders apart). */
export async function findDeckCombos(main: string[], commanders: string[]): Promise<DeckCombos> {
  const res = await fetch(`${SPELLBOOK}/find-my-combos?limit=100`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      main: main.map((card) => ({ card })),
      commanders: commanders.map((card) => ({ card })),
    }),
  });
  if (!res.ok) throw new Error(`Error ${res.status} de Commander Spellbook`);
  const { results } = await res.json();
  const inDeck = new Set([...main, ...commanders].map((n) => n.split(' // ')[0].toLowerCase()));
  const has = (n: string) => inDeck.has(n.split(' // ')[0].toLowerCase());
  const byPopularity = (a: Combo, b: Combo) => b.popularity - a.popularity;
  const almost = (results.almostIncluded as RawCombo[]).map((raw) => {
    const combo = toCombo(raw);
    return { combo, missing: raw.uses.map((u) => u.card.name).filter((n) => !has(n)) };
  });
  return {
    included: (results.included as RawCombo[]).map(toCombo).sort(byPopularity),
    almost: almost.sort((a, b) => byPopularity(a.combo, b.combo)),
  };
}
