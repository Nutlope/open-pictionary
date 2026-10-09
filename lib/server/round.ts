import "server-only";
import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";

/**
 * A round is a signed ticket, not a database row. The server mints it with the
 * word inside, and every guess carries it back, so judging is server-side and
 * the scoreboard cannot be fed a word the server never dealt. Stateless, which
 * is what lets this run on any number of serverless instances.
 */
export type Round = { id: string; word: string; t: number; /** The daily number, for a daily round. */ d?: number };

function secret() {
  const s = process.env.ROUND_SECRET || process.env.TOGETHER_API_KEY || "doodle-derby-dev";
  return createHash("sha256").update(`round:${s}`).digest();
}

const b64 = (b: Buffer) => b.toString("base64url");

/** A short HMAC tag, for anything else the server hands out and must not be forged. */
export function tag(data: string, bytes = 9) {
  return b64(createHmac("sha256", secret()).update(`tag:${data}`).digest().subarray(0, bytes));
}

export function tagOk(data: string, t: string, bytes = 9) {
  const want = Buffer.from(tag(data, bytes));
  const got = Buffer.from(t);
  return want.length === got.length && timingSafeEqual(want, got);
}

export function mintRound(word: string, daily?: number): { token: string; round: Round } {
  const round: Round = { id: b64(randomBytes(9)), word, t: Date.now(), ...(daily ? { d: daily } : {}) };
  const body = b64(Buffer.from(JSON.stringify(round)));
  const sig = b64(createHmac("sha256", secret()).update(body).digest());
  return { token: `${body}.${sig}`, round };
}

/** Rounds live for 15 minutes. Long enough for a slow artist, short enough to not hoard. */
export function readRound(token: unknown): Round | null {
  if (typeof token !== "string" || token.length > 400) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", secret()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const r = JSON.parse(Buffer.from(body, "base64url").toString()) as Round;
    if (Date.now() - r.t > 15 * 60_000) return null;
    return r;
  } catch {
    return null;
  }
}
