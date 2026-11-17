// Supervised sync (the same file in both apps): compares what the PC and the phone have, lists every
// difference with a suggested choice (the most recent change wins), and once the user has reviewed
// them, says what each device has to write or delete so that both end up the same.
import type { SyncData, SyncDeck, SyncPatch } from '@/sync/sync';

type Row = Record<string, string | number | null>;

export type SyncSide = 'pc' | 'phone';
/** What stays: the PC's version, the phone's, or (decks) both joined. */
export type SyncPick = SyncSide | 'merge';
export type DiffKind = 'deck' | 'card' | 'want' | 'tag' | 'cardTag';
export type DiffState =
  | 'changed' // both have it, different
  | 'onlyPc' // new on the PC
  | 'onlyPhone' // new on the phone
  | 'deletedOnPc' // the phone has it, the PC deleted it after the phone's last change
  | 'deletedOnPhone';

export interface DiffItem {
  /** `kind:key`, unique. */
  id: string;
  kind: DiffKind;
  key: string;
  /** Deck name, card name (edition, language), tag name… */
  name: string;
  state: DiffState;
  /** What differs, in short lines («PC: 2 copias · Móvil: 3»). */
  detail: string[];
  suggested: SyncPick;
  /** The two versions (null where it doesn't exist). */
  pc: SyncDeck | Row | null;
  phone: SyncDeck | Row | null;
}

const PLACE = (r: Row) => `${r.scryfall_id}|${r.place}`;
const CARD_TAG = (r: Row) => `${r.tag_uid}|${r.oracle_id}`;
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

/** Name of a card row: «Rayo (M10, ES)». */
const cardName = (r: Row) =>
  `${r.printed_name || r.name}${r.set_code ? ` (${String(r.set_code).toUpperCase()}${r.lang ? `, ${String(r.lang).toUpperCase()}` : ''})` : ''}`;

/** First names of a list and «y N más». */
function some(names: string[], max = 5): string {
  return names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} y ${names.length - max} más`;
}

const ZONES = [
  { key: 'cards', label: 'Mazo' },
  { key: 'side', label: 'Banquillo' },
  { key: 'maybe', label: 'Posibles' },
] as const;

/** What matters of a deck card: which printing, how many and commander. */
const cardSig = (c: Row) => `${c.scryfall_id}|${num(c.quantity)}|${num(c.is_commander)}`;

/** Differences between two versions of a deck, in short lines; empty if they are the same. */
function deckDetail(pc: SyncDeck, phone: SyncDeck): string[] {
  const out: string[] = [];
  if (pc.deck.name !== phone.deck.name) out.push(`Nombre: «${pc.deck.name}» en el PC, «${phone.deck.name}» en el móvil`);
  if ((pc.deck.format ?? null) !== (phone.deck.format ?? null)) {
    out.push(`Formato: ${pc.deck.format ?? 'libre'} en el PC, ${phone.deck.format ?? 'libre'} en el móvil`);
  }
  if ((pc.deck.cover_image ?? null) !== (phone.deck.cover_image ?? null)) out.push('Portada distinta');
  for (const zone of ZONES) {
    const a = new Map(pc[zone.key].map((c) => [String(c.oracle_id), c]));
    const b = new Map(phone[zone.key].map((c) => [String(c.oracle_id), c]));
    const onlyPc = [...a.values()].filter((c) => !b.has(String(c.oracle_id))).map((c) => String(c.printed_name || c.name));
    const onlyPhone = [...b.values()].filter((c) => !a.has(String(c.oracle_id))).map((c) => String(c.printed_name || c.name));
    const changed: string[] = [];
    for (const [id, c] of a) {
      const o = b.get(id);
      if (!o || cardSig(c) === cardSig(o)) continue;
      const what =
        num(c.quantity) !== num(o.quantity)
          ? `${num(c.quantity)} en el PC, ${num(o.quantity)} en el móvil`
          : num(c.is_commander) !== num(o.is_commander)
            ? `comandante en ${num(c.is_commander) ? 'el PC' : 'el móvil'}`
            : 'otra edición o idioma';
      changed.push(`${c.printed_name || c.name} (${what})`);
    }
    const prefix = zone.key === 'cards' ? '' : `${zone.label}: `;
    if (onlyPc.length) out.push(`${prefix}solo en el PC: ${some(onlyPc)}`);
    if (onlyPhone.length) out.push(`${prefix}solo en el móvil: ${some(onlyPhone)}`);
    if (changed.length) out.push(`${prefix}${some(changed, 4)}`);
  }
  return out;
}

const deckCount = (d: SyncDeck) => d.cards.reduce((n, c) => n + num(c.quantity), 0);

/** Every difference between the PC's data and the phone's. */
export function diffSyncData(pc: SyncData, phone: SyncData): DiffItem[] {
  const items: DiffItem[] = [];
  const tomb = (data: SyncData) => new Map(data.tombstones.map((t) => [`${t.kind}:${t.key}`, num(t.deleted_at)]));
  const pcTomb = tomb(pc);
  const phoneTomb = tomb(phone);

  /**
   * Common logic: `a` (PC) and `b` (phone) versions by key; `stamp` = last change of a version;
   * `detail` = how two versions differ (empty = same); `describe` = one line for a version on its own.
   */
  function compare<T>(
    kind: DiffKind,
    tombKind: string,
    a: Map<string, T>,
    b: Map<string, T>,
    name: (v: T) => string,
    stamp: (v: T) => number,
    detail: (pcV: T, phoneV: T) => string[],
    describe: (v: T) => string[],
  ) {
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      const pcV = a.get(key) ?? null;
      const phoneV = b.get(key) ?? null;
      const base = { id: `${kind}:${key}`, kind, key, pc: pcV as DiffItem['pc'], phone: phoneV as DiffItem['phone'] };
      if (pcV && phoneV) {
        const d = detail(pcV, phoneV);
        if (!d.length) continue;
        items.push({ ...base, name: name(pcV), state: 'changed', detail: d, suggested: stamp(phoneV) > stamp(pcV) ? 'phone' : 'pc' });
      } else if (pcV) {
        const deletedAt = phoneTomb.get(`${tombKind}:${key}`) ?? 0;
        const deleted = deletedAt > stamp(pcV);
        items.push({ ...base, name: name(pcV), state: deleted ? 'deletedOnPhone' : 'onlyPc', detail: describe(pcV), suggested: deleted ? 'phone' : 'pc' });
      } else if (phoneV) {
        const deletedAt = pcTomb.get(`${tombKind}:${key}`) ?? 0;
        const deleted = deletedAt > stamp(phoneV);
        items.push({ ...base, name: name(phoneV), state: deleted ? 'deletedOnPc' : 'onlyPhone', detail: describe(phoneV), suggested: deleted ? 'pc' : 'phone' });
      }
    }
  }

  // Decks (by uid).
  compare<SyncDeck>(
    'deck',
    'deck',
    new Map(pc.decks.map((d) => [String(d.deck.uid), d])),
    new Map(phone.decks.map((d) => [String(d.deck.uid), d])),
    (d) => String(d.deck.name),
    (d) => num(d.deck.updated_at),
    deckDetail,
    (d) => [`${deckCount(d)} cartas${d.deck.format ? ` · ${d.deck.format}` : ''}`],
  );

  // Collection (by printing + place).
  const copies = (r: Row) => `${num(r.quantity)} ${num(r.quantity) === 1 ? 'copia' : 'copias'}`;
  compare<Row>(
    'card',
    'card',
    new Map(pc.collection.map((r) => [PLACE(r), r])),
    new Map(phone.collection.map((r) => [PLACE(r), r])),
    cardName,
    (r) => num(r.updated_at),
    (a, b) => (num(a.quantity) !== num(b.quantity) ? [`${copies(a)} en el PC, ${copies(b)} en el móvil`] : []),
    (r) => [copies(r)],
  );

  // «La quiero» (by printing): there is nothing to differ but whether it's there.
  compare<Row>(
    'want',
    'want',
    new Map(pc.wanted.map((r) => [String(r.scryfall_id), r])),
    new Map(phone.wanted.map((r) => [String(r.scryfall_id), r])),
    cardName,
    (r) => num(r.updated_at),
    () => [],
    () => [],
  );

  // Tags (by uid).
  const tagLook = (r: Row) => `${r.name}|${r.color}|${r.icon}`;
  compare<Row>(
    'tag',
    'tag',
    new Map(pc.tags.map((r) => [String(r.uid), r])),
    new Map(phone.tags.map((r) => [String(r.uid), r])),
    (r) => String(r.name),
    (r) => num(r.updated_at ?? r.created_at),
    (a, b) =>
      tagLook(a) === tagLook(b)
        ? []
        : [a.name !== b.name ? `«${a.name}» en el PC, «${b.name}» en el móvil` : 'Color o icono distintos'],
    () => [],
  );

  // Tags on cards (tag + card).
  const tagName = new Map([...phone.tags, ...pc.tags].map((t) => [String(t.uid), String(t.name)]));
  const oracleName = new Map<string, string>();
  for (const data of [phone, pc]) {
    for (const r of [...data.collection, ...data.wanted]) oracleName.set(String(r.oracle_id), String(r.printed_name || r.name));
    for (const d of data.decks) for (const c of [...d.cards, ...d.side, ...d.maybe]) oracleName.set(String(c.oracle_id), String(c.printed_name || c.name));
  }
  compare<Row>(
    'cardTag',
    'cardTag',
    new Map(pc.cardTags.map((r) => [CARD_TAG(r), r])),
    new Map(phone.cardTags.map((r) => [CARD_TAG(r), r])),
    (r) => `${tagName.get(String(r.tag_uid)) ?? 'Etiqueta'} · ${oracleName.get(String(r.oracle_id)) ?? 'carta'}`,
    (r) => num(r.added_at),
    () => [],
    () => [],
  );

  return items;
}

/** The deck with the cards of both versions; where both have a card, the most recently changed deck's. */
function mergeDecks(pc: SyncDeck, phone: SyncDeck): SyncDeck {
  const [newer, older] = num(phone.deck.updated_at) > num(pc.deck.updated_at) ? [phone, pc] : [pc, phone];
  const zone = (key: 'cards' | 'side' | 'maybe') => {
    const out = new Map(older[key].map((c) => [String(c.oracle_id), c]));
    for (const c of newer[key]) out.set(String(c.oracle_id), c);
    return [...out.values()];
  };
  return { deck: newer.deck, cards: zone('cards'), side: zone('side'), maybe: zone('maybe') };
}

export const emptyPatch = (): SyncPatch => ({
  decks: [],
  deleteDecks: [],
  collection: [],
  deleteCollection: [],
  wanted: [],
  deleteWanted: [],
  tags: [],
  deleteTags: [],
  cardTags: [],
  deleteCardTags: [],
});

/** What the PC and the phone must change so both end up with what was picked for each difference. */
export function buildPatches(items: DiffItem[], picks: Record<string, SyncPick>): { toPc: SyncPatch; toPhone: SyncPatch } {
  const toPc = emptyPatch();
  const toPhone = emptyPatch();
  for (const item of items) {
    const pick = picks[item.id] ?? item.suggested;
    const final =
      pick === 'merge' && item.kind === 'deck' && item.pc && item.phone
        ? mergeDecks(item.pc as SyncDeck, item.phone as SyncDeck)
        : pick === 'phone'
          ? item.phone
          : item.pc;
    for (const [side, patch] of [['pc', toPc], ['phone', toPhone]] as const) {
      const current = item[side];
      if (final === current) continue; // already what stays
      if (final === null) {
        const list = { deck: patch.deleteDecks, card: patch.deleteCollection, want: patch.deleteWanted, tag: patch.deleteTags, cardTag: patch.deleteCardTags }[item.kind];
        list.push(item.key);
      } else if (item.kind === 'deck') patch.decks.push(final as SyncDeck);
      else {
        const list = { card: patch.collection, want: patch.wanted, tag: patch.tags, cardTag: patch.cardTags }[item.kind];
        list.push(final as Row);
      }
    }
  }
  // A tag that goes away isn't put on any card.
  for (const patch of [toPc, toPhone]) {
    const gone = new Set(patch.deleteTags);
    patch.cardTags = patch.cardTags.filter((r) => !gone.has(String(r.tag_uid)));
  }
  return { toPc, toPhone };
}

/** «2 mazos actualizados, 1 borrado, 15 cartas de la colección…» — or «nada». */
export function describePatch(p: SyncPatch): string {
  const parts: string[] = [];
  const n = (count: number, one: string, many: string) => count && parts.push(`${count} ${count === 1 ? one : many}`);
  n(p.decks.length, 'mazo actualizado', 'mazos actualizados');
  n(p.deleteDecks.length, 'mazo borrado', 'mazos borrados');
  n(p.collection.length, 'carta de la colección actualizada', 'cartas de la colección actualizadas');
  n(p.deleteCollection.length, 'carta quitada de la colección', 'cartas quitadas de la colección');
  n(p.wanted.length + p.deleteWanted.length, 'cambio en «La quiero»', 'cambios en «La quiero»');
  n(p.tags.length + p.deleteTags.length + p.cardTags.length + p.deleteCardTags.length, 'cambio de etiquetas', 'cambios de etiquetas');
  return parts.length ? parts.join(', ') : 'nada';
}

/** Text of each choice for a difference, from the user's point of view. */
export function pickLabel(item: DiffItem, pick: SyncPick): string {
  switch (item.state) {
    case 'changed':
      return pick === 'pc' ? 'La del PC' : pick === 'phone' ? 'La del móvil' : 'Juntar ambas';
    case 'onlyPc':
      return pick === 'pc' ? 'Pasar al móvil' : 'Borrar del PC';
    case 'onlyPhone':
      return pick === 'phone' ? 'Pasar al PC' : 'Borrar del móvil';
    case 'deletedOnPc':
      return pick === 'pc' ? 'Borrar también del móvil' : 'Recuperar en el PC';
    case 'deletedOnPhone':
      return pick === 'phone' ? 'Borrar también del PC' : 'Recuperar en el móvil';
  }
}

/** The choices a difference has (decks changed on both can also be joined). */
export const picksOf = (item: DiffItem): SyncPick[] =>
  item.state === 'changed' && item.kind === 'deck' ? ['pc', 'phone', 'merge'] : item.state === 'onlyPhone' || item.state === 'deletedOnPhone' ? ['phone', 'pc'] : ['pc', 'phone'];

/** Short text of the state: «Cambiado en los dos», «Nuevo en el móvil», «Borrado en el PC»… */
export const STATE_LABELS: Record<DiffState, string> = {
  changed: 'Distinto en cada uno',
  onlyPc: 'Solo en el PC',
  onlyPhone: 'Solo en el móvil',
  deletedOnPc: 'Borrado en el PC',
  deletedOnPhone: 'Borrado en el móvil',
};

export const KIND_LABELS: Record<DiffKind, string> = {
  deck: 'Mazos',
  card: 'Colección',
  want: '«La quiero»',
  tag: 'Etiquetas',
  cardTag: 'Etiquetas en cartas',
};
