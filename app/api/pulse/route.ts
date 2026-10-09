import { NextResponse, after } from "next/server";
import { readPulse } from "@/lib/server/stats";
import { refreshFunny } from "@/lib/server/funny";
import { houseKey } from "@/lib/server/together";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The live numbers on the table: rounds today, players on the daily, the wrong guess of the day. */
export async function GET() {
  // The curator only does real work every few minutes; this just gives it the chance.
  after(() => refreshFunny(houseKey()).catch(() => {}));
  try {
    return NextResponse.json(await readPulse(), {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
