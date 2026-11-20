import { openDatabaseSync } from 'expo-sqlite';
import { DEFAULT_THEME, THEMES, type ColorToken, type Palette, type ThemeKey } from '@/themeData';
/** Un asset empaquetado: `require('…png'/'…svg')` resuelve a un id numérico de asset en React Native. */
export type IconSource = number;


export type { ColorToken, Palette, ThemeKey };
export { THEMES, DEFAULT_THEME };

/** Ajustes → Apariencia: el tema elegido y los colores cambiados a mano sobre él. */
export interface Appearance {
  theme: ThemeKey;
  colors: Partial<Palette>;
}
export const DEFAULT_APPEARANCE: Appearance = { theme: DEFAULT_THEME, colors: {} };

export function normalizeAppearance(a: Partial<Appearance> | undefined): Appearance {
  const out: Appearance = { ...DEFAULT_APPEARANCE, ...(a ?? {}) };
  if (!THEMES[out.theme]) out.theme = DEFAULT_THEME;
  out.colors = { ...(out.colors ?? {}) };
  return out;
}

/** La paleta final = los colores del tema con los cambios por color del usuario encima. */
export const paletteOf = (a: Appearance): Palette => ({ ...THEMES[a.theme].colors, ...a.colors });

// La apariencia se guarda en su propia base de datos pequeña para poder leerla SÍNCRONAMENTE al
// arrancar, antes de construir ningún StyleSheet (React Native «quema» los colores en los estilos al
// cargar el módulo, así que hay que conocer toda la paleta de antemano). Cambiarla guarda aquí y
// recarga la app para aplicarla en todas partes.
const THEME_DB = 'magicswipe-theme.db';
const THEME_ROW = 'appearance';

function themeDb() {
  const db = openDatabaseSync(THEME_DB);
  db.execSync('CREATE TABLE IF NOT EXISTS theme (key TEXT PRIMARY KEY, value TEXT)');
  return db;
}

function readAppearanceSync(): Appearance {
  try {
    const row = themeDb().getFirstSync<{ value: string }>('SELECT value FROM theme WHERE key = ?', THEME_ROW);
    if (row?.value) return normalizeAppearance(JSON.parse(row.value));
  } catch {
    // Primera ejecución, o la base de datos aún no está lista: usar el tema por defecto.
  }
  return DEFAULT_APPEARANCE;
}

/** Guarda la apariencia para que la use el PRÓXIMO arranque (síncrono; llámalo y recarga la app). */
export function saveAppearanceSync(a: Appearance) {
  try {
    themeDb().runSync(
      'INSERT INTO theme (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      THEME_ROW,
      JSON.stringify(normalizeAppearance(a)),
    );
  } catch {
    // Se ignora: simplemente la apariencia no persistirá.
  }
}

/** La apariencia en uso en esta ejecución (leída una vez, al importar). */
export const appearance: Appearance = readAppearanceSync();
export const scheme: 'dark' | 'light' = THEMES[appearance.theme].scheme;

/** Los colores en uso, resueltos del tema guardado + los cambios manuales. */
export const colors: Palette = paletteOf(appearance);

/** Grupos de colores mostrados en Ajustes → Apariencia (replica el PC). */
export const COLOR_GROUPS: { title: string; hint: string; keys: ColorToken[] }[] = [
  { title: 'Base', hint: 'El fondo, los paneles, los bordes y el texto de toda la app.', keys: ['bg', 'surface', 'surfaceAlt', 'border', 'text', 'textMuted'] },
  { title: 'Acciones y avisos', hint: 'Botones principales y lo que añade, quita, avisa o informa.', keys: ['accent', 'onAccent', 'add', 'discard', 'warn', 'info'] },
  { title: 'Tus cartas', hint: 'Dónde está cada carta: en tu mazo, en tu colección o en «La quiero».', keys: ['deck', 'onDeck', 'collection', 'want'] },
  { title: 'El mazo', hint: 'Las zonas del mazo, el comandante y los precios.', keys: ['maybe', 'side', 'commander', 'price'] },
  { title: 'Legalidad', hint: 'Si una carta se puede jugar en un formato.', keys: ['legal', 'restricted', 'banned'] },
  { title: 'Colores de maná', hint: 'Las barras y gráficas de las estadísticas del mazo.', keys: ['manaW', 'manaU', 'manaB', 'manaR', 'manaG', 'manaC'] },
  { title: 'Ventanas', hint: 'El fondo de las fichas que se abren encima.', keys: ['deckModal', 'synergyModal'] },
];

export const COLOR_LABELS: Record<ColorToken, { label: string; hint: string }> = {
  bg: { label: 'Fondo', hint: 'El fondo de la app' },
  surface: { label: 'Paneles', hint: 'Columnas, hojas y tarjetas' },
  surfaceAlt: { label: 'Paneles resaltados', hint: 'Lo seleccionado y lo resaltado' },
  border: { label: 'Bordes', hint: 'Líneas y contornos' },
  text: { label: 'Texto', hint: 'El texto normal' },
  textMuted: { label: 'Texto secundario', hint: 'Ayudas, tipos, datos menores' },
  accent: { label: 'Acento', hint: 'Botones principales y selección' },
  onAccent: { label: 'Texto sobre acento', hint: 'Letras de los botones de color' },
  add: { label: 'Añadir / válido', hint: '＋, «La tengo», mazo válido' },
  discard: { label: 'Quitar / error', hint: '−, borrar, problemas' },
  warn: { label: 'Aviso', hint: '«Faltan N», comprar, revisar' },
  undo: { label: 'Aviso (alt.)', hint: 'Igual que «Aviso»' },
  info: { label: 'Información', hint: 'Ficha, estadísticas, Posibles' },
  want: { label: 'La quiero', hint: 'Los corazones' },
  deck: { label: 'En el mazo', hint: 'Lo que ya está en tu mazo' },
  onDeck: { label: 'Texto sobre el mazo', hint: 'Letras e iconos sobre el color del mazo' },
  collection: { label: 'Colección', hint: '«La tengo», «En tu colección»' },
  synergyModal: { label: 'Modal de sinergias', hint: 'Fondo de las cartas abiertas desde Sinergias' },
  deckModal: { label: 'Modal del mazo', hint: 'Fondo de la ficha de las cartas de tu mazo' },
  maybe: { label: 'Posibles', hint: 'Las cartas apartadas: botón, contador y zona' },
  side: { label: 'Banquillo', hint: 'El banquillo del mazo' },
  commander: { label: 'Comandante', hint: 'La corona y el recuadro del comandante' },
  price: { label: 'Precio', hint: 'Los precios en euros' },
  legal: { label: 'Legal', hint: 'Se puede jugar en el formato' },
  restricted: { label: 'Restringida', hint: 'Solo una copia (Vintage)' },
  banned: { label: 'Prohibida / no legal', hint: 'No se puede jugar' },
  manaW: { label: 'Blanco', hint: 'Maná blanco en las estadísticas' },
  manaU: { label: 'Azul', hint: 'Maná azul en las estadísticas' },
  manaB: { label: 'Negro', hint: 'Maná negro en las estadísticas' },
  manaR: { label: 'Rojo', hint: 'Maná rojo en las estadísticas' },
  manaG: { label: 'Verde', hint: 'Maná verde en las estadísticas' },
  manaC: { label: 'Incoloro', hint: 'Maná incoloro en las estadísticas' },
};

/**
 * Código de colores de botones y avisos (el mismo significado en todas partes):
 * - primary (oro): crear / editar / acción principal de una pantalla.
 * - info (azul): consultar cosas (info de carta, estadísticas, sinergias, fichas).
 * - owned (verde): tu colección, «la tienes», válido.
 * - warn (amarillo): cartas que faltan, cosas que revisar, comprar.
 * - danger (rojo): quitar, vaciar, borrar, errores.
 * Los botones neutros (navegación, compartir, vistas) mantienen el color del texto.
 */
export type Tone = 'primary' | 'info' | 'owned' | 'warn' | 'danger';
export const TONE_COLORS: Record<Tone, string> = {
  primary: colors.accent,
  info: colors.info,
  owned: colors.add,
  warn: colors.undo,
  danger: colors.discard,
};

const FORMAT_ICONS = {
  commander: require('../assets/mtg/formats/commander.svg'),
  duel: require('../assets/mtg/formats/duel.svg'),
  legacy: require('../assets/mtg/formats/legacy.svg'),
  modern: require('../assets/mtg/formats/modern.svg'),
  oathbreaker: require('../assets/mtg/formats/oathbreaker.svg'),
  pauper: require('../assets/mtg/formats/pauper.svg'),
  paupercommander: require('../assets/mtg/formats/paupercommander.svg'),
  penny: require('../assets/mtg/formats/penny.svg'),
  predh: require('../assets/mtg/formats/predh.svg'),
  premodern: require('../assets/mtg/formats/premodern.svg'),
  vintage: require('../assets/mtg/formats/vintage.svg'),
  generic: require('../assets/mtg/formats/generic.svg'),
};

export interface FormatOption {
  /** Clave de formato de Scryfall (`f:`), null = sin restricción. */
  key: string | null;
  label: string;
  icon: IconSource;
}

/** Misma lista de legalidad que la app web (Data.tsx) más Standard y Pioneer. */
export const FORMATS: FormatOption[] = [
  { key: null, label: 'Libre', icon: FORMAT_ICONS.generic },
  { key: 'limited', label: 'Limitado (draft / sellado)', icon: FORMAT_ICONS.generic },
  { key: 'standard', label: 'Estándar', icon: FORMAT_ICONS.generic },
  { key: 'pioneer', label: 'Pioneer', icon: FORMAT_ICONS.generic },
  { key: 'commander', label: 'Commander', icon: FORMAT_ICONS.commander },
  { key: 'duel', label: 'Duel', icon: FORMAT_ICONS.duel },
  { key: 'legacy', label: 'Legacy', icon: FORMAT_ICONS.legacy },
  { key: 'modern', label: 'Modern', icon: FORMAT_ICONS.modern },
  { key: 'oathbreaker', label: 'Oathbreaker', icon: FORMAT_ICONS.oathbreaker },
  { key: 'pauper', label: 'Pauper', icon: FORMAT_ICONS.pauper },
  { key: 'paupercommander', label: 'Pauper Commander', icon: FORMAT_ICONS.paupercommander },
  { key: 'penny', label: 'Penny Dreadful', icon: FORMAT_ICONS.penny },
  { key: 'predh', label: 'PreDH', icon: FORMAT_ICONS.predh },
  { key: 'premodern', label: 'Premodern', icon: FORMAT_ICONS.premodern },
  { key: 'vintage', label: 'Vintage', icon: FORMAT_ICONS.vintage },
  // Solo MTG Arena
  { key: 'historic', label: 'Historic (Arena)', icon: FORMAT_ICONS.generic },
  { key: 'timeless', label: 'Timeless (Arena)', icon: FORMAT_ICONS.generic },
  { key: 'alchemy', label: 'Alchemy (Arena)', icon: FORMAT_ICONS.generic },
  { key: 'brawl', label: 'Brawl (Arena)', icon: FORMAT_ICONS.commander },
  { key: 'standardbrawl', label: 'Standard Brawl (Arena)', icon: FORMAT_ICONS.commander },
];

/** Formatos que Scryfall no puede buscar (`f:`): solo para validar mazos. */
export const DECK_ONLY_FORMATS = ['limited'];

/** Formatos que solo existen en MTG Arena: buscarlos mira cartas de Arena (`game:arena`). */
export const ARENA_FORMATS = ['historic', 'timeless', 'alchemy', 'brawl', 'standardbrawl'];

export const formatOption = (key: string | null) => FORMATS.find((f) => f.key === key) ?? FORMATS[0];
export const formatLabel = (key: string | null) => formatOption(key).label;

/** Formatos donde un mazo solo puede tener una copia de cada carta. */
export const SINGLETON_FORMATS = [
  'commander',
  'duel',
  'oathbreaker',
  'paupercommander',
  'predh',
  'brawl',
  'standardbrawl',
];

/** «0,45 €» / «12,30 €» / «143 €» (sin céntimos a partir de 100). */
export function formatEur(n: number): string {
  return n >= 100 ? `${Math.round(n)} €` : `${n.toFixed(2).replace('.', ',')} €`;
}

/** Recarga el JS para que una apariencia guardada surta efecto. Funciona en desarrollo; en una
 *  release build el usuario reabre la app (quien llama muestra un aviso). Devuelve true si se recargó. */
export function reloadApp(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DevSettings } = require('react-native') as { DevSettings?: { reload?: () => void } };
    if (DevSettings?.reload) {
      DevSettings.reload();
      return true;
    }
  } catch {
    // se ignora
  }
  return false;
}
