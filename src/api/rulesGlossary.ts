// Searching the rules text in Spanish: Scryfall only searches the English (Oracle) text, so the
// Spanish words are turned into their English rules wording with this glossary of Magic terms.
// Rules text is formulaic, so a few hundred terms cover what people look for. Unknown words are
// kept as they are (names, English words); Spanish filler words are dropped.

/** Lowercase without accents. */
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Spanish phrases → English phrase (searched as an exact phrase). Longest first when matching. */
const PHRASES: [string, string][] = [
  ['campo de batalla', 'battlefield'],
  ['entra al campo de batalla', 'enters'],
  ['entra en el campo de batalla', 'enters'],
  ['entra en juego', 'enters'],
  ['criatura objetivo', 'target creature'],
  ['jugador objetivo', 'target player'],
  ['oponente objetivo', 'target opponent'],
  ['permanente objetivo', 'target permanent'],
  ['hechizo objetivo', 'target spell'],
  ['robas una carta', 'draw a card'],
  ['roba una carta', 'draw a card'],
  ['robar una carta', 'draw a card'],
  ['toque mortal', 'deathtouch'],
  ['vinculo vital', 'lifelink'],
  ['dañar primero', 'first strike'],
  ['danar primero', 'first strike'],
  ['golpe doble', 'double strike'],
  ['doble golpe', 'double strike'],
  ['contador +1/+1', '+1/+1 counter'],
  ['contadores +1/+1', '+1/+1 counter'],
  ['contador -1/-1', '-1/-1 counter'],
  ['contadores -1/-1', '-1/-1 counter'],
  ['parte superior', 'top'],
  ['fuera del juego', 'outside the game'],
  ['al comienzo', 'at the beginning'],
  ['paso de mantenimiento', 'upkeep'],
  ['fase de combate', 'combat'],
  ['paso final', 'end step'],
  ['cuesta menos', 'less'],
  ['cuestan menos', 'less'],
  ['coste de mana', 'mana value'],
  ['valor de mana', 'mana value'],
  ['cada oponente', 'each opponent'],
  ['tus oponentes', 'opponent'],
  ['no puede ser bloqueada', "can't be blocked"],
  ['no puede bloquear', "can't block"],
  ['ficha de criatura', 'creature token'],
  ['fichas de criatura', 'creature token'],
];

/** Spanish word starts → English word (prefix of the folded word, longest first). */
const STEMS: [string, string][] = [
  // Actions
  ['rob', 'draw'], ['destru', 'destroy'], ['exili', 'exile'], ['sacrific', 'sacrifice'], ['descart', 'discard'],
  ['contrarrest', 'counter'], ['busc', 'search'], ['baraj', 'shuffle'], ['revel', 'reveal'], ['enderez', 'untap'],
  ['gir', 'tap'], ['devuelv', 'return'], ['regres', 'return'], ['lanz', 'cast'], ['crea', 'create'],
  ['gan', 'gain'], ['pierd', 'lose'], ['perd', 'lose'], ['pag', 'pay'], ['agreg', 'add'], ['anad', 'add'],
  ['ataq', 'attack'], ['atac', 'attack'], ['bloque', 'block'], ['control', 'control'], ['muer', 'dies'],
  ['mor', 'dies'], ['copi', 'copy'], ['dobl', 'double'], ['previen', 'prevent'], ['preven', 'prevent'],
  ['mir', 'look'], ['eleg', 'choose'], ['elig', 'choose'], ['moline', 'mill'], ['muele', 'mill'],
  ['transform', 'transform'], ['equip', 'equip'], ['encant', 'enchant'], ['vincul', 'attach'],
  ['adjunt', 'attach'], ['intercambi', 'exchange'], ['proliferar', 'proliferate'], ['prolifer', 'proliferate'],
  ['investig', 'investigate'], ['explor', 'explore'], ['adivin', 'scry'], ['vigil', 'vigilance'],
  ['pon', 'put'],
  // Card types and zones
  ['criatur', 'creature'], ['tierr', 'land'], ['artefact', 'artifact'], ['encantamient', 'enchantment'],
  ['conjur', 'sorcery'], ['instantane', 'instant'], ['hechiz', 'spell'], ['cart', 'card'], ['man', 'hand'],
  ['bibliotec', 'library'], ['cementeri', 'graveyard'], ['exilio', 'exile'], ['fich', 'token'],
  ['permanent', 'permanent'], ['legendari', 'legendary'], ['basic', 'basic'], ['batall', 'battle'],
  ['comandant', 'commander'], ['planeswalker', 'planeswalker'], ['tribal', 'tribal'],
  // Things
  ['contador', 'counter'], ['dan', 'damage'], ['vid', 'life'], ['jugador', 'player'], ['oponent', 'opponent'],
  ['adversari', 'opponent'], ['objetiv', 'target'], ['coste', 'cost'], ['cost', 'cost'], ['cuest', 'cost'],
  ['menos', 'less'], ['fuerz', 'power'], ['resistenci', 'toughness'], ['turn', 'turn'], ['mantenimient', 'upkeep'],
  ['combat', 'combat'], ['propietari', 'owner'], ['incolor', 'colorless'], ['color', 'color'],
  ['habilidad', 'ability'], ['dispar', 'trigger'], ['adicional', 'additional'], ['total', 'total'],
  ['veneno', 'poison'], ['energ', 'energy'], ['tesor', 'treasure'], ['pist', 'clue'], ['comid', 'food'],
  ['mana', 'mana'], ['blanc', 'white'], ['azul', 'blue'], ['negr', 'black'], ['roj', 'red'], ['verd', 'green'],
  ['tamano', 'size'], ['maximo', 'maximum'], ['mitad', 'half'], ['emblem', 'emblem'],
  // Keywords
  ['vuel', 'flying'], ['volar', 'flying'], ['prisa', 'haste'], ['arroll', 'trample'], ['alcance', 'reach'],
  ['defensor', 'defender'], ['indestructible', 'indestructible'], ['antimalefici', 'hexproof'],
  ['amenaz', 'menace'], ['destell', 'flash'], ['proteccion', 'protection'], ['salvaguard', 'ward'],
  ['velo', 'shroud'], ['retrospectiv', 'flashback'], ['cambiaformas', 'changeling'], ['convoc', 'convoke'],
  ['persist', 'persist'], ['sobrecarg', 'overload'], ['ciclo', 'cycling'], ['cicl', 'cycling'],
  ['furtiv', 'ninjutsu'], ['estampid', 'rampage'], ['prowess', 'prowess'], ['destreza', 'prowess'],
  ['embestida', 'dash'], ['ola', 'cascade'], ['cascad', 'cascade'], ['legado', 'embalm'],
  // Creature types
  ['trasg', 'goblin'], ['elfo', 'elf'], ['elfa', 'elf'], ['zombi', 'zombie'], ['dragon', 'dragon'], ['angel', 'angel'],
  ['vampir', 'vampire'], ['human', 'human'], ['guerrer', 'warrior'], ['hechicer', 'wizard'], ['mago', 'wizard'],
  ['soldad', 'soldier'], ['espiritu', 'spirit'], ['demoni', 'demon'], ['besti', 'beast'], ['caballer', 'knight'],
  ['pirat', 'pirate'], ['dinosauri', 'dinosaur'], ['gato', 'cat'], ['triton', 'merfolk'], ['clerig', 'cleric'],
  ['chaman', 'shaman'], ['picar', 'rogue'], ['esqueleto', 'skeleton'], ['ardilla', 'squirrel'], ['ave', 'bird'],
  ['serpient', 'serpent'], ['hada', 'faerie'], ['gigant', 'giant'], ['enan', 'dwarf'], ['licantrop', 'werewolf'],
  ['lob', 'wolf'], ['sierp', 'snake'], ['insect', 'insect'], ['hongo', 'fungus'], ['saproling', 'saproling'],
  ['eldrazi', 'eldrazi'], ['constructo', 'construct'], ['golem', 'golem'], ['avatar', 'avatar'], ['dios', 'god'],
  // Numbers
  ['uno', 'one'], ['dos', 'two'], ['tres', 'three'], ['cuatro', 'four'], ['cinco', 'five'], ['seis', 'six'],
  ['siete', 'seven'], ['ocho', 'eight'], ['nueve', 'nine'], ['diez', 'ten'],
];
STEMS.sort((a, b) => b[0].length - a[0].length);
PHRASES.sort((a, b) => b[0].length - a[0].length);

/** Short stems only match the whole word or the usual endings (so «man» isn't «mantenimiento»). */
const SHORT = 4;
const ENDINGS = /^(a|as|o|os|e|es|en|an|ar|er|ir|ido|ada|ado|adas|ados|s)?$/;

/** Spanish filler words (dropped). */
const FILLER = new Set(
  'el la los las un una unos unas de del al a y o u e en con por para que se su sus tu tus te lo le les mi este esta estos estas ese esa eso cada otro otra otros otras todo toda todos todas cualquier cualquiera puede pueden si no ya mas como hasta entre sobre bajo sin pero tambien cuando mientras donde'.split(
    ' ',
  ),
);

/** The English rules words the glossary produces (and a few more): text made of these is English. */
const ENGLISH = new Set(
  [...STEMS.map(([, en]) => en), ...PHRASES.flatMap(([, en]) => en.split(' ')), ...'the of and or to you your each that this is it its with for from at on in into until gets get has have when whenever where may can cant do does dont another other any all target costs less more than up instead'.split(' ')]
    .map(fold),
);
const isEnglish = (w: string) => ENGLISH.has(w) || [...ENGLISH].some((e) => e.length >= 4 && w.startsWith(e) && /^(s|es|ed|d|ing|ion|ions|er|ers)?$/.test(w.slice(e.length)));
/** A word that tells the text is Spanish: accents, Spanish filler, or a glossary word that isn't English. */
const looksSpanish = (folded: string, original: string) =>
  /[áéíóúñü¿¡]/i.test(original) || (FILLER.has(folded) && !ENGLISH.has(folded)) || (!isEnglish(folded) && stemOf(folded) !== null);

function stemOf(word: string): string | null {
  for (const [s, en] of STEMS) {
    if (!word.startsWith(s)) continue;
    if (s.length <= SHORT && !ENDINGS.test(word.slice(s.length))) continue;
    return en;
  }
  return null;
}

export interface RulesQuery {
  /** What is searched (English): words, and phrases where a whole Spanish expression was known. */
  terms: string[];
  /** The text was taken as Spanish and translated. */
  translated: boolean;
}

/**
 * The rules-text search in English. Quoted text stays an exact phrase (translated when it's a known
 * Spanish expression); the rest goes word by word. English input comes back as it is.
 */
export function rulesQuery(text: string): RulesQuery {
  const raw = [...text.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => ({ quoted: m[1] !== undefined, t: (m[1] ?? m[2] ?? '').trim() })).filter((x) => x.t);
  const spanish = raw.some(({ t }) => t.split(/\s+/).some((w) => looksSpanish(fold(w).replace(/[^\p{L}\p{N}]/gu, ''), w)));
  if (!spanish) return { terms: raw.map((x) => x.t), translated: false };
  const out: string[] = [];
  const push = (t: string) => !out.includes(t) && out.push(t);
  for (const { t } of raw.filter((x) => x.quoted)) {
    const f = fold(t);
    const phrase = PHRASES.find(([es]) => es === f);
    push(phrase ? phrase[1] : f.split(/\s+/).map((w) => stemOf(w) ?? w).join(' ') || t);
  }
  // The rest: known expressions first, then word by word.
  let rest = ` ${fold(raw.filter((x) => !x.quoted).map((x) => x.t).join(' '))} `;
  for (const [es, en] of PHRASES) {
    if (rest.includes(` ${es} `)) {
      push(en);
      rest = rest.split(` ${es} `).join(' ');
    }
  }
  for (const w of rest.split(/\s+/)) {
    const word = w.replace(/[^\p{L}\p{N}+/{}-]/gu, '');
    if (!word || FILLER.has(word)) continue;
    push(stemOf(word) ?? word);
  }
  return { terms: out, translated: true };
}
