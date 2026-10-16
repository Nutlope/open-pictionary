import "server-only";
import { createHash } from "node:crypto";
import { WORDS, type Word } from "@/lib/words";
import { RACERS, isRacerKey, type RacerKey } from "@/lib/racers";
import { dailyNumber } from "@/lib/daily";
import { isName, randomName } from "@/lib/names";
import { thinStrokes } from "@/lib/doodle";
import { store } from "./store";
import { roundWin } from "./stats";
import { cleanStrokes, roundLog } from "./share";
import type { Round } from "./round";

/**
 * The daily doodle. The word for day n comes from a fixed shuffle of every
 * easy and medium word, so it is the same on every server, needs no storage,
 * and does not repeat until the whole deck has come round.
 *
 * Board, per day:
 *   daily:<n>:players     how many finished it
 *   daily:<n>:board       zset entry id -> winning time, solved entries only
 *   daily:<n>:e:<id>      the entry: name, time, winner, solvers, a thinned doodle
 *   daily:<n>:p:<player>  the entry id a browser already posted
 */
const TTL = 40 * 86400;

let order: Word[] | null = null;
function schedule(): Word[] {
  if (order) return order;
  const pool = WORDS.filter((w) => w.level < 3);
  // Still the old name: changing the seed would reshuffle every daily word.
  const seed = createHash("sha256").update(`daily:${process.env.DAILY_SEED || "doodle-derby-v1"}`).digest();
  let a = seed.readUInt32LE(0);
  // mulberry32: small, fast, and identical on every server.
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...pool];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return (order = out);
}

export function dailyWord(n = dailyNumber()): Word {
  const s = schedule();
  return s[(((n - 1) % s.length) + s.length) % s.length];
}

export type DailyEntry = {
  id: string;
  name: string;
  ms: number | null;
  k: RacerKey | null;
  solvers: RacerKey[];
  /** [x, y, ...] per stroke, thinned for a thumbnail. */
  pts: number[][];
  at: number;
};

export type DailyBoard = { d: number; players: number; solved: number; top: DailyEntry[]; me: { rank: number | null } | null };

const newId = () => createHash("sha256").update(`${Math.random()}:${Date.now()}`).digest("base64url").slice(0, 10);

/** A round is open for posting on its own day, plus an hour of grace after midnight. */
function postable(round: Round): boolean {
  if (!round.d) return false;
  const today = dailyNumber();
  return round.d === today || (round.d === today - 1 && dailyNumber(Date.now() - 3_600_000) === round.d);
}

export async function postDaily(opts: {
  round: Round;
  player: unknown;
  name: unknown;
  strokes: unknown;
  log: unknown;
  ip: string;
}): Promise<{ id: string; rank: number | null; of: number; players: number } | { error: string }> {
  const { round, ip } = opts;
  if (!postable(round)) return { error: "That daily has closed. Today's is waiting." };
  const d = round.d!;
  const player = typeof opts.player === "string" && /^[A-Za-z0-9_-]{8,32}$/.test(opts.player) ? opts.player : null;
  if (!player) return { error: "Missing player." };

  const existing = await store.getJSON<string>(`daily:${d}:p:${player}`);
  if (existing) return rankOf(d, existing);
  if (!(await store.claim(`daily:${d}:lock:${player}`, 30))) return { error: "Already posting." };
  const [ipCount] = await store.bump([{ key: `daily:${d}:ip:${ip}`, by: 1, ttlSec: 2 * 86400 }]);
  if (ipCount > 8) return { error: "Too many daily posts from this network today." };

  // The server's own record of the round wins over anything the client says.
  // The win is written just before the verdict reaches the browser, so one
  // short retry covers a post that raced it.
  let win = await roundWin(round.id);
  if (!win) {
    await new Promise((r) => setTimeout(r, 400));
    win = await roundWin(round.id);
  }
  const log = await roundLog(round.id, opts.log);
  const first = log.find((e) => e.v === "correct");
  const solvers = RACERS.map((r) => r.key).filter((k) => log.some((e) => e.k === k && e.v === "correct"));
  const strokes = cleanStrokes(opts.strokes) ?? [];

  const entry: DailyEntry = {
    id: newId(),
    name: isName(opts.name) ? opts.name : randomName(),
    ms: win?.ms ?? first?.t ?? null,
    k: win?.k ?? (first && isRacerKey(first.k) ? first.k : null),
    solvers,
    pts: thinStrokes(strokes, 240, true),
    at: Date.now(),
  };
  await Promise.all([
    store.setJSON(`daily:${d}:e:${entry.id}`, entry, TTL),
    store.setJSON(`daily:${d}:p:${player}`, entry.id, TTL),
    store.bump([{ key: `daily:${d}:players`, by: 1, ttlSec: TTL }]),
    entry.ms != null ? store.zadd(`daily:${d}:board`, entry.ms, entry.id, { ttlSec: TTL }) : null,
  ]);
  return rankOf(d, entry.id);
}

async function rankOf(d: number, id: string) {
  const [rank, players] = await Promise.all([store.zrank(`daily:${d}:board`, id), store.get(`daily:${d}:players`)]);
  return { id, rank: rank == null ? null : rank + 1, of: Math.round(players), players: Math.round(players) };
}

export async function readDaily(d: number, me?: string | null): Promise<DailyBoard> {
  const key = `daily:${d}:board`;
  const [players, solved, top, rank] = await Promise.all([
    store.get(`daily:${d}:players`),
    store.zcard(key),
    store.zrange(key, 0, 11),
    me ? store.zrank(key, me) : Promise.resolve(null),
  ]);
  const entries = (await store.getManyJSON<DailyEntry>(top.map((x) => `daily:${d}:e:${x.member}`))).filter((e): e is DailyEntry => !!e);
  return { d, players: Math.round(players), solved, top: entries, me: me ? { rank: rank == null ? null : rank + 1 } : null };
}
