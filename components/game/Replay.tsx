"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { IconArrowRight, IconPlayerPlay, IconRotateClockwise } from "@tabler/icons-react";
import { RACERS, RACER_BY_KEY, onColor } from "@/lib/racers";
import { SPACE, paint, strokeAt, type Stroke } from "@/lib/sketch";
import { fmtSec, type Replay as ReplayDoc } from "@/lib/replay";
import { DerbyWordmark, TogetherCredit } from "@/components/Brand";
import { LaneRow } from "./LaneRow";
import { Creature, lookAt } from "./Creature";
import { Burst } from "./Burst";
import type { Lane, Phase } from "./useRace";

const spring = { type: "spring", stiffness: 480, damping: 34 } as const;

/**
 * A shared round, replayed in real time: the strokes come back at the speed
 * they were drawn, the creatures' eyes follow the replayed pen, and every
 * guess lands when it really landed. The word stays hidden as blanks until a
 * model gets it, so the viewer is racing too.
 */
export function Replay({ doc }: { doc: ReplayDoc }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [runs, setRuns] = useState(0);
  const start = useRef(0);
  const cache = useRef(new Map<number, Stroke>());
  const winner = doc.winner ? RACER_BY_KEY[doc.winner] : null;
  const room = winner?.room ?? "#E6E0D6";
  const end = doc.endMs + 600;
  const done = t >= end;
  const revealed = doc.winMs != null ? t >= doc.winMs : done;

  /* ---------------- the clock ---------------- */
  const play = useCallback(() => {
    cache.current.clear();
    setT(0);
    setPlaying(true);
    setRuns((n) => n + 1);
    start.current = performance.now();
  }, []);

  useEffect(() => {
    const id = setTimeout(play, 700);
    return () => clearTimeout(id);
  }, [play]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const now = performance.now() - start.current;
      setT(now);
      if (now < end) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, end, runs]);

  /* ---------------- the paper ---------------- */
  useEffect(() => {
    const c = canvas.current;
    const el = wrap.current;
    if (!c || !el) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.round(el.clientWidth * dpr);
    if (c.width !== w) {
      c.width = w;
      c.height = w;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const strokes: Stroke[] = [];
    let pen: [number, number] | null = null;
    doc.strokes.forEach((flat, i) => {
      const hit = cache.current.get(i);
      if (hit) return strokes.push(hit);
      const s = strokeAt(flat, t);
      if (!s) return;
      if (s.done) cache.current.set(i, s);
      else pen = [s.points.at(-1)![0], s.points.at(-1)![1]];
      strokes.push(s);
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const k = c.width / SPACE;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    paint(ctx, strokes, "#16130f");
    // The creatures watch the replayed pen, just like they watched the real one.
    if (pen && playing) {
      const r = c.getBoundingClientRect();
      lookAt(r.left + (pen[0] / SPACE) * r.width, r.top + (pen[1] / SPACE) * r.height);
    }
  }, [t, doc.strokes, playing]);

  /* ---------------- the field ---------------- */
  const phase: Phase = done ? (doc.winner ? "won" : "over") : t > 0 ? "drawing" : "ready";
  const lanes: Lane[] = useMemo(() => {
    // Stable ids (the log index), so each guess animates in exactly once.
    const indexed = doc.log.map((e, i) => ({ ...e, id: i + 1 }));
    return RACERS.map((r) => {
      const mine = indexed.filter((e) => e.k === r.key);
      const seen = mine.filter((e) => e.t <= t);
      const next = mine.find((e) => e.t > t);
      const solved = seen.find((e) => e.v === "correct");
      return {
        key: r.key,
        looking: !done && !solved && !!next && next.t - t < 1300,
        guesses: seen.map((e) => ({ id: e.id, text: e.g, verdict: e.v, at: e.t })),
        solvedAt: solved?.t ?? null,
        won: doc.winner === r.key && !!solved,
        out: null,
        note: null,
        lastLatency: null,
        looks: seen.length,
      };
    });
  }, [doc.log, doc.winner, t, done]);
  const view = useMemo(
    () => (done ? [...lanes].sort((a, b) => (a.solvedAt ?? Infinity) - (b.solvedAt ?? Infinity)) : lanes),
    [lanes, done],
  );
  const solvers = lanes.filter((l) => l.solvedAt != null).length;
  const clock = Math.min(t, doc.winMs ?? doc.endMs);

  return (
    <MotionConfig reducedMotion="user">
      <style>{`body{--room:${room}}`}</style>
      <div className="relative isolate flex min-h-dvh flex-col">
        <header className="mx-auto flex w-full max-w-[1680px] items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5 lg:px-8">
          <DerbyWordmark />
          <a href="/" className="pill pill-ink">
            Play
            <IconArrowRight size={17} stroke={2.4} />
          </a>
        </header>

        <main className="mx-auto grid w-full max-w-[1200px] flex-1 grid-cols-1 content-start gap-x-10 gap-y-4 px-4 pt-4 pb-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_410px] lg:content-center lg:pt-2">
          <section className="flex min-w-0 flex-col items-center lg:items-end">
            <div className="paper-col w-full">
              <div className="flex items-end justify-between gap-4 pb-4">
                <div className="min-w-0">
                  <p className="tx-label text-ink-2">{revealed ? "They were drawing" : "Can you guess it first?"}</p>
                  <h1 className="tx-word mt-1.5 flex min-h-[3.25rem] flex-wrap items-end gap-x-[0.06em] pb-1" aria-label={revealed ? doc.word : "hidden word"}>
                    {doc.word.split("").map((ch, i) =>
                      ch === " " ? (
                        <span key={i} className="w-[0.35em]" />
                      ) : (
                        <span key={i} className="relative inline-grid">
                          <AnimatePresence mode="popLayout" initial={false}>
                            {revealed ? (
                              <motion.span
                                key="ch"
                                initial={{ opacity: 0, y: 26, rotate: 10 }}
                                animate={{ opacity: 1, y: 0, rotate: 0 }}
                                transition={{ ...spring, delay: i * 0.04 }}
                              >
                                {ch}
                              </motion.span>
                            ) : (
                              <motion.span key="blank" exit={{ opacity: 0, scaleX: 0.3 }} className="mx-[0.04em] mb-[0.12em] h-[0.12em] w-[0.5em] self-end rounded-full bg-ink/30" />
                            )}
                          </AnimatePresence>
                        </span>
                      ),
                    )}
                  </h1>
                </div>
                <span className="pill shrink-0 gap-2 pr-3.5" style={{ cursor: "default" }}>
                  <span className="size-2.5 rounded-full" style={{ background: playing ? "#F2442E" : "var(--ink-4)" }} />
                  <span className="tx-num min-w-[3.4ch] text-[1.0625rem] font-bold">{fmtSec(clock)}</span>
                </span>
              </div>

              <motion.div
                className="paper relative overflow-hidden rounded-[28px] bg-white"
                animate={done && winner ? { scale: [1, 0.985, 1] } : { scale: 1 }}
                transition={{ duration: 0.35 }}
              >
                <div ref={wrap} className="relative aspect-square w-full">
                  <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label={`Replay of a doodle of ${doc.word}`} role="img" />
                </div>

                <AnimatePresence>
                  {winner && doc.winMs != null && t >= doc.winMs ? (
                    <motion.div
                      key={`stamp${runs}`}
                      aria-hidden
                      initial={{ scale: 2.4, rotate: 18, opacity: 0 }}
                      animate={{ scale: 1, rotate: -10, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 520, damping: 22 }}
                      className="absolute top-4 right-4 z-20 grid size-[92px] place-items-center rounded-full text-center sm:size-[104px]"
                      style={{ color: onColor(winner.color), background: winner.color, boxShadow: `0 0 0 4px #fff, 0 0 0 6px ${winner.color}, var(--lift-hi)` }}
                    >
                      <div>
                        <p className="tx-label opacity-90">got it in</p>
                        <p className="tx-num text-[1.6rem] leading-none font-extrabold tracking-[-0.04em]">{fmtSec(doc.winMs)}</p>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <AnimatePresence>
                  {done ? (
                    <motion.div
                      key={`result${runs}`}
                      initial={{ y: 30, opacity: 0, scale: 0.96 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      exit={{ y: 20, opacity: 0, transition: { duration: 0.12 } }}
                      transition={{ ...spring, delay: 0.25 }}
                      className="absolute inset-x-3 bottom-3 z-20 sm:inset-x-4 sm:bottom-4"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-[22px] bg-ink p-2.5 pl-3 text-white shadow-[var(--float)] sm:flex-nowrap sm:gap-4 sm:p-3 sm:pl-3.5">
                        {winner ? <Creature k={winner.key} size={42} mood="happy" /> : <Creature k={RACERS[0].key} size={42} mood="sad" />}
                        <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-60px)]">
                          <p className="tx-name truncate">{winner ? `Your turn. Beat ${fmtSec(doc.winMs ?? 0)}` : "Your turn. Make them get it"}</p>
                          <p className="tx-small mt-0.5 truncate text-white/60">
                            {solvers > 0 ? `${solvers} of 6 models got it` : "none of the six got it"}
                          </p>
                        </div>
                        <button type="button" onClick={play} aria-label="Watch again" title="Watch again" className="pill pill-icon shrink-0 bg-white/12 text-white shadow-none hover:bg-white/20">
                          <IconRotateClockwise size={18} stroke={2} />
                        </button>
                        <a href={`/?c=${doc.id}`} className="pill h-11 shrink-0 px-4 text-[0.9375rem] font-bold max-sm:flex-1 max-sm:justify-center" style={{ background: room }}>
                          Draw it
                          <IconArrowRight size={17} stroke={2.4} />
                        </a>
                      </div>
                    </motion.div>
                  ) : t === 0 && !playing ? (
                    <motion.button
                      key="play"
                      onClick={play}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="absolute inset-0 m-auto grid size-20 place-items-center rounded-full bg-ink text-white shadow-[var(--float)]"
                      aria-label="Play the replay"
                    >
                      <IconPlayerPlay size={30} stroke={2} />
                    </motion.button>
                  ) : null}
                </AnimatePresence>

                {done && winner ? <Burst seed={runs * 7 + 3} color={winner.color} /> : null}
              </motion.div>

              <p className="tx-small mt-3 px-1 text-ink-2">
                A replay of a real round{doc.demo ? " (demo guesses, no live models)" : ""}: every stroke and every guess, at the speed it happened.
              </p>
            </div>
          </section>

          <aside className="min-w-0 lg:self-center">
            <div className="mb-2.5 hidden items-baseline justify-between px-1 lg:flex">
              <p className="tx-label text-ink-2">The field</p>
              <p className="tx-small text-ink-2">replaying live</p>
            </div>
            <ul className="hidden flex-col gap-2 lg:flex">
              {view.map((l) => (
                <LaneRow key={l.key} lane={l} phase={phase} isWinner={done && l.key === doc.winner} wins={0} />
              ))}
            </ul>
            <ul className="grid grid-cols-2 gap-2 lg:hidden">
              {view.map((l) => (
                <LaneRow key={l.key} lane={l} phase={phase} isWinner={done && l.key === doc.winner} wins={0} compact />
              ))}
            </ul>
          </aside>
        </main>

        <footer className="mx-auto flex w-full max-w-[1680px] items-center justify-between gap-4 px-4 pb-5 sm:px-6 lg:px-8">
          <TogetherCredit />
        </footer>
      </div>
    </MotionConfig>
  );
}
