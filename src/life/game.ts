// Life counter state (pure functions, no React). Persisted as JSON in the SQLite `settings` table.

export interface Player {
  name: string;
  /** Index in PLAYER_COLORS. */
  color: number;
  life: number;
  poison: number;
  /** Commander damage received from each player, by player index (own index unused). */
  commander: number[];
  /** Photos shown when something happens to the player (PNG data URLs, background cut out). */
  photos?: Partial<Record<PhotoKind, string>>;
}

/** When a photo shows: taking damage, dealing (commander) damage, gaining life. */
export type PhotoKind = 'hurt' | 'attack' | 'heal';
export const PHOTO_KINDS: { key: PhotoKind; label: string; hint: string }[] = [
  { key: 'hurt', label: 'Recibe daño', hint: 'Al perder vidas, veneno o daño de comandante.' },
  { key: 'attack', label: 'Hace daño', hint: 'Al hacer daño de comandante a otro jugador.' },
  { key: 'heal', label: 'Sube vida', hint: 'Al ganar vidas.' },
];

export interface LifeGame {
  startingLife: number;
  players: Player[];
  /** What the panels show and which effects are on (kept from game to game). */
  settings?: Partial<LifeSettings>;
}

/** What each panel shows (Partida → Pantalla). */
export interface LifeShow {
  /** Player's name. */
  name: boolean;
  /** Running change above the number («−3»). */
  delta: boolean;
  /** − / ＋ marks on the sides. */
  steps: boolean;
  /** With 3+ players, the − / ＋ sides split in one button per player (who deals the damage). */
  sources: boolean;
  /** Commander damage of each opponent with − / ＋. */
  commander: boolean;
  /** Poison counter on the bottom button. */
  poison: boolean;
}

/** Effects (Partida → Efectos). */
export interface LifeEffects {
  /** Each player's photos when taking damage, dealing it or gaining life. */
  photos: boolean;
  /** The panel flashes red (damage) or green (life). */
  flash: boolean;
  /** The panel shakes when taking damage. */
  shake: boolean;
  /** Numbers that float up from the panel («−1», «+3»). */
  floating: boolean;
  /** At 5 life or less the number beats like a heart, with a red glow. */
  heartbeat: boolean;
  /** A big skull when a player is out. */
  skull: boolean;
  /** Confetti over the winner when only one is left. */
  confetti: boolean;
  /** Hit / heal sounds. */
  sound: boolean;
}

export interface LifeSettings {
  show: LifeShow;
  effects: LifeEffects;
}

export const DEFAULT_LIFE_SETTINGS: LifeSettings = {
  show: { name: true, delta: true, steps: true, sources: true, commander: true, poison: true },
  effects: { photos: false, flash: true, shake: false, floating: true, heartbeat: true, skull: true, confetti: true, sound: false },
};

export const SHOW_OPTIONS: { key: keyof LifeShow; label: string; hint: string }[] = [
  { key: 'name', label: 'Nombre', hint: 'El nombre del jugador encima de las vidas.' },
  { key: 'delta', label: 'Cambio acumulado', hint: '«−3» encima del número mientras cambias las vidas.' },
  { key: 'steps', label: 'Marcas − / ＋', hint: 'Los signos a los lados del recuadro.' },
  { key: 'sources', label: 'Quién hace el daño', hint: 'Con 3 o más jugadores, los lados − / ＋ se parten en un botón por jugador, con su color.' },
  { key: 'commander', label: 'Daño de comandante', hint: 'Una píldora por rival con − / ＋.' },
  { key: 'poison', label: 'Veneno', hint: 'El contador de veneno en el botón de abajo.' },
];

export const EFFECT_OPTIONS: { key: keyof LifeEffects; label: string; hint: string; icon: string }[] = [
  { key: 'photos', label: 'Fotos', hint: 'Cada jugador se hace tres fotos (recibe daño, hace daño, sube vida) que salen en su recuadro.', icon: 'mdiCameraOutline' },
  { key: 'flash', label: 'Destellos', hint: 'El recuadro se ilumina en rojo al perder vidas y en verde al ganarlas.', icon: 'mdiFlash' },
  { key: 'shake', label: 'Temblor', hint: 'El recuadro tiembla al recibir daño.', icon: 'mdiVibrate' },
  { key: 'floating', label: 'Números al vuelo', hint: '«−1», «+3»… salen flotando del recuadro.', icon: 'mdiNumeric' },
  { key: 'heartbeat', label: 'Latido', hint: 'Con 5 vidas o menos el número late como un corazón y el borde brilla en rojo.', icon: 'mdiHeartPulse' },
  { key: 'skull', label: 'Calavera', hint: 'Una calavera enorme cuando un jugador queda eliminado.', icon: 'mdiSkullOutline' },
  { key: 'confetti', label: 'Confeti', hint: 'Lluvia de confeti sobre el ganador cuando solo queda uno.', icon: 'mdiPartyPopper' },
  { key: 'sound', label: 'Sonidos', hint: 'Un golpe al recibir daño y un tintineo al ganar vidas.', icon: 'mdiVolumeHigh' },
];

/** The game's settings, with the defaults for anything not set. */
export function lifeSettings(game: LifeGame): LifeSettings {
  return {
    show: { ...DEFAULT_LIFE_SETTINGS.show, ...game.settings?.show },
    effects: {
      ...DEFAULT_LIFE_SETTINGS.effects,
      // Games saved with photos before effects existed keep showing them.
      photos: game.settings?.effects?.photos ?? game.players.some((p) => p.photos && Object.keys(p.photos).length > 0),
      ...game.settings?.effects,
    },
  };
}

export const setShow = (game: LifeGame, key: keyof LifeShow, on: boolean): LifeGame => {
  const s = lifeSettings(game);
  return { ...game, settings: { ...s, show: { ...s.show, [key]: on } } };
};
export const setEffect = (game: LifeGame, key: keyof LifeEffects, on: boolean): LifeGame => {
  const s = lifeSettings(game);
  return { ...game, settings: { ...s, effects: { ...s.effects, [key]: on } } };
};

export const SETTINGS_KEY = 'lifeCounter';
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const LIFE_OPTIONS = [20, 25, 30, 40];
export const POISON_LIMIT = 10;
export const COMMANDER_LIMIT = 21;

/** Panel backgrounds: dark enough for white numbers, distinct from each other. */
export const PLAYER_COLORS = ['#8e3b3b', '#2f5f93', '#2f7a4f', '#8a6d1f', '#6b4593', '#2c7b7b', '#93506f', '#5a5f6b'];

export function newPlayer(index: number, count: number, life: number): Player {
  return {
    name: `Jugador ${index + 1}`,
    color: index % PLAYER_COLORS.length,
    life,
    poison: 0,
    commander: Array(count).fill(0),
  };
}

export function newGame(count: number, startingLife: number, previous?: LifeGame): LifeGame {
  return {
    startingLife,
    settings: previous?.settings,
    players: Array.from({ length: count }, (_, i) => {
      const fresh = newPlayer(i, count, startingLife);
      // Keep names and colors when restarting or changing the number of players.
      const old = previous?.players[i];
      return old ? { ...fresh, name: old.name, color: old.color, photos: old.photos } : fresh;
    }),
  };
}

export const DEFAULT_GAME = newGame(2, 20);

/** Parses a stored game, or null if it doesn't look like one. */
export function parseGame(json: string | null): LifeGame | null {
  if (!json) return null;
  try {
    const g = JSON.parse(json) as LifeGame;
    if (!Array.isArray(g.players) || g.players.length < MIN_PLAYERS || typeof g.startingLife !== 'number') return null;
    return g;
  } catch {
    return null;
  }
}

const update = (game: LifeGame, index: number, change: (p: Player) => Player): LifeGame => ({
  ...game,
  players: game.players.map((p, i) => (i === index ? change(p) : p)),
});

export const changeLife = (game: LifeGame, index: number, delta: number) =>
  update(game, index, (p) => ({ ...p, life: p.life + delta }));

export const changePoison = (game: LifeGame, index: number, delta: number) =>
  update(game, index, (p) => ({ ...p, poison: Math.max(0, p.poison + delta) }));

/** Commander damage also takes life (as the rules say). */
export const changeCommander = (game: LifeGame, index: number, from: number, delta: number) =>
  update(game, index, (p) => {
    const current = p.commander[from] ?? 0;
    const next = Math.max(0, current + delta);
    const commander = [...p.commander];
    commander[from] = next;
    return { ...p, commander, life: p.life - (next - current) };
  });

export const renamePlayer = (game: LifeGame, index: number, name: string) =>
  update(game, index, (p) => ({ ...p, name }));

export const setPhoto = (game: LifeGame, index: number, kind: PhotoKind, url: string | null) =>
  update(game, index, (p) => {
    const photos = { ...(p.photos ?? {}) };
    if (url) photos[kind] = url;
    else delete photos[kind];
    return { ...p, photos };
  });

export const recolorPlayer = (game: LifeGame, index: number, color: number) =>
  update(game, index, (p) => ({ ...p, color }));

/** The winner when everyone else is out (null while two or more are still playing). */
export function winnerOf(game: LifeGame): number | null {
  const alive = game.players.map((p, i) => (lossReason(p) ? -1 : i)).filter((i) => i >= 0);
  return alive.length === 1 && game.players.length > 1 ? alive[0] : null;
}

/** Why the player is out, or null. */
export function lossReason(p: Player): string | null {
  if (p.life <= 0) return 'Sin vidas';
  if (p.poison >= POISON_LIMIT) return `${POISON_LIMIT} de veneno`;
  if (p.commander.some((d) => d >= COMMANDER_LIMIT)) return `${COMMANDER_LIMIT} de comandante`;
  return null;
}

/**
 * Rows of player indexes for the table layout. The top row faces the other way (rotated 180°),
 * as if the phone lay in the middle of the table.
 */
export function tableRows(count: number): number[][] {
  switch (count) {
    case 2:
      return [[0], [1]];
    case 3:
      return [[0], [1, 2]];
    case 4:
      return [
        [0, 1],
        [2, 3],
      ];
    case 5:
      return [
        [0, 1],
        [2, 3, 4],
      ];
    default:
      return [
        [0, 1, 2],
        [3, 4, 5],
      ];
  }
}
