import { NextResponse } from "next/server";
import { BRAND } from "@/lib/brand";

export const runtime = "nodejs";

/** The repo's star count, cached for ten minutes so GitHub's rate limit never matters. */
export async function GET() {
  try {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "doodle-derby" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const r = await fetch(`https://api.github.com/repos/${BRAND.repo}`, { headers, next: { revalidate: 600 } });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { stargazers_count?: number };
    return NextResponse.json({ stars: j.stargazers_count ?? null }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } });
  } catch {
    return NextResponse.json({ stars: null }, { headers: { "Cache-Control": "public, s-maxage=120" } });
  }
}
