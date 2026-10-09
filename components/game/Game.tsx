"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  IconArrowBackUp,
  IconArrowRight,
  IconRefresh,
  IconDice5,
  IconFlag,
  IconShare2,
  IconTrash,
  IconTrophy,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import { RACERS, RACER_BY_KEY, onColor, type RacerKey } from "@/lib/racers";
import { LAST_UPDATED } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { DerbyWordmark, TogetherCredit } from "@/components/Brand";
import { Sketchpad, type SketchpadHandle } from "./Sketchpad";
import { useRace, type Deal, type Lane } from "./useRace";
import { LaneRow } from "./LaneRow";
import { Creature } from "./Creature";
import { Clock } from "./Clock";
import { Burst } from "./Burst";
import { Board } from "./Board";
import { KeyControl, useTogetherKey } from "./KeyControl";
import { onSession, readSession } from "./session";
import { onSoundChange, setSoundOn, soundOn } from "./sound";
import { ShareSheet, type ShareTarget } from "./ShareSheet";
import { packStrokes } from "@/lib/sketch";
import { fmtSec } from "@/lib/replay";

const spring = { type: "spring", stiffness: 480, damping: 34 } as const;

/** Every round gets its own room color. All of them carry ink text at AA or better. */
const ROOMS = ["#FFD84A", "#FF9F5A", "#FF9BC8", "#BBA8FF", "#86C3FF", "#6FE3B0", "#CDEB5A", "#FF8A7A"];
const SAD_ROOM = "#E6E0D6";
const LEVEL = { 1: "easy", 2: "medium", 3: "hard" } as const;

export type Challenge = { id: string; word: string; winner: RacerKey | null; ms: number | null };

/** Difficulty as three dots, not a shouty label. */
function Level({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="tx-label inline-flex items-center gap-1.5 rounded-full bg-white/45 py-1 pr-2.5 pl-2 text-ink-2" title={`${LEVEL[level]} word`}>
      <span className="flex gap-[3px]" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn("size-[6px] rounded-full", i <= level ? "bg-ink" : "bg-ink/20")} />
        ))}
      </span>
      {LEVEL[level]}
    </span>
  );
}

function roomFor(token: string) {
  let h = 0;
  for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) >>> 0;
  return ROOMS[h % ROOMS.length];
}

function setRoom(color: string) {
  document.body.style.setProperty("--room", color);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(soundOn());
    return onSoundChange(() => setOn(soundOn()));
  }, []);
  return (
    <button type="button" className="pill pill-icon" aria-label={on ? "Mute sounds" : "Turn sounds on"} onClick={() => setSoundOn(!on)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={String(on)} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring}>
          {on ? <IconVolume size={18} stroke={2} /> : <IconVolumeOff size={18} stroke={2} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

function useSessionWins(): Record<RacerKey, number> {
  const [w, setW] = useState<Record<RacerKey, number>>({} as Record<RacerKey, number>);
  useEffect(() => {
    const read = () => {
      const s = readSession();
      setW(Object.fromEntries(RACERS.map((r) => [r.key, s.rows[r.key].wins])) as Record<RacerKey, number>);
    };
    read();
    return onSession(read);
  }, []);
  return w;
}

/** Stable order while racing; at the end, solvers rise in the order they solved. */
function ordered(lanes: Lane[], ended: boolean): Lane[] {
  if (!ended) return lanes;
  return [...lanes].sort((a, b) => (a.solvedAt ?? Infinity) - (b.solvedAt ?? Infinity));
}

/** The dealt word, letter by letter. */
function Word({ word }: { word: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.h1 key={word} className="tx-word flex whitespace-pre" aria-label={word} exit={{ opacity: 0, y: -18, transition: { duration: 0.15 } }}>
        {word.split("").map((ch, i) => (
          <motion.span
            key={i}
            aria-hidden
            initial={{ opacity: 0, y: 28, rotate: 8, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, rotate: 0, filter: "blur(0px)" }}
            transition={{ type: "spring", stiffness: 520, damping: 26, delay: i * 0.035 }}
            className="inline-block"
          >
            {ch}
          </motion.span>
        ))}
      </motion.h1>
    </AnimatePresence>
  );
}

export function Game({ initial, challenge: challengeIn }: { initial?: Deal | null; challenge?: Challenge | null }) {
  const pad = useRef<SketchpadHandle>(null);
  const { apiKey } = useTogetherKey();
  const race = useRace({ sketch: pad, apiKey, initial });
  const { phase, deal, lanes, winner } = race;
  const [boardOpen, setBoardOpen] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const wins = useSessionWins();
  const ended = phase === "won" || phase === "over";
  const locked = ended || phase === "loading";
  const winnerLane = winner ? lanes.find((l) => l.key === winner) : null;
  const winnerRacer = winner ? RACER_BY_KEY[winner] : null;
  const solvers = lanes.filter((l) => l.solvedAt != null).length;
  const looks = lanes.reduce((n, l) => n + l.looks, 0);
  const view = useMemo(() => ordered(lanes, ended), [lanes, ended]);

  /* ---------------- a friend's challenge ---------------- */
  const challenge = challengeIn && deal?.word === challengeIn.word ? challengeIn : null;
  useEffect(() => {
    // Keep the address clean once the challenge word is on the table.
    if (challengeIn && location.search) history.replaceState(null, "", "/");
  }, [challengeIn]);
  const beat =
    challenge && phase === "won" && winnerLane?.solvedAt != null
      ? challenge.ms == null
        ? -1
        : challenge.ms - winnerLane.solvedAt
      : null;

  /* ---------------- the room ---------------- */
  // Derived from the round ticket, so the server paints the first room and
  // there is no flash of a default color on load.
  const firstRoom = useRef(initial ? roomFor(initial.token) : ROOMS[0]);
  const room = useRef(firstRoom.current);
  const [flood, setFlood] = useState<{ color: string; x: number; y: number; n: number } | null>(null);

  useEffect(() => {
    if (!deal) return;
    let next = roomFor(deal.token);
    if (next === room.current) next = ROOMS[(ROOMS.indexOf(next) + 1) % ROOMS.length];
    room.current = next;
    setRoom(next);
    setFlood(null);
  }, [deal?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === "won" && winnerRacer) {
      // The winner's color pours out of its creature and fills the room.
      const els = [...document.querySelectorAll(`[data-racer="${winnerRacer.key}"]`)] as HTMLElement[];
      const el = els.find((e) => e.offsetParent !== null);
      const r = el?.getBoundingClientRect();
      setFlood({ color: winnerRacer.room, x: r ? r.left + 40 : innerWidth / 2, y: r ? r.top + r.height / 2 : innerHeight / 2, n: Date.now() });
    } else if (phase === "over" && !winnerRacer) {
      room.current = SAD_ROOM;
      setRoom(SAD_ROOM);
    }
  }, [phase, winnerRacer]);

  useEffect(() => {
    if (phase === "ready") setHasInk(false);
  }, [phase, deal?.token]);

  const onChange = useCallback(() => {
    setHasInk((pad.current?.strokeCount() ?? 0) > 0);
    race.nudge();
  }, [race]);

  /* ---------------- share ---------------- */
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  const share = useCallback(async () => {
    if (!deal || !pad.current || race.startedAt == null) return;
    setSharing(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          round: deal.token,
          strokes: packStrokes(pad.current.strokes(), race.startedAt),
          byok: Boolean(apiKey),
          // The server prefers its own log; this is the fallback when it has none.
          log: lanes.flatMap((l) =>
            l.guesses.filter((g) => g.verdict !== "pending").map((g) => ({ k: l.key, g: g.text, v: g.verdict, t: Math.round(g.at) })),
          ),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: string };
      if (!j.id || !j.url) {
        setToast(j.error ?? "Couldn't make a share link. Try again.");
        return;
      }
      const w = winnerLane ? RACER_BY_KEY[winnerLane.key] : null;
      const text = w
        ? `${w.label} guessed my doodle in ${fmtSec(winnerLane!.solvedAt ?? 0)}. Six AIs were racing. Can you draw it faster?`
        : "Six AI models tried to guess my doodle. None of them got it. Can you make them?";
      setShareTarget({ id: j.id, url: j.url, text, word: deal.word });
    } catch {
      setToast("Couldn't make a share link. Check your connection.");
    } finally {
      setSharing(false);
    }
  }, [deal, race.startedAt, apiKey, winnerLane, lanes]);

  /* ---------------- keys ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // Focused controls handle their own Enter; a second handler here double-fires.
      if ((el && ["INPUT", "TEXTAREA", "BUTTON", "A"].includes(el.tagName)) || boardOpen || shareTarget) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (!locked) pad.current?.undo();
      } else if (e.key === "Enter" && ended) {
        e.preventDefault();
        race.next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ended, locked, race, boardOpen, shareTarget]);

  return (
    <MotionConfig reducedMotion="user">
      <style>{`body{--room:${firstRoom.current}}`}</style>
      <div className="relative isolate flex min-h-dvh flex-col">
        {/* the winner's color, pouring into the room */}
        <AnimatePresence>
          {flood ? (
            <motion.div
              key={flood.n}
              aria-hidden
              className="pointer-events-none fixed inset-0 -z-10"
              style={{ background: flood.color }}
              initial={{ clipPath: `circle(0px at ${flood.x}px ${flood.y}px)` }}
              animate={{ clipPath: `circle(160vmax at ${flood.x}px ${flood.y}px)` }}
              transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1] }}
              onAnimationComplete={() => {
                room.current = flood.color;
                setRoom(flood.color);
              }}
            />
          ) : null}
        </AnimatePresence>

        {/* ---------------- header ---------------- */}
        <header className="relative z-30 mx-auto flex w-full max-w-[1200px] items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
          <DerbyWordmark />
          <nav className="flex items-center gap-2">
            <button type="button" className="pill" onClick={() => setBoardOpen(true)} aria-label="Leaderboard">
              <IconTrophy size={17} stroke={2} />
              <span className="hidden sm:inline">Leaderboard</span>
            </button>
            <SoundToggle />
            <KeyControl className="hidden md:block" />
          </nav>
        </header>

        {/* ---------------- the table ---------------- */}
        <main className="mx-auto grid w-full max-w-[1200px] flex-1 grid-cols-1 content-start gap-x-10 gap-y-4 px-4 pt-4 pb-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_410px] lg:content-center lg:pt-2">
          <section className="flex min-w-0 flex-col items-center lg:items-end">
            <div className="paper-col w-full">
              {/* word and clock */}
              <div className="flex items-end justify-between gap-4 pb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {challenge ? (
                      <span className="tx-label inline-flex items-center gap-1.5 rounded-full bg-ink py-1 pr-3 pl-1 text-white">
                        {challenge.winner ? <Creature k={challenge.winner} size={20} /> : <span className="size-5" />}
                        {challenge.winner && challenge.ms != null
                          ? `A friend's doodle got guessed in ${fmtSec(challenge.ms)}. Beat it.`
                          : "Nobody guessed a friend's doodle. Can you?"}
                      </span>
                    ) : (
                      <>
                        <span className="tx-label text-ink-2">{phase === "loading" ? "Dealing…" : "Your word"}</span>
                        {deal ? <Level level={deal.level} /> : null}
                      </>
                    )}
                  </div>
                  <div className="mt-1.5 min-h-[3.25rem] overflow-hidden pb-1">{deal ? <Word word={deal.word} /> : null}</div>
                </div>
                <div className="shrink-0 pb-1">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {phase === "ready" ? (
                      <motion.button
                        key="skip"
                        type="button"
                        className="pill pill-ghost"
                        onClick={race.skip}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={spring}
                      >
                        <IconDice5 size={17} stroke={2} />
                        New word
                      </motion.button>
                    ) : (
                      <motion.div key="clock" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring}>
                        <Clock startedAt={race.startedAt} endedAt={race.endedAt} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* the paper */}
              <motion.div
                className="paper relative overflow-hidden rounded-[28px] bg-white"
                animate={phase === "won" ? { scale: [1, 0.985, 1] } : { scale: 1 }}
                transition={{ duration: 0.35, delay: 0.32 }}
              >
                <Sketchpad ref={pad} locked={locked} onStrokeStart={race.begin} onChange={onChange} />

                {/* empty paper: the field peeks up from the bottom edge */}
                <AnimatePresence>
                  {phase === "ready" && !hasInk ? (
                    <motion.div
                      key="hint"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
                    >
                      <p className="tx-display text-ink-3">Start drawing</p>
                      <p className="tx-small mt-1.5 max-w-[16rem] text-ink-3">The clock starts with your first stroke. They&apos;re already watching.</p>
                      <div className="absolute inset-x-0 -bottom-3 flex justify-center gap-2.5">
                        {RACERS.map((r, i) => (
                          <motion.div
                            key={r.key}
                            initial={{ y: 40 }}
                            animate={{ y: 0 }}
                            exit={{ y: 40 }}
                            transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.15 + i * 0.05 }}
                          >
                            <div className="idle-bob" style={{ animationDelay: `${i * -0.5}s` }}>
                              <Creature k={r.key} size={38} />
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                {/* the stamp */}
                <AnimatePresence>
                  {phase === "won" && winnerRacer && winnerLane ? (
                    <motion.div
                      key="stamp"
                      aria-hidden
                      initial={{ scale: 2.4, rotate: 18, opacity: 0 }}
                      animate={{ scale: 1, rotate: -10, opacity: 1 }}
                      exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.15 } }}
                      transition={{ type: "spring", stiffness: 520, damping: 22, delay: 0.25 }}
                      className="absolute top-4 right-4 z-20 grid size-[92px] place-items-center rounded-full text-center sm:size-[104px]"
                      style={{ color: onColor(winnerRacer.color), background: winnerRacer.color, boxShadow: `0 0 0 4px #fff, 0 0 0 6px ${winnerRacer.color}, var(--lift-hi)` }}
                    >
                      <div>
                        <p className="tx-label opacity-90">got it in</p>
                        <p className="tx-num text-[1.6rem] leading-none font-extrabold tracking-[-0.04em]">{((winnerLane.solvedAt ?? 0) / 1000).toFixed(1)}s</p>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                {/* the result */}
                <AnimatePresence>
                  {ended ? (
                    <motion.div
                      key="result"
                      initial={{ y: 30, opacity: 0, scale: 0.96 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      exit={{ y: 20, opacity: 0, transition: { duration: 0.12 } }}
                      transition={{ ...spring, delay: phase === "won" ? 0.45 : 0.05 }}
                      className="absolute inset-x-3 bottom-3 z-20 sm:inset-x-4 sm:bottom-4"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-[22px] bg-ink p-2.5 pl-3 text-white shadow-[var(--float)] sm:flex-nowrap sm:gap-4 sm:p-3 sm:pl-3.5">
                        {winnerLane ? (
                          <Creature k={winnerLane.key} size={42} mood="happy" />
                        ) : (
                          <div className="flex -space-x-3">
                            {RACERS.slice(0, 3).map((r) => (
                              <Creature key={r.key} k={r.key} size={30} mood="sad" />
                            ))}
                          </div>
                        )}
                        <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-60px)]">
                          <p className="tx-name truncate">
                            {winnerLane ? `${RACER_BY_KEY[winnerLane.key].short} got it` : `Nobody got ${deal?.word}`}
                          </p>
                          <p className="tx-small mt-0.5 truncate text-white/60">
                            {beat != null ? (
                              <span className="font-semibold text-white">
                                {beat === -1 ? "You did what your friend couldn't" : beat > 0 ? `You beat your friend by ${fmtSec(beat)}` : `${fmtSec(-beat)} short of your friend`}
                              </span>
                            ) : winnerLane ? (
                              solvers > 1 ? `+${solvers - 1} also got it` : "solo win"
                            ) : (
                              "try bolder shapes"
                            )}
                            {" · "}
                            <span className="tx-num">${race.cost.toFixed(3)}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={share}
                          disabled={sharing}
                          aria-label="Share the replay"
                          className="pill shrink-0 bg-white/12 px-3 text-white shadow-none hover:bg-white/20 sm:px-3.5"
                        >
                          {sharing ? (
                            <span className="size-[18px] animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
                          ) : (
                            <IconShare2 size={18} stroke={2} />
                          )}
                          <span className="max-sm:hidden">Share</span>
                        </button>
                        <button
                          type="button"
                          autoFocus
                          onClick={race.next}
                          className="pill h-11 shrink-0 px-4 text-[0.9375rem] font-bold max-sm:flex-1 max-sm:justify-center"
                          style={{ background: winnerRacer?.room ?? "#fff" }}
                        >
                          <span>
                            Next<span className="hidden sm:inline"> word</span>
                          </span>
                          <IconArrowRight size={17} stroke={2.4} />
                        </button>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                {phase === "won" && race.startedAt && winnerRacer ? <Burst seed={Math.round(race.startedAt)} color={winnerRacer.color} /> : null}
              </motion.div>

              {/* tools */}
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button type="button" className="pill pill-ghost" onClick={() => pad.current?.undo()} disabled={locked || !hasInk} title="Undo (⌘Z)">
                    <IconArrowBackUp size={17} stroke={2} />
                    <span className="hidden sm:inline">Undo</span>
                  </button>
                  <button type="button" className="pill pill-ghost" onClick={() => pad.current?.clear()} disabled={locked || !hasInk} aria-label="Clear">
                    <IconTrash size={17} stroke={2} />
                    <span className="hidden sm:inline">Clear</span>
                  </button>
                </div>
                <AnimatePresence mode="popLayout" initial={false}>
                  {phase === "drawing" ? (
                    <motion.button
                      key="giveup"
                      type="button"
                      className="pill pill-ghost"
                      onClick={race.giveUp}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={spring}
                    >
                      <IconFlag size={17} stroke={2} />
                      Give up
                    </motion.button>
                  ) : ended ? (
                    <motion.span key="enter" className="tx-small hidden pr-1 text-ink-2 sm:inline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      Press Enter for the next word
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </section>

          {/* ---------------- the field ---------------- */}
          <aside className="min-w-0 lg:self-center">
            <AnimatePresence>
              {race.error || race.demo ? (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="status"
                  className={cn("tx-small mb-3 rounded-2xl px-4 py-3 font-medium", race.error ? "bg-bad-soft text-bad" : "bg-white/60 text-ink")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span>{race.error ?? "Demo guesses: no Together key is set, so these are canned, not live models. Add a key to race for real."}</span>
                    {race.error && phase === "loading" ? (
                      <button type="button" onClick={race.retry} className="pill h-9 shrink-0 bg-white">
                        <IconRefresh size={16} stroke={2} />
                        Retry
                      </button>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <div className="mb-2.5 hidden items-baseline justify-between px-1 lg:flex">
              <p className="tx-label text-ink-2">The field</p>
              <p className="tx-small text-ink-2">six open models, five labs</p>
            </div>
            <ul className="hidden flex-col gap-2 lg:flex">
              {view.map((l) => (
                <LaneRow key={l.key} lane={l} phase={phase} isWinner={l.key === winner} wins={wins[l.key] ?? 0} />
              ))}
            </ul>
            <ul className="grid grid-cols-2 gap-2 lg:hidden">
              {view.map((l) => (
                <LaneRow key={l.key} lane={l} phase={phase} isWinner={l.key === winner} wins={wins[l.key] ?? 0} compact />
              ))}
            </ul>
          </aside>
        </main>

        {/* ---------------- footer ---------------- */}
        <footer className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pb-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <TogetherCredit />
            <span className="tx-small text-ink-3">Model list and prices checked {LAST_UPDATED}</span>
          </div>
          <KeyControl className="md:hidden" align="left" />
        </footer>

        <Board open={boardOpen} onClose={() => setBoardOpen(false)} />
        <ShareSheet target={shareTarget} onClose={() => setShareTarget(null)} />

        <AnimatePresence>
          {toast ? (
            <motion.div
              key="toast"
              role="status"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, transition: { duration: 0.15 } }}
              transition={spring}
              className="tx-small fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ink px-4 py-2.5 font-semibold text-white shadow-[var(--float)]"
            >
              {toast}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <p className="sr-only" aria-live="polite">
          {phase === "won" && winnerLane
            ? `${RACER_BY_KEY[winnerLane.key].label} guessed ${deal?.word} in ${((winnerLane.solvedAt ?? 0) / 1000).toFixed(1)} seconds.`
            : phase === "over"
              ? `Time is up. Nobody guessed ${deal?.word}.`
              : ""}
        </p>
      </div>
    </MotionConfig>
  );
}
