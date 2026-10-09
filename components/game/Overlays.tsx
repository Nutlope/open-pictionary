"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { IconArrowRight, IconHeartFilled, IconShare2 } from "@tabler/icons-react";
import { RACERS, RACER_BY_KEY, onColor, type RacerKey } from "@/lib/racers";
import { say } from "@/lib/voices";
import { cn } from "@/lib/utils";
import { Creature, type Pulse } from "./Creature";

const spring = { type: "spring", stiffness: 480, damping: 34 } as const;

/* A sun, as a hand would sketch it: a loop that overshoots, then eight rays. */
const GHOST_RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + 0.2;
  const r0 = 50 + (i % 3) * 2;
  const r1 = 70 + ((i * 5) % 7);
  return `M${(100 + Math.cos(a) * r0).toFixed(1)} ${(100 + Math.sin(a) * r0).toFixed(1)} L${(100 + Math.cos(a) * r1).toFixed(1)} ${(100 + Math.sin(a) * r1).toFixed(1)}`;
});

/**
 * The first visit only: a ghost hand sketches a sun and one of the field
 * calls it. Three seconds that explain the whole game, and gone the moment
 * the visitor starts drawing.
 */
function Ghost({ onCall, onDone }: { onCall: () => void; onDone: () => void }) {
  useEffect(() => {
    const a = setTimeout(onCall, 1650);
    const b = setTimeout(onDone, 3300);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [onCall, onDone]);
  return (
    <motion.div key="ghost" initial={{ opacity: 1 }} animate={{ opacity: [1, 1, 0] }} transition={{ duration: 3.3, times: [0, 0.85, 1] }} className="flex flex-col items-center">
      <svg viewBox="0 0 200 200" className="size-40 text-ink/30" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" aria-hidden>
        <motion.path
          d="M139 102 C139 124 121 141 99 140 C77 139 61 121 62 99 C63 78 80 61 101 61 C123 61 139 79 137 104"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.65, ease: "easeInOut" }}
        />
        {GHOST_RAYS.map((d, i) => (
          <motion.path key={i} d={d} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.09, delay: 0.72 + i * 0.09, ease: "easeOut" }} />
        ))}
      </svg>
      <p className="tx-small -mt-2 text-ink-3">You draw. They guess.</p>
    </motion.div>
  );
}

/**
 * The empty paper. The field waits along the bottom edge, and any one of
 * them can be backed with a tap before the first stroke. Never required:
 * drawing straight away is just as good.
 */
export function Lineup({
  pick,
  onPick,
  dozing,
  demo = false,
  onDemoDone,
}: {
  pick: RacerKey | null;
  onPick: (k: RacerKey | null) => void;
  dozing: boolean;
  /** Play the first-visit ghost sketch. */
  demo?: boolean;
  onDemoDone?: () => void;
}) {
  const [line, setLine] = useState<{ k: RacerKey; text: string; n: number } | null>(null);
  const [cheer, setCheer] = useState<{ k: RacerKey; pulse: Pulse } | null>(null);
  const call = useCallback(() => {
    const n = Date.now();
    setLine({ k: "glm-5-3-flash", text: "sun!", n });
    setCheer({ k: "glm-5-3-flash", pulse: { kind: "jump", n } });
    setTimeout(() => setLine((l) => (l?.n === n ? null : l)), 1400);
  }, []);
  const finish = useCallback(() => onDemoDone?.(), [onDemoDone]);
  const choose = (k: RacerKey) => {
    const next = pick === k ? null : k;
    onPick(next);
    if (next) {
      const n = Date.now();
      setLine({ k: next, text: say(next, "picked"), n });
      setTimeout(() => setLine((l) => (l?.n === n ? null : l)), 1600);
    } else setLine(null);
  };
  const backed = pick ? RACER_BY_KEY[pick] : null;

  return (
    <motion.div
      key="lineup"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
    >
      <AnimatePresence mode="wait" initial={false}>
        {demo ? (
          <Ghost key="ghost" onCall={call} onDone={finish} />
        ) : (
          <motion.div key="ask" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="flex flex-col items-center">
            <p className="tx-display text-ink-3">Start drawing</p>
            <p className="tx-small mt-1.5 max-w-[16rem] text-ink-3">The clock starts with your first stroke.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        {/* A creature talking takes the line; the hint steps aside so the two never overlap. */}
        <motion.div className="tx-small mb-1 flex h-6 items-center text-ink-3" animate={{ opacity: line ? 0 : 1 }} transition={{ duration: 0.18 }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={backed?.key ?? "ask"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={spring}
              className="flex items-center gap-1"
            >
              {backed ? (
                <>
                  <IconHeartFilled size={13} style={{ color: backed.color }} />
                  You&apos;re backing <span className="font-semibold text-ink-2">{backed.short}</span>
                </>
              ) : (
                "Who gets it first? Tap to back one"
              )}
            </motion.span>
          </AnimatePresence>
        </motion.div>
        <div className="flex justify-center gap-2 sm:gap-2.5" role="radiogroup" aria-label="Back a model to win">
          {RACERS.map((r, i) => {
            const on = pick === r.key;
            const dim = pick != null && !on;
            return (
              <motion.button
                key={r.key}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`Back ${r.label}`}
                onClick={() => choose(r.key)}
                className="pointer-events-auto relative -mb-3 rounded-full outline-offset-0"
                initial={{ y: 40 }}
                animate={{ y: on ? -10 : 0, opacity: dim ? 0.5 : 1, scale: dim ? 0.92 : 1 }}
                whileHover={{ y: on ? -12 : -6 }}
                whileTap={{ scale: 0.9 }}
                exit={{ y: 40 }}
                transition={{ type: "spring", stiffness: 380, damping: 18, delay: on || dim ? 0 : 0.15 + i * 0.05 }}
              >
                <AnimatePresence>
                  {line?.k === r.key ? (
                    <motion.span
                      key={line.n}
                      initial={{ opacity: 0, scale: 0.4, y: 6 }}
                      animate={{ opacity: 1, scale: 1, y: 0, rotate: -4 }}
                      exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.15 } }}
                      transition={{ type: "spring", stiffness: 620, damping: 22 }}
                      style={{ transformOrigin: "12px 100%" }}
                      className="speech absolute bottom-[calc(100%+22px)] left-1/2 z-10 -ml-3 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[0.75rem] font-semibold text-white"
                    >
                      {line.text}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
                <AnimatePresence>
                  {on ? (
                    <motion.span
                      key="heart"
                      initial={{ scale: 0, y: 8 }}
                      animate={{ scale: 1, y: 0 }}
                      exit={{ scale: 0, y: 8 }}
                      transition={{ type: "spring", stiffness: 600, damping: 16 }}
                      className="absolute -top-4 left-1/2 -ml-[7px] flex"
                      style={{ color: r.color }}
                    >
                      <IconHeartFilled size={14} />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
                <div className={on ? undefined : "idle-bob"} style={{ animationDelay: `${i * -0.5}s` }}>
                  <Creature
                    k={r.key}
                    size={40}
                    mood={on || cheer?.k === r.key ? "happy" : dozing ? "sleepy" : "idle"}
                    pulse={cheer?.k === r.key ? cheer.pulse : null}
                  />
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

/** The stamp, slammed onto the paper, with a ribbon for a moment worth marking. */
export function Stamp({ k, ms, ribbon }: { k: RacerKey; ms: number; ribbon?: string | null }) {
  const racer = RACER_BY_KEY[k];
  return (
    <motion.div
      key="stamp"
      aria-hidden
      initial={{ scale: 2.4, rotate: 18, opacity: 0 }}
      animate={{ scale: 1, rotate: -10, opacity: 1 }}
      exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 520, damping: 22, delay: 0.25 }}
      className="absolute top-4 right-4 z-20 flex flex-col items-center"
    >
      <div
        className="grid size-[92px] place-items-center rounded-full text-center sm:size-[104px]"
        style={{ color: onColor(racer.color), background: racer.color, boxShadow: `0 0 0 4px #fff, 0 0 0 6px ${racer.color}, var(--lift-hi)` }}
      >
        <div>
          <p className="tx-label opacity-90">got it in</p>
          <p className="tx-num text-[1.6rem] leading-none font-extrabold tracking-[-0.04em]">{(ms / 1000).toFixed(1)}s</p>
        </div>
      </div>
      <AnimatePresence>
        {ribbon ? (
          <motion.span
            key={ribbon}
            initial={{ y: -18, opacity: 0, scale: 0.6 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 16, delay: 0.7 }}
            className="ribbon tx-label relative -mt-2 overflow-hidden rounded-full bg-ink px-2.5 py-1 whitespace-nowrap text-white shadow-[var(--lift-hi)]"
          >
            {ribbon}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

export type Primary = { label: string; long?: string; onClick?: () => void; href?: string };

/** The end of a round: who got it, what it meant, and the two things to do next. */
export function ResultBar({
  winner,
  avatar,
  title,
  notes,
  onShare,
  sharing,
  primary,
  tint,
  delay,
}: {
  winner: RacerKey | null;
  /** Stands in for the winner's creature (a human who beat them, say). */
  avatar?: React.ReactNode;
  title: string;
  notes: React.ReactNode[];
  onShare?: () => void;
  sharing?: boolean;
  primary: Primary;
  tint: string;
  delay: number;
}) {
  const body = (
    <>
      <span>
        {primary.label}
        {primary.long ? <span className="hidden sm:inline"> {primary.long}</span> : null}
      </span>
      <IconArrowRight size={17} stroke={2.4} />
    </>
  );
  const cls = "pill h-11 shrink-0 px-4 text-[0.9375rem] font-bold max-sm:flex-1 max-sm:justify-center";
  return (
    <motion.div
      key="result"
      initial={{ y: 30, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 20, opacity: 0, transition: { duration: 0.12 } }}
      transition={{ ...spring, delay }}
      className="absolute inset-x-3 bottom-3 z-20 sm:inset-x-4 sm:bottom-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-[22px] bg-ink p-2.5 pl-3 text-white shadow-[var(--float)] sm:flex-nowrap sm:gap-4 sm:p-3 sm:pl-3.5">
        {avatar ? (
          avatar
        ) : winner ? (
          <Creature k={winner} size={42} mood="happy" />
        ) : (
          <div className="flex -space-x-3">
            {RACERS.slice(0, 3).map((r) => (
              <Creature key={r.key} k={r.key} size={30} mood="sad" />
            ))}
          </div>
        )}
        <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-60px)]">
          <p className="tx-name truncate">{title}</p>
          <p className="tx-small mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-white/60">
            {notes.map((n, i) => (
              <span key={i} className="flex shrink-0 items-center gap-1.5 last:shrink">
                {i > 0 ? <span aria-hidden>·</span> : null}
                {n}
              </span>
            ))}
          </p>
        </div>
        {onShare ? (
          <button
            type="button"
            onClick={onShare}
            disabled={sharing}
            aria-label="Share this round"
            className="pill shrink-0 bg-white/12 px-3 text-white shadow-none hover:bg-white/20 sm:px-3.5"
          >
            {sharing ? (
              <span className="size-[18px] animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
            ) : (
              <IconShare2 size={18} stroke={2} />
            )}
            <span className="max-sm:hidden">Share</span>
          </button>
        ) : null}
        {primary.href ? (
          <Link href={primary.href} className={cls} style={{ background: tint }} autoFocus>
            {body}
          </Link>
        ) : (
          <button type="button" autoFocus onClick={primary.onClick} className={cls} style={{ background: tint }}>
            {body}
          </button>
        )}
      </div>
    </motion.div>
  );
}

/** A small highlight in the result bar: a colored glyph and a few words. */
export function Note({ icon, children, strong }: { icon?: React.ReactNode; children: React.ReactNode; strong?: boolean }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1 truncate", strong && "font-semibold text-white")}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}
