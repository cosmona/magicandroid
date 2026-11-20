// Qué muestran de cada carta las listas y galerías del mazo y la colección, elegido en
// Ajustes → Cartas y listas (como el PC): las líneas de las filas de lista (cada una con sus datos, de
// izquierda a derecha) y dónde va cada icono en las cartas de galería (una rejilla 3 × 4 sobre la imagen).
import { Fragment, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LANGUAGE_NAMES } from '@/api/scryfall';
import { ManaCost } from '@/components/ManaCost';
import { TagChip } from '@/components/tags/Tags';
import type { Tag } from '@/db/database';
import { RARITY_ICONS, RARITY_LABELS } from '@/icons';
import { colors, formatEur, formatLabel } from '@/theme';

export type LayoutPlace = 'deck' | 'collection';
export const LAYOUT_PLACES: { key: LayoutPlace; label: string }[] = [
  { key: 'deck', label: 'Mazo' },
  { key: 'collection', label: 'Colección' },
];
const WANT = '#ff7a9c';

/** Todo lo que una fila o una tarjeta puede mostrar de una carta (lo que no tiene se omite). */
export interface CardInfo {
  name: string;
  printedName?: string | null;
  manaCost?: string | null;
  typeLine?: string;
  oracleText?: string | null;
  set?: string;
  lang?: string;
  rarity?: string | null;
  price?: number | null;
  /** «F/R 3/3», «Lealtad 4»… */
  stats?: string | null;
  legalities?: Record<string, string> | null;
  deckFormat?: string | null;
  tags?: Tag[];
  /** Copias en el mazo (mazo) o de esta impresión (colección). */
  quantity?: number;
  commander?: boolean;
  /** Copias que tienes de la carta (todas las impresiones). */
  owned?: number;
  wanted?: boolean;
  /** Copias en «Posibles». */
  maybe?: number;
  issues?: string[];
  /** Los mazos que la usan (colección), y cuántas copias quedan libres. */
  decks?: { name: string; quantity: number }[];
  free?: number;
}

// ======================= Filas de lista =======================

export interface FieldDef {
  key: string;
  label: string;
  hint: string;
  places?: LayoutPlace[];
  render: (c: CardInfo) => ReactNode;
}

const Muted = ({ children }: { children: ReactNode }) => <Text style={s.muted}>{children}</Text>;

export const LIST_FIELDS: FieldDef[] = [
  { key: 'cost', label: 'Coste de maná', hint: 'Los símbolos del coste.', render: (c) => (c.manaCost ? <ManaCost cost={c.manaCost} size={15} /> : null) },
  {
    key: 'altName',
    label: 'Nombre en inglés',
    hint: 'Si la carta está en otro idioma.',
    render: (c) => (c.printedName && c.printedName !== c.name ? <Muted>{c.name}</Muted> : null),
  },
  { key: 'type', label: 'Tipo completo', hint: '«Criatura — Trasgo guerrero».', render: (c) => (c.typeLine ? <Muted>{c.typeLine}</Muted> : null) },
  { key: 'types', label: 'Tipos', hint: 'Solo los tipos (sin subtipos).', render: (c) => (c.typeLine ? <Muted>{c.typeLine.split(' — ')[0]}</Muted> : null) },
  { key: 'subtypes', label: 'Subtipos', hint: 'Solo los subtipos.', render: (c) => (c.typeLine?.includes(' — ') ? <Muted>{c.typeLine.split(' — ')[1]}</Muted> : null) },
  {
    key: 'text',
    label: 'Texto de reglas',
    hint: 'Hasta 4 líneas.',
    render: (c) =>
      c.oracleText ? (
        <Text style={s.text} numberOfLines={4}>
          {c.oracleText}
        </Text>
      ) : null,
  },
  { key: 'stats', label: 'Fuerza / resistencia', hint: 'O lealtad, o defensa.', render: (c) => (c.stats ? <Text style={s.bold}>{c.stats}</Text> : null) },
  { key: 'set', label: 'Edición', hint: 'El código de la edición.', render: (c) => (c.set ? <Text style={s.bold}>{c.set.toUpperCase()}</Text> : null) },
  { key: 'lang', label: 'Idioma', hint: 'El idioma de la impresión.', render: (c) => (c.lang ? <Muted>{LANGUAGE_NAMES[c.lang] ?? c.lang}</Muted> : null) },
  { key: 'rarity', label: 'Rareza', hint: 'Común, infrecuente, rara, mítica.', render: (c) => (c.rarity ? <Muted>{RARITY_LABELS[c.rarity] ?? c.rarity}</Muted> : null) },
  { key: 'price', label: 'Precio', hint: 'Cardmarket (si está activado en Precios).', render: (c) => (c.price != null ? <Text style={[s.bold, { color: colors.accent }]}>{formatEur(c.price)}</Text> : null) },
  {
    key: 'legality',
    label: 'Legalidad',
    hint: 'Aviso si no es legal en el formato del mazo.',
    render: (c) => {
      const l = c.deckFormat ? c.legalities?.[c.deckFormat] : undefined;
      if (!l || l === 'legal' || l === 'restricted') return null;
      return <Text style={[s.bold, { color: colors.discard }]}>⚠ {l === 'banned' ? 'Prohibida' : 'No legal'} en {formatLabel(c.deckFormat!)}</Text>;
    },
  },
  {
    key: 'tags',
    label: 'Etiquetas',
    hint: 'Las etiquetas de la carta.',
    render: (c) => (c.tags?.length ? <View style={s.tags}>{c.tags.map((t) => <TagChip key={t.uid} tag={t} small />)}</View> : null),
  },
  {
    key: 'owned',
    label: 'En tu colección',
    hint: 'Cuántas tienes de la carta.',
    places: ['deck'],
    render: (c) =>
      c.owned === undefined ? null : (
        <Text style={[s.bold, { color: c.owned >= (c.quantity ?? 1) ? colors.add : colors.undo }]}>📦 {c.owned}</Text>
      ),
  },
  {
    key: 'usage',
    label: 'En tus mazos',
    hint: 'En qué mazos está y cuántas quedan libres.',
    places: ['collection'],
    render: (c) =>
      c.decks?.length ? (
        <Text style={[s.small, { color: colors.add }]} numberOfLines={2}>
          En {c.decks.map((d) => `${d.name} (${d.quantity})`).join(', ')}
          {c.free !== undefined && (
            <Text style={{ color: c.free > 0 ? colors.textMuted : colors.undo }}>
              {' · '}
              {c.free > 0 ? `${c.free} libre${c.free > 1 ? 's' : ''}` : c.free === 0 ? 'ninguna libre' : `faltan ${-c.free}`}
            </Text>
          )}
        </Text>
      ) : null,
  },
  {
    key: 'wanted',
    label: 'La quiero',
    hint: 'Si la tienes en «La quiero».',
    render: (c) => (c.wanted ? <Text style={[s.small, { color: WANT }]}>♥ La quieres</Text> : null),
  },
];
export const FIELD_BY_KEY = new Map(LIST_FIELDS.map((f) => [f.key, f]));
export const fieldsOf = (place: LayoutPlace) => LIST_FIELDS.filter((f) => !f.places || f.places.includes(place));
export const MAX_LINES = 5;

export type ListLayout = string[][];
export const DEFAULT_LIST: Record<LayoutPlace, ListLayout> = {
  deck: [['cost', 'stats', 'price'], ['type'], ['text'], ['tags']],
  collection: [['set', 'lang', 'rarity', 'price'], ['type'], ['tags'], ['usage', 'wanted']],
};

export function listFor(prefs: { listLayout?: Partial<Record<LayoutPlace, ListLayout>> }, place: LayoutPlace): ListLayout {
  const ok = new Set(fieldsOf(place).map((f) => f.key));
  return (prefs.listLayout?.[place] ?? DEFAULT_LIST[place]).map((line) => line.filter((k) => ok.has(k)));
}

/** Las líneas de una fila (las vacías se omiten), cada una ajustándose. */
export function RowLines({ layout, info }: { layout: ListLayout; info: CardInfo }) {
  return (
    <>
      {layout.map((line, i) => {
        const parts = line.map((k) => {
          const node = FIELD_BY_KEY.get(k)?.render(info);
          return node ? <Fragment key={k}>{node}</Fragment> : null;
        });
        if (!parts.some(Boolean)) return null;
        return (
          <View key={i} style={s.line}>
            {parts}
          </View>
        );
      })}
    </>
  );
}

// ======================= Tarjetas de galería =======================

export const GRID_COLS = 3;
export const GRID_ROWS = 4;
export const CELLS = GRID_COLS * GRID_ROWS;
export type GalleryLayout = string[][];

const Badge = ({ bg, fg = colors.bg, children, border }: { bg: string; fg?: string; children: ReactNode; border?: string }) => (
  <View style={[s.badge, { backgroundColor: bg }, border ? { borderWidth: 1, borderColor: border } : null]}>
    {typeof children === 'string' ? <Text style={[s.badgeText, { color: fg }]}>{children}</Text> : children}
  </View>
);

export interface IconDef {
  key: string;
  label: string;
  hint: string;
  places?: LayoutPlace[];
  render: (c: CardInfo) => ReactNode;
}
export const GALLERY_ICONS: IconDef[] = [
  {
    key: 'quantity',
    label: 'Copias',
    hint: 'En el mazo (👑 si es el comandante) o de esta impresión.',
    render: (c) => (c.quantity ? <Badge bg="rgba(0,0,0,0.8)" fg={colors.text}>{`${c.commander ? '👑 ' : ''}x${c.quantity}`}</Badge> : null),
  },
  {
    key: 'owned',
    label: 'En tu colección',
    hint: 'Verde: tienes todas; amarillo: te faltan.',
    places: ['deck'],
    render: (c) =>
      c.owned ? (
        <Badge bg={c.owned >= (c.quantity ?? 1) ? colors.add : colors.undo}>
          <MaterialCommunityIcons name="package-variant-closed" size={13} color={colors.bg} />
        </Badge>
      ) : null,
  },
  { key: 'wanted', label: 'La quiero', hint: 'Si la quieres.', render: (c) => (c.wanted ? <Badge bg="rgba(0,0,0,0.8)" fg={WANT}>♥</Badge> : null) },
  { key: 'maybe', label: 'En Posibles', hint: 'Copias apartadas en Posibles.', places: ['deck'], render: (c) => (c.maybe ? <Badge bg={colors.info}>{`? ${c.maybe}`}</Badge> : null) },
  { key: 'issues', label: 'Problemas', hint: 'Si no cumple las reglas del mazo.', places: ['deck'], render: (c) => (c.issues?.length ? <Badge bg={colors.discard} fg="#fff">⚠</Badge> : null) },
  {
    key: 'inDecks',
    label: 'En algún mazo',
    hint: 'Si la usas en algún mazo.',
    places: ['collection'],
    render: (c) =>
      c.decks?.length ? (
        <Badge bg={colors.add}>
          <MaterialCommunityIcons name="cards-playing" size={13} color={colors.bg} />
        </Badge>
      ) : null,
  },
  { key: 'price', label: 'Precio', hint: 'Cardmarket.', render: (c) => (c.price != null ? <Badge bg="rgba(0,0,0,0.8)" fg={colors.accent}>{formatEur(c.price)}</Badge> : null) },
  {
    key: 'rarity',
    label: 'Rareza',
    hint: 'El símbolo de la rareza.',
    render: (c) => {
      const icon = c.rarity ? RARITY_ICONS[c.rarity as keyof typeof RARITY_ICONS] : undefined;
      return icon ? <Image source={icon} style={{ width: 18, height: 18 }} contentFit="contain" /> : null;
    },
  },
  { key: 'set', label: 'Edición', hint: 'El código de la edición.', render: (c) => (c.set ? <Badge bg="rgba(0,0,0,0.8)" fg={colors.text}>{c.set.toUpperCase()}</Badge> : null) },
  { key: 'lang', label: 'Idioma', hint: 'El código del idioma.', render: (c) => (c.lang ? <Badge bg="rgba(0,0,0,0.8)" fg={colors.text}>{c.lang.toUpperCase()}</Badge> : null) },
  {
    key: 'tags',
    label: 'Etiquetas',
    hint: 'Un punto por etiqueta, con su color.',
    render: (c) => (c.tags?.length ? <View style={s.dots}>{c.tags.map((t) => <View key={t.uid} style={[s.dot, { backgroundColor: t.color }]} />)}</View> : null),
  },
];
export const ICON_BY_KEY = new Map(GALLERY_ICONS.map((i) => [i.key, i]));
export const iconsOf = (place: LayoutPlace) => GALLERY_ICONS.filter((i) => !i.places || i.places.includes(place));

export const cell = (row: number, col: number) => row * GRID_COLS + col;
const gallery = (cells: Record<number, string[]>): GalleryLayout => Array.from({ length: CELLS }, (_, i) => cells[i] ?? []);
export const DEFAULT_GALLERY: Record<LayoutPlace, GalleryLayout> = {
  deck: gallery({ [cell(0, 0)]: ['quantity'], [cell(0, 2)]: ['issues'], [cell(3, 0)]: ['owned', 'maybe'], [cell(3, 2)]: ['tags'] }),
  collection: gallery({ [cell(0, 0)]: ['quantity'], [cell(0, 2)]: ['wanted'], [cell(3, 0)]: ['inDecks'], [cell(3, 2)]: ['tags'] }),
};
export function galleryFor(prefs: { galleryLayout?: Partial<Record<LayoutPlace, GalleryLayout>> }, place: LayoutPlace): GalleryLayout {
  const ok = new Set(iconsOf(place).map((i) => i.key));
  const g = prefs.galleryLayout?.[place] ?? DEFAULT_GALLERY[place];
  return Array.from({ length: CELLS }, (_, i) => (g[i] ?? []).filter((k) => ok.has(k)));
}

const JUSTIFY = ['flex-start', 'center', 'flex-end'] as const;
/** Los iconos sobre una carta de galería (absolutos, sobre la imagen; los toques pasan a través). */
export function TileIcons({ layout, info }: { layout: GalleryLayout; info: CardInfo }) {
  return (
    <View pointerEvents="none" style={s.grid}>
      {Array.from({ length: GRID_ROWS }, (_, r) => (
        <View key={r} style={s.gridRow}>
          {Array.from({ length: GRID_COLS }, (_, c) => {
            const parts = (layout[cell(r, c)] ?? []).map((k) => {
              const node = ICON_BY_KEY.get(k)?.render(info);
              return node ? <Fragment key={k}>{node}</Fragment> : null;
            });
            return (
              <View
                key={c}
                style={[s.gridCell, { justifyContent: JUSTIFY[c], alignItems: r === 0 ? 'flex-start' : r === GRID_ROWS - 1 ? 'flex-end' : 'center' }]}
              >
                {parts}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  muted: { color: colors.textMuted, fontSize: 13 },
  small: { fontSize: 12.5 },
  bold: { color: colors.text, fontSize: 13, fontWeight: '800' },
  text: { color: colors.text, fontSize: 13, lineHeight: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2 },
  grid: { ...StyleSheet.absoluteFill, padding: 4 },
  gridRow: { flex: 1, flexDirection: 'row' },
  gridCell: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  badgeText: { fontSize: 11.5, fontWeight: '900' },
  dots: { flexDirection: 'row', gap: 3, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, padding: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
