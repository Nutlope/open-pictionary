/**
 * Shared pieces for the Satori cards: the font, the creatures as plain SVG,
 * and a doodle turned into filled outline paths (perfect-freehand runs fine on
 * the server, so a shared card shows the exact strokes, not an approximation).
 */
import { RACER_BY_KEY, type RacerKey, type Shape } from "@/lib/racers";
import { outlinePaths } from "@/lib/doodle";
import { BODIES } from "@/lib/creatures";

export const INK = "#16130f";

let fontCache: ReturnType<typeof loadFonts> | null = null;

/** Fetched once per server instance; every card after the first renders fast. */
export function ogFonts() {
  fontCache ??= loadFonts().then((f) => {
    if (f.length < 2) fontCache = null;
    return f;
  });
  return fontCache;
}

async function loadFonts() {
  const one = async (weight: number) => {
    try {
      const css = await fetch(`https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@${weight}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko" },
      }).then((r) => r.text());
      const url = css.match(/src: url\((https:\/\/[^)]+)\) format\('(woff|truetype)'\)/)?.[1];
      return url ? await fetch(url).then((r) => r.arrayBuffer()) : null;
    } catch {
      return null;
    }
  };
  const [semi, black] = await Promise.all([one(600), one(800)]);
  return [
    semi && { name: "Bricolage", data: semi, weight: 600 as const, style: "normal" as const },
    black && { name: "Bricolage", data: black, weight: 800 as const, style: "normal" as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 600 | 800; style: "normal" }[];
}

/** Plain elements only: Satori serializes an svg and refuses components inside it. */
function body(shape: Shape, c: string) {
  const b = BODIES[shape];
  return (
    <g fill={c} stroke={b.round ? c : undefined} strokeWidth={b.round} strokeLinejoin="round">
      {b.prims.map((p, i) =>
        "c" in p ? (
          <circle key={i} cx={p.c[0]} cy={p.c[1]} r={p.c[2]} />
        ) : "r" in p ? (
          <rect key={i} x={p.r[0]} y={p.r[1]} width={p.r[2]} height={p.r[3]} rx={p.r[4]} />
        ) : (
          <path key={i} d={p.d} />
        ),
      )}
    </g>
  );
}

export function OgCreature({ k, size, mood = "idle" }: { k: RacerKey; size: number; mood?: "idle" | "happy" | "sad" }) {
  const r = RACER_BY_KEY[k];
  const y = BODIES[r.shape].eyeY;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      {body(r.shape, r.color)}
      {mood === "happy" ? (
        <g stroke={INK} strokeWidth="3.4" strokeLinecap="round" fill="none">
          <path d={`M17 ${y + 1.5} Q 22 ${y - 5} 27 ${y + 1.5}`} />
          <path d={`M37 ${y + 1.5} Q 42 ${y - 5} 47 ${y + 1.5}`} />
        </g>
      ) : (
        <g>
          <ellipse cx="22" cy={y} rx="6.6" ry="7.6" fill="#fff" />
          <ellipse cx="42" cy={y} rx="6.6" ry="7.6" fill="#fff" />
          <circle cx="21" cy={y + (mood === "sad" ? 2.5 : 1)} r="3.6" fill={INK} />
          <circle cx="41" cy={y + (mood === "sad" ? 2.5 : 1)} r="3.6" fill={INK} />
        </g>
      )}
    </svg>
  );
}

/** Filled outline paths for a packed doodle, plus a viewBox cropped to the ink. */
export const doodle = (strokes: number[][]) => outlinePaths(strokes, 3);
