"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { IconDice5, IconFlameFilled, IconLock, IconX } from "@tabler/icons-react";
import { RACERS, RACER_BY_KEY, type RacerKey } from "@/lib/racers";
import { fmtSec } from "@/lib/replay";
import { cn } from "@/lib/utils";
import { onSession, readSession, resetSession } from "./session";
import { Creature } from "./Creature";
import { Thumb } from "./Thumb";
import { useBoard, type DailyBoard } from "./live";
import { liveDailyStreak, rerollName, resetStats, useMe, type Me } from "./me";
import { useScrollLock } from "./useScrollLock";
import { useWide } from "./useWide";

export type Tab = "today" | "models" | "you";
type Row = { key: RacerKey; rounds: number; solves: number; wins: number; avgSolveMs: number | null };

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "models", label: "Models" },
  { id: "you", label: "You" },
];

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

/* ---------------- the models, ranked ---------------- */

function ModelRows({ rows, onOpen }: { rows: Row[]; onOpen: (k: RacerKey, from: DOMRect) => void }) {
  const ranked = rank(rows);
  return (
    <ol className="px-3 py-2">
      {ranked.map((r, i) => {
        const racer = RACER_BY_KEY[r.key];
        const win = pct(r.wins, r.rounds);
        const lead = i === 0 && r.wins > 0;
        return (
          <motion.li
            layout
            key={r.key}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 34, delay: 0.04 * i }}
          >
            <button
              type="button"
              onClick={(e) => onOpen(r.key, e.currentTarget.getBoundingClientRect())}
              className="flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-card-2"
            >
              <span className="tx-num tx-small w-4 text-center font-bold text-ink-3">{i + 1}</span>
              <Creature k={r.key} size={40} mood={lead ? "happy" : "idle"} crown={lead} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="tx-name truncate">{racer.label}</span>
                  <span className="tx-num shrink-0 text-[1.25rem] leading-none font-extrabold tracking-[-0.03em]">{r.rounds ? `${win}%` : "-"}</span>
                </span>
                <span className="mt-2 block h-2 overflow-hidden rounded-full bg-card-2">
                  <motion.span
                    className="block h-full rounded-full"
                    style={{ background: racer.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(win, r.rounds ? 2 : 0)}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.1 + i * 0.05 }}
                  />
                </span>
                <span className="tx-small mt-1.5 flex gap-3 text-ink-3">
                  <span>
                    <span className="tx-num font-semibold text-ink-2">{r.wins}</span> {r.wins === 1 ? "win" : "wins"}
                  </span>
                  <span>
                    solved <span className="tx-num font-semibold text-ink-2">{r.rounds ? `${pct(r.solves, r.rounds)}%` : "-"}</span>
                  </span>
                  <span>
                    avg <span className="tx-num font-semibold text-ink-2">{r.avgSolveMs != null ? fmtSec(r.avgSolveMs) : "-"}</span>
                  </span>
                </span>
              </span>
            </button>
          </motion.li>
        );
      })}
    </ol>
  );
}

/* ---------------- today's daily ---------------- */

function DailyTab({ d, me, onClose }: { d: number; me: Me | null; onClose: () => void }) {
  const onDaily = usePathname() === "/daily";
  const mine = me?.daily.days[d];
  const [data, setData] = useState<DailyBoard | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/daily?d=${d}${mine?.entry ? `&me=${mine.entry}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: DailyBoard) => live && setData(j))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [d, mine?.entry]);

  const played = !!mine;
  const meInTop = mine?.entry ? data?.top.some((e) => e.id === mine.entry) : false;

  const empty = data != null && data.top.length === 0;
  const drawIt = onDaily ? (
    <button type="button" onClick={onClose} className="pill pill-ink h-9 shrink-0">
      Draw it
    </button>
  ) : (
    <Link href="/daily" className="pill pill-ink h-9 shrink-0">
      Draw it
    </Link>
  );

  return (
    <div className="px-3 py-2">
      {!played && data && !empty ? (
        <div className="mx-1 mb-2 flex items-center gap-3 rounded-2xl bg-card-2 py-3 pr-3 pl-4">
          <IconLock size={18} stroke={2} className="shrink-0 text-ink-3" />
          <p className="tx-small flex-1 text-ink-2">Draw today&apos;s word first. The doodles below give it away.</p>
          {drawIt}
        </div>
      ) : null}
      {empty ? (
        <div className="mx-1 flex items-center gap-3 rounded-2xl bg-card-2 py-3 pr-3 pl-4">
          <p className="tx-small flex-1 text-ink-2">
            {played
              ? "No doodle has been guessed yet today."
              : data.players
                ? "Nobody's doodle got guessed yet today. Yours could top the board."
                : "Nobody has drawn today's word yet. Be the first on the board."}
          </p>
          {!played ? drawIt : null}
        </div>
      ) : null}
      {!data && !failed ? <p className="tx-small mx-1 px-3 py-3 text-ink-3">Loading…</p> : null}
      {failed && !data ? <p className="tx-small mx-1 px-3 py-3 text-ink-2">The daily board is unavailable right now.</p> : null}
      <ol>
        {data?.top.map((e, i) => {
          const isMe = e.id === mine?.entry;
          const racer = e.k ? RACER_BY_KEY[e.k] : null;
          return (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 34, delay: 0.035 * i }}
              className={cn("flex items-center gap-3 rounded-2xl px-3 py-2", isMe && "bg-[#FFF3B8]")}
            >
              <span className="tx-num tx-small w-5 text-center font-bold text-ink-3">{i + 1}</span>
              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-[var(--lift)]">
                <Thumb strokes={e.pts} className={cn("size-10 text-ink transition-[filter]", !played && "blur-[5px]")} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="tx-name block truncate">
                  {e.name}
                  {isMe ? <span className="tx-small ml-1.5 font-semibold text-ink-3">you</span> : null}
                </span>
                <span className="tx-small flex items-center gap-1 text-ink-3">
                  {racer ? <Creature k={racer.key} size={16} mood="happy" /> : null}
                  {racer ? `${racer.short} got it` : ""}
                </span>
              </span>
              <span className="tx-num shrink-0 text-[1.125rem] font-extrabold tracking-[-0.03em]">{e.ms != null ? fmtSec(e.ms) : "-"}</span>
            </motion.li>
          );
        })}
      </ol>
      {mine && data && !meInTop ? (
        <div className="mx-1 mt-2 flex items-center gap-3 rounded-2xl bg-[#FFF3B8] px-3 py-2.5">
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-[var(--lift)]">
            <Thumb strokes={mine.strokes} stride={3} className="size-10 text-ink" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="tx-name block truncate">{me?.name} (you)</span>
            <span className="tx-small text-ink-2">
              {mine.ms == null
                ? "nobody got yours today"
                : data.me?.rank
                  ? `#${data.me.rank} of ${data.players}`
                  : mine.rank
                    ? `#${mine.rank} of ${mine.of ?? data.players}`
                    : "on the board"}
            </span>
          </span>
          <span className="tx-num shrink-0 text-[1.125rem] font-extrabold tracking-[-0.03em]">{mine.ms != null ? fmtSec(mine.ms) : "-"}</span>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- you ---------------- */

function Stat({ value, label, icon }: { value: string; label: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card-2 px-3 py-2.5">
      <p className="tx-num flex items-center gap-1 text-[1.375rem] leading-none font-extrabold tracking-[-0.03em]">
        {icon}
        {value}
      </p>
      <p className="tx-small mt-1 truncate text-ink-2">{label}</p>
    </div>
  );
}

function YouTab({ me, d, onOpen }: { me: Me | null; d: number; onOpen: (k: RacerKey, from: DOMRect) => void }) {
  const session = useSessionRows();
  if (!me) return null;
  const daily = liveDailyStreak(me, d);
  return (
    <div className="px-3 py-2">
      <div className="grid grid-cols-3 gap-2 px-1">
        <Stat value={me.best ? fmtSec(me.best.ms) : "-"} label={me.best ? `best · ${me.best.word}` : "best time"} />
        <Stat value={String(me.streak)} label="in a row now" icon={me.streak > 1 ? <IconFlameFilled size={18} className="text-[#F2442E]" /> : null} />
        <Stat value={String(me.bestStreak)} label="longest run" />
        <Stat value={String(me.rounds)} label={me.rounds === 1 ? "round" : "rounds"} />
        <Stat value={me.rounds ? `${pct(me.solved, me.rounds)}%` : "-"} label="got guessed" />
        <Stat value={String(Object.keys(me.daily.days).length)} label={Object.keys(me.daily.days).length === 1 ? "daily drawn" : "dailies drawn"} />
      </div>
      <p className="tx-small mx-1 mt-3 rounded-2xl bg-card-2 px-4 py-3 text-ink-2">
        {daily > 0 ? (
          <>
            Daily streak <span className="tx-num font-bold text-ink">{daily}</span> {daily === 1 ? "day" : "days"}
            {me.daily.best > daily ? `, best ${me.daily.best}` : ""}. Come back tomorrow to keep it.
          </>
        ) : me.daily.best > 0 ? (
          `Your daily streak ended. Best was ${me.daily.best} ${me.daily.best === 1 ? "day" : "days"}.`
        ) : (
          "Draw the daily word on consecutive days to build a streak."
        )}
      </p>
      <p className="tx-label mt-4 px-2 text-ink-2">Who reads your doodles best</p>
      {session.rounds === 0 ? (
        <p className="tx-small mx-1 mt-2 rounded-2xl bg-card-2 px-4 py-3 text-ink-2">Finish a round and your own standings show up here.</p>
      ) : (
        <div className="-mx-3">
          <ModelRows rows={session.rows} onOpen={onOpen} />
        </div>
      )}
    </div>
  );
}

/** Wiping a streak takes two taps: the first one asks. */
function ResetStats() {
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!sure) return;
    const t = setTimeout(() => setSure(false), 4000);
    return () => clearTimeout(t);
  }, [sure]);
  return (
    <div className="flex h-6 items-center gap-3">
      <AnimatePresence mode="popLayout" initial={false}>
        {sure ? (
          <motion.span key="sure" className="flex items-center gap-3" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            <span className="tx-small text-ink-2">Clear your streaks and bests?</span>
            <button
              type="button"
              onClick={() => {
                resetSession();
                resetStats();
                setSure(false);
              }}
              className="tx-small font-semibold text-bad underline decoration-bad/30 underline-offset-4 hover:decoration-bad"
            >
              Clear
            </button>
            <button type="button" onClick={() => setSure(false)} className="tx-small font-semibold text-ink-2 hover:text-ink">
              Keep
            </button>
          </motion.span>
        ) : (
          <motion.button
            key="ask"
            type="button"
            onClick={() => setSure(true)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="tx-small font-semibold underline decoration-ink-4 underline-offset-4 hover:decoration-ink"
          >
            Reset your stats
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

const sheet = { type: "spring", stiffness: 380, damping: 38 } as const;

export function Board({
  open,
  d,
  onClose,
  onOpenModel,
}: {
  /** The tab to open on, or null when closed. */
  open: Tab | null;
  d: number;
  onClose: () => void;
  onOpenModel: (k: RacerKey, from: DOMRect) => void;
}) {
  const [tab, setTab] = useState<Tab>("today");
  const { data: global, failed } = useBoard(open === "models" || (!!open && tab === "models"));
  const me = useMe();
  const closeRef = useRef<HTMLButtonElement>(null);
  const wide = useWide();
  useScrollLock(!!open);

  useEffect(() => {
    if (!open) return;
    setTab(open);
    const t = setTimeout(() => closeRef.current?.focus(), 80);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const leader = global ? rank(global.rows)[0] : null;
  const head = {
    today: { title: `Daily doodle #${d}`, sub: "Everyone draws the same word. Fastest guessed doodles on top.", wash: "#FFD84A" },
    models: {
      title: "Who reads doodles best",
      sub: "Eight open models, ranked by how often they guess first. Tap one for its card.",
      wash: leader && leader.wins > 0 ? RACER_BY_KEY[leader.key].room : "var(--card-2)",
    },
    you: { title: me?.name ?? "You", sub: "Your streaks and bests, kept in this browser.", wash: "#BBA8FF" },
  }[tab];

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
              wide ? "inset-y-3 right-3 w-[440px] rounded-[28px]" : "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-[28px]",
            )}
          >
            <div className="relative px-6 pt-6 pb-5 transition-colors duration-700" style={{ background: head.wash }}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                      <h2 className="tx-display flex items-center gap-2 truncate">
                        {head.title}
                        {tab === "you" && me ? (
                          <button
                            type="button"
                            onClick={rerollName}
                            className="grid size-8 shrink-0 place-items-center rounded-full bg-white/50 transition-transform hover:rotate-90 active:scale-90"
                            aria-label="New name"
                            title="New name for the daily board"
                          >
                            <IconDice5 size={17} stroke={2} />
                          </button>
                        ) : null}
                      </h2>
                      <p className="tx-small mt-1 text-ink-2">{head.sub}</p>
                    </motion.div>
                  </AnimatePresence>
                </div>
                <button ref={closeRef} onClick={onClose} aria-label="Close" className="pill pill-icon pill-ghost -mt-1 -mr-1 shrink-0 bg-white/50">
                  <IconX size={18} stroke={2.2} />
                </button>
              </div>

              <div role="tablist" className="relative mt-5 grid grid-cols-3 rounded-full bg-white/55 p-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                    className={cn("relative z-10 h-9 rounded-full tx-small font-semibold transition-colors", tab === t.id ? "text-white" : "text-ink-2 hover:text-ink")}
                  >
                    {tab === t.id ? (
                      <motion.span layoutId="board-tab" className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
                    ) : null}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain">
              {tab === "today" ? (
                <DailyTab d={d} me={me} onClose={onClose} />
              ) : tab === "models" ? (
                <>
                  <p className="tx-small px-6 pt-4 text-ink-2">
                    {global ? (
                      <>
                        <span className="tx-num font-bold text-ink">{global.rounds.toLocaleString()}</span> {global.rounds === 1 ? "round" : "rounds"} drawn by everyone
                      </>
                    ) : failed ? (
                      "The board is unavailable right now."
                    ) : (
                      "Loading…"
                    )}
                  </p>
                  {global && global.rounds === 0 ? (
                    <p className="tx-small mx-6 mt-2 rounded-2xl bg-card-2 px-4 py-3 text-ink-2">No rounds on the board yet. Finish one and yours is the first.</p>
                  ) : null}
                  {global ? <ModelRows rows={global.rows} onOpen={onOpenModel} /> : null}
                </>
              ) : (
                <YouTab me={me} d={d} onOpen={onOpenModel} />
              )}
            </div>

            <footer className="border-t border-line px-6 py-4">
              {tab === "you" ? (
                <ResetStats />
              ) : tab === "today" ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="tx-small text-ink-3">
                    You show up as <span className="font-semibold text-ink-2">{me?.name}</span>
                  </p>
                  <button type="button" onClick={rerollName} className="tx-small flex shrink-0 items-center gap-1 font-semibold text-ink-2 hover:text-ink">
                    <IconDice5 size={15} stroke={2} />
                    New name
                  </button>
                </div>
              ) : (
                <p className="tx-small text-ink-3">Win rate is first correct guess per round. Solved means it got there at all. Time runs from your first stroke.</p>
              )}
            </footer>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
