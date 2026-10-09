import { RACERS, type RacerKey } from "@/lib/racers";

/**
 * This browser's own scoreboard. localStorage, so it is a convenience, not a
 * record: the global board on the server is the one that counts.
 */
export type SessionRow = { rounds: number; wins: number; solves: number; solveMs: number };
export type Session = { rounds: number; rows: Record<RacerKey, SessionRow> };

const KEY = "dd:session:v1";
const EVENT = "dd:session";

const empty = (): Session => ({
  rounds: 0,
  rows: Object.fromEntries(RACERS.map((r) => [r.key, { rounds: 0, wins: 0, solves: 0, solveMs: 0 }])) as Session["rows"],
});

export function readSession(): Session {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Session | null;
    if (!s) return empty();
    const base = empty();
    for (const r of RACERS) base.rows[r.key] = { ...base.rows[r.key], ...(s.rows?.[r.key] ?? {}) };
    base.rounds = s.rounds ?? 0;
    return base;
  } catch {
    return empty();
  }
}

function write(s: Session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function recordRound(played: RacerKey[], winner: RacerKey | null) {
  const s = readSession();
  s.rounds++;
  for (const k of played) s.rows[k].rounds++;
  if (winner) s.rows[winner].wins++;
  write(s);
}

export function recordSolve(key: RacerKey, ms: number) {
  const s = readSession();
  s.rows[key].solves++;
  s.rows[key].solveMs += ms;
  write(s);
}

export function resetSession() {
  write(empty());
}

export function onSession(fn: () => void) {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
