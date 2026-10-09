import { ImageResponse } from "next/og";
import { getShare } from "@/lib/server/share";
import { RACERS, RACER_BY_KEY, onColor } from "@/lib/racers";
import { fmtSec } from "@/lib/replay";
import { INK, OgCreature, doodle, ogFonts } from "@/lib/og";

export const alt = "A doodle six AI models raced to guess";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The card a replay link unfurls with. The word stays off the card: the
 * doodle is the question, and the link is where the answer is.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [doc, fonts] = await Promise.all([getShare(id), ogFonts()]);
  const winner = doc?.winner ? RACER_BY_KEY[doc.winner] : null;
  const room = winner?.room ?? "#E6E0D6";
  const { paths, viewBox } = doodle(doc?.strokes ?? []);
  const solvedBy = new Map<string, number>();
  for (const e of doc?.log ?? []) if (e.v === "correct" && !solvedBy.has(e.k)) solvedBy.set(e.k, e.t);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: room, padding: 50, gap: 50, fontFamily: "Bricolage", color: INK }}>
        <div style={{ display: "flex", position: "relative", width: 530, height: 530 }}>
          <div
            style={{
              display: "flex",
              width: 530,
              height: 530,
              background: "#fff",
              borderRadius: 40,
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 30px 60px -24px rgba(22,19,15,0.4)",
            }}
          >
            <svg width="470" height="470" viewBox={viewBox}>
              {paths.map((d, i) => (
                <path key={i} d={d} fill={INK} />
              ))}
            </svg>
          </div>
          {winner && doc?.winMs != null ? (
            <div
              style={{
                position: "absolute",
                top: -14,
                right: -26,
                width: 150,
                height: 150,
                borderRadius: 999,
                background: winner.color,
                border: "7px solid #fff",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: onColor(winner.color),
                transform: "rotate(-10deg)",
              }}
            >
              <span style={{ fontSize: 21, fontWeight: 600 }}>got it in</span>
              <span style={{ fontSize: 54, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1 }}>{fmtSec(doc.winMs)}</span>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, paddingTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 30, fontWeight: 800, letterSpacing: "-0.04em" }}>
            <svg width="38" height="38" viewBox="0 0 32 32" fill="none">
              <path d="M3.5 22c2.6-.2 4.6-2 5.6-4.6 1-2.7.2-5.6-2-5.6s-2.6 3.3-.6 5.6c2.6 3 7.2 3 9.8.4 1.6-1.6 2.2-3.8 4-4.6" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="25" cy="13.5" r="4.2" fill="#F2442E" />
              <circle cx="25" cy="13.5" r="1.6" fill={INK} />
            </svg>
            doodle derby
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", fontSize: 62, fontWeight: 800, lineHeight: 0.98, letterSpacing: "-0.045em" }}>
              {winner && doc?.winMs != null ? `${winner.label} guessed my doodle in ${fmtSec(doc.winMs)}` : "Six AIs tried to guess my doodle. None did."}
            </div>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 600, opacity: 0.7, letterSpacing: "-0.02em" }}>
              {winner ? "Watch the race, then beat my time." : "Watch them flail, then try it yourself."}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {RACERS.map((r) => {
              const t = solvedBy.get(r.key);
              return (
                <div
                  key={r.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    background: "rgba(255,255,255,0.55)",
                    borderRadius: 18,
                    padding: "10px 0 8px",
                    width: 80,
                  }}
                >
                  <OgCreature k={r.key} size={42} mood={t != null ? "happy" : "sad"} />
                  <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", opacity: t != null ? 1 : 0.35 }}>
                    {t != null ? fmtSec(t) : "missed"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
      // A shared round never changes, so its card can be cached forever.
      headers: doc ? { "Cache-Control": "public, max-age=31536000, immutable" } : { "Cache-Control": "no-store" },
    },
  );
}
