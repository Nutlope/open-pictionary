import { NextResponse } from "next/server";
import { readBoard } from "@/lib/server/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const board = await readBoard();
    return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ rounds: 0, rows: [], error: "The board is unavailable right now." }, { status: 503 });
  }
}
