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
}

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
