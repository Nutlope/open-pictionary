import type { RacerKey } from "./racers";
import type { Verdict } from "./judge";

/**
 * A shared round: the drawing with its timing, and every guess the server
 * judged, so a link can replay the race exactly as it happened.
 *
 * strokes: one flat array per stroke, [x, y, t, x, y, t, ...], x and y in the
 * 0..1000 drawing space, t in ms from the first stroke.
 */
export type ReplayGuess = { k: RacerKey; g: string; v: Verdict; t: number };
export type Replay = {
  v: 1;
  id: string;
  word: string;
  strokes: number[][];
  log: ReplayGuess[];
  winner: RacerKey | null;
  winMs: number | null;
  endMs: number;
  demo: boolean;
  at: number;
};

export const fmtSec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
