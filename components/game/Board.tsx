"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconX } from "@tabler/icons-react";
import { RACERS, RACER_BY_KEY, type RacerKey } from "@/lib/racers";
import { cn } from "@/lib/utils";
import { onSession, readSession, resetSession } from "./session";
import { Creature } from "./Creature";
import { useScrollLock } from "./useScrollLock";

type Row = { key: RacerKey; rounds: number; solves: number; wins: number; avgSolveMs: number | null };
type Tab = "everyone" | "you";

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function rank(rows: Row[]) {
  return [...rows].sort(
    (a, b) =>
      pct(b.wins, b.rounds) - pct(a.wins, a.rounds) ||
      pct(b.solves, b.rounds) - pct(a.solves, a.rounds) ||
      (a.avgSolveMs ?? 1e9) - (b.avgSolveMs ?? 1e9),
  );
}

function useSessionRows(): { rounds: number; rows: Row[] } {
  const [s, setS] = useState(() => ({ rounds: 0, rows: [] as Row[] }));
  useEffect(() => {
    const read = () => {
      const x = readSession();
      setS({
        rounds: x.rounds,
        rows: RACERS.map((r) => {
          const v = x.rows[r.key];
          return { key: r.key, rounds: v.rounds, wins: v.wins, solves: v.solves, avgSolveMs: v.solves ? v.solveMs / v.solves : null };
        }),
      });
    };
    read();
    return onSession(read);
  }, []);
  return s;
}

const sheet = { type: "spring", stiffness: 380, damping: 38 } as const;

export function Board({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("everyone");
  const [global, setGlobal] = useState<{ rounds: number; rows: Row[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const session = useSessionRows();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const m = matchMedia("(min-width: 640px)");
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/board", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setGlobal(await r.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const t = setTimeout(() => closeRef.current?.focus(), 80);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, load, onClose]);

  useScrollLock(open);
  const data = tab === "everyone" ? global : session;
  const rows = data ? rank(data.rows) : [];
  const leader = rows[0] && rows[0].wins > 0 ? rows[0] : null;

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            key="scrim"
            aria-label="Close leaderboard"
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default bg-ink/25 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.aside
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Leaderboard"
            initial={wide ? { x: "105%" } : { y: "105%" }}
            animate={wide ? { x: 0 } : { y: 0 }}
            exit={wide ? { x: "105%" } : { y: "105%" }}
            transition={sheet}
            className={cn(
              "fixed z-50 flex flex-col overflow-hidden bg-card shadow-[var(--float)]",
              wide ? "inset-y-3 right-3 w-[440px] rounded-[28px]" : "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[28px]",
            )}
          >
            {/* the leader's color washes the header */}
            <div
              className="relative px-6 pt-6 pb-5 transition-colors duration-700"
              style={{ background: leader ? RACER_BY_KEY[leader.key].room : "var(--card-2)" }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="tx-display">Who reads doodles best</h2>
                  <p className="tx-small mt-1 text-ink-2">Six open models, ranked by how often they guess first.</p>
                </div>
                <button ref={closeRef} onClick={onClose} aria-label="Close" className="pill pill-icon pill-ghost -mt-1 -mr-1 bg-white/50">
                  <IconX size={18} stroke={2.2} />
                </button>
              </div>

              <div role="tablist" className="relative mt-5 grid grid-cols-2 rounded-full bg-white/55 p-1">
                {(["everyone", "you"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={cn("relative z-10 h-9 rounded-full tx-small font-semibold transition-colors", tab === t ? "text-white" : "text-ink-2 hover:text-ink")}
                  >
                    {tab === t ? (
                      <motion.span layoutId="board-tab" className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
                    ) : null}
                    {t === "everyone" ? "All players" : "Your rounds"}
                  </button>
                ))}
              </div>
              <p className="tx-small mt-3 text-ink-2">
                {data ? (
                  <>
                    <span className="tx-num font-bold text-ink">{data.rounds.toLocaleString()}</span> {data.rounds === 1 ? "round" : "rounds"}
                    {tab === "everyone" ? " drawn by everyone" : " in this browser"}
                  </>
                ) : failed ? (
                  "The board is unavailable right now."
                ) : (
                  "Loading…"
                )}
              </p>
            </div>

            <ol className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
              {data && data.rounds === 0 ? (
                <li className="tx-small mx-3 mb-2 rounded-2xl bg-card-2 px-4 py-3 text-ink-2">
                  {tab === "everyone" ? "No rounds on the board yet. Finish one and yours is the first." : "Finish a round and your own standings show up here."}
                </li>
              ) : null}
              {rows.map((r, i) => {
                const racer = RACER_BY_KEY[r.key];
                const win = pct(r.wins, r.rounds);
                return (
                  <motion.li
                    layout
                    key={r.key}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 34, delay: 0.04 * i }}
                    className="flex items-center gap-3.5 rounded-2xl px-3 py-3 transition-colors hover:bg-card-2"
                  >
                    <span className="tx-num tx-small w-4 text-center font-bold text-ink-3">{i + 1}</span>
                    <Creature k={r.key} size={40} mood={i === 0 && r.wins > 0 ? "happy" : "idle"} crown={i === 0 && r.wins > 0} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="tx-name truncate">{racer.label}</span>
                        <span className="tx-num shrink-0 text-[1.25rem] leading-none font-extrabold tracking-[-0.03em]">
                          {r.rounds ? `${win}%` : "-"}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-card-2">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: racer.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(win, r.rounds ? 2 : 0)}%` }}
                          transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.1 + i * 0.05 }}
                        />
                      </div>
                      <div className="tx-small mt-1.5 flex gap-3 text-ink-3">
                        <span>
                          <span className="tx-num font-semibold text-ink-2">{r.wins}</span> {r.wins === 1 ? "win" : "wins"}
                        </span>
                        <span>
                          solved <span className="tx-num font-semibold text-ink-2">{r.rounds ? `${pct(r.solves, r.rounds)}%` : "-"}</span>
                        </span>
                        <span>
                          avg <span className="tx-num font-semibold text-ink-2">{r.avgSolveMs != null ? `${(r.avgSolveMs / 1000).toFixed(1)}s` : "-"}</span>
                        </span>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ol>

            <footer className="border-t border-line px-6 py-4">
              <p className="tx-small text-ink-3">
                Win rate is first correct guess per round. Solved means it got there at all. Time runs from your first stroke.
              </p>
              {tab === "you" && session.rounds > 0 ? (
                <button onClick={resetSession} className="tx-small mt-2 font-semibold underline decoration-ink-4 underline-offset-4 hover:decoration-ink">
                  Reset your rounds
                </button>
              ) : null}
            </footer>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
