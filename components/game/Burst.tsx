"use client";

import { useMemo } from "react";
import { RACERS } from "@/lib/racers";

/**
 * The win burst: confetti in the winner's color, salted with the rest of the
 * field. CSS only, and skipped entirely under reduced motion.
 */
export function Burst({ seed, color }: { seed: number; color: string }) {
  const flecks = useMemo(() => {
    const palette = [color, color, color, ...RACERS.map((r) => r.color)];
    return Array.from({ length: 46 }, (_, i) => {
      const a = (i / 46) * Math.PI * 2 + ((seed * 13 + i * 7) % 10) / 16;
      const d = 130 + ((seed * 31 + i * 53) % 170);
      return {
        x: Math.cos(a) * d,
        y: Math.sin(a) * d - 50,
        r: ((i * 47) % 300) - 150,
        c: palette[(i * 5 + seed) % palette.length],
        w: i % 4 === 0 ? 12 : 8,
        round: i % 3 === 0,
        delay: (i % 6) * 16,
      };
    });
  }, [seed, color]);

  return (
    <div aria-hidden className="burst pointer-events-none absolute inset-0 z-20 grid place-items-center overflow-visible">
      {flecks.map((f, i) => (
        <span
          key={i}
          className="burst-fleck absolute"
          style={
            {
              width: f.w,
              height: f.round ? f.w : f.w * 0.45,
              borderRadius: f.round ? 999 : 2,
              background: f.c,
              "--x": `${f.x}px`,
              "--y": `${f.y}px`,
              "--r": `${f.r}deg`,
              animationDelay: `${f.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
