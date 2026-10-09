import type { RacerKey } from "./racers";

/**
 * Each creature's voice: a one-word personality and a few very short lines
 * for the moments that matter. Shown in speech bubbles, never more than a
 * couple at once, so the table stays calm.
 */
export type Moment = "win" | "also" | "wrong" | "close" | "lose" | "stumped" | "picked" | "doze";

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
      picked: ["smart", "obviously"],
      doze: ["zzz"],
    },
  },
  "qwen3-7-plus": {
    vibe: "the professor",
    bio: "Qwen's big all-rounder. Thinks before it speaks, then doesn't.",
    lines: {
      win: ["indeed.", "naturally", "elementary"],
      also: ["agreed", "concur"],
      wrong: ["hmm", "revising"],
      close: ["nearly", "warmer"],
      lose: ["well played", "noted"],
      stumped: ["inconclusive"],
      picked: ["an honor"],
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
      picked: ["let's go!"],
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
      picked: ["finally"],
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
      picked: ["ready"],
      doze: ["zzz"],
    },
  },
  "qwen3-5-9b": {
    vibe: "the little one",
    bio: "The smallest in the field at 9B. Tries very hard.",
    lines: {
      win: ["i did it!", "me!!", "yay!"],
      also: ["me too!", "i knew!"],
      wrong: ["oh no", "sorry"],
      close: ["eek, close", "almost!"],
      lose: ["aww", "oh well"],
      stumped: ["a dog?"],
      picked: ["me?!", "really?!"],
      doze: ["zzz"],
    },
  },
};

export function say(k: RacerKey, m: Moment): string {
  const opts = VOICES[k].lines[m];
  return opts[Math.floor(Math.random() * opts.length)];
}
