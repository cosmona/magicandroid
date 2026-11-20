// Qué significa cada campo de carta de Scryfall, en español, para la pantalla de info de carta.
// https://scryfall.com/docs/api/cards — los campos de imagen (image_uris, image_status…) se omiten a propósito.

/** Cómo se muestra un valor. */
export type FieldKind =
  | 'text'
  | 'multiline'
  | 'italic'
  | 'mana'
  | 'colors'
  | 'bool'
  | 'date'
  | 'list'
  | 'number'
  | 'price-eur'
  | 'price-usd'
  | 'price-tix'
  | 'code';

export interface FieldDef {
  /** Ruta en el objeto de carta; «a.b» para valores anidados. */
  key: string;
  label: string;
  help: string;
  kind?: FieldKind;
  /** Traduce los valores en crudo (también cada elemento de una lista). */
  values?: Record<string, string>;
}

export interface SectionDef {
  title: string;
  icon: string;
  fields: FieldDef[];
}

export const LAYOUTS: Record<string, string> = {
  normal: 'Normal',
  split: 'Partida (dos mitades)',
  flip: 'Girable (Kamigawa)',
  transform: 'Transformable (dos caras)',
  modal_dfc: 'Modal de dos caras',
  meld: 'Fusionable (meld)',
  leveler: 'Subir de nivel',
  class: 'Clase',
  case: 'Caso',
  saga: 'Saga',
  adventure: 'Aventura',
  mutate: 'Mutar',
  prototype: 'Prototipo',
  battle: 'Batalla',
  planar: 'Plano (Planechase)',
  scheme: 'Plan (Archenemy)',
  vanguard: 'Vanguard',
  token: 'Ficha',
  double_faced_token: 'Ficha de dos caras',
  emblem: 'Emblema',
  augment: 'Aumento (Unstable)',
  host: 'Anfitrión (Unstable)',
  art_series: 'Serie de arte',
  reversible_card: 'Reversible',
};

export const SET_TYPES: Record<string, string> = {
  core: 'Edición básica',
  expansion: 'Expansión',
  masters: 'Masters (reimpresiones)',
  eternal: 'Eterna (reimpresiones)',
  alchemy: 'Alchemy (solo Arena)',
  masterpiece: 'Masterpiece',
  arsenal: 'Arsenal',
  from_the_vault: 'From the Vault',
  spellbook: 'Spellbook',
  premium_deck: 'Premium Deck',
  duel_deck: 'Duel Deck',
  draft_innovation: 'Draft especial',
  treasure_chest: 'Treasure Chest (MTGO)',
  commander: 'Commander',
  planechase: 'Planechase',
  archenemy: 'Archenemy',
  vanguard: 'Vanguard',
  funny: 'Humor / Un-set',
  starter: 'Inicio',
  box: 'Caja / regalo',
  promo: 'Promocional',
  token: 'Fichas',
  memorabilia: 'Memorabilia',
  minigame: 'Minijuego',
};

const BORDERS: Record<string, string> = {
  black: 'Negro',
  white: 'Blanco',
  borderless: 'Sin borde',
  silver: 'Plateado',
  gold: 'Dorado',
  yellow: 'Amarillo',
};

const FINISHES: Record<string, string> = {
  nonfoil: 'Normal',
  foil: 'Foil',
  etched: 'Grabado (etched)',
  glossy: 'Brillo',
};

const GAMES: Record<string, string> = {
  paper: 'Papel',
  arena: 'MTG Arena',
  mtgo: 'Magic Online',
  astral: 'Astral',
  sega: 'Sega',
};

const FRAMES: Record<string, string> = {
  '1993': '1993 (original)',
  '1997': '1997 (clásico)',
  '2003': '2003 (moderno)',
  '2015': '2015 (actual, con sello holográfico)',
  future: 'Futuro (Future Sight)',
};

const SECURITY_STAMPS: Record<string, string> = {
  oval: 'Óvalo',
  triangle: 'Triángulo',
  acorn: 'Bellota (no apta para torneos)',
  circle: 'Círculo',
  arena: 'Arena',
  heart: 'Corazón',
};

export const LEGALITY_STATUS: Record<string, string> = {
  legal: 'Legal',
  not_legal: 'No legal',
  banned: 'Prohibida',
  restricted: 'Restringida',
};

/** Claves de formato de `legalities`, en orden de visualización. */
export const LEGALITY_FORMATS: Record<string, string> = {
  standard: 'Estándar',
  future: 'Futuro Estándar',
  pioneer: 'Pioneer',
  modern: 'Modern',
  legacy: 'Legacy',
  vintage: 'Vintage',
  pauper: 'Pauper',
  commander: 'Commander',
  oathbreaker: 'Oathbreaker',
  duel: 'Duel Commander',
  paupercommander: 'Pauper Commander',
  predh: 'PreDH',
  premodern: 'Premodern',
  oldschool: 'Old School',
  penny: 'Penny Dreadful',
  brawl: 'Brawl',
  standardbrawl: 'Brawl Estándar',
  historic: 'Historic (Arena)',
  timeless: 'Timeless (Arena)',
  gladiator: 'Gladiator (Arena)',
  explorer: 'Explorer (Arena)',
  alchemy: 'Alchemy (Arena)',
};

/** Campos compartidos por la carta y cada una de sus caras. */
export const RULES_FIELDS: FieldDef[] = [
  {
    key: 'name',
    label: 'Nombre',
    help: 'Nombre oficial en inglés. Es el que se usa en torneos, en Cardmarket y para buscarla.',
  },
  {
    key: 'printed_name',
    label: 'Nombre impreso',
    help: 'El nombre tal como aparece en esta impresión cuando no está en inglés.',
  },
  {
    key: 'mana_cost',
    label: 'Coste de maná',
    help: 'Lo que cuesta lanzarla. Los números son maná genérico (de cualquier color); los símbolos, maná de ese color.',
    kind: 'mana',
  },
  {
    key: 'cmc',
    label: 'Valor de maná',
    help: 'La suma de todo el coste (antes «coste de maná convertido»). La X cuenta como 0 fuera de la pila.',
    kind: 'number',
  },
  {
    key: 'type_line',
    label: 'Línea de tipo',
    help: 'Supertipos (Legendaria, Básica…), tipos (Criatura, Instantáneo…) y subtipos tras la raya, en inglés.',
  },
  {
    key: 'printed_type_line',
    label: 'Tipo impreso',
    help: 'La línea de tipo tal como está impresa en este idioma.',
  },
  {
    key: 'oracle_text',
    label: 'Texto Oracle',
    help: 'El texto de reglas oficial y actualizado (en inglés). Si difiere de lo impreso, manda este.',
    kind: 'multiline',
  },
  {
    key: 'printed_text',
    label: 'Texto impreso',
    help: 'El texto de reglas tal como está impreso en este idioma; puede estar desactualizado.',
    kind: 'multiline',
  },
  { key: 'power', label: 'Fuerza', help: 'Daño que hace la criatura en combate. «*» = se calcula según el texto.' },
  { key: 'toughness', label: 'Resistencia', help: 'Daño que aguanta la criatura en un turno antes de morir.' },
  { key: 'loyalty', label: 'Lealtad', help: 'Contadores de lealtad con los que entra el planeswalker.' },
  { key: 'defense', label: 'Defensa', help: 'Contadores de defensa con los que entra la batalla.' },
  { key: 'hand_modifier', label: 'Modificador de mano', help: 'Solo Vanguard: cambia tu tamaño máximo de mano.' },
  { key: 'life_modifier', label: 'Modificador de vidas', help: 'Solo Vanguard: cambia tus vidas iniciales.' },
  {
    key: 'colors',
    label: 'Colores',
    help: 'El color de la carta, según su coste (o su indicador de color).',
    kind: 'colors',
  },
  {
    key: 'color_indicator',
    label: 'Indicador de color',
    help: 'El punto de color que llevan algunas cartas sin coste, como la cara trasera de las transformables.',
    kind: 'colors',
  },
  {
    key: 'flavor_text',
    label: 'Texto de ambientación',
    help: 'Texto narrativo en cursiva: cuenta la historia, no tiene efecto en el juego.',
    kind: 'italic',
  },
  { key: 'artist', label: 'Ilustrador', help: 'Quién pintó la ilustración de esta impresión.' },
];

export const SECTIONS: SectionDef[] = [
  {
    title: 'Carta',
    icon: 'card-text-outline',
    fields: [
      ...RULES_FIELDS.filter((f) => f.key !== 'flavor_text' && f.key !== 'artist'),
      {
        key: 'color_identity',
        label: 'Identidad de color',
        help: 'Todos los colores de los símbolos de maná que aparecen en coste y texto. En Commander, el mazo solo puede llevar cartas dentro de la identidad del comandante.',
        kind: 'colors',
      },
      {
        key: 'keywords',
        label: 'Palabras clave',
        help: 'Habilidades y acciones con nombre propio que aparecen en la carta (Vuela, Arrollar, Explorar…).',
        kind: 'list',
      },
      {
        key: 'produced_mana',
        label: 'Maná que produce',
        help: 'Los colores de maná que esta carta puede generar (tierras, rocas de maná, criaturas de maná…).',
        kind: 'colors',
      },
      {
        key: 'layout',
        label: 'Diseño',
        help: 'Cómo está organizada la carta: normal, de dos caras, partida, aventura, saga…',
        values: LAYOUTS,
      },
    ],
  },
  {
    title: 'Precios',
    icon: 'tag-outline',
    fields: [
      {
        key: 'prices.eur',
        label: 'Cardmarket',
        help: 'Precio de tendencia en Cardmarket (Europa) de esta impresión, normal. Scryfall lo actualiza una vez al día.',
        kind: 'price-eur',
      },
      { key: 'prices.eur_foil', label: 'Cardmarket foil', help: 'Lo mismo, en versión foil.', kind: 'price-eur' },
      {
        key: 'prices.usd',
        label: 'TCGplayer',
        help: 'Precio de mercado en TCGplayer (Estados Unidos), en dólares.',
        kind: 'price-usd',
      },
      { key: 'prices.usd_foil', label: 'TCGplayer foil', help: 'Lo mismo, en versión foil.', kind: 'price-usd' },
      {
        key: 'prices.usd_etched',
        label: 'TCGplayer grabada',
        help: 'Lo mismo, en acabado grabado (etched).',
        kind: 'price-usd',
      },
      {
        key: 'prices.tix',
        label: 'Magic Online',
        help: 'Precio en tickets (tix) de Magic Online, según Cardhoarder.',
        kind: 'price-tix',
      },
    ],
  },
  {
    title: 'Popularidad y estatus',
    icon: 'star-outline',
    fields: [
      {
        key: 'edhrec_rank',
        label: 'Ranking EDHREC',
        help: 'Posición de popularidad en mazos de Commander según EDHREC: cuanto más bajo, más se juega (1 = la más jugada).',
        kind: 'number',
      },
      {
        key: 'penny_rank',
        label: 'Ranking Penny Dreadful',
        help: 'Popularidad en Penny Dreadful, un formato de Magic Online con cartas baratas.',
        kind: 'number',
      },
      {
        key: 'game_changer',
        label: 'Game Changer',
        help: 'Está en la lista oficial de cartas que cambian la partida en Commander. Cuentan para los brackets de poder: ninguna en los brackets 1-2, hasta 3 en el 3.',
        kind: 'bool',
      },
      {
        key: 'reserved',
        label: 'Lista Reservada',
        help: 'Wizards se comprometió a no reimprimirla nunca, así que su precio suele subir con el tiempo.',
        kind: 'bool',
      },
      {
        key: 'content_warning',
        label: 'Aviso de contenido',
        help: 'Wizards la retiró por contenido ofensivo (racismo, etc.); Scryfall la marca y no la muestra por defecto.',
        kind: 'bool',
      },
    ],
  },
  {
    title: 'Esta impresión',
    icon: 'book-open-variant',
    fields: [
      { key: 'set_name', label: 'Edición', help: 'La colección en la que se imprimió esta versión de la carta.' },
      {
        key: 'set',
        label: 'Código de edición',
        help: 'Las 3-5 letras de la edición, abajo a la izquierda de la carta (por ejemplo DMU).',
        kind: 'code',
      },
      { key: 'set_type', label: 'Tipo de edición', help: 'Qué clase de producto es la edición.', values: SET_TYPES },
      {
        key: 'collector_number',
        label: 'Número de coleccionista',
        help: 'Su número dentro de la edición, también abajo a la izquierda.',
      },
      {
        key: 'rarity',
        label: 'Rareza',
        help: 'Lo difícil que es que salga en un sobre. Se ve por el color del símbolo de la edición.',
        values: {
          common: 'Común',
          uncommon: 'Infrecuente',
          rare: 'Rara',
          mythic: 'Mítica',
          special: 'Especial',
          bonus: 'Bonus',
        },
      },
      { key: 'released_at', label: 'Fecha de salida', help: 'Cuándo salió a la venta esta impresión.', kind: 'date' },
      {
        key: 'lang',
        label: 'Idioma',
        help: 'Idioma en el que está impresa esta versión.',
        values: {
          en: 'Inglés',
          es: 'Español',
          fr: 'Francés',
          de: 'Alemán',
          it: 'Italiano',
          pt: 'Portugués',
          ja: 'Japonés',
          ko: 'Coreano',
          ru: 'Ruso',
          zhs: 'Chino simplificado',
          zht: 'Chino tradicional',
          he: 'Hebreo',
          la: 'Latín',
          grc: 'Griego antiguo',
          ar: 'Árabe',
          sa: 'Sánscrito',
          ph: 'Phyrexiano',
        },
      },
      { key: 'artist', label: 'Ilustrador', help: 'Quién pintó la ilustración de esta impresión.' },
      {
        key: 'flavor_name',
        label: 'Nombre alternativo',
        help: 'Nombre especial impreso en algunas cartas de colaboración (Godzilla, Universes Beyond…).',
      },
      {
        key: 'flavor_text',
        label: 'Texto de ambientación',
        help: 'Texto narrativo en cursiva: cuenta la historia, no tiene efecto en el juego.',
        kind: 'italic',
      },
      {
        key: 'watermark',
        label: 'Marca de agua',
        help: 'El símbolo dibujado detrás del texto (de un gremio, una facción…).',
      },
      {
        key: 'finishes',
        label: 'Acabados',
        help: 'En qué versiones se imprimió esta carta en esta edición.',
        kind: 'list',
        values: FINISHES,
      },
      { key: 'foil', label: 'Existe en foil', help: 'Hay versión brillante (foil) de esta impresión.', kind: 'bool' },
      { key: 'nonfoil', label: 'Existe normal', help: 'Hay versión normal (no foil) de esta impresión.', kind: 'bool' },
      { key: 'frame', label: 'Marco', help: 'La versión del diseño del marco de la carta.', values: FRAMES },
      {
        key: 'frame_effects',
        label: 'Efectos de marco',
        help: 'Variantes del marco: showcase, arte extendido, legendario, invertido, grabado…',
        kind: 'list',
      },
      { key: 'border_color', label: 'Borde', help: 'Color del borde de la carta.', values: BORDERS },
      {
        key: 'security_stamp',
        label: 'Sello de seguridad',
        help: 'El sello holográfico de abajo, que llevan las raras y míticas para evitar falsificaciones.',
        values: SECURITY_STAMPS,
      },
      { key: 'full_art', label: 'Arte completo', help: 'La ilustración ocupa toda la carta.', kind: 'bool' },
      { key: 'textless', label: 'Sin texto', help: 'Versión sin caja de texto (solo ilustración).', kind: 'bool' },
      {
        key: 'promo',
        label: 'Promocional',
        help: 'Es una carta promocional (de evento, preventa, caja…).',
        kind: 'bool',
      },
      {
        key: 'promo_types',
        label: 'Tipo de promo',
        help: 'Qué clase de promoción es (prerelease, buy-a-box, datestamped, surgefoil…).',
        kind: 'list',
      },
      { key: 'reprint', label: 'Reimpresión', help: 'La carta ya había salido antes en otra edición.', kind: 'bool' },
      {
        key: 'variation',
        label: 'Variante',
        help: 'Es una variación menor de otra impresión de la misma edición.',
        kind: 'bool',
      },
      { key: 'booster', label: 'Sale en sobres', help: 'Puede aparecer en sobres de su edición.', kind: 'bool' },
      {
        key: 'story_spotlight',
        label: 'Story Spotlight',
        help: 'Ilustra un momento clave de la historia de la edición.',
        kind: 'bool',
      },
      {
        key: 'oversized',
        label: 'Tamaño grande',
        help: 'Carta de tamaño mayor de lo normal (no apta para jugar).',
        kind: 'bool',
      },
      { key: 'digital', label: 'Solo digital', help: 'Solo existe en juegos digitales (Arena, MTGO).', kind: 'bool' },
      { key: 'games', label: 'Plataformas', help: 'Dónde existe esta impresión.', kind: 'list', values: GAMES },
      {
        key: 'preview.source',
        label: 'Avance publicado por',
        help: 'Quién enseñó la carta por primera vez antes de que saliera la edición.',
      },
      {
        key: 'preview.previewed_at',
        label: 'Fecha del avance',
        help: 'Cuándo se enseñó por primera vez.',
        kind: 'date',
      },
    ],
  },
  {
    title: 'Identificadores',
    icon: 'identifier',
    fields: [
      {
        key: 'id',
        label: 'ID de Scryfall',
        help: 'Identificador único de esta impresión concreta (edición + número + idioma).',
        kind: 'code',
      },
      {
        key: 'oracle_id',
        label: 'ID Oracle',
        help: 'Identificador de la carta como concepto: es el mismo en todas sus ediciones e idiomas.',
        kind: 'code',
      },
      {
        key: 'illustration_id',
        label: 'ID de ilustración',
        help: 'Es el mismo en todas las impresiones que comparten el mismo dibujo.',
        kind: 'code',
      },
      {
        key: 'multiverse_ids',
        label: 'Multiverse ID',
        help: 'Su número en Gatherer, la base de datos oficial de Wizards.',
        kind: 'list',
      },
      { key: 'cardmarket_id', label: 'ID de Cardmarket', help: 'Número de producto en Cardmarket.', kind: 'code' },
      { key: 'tcgplayer_id', label: 'ID de TCGplayer', help: 'Número de producto en TCGplayer.', kind: 'code' },
      {
        key: 'tcgplayer_etched_id',
        label: 'ID TCGplayer (grabada)',
        help: 'Número de producto de la versión grabada en TCGplayer.',
        kind: 'code',
      },
      { key: 'mtgo_id', label: 'ID de Magic Online', help: 'Identificador en Magic Online.', kind: 'code' },
      {
        key: 'mtgo_foil_id',
        label: 'ID MTGO foil',
        help: 'Identificador de la versión foil en Magic Online.',
        kind: 'code',
      },
      { key: 'arena_id', label: 'ID de Arena', help: 'Identificador en MTG Arena.', kind: 'code' },
      {
        key: 'card_back_id',
        label: 'ID del reverso',
        help: 'Qué reverso tiene la carta (el normal de Magic u otro especial).',
        kind: 'code',
      },
    ],
  },
];

/** Enlaces (`scryfall_uri`, `related_uris.*`, `purchase_uris.*`) con lo que encontrarás ahí. */
export const LINKS: Record<string, { label: string; help: string }> = {
  scryfall_uri: { label: 'Scryfall', help: 'La ficha de la carta en Scryfall.' },
  'related_uris.gatherer': { label: 'Gatherer', help: 'La base de datos oficial de Wizards.' },
  'related_uris.edhrec': { label: 'EDHREC', help: 'Con qué comandantes y cartas se juega en Commander.' },
  'related_uris.tcgplayer_infinite_articles': { label: 'Artículos', help: 'Artículos de TCGplayer que la mencionan.' },
  'related_uris.tcgplayer_infinite_decks': { label: 'Mazos', help: 'Mazos de TCGplayer que la usan.' },
  'purchase_uris.cardmarket': { label: 'Cardmarket', help: 'Comprarla en Cardmarket (Europa).' },
  'purchase_uris.tcgplayer': { label: 'TCGplayer', help: 'Comprarla en TCGplayer (EE. UU.).' },
  'purchase_uris.cardhoarder': { label: 'Cardhoarder', help: 'Comprarla para Magic Online.' },
};

/** Claves de nivel superior mostradas en otra parte de la pantalla, u omitidas a propósito (imágenes, URLs de la API). */
export const HANDLED_KEYS = new Set([
  ...SECTIONS.flatMap((s) => s.fields.map((f) => f.key.split('.')[0])),
  'legalities',
  'card_faces',
  'all_parts',
  'related_uris',
  'purchase_uris',
  'scryfall_uri',
  'artist_ids',
  // Imágenes en otros tamaños y su estado: omitidas.
  'image_uris',
  'image_status',
  'highres_image',
  'image_updated_at',
  // Fontanería de la API.
  'object',
  'uri',
  'set_id',
  'set_uri',
  'set_search_uri',
  'scryfall_set_uri',
  'prints_search_uri',
  'rulings_uri',
]);

export const COMPONENTS: Record<string, string> = {
  token: 'Ficha que crea',
  meld_part: 'Parte de fusión',
  meld_result: 'Resultado de fusión',
  combo_piece: 'Relacionada',
};
