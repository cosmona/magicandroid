// Iconos reutilizados de la app web (frontmagic/src/Media), copiados a assets/mtg/.
// Los SVG son negros: renderízalos con el `tintColor` de expo-image sobre el tema oscuro.
import type { IconSource } from '@/theme';
import type { Color, Rarity } from '@/api/scryfall';

/** Logo de la app con fondo transparente (assets/logo-mark.png, 480×416), para UI oscura. */
export const LOGO_MARK: IconSource = require('../assets/logo-mark.png');
export const LOGO_MARK_RATIO = 480 / 416;

/** Símbolos de maná simples (filtro de color y barra de estado de filtros). */
export const MANA_ICONS: Record<Color, IconSource> = {
  R: require('../assets/mtg/mana/red.png'),
  B: require('../assets/mtg/mana/black.png'),
  G: require('../assets/mtg/mana/green.png'),
  W: require('../assets/mtg/mana/white.png'),
  U: require('../assets/mtg/mana/blue.png'),
};

/** Mismo orden que el filtro de color de la app web. */
export const COLOR_ORDER: Color[] = ['R', 'B', 'G', 'W', 'U'];

export const RARITY_ICONS: Record<Rarity, IconSource> = {
  common: require('../assets/mtg/rarity/common.png'),
  uncommon: require('../assets/mtg/rarity/uncommon.png'),
  rare: require('../assets/mtg/rarity/rare.png'),
  mythic: require('../assets/mtg/rarity/mythic.png'),
};

export const RARITY_LABELS: Record<string, string> = {
  common: 'Común',
  uncommon: 'Infrecuente',
  rare: 'Rara',
  mythic: 'Mítica',
  special: 'Especial',
  bonus: 'Bonus',
};

const TYPE_ICONS: Record<string, IconSource> = {
  Artifact: require('../assets/mtg/types/artifact.svg'),
  Battle: require('../assets/mtg/types/battle.svg'),
  Conspiracy: require('../assets/mtg/types/conspiracy.svg'),
  Creature: require('../assets/mtg/types/creature.svg'),
  Enchantment: require('../assets/mtg/types/enchantment.svg'),
  Hero: require('../assets/mtg/types/hero.svg'),
  Instant: require('../assets/mtg/types/instant.svg'),
  Kindred: require('../assets/mtg/types/tribal.svg'),
  Land: require('../assets/mtg/types/land.svg'),
  Phenomenon: require('../assets/mtg/types/phenomenon.svg'),
  Plane: require('../assets/mtg/types/plane.svg'),
  Planeswalker: require('../assets/mtg/types/planeswalker.svg'),
  Scheme: require('../assets/mtg/types/scheme.svg'),
  Sorcery: require('../assets/mtg/types/sorcery.svg'),
  Vanguard: require('../assets/mtg/types/vanguard.svg'),
};
const GENERIC_TYPE_ICON = require('../assets/mtg/types/generic.svg');

export const typeIcon = (type: string): IconSource => TYPE_ICONS[type] ?? GENERIC_TYPE_ICON;

export const TYPE_LABELS: Record<string, string> = {
  Artifact: 'Artefacto',
  Battle: 'Batalla',
  Creature: 'Criatura',
  Enchantment: 'Encantamiento',
  Instant: 'Instantáneo',
  Kindred: 'Tribal',
  Land: 'Tierra',
  Planeswalker: 'Planeswalker',
  Sorcery: 'Conjuro',
};

/** Tipos de carta principales ofrecidos como chips de filtro (nombres del catálogo de Scryfall). */
export const MAIN_TYPES = [
  'Creature',
  'Instant',
  'Sorcery',
  'Enchantment',
  'Artifact',
  'Planeswalker',
  'Land',
  'Battle',
  'Kindred',
];

/** Nombres en español de las habilidades de palabra clave; lo que falte se muestra en inglés. */
export const KEYWORD_LABELS: Record<string, string> = {
  Flying: 'Vuela',
  Trample: 'Arrollar',
  Haste: 'Prisa',
  Deathtouch: 'Toque mortal',
  Lifelink: 'Vínculo vital',
  Vigilance: 'Vigilancia',
  Reach: 'Alcance',
  Flash: 'Destello',
  Menace: 'Amenaza',
  'First strike': 'Dañar primero',
  'Double strike': 'Dañar dos veces',
  Hexproof: 'Antimaleficio',
  Indestructible: 'Indestructible',
  Ward: 'Custodia',
  Defender: 'Defensor',
  Protection: 'Protección',
  Shroud: 'Velo',
  Cycling: 'Ciclo',
  Kicker: 'Estímulo',
  Flashback: 'Retrospectiva',
  Equip: 'Equipar',
  Enchant: 'Encantar',
  Scry: 'Adivinar',
  Mill: 'Moler',
  Surveil: 'Vigilar',
  Convoke: 'Convocar',
  Prowess: 'Destreza',
  Cascade: 'Cascada',
  Delve: 'Excavar',
  Affinity: 'Afinidad',
  Changeling: 'Cambiaformas',
  Infect: 'Infectar',
  Persist: 'Persistir',
  Undying: 'Inagotable',
  Storm: 'Tormenta',
  Madness: 'Locura',
  Unearth: 'Exhumar',
  Evoke: 'Evocar',
  Dredge: 'Dragar',
  Morph: 'Metamorfosis',
  Fear: 'Miedo',
  Intimidate: 'Intimidar',
  Landwalk: 'Cruzar tierras',
  Fight: 'Luchar',
  Transform: 'Transformar',
  Crew: 'Tripular',
  Fabricate: 'Fabricar',
  Explore: 'Explorar',
  Investigate: 'Investigar',
  Proliferate: 'Proliferar',
  Treasure: 'Tesoro',
  Food: 'Comida',
};

/** Chips de palabra clave de acceso rápido mostrados directamente en el panel de filtros. */
export const COMMON_KEYWORDS = [
  'Flying',
  'Trample',
  'Haste',
  'Deathtouch',
  'Lifelink',
  'Vigilance',
  'Reach',
  'Flash',
  'Menace',
  'First strike',
  'Hexproof',
  'Indestructible',
];
