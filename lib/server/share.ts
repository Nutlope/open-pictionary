import "server-only";
import { randomBytes } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { RACERS, isRacerKey } from "@/lib/racers";
import { thinStrokes } from "@/lib/doodle";
import type { Verdict } from "@/lib/judge";
import type { Replay, ReplayGuess } from "@/lib/replay";
import { tag, tagOk, type Round } from "./round";
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

export function cleanStrokes(raw: unknown): number[][] | null {
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

export function cleanLog(raw: unknown): ReplayGuess[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 80)
    .filter((e): e is ReplayGuess => !!e && isRacerKey(e.k) && typeof e.g === "string" && ["correct", "close", "wrong"].includes(e.v))
    .map((e) => ({ k: e.k, g: e.g.slice(0, 40), v: e.v, t: Math.max(0, Math.min(120_000, Math.round(Number(e.t) || 0))) }));
}

/** The round's judged guesses: the server's own log, or the client's when the server has none. */
export async function roundLog(roundId: string, clientLog?: unknown): Promise<ReplayGuess[]> {
  let log = (await store.list(`r:${roundId}:log`))
    .map((x) => {
      try {
        return JSON.parse(x) as ReplayGuess;
      } catch {
        return null;
      }
    })
    .filter((e): e is ReplayGuess => !!e && isRacerKey(e.k));
  if (log.length === 0) log = cleanLog(clientLog);
  return log.sort((a, b) => a.t - b.t);
}

/**
 * One share per round: sharing twice returns the same link.
 *
 * With Redis configured, a share is a short id pointing at a stored replay.
 * Without it (a fresh deploy, or local dev on a read-only disk), the replay
 * rides inside the link itself: compressed, and tagged so it cannot be edited.
 * The guess log comes from the server when it has one; otherwise the client's
 * own record of the round is used, which is fine for a replay (the global
 * board never reads from shares).
 */
export async function createShare(
  round: Round,
  rawStrokes: unknown,
  demo: boolean,
  clientLog?: unknown,
): Promise<Replay | { error: string }> {
  const existing = store.remote ? await store.getJSON<string>(`r:${round.id}:share`) : null;
  if (existing) {
    const doc = await store.getJSON<Replay>(`share:${existing}`);
    if (doc) return doc;
  }
  const strokes = cleanStrokes(rawStrokes);
  if (!strokes || strokes.length === 0) return { error: "Nothing to share yet." };

  const log = await roundLog(round.id, clientLog);

  const win = log.find((e) => e.v === "correct") ?? null;
  const lastInk = Math.max(0, ...strokes.map((s) => s[s.length - 1] ?? 0));
  const doc: Replay = {
    v: 1,
    id: "",
    word: round.word,
    strokes,
    log,
    winner: win?.k ?? null,
    winMs: win?.t ?? null,
    endMs: Math.max(win?.t ?? 0, lastInk, log.at(-1)?.t ?? 0) + 400,
    demo,
    at: Date.now(),
  };

  if (!store.remote) {
    doc.id = encodeInline(doc);
    return doc;
  }
  doc.id = newId();
  await store.setJSON(`share:${doc.id}`, doc, SHARE_TTL);
  await store.setJSON(`r:${round.id}:share`, doc.id, LOG_TTL);
  return doc;
}

export async function getShare(id: string): Promise<Replay | null> {
  if (id.startsWith("i") && id.includes(".")) return decodeInline(id);
  if (!/^[A-Za-z0-9]{6,12}$/.test(id)) return null;
  return store.getJSON<Replay>(`share:${id}`);
}

/* ------------------------------------------------------------------
   Inline replays. Points are thinned to keep the link a few KB, delta
   coded, and time is stored in 10ms steps; the replay looks the same.
   ------------------------------------------------------------------ */
const MAX_POINTS = 700;
const VERDICTS: Verdict[] = ["wrong", "close", "correct"];

function encodeInline(doc: Replay): string {
  const s = thinStrokes(doc.strokes, MAX_POINTS).map((flat) => {
    const out: number[] = [];
    let px = 0;
    let py = 0;
    let pt = 0;
    for (let i = 0; i < flat.length; i += 3) {
      const t = Math.round(flat[i + 2] / 10);
      out.push(flat[i] - px, flat[i + 1] - py, t - pt);
      px = flat[i];
      py = flat[i + 1];
      pt = t;
    }
    return out;
  });
  const l = doc.log.map((e) => [RACERS.findIndex((r) => r.key === e.k), e.g, VERDICTS.indexOf(e.v), Math.round(e.t / 10)]);
  const json = JSON.stringify({ w: doc.word, s, l, d: doc.demo ? 1 : 0, a: Math.round(doc.at / 1000) });
  const payload = deflateRawSync(Buffer.from(json), { level: 9 }).toString("base64url");
  return `i${payload}.${tag(payload)}`;
}

function decodeInline(id: string): Replay | null {
  const dot = id.lastIndexOf(".");
  const payload = id.slice(1, dot);
  if (payload.length > 12_000 || !tagOk(payload, id.slice(dot + 1))) return null;
  try {
    const p = JSON.parse(inflateRawSync(Buffer.from(payload, "base64url")).toString()) as {
      w: string;
      s: number[][];
      l: [number, string, number, number][];
      d: number;
      a: number;
    };
    const strokes = p.s.map((d) => {
      const out: number[] = [];
      let x = 0;
      let y = 0;
      let t = 0;
      for (let i = 0; i < d.length; i += 3) {
        x += d[i];
        y += d[i + 1];
        t += d[i + 2];
        out.push(x, y, t * 10);
      }
      return out;
    });
    const log: ReplayGuess[] = p.l
      .filter(([k, , v]) => RACERS[k] && VERDICTS[v])
      .map(([k, g, v, t]) => ({ k: RACERS[k].key, g, v: VERDICTS[v], t: t * 10 }));
    const win = log.find((e) => e.v === "correct") ?? null;
    const lastInk = Math.max(0, ...strokes.map((s) => s[s.length - 1] ?? 0));
    return {
      v: 1,
      id,
      word: p.w,
      strokes,
      log,
      winner: win?.k ?? null,
      winMs: win?.t ?? null,
      endMs: Math.max(win?.t ?? 0, lastInk, log.at(-1)?.t ?? 0) + 400,
      demo: p.d === 1,
      at: p.a * 1000,
    };
  } catch {
    return null;
  }
}
