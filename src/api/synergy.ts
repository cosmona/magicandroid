// Datos de sinergia de una carta o un mazo, de dos sitios de la comunidad (no Scryfall):
// - EDHREC (edhrec.com): cómo usan una carta los mazos de Commander. Sin API oficial: son los JSON
//   que cargan sus propias páginas web (json.edhrec.com), así que la forma puede cambiar sin aviso.
// - Commander Spellbook (commanderspellbook.com): combos, a través de su API pública.

const HEADERS = { 'User-Agent': 'MagicSwipe/1.0', Accept: 'application/json' };
const EDHREC = 'https://json.edhrec.com/pages';
const SPELLBOOK = 'https://backend.commanderspellbook.com';

/** Nombre de URL de EDHREC: «Lim-Dûl, the Necromancer» → «lim-dul-the-necromancer». */
export function edhrecSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’,.!?:"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slugs a probar: la cara frontal primero (cartas de doble cara), luego el nombre entero (cartas divididas). */
const slugsFor = (name: string) => {
  const front = edhrecSlug(name.split(' // ')[0]);
  const full = edhrecSlug(name);
  return front === full ? [front] : [front, full];
};

export const edhrecCardUrl = (name: string) => `https://edhrec.com/cards/${slugsFor(name)[0]}`;
export const edhrecCommanderUrl = (name: string) => `https://edhrec.com/commanders/${slugsFor(name)[0]}`;

/** Una carta en una lista de EDHREC. */
export interface EdhrecEntry {
  /** Id de Scryfall. */
  id: string;
  name: string;
  /** Mazos que la juegan, de los `potentialDecks` que podrían (encajan sus colores). */
  numDecks: number;
  potentialDecks: number;
  /** Páginas de comandante: cuánto más la juegan los mazos de este comandante que el mazo medio (-1…1). */
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

/** El JSON de la página, probando cada slug; null si EDHREC no la tiene. */
async function edhrecPage(kind: 'cards' | 'commanders', name: string) {
  for (const slug of slugsFor(name)) {
    const res = await fetch(`${EDHREC}/${kind}/${slug}.json`, { headers: HEADERS });
    // Las páginas que faltan responden 404 (o 403 para páginas de comandante de cartas que no lo son).
    if (res.status === 404 || res.status === 403) continue;
    if (!res.ok) throw new Error(`Error ${res.status} de EDHREC`);
    const body = await res.json();
    // Algunas páginas que faltan vuelven como un stub de redirección en vez de un error.
    if (!body?.container?.json_dict) continue;
    return body as { container: { json_dict: { card?: Record<string, unknown>; cardlists?: RawList[] } } };
  }
  return null;
}

export interface EdhrecCard {
  /** Mazos de Commander en EDHREC que la juegan, de aquellos cuyos colores lo permiten. */
  numDecks: number;
  potentialDecks: number;
  /** Puntuación de «sal»: cuánto molesta a los rivales (0-4, voto de la comunidad). */
  salt: number | null;
  /** Comandantes que más la juegan. */
  topCommanders: EdhrecEntry[];
  /** Cartas que más se juegan junto a ella. */
  topCards: EdhrecEntry[];
}

/** Cómo usan una carta los mazos de Commander; null si EDHREC no la conoce (p. ej. no legal en Commander). */
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
  /** Mazos en EDHREC liderados por este comandante. */
  numDecks: number;
  /** Todas las cartas que EDHREC lista para él, mayor sinergia primero. */
  cards: EdhrecEntry[];
}

/** La página del comandante: las cartas que juegan sus mazos, por sinergia. Null si no es un comandante. */
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
  /** Nombres de las cartas, en el orden en que las lista el combo. */
  cards: string[];
  /** Qué consigue («Maná infinito», «Ganar la partida»…), traducido cuando se conoce. */
  results: string[];
  /** Maná necesario para arrancarlo, como cadena de coste («{U}{U}{B}»); '' si no hace falta. */
  manaNeeded: string;
  /** Paso a paso (en inglés). */
  description: string;
  /** Otras condiciones (en inglés), p. ej. «A creature on the battlefield». */
  prerequisites: string;
  /** Mazos en EDHREC que lo juegan. */
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

/** Español para los resultados de combo más comunes; cualquier otro se queda en inglés. */
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
  // Las piezas genéricas («A creature with flying») no son cartas: van con las otras condiciones.
  prerequisites: [...(c.requires ?? []).map((r) => r.template.name), c.easyPrerequisites, c.notablePrerequisites]
    .filter(Boolean)
    .join('\n'),
  popularity: c.popularity ?? 0,
  url: `https://commanderspellbook.com/combo/${c.id}/`,
});

/** Los combos más jugados que incluyen esta carta. */
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
  /** Combos que el mazo ya tiene. */
  included: Combo[];
  /** Combos a los que les faltan cartas: `missing` son las que no están en el mazo. */
  almost: { combo: Combo; missing: string[] }[];
}

/** El «Find my combos» de Commander Spellbook para un mazo (nombres de carta; comandantes aparte). */
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
