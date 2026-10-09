import { readRound } from "@/lib/server/round";
import { askRacer, houseKey, judge, type GuessHistory } from "@/lib/server/together";
import { houseAllowance, notePlayed, noteSolved, noteSpend } from "@/lib/server/stats";
import { logGuess } from "@/lib/server/share";
import { RACER_BY_KEY, isRacerKey, type RacerKey } from "@/lib/racers";
import { findWord, WORDS } from "@/lib/words";
import type { Verdict } from "@/lib/judge";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * One look by one model. Answers as NDJSON in two beats so the guess lands on
 * screen the instant the model replies, and the verdict follows when the
 * referee has ruled (instant for listed synonyms, ~0.5s when a model judges).
 *
 *   {"type":"guess","guess":"horse","latencyMs":812,"costUsd":0.0004,"mode":"live"}
 *   {"type":"verdict","verdict":"close","won":false}
 */
export type GuessEvent =
  | { type: "guess"; guess: string; latencyMs: number; costUsd: number; mode: "live" | "demo" }
  | { type: "verdict"; verdict: Verdict; won: boolean; costUsd: number }
  | { type: "error"; message: string; fatal: boolean };

type Body = {
  round?: unknown;
  racer?: unknown;
  image?: unknown;
  history?: unknown;
  elapsedMs?: unknown;
  apiKey?: unknown;
};

const IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

function line(e: GuessEvent) {
  return JSON.stringify(e) + "\n";
}

function errorResponse(message: string, status: number, fatal = true) {
  return new Response(line({ type: "error", message, fatal }), {
    status,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return errorResponse("Bad request.", 400);

  const round = readRound(body.round);
  if (!round) return errorResponse("This round expired. Start a new one.", 400);
  if (!isRacerKey(body.racer)) return errorResponse("Unknown model.", 400);
  if (typeof body.image !== "string" || body.image.length > 400_000 || !IMAGE_RE.test(body.image)) {
    return errorResponse("Bad sketch.", 400);
  }
  const racerKey: RacerKey = body.racer;
  const racer = RACER_BY_KEY[racerKey];
  const word = findWord(round.word) ?? { word: round.word, also: [] as string[] };
  const history: GuessHistory = Array.isArray(body.history)
    ? (body.history as GuessHistory)
        .filter((h) => h && typeof h.guess === "string" && ["wrong", "close", "correct"].includes(h.verdict))
        .slice(-14)
        .map((h) => ({ guess: h.guess.slice(0, 40), verdict: h.verdict }))
    : [];
  const elapsedMs = Math.max(0, Math.min(Number(body.elapsedMs) || 0, Date.now() - round.t));

  const userKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiKey = userKey || houseKey();
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();

  if (apiKey && !userKey) {
    const allow = await houseAllowance(ip).catch(() => ({ ok: true }) as const);
    if (!allow.ok) return errorResponse(allow.reason, 429);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (e: GuessEvent) => controller.enqueue(enc.encode(line(e)));
      try {
        if (!apiKey) {
          const d = await demoGuess(word.word, history, racerKey, send);
          await logGuess(round.id, { k: racerKey, g: d.guess, v: d.verdict, t: Math.round(elapsedMs + d.ms) }).catch(() => {});
          return;
        }

        const out = await askRacer({ racer, image: body.image as string, history, apiKey, signal: req.signal });
        send({ type: "guess", guess: out.guess, latencyMs: out.latencyMs, costUsd: out.costUsd, mode: "live" });

        const [{ verdict, costUsd: judgeCost }] = await Promise.all([
          judge(out.guess, word.word, word.also, apiKey),
          notePlayed(round.id, racerKey).catch(() => {}),
        ]);
        let won = false;
        if (verdict === "correct") {
          won = await noteSolved(round.id, racerKey, elapsedMs + out.latencyMs).catch(() => false);
        }
        send({ type: "verdict", verdict, won, costUsd: judgeCost });
        logGuess(round.id, { k: racerKey, g: out.guess, v: verdict, t: Math.round(elapsedMs + out.latencyMs) }).catch(() => {});
        if (!userKey) noteSpend(out.costUsd + judgeCost).catch(() => {});
      } catch (e) {
        if (req.signal.aborted) return;
        const msg = e instanceof Error ? e.message : String(e);
        const timedOut = /timeout|aborted/i.test(msg);
        const blank = /No guess/.test(msg);
        const authFail = /^40[13]/.test(msg);
        send({
          type: "error",
          message: timedOut ? "Took too long" : blank ? "No answer" : authFail ? "Together rejected the key." : "Model unavailable",
          fatal: authFail,
        });
        if (!timedOut && !blank) console.warn(`[guess] ${racer.id}: ${msg}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}

/* ------------------------------------------------------------------
   Keyless demo. No key anywhere, so no model runs: the lanes still race, with
   canned guesses that every surface labels as demo. Never presented as live.
   ------------------------------------------------------------------ */
const DEMO_PACE: Record<RacerKey, number> = {
  "kimi-k3": 900,
  "qwen3-7-plus": 1300,
  "glm-5-3-flash": 700,
  "minimax-m3": 1000,
  "deepseek-v4-1-flash": 700,
  "qwen3-5-9b": 800,
};

async function demoGuess(
  word: string,
  history: GuessHistory,
  racer: RacerKey,
  send: (e: GuessEvent) => void,
): Promise<{ guess: string; verdict: Verdict; ms: number }> {
  const ms = DEMO_PACE[racer] * (0.7 + Math.random() * 0.7);
  await new Promise((r) => setTimeout(r, ms));
  const tried = new Set(history.map((h) => h.guess));
  const hit = Math.random() < Math.min(0.8, 0.08 + history.length * 0.14);
  let guess = word;
  if (!hit) {
    const pool = WORDS.filter((w) => w.word !== word && !tried.has(w.word));
    guess = pool[Math.floor(Math.random() * pool.length)]?.word ?? "squiggle";
  }
  send({ type: "guess", guess, latencyMs: Math.round(ms), costUsd: 0, mode: "demo" });
  send({ type: "verdict", verdict: hit ? "correct" : "wrong", won: false, costUsd: 0 });
  return { guess, verdict: hit ? "correct" : "wrong", ms };
}
