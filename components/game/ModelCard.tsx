"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import { RACERS, RACER_BY_KEY, type RacerKey } from "@/lib/racers";
import { VOICES } from "@/lib/voices";
import { fmtSec } from "@/lib/replay";
import { cn } from "@/lib/utils";
import { Creature, type Pulse } from "./Creature";
import { useBoard } from "./live";
import { onSession, readSession } from "./session";
import { useScrollLock } from "./useScrollLock";
import { useWide } from "./useWide";

export type CardTarget = { k: RacerKey; from?: DOMRect } | null;

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "-");

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/55 px-3 py-2.5">
      <p className="tx-num text-[1.375rem] leading-none font-extrabold tracking-[-0.03em]">{value}</p>
      <p className="tx-small mt-1 text-ink-2">{label}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="tx-small shrink-0 text-ink-3">{label}</span>
      <span className="tx-small min-w-0 truncate text-right font-semibold">{children}</span>
    </div>
  );
}

/**
 * A model's card: its character, its record across every player, its habits,
 * and how it has done with you. Opens from wherever the model was tapped.
 */
export function ModelCard({ target, onClose }: { target: CardTarget; onClose: () => void }) {
  const [k, setK] = useState<RacerKey | null>(target?.k ?? null);
  const [dir, setDir] = useState(0);
  const [pulse, setPulse] = useState<Pulse>(null);
  const wide = useWide();
  const { data } = useBoard(!!target);
  const [mine, setMine] = useState<{ rounds: number; wins: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useScrollLock(!!target);

  useEffect(() => {
    if (!target) return;
    setK(target.k);
    setDir(0);
    setPulse((p) => ({ kind: "jump", n: (p?.n ?? 0) + 1 }));
    const t = setTimeout(() => closeRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [target]);

  useEffect(() => {
    if (!k) return;
    const read = () => {
      const s = readSession().rows[k];
      setMine({ rounds: s.rounds, wins: s.wins });
    };
    read();
    return onSession(read);
  }, [k]);

  const step = (d: number) => {
    if (!k) return;
    const i = RACERS.findIndex((r) => r.key === k);
    setDir(d);
    setK(RACERS[(i + d + RACERS.length) % RACERS.length].key);
    setPulse((p) => ({ kind: "hop", n: (p?.n ?? 0) + 1 }));
  };

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const racer = k ? RACER_BY_KEY[k] : null;
  const row = k ? data?.rows.find((r) => r.key === k) : null;
  const voice = k ? VOICES[k] : null;

  // Grow out of whatever was tapped.
  const from = target?.from;
  const origin =
    wide && from && typeof window !== "undefined"
      ? { x: (from.left + from.width / 2 - innerWidth / 2) * 0.6, y: (from.top + from.height / 2 - innerHeight / 2) * 0.6, scale: 0.4 }
      : { x: 0, y: 0, scale: 0.9 };

  return (
    <AnimatePresence>
      {target && racer && voice ? (
        <>
          <motion.button
            key="scrim"
            aria-label="Close"
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default bg-ink/25 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div key="wrap" className={cn("pointer-events-none fixed inset-0 z-50 flex justify-center", wide ? "items-center p-4" : "items-end")}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`${racer.label}'s card`}
              initial={wide ? { opacity: 0, ...origin } : { y: "100%" }}
              animate={wide ? { opacity: 1, x: 0, y: 0, scale: 1 } : { y: 0 }}
              exit={wide ? { opacity: 0, scale: 0.92, transition: { duration: 0.15 } } : { y: "100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className={cn(
                "pointer-events-auto overflow-hidden bg-card shadow-[var(--float)]",
                wide ? "w-[min(400px,100%)] rounded-[28px]" : "w-full rounded-t-[28px] pb-[env(safe-area-inset-bottom)]",
              )}
            >
              <div className="relative px-5 pt-5 pb-4 transition-colors duration-500" style={{ background: racer.room }}>
                <div className="flex items-start gap-4">
                  <Creature k={racer.key} size={68} mood="happy" pulse={pulse} />
                  <div className="min-w-0 flex-1 pt-1">
                    <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                      <motion.div
                        key={racer.key}
                        initial={{ opacity: 0, x: dir * 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: dir * -24 }}
                        transition={{ type: "spring", stiffness: 500, damping: 38 }}
                      >
                        <h2 className="tx-display truncate">{racer.label}</h2>
                        <p className="tx-small mt-0.5 text-ink-2">
                          {voice.vibe} · {racer.lab}
                        </p>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <button ref={closeRef} onClick={onClose} aria-label="Close" className="pill pill-icon pill-ghost -mt-1 -mr-1 shrink-0 bg-white/50">
                    <IconX size={18} stroke={2.2} />
                  </button>
                </div>
                <p className="tx-small mt-3 text-ink-2">{voice.bio}</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Tile value={row ? pct(row.wins, row.rounds) : "-"} label="wins first" />
                  <Tile value={row?.avgSolveMs != null ? fmtSec(row.avgSolveMs) : "-"} label="avg solve" />
                  <Tile value={row?.fastest ? fmtSec(row.fastest.ms) : "-"} label="fastest" />
                </div>
              </div>

              <div className="divide-y divide-line px-5 py-1.5">
                <Row label="Fastest ever">{row?.fastest ? `${row.fastest.w} in ${fmtSec(row.fastest.ms)}` : "no solves yet"}</Row>
                <Row label="Wins most on">{row?.best.length ? row.best.join(", ") : "no wins yet"}</Row>
                <Row label="Can't stop saying">{row?.tic ? `${row.tic.g}, ${row.tic.n} times` : "nothing yet"}</Row>
                {row?.funny ? (
                  <Row label="Best miss today">
                    {row.funny.w} → <span className="marker-strike" style={{ "--c": racer.color } as React.CSSProperties}>{row.funny.g}</span>
                  </Row>
                ) : null}
                <Row label="With you">
                  {mine && mine.rounds
                    ? `won ${mine.wins} of your ${mine.rounds} ${mine.rounds === 1 ? "round" : "rounds"}`
                    : "no rounds together yet"}
                </Row>
              </div>

              <div className="flex items-center justify-between border-t border-line px-3 py-2.5">
                <button type="button" onClick={() => step(-1)} className="pill pill-icon bg-card-2 shadow-none" aria-label="Previous model">
                  <IconChevronLeft size={18} stroke={2.2} />
                </button>
                <span className="tx-small truncate px-3 text-ink-3">{racer.id}</span>
                <button type="button" onClick={() => step(1)} className="pill pill-icon bg-card-2 shadow-none" aria-label="Next model">
                  <IconChevronRight size={18} stroke={2.2} />
                </button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
