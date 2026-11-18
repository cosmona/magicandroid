// «Mano» (prototype): which cards of the active deck are in the hand, from the text a camera reads of the
// fanned hand (only the titles show). Pure: the screen takes the photos and reads their text.

export interface HandCandidate {
  oracleId: string;
  /** Name shown to the user (in the card's language). */
  label: string;
  /** Names to recognise (printed name and English name). */
  names: string[];
  /** Copies in the deck (no more can be in the hand). */
  copies: number;
}

/** «Ángel de Serra» → «angel de serra» (no accents, letters and spaces only). */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Edit distance (small strings). */
function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/**
 * How well a line of text read from the photo matches a card name (0 = no). In a fan each title is
 * partly covered by the next card, so the line may be just the start of the name (at least 5 letters);
 * a few misread letters are allowed (1 every 6).
 */
export function matchScore(line: string, name: string): number {
  if (line.length < 4) return 0;
  if (line === name) return 100;
  // The read text may carry noise after the name (part of the mana cost, the next card…).
  const head = line.slice(0, name.length);
  const prefix = name.slice(0, Math.min(name.length, line.length));
  const len = Math.min(head.length, prefix.length);
  if (len < 5 && len < name.length) return 0;
  const d = distance(head.slice(0, len), prefix.slice(0, len));
  if (d > Math.floor(len / 6)) return 0;
  // Longer matches win; the whole name, even more.
  return len * 2 - d * 3 + (len >= name.length ? 10 : 0);
}

/** The cards seen in one photo: how many of each (a title read twice = two copies). */
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
  /** Added or taken out by hand (a correction). */
  manual?: boolean;
}

export interface HandState {
  /** Copies of each card in the hand. */
  hand: Map<string, number>;
  /** Photos in a row where a card is seen more / fewer times than the hand has. */
  more: Map<string, number>;
  fewer: Map<string, number>;
  events: HandEvent[];
}

export const emptyHand = (): HandState => ({ hand: new Map(), more: new Map(), fewer: new Map(), events: [] });

/** A card enters the hand after this many photos in a row, and leaves after… */
export const FRAMES_IN = 2;
export const FRAMES_OUT = 3;

/** One more photo: updates the hand when a change is seen in enough photos in a row (fingers, moves). */
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

/** A correction by hand: one copy more / less. */
export function correctHand(state: HandState, oracleId: string, label: string, delta: 1 | -1, at: number): HandState {
  const hand = new Map(state.hand);
  const n = Math.max(0, (hand.get(oracleId) ?? 0) + delta);
  if (n) hand.set(oracleId, n);
  else hand.delete(oracleId);
  return { ...state, hand, events: [...state.events, { at, oracleId, label, kind: delta > 0 ? 'drawn' : 'out', manual: true }] };
}
