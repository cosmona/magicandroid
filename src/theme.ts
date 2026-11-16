/** A bundled asset: `require('…png'/'…svg')` resolves to a numeric asset id in React Native. */
export type IconSource = number;

export const colors = {
  bg: '#14101c',
  surface: '#1f1a2b',
  surfaceAlt: '#2a2338',
  border: '#3a3150',
  text: '#f2eefa',
  textMuted: '#a69cba',
  accent: '#c9a227',
  add: '#2ecc71',
  discard: '#e74c3c',
  undo: '#f1c40f',
} as const;

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
  /** Scryfall format key (`f:`), null = no restriction. */
  key: string | null;
  label: string;
  icon: IconSource;
}

/** Same legality list as the web app (Data.tsx) plus Standard and Pioneer. */
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
  // MTG Arena only
  { key: 'historic', label: 'Historic (Arena)', icon: FORMAT_ICONS.generic },
  { key: 'timeless', label: 'Timeless (Arena)', icon: FORMAT_ICONS.generic },
  { key: 'alchemy', label: 'Alchemy (Arena)', icon: FORMAT_ICONS.generic },
  { key: 'brawl', label: 'Brawl (Arena)', icon: FORMAT_ICONS.commander },
  { key: 'standardbrawl', label: 'Standard Brawl (Arena)', icon: FORMAT_ICONS.commander },
];

/** Formats Scryfall can't search (`f:`): only for checking decks. */
export const DECK_ONLY_FORMATS = ['limited'];

/** Formats that only exist in MTG Arena: searching them looks at Arena cards (`game:arena`). */
export const ARENA_FORMATS = ['historic', 'timeless', 'alchemy', 'brawl', 'standardbrawl'];

export const formatOption = (key: string | null) => FORMATS.find((f) => f.key === key) ?? FORMATS[0];
export const formatLabel = (key: string | null) => formatOption(key).label;

/** Formats where a deck may only hold one copy of each card. */
export const SINGLETON_FORMATS = [
  'commander',
  'duel',
  'oathbreaker',
  'paupercommander',
  'predh',
  'brawl',
  'standardbrawl',
];

/** "0,45 €" / "12,30 €" / "143 €" (no cents from 100 up). */
export function formatEur(n: number): string {
  return n >= 100 ? `${Math.round(n)} €` : `${n.toFixed(2).replace('.', ',')} €`;
}
