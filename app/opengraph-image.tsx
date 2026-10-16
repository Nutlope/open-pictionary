/**
 * The link card for the game itself. One question on the left; on the right,
 * a round as it ends: the doodle, and the eight models by their lab logos,
 * the ones that got it with their times and the rest with their misses.
 */
import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { RACERS, type RacerKey } from "@/lib/racers";
import { LAB_LOGO } from "@/lib/logos";
import { INK, ogFonts } from "@/lib/og";
import { GLYPH_PATH } from "@/lib/creatures";

export const alt = `${BRAND.name}: can AI guess your doodle? Eight open models race to find out.`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Who said what. Solvers carry their time; the first one won. */
const ROUND: Record<RacerKey, { g: string; ms?: number }> = {
  "kimi-k3": { g: "cat", ms: 1.1 },
  "deepseek-v4-1-flash": { g: "cat", ms: 1.6 },
  "nemotron-3-5-super": { g: "cat", ms: 2.3 },
  "qwen3-8-flash": { g: "fox" },
  "glm-5-3-flash": { g: "owl" },
  "minimax-m3": { g: "bunny" },
  "muse-glimmer": { g: "tiger" },
  "muse-spark": { g: "lynx" },
};
const ORDER = [...RACERS].sort((a, b) => (ROUND[a.key].ms ?? 99) - (ROUND[b.key].ms ?? 99));

export default async function Image() {
  const fonts = await ogFonts();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#FFD84A", fontFamily: "Bricolage", color: INK }}>
        {/* left: the name and the question */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px 0 66px 64px", width: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em" }}>
            <svg width="44" height="44" viewBox="0 0 32 32" fill="none">
              <path d={GLYPH_PATH} stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="25" cy="13.5" r="4.2" fill="#F2442E" />
              <circle cx="25" cy="13.5" r="1.6" fill={INK} />
            </svg>
            doodle derby
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 104, fontWeight: 800, lineHeight: 0.94, letterSpacing: "-0.055em", whiteSpace: "nowrap" }}>
            <span>Can AI</span>
            <span>guess your</span>
            <span>doodle?</span>
          </div>
        </div>

        {/* right: a round, as it ends */}
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 56,
            width: 500,
            height: 550,
            display: "flex",
            flexDirection: "column",
            background: "#fff",
            borderRadius: 36,
            padding: "22px 22px 18px",
            boxShadow: "0 36px 70px -26px rgba(22,19,15,0.45)",
            transform: "rotate(2deg)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", height: 160 }}>
            <svg width="178" height="160" viewBox="80 80 360 320" fill="none" stroke={INK} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round">
              <path d="M146 214 Q 130 300 170 350 Q 260 420 350 350 Q 392 300 372 214" />
              <path d="M146 214 L 168 100 L 236 160 Q 260 152 286 160 L 352 100 L 372 214" />
              <circle cx="212" cy="252" r="11" fill={INK} />
              <circle cx="306" cy="252" r="11" fill={INK} />
              <path d="M200 300 L 110 286 M200 318 L 112 322 M318 300 L 408 286 M318 318 L 406 322" strokeWidth="7" />
              <path d="M236 326 Q 247 340 259 326 Q 271 340 282 326" strokeWidth="7" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
            {ORDER.map((r, i) => {
              const x = ROUND[r.key];
              const logo = LAB_LOGO[r.key];
              const won = i === 0;
              return (
                <div
                  key={r.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    height: 40,
                    padding: "0 12px 0 6px",
                    borderRadius: 14,
                    background: won ? "#FFF3B8" : "transparent",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: logo.tile,
                      boxShadow: logo.tile === "#ffffff" ? "inset 0 0 0 1.5px rgba(22,19,15,0.1)" : "none",
                    }}
                  >
                    <img src={logo.src} width={22} height={22} alt="" />
                  </div>
                  <span style={{ marginLeft: 12, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", flex: 1 }}>{r.label}</span>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 5,
                      width: 96,
                      fontSize: 22,
                      fontWeight: x.ms != null ? 800 : 600,
                      letterSpacing: "-0.02em",
                      opacity: x.ms != null ? 1 : 0.35,
                      textDecoration: x.ms != null ? "none" : "line-through",
                    }}
                  >
                    {x.g}
                    {x.ms != null ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.5 L6.5 12 L13 4.5" />
                      </svg>
                    ) : null}
                  </span>
                  <span style={{ display: "flex", justifyContent: "flex-end", width: 58, fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", opacity: x.ms == null ? 0 : won ? 1 : 0.45 }}>
                    {x.ms != null ? `${x.ms.toFixed(1)}s` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
