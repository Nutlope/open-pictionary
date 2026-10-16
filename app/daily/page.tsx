import { BRAND } from "@/lib/brand";
import type { Metadata } from "next";
import { Game } from "@/components/game/Game";
import { dailyNumber } from "@/lib/daily";
import { dailyWord } from "@/lib/server/daily";
import { mintRound } from "@/lib/server/round";
import { houseKey } from "@/lib/server/together";
import { readPulse } from "@/lib/server/stats";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const d = dailyNumber();
  const title = `Daily doodle #${d}`;
  const description = "One word for everyone today. Draw it, and seven AI models race to guess yours. Fastest doodles top the board.";
  return {
    title: `${title} · ${BRAND.name}`,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Today's word, the same for everyone, dealt with the page. */
export default async function DailyPage() {
  const d = dailyNumber();
  const w = dailyWord(d);
  const { token } = mintRound(w.word, d);
  const pulse = await readPulse().catch(() => null);
  return <Game mode="daily" d={d} initial={{ token, word: w.word, level: w.level, live: Boolean(houseKey()) }} pulse={pulse} />;
}
