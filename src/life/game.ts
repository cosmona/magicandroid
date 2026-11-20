// Estado del contador de vidas (funciones puras, sin React). Persistido como JSON en la tabla `settings` de SQLite.

export interface Player {
  name: string;
  /** Índice en PLAYER_COLORS. */
  color: number;
  life: number;
  poison: number;
  /** Daño de comandante recibido de cada jugador, por índice de jugador (el índice propio no se usa). */
  commander: number[];
  /** Fotos que se muestran cuando le pasa algo al jugador (data URLs PNG, con el fondo recortado). */
  photos?: Partial<Record<PhotoKind, string>>;
}

/** Cuándo se muestra una foto: recibir daño, hacer daño (de comandante), ganar vida. */
export type PhotoKind = 'hurt' | 'attack' | 'heal';
export const PHOTO_KINDS: { key: PhotoKind; label: string; hint: string }[] = [
  { key: 'hurt', label: 'Recibe daño', hint: 'Al perder vidas, veneno o daño de comandante.' },
  { key: 'attack', label: 'Hace daño', hint: 'Al hacer daño de comandante a otro jugador.' },
  { key: 'heal', label: 'Sube vida', hint: 'Al ganar vidas.' },
];

export interface LifeGame {
  startingLife: number;
  players: Player[];
  /** Qué muestran los paneles y qué efectos están activos (se mantienen de partida en partida). */
  settings?: Partial<LifeSettings>;
  /** Cuándo empezó la partida (ms), para sus estadísticas. */
  startedAt?: number;
  /** Todo lo que pasó, en orden (para las estadísticas del final). */
  log?: LifeEvent[];
  /** El controlador de turnos: de quién es el turno, cuál y qué fase (cuando está activo). */
  turn?: TurnState;
}

/** Las fases y pasos de un turno de Magic, en orden. */
export const PHASES: { key: string; label: string; short: string; group: string; hint: string }[] = [
  { key: 'untap', label: 'Enderezar', short: 'Enderezar', group: 'Inicio', hint: 'Endereza tus permanentes. Nadie recibe prioridad.' },
  { key: 'upkeep', label: 'Mantenimiento', short: 'Mantenim.', group: 'Inicio', hint: 'Se disparan las habilidades «al comienzo de tu mantenimiento».' },
  { key: 'draw', label: 'Robar', short: 'Robar', group: 'Inicio', hint: 'Roba una carta (el primer jugador no roba en su primer turno).' },
  { key: 'main1', label: 'Fase principal 1', short: 'Principal 1', group: 'Principal 1', hint: 'Juega una tierra, criaturas, conjuros y lo que quieras.' },
  { key: 'combat', label: 'Inicio del combate', short: 'Inicio', group: 'Combate', hint: 'Último momento para actuar antes de atacar.' },
  { key: 'attackers', label: 'Declarar atacantes', short: 'Atacantes', group: 'Combate', hint: 'Elige qué criaturas atacan y a quién; se giran.' },
  { key: 'blockers', label: 'Declarar bloqueadores', short: 'Bloqueos', group: 'Combate', hint: 'Los defensores eligen cómo bloquear.' },
  { key: 'damage', label: 'Daño de combate', short: 'Daño', group: 'Combate', hint: 'Las criaturas hacen su daño (primero las de daña primero).' },
  { key: 'endCombat', label: 'Final del combate', short: 'Final', group: 'Combate', hint: 'Se disparan las habilidades «al final del combate».' },
  { key: 'main2', label: 'Fase principal 2', short: 'Principal 2', group: 'Principal 2', hint: 'Otra fase principal: tierra (si no la jugaste), hechizos…' },
  { key: 'end', label: 'Paso final', short: 'Final', group: 'Final', hint: 'Se disparan las habilidades «al comienzo del paso final».' },
  { key: 'cleanup', label: 'Limpieza', short: 'Limpieza', group: 'Final', hint: 'Descarta hasta 7 cartas; se quita el daño de las criaturas.' },
];
/** Los grupos de fases, en orden (Inicio, Principal 1, Combate, Principal 2, Final). */
export const PHASE_GROUPS = [...new Set(PHASES.map((p) => p.group))];

export interface TurnState {
  /** De quién es el turno. */
  player: number;
  /** Número de turno (1, 2, 3… uno por turno de cada jugador). */
  number: number;
  /** Índice en PHASES. */
  phase: number;
  /** Cuándo empezó este turno (ms). */
  startedAt: number;
  /** Turnos ya jugados: quién y cuánto duró (para las estadísticas). */
  history: { player: number; ms: number }[];
}

/** Empieza los turnos con `player` (turno 1, paso de enderezar). */
export const startTurns = (game: LifeGame, player: number, at: number): LifeGame => ({
  ...game,
  turn: { player, number: 1, phase: 0, startedAt: at, history: [] },
});
export const stopTurns = (game: LifeGame): LifeGame => ({ ...game, turn: undefined });

/** El siguiente jugador que sigue en la partida después de `from`. */
function nextAlive(game: LifeGame, from: number): number {
  const n = game.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (!lossReason(game.players[i])) return i;
  }
  return (from + 1) % n;
}

/** Termina el turno: el siguiente jugador (que sigue en la partida) empieza en «Enderezar». */
export function nextTurn(game: LifeGame, at: number): LifeGame {
  const t = game.turn;
  if (!t) return game;
  return {
    ...game,
    turn: {
      player: nextAlive(game, t.player),
      number: t.number + 1,
      phase: 0,
      startedAt: at,
      history: [...t.history, { player: t.player, ms: Math.max(0, at - t.startedAt) }],
    },
  };
}

/** Siguiente fase / paso (después de «Limpieza», el turno del siguiente jugador). */
export function nextPhase(game: LifeGame, at: number): LifeGame {
  const t = game.turn;
  if (!t) return game;
  return t.phase >= PHASES.length - 1 ? nextTurn(game, at) : { ...game, turn: { ...t, phase: t.phase + 1 } };
}

/** Retrocede una fase (sin entrar en el turno anterior). */
export const prevPhase = (game: LifeGame): LifeGame =>
  game.turn && game.turn.phase > 0 ? { ...game, turn: { ...game.turn, phase: game.turn.phase - 1 } } : game;

/** Directo a una fase del turno actual. */
export const goToPhase = (game: LifeGame, phase: number): LifeGame =>
  game.turn ? { ...game, turn: { ...game.turn, phase: Math.max(0, Math.min(PHASES.length - 1, phase)) } } : game;

/** Un cambio durante la partida: vida (−/+), daño de comandante o veneno de `player`, causado por `from`. */
export interface LifeEvent {
  at: number;
  player: number;
  kind: 'life' | 'commander' | 'poison';
  delta: number;
  from?: number;
}

/** Qué muestra cada panel (Partida → Pantalla). */
export interface LifeShow {
  /** Nombre del jugador. */
  name: boolean;
  /** Cambio acumulado sobre el número («−3»). */
  delta: boolean;
  /** Marcas − / ＋ en los lados. */
  steps: boolean;
  /** Con 3+ jugadores, los lados − / ＋ se dividen en un botón por jugador (quién hace el daño). */
  sources: boolean;
  /** Daño de comandante de cada rival con − / ＋. */
  commander: boolean;
  /** Contador de veneno en el botón inferior. */
  poison: boolean;
  /** El controlador de turnos (de quién es el turno y las fases de Magic). */
  turns: boolean;
}

/** Efectos (Partida → Efectos). */
export interface LifeEffects {
  /** Las fotos de cada jugador al recibir daño, hacerlo o ganar vida. */
  photos: boolean;
  /** El panel parpadea en rojo (daño) o verde (vida). */
  flash: boolean;
  /** El panel tiembla al recibir daño. */
  shake: boolean;
  /** Números que flotan hacia arriba desde el panel («−1», «+3»). */
  floating: boolean;
  /** A 5 vidas o menos el número late como un corazón, con un brillo rojo. */
  heartbeat: boolean;
  /** Una calavera grande cuando un jugador queda eliminado. */
  skull: boolean;
  /** Confeti sobre el ganador cuando solo queda uno. */
  confetti: boolean;
  /** Sonidos de golpe / curación. */
  sound: boolean;
}

export interface LifeSettings {
  show: LifeShow;
  effects: LifeEffects;
}

export const DEFAULT_LIFE_SETTINGS: LifeSettings = {
  show: { name: true, delta: true, steps: true, sources: true, commander: true, poison: true, turns: false },
  effects: { photos: false, flash: true, shake: false, floating: true, heartbeat: true, skull: true, confetti: true, sound: false },
};

export const SHOW_OPTIONS: { key: keyof LifeShow; label: string; hint: string }[] = [
  { key: 'name', label: 'Nombre', hint: 'El nombre del jugador encima de las vidas.' },
  { key: 'delta', label: 'Cambio acumulado', hint: '«−3» encima del número mientras cambias las vidas.' },
  { key: 'steps', label: 'Marcas − / ＋', hint: 'Los signos a los lados del recuadro.' },
  { key: 'sources', label: 'Quién hace el daño', hint: 'Con 3 o más jugadores, los lados − / ＋ se parten en un botón por jugador, con su color.' },
  { key: 'commander', label: 'Daño de comandante', hint: 'Una píldora por rival con − / ＋.' },
  { key: 'poison', label: 'Veneno', hint: 'El contador de veneno en el botón de abajo.' },
  { key: 'turns', label: 'Turnos y fases', hint: 'De quién es el turno, el número de turno y las fases de Magic (enderezar, mantenimiento, robar, principal, combate…), con su tiempo.' },
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

/** Los ajustes de la partida, con los valores por defecto para lo que no esté puesto. */
export function lifeSettings(game: LifeGame): LifeSettings {
  return {
    show: { ...DEFAULT_LIFE_SETTINGS.show, ...game.settings?.show },
    effects: {
      ...DEFAULT_LIFE_SETTINGS.effects,
      // Las partidas guardadas con fotos antes de que existieran los efectos las siguen mostrando.
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

/** Fondos de los paneles: lo bastante oscuros para números blancos, distintos entre sí. */
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
      // Mantener nombres y colores al reiniciar o cambiar el número de jugadores.
      const old = previous?.players[i];
      return old ? { ...fresh, name: old.name, color: old.color, photos: old.photos } : fresh;
    }),
  };
}

export const DEFAULT_GAME = newGame(2, 20);

/** Parsea una partida guardada, o null si no parece una. */
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

/** Añade un evento al registro de la partida (`at` = ahora, lo da quien llama). */
const logged = (game: LifeGame, e: LifeEvent | null): LifeGame =>
  e ? { ...game, startedAt: game.startedAt ?? e.at, log: [...(game.log ?? []), e] } : game;

/** Vida ± `delta`; `from` = quién lo causó (daño). */
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

/** El daño de comandante también quita vida (como dicen las reglas). */
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

/** Los números de un jugador en una partida. */
export interface PlayerStats {
  /** Vida perdida (daño y daño de comandante). */
  damageTaken: number;
  /** Daño hecho a otros (cuando se supo quién lo hizo). */
  damageDealt: number;
  commanderDealt: number;
  lifeGained: number;
  poison: number;
  lowest: number;
  highest: number;
  /** El mayor golpe único recibido (toques con un instante de diferencia cuentan como uno). */
  biggestHit: number;
  /** Turnos jugados y su duración media (ms), con el controlador de turnos. */
  turns: number;
  avgTurn: number;
  /** Orden de eliminación (1 = el primero en caer), y quién hizo el último daño. */
  outOrder?: number;
  outAt?: number;
  outBy?: number;
}

export interface GameStats {
  /** Milisegundos desde el inicio hasta el último cambio. */
  duration: number;
  players: PlayerStats[];
  /** dealt[from][to]: daño que `from` hizo a `to`. */
  dealt: number[][];
  winner: number | null;
  events: number;
  /** Turnos jugados (con el controlador de turnos). */
  turns: number;
}

/** Las estadísticas de la partida, de su registro (reproducidas desde la vida inicial). */
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
    turns: 0,
    avgTurn: 0,
  }));
  for (const h of game.turn?.history ?? []) {
    const s = players[h.player];
    if (!s) continue;
    s.avgTurn = (s.avgTurn * s.turns + h.ms) / (s.turns + 1);
    s.turns += 1;
  }
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
      // Toques con menos de 2,5 s de diferencia (y del mismo jugador) son un solo golpe.
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
      // Recuperado (una corrección): ya no está eliminado.
      s.outOrder = undefined;
      s.outAt = undefined;
      s.outBy = undefined;
      outCount -= 1;
    }
  }
  const first = game.startedAt ?? log[0]?.at ?? 0;
  const last = log.length ? log[log.length - 1].at : first;
  void n;
  return { duration: Math.max(0, last - first), players, dealt, winner: winnerOf(game), events: log.length, turns: game.turn?.history.length ?? 0 };
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

/** El ganador cuando todos los demás están eliminados (null mientras siguen jugando dos o más). */
export function winnerOf(game: LifeGame): number | null {
  const alive = game.players.map((p, i) => (lossReason(p) ? -1 : i)).filter((i) => i >= 0);
  return alive.length === 1 && game.players.length > 1 ? alive[0] : null;
}

/** Por qué está eliminado el jugador, o null. */
export function lossReason(p: Player): string | null {
  if (p.life <= 0) return 'Sin vidas';
  if (p.poison >= POISON_LIMIT) return `${POISON_LIMIT} de veneno`;
  if (p.commander.some((d) => d >= COMMANDER_LIMIT)) return `${COMMANDER_LIMIT} de comandante`;
  return null;
}

/**
 * Filas de índices de jugador para la disposición en mesa. La fila de arriba mira al revés (girada 180°),
 * como si el móvil estuviera en el centro de la mesa.
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
