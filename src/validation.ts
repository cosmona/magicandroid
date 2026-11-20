import type { DeckCard } from '@/db/database';
import { formatLabel, SINGLETON_FORMATS } from '@/theme';

/** Resultado de comprobar un mazo contra su formato. Nada de aquí impide añadir cartas. */
export interface DeckValidation {
  /** False para «Libre» (sin formato). */
  checked: boolean;
  valid: boolean;
  /** Problemas a nivel de mazo (tamaño, falta comandante…), en orden de visualización. */
  issues: string[];
  /** Problemas por carta, por oracle id (listados por nombre en el banner y mostrados en cada carta). */
  cardIssues: Record<string, string[]>;
  /** El formato necesita comandante, así que debe mostrarse el interruptor 👑. */
  usesCommander: boolean;
  /** Cartas a las que aún les faltan datos de legalidad/identidad (se están obteniendo). */
  pendingData: number;
}

const NUMBER_WORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** Copias permitidas por el propio texto de la carta, o null para usar el límite del formato. */
function textCopyLimit(card: DeckCard): number | null {
  if (/\bBasic\b/.test(card.typeLine)) return Infinity;
  const text = card.oracleText ?? '';
  if (/any number of cards named/i.test(text)) return Infinity;
  const upTo = text.match(/up to (\w+) cards named/i);
  if (upTo) return NUMBER_WORDS[upTo[1].toLowerCase()] ?? Number(upTo[1]) ?? null;
  return null;
}

const COLOR_NAMES: Record<string, string> = { W: 'blanco', U: 'azul', B: 'negro', R: 'rojo', G: 'verde' };

const parseLegalities = (card: DeckCard): Record<string, string> | null => {
  if (!card.legalities) return null;
  try {
    return JSON.parse(card.legalities);
  } catch {
    return null;
  }
};

/** Tamaño exacto de un mazo estilo comandante: 60 en Oathbreaker y Standard Brawl, si no 100. */
export const commanderDeckSize = (format: string | null) =>
  format === 'oathbreaker' || format === 'standardbrawl' ? 60 : 100;

function canBeCommander(card: DeckCard, format: string): boolean {
  const text = card.oracleText ?? '';
  if (format === 'oathbreaker') return /\bPlaneswalker\b/.test(card.typeLine);
  if (/can be your commander/i.test(text)) return true;
  // Brawl: cualquier criatura legendaria o planeswalker.
  if (format === 'brawl' || format === 'standardbrawl')
    return /\bLegendary\b/.test(card.typeLine) && /\b(Creature|Planeswalker)\b/.test(card.typeLine);
  const creature = /\bCreature\b/.test(card.typeLine);
  if (format === 'paupercommander') return creature && card.rarity === 'uncommon';
  return creature && /\bLegendary\b/.test(card.typeLine);
}

const PARTNER_TEXT = /\b(Partner|Friends forever|Doctor's companion)\b/i;

function commanderPairOk(a: DeckCard, b: DeckCard): boolean {
  const ta = a.oracleText ?? '';
  const tb = b.oracleText ?? '';
  if (PARTNER_TEXT.test(ta) && PARTNER_TEXT.test(tb)) return true;
  const background = (x: DeckCard, other: string) =>
    /\bBackground\b/.test(x.typeLine) && /Choose a Background/i.test(other);
  return background(a, tb) || background(b, ta);
}

/**
 * Comprueba un mazo contra su formato: tamaño, copias, legalidad y, para formatos estilo
 * Commander, elección de comandante e identidad de color. Puramente informativo.
 */
export function validateDeck(format: string | null, cards: DeckCard[], sideboard: DeckCard[] = []): DeckValidation {
  const cardIssues: Record<string, string[]> = {};
  const issues: string[] = [];
  const flag = (card: DeckCard, msg: string) => (cardIssues[card.oracleId] ??= []).push(msg);
  const pendingData = cards.filter((c) => c.legalities === null || c.colorIdentity === null).length;
  const usesCommander = !!format && SINGLETON_FORMATS.includes(format);

  if (!format) return { checked: false, valid: true, issues, cardIssues, usesCommander, pendingData };

  const name = formatLabel(format);
  const total = cards.reduce((n, c) => n + c.quantity, 0);
  const commanders = cards.filter((c) => c.isCommander);

  // ---- Tamaño ----
  const limited = format === 'limited';
  const sideTotal = sideboard.reduce((n, c) => n + c.quantity, 0);
  if (usesCommander) {
    const size = commanderDeckSize(format);
    if (total !== size) issues.push(`Debe tener exactamente ${size} cartas (ahora ${total}).`);
  } else if (limited) {
    if (total < 40) issues.push(`Debe tener al menos 40 cartas (ahora ${total}).`);
  } else {
    if (total < 60) issues.push(`Debe tener al menos 60 cartas (ahora ${total}).`);
    if (sideTotal > 15) issues.push(`El banquillo puede tener como máximo 15 cartas (ahora ${sideTotal}).`);
  }

  // ---- Comandante ----
  let identity: Set<string> | null = null;
  if (usesCommander) {
    const leader = format === 'oathbreaker' ? 'un Oathbreaker (planeswalker)' : 'un comandante';
    if (commanders.length === 0) {
      issues.push(`Elige ${leader}: pulsa 👑 en la carta.`);
    } else if (commanders.length > 2) {
      issues.push('Como máximo puede haber 2 comandantes.');
    } else {
      if (commanders.length === 2 && !commanderPairOk(commanders[0], commanders[1]))
        issues.push('Dos comandantes solo si tienen Partner, Friends forever o Background.');
      for (const c of commanders) {
        if (!canBeCommander(c, format))
          flag(
            c,
            format === 'paupercommander'
              ? 'No puede ser comandante (criatura infrecuente).'
              : 'No puede ser comandante.',
          );
        if (c.quantity > 1) flag(c, 'El comandante va una sola vez.');
      }
      if (commanders.every((c) => c.colorIdentity !== null))
        identity = new Set(commanders.flatMap((c) => c.colorIdentity!.split('')));
    }
  }

  // ---- Por carta: copias, legalidad, identidad de color ----
  // Limited: lo que abriste, tantas copias como tengas, sin legalidad.
  const formatLimit = usesCommander ? 1 : limited ? Infinity : 4;
  // En construido el límite de copias cuenta también el banquillo.
  const sideCopies = new Map(sideboard.map((c) => [c.oracleId, c.quantity]));
  for (const card of cards) {
    const legal = parseLegalities(card);
    const status = limited ? undefined : legal?.[format];
    if (status === 'banned') flag(card, `Prohibida en ${name}.`);
    else if (status === 'not_legal') flag(card, `No es legal en ${name}.`);

    const limit = status === 'restricted' && format === 'vintage' ? 1 : (textCopyLimit(card) ?? formatLimit);
    const copies = card.quantity + (usesCommander ? 0 : (sideCopies.get(card.oracleId) ?? 0));
    if (copies > limit)
      flag(
        card,
        `${copies} copias${copies > card.quantity ? ' (con el banquillo)' : ''}: máximo ${limit}` +
          `${status === 'restricted' ? ' (restringida)' : ''}.`,
      );

    if (identity && !card.isCommander && card.colorIdentity !== null) {
      const outside = card.colorIdentity.split('').filter((c) => c && !identity!.has(c));
      if (outside.length)
        flag(card, `Fuera de la identidad del comandante (${outside.map((c) => COLOR_NAMES[c] ?? c).join(', ')}).`);
    }
  }

  const valid = issues.length === 0 && Object.keys(cardIssues).length === 0;
  return { checked: true, valid, issues, cardIssues, usesCommander, pendingData };
}
