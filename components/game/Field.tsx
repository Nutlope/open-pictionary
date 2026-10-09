"use client";

import { AnimatePresence, motion } from "motion/react";
import { RACER_BY_KEY, type RacerKey } from "@/lib/racers";
import type { Cand } from "@/lib/server/funny";
import { cn } from "@/lib/utils";
import { Creature } from "./Creature";
import { LaneRow } from "./LaneRow";
import type { Lane, Phase } from "./useRace";

/** A number that rolls its changed digits up, like a scoreboard. */
export function Ticker({ value, className }: { value: number; className?: string }) {
  const chars = value.toLocaleString("en-US").split("");
  return (
    <span className={cn("tx-num inline-flex overflow-hidden", className)} aria-label={value.toLocaleString("en-US")}>
      {chars.map((c, i) => (
        <span key={chars.length - i} className="relative inline-grid" aria-hidden>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={c}
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
            >
              {c}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

export function FieldHead({ today, note }: { today: number | null; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1">
      <p className="tx-label text-ink-2">The field</p>
      {today ? (
        <p className="tx-small flex items-center gap-1.5 text-ink-2" title="Rounds drawn today, by everyone">
          <span className="live-dot relative size-2 self-center rounded-full bg-[#00A870]" aria-hidden />
          <Ticker value={today} className="font-semibold text-ink" />
          {today === 1 ? "doodle today" : "doodles today"}
        </p>
      ) : (
        <p className="tx-small text-ink-2">{note ?? "one open model from each lab"}</p>
      )}
    </div>
  );
}

export function FieldList({
  lanes,
  phase,
  winner,
  wins,
  pick,
  dozing,
  onOpen,
}: {
  lanes: Lane[];
  phase: Phase;
  winner: RacerKey | null;
  wins?: Partial<Record<RacerKey, number>>;
  pick?: RacerKey | null;
  dozing?: boolean;
  onOpen?: (k: RacerKey, from: DOMRect) => void;
}) {
  const row = (l: Lane, compact?: boolean) => (
    <LaneRow
      key={l.key}
      lane={l}
      phase={phase}
      isWinner={l.key === winner && (phase === "won" || phase === "over")}
      winner={winner}
      wins={wins?.[l.key] ?? 0}
      picked={pick === l.key}
      dozing={dozing}
      onOpen={onOpen}
      compact={compact}
    />
  );
  return (
    <>
      <ul className="hidden flex-col gap-2 lg:flex">{lanes.map((l) => row(l))}</ul>
      <ul className="grid grid-cols-2 gap-2 lg:hidden">{lanes.map((l) => row(l, true))}</ul>
    </>
  );
}

/** The referee's favorite miss of the day, framed like a lane caught in its worst moment. */
export function WrongCard({ wrong, hidden, onOpen }: { wrong: Cand | null; hidden?: boolean; onOpen?: (k: RacerKey, from: DOMRect) => void }) {
  return (
    <AnimatePresence>
      {wrong ? (
        <motion.button
          key={`${wrong.k}|${wrong.g}`}
          type="button"
          onClick={(e) => onOpen?.(wrong.k, e.currentTarget.getBoundingClientRect())}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: hidden ? 0 : 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className={cn(
            "lane-card flex w-full items-center gap-3 rounded-[20px] bg-white/45 py-2 pr-4 pl-2.5 text-left transition-colors hover:bg-white/70",
            hidden && "pointer-events-none",
          )}
          aria-label={`Wrong guess of the day: ${RACER_BY_KEY[wrong.k].label} called a ${wrong.w} a ${wrong.g}`}
        >
          <Creature k={wrong.k} size={34} />
          <span className="min-w-0 flex-1">
            <span className="tx-small block text-ink-3">Wrong guess of the day</span>
            <span className="tx-name flex min-w-0 items-baseline gap-1.5">
              <span className="shrink-0 text-ink-2">{wrong.w}</span>
              <span className="shrink-0 text-ink-3" aria-hidden>
                →
              </span>
              <span className="marker-strike truncate" style={{ "--c": RACER_BY_KEY[wrong.k].color } as React.CSSProperties}>
                {wrong.g}
              </span>
            </span>
          </span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
