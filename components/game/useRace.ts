"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RACERS, RULES, type RacerKey } from "@/lib/racers";
import type { Verdict } from "@/lib/judge";
import type { GuessEvent } from "@/app/api/guess/route";
import type { SketchpadHandle } from "./Sketchpad";
import { recordRound, recordSolve } from "./session";
import { sound } from "./sound";

/**
 * The race engine. Each model runs its own loop: look at the newest sketch,
 * answer, wait a beat, look again once there is new ink (or the artist has
 * paused long enough that a second look is fair). Nothing queues: a slow model
 * simply looks less often, which is the race.
 */
export type Phase = "loading" | "ready" | "drawing" | "won" | "over";

export type LaneGuess = {
  id: number;
  text: string;
  verdict: Verdict | "pending";
  /** ms from first stroke to the guess landing on screen. */
  at: number;
};

export type Lane = {
  key: RacerKey;
  looking: boolean;
  guesses: LaneGuess[];
  solvedAt: number | null;
  won: boolean;
  /** Set when the model is sitting out (errors, or a rejected key). */
  out: string | null;
  /** A soft, temporary note: "took too long". */
  note: string | null;
  lastLatency: number | null;
  looks: number;
};

type Internal = Lane & {
  ctrl: AbortController | null;
  nextAt: number;
  lastInk: number;
  lastReplyAt: number;
  errors: number;
};

export type Deal = { token: string; word: string; level: 1 | 2 | 3; live: boolean };

const freshLane = (key: RacerKey): Internal => ({
  key,
  looking: false,
  guesses: [],
  solvedAt: null,
  won: false,
  out: null,
  note: null,
  lastLatency: null,
  looks: 0,
  ctrl: null,
  nextAt: 0,
  lastInk: 0,
  lastReplyAt: 0,
  errors: 0,
});

const RECENT_KEY = "dd:recent-words";
const BUZZER_MS = 2500;
let guessSeq = 0;

function recentWords(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function rememberWord(w: string) {
  try {
    const r = recentWords().filter((x) => x !== w);
    r.push(w);
    localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(-80)));
  } catch {}
}

async function fetchDeal(extraExclude: string[] = []): Promise<Deal> {
  const res = await fetch("/api/round", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exclude: [...recentWords(), ...extraExclude] }),
  });
  if (!res.ok) throw new Error("Could not deal a word.");
  return res.json();
}

export function useRace(opts: {
  sketch: React.RefObject<SketchpadHandle | null>;
  apiKey: string;
  initial?: Deal | null;
  /** One fixed word (the daily): never deal another. */
  fixed?: boolean;
}) {
  const { sketch } = opts;
  const apiKeyRef = useRef(opts.apiKey);
  apiKeyRef.current = opts.apiKey;

  const [phase, setPhase] = useState<Phase>(opts.initial ? "ready" : "loading");
  const [deal, setDeal] = useState<Deal | null>(opts.initial ?? null);
  const [lanes, setLanes] = useState<Lane[]>(() => RACERS.map((r) => freshLane(r.key)));
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [winner, setWinner] = useState<RacerKey | null>(null);
  const [cost, setCost] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  /** The result can no longer change: a win, a give-up, or the buzzer window has passed. */
  const [final, setFinal] = useState(false);

  const L = useRef<Internal[]>(RACERS.map((r) => freshLane(r.key)));
  const phaseRef = useRef<Phase>(opts.initial ? "ready" : "loading");
  const dealRef = useRef<Deal | null>(opts.initial ?? null);
  const t0 = useRef(0);
  const deadline = useRef(0);
  const roundSeq = useRef(0);
  const winnerRef = useRef<RacerKey | null>(null);
  const costRef = useRef(0);
  const nextDeal = useRef<Promise<Deal> | null>(null);
  const snap = useRef<{ sig: string; url: string | null }>({ sig: "", url: null });
  const recorded = useRef(false);
  const endReason = useRef<"won" | "timeout" | "gaveup" | null>(null);
  const loading = useRef(false);
  const buzzer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fixed = Boolean(opts.fixed);
  const prefetch = useCallback(
    (after: string) => {
      if (fixed) return;
      const p = fetchDeal([after]);
      nextDeal.current = p;
      p.catch(() => {
        if (nextDeal.current === p) nextDeal.current = null;
      });
    },
    [fixed],
  );

  const publish = useCallback(() => {
    setLanes(L.current.map(({ ctrl, nextAt, lastInk, lastReplyAt, errors, ...pub }) => ({ ...pub, guesses: [...pub.guesses] })));
  }, []);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  /* ---------------- round lifecycle ---------------- */

  const settle = useCallback(() => {
    if (recorded.current) return;
    recorded.current = true;
    // Every model was in the race, answered or not.
    if (L.current.some((l) => l.guesses.length > 0)) recordRound(RACERS.map((r) => r.key), winnerRef.current);
  }, []);

  const finish = useCallback((why: "won" | "timeout" | "gaveup") => {
    if (phaseRef.current !== "drawing") return;
    endReason.current = why;
    setEndedAt(performance.now() - t0.current);
    setPhaseBoth(why === "won" ? "won" : "over");
    // A guess asked before the horn can still land and win; wait it out.
    if (why === "timeout") buzzer.current = setTimeout(() => setFinal(true), BUZZER_MS);
    else setFinal(true);
  }, []);

  const load = useCallback(
    async (skipWord?: string) => {
      // One deal at a time: a double press must not skip a word or count a round twice.
      if (loading.current) return;
      loading.current = true;
      // The board is written when a round is left, so a buzzer-beater still counts.
      if (phaseRef.current === "won" || phaseRef.current === "over") settle();
      endReason.current = null;
      clearTimeout(buzzer.current);
      setFinal(false);
      roundSeq.current++;
      for (const l of L.current) l.ctrl?.abort();
      L.current = RACERS.map((r) => freshLane(r.key));
      winnerRef.current = null;
      costRef.current = 0;
      recorded.current = false;
      snap.current = { sig: "", url: null };
      setWinner(null);
      setCost(0);
      setStartedAt(null);
      setEndedAt(null);
      setError(null);
      publish();
      sketch.current?.clear();

      const pending = !skipWord && nextDeal.current ? nextDeal.current : fetchDeal(skipWord ? [skipWord] : []);
      nextDeal.current = null;
      if (!dealRef.current) setPhaseBoth("loading");
      try {
        const d = await pending;
        dealRef.current = d;
        setDeal(d);
        setDemo(!d.live && !apiKeyRef.current);
        rememberWord(d.word);
        setPhaseBoth("ready");
        // The next word is fetched now so "Next" is instant.
        prefetch(d.word);
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
        setPhaseBoth("loading");
      } finally {
        loading.current = false;
      }
    },
    [publish, settle, sketch, prefetch],
  );

  // The board is written once the result can no longer change.
  useEffect(() => {
    if (final) settle();
  }, [final, settle]);

  useEffect(() => {
    const onHide = () => {
      if (phaseRef.current === "won" || phaseRef.current === "over") settle();
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [settle]);

  useEffect(() => {
    // The first word arrives with the page, so there is nothing to wait for.
    const first = dealRef.current;
    if (first && phaseRef.current === "ready") {
      rememberWord(first.word);
      setDemo(!first.live && !apiKeyRef.current);
      if (!nextDeal.current) prefetch(first.word);
    } else {
      load();
    }
    const lanesNow = L;
    return () => {
      lanesNow.current.forEach((l) => l.ctrl?.abort());
      clearTimeout(buzzer.current);
      // Leaving the page by a link (not a reload) still files the round.
      if (phaseRef.current === "won" || phaseRef.current === "over") settle();
    };
  }, [load, settle, prefetch]);

  /** The first stroke starts the clock. */
  const begin = useCallback(() => {
    if (phaseRef.current !== "ready") return;
    t0.current = performance.now();
    deadline.current = t0.current + RULES.roundSeconds * 1000;
    setStartedAt(t0.current);
    setPhaseBoth("drawing");
    sound.unlock();
  }, []);

  /* ---------------- one look ---------------- */

  const look = useCallback(
    async (lane: Internal, image: string, ink: number) => {
      const seq = roundSeq.current;
      const d = dealRef.current;
      if (!d) return;
      const ctrl = new AbortController();
      lane.ctrl = ctrl;
      lane.looking = true;
      lane.looks++;
      lane.lastInk = ink;
      lane.note = null;
      publish();

      const elapsedMs = performance.now() - t0.current;
      let guess: LaneGuess | null = null;
      try {
        const res = await fetch("/api/guess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            round: d.token,
            racer: lane.key,
            image,
            elapsedMs,
            apiKey: apiKeyRef.current || undefined,
            history: lane.guesses
              .filter((g) => g.verdict !== "pending")
              .map((g) => ({ guess: g.text, verdict: g.verdict })),
          }),
        });
        if (!res.body) throw new Error("No response");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const raw of lines) {
            if (!raw.trim() || seq !== roundSeq.current) continue;
            const e = JSON.parse(raw) as GuessEvent;
            if (e.type === "guess") {
              lane.errors = 0;
              lane.lastLatency = e.latencyMs;
              if (e.mode === "demo") setDemo(true);
              costRef.current += e.costUsd;
              setCost(costRef.current);
              guess = { id: ++guessSeq, text: e.guess, verdict: "pending", at: performance.now() - t0.current };
              lane.guesses.push(guess);
              sound.tick(RACERS.findIndex((r) => r.key === lane.key));
              publish();
            } else if (e.type === "verdict" && guess) {
              guess.verdict = e.verdict;
              costRef.current += e.costUsd;
              setCost(costRef.current);
              if (e.verdict === "correct" && lane.solvedAt == null) {
                lane.solvedAt = guess.at;
                recordSolve(lane.key, guess.at);
                const p = phaseRef.current;
                // Only the clock running out allows a late winner; giving up does not.
                const late =
                  p === "over" && endReason.current === "timeout" && !winnerRef.current && guess.at <= RULES.roundSeconds * 1000 + BUZZER_MS;
                if (!winnerRef.current && (p === "drawing" || late)) {
                  winnerRef.current = lane.key;
                  lane.won = true;
                  setWinner(lane.key);
                  // A guess asked before the horn that lands just after it counts.
                  if (late) {
                    clearTimeout(buzzer.current);
                    setPhaseBoth("won");
                    setFinal(true);
                  } else finish("won");
                  sound.win(RACERS.findIndex((r) => r.key === lane.key));
                } else {
                  sound.solve();
                }
              } else if (e.verdict === "close") {
                sound.close();
              }
              publish();
            } else if (e.type === "error") {
              lane.errors++;
              if (e.fatal) {
                lane.out = e.message;
                if (/key/i.test(e.message) || res.status === 429) setError(e.message);
              } else {
                lane.note = e.message;
                if (lane.errors >= 3) lane.out = "Unavailable right now";
              }
              publish();
            }
          }
        }
      } catch {
        if (ctrl.signal.aborted || seq !== roundSeq.current) return;
        lane.errors++;
        lane.note = "Connection dropped";
        if (lane.errors >= 3) lane.out = "Unavailable right now";
      } finally {
        if (seq === roundSeq.current) {
          const now = performance.now();
          lane.ctrl = null;
          lane.looking = false;
          lane.lastReplyAt = now;
          lane.nextAt = now + RULES.minGapMs + (lane.errors ? 1200 * lane.errors : 0);
          publish();
        }
      }
    },
    [finish, publish],
  );

  /* ---------------- the scheduler ---------------- */

  const tick = useCallback(() => {
    if (phaseRef.current !== "drawing") return;
    const now = performance.now();
    if (now >= deadline.current) {
      finish("timeout");
      return;
    }
    const pad = sketch.current;
    if (!pad) return;
    const ink = pad.ink();
    if (ink < RULES.minInkToStart) return;

    for (const lane of L.current) {
      if (lane.ctrl || lane.solvedAt != null || lane.out) continue;
      if (lane.looks >= RULES.maxGuessesPerRacer || now < lane.nextAt) continue;
      const fresh = Math.abs(ink - lane.lastInk) >= RULES.minNewInk;
      // An artist who pauses still gets guesses, like a real table would.
      const second = lane.looks > 0 && now - lane.lastReplyAt > RULES.relookMs;
      if (!fresh && !second) continue;

      const sig = `${Math.round(ink)}|${pad.strokeCount()}`;
      if (snap.current.sig !== sig) snap.current = { sig, url: pad.snapshot(RULES.snapshotSize) };
      if (!snap.current.url) return;
      look(lane, snap.current.url, ink);
    }
  }, [finish, look, sketch]);

  useEffect(() => {
    if (phase !== "drawing") return;
    const id = setInterval(tick, 120);
    return () => clearInterval(id);
  }, [phase, tick]);

  /* ---------------- controls ---------------- */

  const giveUp = useCallback(() => finish("gaveup"), [finish]);
  const next = useCallback(() => load(), [load]);
  const skip = useCallback(() => {
    if (phaseRef.current === "ready" && dealRef.current) load(dealRef.current.word);
  }, [load]);

  return {
    phase,
    deal,
    lanes,
    winner,
    startedAt,
    endedAt,
    cost,
    error,
    demo,
    final,
    endReason: endReason.current,
    begin,
    nudge: tick,
    giveUp,
    next,
    skip,
    retry: next,
  };
}
