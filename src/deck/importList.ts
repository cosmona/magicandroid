// Parsea listas de mazo pegadas (puro): MTG Arena, MTGO, Moxfield, Archidekt y listas simples «4 Nombre».

export interface ImportLine {
  quantity: number;
  /** Nombre inglés tal como está escrito (puede ser «Front // Back» o solo la cara frontal). */
  name: string;
  /** Código de edición y número de coleccionista cuando la lista los da: «(M11) 149». */
  set?: string;
  number?: string;
  commander: boolean;
}

export interface ParsedList {
  /** Nombre del mazo si la lista tiene uno (la línea «Name …» de Arena). */
  name: string | null;
  cards: ImportLine[];
  /** El banquillo (drafts de Arena: el resto del pool). */
  sideboard: ImportLine[];
  /** Copias dejadas fuera porque estaban en el maybeboard / fichas. */
  skipped: number;
  /** Líneas que no se pudieron leer. */
  unreadable: string[];
}

type Section = 'main' | 'commander' | 'side' | 'skip';

/** Cabeceras de sección, con o sin «//», «:» o un recuento: «Commander», «SIDEBOARD:», «// Maybeboard (3)». */
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

/** Lee una línea de carta, o null si no lo es. */
export function parseLine(
  raw: string,
): (Omit<ImportLine, 'commander'> & { commanderTag: boolean; sideTag: boolean }) | null {
  let line = raw.trim();
  if (!line) return null;
  // Extras de Archidekt / Moxfield: categorías «[Ramp]», «^Tag^», foil «*F*», comandante «*CMDR*».
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
