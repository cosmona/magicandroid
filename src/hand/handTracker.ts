// «Mano» (prototipo): qué cartas del mazo activo están en la mano, a partir del texto que una cámara lee de
// la mano en abanico (solo se ven los títulos). Pura: la pantalla hace las fotos y lee su texto.

export interface HandCandidate {
  oracleId: string;
  /** Nombre mostrado al usuario (en el idioma de la carta). */
  label: string;
  /** Nombres a reconocer (nombre impreso y nombre en inglés). */
  names: string[];
  /** Copias en el mazo (no puede haber más en la mano). */
  copies: number;
}

/** «Ángel de Serra» → «angel de serra» (sin acentos, solo letras y espacios). */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Distancia de edición (cadenas pequeñas). */
function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/**
 * Cómo de bien cuadra una línea de texto leída de la foto con un nombre de carta (0 = no). En un abanico cada
 * título lo tapa en parte la siguiente carta, así que la línea puede ser solo el principio del nombre (al menos
 * 5 letras); se permiten unas pocas letras mal leídas (1 de cada 6).
 */
export function matchScore(line: string, name: string): number {
  if (line.length < 4) return 0;
  if (line === name) return 100;
  // El texto leído puede traer ruido tras el nombre (parte del coste de maná, la siguiente carta…).
  const head = line.slice(0, name.length);
  const prefix = name.slice(0, Math.min(name.length, line.length));
  const len = Math.min(head.length, prefix.length);
  if (len < 5 && len < name.length) return 0;
  const d = distance(head.slice(0, len), prefix.slice(0, len));
  if (d > Math.floor(len / 6)) return 0;
  // Las coincidencias más largas ganan; el nombre entero, aún más.
  return len * 2 - d * 3 + (len >= name.length ? 10 : 0);
}

/** Las cartas vistas en una foto: cuántas de cada (un título leído dos veces = dos copias). */
export function cardsInText(lines: string[], candidates: HandCandidate[]): Map<string, number> {
  const seen = new Map<string, number>();
  const prepared = candidates.map((c) => ({ c, names: c.names.map(normalize).filter((n) => n.length >= 3) }));
  for (const raw of lines.flatMap((b) => b.split('\n'))) {
    const line = normalize(raw);
    let best: { id: string; score: number } | null = null;
    for (const { c, names } of prepared) {
      for (const n of names) {
        const s = matchScore(line, n);
        if (s > 0 && (!best || s > best.score)) best = { id: c.oracleId, score: s };
      }
    }
    if (best) {
      const max = candidates.find((c) => c.oracleId === best.id)?.copies ?? 1;
      seen.set(best.id, Math.min(max, (seen.get(best.id) ?? 0) + 1));
    }
  }
  return seen;
}

export interface HandEvent {
  at: number;
  oracleId: string;
  label: string;
  kind: 'drawn' | 'out';
  /** Añadida o quitada a mano (una corrección). */
  manual?: boolean;
}

export interface HandState {
  /** Copias de cada carta en la mano. */
  hand: Map<string, number>;
  /** Fotos seguidas donde una carta se ve más / menos veces de las que tiene la mano. */
  more: Map<string, number>;
  fewer: Map<string, number>;
  events: HandEvent[];
}

export const emptyHand = (): HandState => ({ hand: new Map(), more: new Map(), fewer: new Map(), events: [] });

/** Una carta entra en la mano tras tantas fotos seguidas, y sale tras… */
export const FRAMES_IN = 2;
export const FRAMES_OUT = 3;

/** Una foto más: actualiza la mano cuando se ve un cambio en suficientes fotos seguidas (dedos, movimientos). */
export function updateHand(state: HandState, seen: Map<string, number>, candidates: HandCandidate[], at: number): HandState {
  const hand = new Map(state.hand);
  const more = new Map<string, number>();
  const fewer = new Map<string, number>();
  const events = [...state.events];
  const label = (id: string) => candidates.find((c) => c.oracleId === id)?.label ?? id;
  const ids = new Set([...hand.keys(), ...seen.keys()]);
  for (const id of ids) {
    const have = hand.get(id) ?? 0;
    const now = seen.get(id) ?? 0;
    if (now > have) {
      const streak = (state.more.get(id) ?? 0) + 1;
      if (streak >= FRAMES_IN) {
        for (let k = have; k < now; k++) events.push({ at, oracleId: id, label: label(id), kind: 'drawn' });
        hand.set(id, now);
      } else more.set(id, streak);
    } else if (now < have) {
      const streak = (state.fewer.get(id) ?? 0) + 1;
      if (streak >= FRAMES_OUT) {
        for (let k = now; k < have; k++) events.push({ at, oracleId: id, label: label(id), kind: 'out' });
        if (now) hand.set(id, now);
        else hand.delete(id);
      } else fewer.set(id, streak);
    }
  }
  return { hand, more, fewer, events };
}

/** Una corrección a mano: una copia más / menos. */
export function correctHand(state: HandState, oracleId: string, label: string, delta: 1 | -1, at: number): HandState {
  const hand = new Map(state.hand);
  const n = Math.max(0, (hand.get(oracleId) ?? 0) + delta);
  if (n) hand.set(oracleId, n);
  else hand.delete(oracleId);
  return { ...state, hand, events: [...state.events, { at, oracleId, label, kind: delta > 0 ? 'drawn' : 'out', manual: true }] };
}
