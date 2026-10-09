import { NextResponse } from "next/server";
import { pickWord } from "@/lib/words";
import { dailyWord } from "@/lib/server/daily";
import { mintRound } from "@/lib/server/round";
import { houseKey } from "@/lib/server/together";

export const runtime = "nodejs";

/** Deal a word. The client passes recent words so a session does not repeat. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { exclude?: unknown };
  const exclude = Array.isArray(body.exclude) ? body.exclude.filter((x): x is string => typeof x === "string").slice(-80) : [];
  // Free play never deals today's daily word: that one is saved for the daily.
  const w = pickWord([...exclude, dailyWord().word]);
  const { token } = mintRound(w.word);
  return NextResponse.json(
    { token, word: w.word, level: w.level, live: Boolean(houseKey()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
