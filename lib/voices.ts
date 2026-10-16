import type { RacerKey } from "./racers";

/**
 * Each creature's voice: a one-word personality and a few very short lines
 * for the moments that matter. Shown in speech bubbles, never more than a
 * couple at once, so the table stays calm.
 */
export type Moment = "win" | "also" | "wrong" | "close" | "lose" | "stumped" | "doze";

type Voice = { vibe: string; bio: string; lines: Record<Moment, string[]> };

export const VOICES: Record<RacerKey, Voice> = {
  "kimi-k3": {
    vibe: "the show-off",
    bio: "Answers in about a second, until it doesn't.",
    lines: {
      win: ["easy.", "called it", "too easy"],
      also: ["knew it", "same"],
      wrong: ["hm.", "nope", "wait"],
      close: ["so close", "almost"],
      lose: ["lucky", "rigged", "pfft"],
      stumped: ["art?", "bold."],
      doze: ["zzz"],
    },
  },
  "qwen3-8-flash": {
    vibe: "the professor",
    bio: "Qwen's newest fast model. Rarely in doubt.",
    lines: {
      win: ["indeed.", "naturally", "elementary"],
      also: ["agreed", "concur"],
      wrong: ["hmm", "revising"],
      close: ["nearly", "warmer"],
      lose: ["well played", "noted"],
      stumped: ["inconclusive"],
      doze: ["zzz"],
    },
  },
  "glm-5-3-flash": {
    vibe: "the sprinter",
    bio: "Z.ai's quick one. Also referees every round.",
    lines: {
      win: ["zoom!", "first!!", "yesss"],
      also: ["me too!", "yay"],
      wrong: ["oops", "whoops"],
      close: ["ooh!", "so close!"],
      lose: ["aww", "rematch!"],
      stumped: ["?!"],
      doze: ["zzz"],
    },
  },
  "minimax-m3": {
    vibe: "the diva",
    bio: "MiniMax's flagship, with its thinking switched off.",
    lines: {
      win: ["iconic", "flawless", "you're welcome"],
      also: ["duh", "obviously"],
      wrong: ["ugh", "rude"],
      close: ["so close!", "almost!"],
      lose: ["whatever", "hmph"],
      stumped: ["a crime"],
      doze: ["zzz"],
    },
  },
  "deepseek-v4-1-flash": {
    vibe: "the monk",
    bio: "DeepSeek's fast model. Calm, quiet, often right.",
    lines: {
      win: ["as foreseen", "aha"],
      also: ["aha", "noted"],
      wrong: ["hm", "not quite"],
      close: ["near"],
      lose: ["so be it", "fair"],
      stumped: ["a mystery"],
      doze: ["zzz"],
    },
  },
  "muse-glimmer": {
    vibe: "the dreamer",
    bio: "Meta's Muse. Always daydreams a little before it answers.",
    lines: {
      win: ["inspired", "i saw it", "magic"],
      also: ["felt it", "same vibe"],
      wrong: ["or not", "hmm…"],
      close: ["warm…", "so near"],
      lose: ["sigh", "next time"],
      stumped: ["pure art", "a mood"],
      doze: ["zzz"],
    },
  },
  "nemotron-3-5-super": {
    vibe: "the new kid",
    bio: "NVIDIA's newest vision model, on the field the day it shipped.",
    lines: {
      win: ["day one!", "rendered.", "gg"],
      also: ["same", "got it too"],
      wrong: ["lag", "recompiling"],
      close: ["so close", "almost"],
      lose: ["next patch", "noted"],
      stumped: ["404"],
      doze: ["zzz"],
    },
  },
  "muse-spark": {
    vibe: "the big sibling",
    bio: "Meta's big open Muse. Glimmer daydreams; Spark just blurts it out.",
    lines: {
      win: ["spark!", "easy", "called it"],
      also: ["obviously", "me too"],
      wrong: ["oops", "rethinking"],
      close: ["hot!", "nearly"],
      lose: ["rematch", "fine"],
      stumped: ["abstract?"],
      doze: ["zzz"],
    },
  },
};

export function say(k: RacerKey, m: Moment): string {
  const opts = VOICES[k].lines[m];
  return opts[Math.floor(Math.random() * opts.length)];
}
