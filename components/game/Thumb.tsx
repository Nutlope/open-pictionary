import { useMemo } from "react";
import { outlinePaths } from "@/lib/doodle";

/** A doodle as a tiny SVG, cropped to its ink. Strokes are [x, y, ...] or [x, y, t, ...]. */
export function Thumb({ strokes, stride = 2, className }: { strokes: number[][]; stride?: 2 | 3; className?: string }) {
  const { paths, viewBox } = useMemo(() => outlinePaths(strokes, stride), [strokes, stride]);
  return (
    <svg viewBox={viewBox} className={className} aria-hidden>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="currentColor" />
      ))}
    </svg>
  );
}
