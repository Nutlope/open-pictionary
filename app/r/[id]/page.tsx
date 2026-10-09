import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getShare } from "@/lib/server/share";
import { RACER_BY_KEY } from "@/lib/racers";
import { fmtSec } from "@/lib/replay";
import { Replay } from "@/components/game/Replay";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const doc = await getShare(id);
  if (!doc) return { title: "doodle derby" };
  const w = doc.winner ? RACER_BY_KEY[doc.winner] : null;
  const title = w && doc.winMs != null ? `${w.label} guessed my doodle in ${fmtSec(doc.winMs)}` : "Six AIs couldn't guess my doodle";
  const description = "Watch the replay: six open AI models race to guess a doodle, live. Then beat the time on the same word.";
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
  return <Replay doc={doc} />;
}
