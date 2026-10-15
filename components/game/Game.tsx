"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { IconArrowBackUp, IconDice5, IconFlag, IconFlameFilled, IconKey, IconRefresh, IconTrash, IconTrophy } from "@tabler/icons-react";
import { RACER_BY_KEY, type RacerKey } from "@/lib/racers";
import { untilNext } from "@/lib/daily";
import { packStrokes } from "@/lib/sketch";
import { thinStrokes } from "@/lib/doodle";
import { fmtSec, type ReplayGuess } from "@/lib/replay";
import { cn } from "@/lib/utils";
import { Sketchpad, type SketchpadHandle } from "./Sketchpad";
import { useRace, type Deal, type Lane, type Phase } from "./useRace";
import { Creature } from "./Creature";
import { Clock } from "./Clock";
import { Burst } from "./Burst";
import type { Tab } from "./Board";
import { KeyControl, openKeyForm, useTogetherKey } from "./KeyControl";
import { onSession, readSession } from "./session";
import type { ShareTarget } from "./ShareSheet";
import type { CardTarget } from "./ModelCard";
import { Table } from "./Table";
import { BoardButton, DailyPill, Dock, SoundToggle, StarButton } from "./Nav";
import { Lineup, Note, ResultBar, Stamp } from "./Overlays";
import { FieldHead, FieldList, Ticker, WrongCard } from "./Field";
import { StreakChip, Word } from "./Word";
import { lanesAt, solveOrder, standings } from "./lanes";
import { liveDailyStreak, readMe, recordDaily, recordOutcome, updateDaily, useMe, type DailyRecord, type Outcome } from "./me";
import { board as boardStore, pulse as pulseStore, usePulse, type Pulse } from "./live";
import { resultText } from "./result";
import { sound } from "./sound";
import type { ClipDoc } from "./clip";

const spring = { type: "spring", stiffness: 480, damping: 34 } as const;

// The sheets render nothing until opened, so they load after the table does.
const loadBoard = () => import("./Board");
const loadCard = () => import("./ModelCard");
const loadShare = () => import("./ShareSheet");
const Board = dynamic(() => loadBoard().then((m) => m.Board), { ssr: false });
const ModelCard = dynamic(() => loadCard().then((m) => m.ModelCard), { ssr: false });
const ShareSheet = dynamic(() => loadShare().then((m) => m.ShareSheet), { ssr: false });

/** Every round gets its own room color. All of them carry ink text at AA or better. */
const ROOMS = ["#FFD84A", "#FF9F5A", "#FF9BC8", "#BBA8FF", "#86C3FF", "#6FE3B0", "#CDEB5A", "#FF8A7A"];
const SAD_ROOM = "#E6E0D6";
const DOZE_MS = 25_000;

export type Challenge = { id: string; word: string; winner: RacerKey | null; ms: number | null };

function roomFor(token: string) {
  let h = 0;
  for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) >>> 0;
  return ROOMS[h % ROOMS.length];
}

function setRoom(color: string) {
  document.body.style.setProperty("--room", color);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

function useSessionWins(): Partial<Record<RacerKey, number>> {
  const [w, setW] = useState<Partial<Record<RacerKey, number>>>({});
  useEffect(() => {
    const read = () => {
      const s = readSession();
      setW(Object.fromEntries(Object.entries(s.rows).map(([k, v]) => [k, v.wins])));
    };
    read();
    return onSession(read);
  }, []);
  return w;
}

/** After a long idle stretch on an empty paper, the field nods off. Any movement wakes it. */
function useDoze(active: boolean) {
  const [dozing, setDozing] = useState(false);
  useEffect(() => {
    if (!active) {
      setDozing(false);
      return;
    }
    let t = setTimeout(() => setDozing(true), DOZE_MS);
    const wake = () => {
      setDozing(false);
      clearTimeout(t);
      t = setTimeout(() => setDozing(true), DOZE_MS);
    };
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [active]);
  return dozing;
}

/** Time to the next daily word, ticking quietly. Client only: it depends on the clock. */
function Until({ d }: { d: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);
  return now == null ? null : <span className="tx-num font-bold">{untilNext(d, now)}</span>;
}

/** Every judged guess of a round, in order: the log a replay or a clip is built from. */
function laneLog(lanes: Lane[]): ReplayGuess[] {
  return lanes
    .flatMap((l) => l.guesses.filter((g) => g.verdict !== "pending").map((g) => ({ k: l.key, g: g.text, v: g.verdict as ReplayGuess["v"], t: Math.round(g.at) })))
    .sort((a, b) => a.t - b.t);
}

/** What a share shows, in a few characters: changes when a model lands a guess. */
const shareSig = (lanes: Lane[]) => lanes.map((l) => `${l.guesses.filter((g) => g.verdict !== "pending").length}${l.solvedAt != null ? "!" : ""}`).join(",");

function endOf(strokes: number[][], log: ReplayGuess[], winMs: number | null) {
  const lastInk = Math.max(0, ...strokes.map((s) => s[s.length - 1] ?? 0));
  return Math.max(winMs ?? 0, lastInk, log.at(-1)?.t ?? 0) + 400;
}

export function Game({
  initial,
  challenge: challengeIn,
  mode = "free",
  d,
  pulse: pulseIn,
}: {
  initial?: Deal | null;
  challenge?: Challenge | null;
  mode?: "free" | "daily";
  /** Today's daily number. */
  d: number;
  pulse?: Pulse | null;
}) {
  const isDaily = mode === "daily";
  const pad = useRef<SketchpadHandle>(null);
  const { apiKey } = useTogetherKey();
  const race = useRace({ sketch: pad, apiKey, initial, fixed: isDaily });
  const { deal } = race;
  const me = useMe();
  const live = usePulse(pulseIn);
  const wins = useSessionWins();
  const [boardOpen, setBoardOpen] = useState<Tab | null>(null);
  const [card, setCard] = useState<CardTarget>(null);
  const [hasInk, setHasInk] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    // Warm the sheets once the browser has a quiet moment.
    const warm = () => void Promise.all([loadBoard(), loadCard(), loadShare()]);
    const id = "requestIdleCallback" in window ? requestIdleCallback(warm, { timeout: 4000 }) : setTimeout(warm, 2500);
    return () => ("cancelIdleCallback" in window ? cancelIdleCallback(id as number) : clearTimeout(id));
  }, []);
  // A first-time visitor sees one ghost round before their own.
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("dd:seen")) {
        localStorage.setItem("dd:seen", "1");
        setDemo(true);
      }
    } catch {}
  }, []);

  /* ---------------- the daily, already drawn ---------------- */
  // Coming back to a finished daily shows it as it ended. A daily finished in
  // this visit stays live instead, so nothing jumps.
  const record = isDaily && me ? (me.daily.days[d] ?? null) : null;
  const done = record && race.startedAt == null ? record : null;
  const doneLanes = useMemo(() => (done ? lanesAt(done.log, Infinity, done.k, true) : null), [done]);
  useEffect(() => {
    if (done) pad.current?.load(done.strokes);
  }, [done]);

  const phase: Phase = done ? (done.k ? "won" : "over") : race.phase;
  const lanes = doneLanes ?? race.lanes;
  const winner = done ? done.k : race.winner;
  const ended = phase === "won" || phase === "over";
  const locked = ended || phase === "loading" || !!done;
  const winnerLane = winner ? lanes.find((l) => l.key === winner) : null;
  const winMs = done ? done.ms : (winnerLane?.solvedAt ?? null);
  const winnerRacer = winner ? RACER_BY_KEY[winner] : null;
  const solvers = lanes.filter((l) => l.solvedAt != null).length;
  const view = useMemo(() => (ended ? standings(lanes) : lanes), [lanes, ended]);
  const anyOpen = !!boardOpen || !!card;
  const dozing = useDoze(phase === "ready" && !hasInk && !anyOpen && !done);
  // The daily waits for this browser's record before offering a fresh paper.
  const settledView = !isDaily || me != null;

  /* ---------------- a friend's challenge ---------------- */
  const challenge = challengeIn && deal?.word === challengeIn.word ? challengeIn : null;
  useEffect(() => {
    // Keep the address clean once the challenge word is on the table.
    if (challengeIn && location.search) history.replaceState(null, "", "/");
  }, [challengeIn]);
  const beat =
    challenge && phase === "won" && winMs != null ? (challenge.ms == null ? -1 : challenge.ms - winMs) : null;

  /* ---------------- the room ---------------- */
  // Derived from the round ticket, so the server paints the first room and
  // there is no flash of a default color on load.
  const firstRoom = useRef(initial ? roomFor(initial.token) : ROOMS[0]);
  const room = useRef(firstRoom.current);
  const roundRoom = useRef(firstRoom.current);
  const [flood, setFlood] = useState<{ color: string; x: number; y: number; n: number } | null>(null);

  useEffect(() => {
    if (!deal || done) return;
    let next = roomFor(deal.token);
    if (next === room.current && deal.token !== initial?.token) next = ROOMS[(ROOMS.indexOf(next) + 1) % ROOMS.length];
    room.current = roundRoom.current = next;
    setRoom(next);
    setFlood(null);
    setOutcome(null);
  }, [deal?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!done) return;
    const c = done.k ? RACER_BY_KEY[done.k].room : SAD_ROOM;
    room.current = c;
    setRoom(c);
  }, [done]);

  useEffect(() => {
    if (done) return;
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
  }, [phase, winnerRacer, done]);

  useEffect(() => {
    if (phase === "ready") setHasInk(false);
  }, [phase, deal?.token]);
  useEffect(() => {
    if (hasInk) setDemo(false);
  }, [hasInk]);

  const onChange = useCallback(() => {
    setHasInk((pad.current?.strokeCount() ?? 0) > 0);
    race.nudge();
  }, [race]);

  /* ---------------- the end of a round ---------------- */
  const settled = useRef<string | null>(null);
  const [daily, setDaily] = useState<{ state: "posting" | "posted" | "failed"; rank?: number | null; of?: number } | null>(null);

  const postDaily = useCallback(
    async (rec: DailyRecord, strokes: number[][]) => {
      if (!deal) return;
      recordDaily(d, rec);
      setDaily({ state: "posting" });
      const m = readMe();
      try {
        const res = await fetch("/api/daily", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ round: deal.token, player: m.id, name: m.name, strokes, log: rec.log }),
        });
        const j = (await res.json()) as { id?: string; rank?: number | null; of?: number; error?: string };
        if (!j.id) throw new Error(j.error);
        updateDaily(d, { entry: j.id, rank: j.rank, of: j.of });
        setDaily({ state: "posted", rank: j.rank, of: j.of });
        pulseStore.refresh(true);
      } catch {
        setDaily({ state: "failed" });
        setToast("Couldn't reach today's board. Your result is saved here.");
      }
    },
    [deal, d],
  );

  // The board is about to be the next thing people look at; have it ready.
  useEffect(() => {
    if (!race.final) return;
    const t = setTimeout(() => {
      boardStore.refresh(true);
      pulseStore.refresh(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [race.final]);

  useEffect(() => {
    if (!race.final || !deal || done || settled.current === deal.token) return;
    // A round where nobody answered (a dead connection) changes nothing.
    if (!race.lanes.some((l) => l.guesses.length > 0)) return;
    settled.current = deal.token;
    const ms = winnerLane?.solvedAt ?? null;
    const o = recordOutcome({ word: deal.word, ms, k: race.winner, pick: null });
    setOutcome(o);
    if (o.newBest) sound.sparkle(race.winner ? 0.75 : 0.1);
    if (isDaily && pad.current && race.startedAt != null) {
      const strokes = packStrokes(pad.current.strokes(), race.startedAt);
      const log = laneLog(race.lanes);
      postDaily({ word: deal.word, ms, k: race.winner, order: solveOrder(race.lanes), called: o.called, log, strokes: thinStrokes(strokes, 900) }, strokes);
    }
  }, [race.final]); // eslint-disable-line react-hooks/exhaustive-deps

  // Models that land a right answer after the winner still belong on the record.
  useEffect(() => {
    if (!isDaily || !race.final || done || settled.current !== deal?.token) return;
    updateDaily(d, { order: solveOrder(race.lanes), log: laneLog(race.lanes) });
  }, [race.lanes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setDaily(null), [deal?.token]);

  /* ---------------- share ---------------- */
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const links = useRef(new Map<string, Promise<{ url: string; image: string } | { error: string }>>());
  const sharedSig = useRef("");
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const share = useCallback(() => {
    if (!deal) return;
    const src = done
      ? { strokes: done.strokes, log: done.log, order: done.order, called: done.called }
      : pad.current && race.startedAt != null
        ? { strokes: packStrokes(pad.current.strokes(), race.startedAt), log: laneLog(race.lanes), order: solveOrder(race.lanes), called: outcome?.called ?? null }
        : null;
    if (!src) return;
    const clip: ClipDoc = {
      word: deal.word,
      strokes: src.strokes,
      log: src.log,
      winner,
      winMs,
      endMs: endOf(src.strokes, src.log, winMs),
      room: done ? SAD_ROOM : roundRoom.current,
      daily: isDaily ? d : null,
      site: location.host,
    };
    const streak = isDaily && me ? liveDailyStreak(me, d) : undefined;
    sharedSig.current = shareSig(race.lanes);
    const link = () => {
      // Keyed by the log too: a model answering late refreshes the replay behind the link.
      const key = isDaily ? `daily:${d}` : `${deal.token}:${src.log.length}`;
      let p = links.current.get(key);
      if (!p) {
        p = isDaily
          ? Promise.resolve({ url: `${location.origin}/daily`, image: "/daily/opengraph-image" })
          : fetch("/api/share", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ round: deal.token, strokes: src.strokes, byok: Boolean(apiKey), log: src.log }),
            })
              .then((r) => r.json() as Promise<{ id?: string; url?: string; error?: string }>)
              .then((j) => (j.id && j.url ? { url: j.url, image: `/r/${j.id}/opengraph-image` } : { error: j.error ?? "Couldn't make a link. Try again." }))
              .catch(() => ({ error: "Couldn't make a link. Check your connection." }));
        links.current.set(key, p);
        p.then((r) => "error" in r && links.current.delete(key));
      }
      return p;
    };
    setShareTarget({
      clip,
      text: (url) => resultText({ daily: isDaily ? d : null, ms: winMs, order: src.order, called: src.called, streak, url }),
      link,
      file: `doodle-derby-${isDaily ? `daily-${d}` : deal.word.replace(/\s+/g, "-")}`,
      spoiler: isDaily,
    });
  }, [deal, done, race.startedAt, race.lanes, outcome, winner, winMs, isDaily, d, me, apiKey]);

  // A model can still land its answer after the sheet opens; what gets shared catches up.
  useEffect(() => {
    if (!shareTarget || done || shareSig(race.lanes) === sharedSig.current) return;
    const t = setTimeout(share, 600);
    return () => clearTimeout(t);
  }, [race.lanes]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- keys ---------------- */
  const sheetOpen = anyOpen || !!shareTarget;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // Focused controls handle their own Enter; a second handler here double-fires.
      if ((el && ["INPUT", "TEXTAREA", "BUTTON", "A"].includes(el.tagName)) || sheetOpen) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (!locked) pad.current?.undo();
      } else if (e.key === "Enter" && ended && !isDaily) {
        e.preventDefault();
        race.next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ended, locked, race, sheetOpen, isDaily]);

  const openCard = useCallback((k: RacerKey, from?: DOMRect) => setCard({ k, from }), []);
  const endDemo = useCallback(() => setDemo(false), []);

  /* ---------------- what the end of a round says ---------------- */
  const rank = done ? { rank: done.rank, of: done.of } : daily;
  const notes: React.ReactNode[] = [];
  if (beat != null) {
    notes.push(
      <Note strong>
        {beat === -1 ? "You did what your friend couldn't" : beat > 0 ? `You beat your friend by ${fmtSec(beat)}` : `${fmtSec(-beat)} short of your friend`}
      </Note>,
    );
  }
  if (isDaily) {
    notes.push(
      <Note strong>
        {winMs == null
          ? "nobody got yours today"
          : rank?.rank
            ? `#${rank.rank} of ${rank.of} today`
            : daily?.state === "posting"
              ? "posting to today's board…"
              : "on today's board"}
      </Note>,
    );
  }
  if (!done && outcome) {
    if (outcome.streak >= 2) notes.push(<Note icon={<IconFlameFilled size={13} className="text-[#FF8A3D]" />}>{outcome.streak} in a row</Note>);
    else if (outcome.broke) notes.push(<Note>streak of {outcome.broke} ended</Note>);
  }
  if (!isDaily) {
    if (winner) notes.push(<Note>{solvers > 1 ? `+${solvers - 1} also got it` : "solo win"}</Note>);
    else notes.push(<Note>try bolder shapes</Note>);
  }
  if (!done) notes.push(<span className="tx-num">${race.cost.toFixed(3)}</span>);

  const ribbon = done ? null : outcome?.newBest ? "new best" : outcome?.firstWin ? "first win" : null;
  const dailyStreak = me ? liveDailyStreak(me, d) : 0;
  const clockRight =
    done ? (
      <span className="pill pill-ghost tx-small cursor-default gap-1.5" title="Until the next daily word">
        next word in <Until d={d} />
      </span>
    ) : phase === "ready" ? (
      isDaily ? (
        live && live.daily.d === d && live.daily.players > 0 ? (
          <span className="pill pill-ghost tx-small cursor-default gap-1.5">
            <Ticker value={live.daily.players} className="font-bold" /> drew it today
          </span>
        ) : (
          <span className="pill pill-ghost tx-small cursor-default gap-1.5" title="Until the next daily word">
            one try · ends in <Until d={d} />
          </span>
        )
      ) : (
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
      )
    ) : (
      <Clock startedAt={race.startedAt} endedAt={race.endedAt} />
    );

  return (
    <MotionConfig reducedMotion="user">
      <style>{`body{--room:${firstRoom.current}}`}</style>
      <Table
        nav={
          <>
            <Dock>
              <DailyPill mode={mode} d={d} played={!!me?.daily.days[d]} />
              <BoardButton onClick={() => setBoardOpen(isDaily ? "today" : "models")} />
              <SoundToggle inDock className="max-md:hidden" />
              <KeyControl inDock className="hidden md:block" />
            </Dock>
            <StarButton />
          </>
        }
        word={
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              {/* Only shows when it has something to say: a friend's time to beat, or a streak. */}
              {challenge ? (
                <span className="tx-label mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-ink py-1 pr-3 pl-1 text-white">
                  {challenge.winner ? <Creature k={challenge.winner} size={20} /> : <span className="size-5" />}
                  {challenge.winner && challenge.ms != null ? `A friend's doodle got guessed in ${fmtSec(challenge.ms)}. Beat it.` : "Nobody guessed a friend's doodle. Can you?"}
                </span>
              ) : (
                <div className="mb-1.5 flex empty:hidden">
                  {isDaily ? (
                    <StreakChip n={dailyStreak} unit={dailyStreak === 1 ? "day" : "days"} title="Days in a row you've drawn the daily" />
                  ) : (
                    <StreakChip n={me?.streak ?? 0} title="Doodles in a row that got guessed" />
                  )}
                </div>
              )}
              <div className="min-h-[3.25rem] overflow-hidden pb-1">{deal ? <Word word={deal.word} /> : null}</div>
            </div>
            <div className="shrink-0 pb-1">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div key={done ? "done" : phase === "ready" ? `ready${isDaily}` : "clock"} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring}>
                  {clockRight}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        }
        paper={
          <motion.div
            className="paper relative overflow-hidden rounded-[28px] bg-white"
            animate={phase === "won" && !done ? { scale: [1, 0.985, 1] } : { scale: 1 }}
            transition={{ duration: 0.35, delay: 0.32 }}
          >
            <Sketchpad ref={pad} locked={locked} onStrokeStart={race.begin} onChange={onChange} />

            <AnimatePresence>
              {phase === "ready" && !hasInk && !done && settledView ? (
                <Lineup dozing={dozing} demo={demo} onDemoDone={endDemo} />
              ) : null}
            </AnimatePresence>

            <AnimatePresence>{phase === "won" && winner && winMs != null ? <Stamp k={winner} ms={winMs} ribbon={ribbon} /> : null}</AnimatePresence>

            <AnimatePresence>
              {ended ? (
                <ResultBar
                  winner={winner}
                  title={winner ? `${RACER_BY_KEY[winner].short} got it` : `Nobody got ${deal?.word}`}
                  notes={notes}
                  onShare={share}
                  primary={isDaily ? { label: "Free play", href: "/" } : { label: "Next", long: "word", onClick: race.next }}
                  tint={winnerRacer?.room ?? "#fff"}
                  delay={done ? 0.1 : phase === "won" ? 0.45 : 0.05}
                />
              ) : null}
            </AnimatePresence>

            {phase === "won" && race.startedAt && winnerRacer && !done ? <Burst seed={Math.round(race.startedAt)} color={winnerRacer.color} /> : null}
          </motion.div>
        }
        below={
          <div className="flex min-h-10 items-center justify-between">
            {done ? (
              <p className="tx-small px-1 text-ink-2">
                Daily #{d} is in. Tomorrow&apos;s word lands in <Until d={d} />.
              </p>
            ) : (
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
            )}
            <AnimatePresence mode="popLayout" initial={false}>
              {done ? (
                <motion.button key="board" type="button" className="pill pill-ghost shrink-0" onClick={() => setBoardOpen("today")} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <IconTrophy size={17} stroke={2} />
                  Today&apos;s board
                </motion.button>
              ) : phase === "drawing" ? (
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
              ) : ended && isDaily ? (
                <motion.button key="board" type="button" className="pill pill-ghost shrink-0" onClick={() => setBoardOpen("today")} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <IconTrophy size={17} stroke={2} />
                  Today&apos;s board
                </motion.button>
              ) : ended ? (
                <motion.span key="enter" className="tx-small hidden pr-1 text-ink-2 sm:inline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  Press Enter for the next word
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
        }
        fieldHead={<FieldHead today={live?.today ?? null} />}
        field={
          <>
            <AnimatePresence>
              {race.error || (race.demo && !done) ? (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="status"
                  className={cn("tx-small mb-3 rounded-2xl px-4 py-3 font-medium", race.error ? "bg-bad-soft text-bad" : "bg-white/60 text-ink")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span>{race.error ?? "Demo guesses: no Together key is set, so these are canned, not live models. Add a key to race for real."}</span>
                    {race.error && /together key/i.test(race.error) ? (
                      <button type="button" onClick={openKeyForm} className="pill h-9 shrink-0 bg-white">
                        <IconKey size={16} stroke={2} />
                        Add key
                      </button>
                    ) : race.error && phase === "loading" ? (
                      <button type="button" onClick={race.retry} className="pill h-9 shrink-0 bg-white">
                        <IconRefresh size={16} stroke={2} />
                        Retry
                      </button>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            {/* A finished daily mounts fresh, so the field does not re-live the round out loud. */}
            <FieldList key={done ? "done" : "live"} lanes={view} phase={phase} winner={winner} wins={wins} dozing={dozing} onOpen={openCard} />
          </>
        }
        fieldFoot={<WrongCard wrong={live?.wrong ?? null} hidden={phase === "drawing"} onOpen={openCard} />}
        footer={
          <div className="flex items-center gap-2 md:hidden">
            <SoundToggle />
            <KeyControl />
          </div>
        }
      >
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

        <Board open={boardOpen} d={d} onClose={() => setBoardOpen(null)} onOpenModel={openCard} />
        <ModelCard target={card} onClose={() => setCard(null)} />
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
          {phase === "won" && winner && winMs != null
            ? `${RACER_BY_KEY[winner].label} guessed ${deal?.word} in ${(winMs / 1000).toFixed(1)} seconds.`
            : phase === "over"
              ? `Time is up. Nobody guessed ${deal?.word}.`
              : ""}
        </p>
      </Table>
    </MotionConfig>
  );
}
