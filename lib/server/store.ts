import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * A tiny key-value store with the five Redis verbs this app needs.
 *
 * Production: Upstash Redis over its REST API (works on Vercel KV too), opted
 * into by env presence. Local dev: an in-process map that persists its
 * long-lived keys to .data/store.json, so the global board survives restarts
 * with no Redis to install.
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

type Entry = { v: string | Record<string, string> | string[]; exp?: number };
const g = globalThis as unknown as { __ddStore?: Map<string, Entry>; __ddSaveTimer?: NodeJS.Timeout };
const FILE = path.join(process.cwd(), ".data", "store.json");

function mem(): Map<string, Entry> {
  if (!g.__ddStore) {
    g.__ddStore = new Map();
    try {
      const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, Entry>;
      for (const [k, e] of Object.entries(raw)) g.__ddStore.set(k, e);
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
      const keep: Record<string, Entry> = {};
      // Long-lived keys, plus shared rounds (they carry a TTL but must
      // survive a dev-server restart for their links to keep working).
      for (const [k, e] of mem()) if (!e.exp || k.startsWith("share:")) keep[k] = e;
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
    mem().set(key, { v: "1", exp: Date.now() + ttlSec * 1000 });
    return true;
  },

  /** Several HINCRBY / INCRBYFLOAT in one round trip. */
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
    const vals = ops.map((o) => {
      const e = live(o.key);
      if (o.field) {
        const h = (e?.v as Record<string, string>) ?? {};
        h[o.field] = String(Number(h[o.field] ?? 0) + o.by);
        mem().set(o.key, { v: h, exp: e?.exp ?? (o.ttlSec ? Date.now() + o.ttlSec * 1000 : undefined) });
        return Number(h[o.field]);
      }
      const n = Number((e?.v as string) ?? 0) + o.by;
      mem().set(o.key, { v: String(n), exp: e?.exp ?? (o.ttlSec ? Date.now() + o.ttlSec * 1000 : undefined) });
      return n;
    });
    persist();
    return vals;
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
    return keys.map((k) => ({ ...((live(k)?.v as Record<string, string>) ?? {}) }));
  },

  async setJSON(key: string, value: unknown, ttlSec: number): Promise<void> {
    const v = JSON.stringify(value);
    if (this.remote) {
      await redis([["SET", key, v, "EX", ttlSec]]);
      return;
    }
    mem().set(key, { v, exp: Date.now() + ttlSec * 1000 });
    persist();
  },

  async getJSON<T>(key: string): Promise<T | null> {
    let raw: unknown;
    if (this.remote) [raw] = await redis([["GET", key]]);
    else raw = live(key)?.v;
    if (typeof raw !== "string") return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async push(key: string, value: string, ttlSec: number): Promise<void> {
    if (this.remote) {
      await redis([
        ["RPUSH", key, value],
        ["EXPIRE", key, ttlSec],
      ]);
      return;
    }
    const e = live(key);
    const arr = Array.isArray(e?.v) ? e.v : [];
    arr.push(value);
    mem().set(key, { v: arr, exp: e?.exp ?? Date.now() + ttlSec * 1000 });
  },

  async list(key: string): Promise<string[]> {
    if (this.remote) {
      const [r] = await redis([["LRANGE", key, 0, -1]]);
      return (r as string[]) ?? [];
    }
    const v = live(key)?.v;
    return Array.isArray(v) ? [...v] : [];
  },

  async get(key: string): Promise<number> {
    if (this.remote) {
      const [r] = await redis([["GET", key]]);
      return Number(r ?? 0);
    }
    return Number((live(key)?.v as string) ?? 0);
  },
};
