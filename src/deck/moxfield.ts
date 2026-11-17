// Importing a public Moxfield deck from its link (the same file in both apps). Moxfield's site reads
// its decks from api2.moxfield.com; the deck is turned into a text list that `parseDeckList` already
// understands (commander, main deck with the exact printing, sideboard, «Quizás» as Posibles).

/** The deck id of a Moxfield link («https://moxfield.com/decks/AbC-123»), or of the id itself. */
export function moxfieldId(input: string): string | null {
  const text = input.trim();
  const link = /moxfield\.com\/decks\/([A-Za-z0-9_-]{6,})/i.exec(text);
  if (link) return link[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(text) ? text : null;
}

/** Address of the deck's data (v3 first; v2 for older decks). */
export const moxfieldUrls = (id: string) => [
  `https://api2.moxfield.com/v3/decks/all/${id}`,
  `https://api2.moxfield.com/v2/decks/all/${id}`,
];

interface MoxCard {
  quantity: number;
  card: { name: string; set?: string; cn?: string };
}
type MoxBoard = Record<string, MoxCard>;

/** The cards of a board in either API version (v3: boards.x.cards; v2: x as a map). */
function board(data: Record<string, unknown>, key: string): MoxCard[] {
  const v3 = (data.boards as Record<string, { cards?: MoxBoard }> | undefined)?.[key]?.cards;
  const v2 = data[key] as MoxBoard | undefined;
  return Object.values(v3 ?? v2 ?? {}).filter((c) => c?.card?.name && c.quantity > 0);
}

export interface MoxfieldDeck {
  name: string;
  /** Moxfield's format key (commander, modern…), when it's one of the app's. */
  format: string | null;
  /** The deck as a text list (Commander / Deck / Sideboard sections, with edition and number). */
  text: string;
  /** Copies in «Quizás» (maybeboard), to bring as Posibles. */
  maybe: { quantity: number; name: string; set?: string; number?: string }[];
}

const line = (c: MoxCard) => `${c.quantity} ${c.card.name}${c.card.set ? ` (${c.card.set.toUpperCase()})${c.card.cn ? ` ${c.card.cn}` : ''}` : ''}`;

/** Moxfield's JSON as the app's import text. */
export function moxfieldDeck(data: Record<string, unknown>): MoxfieldDeck {
  const commanders = [...board(data, 'commanders'), ...board(data, 'signatureSpells')];
  const main = [...board(data, 'mainboard'), ...board(data, 'companions')];
  const side = board(data, 'sideboard');
  const parts: string[] = [];
  if (commanders.length) parts.push('Commander', ...commanders.map(line), '');
  parts.push('Deck', ...main.map(line));
  if (side.length) parts.push('', 'Sideboard', ...side.map(line));
  return {
    name: String(data.name ?? 'Mazo de Moxfield'),
    format: typeof data.format === 'string' ? data.format : null,
    text: parts.join('\n'),
    maybe: board(data, 'maybeboard').map((c) => ({ quantity: c.quantity, name: c.card.name, set: c.card.set, number: c.card.cn })),
  };
}
