/**
 * Four tiny synthesized sounds, no audio files. Quiet by design: a guess is a
 * soft pitched tick (each lane has its own note, so a burst of guesses reads
 * as a little chord), a close call is a two-note lift, the win is a bright
 * three-note chime.
 */
const KEY = "dd:sound";
const EVENT = "dd:sound";
let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function onSoundChange(fn: () => void) {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

function ac(): AudioContext | null {
  if (typeof window === "undefined" || !soundOn()) return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function note(freq: number, at: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// A pentatonic set, so any overlap of lane ticks stays consonant.
const LANE_NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

export const sound = {
  /** Call from a user gesture so iOS lets audio play later. */
  unlock() {
    ac();
  },
  tick(lane: number) {
    note(LANE_NOTES[lane % LANE_NOTES.length] ?? 660, 0, 0.09, 0.035, "triangle");
  },
  close() {
    note(659.25, 0, 0.12, 0.04, "triangle");
    note(880, 0.07, 0.16, 0.04, "triangle");
  },
  solve() {
    note(783.99, 0, 0.2, 0.045);
    note(1046.5, 0.06, 0.24, 0.04);
  },
  win() {
    note(523.25, 0, 0.32, 0.06);
    note(659.25, 0.08, 0.34, 0.06);
    note(783.99, 0.16, 0.38, 0.06);
    note(1046.5, 0.26, 0.6, 0.05);
  },
};
