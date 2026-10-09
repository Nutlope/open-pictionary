/**
 * Shared pieces for the Satori cards: the font, the creatures as plain SVG,
 * and a doodle turned into filled outline paths (perfect-freehand runs fine on
 * the server, so a shared card shows the exact strokes, not an approximation).
 */
import { getStroke } from "perfect-freehand";
import { RACER_BY_KEY, type RacerKey, type Shape } from "@/lib/racers";
import { PEN, SPACE } from "@/lib/sketch";

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

function body(shape: Shape, c: string) {
  switch (shape) {
    case "circle":
      return <circle cx="32" cy="33" r="27" fill={c} />;
    case "square":
      return <rect x="6" y="7" width="52" height="52" rx="15" fill={c} />;
    case "triangle":
      return <path d="M32 10 L57 54 L7 54 Z" fill={c} stroke={c} strokeWidth="9" strokeLinejoin="round" />;
    case "pill":
      return <rect x="3" y="14" width="58" height="38" rx="19" fill={c} />;
    case "drop":
      return <path d="M32 3 C 40 14, 57 28, 57 40 A 25 22 0 0 1 7 40 C 7 28, 24 14, 32 3 Z" fill={c} />;
    case "flower":
      return (
        <g fill={c}>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <circle key={i} cx={32 + Math.cos(a) * 17} cy={33 + Math.sin(a) * 17} r="11" />;
          })}
          <circle cx="32" cy="33" r="19" />
        </g>
      );
  }
}

const EYE_Y: Record<Shape, number> = { circle: 33, square: 33, triangle: 41, pill: 33, drop: 40, flower: 33 };

export function OgCreature({ k, size, mood = "idle" }: { k: RacerKey; size: number; mood?: "idle" | "happy" | "sad" }) {
  const r = RACER_BY_KEY[k];
  const y = EYE_Y[r.shape];
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
export function doodle(strokes: number[][]): { paths: string[]; viewBox: string } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const paths = strokes.map((flat) => {
    const pts: number[][] = [];
    for (let i = 0; i < flat.length; i += 3) {
      pts.push([flat[i], flat[i + 1], 0.5]);
      minX = Math.min(minX, flat[i]);
      maxX = Math.max(maxX, flat[i]);
      minY = Math.min(minY, flat[i + 1]);
      maxY = Math.max(maxY, flat[i + 1]);
    }
    const o = getStroke(pts, { size: PEN, thinning: 0.55, smoothing: 0.55, streamline: 0.45, simulatePressure: true, last: true });
    if (o.length < 2) {
      const [x, y] = pts[0] ?? [0, 0];
      return `M${x - 4} ${y} a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0`;
    }
    let d = `M${o[0][0].toFixed(1)} ${o[0][1].toFixed(1)}`;
    for (let i = 1; i < o.length; i++) {
      const [x0, y0] = o[i];
      const [x1, y1] = o[(i + 1) % o.length];
      d += ` Q${x0.toFixed(1)} ${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`;
    }
    return d + " Z";
  });
  if (!Number.isFinite(minX)) return { paths, viewBox: `0 0 ${SPACE} ${SPACE}` };
  const side = Math.max(maxX - minX, maxY - minY, 300) * 1.22;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { paths, viewBox: `${(cx - side / 2).toFixed(0)} ${(cy - side / 2).toFixed(0)} ${side.toFixed(0)} ${side.toFixed(0)}` };
}
