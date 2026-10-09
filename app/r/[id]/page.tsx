import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getShare } from "@/lib/server/share";
import { RACER_BY_KEY } from "@/lib/racers";
import { fmtSec } from "@/lib/replay";
import { Replay } from "@/components/game/Replay";
import { findWord } from "@/lib/words";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const doc = await getShare(id);
  if (!doc) return { title: "doodle derby" };
  const w = doc.winner ? RACER_BY_KEY[doc.winner] : null;
  const title = w && doc.winMs != null ? `${w.label} guessed my doodle in ${fmtSec(doc.winMs)}. Can you beat it?` : "Six AIs couldn't guess my doodle. Can you?";
  const description = "Watch the doodle draw itself and type your guess before six AI models get it. Then draw your own.";
  return {
    title: `${title} · doodle derby`,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedRound({ params }: Props) {
  const { id } = await params;
  const doc = await getShare(id);
  if (!doc) notFound();
  return <Replay doc={doc} also={findWord(doc.word)?.also ?? []} />;
}
