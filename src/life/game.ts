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
  /** When the game started (ms), for its statistics. */
  startedAt?: number;
  /** Everything that happened, in order (for the statistics at the end). */
  log?: LifeEvent[];
}

/** One change during the game: life (−/+), commander damage or poison of `player`, caused by `from`. */
export interface LifeEvent {
  at: number;
  player: number;
  kind: 'life' | 'commander' | 'poison';
  delta: number;
  from?: number;
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

export function newGame(count: number, startingLife: number, previous?: LifeGame, at?: number): LifeGame {
  return {
    startingLife,
    settings: previous?.settings,
    startedAt: at,
    log: [],
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

/** Adds an event to the game's log (`at` = now, given by the caller). */
const logged = (game: LifeGame, e: LifeEvent | null): LifeGame =>
  e ? { ...game, startedAt: game.startedAt ?? e.at, log: [...(game.log ?? []), e] } : game;

/** Life ± `delta`; `from` = who caused it (damage). */
export const changeLife = (game: LifeGame, index: number, delta: number, from?: number, at = 0) =>
  logged(
    update(game, index, (p) => ({ ...p, life: p.life + delta })),
    at ? { at, player: index, kind: 'life', delta, from } : null,
  );

export const changePoison = (game: LifeGame, index: number, delta: number, at = 0) =>
  logged(
    update(game, index, (p) => ({ ...p, poison: Math.max(0, p.poison + delta) })),
    at && game.players[index].poison + delta >= 0 ? { at, player: index, kind: 'poison', delta } : null,
  );

/** Commander damage also takes life (as the rules say). */
export const changeCommander = (game: LifeGame, index: number, from: number, delta: number, at = 0) => {
  const current = game.players[index].commander[from] ?? 0;
  const real = Math.max(0, current + delta) - current;
  return logged(
    update(game, index, (p) => {
      const commander = [...p.commander];
      commander[from] = current + real;
      return { ...p, commander, life: p.life - real };
    }),
    at && real ? { at, player: index, kind: 'commander', delta: real, from } : null,
  );
};

/** One player's numbers in a game. */
export interface PlayerStats {
  /** Life lost (damage and commander damage). */
  damageTaken: number;
  /** Damage dealt to others (when it was known who dealt it). */
  damageDealt: number;
  commanderDealt: number;
  lifeGained: number;
  poison: number;
  lowest: number;
  highest: number;
  /** The biggest single hit received (taps a moment apart count as one). */
  biggestHit: number;
  /** Order of elimination (1 = first out), and who dealt the last damage. */
  outOrder?: number;
  outAt?: number;
  outBy?: number;
}

export interface GameStats {
  /** Milliseconds from the start to the last change. */
  duration: number;
  players: PlayerStats[];
  /** dealt[from][to]: damage `from` dealt to `to`. */
  dealt: number[][];
  winner: number | null;
  events: number;
}

/** The game's statistics, from its log (replayed from the starting life). */
export function gameStats(game: LifeGame): GameStats {
  const n = game.players.length;
  const log = game.log ?? [];
  const life = game.players.map(() => game.startingLife);
  const poison = game.players.map(() => 0);
  const commander = game.players.map(() => game.players.map(() => 0));
  const players: PlayerStats[] = game.players.map(() => ({
    damageTaken: 0,
    damageDealt: 0,
    commanderDealt: 0,
    lifeGained: 0,
    poison: 0,
    lowest: game.startingLife,
    highest: game.startingLife,
    biggestHit: 0,
  }));
  const dealt = game.players.map(() => game.players.map(() => 0));
  const lastHit: { at: number; amount: number; from?: number }[] = game.players.map(() => ({ at: 0, amount: 0 }));
  let outCount = 0;
  for (const e of log) {
    const s = players[e.player];
    const loss = e.kind === 'life' ? -e.delta : e.kind === 'commander' ? e.delta : 0;
    if (e.kind === 'life') life[e.player] += e.delta;
    if (e.kind === 'commander') {
      life[e.player] -= e.delta;
      commander[e.player][e.from ?? 0] += e.delta;
    }
    if (e.kind === 'poison') {
      poison[e.player] = Math.max(0, poison[e.player] + e.delta);
      if (e.delta > 0) s.poison += e.delta;
    }
    if (loss > 0) {
      s.damageTaken += loss;
      if (e.from !== undefined && e.from !== e.player) {
        players[e.from].damageDealt += loss;
        dealt[e.from][e.player] += loss;
        if (e.kind === 'commander') players[e.from].commanderDealt += loss;
      }
      // Taps less than 2.5 s apart (and from the same player) are one hit.
      const h = lastHit[e.player];
      const amount = e.at - h.at < 2500 && h.from === e.from ? h.amount + loss : loss;
      lastHit[e.player] = { at: e.at, amount, from: e.from };
      s.biggestHit = Math.max(s.biggestHit, amount);
    } else if (loss < 0) {
      s.lifeGained += -loss;
    }
    s.lowest = Math.min(s.lowest, life[e.player]);
    s.highest = Math.max(s.highest, life[e.player]);
    const out = life[e.player] <= 0 || poison[e.player] >= POISON_LIMIT || commander[e.player].some((d) => d >= COMMANDER_LIMIT);
    if (out && s.outOrder === undefined) {
      outCount += 1;
      s.outOrder = outCount;
      s.outAt = e.at;
      s.outBy = e.from ?? lastHit[e.player].from;
    } else if (!out && s.outOrder !== undefined) {
      // Brought back (a correction): not out any more.
      s.outOrder = undefined;
      s.outAt = undefined;
      s.outBy = undefined;
      outCount -= 1;
    }
  }
  const first = game.startedAt ?? log[0]?.at ?? 0;
  const last = log.length ? log[log.length - 1].at : first;
  void n;
  return { duration: Math.max(0, last - first), players, dealt, winner: winnerOf(game), events: log.length };
}

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
