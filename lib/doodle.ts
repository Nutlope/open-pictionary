import { getStroke } from "perfect-freehand";
import { PEN, SPACE } from "@/lib/sketch";

/**
 * A doodle as filled outline paths plus a viewBox cropped to the ink, for SVG
 * thumbnails and the Satori cards. Strokes are flat arrays: [x, y, t, ...]
 * (stride 3) or [x, y, ...] (stride 2).
 */
export function outlinePaths(strokes: number[][], stride: 2 | 3 = 3): { paths: string[]; viewBox: string } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const paths = strokes.map((flat) => {
    const pts: number[][] = [];
    for (let i = 0; i + 1 < flat.length; i += stride) {
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

/** Thin a drawing to at most `max` points, keeping each stroke's ends. Drops time when `xyOnly`. */
export function thinStrokes(strokes: number[][], max: number, xyOnly = false): number[][] {
  const total = strokes.reduce((n, s) => n + s.length / 3, 0);
  const step = Math.max(1, Math.ceil(total / max));
  return strokes.map((s) => {
    const out: number[] = [];
    const n = s.length / 3;
    for (let i = 0; i < n; i++) {
      if (i % step !== 0 && i !== n - 1) continue;
      if (xyOnly) out.push(s[i * 3], s[i * 3 + 1]);
      else out.push(s[i * 3], s[i * 3 + 1], s[i * 3 + 2]);
    }
    return out;
  });
}
