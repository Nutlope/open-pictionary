"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconCheck } from "@tabler/icons-react";
import { RACER_BY_KEY, type RacerKey } from "@/lib/racers";
import { say, type Moment } from "@/lib/voices";
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

/** Fires once per change after mount; the state a row mounts with is history, not news. */
function useChange<T>(value: T, fn: (now: T, before: T) => void) {
  const prev = useRef<{ v: T } | null>(null);
  useEffect(() => {
    if (prev.current && !Object.is(prev.current.v, value)) fn(value, prev.current.v);
    prev.current = { v: value };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

/** Derive the creature's mood and its one-shot reactions from the lane. */
function useCreatureState(lane: Lane, phase: Phase, dozing: boolean): { mood: Mood; pulse: Pulse } {
  const [pulse, setPulse] = useState<Pulse>(null);
  const latest = lane.guesses.at(-1);
  const bump = (kind: NonNullable<Pulse>["kind"]) => setPulse((p) => ({ kind, n: (p?.n ?? 0) + 1 }));
  useChange(latest?.id ?? 0, (id) => id && bump("hop"));
  useChange(`${latest?.id}:${latest?.verdict}`, () => {
    if (latest?.verdict === "wrong") bump("shake");
    if (latest?.verdict === "correct") bump("jump");
  });
  useChange(dozing, (now) => !now && bump("hop"));

  const ended = phase === "won" || phase === "over";
  const mood: Mood =
    lane.solvedAt != null
      ? "happy"
      : lane.looking
        ? "thinking"
        : ended && lane.guesses.length > 0
          ? "sad"
          : dozing
            ? "sleepy"
            : "idle";
  return { mood, pulse };
}

/* ------------------------------------------------------------------
   Voices. A shared budget keeps the field from talking over itself:
   small remarks wait their turn, wins and picks always get a word in.
   ------------------------------------------------------------------ */
let talking = 0;
const HOLD: Partial<Record<Moment, number>> = { win: 2600 };
const LOUD = new Set<Moment>(["win"]);

function useVoice(lane: Lane, phase: Phase, winner: RacerKey | null, dozing: boolean) {
  const [line, setLine] = useState<{ text: string; n: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const speaking = useRef(false);

  const speak = (m: Moment, chance = 1, delay = 0) => {
    if (Math.random() > chance) return;
    timers.current.push(
      setTimeout(() => {
        if (!LOUD.has(m) && talking >= 2) return;
        if (!speaking.current) talking++;
        speaking.current = true;
        setLine({ text: say(lane.key, m), n: Date.now() });
        timers.current.push(
          setTimeout(() => {
            if (speaking.current) talking--;
            speaking.current = false;
            setLine(null);
          }, HOLD[m] ?? 1500),
        );
      }, delay),
    );
  };

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      if (speaking.current) talking--;
      speaking.current = false;
    },
    [],
  );

  const latest = lane.guesses.at(-1);
  useChange(`${latest?.id}:${latest?.verdict}`, () => {
    if (!latest) return;
    if (latest.verdict === "wrong") speak("wrong", 0.2, 350);
    else if (latest.verdict === "close") speak("close", 0.7, 200);
    else if (latest.verdict === "correct") {
      if (winner === lane.key) speak("win", 1, 250);
      else speak("also", 0.6, 300);
    }
  });
  const ended = phase === "won" || phase === "over";
  useChange(ended, (now) => {
    if (!now || lane.solvedAt != null || lane.guesses.length === 0) return;
    if (winner) speak("lose", 0.45, 900 + Math.random() * 500);
    else speak("stumped", 0.4, 300 + Math.random() * 700);
  });
  useChange(dozing, (now) => {
    if (now) speak("doze", 0.35, Math.random() * 1500);
  });
  // A new round clears whatever was left in the air.
  useChange(phase === "ready", (now) => {
    if (!now) return;
    timers.current.forEach(clearTimeout);
    if (speaking.current) talking--;
    speaking.current = false;
    setLine(null);
  });
  return line;
}

function Bubble({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.4, y: 6, rotate: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0, rotate: -3 }}
      exit={{ opacity: 0, scale: 0.7, y: -4, transition: { duration: 0.16 } }}
      transition={{ type: "spring", stiffness: 620, damping: 22 }}
      style={{ transformOrigin: "12px 100%" }}
      className={cn(
        "speech pointer-events-none absolute z-10 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 font-semibold text-white shadow-[var(--lift-hi)]",
        compact ? "bottom-[calc(100%-6px)] left-2 text-[0.75rem]" : "bottom-[calc(100%-8px)] left-5 text-[0.8125rem]",
      )}
    >
      {text}
    </motion.span>
  );
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
  dozing = false,
  winner = null,
  onOpen,
}: {
  lane: Lane;
  phase: Phase;
  isWinner: boolean;
  wins: number;
  compact?: boolean;
  dozing?: boolean;
  winner?: RacerKey | null;
  /** Open this model's card. */
  onOpen?: (k: RacerKey, from: DOMRect) => void;
}) {
  const racer = RACER_BY_KEY[lane.key];
  const latest = lane.guesses.at(-1);
  const solved = lane.solvedAt != null;
  const ended = phase === "won" || phase === "over";
  const { mood, pulse } = useCreatureState(lane, phase, dozing);
  const line = useVoice(lane, phase, winner, dozing);
  const older = lane.guesses.slice(0, -1).reverse().slice(0, 5);

  return (
    <motion.li
      layout
      transition={spring}
      data-racer={lane.key}
      className="relative list-none"
      style={{ zIndex: line ? 5 : undefined }}
    >
      <AnimatePresence>{line ? <Bubble key={line.n} text={line.text} compact={compact} /> : null}</AnimatePresence>
      <button
        type="button"
        onClick={(e) => onOpen?.(lane.key, e.currentTarget.getBoundingClientRect())}
        disabled={!onOpen}
        aria-label={`${racer.label}: open its card`}
        className={cn(
          "lane-card relative block w-full rounded-[20px] text-left transition-[background-color,box-shadow,transform] duration-500 ease-[var(--ease-out)] disabled:cursor-default",
          compact ? "px-2.5 py-2" : "px-3.5 py-2.5",
        )}
        style={{
          background: solved ? racer.room : "var(--card)",
          boxShadow: isWinner ? "0 0 0 2.5px var(--ink), var(--lift-hi)" : "var(--lift)",
        }}
      >
        <div className={cn("flex items-center", compact ? "gap-2" : "gap-3")}>
          <Creature k={lane.key} size={compact ? 34 : 46} mood={mood} pulse={pulse} crown={isWinner} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
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
                      {phase === "drawing" ? "watching" : ended ? "no guess" : dozing ? "dozing" : "ready"}
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
      </button>
    </motion.li>
  );
}
