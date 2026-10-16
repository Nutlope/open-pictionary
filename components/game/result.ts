import { RACERS, RACER_BY_KEY, type RacerKey } from "@/lib/racers";
import { fmtSec } from "@/lib/replay";

/**
 * The pasteable result, Wordle style: a heart per model in the order they
 * got it, in their colors, then a white heart for each that never did.
 *
 *   open pictionary #12 · 2.8s 🎯
 *   ❤️💚💛🤍🤍🤍
 *   https://…/daily
 */
export function resultText(r: {
  daily?: number | null;
  ms: number | null;
  order: RacerKey[];
  called?: boolean | null;
  streak?: number;
  url?: string | null;
}): string {
  const head = [`open pictionary${r.daily ? ` #${r.daily}` : ""}`, r.ms != null ? fmtSec(r.ms) : "nobody got it"].join(" · ");
  const extras = [r.called ? "🎯" : "", r.streak && r.streak > 1 ? `🔥${r.streak}` : ""].filter(Boolean).join(" ");
  return [extras ? `${head} ${extras}` : head, hearts(r.order), r.url ?? ""].filter(Boolean).join("\n");
}

export function hearts(order: RacerKey[]): string {
  return [...order.map((k) => RACER_BY_KEY[k].heart), ...RACERS.filter((x) => !order.includes(x.key)).map(() => "🤍")].join("");
}
