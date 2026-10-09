import { NextResponse } from "next/server";
import { readRound } from "@/lib/server/round";
import { postDaily, readDaily } from "@/lib/server/daily";
import { dailyNumber } from "@/lib/daily";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's board (or an earlier day's), with the caller's own rank when they pass their entry id. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const today = dailyNumber();
  const d = Math.min(today, Math.max(1, Math.floor(Number(q.get("d"))) || today));
  const me = q.get("me");
  const mine = me && /^[A-Za-z0-9_-]{6,16}$/.test(me) ? me : null;
  try {
    const board = await readDaily(d, mine);
    return NextResponse.json(board, {
      headers: { "Cache-Control": mine ? "no-store" : "public, s-maxage=10, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json({ error: "The daily board is unavailable right now." }, { status: 503 });
  }
}

/** Post a finished daily. The time comes from the server's own record of the round. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const round = readRound(body?.round);
  if (!round?.d) return NextResponse.json({ error: "Not a daily round." }, { status: 400 });
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();
  const out = await postDaily({ round, player: body?.player, name: body?.name, strokes: body?.strokes, log: body?.log, ip }).catch(() => ({
    error: "Could not post your result. It still counts here.",
  }));
  if ("error" in out) return NextResponse.json(out, { status: 400 });
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
