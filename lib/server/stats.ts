import "server-only";
import { RACERS, type RacerKey } from "@/lib/racers";
import { store } from "./store";

/**
 * The global board. Written only by the guess route, from server-judged
 * verdicts on server-signed rounds, so a client cannot post a result.
 *
 * Per model hash `stats:<key>`: rounds, guesses, solves, wins, solveMs (sum of
 * times to a correct guess). Rounds overall: `stats:rounds`.
 */
const ROUND_TTL = 60 * 60;

export async function notePlayed(roundId: string, racer: RacerKey) {
  // A round counts for the whole field the moment anyone answers in it: a
  // model too slow to answer before someone else won has lost that round,
  // and must not get a smaller denominator for it.
  const roundFirst = await store.claim(`r:${roundId}:counted`, ROUND_TTL);
  const ops: { key: string; field?: string; by: number }[] = [{ key: `stats:${racer}`, field: "guesses", by: 1 }];
  if (roundFirst) {
    ops.push({ key: "stats:rounds", by: 1 });
    for (const r of RACERS) ops.push({ key: `stats:${r.key}`, field: "rounds", by: 1 });
  }
  await store.bump(ops);
}

/** Returns whether this solve was the round's first, i.e. the win. */
export async function noteSolved(roundId: string, racer: RacerKey, ms: number): Promise<boolean> {
  const solvedFirstTime = await store.claim(`r:${roundId}:s:${racer}`, ROUND_TTL);
  if (!solvedFirstTime) return false;
  const won = await store.claim(`r:${roundId}:winner`, ROUND_TTL);
  const ops = [
    { key: `stats:${racer}`, field: "solves", by: 1 },
    { key: `stats:${racer}`, field: "solveMs", by: ms },
  ];
  if (won) ops.push({ key: `stats:${racer}`, field: "wins", by: 1 });
  await store.bump(ops);
  return won;
}

export type BoardRow = {
  key: RacerKey;
  rounds: number;
  guesses: number;
  solves: number;
  wins: number;
  avgSolveMs: number | null;
};

export async function readBoard(): Promise<{ rounds: number; rows: BoardRow[] }> {
  const [hashes, rounds] = await Promise.all([
    store.hgetallMany(RACERS.map((r) => `stats:${r.key}`)),
    store.get("stats:rounds"),
  ]);
  const rows = RACERS.map((r, i) => {
    const h = hashes[i];
    const n = (k: string) => Math.round(Number(h[k] ?? 0));
    const solves = n("solves");
    return {
      key: r.key,
      rounds: n("rounds"),
      guesses: n("guesses"),
      solves,
      wins: n("wins"),
      avgSolveMs: solves ? Math.round(Number(h.solveMs ?? 0) / solves) : null,
    };
  });
  return { rounds: Math.round(rounds), rows };
}

/* ------------------------------------------------------------------
   Guard rails for the house key. A visitor's own key skips all of this.
   ------------------------------------------------------------------ */

/** Guesses per IP per hour on the house key. A full round is about 50. */
const IP_HOURLY = Number(process.env.FREE_GUESSES_PER_HOUR || 900);
/** Daily spend ceiling on the house key, in dollars. */
const DAILY_BUDGET = Number(process.env.DAILY_BUDGET_USD || 40);

const today = () => new Date().toISOString().slice(0, 10);

export async function houseAllowance(ip: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const hour = Math.floor(Date.now() / 3_600_000);
  // Both reads in parallel: this sits in front of every model call.
  const [[count], spent] = await Promise.all([
    store.bump([{ key: `rl:${ip}:${hour}`, by: 1, ttlSec: 3700 }]),
    store.get(`spend:${today()}`),
  ]);
  if (count > IP_HOURLY) {
    return { ok: false, reason: "You have used this hour's free guesses. Add your Together key to keep racing." };
  }
  if (spent > DAILY_BUDGET) {
    return { ok: false, reason: "Free play is full for today. Add your Together key to keep racing." };
  }
  return { ok: true };
}

export async function noteSpend(usd: number) {
  if (usd > 0) await store.bump([{ key: `spend:${today()}`, by: usd, ttlSec: 2 * 86400 }]);
}
