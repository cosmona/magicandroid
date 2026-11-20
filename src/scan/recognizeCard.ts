import {
  fold,
  getCardByFuzzyName,
  getCardBySetNumber,
  getCardInLanguage,
  getCardInSet,
  searchCards,
  DEFAULT_FILTERS,
  type Card,
} from '@/api/scryfall';

type TextExtractor = typeof import('expo-text-extractor');

// El módulo de ML Kit solo existe en una build de la app (APK / dev client), no en Expo Go,
// donde requerirlo lanza un error.
let extractor: TextExtractor | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  extractor = require('expo-text-extractor') as TextExtractor;
  if (!extractor.isSupported) extractor = null;
} catch {
  extractor = null;
}

/** El reconocimiento de texto en el dispositivo está disponible (false en Expo Go). */
export const scanSupported = extractor !== null;

/** Lo que el texto de la foto dice sobre la carta. */
export interface ScanHints {
  /** Código de edición de la línea inferior («DMU • ES»), en minúsculas. */
  set?: string;
  /** Número de coleccionista sin ceros a la izquierda. */
  number?: string;
  /** Código de idioma de Scryfall de la línea inferior. */
  lang?: string;
  /** Líneas que pueden ser el nombre de la carta, la mejor primero. */
  names: string[];
}

/** Códigos de idioma impresos en las cartas → códigos de Scryfall. */
const PRINTED_LANGS: Record<string, string> = {
  EN: 'en',
  ES: 'es',
  SP: 'es',
  FR: 'fr',
  DE: 'de',
  IT: 'it',
  PT: 'pt',
  JP: 'ja',
  JA: 'ja',
  KR: 'ko',
  KO: 'ko',
  RU: 'ru',
  CS: 'zhs',
  CT: 'zht',
  PH: 'ph',
};
const LANG_ALTERNATION = Object.keys(PRINTED_LANGS).join('|');
// «DMU • ES», «MH3 · EN», «DMU*ES»… el OCR lee el punto de muchas formas (o se lo come).
const SET_LANG = new RegExp(`(?:^|\\s)([A-Z0-9]{3,5})\\s*[•·*.,:\\-–]?\\s*(${LANG_ALTERNATION})(?=\\s|$)`);
// «0123/281», «123 / 281»
const NUMBER_TOTAL = /(?:^|\s)(\d{1,4})\s*\/\s*\d{1,4}(?=\s|[A-Z]|$)/;
// «R 0123» o «0123 R» (las cartas nuevas no imprimen el total).
const RARITY_NUMBER = /(?:^|\s)[CURMLSTPB]\s+(\d{3,5})(?=\s|$)|(?:^|\s)(\d{3,5})\s+[CURMLSTPB](?=\s|$)/;

/** Saca edición, número de coleccionista, idioma y candidatos de nombre de los bloques de texto del OCR. */
export function parseCardText(blocks: string[]): ScanHints {
  const lines = blocks
    .flatMap((b) => b.split('\n'))
    .map((l) => l.trim())
    .filter(Boolean);
  const hints: ScanHints = { names: [] };

  // La info del coleccionista está abajo: busca desde la última línea hacia arriba.
  for (const line of [...lines].reverse()) {
    const upper = line.toUpperCase();
    if (!hints.set) {
      const m = SET_LANG.exec(upper);
      // Un código de edición tiene al menos una letra («2XM», «DMU»); los números puros son otra cosa.
      if (m && /[A-Z]/.test(m[1])) {
        hints.set = m[1].toLowerCase();
        hints.lang = PRINTED_LANGS[m[2]];
      }
    }
    if (!hints.number) {
      const m = NUMBER_TOTAL.exec(upper) ?? RARITY_NUMBER.exec(upper);
      const raw = m?.[1] ?? m?.[2];
      if (raw) hints.number = String(Number(raw));
    }
  }

  // El nombre es la primera línea de la carta; la línea de tipo y el texto de reglas van después.
  for (const line of lines.slice(0, 4)) {
    const name = line
      .replace(/[{}()[\]0-9•·*|<>«»"“”_=+@#$%^&~]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if ((name.match(/\p{L}/gu) ?? []).length >= 3 && !hints.names.includes(name)) hints.names.push(name);
  }
  return hints;
}

const words = (s: string) =>
  fold(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3);

/** Al menos la mitad de las palabras del nombre leído aparecen en el nombre inglés o impreso de la carta. */
function nameMatches(card: Card, names: string[]): boolean {
  const cardWords = new Set(words(`${card.name} ${card.printedName ?? ''}`));
  return names.some((n) => {
    const w = words(n);
    return w.length > 0 && w.filter((x) => cardWords.has(x)).length * 2 >= w.length;
  });
}

async function findByName(name: string): Promise<Card | null> {
  // El emparejado difuso perdona erratas del OCR pero solo conoce nombres en inglés…
  // (también acierta a lo loco, p. ej. «Relámpago» → Lightning Greaves: comprueba las palabras).
  const fuzzy = await getCardByFuzzyName(name).catch(() => null);
  if (fuzzy && nameMatches(fuzzy, [name])) return fuzzy;
  // …la búsqueda normal también encuentra nombres impresos en otros idiomas, pero cruza con cualquier
  // nombre que contenga las palabras («Relámpago» → «Grebas relámpago»): prefiere un nombre exacto.
  const page = await searchCards({ ...DEFAULT_FILTERS, name }).catch(() => null);
  if (!page?.cards.length) return null;
  const target = fold(name);
  const exact = page.cards.find((c) => fold(c.name) === target || fold(c.printedName ?? '') === target);
  if (exact) return exact;
  // Si no, el nombre más corto: las menos palabras extra alrededor de las leídas.
  return [...page.cards].sort((a, b) => (a.printedName ?? a.name).length - (b.printedName ?? b.name).length)[0];
}

export interface ScanResult {
  card: Card | null;
  hints: ScanHints;
  /** Líneas reconocidas en crudo, mostradas cuando no cuadró nada. */
  text: string[];
}

/**
 * Lee la foto en `uri` y encuentra la carta en Scryfall: la impresión exacta por el código de
 * edición + número de coleccionista cuando son legibles (y concuerdan con el nombre), si no por
 * nombre, luego movida a la edición/idioma leídos de la carta cuando se puede.
 */
export async function recognizeCard(uri: string): Promise<ScanResult> {
  if (!extractor) throw new Error('El reconocimiento de texto no está disponible en Expo Go.');
  const text = await extractor.extractTextFromImage(uri);
  const hints = parseCardText(text);

  let bySet: Card | null = null;
  if (hints.set && hints.number) {
    bySet =
      (hints.lang && (await getCardBySetNumber(hints.set, hints.number, hints.lang).catch(() => null))) ||
      (await getCardBySetNumber(hints.set, hints.number).catch(() => null));
    // Un dígito mal leído da otra carta de la edición: fíate solo si el nombre concuerda.
    if (bySet && (hints.names.length === 0 || nameMatches(bySet, hints.names))) {
      return { card: bySet, hints, text };
    }
  }

  for (const name of hints.names) {
    const card = await findByName(name);
    if (!card) continue;
    const placed =
      (hints.set && (await getCardInSet(card, hints.set, hints.lang).catch(() => null))) ||
      (hints.lang && (await getCardInLanguage(card, hints.lang).catch(() => null))) ||
      card;
    return { card: placed, hints, text };
  }

  return { card: bySet, hints, text };
}
