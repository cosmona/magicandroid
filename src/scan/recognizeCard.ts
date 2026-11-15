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

// The ML Kit module only exists in a build of the app (APK / dev client), not in Expo Go,
// where requiring it throws.
let extractor: TextExtractor | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  extractor = require('expo-text-extractor') as TextExtractor;
  if (!extractor.isSupported) extractor = null;
} catch {
  extractor = null;
}

/** On-device text recognition is available (false in Expo Go). */
export const scanSupported = extractor !== null;

/** What the photo's text says about the card. */
export interface ScanHints {
  /** Set code from the bottom line ("DMU • ES"), lowercase. */
  set?: string;
  /** Collector number without leading zeros. */
  number?: string;
  /** Scryfall language code from the bottom line. */
  lang?: string;
  /** Lines that may be the card's name, best first. */
  names: string[];
}

/** Language codes printed on cards → Scryfall codes. */
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
// "DMU • ES", "MH3 · EN", "DMU*ES"… OCR reads the bullet as many things (or drops it).
const SET_LANG = new RegExp(`(?:^|\\s)([A-Z0-9]{3,5})\\s*[•·*.,:\\-–]?\\s*(${LANG_ALTERNATION})(?=\\s|$)`);
// "0123/281", "123 / 281"
const NUMBER_TOTAL = /(?:^|\s)(\d{1,4})\s*\/\s*\d{1,4}(?=\s|[A-Z]|$)/;
// "R 0123" or "0123 R" (newer cards print no total).
const RARITY_NUMBER = /(?:^|\s)[CURMLSTPB]\s+(\d{3,5})(?=\s|$)|(?:^|\s)(\d{3,5})\s+[CURMLSTPB](?=\s|$)/;

/** Pulls set, collector number, language and name candidates out of OCR text blocks. */
export function parseCardText(blocks: string[]): ScanHints {
  const lines = blocks
    .flatMap((b) => b.split('\n'))
    .map((l) => l.trim())
    .filter(Boolean);
  const hints: ScanHints = { names: [] };

  // Collector info lives at the bottom: search from the last line up.
  for (const line of [...lines].reverse()) {
    const upper = line.toUpperCase();
    if (!hints.set) {
      const m = SET_LANG.exec(upper);
      // A set code has at least one letter ("2XM", "DMU"); pure numbers are something else.
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

  // The name is the first line of the card; type line and rules text come after.
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

/** At least half of the read name's words appear in the card's English or printed name. */
function nameMatches(card: Card, names: string[]): boolean {
  const cardWords = new Set(words(`${card.name} ${card.printedName ?? ''}`));
  return names.some((n) => {
    const w = words(n);
    return w.length > 0 && w.filter((x) => cardWords.has(x)).length * 2 >= w.length;
  });
}

async function findByName(name: string): Promise<Card | null> {
  // Fuzzy matching forgives OCR typos but only knows English names…
  // (it also takes wild guesses, e.g. "Relámpago" → Lightning Greaves: check the words).
  const fuzzy = await getCardByFuzzyName(name).catch(() => null);
  if (fuzzy && nameMatches(fuzzy, [name])) return fuzzy;
  // …the normal search also finds printed names in other languages, but matches any name
  // containing the words ("Relámpago" → "Grebas relámpago"): prefer an exact name.
  const page = await searchCards({ ...DEFAULT_FILTERS, name }).catch(() => null);
  if (!page?.cards.length) return null;
  const target = fold(name);
  const exact = page.cards.find((c) => fold(c.name) === target || fold(c.printedName ?? '') === target);
  if (exact) return exact;
  // Otherwise the shortest name: the fewest extra words around the ones read.
  return [...page.cards].sort((a, b) => (a.printedName ?? a.name).length - (b.printedName ?? b.name).length)[0];
}

export interface ScanResult {
  card: Card | null;
  hints: ScanHints;
  /** Raw recognized lines, shown when nothing matched. */
  text: string[];
}

/**
 * Reads the photo at `uri` and finds the card on Scryfall: the exact printing from the set
 * code + collector number when they're legible (and agree with the name), otherwise by name,
 * then moved to the set/language read from the card when possible.
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
    // A misread digit gives another card of the set: trust it only if the name agrees.
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
