/**
 * The racers. One open vision model per lab, so the race is between genuinely
 * different model families rather than six sizes of the same one.
 *
 * Verified live on 2026-10-08 against GET /v1/models plus a real image call per
 * model (the lineup was revised the same day). Notes from that run, so nobody re-learns them:
 * - Qwen3.8 2.4T is the docs' vision pick but rejects image input on
 *   serverless ("Multimodal not supported"). Qwen3.7 Plus takes images.
 * - Qwen3.6/3.7 Plus and Qwen3.8 Flash only accept stream: true.
 * - Thinking switches differ per lab, and a wrong one is silent: the model
 *   reasons for hundreds of tokens on a hard sketch and runs out of budget
 *   before it answers. Each entry carries the switch that took that model to
 *   a no-reasoning answer, tested on an ambiguous sketch, not an easy one.
 * - gpt-oss-120b accepts image input but cannot see it (it answers "unknown"
 *   for every sketch), so it stays out. Llama 4, Gemma 4 and the Mistral
 *   vision models are not on serverless as of this check.
 * - Kimi K3 answers in about a second most of the time but has a long tail.
 *   Every look is hedged (see RULES.hedgeMs) so one stuck request no longer
 *   costs a model the whole round.
 * - Image tokens scale with pixels: a 384px sketch costs about half a 512px one.
 *
 * Prices are per million tokens, from the live /v1/models pricing block.
 */
export type RacerKey =
  | "kimi-k3"
  | "qwen3-7-plus"
  | "glm-5-3-flash"
  | "minimax-m3"
  | "deepseek-v4-1-flash"
  | "qwen3-5-9b";

export type Shape = "circle" | "square" | "triangle" | "pill" | "drop" | "flower";

export type Racer = {
  key: RacerKey;
  id: string;
  label: string;
  lab: string;
  /** Fits a phone's half-width lane. */
  short: string;
  /** The creature: its body color, its body shape, and the room it paints when it wins. */
  color: string;
  /** Its color as an emoji, for pasteable results. */
  heart: string;
  shape: Shape;
  room: string;
  inPerM: number;
  outPerM: number;
  /** Extra body fields that switch thinking off (or down) for this model. */
  params: Record<string, unknown>;
  /** Room for the guess plus whatever reasoning the model insists on. */
  maxTokens: number;
};

export const RACERS: Racer[] = [
  {
    key: "kimi-k3",
    id: "moonshotai/Kimi-K3",
    label: "Kimi K3",
    short: "Kimi K3",
    color: "#F2442E",
    heart: "❤️",
    shape: "circle",
    room: "#FF8A7A",
    lab: "Moonshot",
    inPerM: 2.7,
    outPerM: 13.5,
    params: { reasoning: { enabled: false } },
    maxTokens: 48,
  },
  {
    key: "qwen3-7-plus",
    id: "Qwen/Qwen3.7-Plus",
    label: "Qwen3.7 Plus",
    short: "Qwen3.7",
    color: "#6B4EFF",
    heart: "💜",
    shape: "square",
    room: "#BBA8FF",
    lab: "Qwen",
    inPerM: 0.32,
    outPerM: 1.28,
    params: { chat_template_kwargs: { enable_thinking: false } },
    maxTokens: 40,
  },
  {
    key: "glm-5-3-flash",
    id: "zai-org/GLM-5.3-Flash",
    label: "GLM-5.3 Flash",
    short: "GLM-5.3",
    color: "#00A870",
    heart: "💚",
    shape: "triangle",
    room: "#6FE3B0",
    lab: "Z.ai",
    inPerM: 0.15,
    outPerM: 0.5,
    params: { reasoning_effort: "low", chat_template_kwargs: { enable_thinking: false } },
    // Usually answers with no reasoning at all, but now and then it thinks a
    // few dozen tokens first; a tight cap turned those into empty replies.
    maxTokens: 160,
  },
  {
    key: "minimax-m3",
    id: "MiniMaxAI/MiniMax-M3",
    label: "MiniMax M3",
    short: "MiniMax",
    color: "#F2338C",
    heart: "🩷",
    shape: "pill",
    room: "#FF9BC8",
    lab: "MiniMax",
    inPerM: 0.3,
    outPerM: 1.2,
    // The only switch that fully stops its reasoning; the others still think
    // for hundreds of tokens on an ambiguous sketch.
    params: { thinking: { type: "disabled" } },
    maxTokens: 24,
  },
  {
    key: "deepseek-v4-1-flash",
    id: "deepseek-ai/DeepSeek-V4.1-Flash",
    label: "DeepSeek V4.1 Flash",
    short: "DeepSeek",
    color: "#1F6BFF",
    heart: "💙",
    shape: "drop",
    room: "#86C3FF",
    lab: "DeepSeek",
    inPerM: 0.3,
    outPerM: 1.2,
    params: { thinking: { type: "disabled" } },
    maxTokens: 24,
  },
  {
    key: "qwen3-5-9b",
    id: "Qwen/Qwen3.5-9B",
    label: "Qwen3.5 9B",
    short: "Qwen 9B",
    color: "#FFA800",
    heart: "💛",
    shape: "flower",
    room: "#FFD84A",
    lab: "Qwen",
    inPerM: 0.17,
    outPerM: 0.25,
    params: { chat_template_kwargs: { enable_thinking: false } },
    maxTokens: 24,
  },
];

export const RACER_BY_KEY = Object.fromEntries(RACERS.map((r) => [r.key, r])) as Record<RacerKey, Racer>;

export function isRacerKey(v: unknown): v is RacerKey {
  return typeof v === "string" && v in RACER_BY_KEY;
}

export function costFor(r: Racer, promptTokens: number, completionTokens: number) {
  return (promptTokens * r.inPerM + completionTokens * r.outPerM) / 1_000_000;
}

/** Game tuning, shared by client and server so they never disagree. */
export const RULES = {
  roundSeconds: 60,
  /** Max guesses one model gets per round. Bounds the worst-case bill. */
  maxGuessesPerRacer: 10,
  /** Breathing room between one model's reply and its next look. */
  minGapMs: 700,
  /** New ink (in px of stroke length) a model needs before it looks again. */
  minNewInk: 36,
  /** Ink before anyone looks at all, so nobody guesses a single dot. */
  minInkToStart: 90,
  /** Snapshot edge in px. Under 560 keeps every model at one image tile. */
  snapshotSize: 384,
  /** With no new ink, a model takes another look after this long. */
  relookMs: 3500,
  /** A look still unanswered after this long gets a second, parallel request; first answer wins. */
  hedgeMs: 2800,
  /** A model that has not answered in this long is cut off for that look. */
  guessTimeoutMs: 9000,
} as const;

/** Ink or white, whichever reads on a creature's body color. */
export function onColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.36 ? "#16130f" : "#ffffff";
}
