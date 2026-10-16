"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion, useAnimationControls } from "motion/react";
import { IconArrowRight, IconCheck, IconCornerDownLeft, IconPencil, IconPlayerPlay, IconRotateClockwise } from "@tabler/icons-react";
import { RACERS, RACER_BY_KEY } from "@/lib/racers";
import { CROWN_PATH } from "@/lib/creatures";
import { SPACE, paint, strokeAt, type Stroke } from "@/lib/sketch";
import { fmtSec, type Replay as ReplayDoc } from "@/lib/replay";
import { quickJudge, type Verdict } from "@/lib/judge";
import { cn } from "@/lib/utils";
import { lookAt } from "./Creature";
import { Burst } from "./Burst";
import { Table } from "./Table";
import { FieldHead, FieldList } from "./Field";
import { Note, ResultBar, Stamp } from "./Overlays";
import { lanesAt, standings } from "./lanes";
import { sound } from "./sound";
import type { Phase } from "./useRace";

const spring = { type: "spring", stiffness: 480, damping: 34 } as const;

type YourGuess = { id: number; text: string; verdict: Verdict | "pending"; at: number };

/** The viewer's own lane: an ink pencil racing the eight. */
function YouRow({ guesses, solvedAt, open }: { guesses: YourGuess[]; solvedAt: number | null; open: boolean }) {
  const controls = useAnimationControls();
  const latest = guesses.at(-1);
  const older = guesses.slice(0, -1).reverse().slice(0, 4);
  useEffect(() => {
    if (latest?.verdict === "wrong") controls.start({ x: [0, -5, 5, -3, 3, 0], transition: { duration: 0.4 } });
    if (latest?.verdict === "correct") controls.start({ y: [0, -10, 0], scale: [1, 1.04, 1], transition: { duration: 0.5 } });
  }, [latest?.id, latest?.verdict, controls]);
  return (
    <motion.div
      layout
      animate={controls}
      className="col-span-2 rounded-[20px] px-3.5 py-3"
      style={{ background: "var(--card)", boxShadow: solvedAt != null ? "0 0 0 2.5px var(--ink), var(--lift-hi)" : "var(--lift)" }}
    >
      <div className="flex items-center gap-3">
        <span className="relative grid size-[46px] shrink-0 place-items-center rounded-full bg-ink text-white">
          <IconPencil size={22} stroke={2.2} />
          {solvedAt != null ? (
            <motion.svg
              viewBox="0 0 32 22"
              aria-hidden
              initial={{ y: -20, opacity: 0, rotate: -25 }}
              animate={{ y: 0, opacity: 1, rotate: -12 }}
              transition={{ type: "spring", stiffness: 420, damping: 14 }}
              className="absolute -top-3.5 -left-0.5 w-6"
            >
              <path d={CROWN_PATH} fill="#FFC531" stroke="#16130f" strokeWidth="2" strokeLinejoin="round" />
            </motion.svg>
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="tx-name">You</p>
          <div className="mt-1 flex h-[1.6rem] min-w-0 items-center gap-2.5">
            <div className="grid min-w-0 max-w-[62%] shrink-0 overflow-hidden">
              <AnimatePresence initial={false} mode="popLayout">
                {latest ? (
                  <motion.span
                    key={latest.id}
                    initial={{ opacity: 0, y: 16, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -14, transition: { duration: 0.14 } }}
                    transition={spring}
                    className={cn(
                      "tx-guess col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 whitespace-nowrap",
                      latest.verdict === "wrong" && "is-wrong text-ink-3",
                      latest.verdict === "close" && "text-close",
                    )}
                  >
                    <span className="strike truncate">{latest.text}</span>
                    {latest.verdict === "close" ? <span className="tx-label shrink-0 rounded-full bg-close-soft px-2 py-0.5 text-close">close</span> : null}
                    {latest.verdict === "correct" ? <IconCheck size={20} stroke={3} className="shrink-0" /> : null}
                  </motion.span>
                ) : (
                  <motion.span key="empty" className="tx-guess col-start-1 row-start-1 text-ink-4">
                    {open ? "your guess" : "watching"}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            {older.length ? (
              <div className="trail-fade flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                {older.map((g) => (
                  <span
                    key={g.id}
                    className={cn("tx-small shrink-0 rounded-full px-2 py-0.5", g.verdict === "close" ? "bg-close-soft text-close" : "bg-card-2 text-ink-3 line-through decoration-1")}
                  >
                    {g.text}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 self-start pt-0.5">
          {solvedAt != null ? (
            <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={spring} className="tx-name tx-num font-bold">
              {fmtSec(solvedAt)}
            </motion.span>
          ) : latest?.verdict === "pending" ? (
            <span className="flex h-6 items-center gap-[3px] rounded-full bg-card-2 px-2" aria-label="Checking">
              {[0, 1, 2].map((i) => (
                <span key={i} className="think-dot size-[5px] rounded-full bg-ink" style={{ animationDelay: `${i * 130}ms` }} />
              ))}
            </span>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * A shared round, replayed in real time: the strokes come back at the speed
 * they were drawn, the creatures' eyes follow the replayed pen, and every
 * guess lands when it really landed. The word stays hidden as blanks until a
 * model gets it, and the viewer gets a box to beat them to it.
 */
export function Replay({ doc, also }: { doc: ReplayDoc; also: string[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [runs, setRuns] = useState(0);
  const start = useRef(0);
  const cache = useRef(new Map<number, Stroke>());
  const winner = doc.winner ? RACER_BY_KEY[doc.winner] : null;
  const end = doc.endMs + 600;
  const done = t >= end;

  /* ---------------- the viewer's race ---------------- */
  const [mine, setMine] = useState<YourGuess[]>([]);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const youAt = mine.find((g) => g.verdict === "correct")?.at ?? null;
  const aiAt = doc.winMs;
  // The box is open on the first run, until someone (you or a model) gets it.
  const open = runs <= 1 && youAt == null && (aiAt == null ? !done : t < aiAt);
  const revealed = youAt != null || (doc.winMs != null ? t >= doc.winMs : done);
  const youWon = youAt != null && (aiAt == null || youAt < aiAt);
  const room = youWon ? "#FFD84A" : (winner?.room ?? "#E6E0D6");

  const guess = useCallback(
    async (text: string) => {
      const g = text.trim().toLowerCase().slice(0, 40);
      if (!g || !open) return;
      const at = performance.now() - start.current;
      const id = Date.now();
      setMine((m) => [...m, { id, text: g, verdict: "pending", at }]);
      setDraft("");
      sound.unlock();
      let verdict: Verdict | null = quickJudge(g, doc.word, also);
      if (!verdict) {
        verdict = await fetch("/api/judge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ share: doc.id, guess: g }),
        })
          .then((r) => r.json())
          .then((j: { verdict?: Verdict }) => j.verdict ?? "wrong")
          .catch(() => "wrong" as const);
      }
      const v = verdict;
      setMine((m) => m.map((x) => (x.id === id ? { ...x, verdict: v } : x)));
      if (v === "correct") sound.win(2);
      else if (v === "close") sound.close();
      else sound.tick(0);
    },
    [open, doc.word, doc.id, also],
  );

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
  const lanes = useMemo(() => lanesAt(doc.log, t, doc.winner, done), [doc.log, doc.winner, t, done]);
  const view = useMemo(() => (done ? standings(lanes) : lanes), [lanes, done]);
  const solvers = lanes.filter((l) => l.solvedAt != null).length;
  const clock = Math.min(t, youAt ?? Infinity, doc.winMs ?? doc.endMs);

  /* ---------------- bragging rights ---------------- */
  const brag = async () => {
    const text =
      aiAt == null
        ? `I guessed a doodle that stumped eight AI models, in ${fmtSec(youAt!)}. Can you?`
        : `I guessed this doodle ${fmtSec(aiAt - youAt!)} faster than eight AI models. Can you?`;
    if ("share" in navigator && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ text, url: location.href });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(`${text}\n${location.href}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const label = youAt != null ? "You got it" : revealed ? (winner ? `${winner.short} got it first` : "Nobody got it") : "Can you guess it first?";
  const title = youWon
    ? aiAt == null
      ? "You got what eight AIs couldn't"
      : `You beat the AIs by ${fmtSec(aiAt - youAt!)}`
    : winner
      ? `Your turn. Beat ${fmtSec(doc.winMs ?? 0)}`
      : "Your turn. Make them get it";

  return (
    <MotionConfig reducedMotion="user">
      <style>{`body{--room:${room}}`}</style>
      <Table
        nav={
          <Link href="/" className="pill pill-ink">
            Play
            <IconArrowRight size={17} stroke={2.4} />
          </Link>
        }
        word={
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="tx-label text-ink-2">{label}</p>
              <h1 className="tx-word mt-1.5 flex min-h-[3.25rem] flex-wrap items-end gap-x-[0.06em] pb-1" aria-label={revealed ? doc.word : "hidden word"}>
                {doc.word.split("").map((ch, i) =>
                  ch === " " ? (
                    <span key={i} className="w-[0.35em]" />
                  ) : (
                    <span key={i} className="relative inline-grid">
                      <AnimatePresence mode="popLayout" initial={false}>
                        {revealed ? (
                          <motion.span key="ch" initial={{ opacity: 0, y: 26, rotate: 10 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ ...spring, delay: i * 0.04 }}>
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
              <span className="size-2.5 rounded-full" style={{ background: playing && clock === t ? "#F2442E" : "var(--ink-4)" }} />
              <span className="tx-num min-w-[3.4ch] text-[1.0625rem] font-bold">{fmtSec(clock)}</span>
            </span>
          </div>
        }
        paper={
          <motion.div className="paper relative overflow-hidden rounded-[28px] bg-white" animate={done && winner ? { scale: [1, 0.985, 1] } : { scale: 1 }} transition={{ duration: 0.35 }}>
            <div ref={wrap} className="relative aspect-square w-full">
              <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label={`Replay of a doodle${revealed ? ` of ${doc.word}` : ""}`} role="img" />
            </div>

            <AnimatePresence>
              {youAt != null ? (
                <motion.div
                  key={`you${runs}`}
                  aria-hidden
                  initial={{ scale: 2.4, rotate: 18, opacity: 0 }}
                  animate={{ scale: 1, rotate: -10, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 22 }}
                  className="absolute top-4 right-4 z-20 grid size-[92px] place-items-center rounded-full bg-ink text-center text-white sm:size-[104px]"
                  style={{ boxShadow: "0 0 0 4px #fff, 0 0 0 6px var(--ink), var(--lift-hi)" }}
                >
                  <div>
                    <p className="tx-label opacity-80">you got it</p>
                    <p className="tx-num text-[1.6rem] leading-none font-extrabold tracking-[-0.04em]">{fmtSec(youAt)}</p>
                  </div>
                </motion.div>
              ) : winner && doc.winMs != null && t >= doc.winMs ? (
                <Stamp key={`stamp${runs}`} k={winner.key} ms={doc.winMs} />
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {done ? (
                <ResultBar
                  key={`result${runs}`}
                  winner={youWon ? null : (winner?.key ?? null)}
                  avatar={
                    youWon ? (
                      <span className="grid size-[42px] shrink-0 place-items-center rounded-full bg-[#FFD84A] text-ink">
                        <IconPencil size={21} stroke={2.2} />
                      </span>
                    ) : undefined
                  }
                  title={title}
                  notes={[
                    <Note key="n">
                      {youWon ? `${solvers} of ${RACERS.length} models got it after you` : solvers > 0 ? `${solvers} of ${RACERS.length} models got it` : "none of them got it"}
                    </Note>,
                    ...(doc.demo ? [<Note key="d">demo guesses</Note>] : []),
                  ]}
                  onShare={youWon ? brag : undefined}
                  primary={{ label: "Draw it", href: `/?c=${doc.id}` }}
                  tint={youWon ? "#FFD84A" : (winner?.room ?? "#fff")}
                  delay={0.25}
                />
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

            {done && winner && !youWon ? <Burst seed={runs * 7 + 3} color={winner.color} /> : null}
            {youAt != null && runs <= 1 ? <Burst seed={11} color="#16130f" /> : null}
            <AnimatePresence>
              {copied ? (
                <motion.span
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="tx-small absolute top-4 left-1/2 z-30 -translate-x-1/2 rounded-full bg-ink px-3 py-1.5 font-semibold text-white"
                >
                  Copied. Go brag.
                </motion.span>
              ) : null}
            </AnimatePresence>
          </motion.div>
        }
        below={
          <AnimatePresence mode="popLayout" initial={false}>
            {open ? (
              <motion.form
                key="guess"
                onSubmit={(e) => {
                  e.preventDefault();
                  guess(draft);
                }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
                transition={spring}
                className="flex h-12 items-center gap-2 rounded-full bg-white p-1.5 pl-5 shadow-[var(--lift-hi)] transition-shadow focus-within:shadow-[0_0_0_2.5px_var(--ink),var(--lift-hi)]"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Guess it before the AIs do"
                  aria-label="Your guess"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={40}
                  enterKeyHint="send"
                  className="tx-body min-w-0 flex-1 bg-transparent font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink-3"
                />
                <button type="submit" disabled={!draft.trim()} className="pill pill-ink h-9 shrink-0 px-3.5" aria-label="Guess">
                  <span className="max-sm:hidden">Guess</span>
                  <IconCornerDownLeft size={16} stroke={2.2} />
                </button>
              </motion.form>
            ) : (
              <motion.div key="after" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-12 items-center justify-between gap-3 px-1">
                <p className="tx-small text-ink-2">
                  {youWon
                    ? "Nicely read. Now draw one and see if they can."
                    : revealed && winner && runs <= 1 && !done
                      ? `${winner.label} got there first. Watch the rest, or draw your own.`
                      : `A replay of a real round${doc.demo ? " (demo guesses)" : ""}: every stroke and guess, at the speed it happened.`}
                </p>
                {done ? (
                  <button type="button" onClick={play} className="pill pill-ghost shrink-0" aria-label="Watch again">
                    <IconRotateClockwise size={17} stroke={2} />
                    <span className="max-sm:hidden">Watch again</span>
                  </button>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        }
        fieldHead={<FieldHead today={null} note={mine.length ? "you vs eight open models" : "replaying live"} />}
        field={
          <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-col">
            {mine.length || open ? <YouRow guesses={mine} solvedAt={youAt} open={open} /> : null}
            <div className="col-span-2">
              {/* A viewer who beat the models takes the crown from them. */}
              <FieldList lanes={view} phase={phase} winner={youWon ? null : doc.winner} />
            </div>
          </div>
        }
      />
    </MotionConfig>
  );
}
