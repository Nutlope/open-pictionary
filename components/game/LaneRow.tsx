"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconCheck } from "@tabler/icons-react";
import { RACER_BY_KEY } from "@/lib/racers";
import { cn } from "@/lib/utils";
import { Creature, type Mood, type Pulse } from "./Creature";
import type { Lane, LaneGuess, Phase } from "./useRace";

const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const spring = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as const;

/** Three dots in a speech bubble, in the creature's own color. */
function Thinking({ color }: { color: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={spring}
      className="flex h-6 items-center gap-[3px] rounded-full px-2"
      style={{ background: `color-mix(in oklab, ${color} 14%, white)` }}
      aria-label="Thinking"
    >
      {[0, 1, 2].map((i) => (
        <span key={i} className="think-dot size-[5px] rounded-full" style={{ background: color, animationDelay: `${i * 130}ms` }} />
      ))}
    </motion.span>
  );
}

/** Derive the creature's mood and its one-shot reactions from the lane. */
function useCreatureState(lane: Lane, phase: Phase): { mood: Mood; pulse: Pulse } {
  const [pulse, setPulse] = useState<Pulse>(null);
  const seen = useRef({ id: 0, verdict: "" });
  const latest = lane.guesses.at(-1);
  const id = latest?.id ?? 0;
  const verdict = latest?.verdict ?? "";
  useEffect(() => {
    const s = seen.current;
    if (!id) {
      seen.current = { id: 0, verdict: "" };
      return;
    }
    if (id !== s.id) {
      seen.current = { id, verdict };
      setPulse((p) => ({ kind: "hop", n: (p?.n ?? 0) + 1 }));
    } else if (verdict !== s.verdict) {
      seen.current = { id, verdict };
      if (verdict === "wrong") setPulse((p) => ({ kind: "shake", n: (p?.n ?? 0) + 1 }));
      if (verdict === "correct") setPulse((p) => ({ kind: "jump", n: (p?.n ?? 0) + 1 }));
    }
  }, [id, verdict]);

  const ended = phase === "won" || phase === "over";
  const mood: Mood =
    lane.solvedAt != null ? "happy" : lane.looking ? "thinking" : ended && lane.guesses.length > 0 ? "sad" : "idle";
  return { mood, pulse };
}

function GuessText({ g, big }: { g: LaneGuess; big?: boolean }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 16, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -14, scale: 0.96, transition: { duration: 0.14 } }}
      transition={spring}
      style={{ transformOrigin: "left center" }}
      className={cn(
        "col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 whitespace-nowrap",
        big ? "tx-guess" : "tx-small font-semibold",
        g.verdict === "wrong" && "is-wrong text-ink-3",
        g.verdict === "close" && "text-close",
        (g.verdict === "correct" || g.verdict === "pending") && "text-ink",
      )}
    >
      <span className="strike truncate">{g.text}</span>
      {g.verdict === "close" && big ? (
        <motion.span
          initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={spring}
          className="tx-label shrink-0 rounded-full bg-close-soft px-2 py-0.5 text-close"
        >
          close
        </motion.span>
      ) : null}
      {g.verdict === "correct" ? (
        <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={spring} className="shrink-0">
          <IconCheck size={big ? 20 : 15} stroke={3} />
        </motion.span>
      ) : null}
    </motion.span>
  );
}

export function LaneRow({
  lane,
  phase,
  isWinner,
  wins,
  compact,
}: {
  lane: Lane;
  phase: Phase;
  isWinner: boolean;
  wins: number;
  compact?: boolean;
}) {
  const racer = RACER_BY_KEY[lane.key];
  const latest = lane.guesses.at(-1);
  const solved = lane.solvedAt != null;
  const ended = phase === "won" || phase === "over";
  const { mood, pulse } = useCreatureState(lane, phase);
  const older = lane.guesses.slice(0, -1).reverse().slice(0, 5);

  return (
    <motion.li
      layout
      transition={spring}
      data-racer={lane.key}
      className={cn(
        "relative list-none rounded-[20px] transition-[background-color,box-shadow,opacity] duration-500 ease-[var(--ease-out)]",
        compact ? "px-2.5 py-2" : "px-3.5 py-3",
      )}
      style={{
        background: solved ? racer.room : "var(--card)",
        boxShadow: isWinner ? "0 0 0 2.5px var(--ink), var(--lift-hi)" : "var(--lift)",
      }}
    >
      <div className="flex items-center gap-3">
        <Creature k={lane.key} size={compact ? 34 : 46} mood={mood} pulse={pulse} crown={isWinner} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={cn("truncate", compact ? "tx-small font-semibold text-ink-2" : "tx-name")}>
              {compact ? racer.short : racer.label}
            </span>
            {!compact ? <span className="tx-small truncate text-ink-3">{racer.lab}</span> : null}
          </div>

          <div className={cn("flex min-w-0 items-center gap-2.5", compact ? "mt-0.5 h-5" : "mt-1 h-[1.6rem]")}>
            {/* stacked in one grid cell so the outgoing and incoming guess can cross */}
            <div className={cn("grid min-w-0 overflow-hidden", compact ? "flex-1" : "max-w-[62%] shrink-0")}>
              <AnimatePresence initial={false} mode="popLayout">
                {latest ? (
                  <GuessText key={latest.id} g={latest} big={!compact} />
                ) : (
                  <motion.span
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={cn("col-start-1 row-start-1 text-ink-4", compact ? "tx-small font-semibold" : "tx-guess")}
                  >
                    {phase === "drawing" ? "watching" : ended ? "no guess" : "ready"}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            {!compact && older.length ? (
              <div className="trail-fade flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                <AnimatePresence initial={false}>
                  {older.map((g) => (
                    <motion.span
                      layout="position"
                      key={g.id}
                      initial={{ opacity: 0, scale: 0.7, x: -6 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={spring}
                      className={cn(
                        "tx-small shrink-0 rounded-full px-2 py-0.5",
                        g.verdict === "close" ? "bg-close-soft text-close" : "bg-card-2 text-ink-3 line-through decoration-1",
                      )}
                    >
                      {g.text}
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 self-start pt-0.5">
          <AnimatePresence mode="popLayout" initial={false}>
            {solved ? (
              <motion.span
                key="time"
                initial={{ opacity: 0, scale: 0.6, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={spring}
                className={cn("tx-num font-bold", compact ? "tx-small" : "tx-name")}
              >
                {fmt(lane.solvedAt!)}
              </motion.span>
            ) : lane.looking ? (
              <Thinking key="think" color={racer.color} />
            ) : lane.out ? (
              <span key="out" className="tx-label text-ink-3">
                offline
              </span>
            ) : lane.note && !compact ? (
              <span key="note" className="tx-label text-ink-3">
                {lane.note === "Took too long" ? "slow" : lane.note === "No answer" ? "stumped" : "retrying"}
              </span>
            ) : null}
          </AnimatePresence>
          {!compact && wins > 0 ? (
            <span className="tx-small tx-num text-ink-3" title="Wins this session">
              {wins} {wins === 1 ? "win" : "wins"}
            </span>
          ) : null}
        </div>
      </div>

    </motion.li>
  );
}
