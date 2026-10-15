/**
 * The daily's link card: today's number, a blank paper with a question mark
 * where the word would be, and the field waiting along the bottom. It never
 * shows the word, so it can be posted all day without spoiling anything.
 */
import { ImageResponse } from "next/og";
import { RACERS } from "@/lib/racers";
import { dailyNumber } from "@/lib/daily";
import { readPulse } from "@/lib/server/stats";
import { GLYPH_PATH } from "@/lib/creatures";
import { INK, OgCreature, ogFonts } from "@/lib/og";

export const alt = "Daily doodle: one word for everyone, seven AI models racing to guess it.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image() {
  const d = dailyNumber();
  const [fonts, pulse] = await Promise.all([ogFonts(), readPulse().catch(() => null)]);
  const players = pulse?.daily.d === d ? pulse.daily.players : 0;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#FFD84A", fontFamily: "Bricolage", color: INK, position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "62px 0 62px 64px", width: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 36, fontWeight: 800, letterSpacing: "-0.04em" }}>
            <svg width="46" height="46" viewBox="0 0 32 32" fill="none">
              <path d={GLYPH_PATH} stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="25" cy="13.5" r="4.2" fill="#F2442E" />
              <circle cx="25" cy="13.5" r="1.6" fill={INK} />
            </svg>
            doodle derby
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em", opacity: 0.7 }}>Daily doodle</span>
            <span style={{ fontSize: 190, fontWeight: 800, lineHeight: 0.86, letterSpacing: "-0.06em" }}>#{d}</span>
          </div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 600, opacity: 0.66, letterSpacing: "-0.02em" }}>
            {players > 0 ? `${players.toLocaleString("en-US")} drew it so far. Your turn.` : "One word for everyone. Seven AIs guess."}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: 60,
            right: 70,
            width: 500,
            height: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#fff",
            borderRadius: 40,
            boxShadow: "0 36px 70px -26px rgba(22,19,15,0.45)",
            transform: "rotate(-2.5deg)",
            overflow: "hidden",
          }}
        >
          <svg width="230" height="300" viewBox="0 0 230 300" fill="none" stroke={INK} strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: -40 }}>
            <path d="M40 80 C 44 30, 110 10, 150 30 C 200 56, 190 110, 150 132 C 118 150, 112 170, 114 200" />
            <path d="M114 262 L 115 264" strokeWidth="24" />
          </svg>
          <div style={{ position: "absolute", bottom: -14, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 4 }}>
            {RACERS.map((r) => (
              <div key={r.key} style={{ display: "flex", width: 64, justifyContent: "center" }}>
                <OgCreature k={r.key} size={56} />
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts, headers: { "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=3600" } },
  );
}
