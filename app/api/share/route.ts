import { NextResponse } from "next/server";
import { readRound } from "@/lib/server/round";
import { createShare } from "@/lib/server/share";
import { houseKey } from "@/lib/server/together";

export const runtime = "nodejs";

/** Turn a finished round into a replay link. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { round?: unknown; strokes?: unknown; byok?: unknown } | null;
  const round = readRound(body?.round);
  if (!round) return NextResponse.json({ error: "This round expired." }, { status: 400 });
  const doc = await createShare(round, body?.strokes, !houseKey() && !body?.byok);
  if ("error" in doc) return NextResponse.json(doc, { status: 400 });
  const origin = new URL(req.url).origin;
  return NextResponse.json({ id: doc.id, url: `${origin}/r/${doc.id}` });
}
