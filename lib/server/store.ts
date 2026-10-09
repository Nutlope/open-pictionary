import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * A tiny key-value store with the handful of Redis verbs this app needs.
 *
 * Production: Upstash Redis over its REST API (works on Vercel KV too), opted
 * into by env presence. Local dev: an in-process map that persists its
 * longer-lived keys to .data/store.json, so boards survive restarts with no
 * Redis to install.
 */
type Cmd = (string | number)[];

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(cmds: Cmd[]): Promise<unknown[]> {
  const res = await fetch(`${REST_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  return out.map((o) => o.result);
}

/* ---------------- local fallback ---------------- */

type Value = string | string[] | { hash: Record<string, string> } | { zset: Record<string, number> };
type Entry = { v: Value; exp?: number };
const g = globalThis as unknown as { __ddStore?: Map<string, Entry>; __ddSaveTimer?: NodeJS.Timeout };
const FILE = path.join(process.cwd(), ".data", "store.json");

function mem(): Map<string, Entry> {
  if (!g.__ddStore) {
    g.__ddStore = new Map();
    try {
      const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, Entry>;
      for (const [k, e] of Object.entries(raw)) {
        // Files written before hashes were tagged stored them as plain objects.
        const v = e.v as unknown;
        if (v && typeof v === "object" && !Array.isArray(v) && !("hash" in v) && !("zset" in v)) {
          e.v = { hash: v as Record<string, string> };
        }
        g.__ddStore.set(k, e);
      }
    } catch {
      /* first run, or a read-only filesystem */
    }
  }
  return g.__ddStore;
}

function persist() {
  if (g.__ddSaveTimer) return;
  g.__ddSaveTimer = setTimeout(() => {
    g.__ddSaveTimer = undefined;
    try {
      // Anything with more than an hour to live: boards, shares, dailies.
      // Rate limits and per-round scratch keys stay in memory only.
      const keep: Record<string, Entry> = {};
      const soon = Date.now() + 3_600_000;
      for (const [k, e] of mem()) if (!e.exp || e.exp > soon) keep[k] = e;
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(keep));
    } catch {
      /* read-only filesystem: stay in memory */
    }
  }, 400);
}

function live(k: string): Entry | undefined {
  const e = mem().get(k);
  if (e?.exp && e.exp < Date.now()) {
    mem().delete(k);
    return undefined;
  }
  return e;
}

function put(k: string, v: Value, ttlSec?: number, keepExp = true) {
  const prev = live(k);
  const exp = keepExp && prev?.exp ? prev.exp : ttlSec ? Date.now() + ttlSec * 1000 : prev?.exp;
  mem().set(k, { v, exp });
  persist();
}

const hashOf = (k: string) => {
  const v = live(k)?.v;
  return v && typeof v === "object" && "hash" in v ? v.hash : {};
};
const zsetOf = (k: string) => {
  const v = live(k)?.v;
  return v && typeof v === "object" && "zset" in v ? v.zset : {};
};
const sortedZ = (k: string) =>
  Object.entries(zsetOf(k))
    .map(([member, score]) => ({ member, score }))
    .sort((a, b) => a.score - b.score || (a.member < b.member ? -1 : 1));

export type Scored = { member: string; score: number };

function pairs(flat: unknown): Scored[] {
  const arr = (flat as (string | number)[]) ?? [];
  const out: Scored[] = [];
  for (let i = 0; i < arr.length; i += 2) out.push({ member: String(arr[i]), score: Number(arr[i + 1]) });
  return out;
}

/* ---------------- the verbs ---------------- */

export const store = {
  remote: Boolean(REST_URL && REST_TOKEN),

  /** SET key 1 NX EX ttl. True if this call created it. */
  async claim(key: string, ttlSec: number): Promise<boolean> {
    if (this.remote) {
      const [r] = await redis([["SET", key, "1", "NX", "EX", ttlSec]]);
      return r === "OK";
    }
    if (live(key)) return false;
    put(key, "1", ttlSec, false);
    return true;
  },

  /** Several HINCRBYFLOAT / INCRBYFLOAT in one round trip. */
  async bump(ops: { key: string; field?: string; by: number; ttlSec?: number }[]): Promise<number[]> {
    if (ops.length === 0) return [];
    if (this.remote) {
      const cmds: Cmd[] = [];
      for (const o of ops) {
        cmds.push(o.field ? ["HINCRBYFLOAT", o.key, o.field, o.by] : ["INCRBYFLOAT", o.key, o.by]);
        if (o.ttlSec) cmds.push(["EXPIRE", o.key, o.ttlSec]);
      }
      const out = await redis(cmds);
      const vals: number[] = [];
      let i = 0;
      for (const o of ops) {
        vals.push(Number(out[i]));
        i += o.ttlSec ? 2 : 1;
      }
      return vals;
    }
    return ops.map((o) => {
      if (o.field) {
        const h = { ...hashOf(o.key) };
        h[o.field] = String(Number(h[o.field] ?? 0) + o.by);
        put(o.key, { hash: h }, o.ttlSec);
        return Number(h[o.field]);
      }
      const n = Number((live(o.key)?.v as string) ?? 0) + o.by;
      put(o.key, String(n), o.ttlSec);
      return n;
    });
  },

  async hgetallMany(keys: string[]): Promise<Record<string, string>[]> {
    if (this.remote) {
      const out = await redis(keys.map((k) => ["HGETALL", k]));
      return out.map((r) => {
        // Upstash returns HGETALL as a flat [field, value, ...] array.
        const arr = (r as string[]) ?? [];
        const o: Record<string, string> = {};
        for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
        return o;
      });
    }
    return keys.map((k) => ({ ...hashOf(k) }));
  },

  async setJSON(key: string, value: unknown, ttlSec: number): Promise<void> {
    const v = JSON.stringify(value);
    if (this.remote) {
      await redis([["SET", key, v, "EX", ttlSec]]);
      return;
    }
    put(key, v, ttlSec, false);
  },

  async getJSON<T>(key: string): Promise<T | null> {
    return (await this.getManyJSON<T>([key]))[0];
  },

  async getManyJSON<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    const raw: unknown[] = this.remote ? await redis([["MGET", ...keys]]).then((r) => (r[0] as unknown[]) ?? []) : keys.map((k) => live(k)?.v);
    return keys.map((_, i) => {
      const x = raw[i];
      if (typeof x !== "string") return null;
      try {
        return JSON.parse(x) as T;
      } catch {
        return null;
      }
    });
  },

  /** RPUSH, keeping only the newest `max` items when given. */
  async push(key: string, value: string, ttlSec: number, max?: number): Promise<void> {
    if (this.remote) {
      const cmds: Cmd[] = [["RPUSH", key, value], ["EXPIRE", key, ttlSec]];
      if (max) cmds.push(["LTRIM", key, -max, -1]);
      await redis(cmds);
      return;
    }
    const v = live(key)?.v;
    const arr = Array.isArray(v) ? [...v, value] : [value];
    put(key, max ? arr.slice(-max) : arr, ttlSec);
  },

  async list(key: string, last?: number): Promise<string[]> {
    if (this.remote) {
      const [r] = await redis([["LRANGE", key, last ? -last : 0, -1]]);
      return (r as string[]) ?? [];
    }
    const v = live(key)?.v;
    return Array.isArray(v) ? v.slice(last ? -last : 0) : [];
  },

  async llen(key: string): Promise<number> {
    if (this.remote) {
      const [r] = await redis([["LLEN", key]]);
      return Number(r ?? 0);
    }
    const v = live(key)?.v;
    return Array.isArray(v) ? v.length : 0;
  },

  async get(key: string): Promise<number> {
    return (await this.getMany([key]))[0];
  },

  async getMany(keys: string[]): Promise<number[]> {
    if (this.remote) {
      const [r] = await redis([["MGET", ...keys]]);
      return ((r as unknown[]) ?? []).map((x) => Number(x ?? 0));
    }
    return keys.map((k) => Number((live(k)?.v as string) ?? 0));
  },

  /* ---- sorted sets ---- */

  /** ZADD. With `lower`, an existing member only ever moves to a smaller score (a best time). */
  async zadd(key: string, score: number, member: string, opts: { ttlSec?: number; lower?: boolean } = {}): Promise<void> {
    if (this.remote) {
      // LT still adds a member that is missing; it only refuses to raise one.
      const cmds: Cmd[] = [opts.lower ? ["ZADD", key, "LT", score, member] : ["ZADD", key, score, member]];
      if (opts.ttlSec) cmds.push(["EXPIRE", key, opts.ttlSec]);
      await redis(cmds);
      return;
    }
    const z = { ...zsetOf(key) };
    if (!opts.lower || z[member] == null || score < z[member]) z[member] = score;
    put(key, { zset: z }, opts.ttlSec);
  },

  async zincr(key: string, member: string, by = 1, ttlSec?: number): Promise<void> {
    if (this.remote) {
      const cmds: Cmd[] = [["ZINCRBY", key, by, member]];
      if (ttlSec) cmds.push(["EXPIRE", key, ttlSec]);
      await redis(cmds);
      return;
    }
    const z = { ...zsetOf(key) };
    z[member] = (z[member] ?? 0) + by;
    put(key, { zset: z }, ttlSec);
  },

  /** Members by score, lowest first (or highest first with `rev`). */
  async zrange(key: string, start: number, stop: number, rev = false): Promise<Scored[]> {
    return (await this.zrangeMany([{ key, start, stop, rev }]))[0];
  },

  /** Several ZRANGEs in one round trip. */
  async zrangeMany(specs: { key: string; start: number; stop: number; rev?: boolean }[]): Promise<Scored[][]> {
    if (specs.length === 0) return [];
    if (this.remote) {
      const out = await redis(
        specs.map((q) => (q.rev ? ["ZRANGE", q.key, q.start, q.stop, "REV", "WITHSCORES"] : ["ZRANGE", q.key, q.start, q.stop, "WITHSCORES"])),
      );
      return out.map(pairs);
    }
    return specs.map((q) => {
      const all = sortedZ(q.key);
      if (q.rev) all.reverse();
      return all.slice(q.start, q.stop === -1 ? undefined : q.stop + 1);
    });
  },

  async zrank(key: string, member: string): Promise<number | null> {
    if (this.remote) {
      const [r] = await redis([["ZRANK", key, member]]);
      return r == null ? null : Number(r);
    }
    const i = sortedZ(key).findIndex((x) => x.member === member);
    return i < 0 ? null : i;
  },

  async zcard(key: string): Promise<number> {
    if (this.remote) {
      const [r] = await redis([["ZCARD", key]]);
      return Number(r ?? 0);
    }
    return Object.keys(zsetOf(key)).length;
  },

  /** Keep only the `keep` lowest scores (or highest, with `rev`). */
  async ztrim(key: string, keep: number, rev = false): Promise<void> {
    if (this.remote) {
      await redis([rev ? ["ZREMRANGEBYRANK", key, 0, -keep - 1] : ["ZREMRANGEBYRANK", key, keep, -1]]);
      return;
    }
    const all = sortedZ(key);
    const kept = rev ? all.slice(-keep) : all.slice(0, keep);
    if (kept.length === all.length) return;
    put(key, { zset: Object.fromEntries(kept.map((x) => [x.member, x.score])) });
  },
};
