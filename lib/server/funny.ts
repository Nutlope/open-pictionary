import "server-only";
import { RACERS, RACER_BY_KEY, isRacerKey, type RacerKey } from "@/lib/racers";
import { normalize } from "@/lib/judge";
import { store } from "./store";
import { streamChat } from "./together";

/**
 * The wrong guess of the day. Every wrong guess that is more than a shape
 * goes into today's pool; every few minutes, if enough new ones came in, a
 * model reads the pool and picks the funniest, overall and per model. One
 * cheap call at most every eight minutes, however busy the game gets.
 */
export type Cand = { k: RacerKey; g: string; w: string };
type Pick = { n: number; at: number; top: Cand | null; by: Partial<Record<RacerKey, Cand>> };

const BORING = new Set(
  "circle line lines squiggle squiggles scribble scribbles dot dots shape shapes unknown nothing drawing sketch doodle abstract art blank empty pattern oval square triangle rectangle curve curves loop swirl spiral zigzag wave waves letter number blob outline symbol icon".split(
    " ",
  ),
);
const day = (back = 0) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);

export async function noteFunnyCandidate(c: Cand) {
  const g = normalize(c.g);
  if (g.length < 3 || g.split(" ").every((w) => BORING.has(w))) return;
  await store.push(`wrong:${day()}`, JSON.stringify({ ...c, g }), 3 * 86400, 400);
}

/** Today's pick, or yesterday's while today's pool is still filling. */
export async function latestFunny(): Promise<Pick | null> {
  const [a, b] = await store.getManyJSON<Pick>([`wrong:${day()}:pick`, `wrong:${day(1)}:pick`]);
  return a ?? b;
}

const CURATOR = RACER_BY_KEY["qwen3-8-flash"];
const SYSTEM = [
  "You pick the funniest wrong answers from a drawing game where AI models guess people's doodles.",
  "Funny means absurd, oddly specific, dramatic or poetic misreadings. A near miss (dog for cat) or a plain everyday object is not funny.",
  "Never pick anything rude, sexual, violent or mean about people.",
].join(" ");

export async function refreshFunny(apiKey: string) {
  if (!apiKey) return;
  const d = day();
  const [n, pick] = await Promise.all([store.llen(`wrong:${d}`), store.getJSON<Pick>(`wrong:${d}:pick`)]);
  const due = pick ? n - pick.n >= 8 && Date.now() - pick.at > 8 * 60_000 : n >= 3;
  if (!due || !(await store.claim(`wrong:${d}:lock`, 90))) return;

  // Newest first, one entry per (word, guess).
  const seen = new Set<string>();
  const pool: Cand[] = [];
  for (const raw of (await store.list(`wrong:${d}`, 160)).reverse()) {
    try {
      const c = JSON.parse(raw) as Cand;
      const id = `${c.w}|${c.g}`;
      if (!isRacerKey(c.k) || seen.has(id)) continue;
      seen.add(id);
      pool.push(c);
    } catch {}
    if (pool.length >= 60) break;
  }
  if (pool.length < 3) return;

  const models = RACERS.filter((r) => pool.some((c) => c.k === r.key));
  const list = pool.map((c, i) => `${i + 1}. ${c.w} -> ${c.g} (${c.k})`).join("\n");
  const ask = [
    'Wrong guesses, as "number. secret word -> guess (model)":',
    list,
    "",
    "Reply with these lines and nothing else, each followed by one number from the list:",
    "overall:",
    ...models.map((r) => `${r.key}: (one of its own guesses)`),
  ].join("\n");

  try {
    const r = await streamChat(
      apiKey,
      {
        model: CURATOR.id,
        max_tokens: 90,
        temperature: 0.3,
        ...CURATOR.params,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: ask },
        ],
      },
      AbortSignal.timeout(12_000),
    );
    const at = (k: string) => {
      const m = r.content.match(new RegExp(`^\\s*${k}\\s*:\\s*(\\d+)`, "im"));
      return m ? pool[Number(m[1]) - 1] ?? null : null;
    };
    const by: Pick["by"] = {};
    for (const m of models) {
      const c = at(m.key);
      if (c && c.k === m.key) by[m.key] = c;
    }
    const top = at("overall") ?? Object.values(by)[0] ?? null;
    await store.setJSON(`wrong:${d}:pick`, { n, at: Date.now(), top, by } satisfies Pick, 3 * 86400);
  } catch (e) {
    console.warn("[funny]", e instanceof Error ? e.message : e);
  }
}
