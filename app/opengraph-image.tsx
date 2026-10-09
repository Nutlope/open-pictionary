/**
 * The link card for the game itself. It explains the whole thing in one
 * picture: a doodle on paper, six creatures peeking over the edge, five wrong
 * guesses struck through and one right one stamped. Five words of copy.
 */
import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { RACERS, type RacerKey } from "@/lib/racers";
import { INK, OgCreature, ogFonts } from "@/lib/og";
import { GLYPH_PATH } from "@/lib/creatures";

export const alt = `${BRAND.name}: you draw, six AI models race to guess it.`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GUESSES: Record<RacerKey, { text: string; right?: boolean }> = {
  "kimi-k3": { text: "cat", right: true },
  "qwen3-8-flash": { text: "fox" },
  "glm-5-3-flash": { text: "owl" },
  "minimax-m3": { text: "bunny" },
  "deepseek-v4-1-flash": { text: "mouse" },
  "muse-glimmer": { text: "tiger" },
};

export default async function Image() {
  const fonts = await ogFonts();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#FFD84A", fontFamily: "Bricolage", color: INK, position: "relative" }}>
        {/* left: the name and five words */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "62px 0 62px 64px", width: 560 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 36, fontWeight: 800, letterSpacing: "-0.04em" }}>
            <svg width="46" height="46" viewBox="0 0 32 32" fill="none">
              <path d={GLYPH_PATH} stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="25" cy="13.5" r="4.2" fill="#F2442E" />
              <circle cx="25" cy="13.5" r="1.6" fill={INK} />
            </svg>
            doodle derby
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 96, fontWeight: 800, lineHeight: 0.9, letterSpacing: "-0.055em" }}>
            <span>You draw.</span>
            <span>AIs race</span>
            <span>to guess.</span>
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600, opacity: 0.62, letterSpacing: "-0.02em" }}>six open models, live</div>
        </div>

        {/* right: the paper, the doodle, the field */}
        <div
          style={{
            position: "absolute",
            top: 56,
            right: 64,
            width: 520,
            height: 520,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            background: "#fff",
            borderRadius: 40,
            boxShadow: "0 36px 70px -26px rgba(22,19,15,0.45)",
            transform: "rotate(2.5deg)",
            overflow: "hidden",
          }}
        >
          <svg width="330" height="294" viewBox="80 80 360 320" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 34 }}>
            <path d="M146 214 Q 130 300 170 350 Q 260 420 350 350 Q 392 300 372 214" />
            <path d="M146 214 L 168 100 L 236 160 Q 260 152 286 160 L 352 100 L 372 214" />
            <circle cx="212" cy="252" r="10" fill={INK} />
            <circle cx="306" cy="252" r="10" fill={INK} />
            <path d="M200 300 L 110 286 M200 318 L 112 322 M318 300 L 408 286 M318 318 L 406 322" strokeWidth="6" />
            <path d="M236 326 Q 247 340 259 326 Q 271 340 282 326" strokeWidth="6" />
          </svg>

          {/* guesses, in a row of speech bubbles */}
          <div style={{ position: "absolute", bottom: 72, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 8 }}>
            {RACERS.map((r) => {
              const g = GUESSES[r.key];
              return (
                <div
                  key={r.key}
                  style={{
                    display: "flex",
                    width: 74,
                    height: 40,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 999,
                    background: g.right ? r.color : "#F3EFE8",
                    color: g.right ? "#fff" : "rgba(22,19,15,0.45)",
                    fontSize: 19,
                    fontWeight: g.right ? 800 : 600,
                    textDecoration: g.right ? "none" : "line-through",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {g.right ? `${g.text}!` : g.text}
                </div>
              );
            })}
          </div>

          {/* the field, peeking over the bottom edge */}
          <div style={{ position: "absolute", bottom: -14, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 8 }}>
            {RACERS.map((r) => (
              <div key={r.key} style={{ display: "flex", width: 74, justifyContent: "center" }}>
                <OgCreature k={r.key} size={66} mood={GUESSES[r.key].right ? "happy" : "idle"} />
              </div>
            ))}
          </div>
        </div>

        {/* the stamp */}
        <div
          style={{
            position: "absolute",
            top: 34,
            right: 38,
            width: 138,
            height: 138,
            borderRadius: 999,
            background: "#F2442E",
            border: "7px solid #fff",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            transform: "rotate(-12deg)",
            boxShadow: "0 14px 30px -12px rgba(22,19,15,0.45)",
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 600 }}>got it in</span>
          <span style={{ fontSize: 50, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1 }}>1.1s</span>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
