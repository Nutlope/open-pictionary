import { RACERS, type RacerKey } from "@/lib/racers";
import type { ReplayGuess } from "@/lib/replay";
import type { Lane } from "./useRace";

/**
 * Rebuild the field at time t from a round's log: what each model had said
 * by then, and whether it was looking (its next guess is about to land).
 */
export function lanesAt(log: ReplayGuess[], t: number, winner: RacerKey | null, done: boolean): Lane[] {
  return RACERS.map((r) => {
    const mine = log.map((e, i) => ({ ...e, id: i + 1 })).filter((e) => e.k === r.key);
    const seen = mine.filter((e) => e.t <= t);
    const next = mine.find((e) => e.t > t);
    const solved = seen.find((e) => e.v === "correct");
    return {
      key: r.key,
      looking: !done && !solved && !!next && next.t - t < 1300,
      guesses: seen.map((e) => ({ id: e.id, text: e.g, verdict: e.v, at: e.t })),
      solvedAt: solved?.t ?? null,
      won: winner === r.key && !!solved,
      out: null,
      note: null,
      lastLatency: null,
      looks: seen.length,
    };
  });
}

/** Solvers rise to the top in the order they solved; the rest keep their places. */
export function standings(lanes: Lane[]): Lane[] {
  return [...lanes].sort((a, b) => (a.solvedAt ?? Infinity) - (b.solvedAt ?? Infinity));
}

/** Who got it, in order. */
export function solveOrder(lanes: Lane[]): RacerKey[] {
  return lanes
    .filter((l) => l.solvedAt != null)
    .sort((a, b) => a.solvedAt! - b.solvedAt!)
    .map((l) => l.key);
}
