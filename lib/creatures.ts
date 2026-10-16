import type { Shape } from "./racers";

/**
 * The creatures' bodies, as plain geometry in a 64x64 box, so the same seven
 * shapes render as SVG on the page, in the Satori cards, and on the canvas
 * the video clip is drawn on.
 */
export type Prim = { d: string } | { c: [number, number, number] } | { r: [number, number, number, number, number] };
export type Body = { eyeY: number; gap: number; prims: Prim[]; /** A same-color outline that rounds sharp corners. */ round?: number };

const petals: Prim[] = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  return { c: [32 + Math.cos(a) * 17, 33 + Math.sin(a) * 17, 11] as [number, number, number] };
});

/** A plump five-point star; the outline in `round` softens its tips. */
function starPath() {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 15.5 : 27;
    pts.push(`${(32 + Math.cos(a) * r).toFixed(1)} ${(35 + Math.sin(a) * r).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

/** A flat-topped hexagon; `round` takes the points off. */
function hexPath() {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    pts.push(`${(32 + Math.cos(a) * 25).toFixed(1)} ${(33 + Math.sin(a) * 23).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

export const BODIES: Record<Shape, Body> = {
  circle: { eyeY: 33, gap: 10, prims: [{ c: [32, 33, 27] }] },
  square: { eyeY: 33, gap: 10, prims: [{ r: [6, 7, 52, 52, 15] }] },
  triangle: { eyeY: 41, gap: 9, prims: [{ d: "M32 10 L57 54 L7 54 Z" }], round: 9 },
  pill: { eyeY: 33, gap: 11, prims: [{ r: [3, 14, 58, 38, 19] }] },
  drop: { eyeY: 40, gap: 9.5, prims: [{ d: "M32 3 C 40 14, 57 28, 57 40 A 25 22 0 0 1 7 40 C 7 28, 24 14, 32 3 Z" }] },
  flower: { eyeY: 33, gap: 9.5, prims: [...petals, { c: [32, 33, 19] }] },
  star: { eyeY: 36, gap: 9, prims: [{ d: starPath() }], round: 8 },
  hex: { eyeY: 34, gap: 10, prims: [{ d: hexPath() }], round: 10 },
};

/** The doodle derby mark: a scribble loop running out to a finish dot. */
export const GLYPH_PATH = "M3.5 22c2.6-.2 4.6-2 5.6-4.6 1-2.7.2-5.6-2-5.6s-2.6 3.3-.6 5.6c2.6 3 7.2 3 9.8.4 1.6-1.6 2.2-3.8 4-4.6";
export const CROWN_PATH = "M3 19 L1.5 5 L9.5 11 L16 2 L22.5 11 L30.5 5 L29 19 Z";
