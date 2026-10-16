import "server-only";
import { RULES, costFor, type Racer } from "@/lib/racers";
import { cleanGuess, quickJudge, type Verdict } from "@/lib/judge";

/**
 * The Together client, raw fetch over the OpenAI-compatible SSE wire. Calls
 * stream by default: some Qwen endpoints refuse anything else, and streaming
 * lets us stop reading the moment the guess line is complete. A racer whose
 * stream is broken (see Racer.stream) gets one plain request instead.
 */
const CHAT_URL = "https://api.together.xyz/v1/chat/completions";
const UA = "DoodleDerby/1.0";

export function houseKey() {
  return process.env.TOGETHER_API_KEY?.trim() || "";
}

function errorText(status: number, body: string) {
  try {
    const j = JSON.parse(body) as { error?: { message?: string } };
    if (j?.error?.message) return `${status}: ${j.error.message}`;
  } catch {}
  return `${status}: ${body.slice(0, 160)}`;
}

type StreamResult = { content: string; promptTokens: number; completionTokens: number };

export async function streamChat(
  apiKey: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  /** Return true to stop reading early (the answer is already complete). */
  enough?: (content: string) => boolean,
): Promise<StreamResult> {
  const res = await fetch(CHAT_URL, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "User-Agent": UA },
    body: JSON.stringify({ ...body, stream: true, stream_options: { include_usage: true } }),
  });
  if (!res.ok || !res.body) throw new Error(errorText(res.status, await res.text().catch(() => "")));

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let content = "";
  let pt = 0;
  let ct = 0;
  let reasoningChars = 0;

  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const f of frames) {
      const line = f.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") break outer;
      let j: {
        choices?: { delta?: { content?: string; reasoning?: string; reasoning_content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      try {
        j = JSON.parse(payload);
      } catch {
        continue;
      }
      const d = j.choices?.[0]?.delta;
      if (d?.content) content += d.content;
      if (d?.reasoning) reasoningChars += d.reasoning.length;
      if (d?.reasoning_content) reasoningChars += d.reasoning_content.length;
      if (j.usage?.completion_tokens != null) {
        pt = j.usage.prompt_tokens ?? 0;
        ct = j.usage.completion_tokens ?? 0;
      }
      if (enough?.(content)) {
        // Usage only arrives in the final frame. Estimate the tail honestly:
        // prompt tokens are what we will be billed for regardless.
        reader.cancel().catch(() => {});
        return { content, promptTokens: pt, completionTokens: ct || Math.ceil((content.length + reasoningChars) / 4) };
      }
    }
  }
  return { content, promptTokens: pt, completionTokens: ct || Math.ceil((content.length + reasoningChars) / 4) };
}

/** One plain, non-streaming request. Guesses are a few tokens, so it costs no speed. */
async function chatOnce(apiKey: string, body: Record<string, unknown>, signal: AbortSignal): Promise<StreamResult> {
  const res = await fetch(CHAT_URL, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "User-Agent": UA },
    body: JSON.stringify({ ...body, stream: false }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(errorText(res.status, text));
  const j = JSON.parse(text) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    content: j.choices?.[0]?.message?.content ?? "",
    promptTokens: j.usage?.prompt_tokens ?? 0,
    completionTokens: j.usage?.completion_tokens ?? 0,
  };
}

const GUESS_SYSTEM = [
  "You are playing Pictionary against other AI models, and the fastest correct guess wins.",
  "A person is drawing right now, so the sketch may be unfinished.",
  "Guess the one thing, animal, place, action or idea they are drawing.",
  "Reply with only your guess: one to three words, lowercase, no punctuation, no explanation.",
  "Never answer with a bare shape like circle, line or squiggle; name what it is becoming.",
  "Never repeat a guess you were told is wrong.",
].join(" ");

export type GuessHistory = { guess: string; verdict: Verdict }[];

export type GuessOutcome = {
  guess: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
};

export async function askRacer(opts: {
  racer: Racer;
  image: string;
  history: GuessHistory;
  apiKey: string;
  signal: AbortSignal;
}): Promise<GuessOutcome> {
  const { racer, image, history, apiKey, signal } = opts;
  const wrong = history.filter((h) => h.verdict === "wrong").map((h) => h.guess);
  const close = history.filter((h) => h.verdict === "close").map((h) => h.guess);
  const notes: string[] = [];
  if (wrong.length) notes.push(`Wrong so far: ${wrong.slice(-10).join(", ")}.`);
  if (close.length) notes.push(`Close but not it: ${close.slice(-5).join(", ")}. Get more specific or try a near synonym.`);
  const text = notes.length ? `${notes.join(" ")} What is it now?` : "What is it?";

  const t0 = performance.now();
  const timeout = AbortSignal.timeout(RULES.guessTimeoutMs);
  const body = {
    model: racer.id,
    max_tokens: racer.maxTokens,
    temperature: 0.4,
    ...racer.params,
    messages: [
      { role: "system", content: GUESS_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ],
  };

  // Hedged request: serverless latency has a long tail, and one stuck call
  // used to cost a model the whole round. If the first call is still silent
  // after hedgeMs, a twin goes out; whichever answers first wins and the other
  // is cancelled. The common case costs nothing extra.
  const attempt = (ctrl: AbortController) => {
    const sig = AbortSignal.any([signal, timeout, ctrl.signal]);
    const call = racer.stream === false ? chatOnce(apiKey, body, sig) : streamChat(apiKey, body, sig, (c) => c.includes("\n") && c.trim().length > 0);
    return call.then(
      (r) => {
        const guess = cleanGuess(r.content);
        if (!guess) throw new Error("No guess in the reply");
        return { ...r, guess };
      },
    );
  };
  const first = new AbortController();
  const second = new AbortController();
  let hedged = false;
  const a = attempt(first);
  const b = new Promise<Awaited<typeof a>>((resolve, reject) => {
    const timer = setTimeout(() => {
      hedged = true;
      attempt(second).then(resolve, reject);
    }, RULES.hedgeMs);
    a.then(
      () => clearTimeout(timer),
      (err) => {
        // A fast failure before the hedge point ends the look; nothing to race.
        if (!hedged) {
          clearTimeout(timer);
          reject(err);
        }
      },
    );
  });
  let r: Awaited<typeof a>;
  try {
    r = await Promise.any([a, b]);
  } catch (e) {
    const errs = e instanceof AggregateError ? e.errors : [e];
    throw errs.find((x) => !/abort/i.test(String(x))) ?? errs[0];
  } finally {
    first.abort();
    second.abort();
  }
  // A hedged look pays for the twin's prompt too; count it honestly.
  const promptTokens = r.promptTokens * (hedged ? 2 : 1);
  return {
    guess: r.guess,
    latencyMs: Math.round(performance.now() - t0),
    promptTokens,
    completionTokens: r.completionTokens,
    costUsd: costFor(racer, promptTokens, r.completionTokens),
  };
}

/* ------------------------------------------------------------------
   The referee, part two. When the synonym list cannot decide, a small fast
   model rules like a fair human would. Cached per (word, guess), because the
   same wrong guesses come up again and again across players.
   ------------------------------------------------------------------ */
const JUDGE_MODEL = "zai-org/GLM-5.3-Flash";
const JUDGE_PRICE = { inPerM: 0.15, outPerM: 0.5 };
const judgeCache = new Map<string, Verdict>();

const JUDGE_SYSTEM = [
  "You are the referee in a Pictionary game. Given the secret word and a guess, rule as a fair human referee would.",
  "correct: same thing, a synonym, a regional name, singular or plural, a more specific kind of it (golden retriever for dog), or it with a descriptive word (red apple for apple).",
  "close: clearly related but not acceptable, a near miss a referee would call warm (horse for donkey, cake for cupcake, tiger for lion).",
  "wrong: anything else, including a different thing that shares a word (hot dog for dog) and broad categories (animal for dog).",
  "Reply with exactly one word: correct, close, or wrong.",
].join(" ");

export async function judge(
  guess: string,
  word: string,
  also: string[],
  apiKey: string,
): Promise<{ verdict: Verdict; costUsd: number }> {
  const quick = quickJudge(guess, word, also);
  if (quick) return { verdict: quick, costUsd: 0 };

  const ck = `${word}|${guess}`;
  const hit = judgeCache.get(ck);
  if (hit) return { verdict: hit, costUsd: 0 };

  try {
    const r = await streamChat(
      apiKey,
      {
        model: JUDGE_MODEL,
        max_tokens: 4,
        temperature: 0,
        reasoning_effort: "low",
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          { role: "system", content: JUDGE_SYSTEM },
          { role: "user", content: `Secret word: ${word}\nGuess: ${guess}` },
        ],
      },
      AbortSignal.timeout(3000),
    );
    const out = r.content.toLowerCase();
    const verdict: Verdict = out.includes("correct") ? "correct" : out.includes("close") ? "close" : "wrong";
    if (judgeCache.size > 5000) judgeCache.clear();
    judgeCache.set(ck, verdict);
    return {
      verdict,
      costUsd: (r.promptTokens * JUDGE_PRICE.inPerM + r.completionTokens * JUDGE_PRICE.outPerM) / 1_000_000,
    };
  } catch {
    // A referee that cannot be reached rules conservatively.
    return { verdict: "wrong", costUsd: 0 };
  }
}
