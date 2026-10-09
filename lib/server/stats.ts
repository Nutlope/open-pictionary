import "server-only";
import { RACERS, type RacerKey } from "@/lib/racers";
import { dailyNumber } from "@/lib/daily";
import { store } from "./store";
import { latestFunny, noteFunnyCandidate, type Cand } from "./funny";

/**
 * The global board and the live numbers around it. Written only by the guess
 * route, from server-judged verdicts on server-signed rounds, so a client
 * cannot post a result.
 *
 *   stats:<model>    hash: rounds, guesses, solves, wins, solveMs
 *   stats:rounds     rounds drawn, ever
 *   count:<day>      rounds drawn today (UTC)
 *   fast:<model>     zset word -> its fastest solve of that word
 *   wins:<model>     zset word -> wins on that word
 *   tics:<model>     zset wrong guess -> how often it says it
 */
const ROUND_TTL = 60 * 60;
const today = () => new Date().toISOString().slice(0, 10);

export async function notePlayed(roundId: string, racer: RacerKey) {
  // A round counts for the whole field the moment anyone answers in it: a
  // model too slow to answer before someone else won has lost that round,
  // and must not get a smaller denominator for it.
  const roundFirst = await store.claim(`r:${roundId}:counted`, ROUND_TTL);
  const ops: { key: string; field?: string; by: number; ttlSec?: number }[] = [{ key: `stats:${racer}`, field: "guesses", by: 1 }];
  if (roundFirst) {
    ops.push({ key: "stats:rounds", by: 1 }, { key: `count:${today()}`, by: 1, ttlSec: 3 * 86400 });
    for (const r of RACERS) ops.push({ key: `stats:${r.key}`, field: "rounds", by: 1 });
  }
  await store.bump(ops);
}

export type RoundWin = { k: RacerKey; ms: number };

/** Returns whether this solve was the round's first, i.e. the win. */
export async function noteSolved(roundId: string, racer: RacerKey, ms: number, word: string): Promise<boolean> {
  const solvedFirstTime = await store.claim(`r:${roundId}:s:${racer}`, ROUND_TTL);
  if (!solvedFirstTime) return false;
  const won = await store.claim(`r:${roundId}:winner`, ROUND_TTL);
  const ops = [
    { key: `stats:${racer}`, field: "solves", by: 1 },
    { key: `stats:${racer}`, field: "solveMs", by: ms },
  ];
  if (won) ops.push({ key: `stats:${racer}`, field: "wins", by: 1 });
  await Promise.all([
    store.bump(ops),
    store.zadd(`fast:${racer}`, Math.round(ms), word, { lower: true }),
    won ? store.zincr(`wins:${racer}`, word) : null,
    // The round's official result, for the daily board to read back.
    won ? store.setJSON(`r:${roundId}:win`, { k: racer, ms: Math.round(ms) } satisfies RoundWin, 2 * ROUND_TTL) : null,
  ]);
  return won;
}

export async function noteWrong(racer: RacerKey, guess: string, word: string) {
  await Promise.all([store.zincr(`tics:${racer}`, guess), noteFunnyCandidate({ k: racer, g: guess, w: word })]);
  // Keep the tally of habits from growing forever.
  if (Math.random() < 0.02) await store.ztrim(`tics:${racer}`, 400, true);
}

export function roundWin(roundId: string) {
  return store.getJSON<RoundWin>(`r:${roundId}:win`);
}

export type BoardRow = {
  key: RacerKey;
  rounds: number;
  guesses: number;
  solves: number;
  wins: number;
  avgSolveMs: number | null;
  /** Its fastest solve ever, and of which word. */
  fastest: { w: string; ms: number } | null;
  /** The words it wins most. */
  best: string[];
  /** The wrong guess it reaches for most. */
  tic: { g: string; n: number } | null;
  /** The referee's favorite of its recent wrong guesses. */
  funny: Cand | null;
};

export async function readBoard(): Promise<{ rounds: number; rows: BoardRow[] }> {
  const [hashes, rounds, ranges, funny] = await Promise.all([
    store.hgetallMany(RACERS.map((r) => `stats:${r.key}`)),
    store.get("stats:rounds"),
    store.zrangeMany(
      RACERS.flatMap((r) => [
        { key: `fast:${r.key}`, start: 0, stop: 0 },
        { key: `wins:${r.key}`, start: 0, stop: 2, rev: true },
        { key: `tics:${r.key}`, start: 0, stop: 0, rev: true },
      ]),
    ),
    latestFunny(),
  ]);
  const rows = RACERS.map((r, i) => {
    const h = hashes[i];
    const n = (k: string) => Math.round(Number(h[k] ?? 0));
    const solves = n("solves");
    const [fast, wins, tics] = ranges.slice(i * 3, i * 3 + 3);
    return {
      key: r.key,
      rounds: n("rounds"),
      guesses: n("guesses"),
      solves,
      wins: n("wins"),
      avgSolveMs: solves ? Math.round(Number(h.solveMs ?? 0) / solves) : null,
      fastest: fast[0] ? { w: fast[0].member, ms: fast[0].score } : null,
      best: wins.map((x) => x.member),
      tic: tics[0] && tics[0].score > 1 ? { g: tics[0].member, n: tics[0].score } : null,
      funny: funny?.by[r.key] ?? null,
    };
  });
  return { rounds: Math.round(rounds), rows };
}

/** The live numbers: rounds today and ever, and how many drew today's daily. */
export async function readPulse() {
  const d = dailyNumber();
  const [todayCount, total, players] = await store.getMany([`count:${today()}`, "stats:rounds", `daily:${d}:players`]);
  const funny = await latestFunny();
  return { today: Math.round(todayCount), total: Math.round(total), daily: { d, players: Math.round(players) }, wrong: funny?.top ?? null };
}

export type Pulse = Awaited<ReturnType<typeof readPulse>>;

/* ------------------------------------------------------------------
   Guard rails for the house key. A visitor's own key skips all of this.
   ------------------------------------------------------------------ */

/** Guesses per IP per hour on the house key. A full round is about 50. */
const IP_HOURLY = Number(process.env.FREE_GUESSES_PER_HOUR || 900);
/** Daily spend ceiling on the house key, in dollars. */
const DAILY_BUDGET = Number(process.env.DAILY_BUDGET_USD || 40);

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
