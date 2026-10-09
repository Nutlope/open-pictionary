"use client";

import { useEffect, useState } from "react";
import { RULES } from "@/lib/racers";
import { cn } from "@/lib/utils";

const R = 9;
const LEN = 2 * Math.PI * R;

/**
 * The clock as a sticker: a ring that drains on one CSS animation (no React
 * work per frame) and a number that ticks a few times a second. The last ten
 * seconds turn red and breathe.
 */
export function Clock({ startedAt, endedAt }: { startedAt: number | null; endedAt: number | null }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (startedAt == null || endedAt != null) return;
    const id = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(id);
  }, [startedAt, endedAt]);

  const total = RULES.roundSeconds;
  const elapsed = startedAt == null ? 0 : (endedAt ?? now - startedAt) / 1000;
  const left = Math.max(0, Math.ceil(total - elapsed));
  const running = startedAt != null && endedAt == null;
  const urgent = running && left <= 10;

  return (
    <span
      className={cn("pill gap-2 pl-2 pr-3.5", urgent && "clock-urgent")}
      role="timer"
      aria-label={`${left} seconds left`}
      style={{ cursor: "default" }}
    >
      <svg viewBox="0 0 24 24" className="size-6 -rotate-90" aria-hidden>
        <circle cx="12" cy="12" r={R} fill="none" stroke="var(--ink-4)" strokeWidth="3.4" />
        {startedAt != null ? (
          <circle
            key={startedAt}
            cx="12"
            cy="12"
            r={R}
            fill="none"
            stroke={urgent ? "#F2442E" : "var(--ink)"}
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeDasharray={LEN}
            className="clock-ring"
            style={
              {
                "--len": LEN,
                animationDuration: `${total}s`,
                animationPlayState: endedAt != null ? "paused" : "running",
                transition: "stroke 0.3s",
              } as React.CSSProperties
            }
          />
        ) : (
          <circle cx="12" cy="12" r={R} fill="none" stroke="var(--ink)" strokeWidth="3.4" />
        )}
      </svg>
      <span className={cn("tx-num min-w-[3ch] text-[1.0625rem] font-bold", urgent && "text-bad")}>{left}s</span>
    </span>
  );
}
