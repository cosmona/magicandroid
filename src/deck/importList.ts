// Parses pasted deck lists (pure): MTG Arena, MTGO, Moxfield, Archidekt and plain "4 Name" lists.

export interface ImportLine {
  quantity: number;
  /** English name as written (may be "Front // Back" or just the front face). */
  name: string;
  /** Set code and collector number when the list gives them: "(M11) 149". */
  set?: string;
  number?: string;
  commander: boolean;
}

export interface ParsedList {
  /** Deck name if the list has one (Arena's "Name …" line). */
  name: string | null;
  cards: ImportLine[];
  /** The sideboard (Arena drafts: the rest of the pool). */
  sideboard: ImportLine[];
  /** Copies left out because they were in the maybeboard / tokens. */
  skipped: number;
  /** Lines that couldn't be read. */
  unreadable: string[];
}

type Section = 'main' | 'commander' | 'side' | 'skip';

/** Section headers, with or without "//", ":" or a count: "Commander", "SIDEBOARD:", "// Maybeboard (3)". */
function sectionOf(line: string): Section | null {
  const h = line
    .replace(/^\/\/\s*/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/:\s*$/, '')
    .trim()
    .toLowerCase();
  if (/^(deck|main|main ?deck|mainboard|companion|mazo|mazzo|baraja|compañero|compagno|compagnon|begleiter)$/.test(h))
    return 'main';
  if (/^(commanders?|cmdr|comandantes?|comandanti|commandants?|kommandeur)$/.test(h)) return 'commander';
  if (/^(sideboard|side|banquillo|reserva)$/.test(h)) return 'side';
  if (/^(maybeboard|maybe|considering|tokens?|attractions|stickers|quizás|quizas|fichas)$/.test(h)) return 'skip';
  return null;
}

/** Reads one card line, or null if it isn't one. */
export function parseLine(
  raw: string,
): (Omit<ImportLine, 'commander'> & { commanderTag: boolean; sideTag: boolean }) | null {
  let line = raw.trim();
  if (!line) return null;
  // Archidekt / Moxfield extras: categories "[Ramp]", "^Tag^", foil "*F*", commander "*CMDR*".
  const commanderTag = /\*CMDR\*/i.test(line) || /\[[^\]]*\bcommander\b[^\]]*\]/i.test(line);
  const sideTag = /\[[^\]]*\bsideboard\b[^\]]*\]/i.test(line);
  line = line
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\^[^^]*\^/g, ' ')
    .replace(/\*[A-Z]+\*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const qty = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
  const quantity = qty ? Number(qty[1]) : 1;
  let name = qty ? qty[2] : line;
  if (!quantity || !name) return null;

  let set: string | undefined;
  let number: string | undefined;
  const printing = name.match(/^(.+?)\s+[([]([A-Za-z0-9]{2,6})[)\]](?:\s+(\S+))?$/);
  if (printing) {
    name = printing[1];
    set = printing[2].toLowerCase();
    number = printing[3];
  }
  name = name.replace(/\s*\/{1,3}\s*/g, ' // ').trim(); // MTGO writes "Wear/Tear"
  if (!/\p{L}/u.test(name)) return null;
  return { quantity, name, set, number, commanderTag, sideTag };
}

export function parseDeckList(text: string): ParsedList {
  const cards: ImportLine[] = [];
  const sideboard: ImportLine[] = [];
  const unreadable: string[] = [];
  let section: Section = 'main';
  let name: string | null = null;
  let skipped = 0;
  let inAbout = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      inAbout = false;
      continue;
    }
    if (/^about$/i.test(line)) {
      inAbout = true;
      continue;
    }
    const named = line.match(/^name\s+(.+)$/i);
    if (named && (inAbout || !/^\d/.test(line))) {
      name = named[1].trim();
      continue;
    }
    const header = sectionOf(line);
    if (header) {
      section = header;
      continue;
    }
    if (line.startsWith('//') || line.startsWith('#')) continue;

    const card = parseLine(line);
    if (!card) {
      unreadable.push(line);
      continue;
    }
    if (section === 'skip') {
      skipped += card.quantity;
      continue;
    }
    const entry = {
      quantity: card.quantity,
      name: card.name,
      set: card.set,
      number: card.number,
      commander: section === 'commander' || card.commanderTag,
    };
    if (section === 'side' || card.sideTag) sideboard.push({ ...entry, commander: false });
    else cards.push(entry);
  }
  return { name, cards, sideboard, skipped, unreadable };
}
