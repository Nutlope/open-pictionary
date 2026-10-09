import { NextResponse } from "next/server";
import { readBoard } from "@/lib/server/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const board = await readBoard();
    return NextResponse.json(board, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60" } });
  } catch {
    return NextResponse.json({ rounds: 0, rows: [], error: "The board is unavailable right now." }, { status: 503 });
  }
}
