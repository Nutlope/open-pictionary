import "server-only";
import { randomBytes } from "node:crypto";
import { isRacerKey } from "@/lib/racers";
import type { Replay, ReplayGuess } from "@/lib/replay";
import type { Round } from "./round";
import { store } from "./store";

const LOG_TTL = 2 * 60 * 60;
const SHARE_TTL = 120 * 86400;

/** Every judged guess goes into the round's log; a share replays from it. */
export async function logGuess(roundId: string, e: ReplayGuess) {
  await store.push(`r:${roundId}:log`, JSON.stringify(e), LOG_TTL);
}

function newId() {
  const abc = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(8);
  return Array.from(b, (x) => abc[x % abc.length]).join("");
}

function cleanStrokes(raw: unknown): number[][] | null {
  if (!Array.isArray(raw) || raw.length > 400) return null;
  let total = 0;
  const out: number[][] = [];
  for (const s of raw) {
    if (!Array.isArray(s) || s.length % 3 !== 0) return null;
    total += s.length;
    if (total > 90_000) return null;
    const clean = s.map((n) => Math.max(0, Math.min(120_000, Math.round(Number(n) || 0))));
    if (clean.length) out.push(clean);
  }
  return out;
}

/** One share per round: sharing twice returns the same link. */
export async function createShare(round: Round, rawStrokes: unknown, demo: boolean): Promise<Replay | { error: string }> {
  const existing = await store.getJSON<string>(`r:${round.id}:share`);
  if (existing) {
    const doc = await store.getJSON<Replay>(`share:${existing}`);
    if (doc) return doc;
  }
  const strokes = cleanStrokes(rawStrokes);
  if (!strokes || strokes.length === 0) return { error: "Nothing to share yet." };

  const log = (await store.list(`r:${round.id}:log`))
    .map((x) => {
      try {
        return JSON.parse(x) as ReplayGuess;
      } catch {
        return null;
      }
    })
    .filter((e): e is ReplayGuess => !!e && isRacerKey(e.k))
    .sort((a, b) => a.t - b.t);

  const win = log.find((e) => e.v === "correct") ?? null;
  const lastInk = Math.max(0, ...strokes.map((s) => s[s.length - 1] ?? 0));
  const doc: Replay = {
    v: 1,
    id: newId(),
    word: round.word,
    strokes,
    log,
    winner: win?.k ?? null,
    winMs: win?.t ?? null,
    endMs: Math.max(win?.t ?? 0, lastInk, log.at(-1)?.t ?? 0) + 400,
    demo,
    at: Date.now(),
  };
  await store.setJSON(`share:${doc.id}`, doc, SHARE_TTL);
  await store.setJSON(`r:${round.id}:share`, doc.id, LOG_TTL);
  return doc;
}

export async function getShare(id: string): Promise<Replay | null> {
  if (!/^[A-Za-z0-9]{6,12}$/.test(id)) return null;
  return store.getJSON<Replay>(`share:${id}`);
}
