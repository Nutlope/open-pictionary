import { NextResponse } from "next/server";
import { getShare } from "@/lib/server/share";
import { houseKey, judge } from "@/lib/server/together";
import { houseAllowance } from "@/lib/server/stats";
import { cleanGuess, quickJudge } from "@/lib/judge";
import { findWord } from "@/lib/words";

export const runtime = "nodejs";

/**
 * Rule on a viewer's guess at a shared doodle. The synonym list answers most
 * of these instantly; the referee model only sees what the list cannot settle.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { share?: unknown; guess?: unknown } | null;
  const doc = typeof body?.share === "string" && body.share.length < 14_000 ? await getShare(body.share).catch(() => null) : null;
  if (!doc) return NextResponse.json({ error: "Unknown doodle." }, { status: 404 });
  const guess = typeof body?.guess === "string" ? cleanGuess(body.guess) : "";
  if (!guess) return NextResponse.json({ verdict: "wrong" });

  const also = findWord(doc.word)?.also ?? [];
  const quick = quickJudge(guess, doc.word, also);
  const key = houseKey();
  if (quick || !key) return NextResponse.json({ verdict: quick ?? "wrong" });

  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();
  const allow = await houseAllowance(ip).catch(() => ({ ok: true }) as const);
  if (!allow.ok) return NextResponse.json({ verdict: "wrong" });
  const { verdict } = await judge(guess, doc.word, also, key);
  return NextResponse.json({ verdict });
}
