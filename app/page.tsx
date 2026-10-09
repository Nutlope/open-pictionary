import { Game, type Challenge } from "@/components/game/Game";
import { findWord, pickWord } from "@/lib/words";
import { mintRound } from "@/lib/server/round";
import { houseKey } from "@/lib/server/together";
import { getShare } from "@/lib/server/share";

export const dynamic = "force-dynamic";

/**
 * The first word is dealt with the HTML, so the page opens ready to draw.
 * A ?c=<share id> link deals the friend's word instead, with their time to beat.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const shared = c ? await getShare(c).catch(() => null) : null;

  let challenge: Challenge | null = null;
  let w = pickWord();
  if (shared) {
    w = findWord(shared.word) ?? { word: shared.word, level: 2, also: [] };
    challenge = { id: shared.id, word: shared.word, winner: shared.winner, ms: shared.winMs };
  }
  const { token } = mintRound(w.word);
  return <Game initial={{ token, word: w.word, level: w.level, live: Boolean(houseKey()) }} challenge={challenge} />;
}
