import { getStroke } from "perfect-freehand";

/**
 * The drawing, as data. Strokes live in a fixed 1000x1000 logical space so the
 * paper can be any size on screen, and the snapshot the models see is cropped
 * to the ink, not to the paper: a small doodle in a corner is still a full,
 * centered image to them.
 */
export const SPACE = 1000;
export const PEN = 9;

export type Point = [number, number, number];
export type Stroke = { points: Point[]; path?: Path2D; done: boolean; /** performance.now() per point */ times?: number[] };

/** Pack strokes for a replay: [x, y, t, ...] per stroke, t in ms from t0. */
export function packStrokes(strokes: Stroke[], t0: number): number[][] {
  return strokes
    .filter((s) => s.points.length)
    .map((s) => {
      const out: number[] = [];
      s.points.forEach(([x, y], i) => {
        out.push(Math.round(x), Math.round(y), Math.max(0, Math.round((s.times?.[i] ?? t0) - t0)));
      });
      return out;
    });
}

/** Unpack a replay stroke, keeping only the points drawn by time t. */
export function strokeAt(flat: number[], t: number): Stroke | null {
  const points: Point[] = [];
  for (let i = 0; i < flat.length; i += 3) {
    if (flat[i + 2] > t) break;
    points.push([flat[i], flat[i + 1], 0.5]);
  }
  if (!points.length) return null;
  return { points, done: points.length * 3 === flat.length };
}

const STROKE_OPTS = {
  size: PEN,
  thinning: 0.55,
  smoothing: 0.55,
  streamline: 0.45,
  simulatePressure: true,
};

function pathFrom(points: Point[], last: boolean): Path2D {
  const outline = getStroke(points, { ...STROKE_OPTS, last });
  const p = new Path2D();
  if (outline.length < 2) {
    const [x, y] = points[0] ?? [0, 0];
    p.arc(x, y, PEN / 2, 0, Math.PI * 2);
    return p;
  }
  p.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    p.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  p.closePath();
  return p;
}

export function strokePath(s: Stroke): Path2D {
  if (s.done && s.path) return s.path;
  const p = pathFrom(s.points, s.done);
  if (s.done) s.path = p;
  return p;
}

export function strokeLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return len + (points.length ? 4 : 0);
}

/** Paint strokes onto a context already scaled to logical space. */
export function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], color: string) {
  ctx.fillStyle = color;
  for (const s of strokes) if (s.points.length) ctx.fill(strokePath(s));
}

/**
 * What the models see: the ink, cropped square with a margin, on white, at a
 * size that keeps every model inside one image tile. Returns null for an empty
 * sheet.
 */
export function snapshot(strokes: Stroke[], size: number): string | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const [x, y] of s.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;

  const w = maxX - minX + PEN;
  const h = maxY - minY + PEN;
  // Never zoom a tiny scribble up so far that its lines turn into slabs.
  const side = Math.max(w, h, 300) * 1.18;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  const k = size / side;
  ctx.setTransform(k, 0, 0, k, size / 2 - cx * k, size / 2 - cy * k);
  paint(ctx, strokes, "#111111");
  return c.toDataURL("image/png");
}
