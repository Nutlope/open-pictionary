import { useEffect, useState } from "react";
import { seatOf, type RacerKey } from "@/lib/racers";
import { randomName } from "@/lib/names";
import type { ReplayGuess } from "@/lib/replay";

/**
 * The player's own record, kept in this browser: an anonymous id and a
 * generated name for the daily board, their best time, their streak of
 * doodles that got guessed, the champions they backed, and their dailies.
 */
export type DailyRecord = {
  word: string;
  ms: number | null;
  k: RacerKey | null;
  /** Models that got it, in the order they did. */
  order: RacerKey[];
  called: boolean | null;
  log: ReplayGuess[];
  /** Packed strokes, thinned, so the finished doodle can be shown again. */
  strokes: number[][];
  entry?: string;
  rank?: number | null;
  of?: number;
};

export type Me = {
  v: 1;
  id: string;
  name: string;
  rounds: number;
  solved: number;
  streak: number;
  bestStreak: number;
  best: { ms: number; word: string; k: RacerKey } | null;
  picks: { made: number; hits: number; streak: number; best: number; by: Partial<Record<RacerKey, [made: number, hits: number]>> };
  daily: { streak: number; best: number; last: number | null; days: Record<string, DailyRecord> };
};

/** What one finished round changed, for the moment at the end of it. */
export type Outcome = {
  streak: number;
  /** The streak this round ended, when it ended one worth mentioning. */
  broke: number;
  newBest: boolean;
  firstWin: boolean;
  prevBest: number | null;
  /** null when no champion was picked. */
  called: boolean | null;
  callStreak: number;
};

const KEY = "dd:me:v1";
const EVENT = "dd:me";

function fresh(): Me {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 57]).join("");
  return {
    v: 1,
    id,
    name: randomName(),
    rounds: 0,
    solved: 0,
    streak: 0,
    bestStreak: 0,
    best: null,
    picks: { made: 0, hits: 0, streak: 0, best: 0, by: {} },
    daily: { streak: 0, best: 0, last: null, days: {} },
  };
}

let cache: Me | null = null;

/** Records saved before a seat changed models carry the old key; move them to the seat's current one. */
function reseat(m: Me): Me {
  const ks = (list: unknown[]) => list.map(seatOf).filter((k): k is RacerKey => k != null);
  if (m.best) {
    const k = seatOf(m.best.k);
    m.best = k ? { ...m.best, k } : null;
  }
  const by: Me["picks"]["by"] = {};
  for (const [old, v] of Object.entries(m.picks.by)) {
    const k = seatOf(old);
    if (k && v) by[k] = v;
  }
  m.picks.by = by;
  for (const day of Object.values(m.daily.days)) {
    day.k = seatOf(day.k);
    day.order = ks(day.order ?? []);
    day.log = (day.log ?? []).flatMap((e) => {
      const k = seatOf(e.k);
      return k ? [{ ...e, k }] : [];
    });
  }
  return m;
}

export function readMe(): Me {
  if (typeof window === "undefined") return fresh();
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Me | null;
    if (raw?.v === 1 && raw.id) {
      const base = fresh();
      cache = reseat({ ...base, ...raw, picks: { ...base.picks, ...raw.picks }, daily: { ...base.daily, ...raw.daily } });
      return cache;
    }
  } catch {}
  cache = fresh();
  write(cache);
  return cache;
}

function write(m: Me) {
  cache = m;
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function onMe(fn: () => void) {
  window.addEventListener(EVENT, fn);
  const storage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      fn();
    }
  };
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", storage);
  };
}

/** The record, live. null until mounted, so server and first client render agree. */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    const read = () => setMe({ ...readMe() });
    read();
    return onMe(read);
  }, []);
  return me;
}

export function recordOutcome(r: { word: string; ms: number | null; k: RacerKey | null; pick: RacerKey | null }): Outcome {
  const m = structuredClone(readMe());
  const prevBest = m.best?.ms ?? null;
  const solved = r.ms != null && r.k != null;
  m.rounds++;
  let broke = 0;
  if (solved) {
    m.solved++;
    m.streak++;
    m.bestStreak = Math.max(m.bestStreak, m.streak);
  } else {
    broke = m.streak >= 2 ? m.streak : 0;
    m.streak = 0;
  }
  const newBest = solved && prevBest != null && r.ms! < prevBest;
  const firstWin = solved && prevBest == null;
  if (solved && (prevBest == null || r.ms! < prevBest)) m.best = { ms: r.ms!, word: r.word, k: r.k! };

  let called: boolean | null = null;
  if (r.pick) {
    called = r.pick === r.k;
    m.picks.made++;
    const [made, hits] = m.picks.by[r.pick] ?? [0, 0];
    m.picks.by[r.pick] = [made + 1, hits + (called ? 1 : 0)];
    if (called) {
      m.picks.hits++;
      m.picks.streak++;
      m.picks.best = Math.max(m.picks.best, m.picks.streak);
    } else {
      m.picks.streak = 0;
    }
  }
  write(m);
  return { streak: m.streak, broke, newBest, firstWin, prevBest, called, callStreak: m.picks.streak };
}

/** File today's daily. The streak counts consecutive days played, solved or not. */
export function recordDaily(n: number, rec: DailyRecord): number {
  const m = structuredClone(readMe());
  if (m.daily.days[n]) return m.daily.streak;
  m.daily.streak = m.daily.last === n - 1 ? m.daily.streak + 1 : 1;
  m.daily.best = Math.max(m.daily.best, m.daily.streak);
  m.daily.last = n;
  m.daily.days[n] = rec;
  // Keep a month of dailies; older doodles are not worth the space.
  for (const d of Object.keys(m.daily.days)) if (Number(d) < n - 30) delete m.daily.days[d];
  write(m);
  return m.daily.streak;
}

export function updateDaily(n: number, patch: Partial<DailyRecord>) {
  const m = structuredClone(readMe());
  if (!m.daily.days[n]) return;
  m.daily.days[n] = { ...m.daily.days[n], ...patch };
  write(m);
}

/** The daily streak as it stands today: a missed day breaks it. */
export function liveDailyStreak(m: Me, today: number) {
  return m.daily.last != null && m.daily.last >= today - 1 ? m.daily.streak : 0;
}

/** Clear the record but keep the name, the id and the dailies already played. */
export function resetStats() {
  const m = readMe();
  const base = fresh();
  write({ ...base, id: m.id, name: m.name, daily: m.daily });
}

export function rerollName() {
  const m = structuredClone(readMe());
  m.name = randomName();
  write(m);
}
