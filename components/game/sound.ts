/**
 * Tiny synthesized sounds, no audio files. Quiet by design: a guess is a soft
 * pitched tick (each lane has its own note, so a burst of guesses reads as a
 * little chord), a close call is a two-note lift, and every creature wins with
 * its own short tune. The pen scratches faintly while it moves.
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

/** [frequency, start, duration] in seconds. */
type Tune = { notes: [number, number, number][]; type: OscillatorType; gain: number };

// A pentatonic set, so any overlap of lane ticks stays consonant.
const LANE_NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

// One victory tune per creature, in field order, each in its character.
const TUNES: Tune[] = [
  // the show-off: a bright, confident climb
  { type: "triangle", gain: 0.06, notes: [[523.25, 0, 0.3], [659.25, 0.07, 0.3], [783.99, 0.14, 0.34], [1046.5, 0.22, 0.6]] },
  // the professor: measured fourths
  { type: "sine", gain: 0.065, notes: [[392, 0, 0.36], [523.25, 0.12, 0.36], [659.25, 0.24, 0.4], [783.99, 0.36, 0.7]] },
  // the sprinter: a quick run up
  { type: "triangle", gain: 0.055, notes: [[659.25, 0, 0.16], [783.99, 0.045, 0.16], [880, 0.09, 0.18], [1046.5, 0.135, 0.2], [1318.5, 0.18, 0.5]] },
  // the diva: a big leap and a long held top note
  { type: "triangle", gain: 0.06, notes: [[440, 0, 0.3], [554.37, 0.1, 0.3], [659.25, 0.2, 0.3], [1318.5, 0.32, 0.9]] },
  // the monk: low, slow, settled
  { type: "sine", gain: 0.075, notes: [[261.63, 0, 0.6], [392, 0.16, 0.6], [523.25, 0.32, 1]] },
  // the little one: high and bouncy
  { type: "triangle", gain: 0.045, notes: [[1046.5, 0, 0.14], [1174.66, 0.07, 0.14], [1318.5, 0.14, 0.14], [1567.98, 0.22, 0.4]] },
];

/* ------------------------------------------------------------------
   The pen: filtered noise that follows the stroke's speed, like graphite
   on paper. Built once, started on pen-down, faded on pen-up.
   ------------------------------------------------------------------ */
let grain: AudioBuffer | null = null;
let pen: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

function grainOf(a: AudioContext) {
  if (grain) return grain;
  const len = Math.floor(a.sampleRate * 1.2);
  const b = a.createBuffer(1, len, a.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = 0.55 * last + 0.45 * (Math.random() * 2 - 1);
    // Sparse ticks: the tooth of the paper.
    d[i] = last * (Math.random() < 0.015 ? 2.4 : 1);
  }
  return (grain = b);
}

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
  win(lane: number) {
    const t = TUNES[lane] ?? TUNES[0];
    for (const [f, at, dur] of t.notes) note(f, at, dur, t.gain, t.type);
  },
  /** Backing a champion: a soft pop. */
  pick() {
    note(880, 0, 0.08, 0.04, "sine");
    note(1318.5, 0.04, 0.12, 0.035, "sine");
  },
  /** A new personal best, or a called winner: a little sparkle on top of the win. */
  sparkle(at = 0.7) {
    note(1567.98, at, 0.18, 0.03, "sine");
    note(2093, at + 0.07, 0.22, 0.028, "sine");
    note(2637, at + 0.14, 0.3, 0.022, "sine");
  },
  pen: {
    down() {
      const a = ac();
      if (!a || pen) return;
      const src = a.createBufferSource();
      src.buffer = grainOf(a);
      src.loop = true;
      const filter = a.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2200;
      filter.Q.value = 0.8;
      const gain = a.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(a.destination);
      src.start();
      pen = { src, gain, filter };
    },
    /** Speed in drawing units per ms; louder and brighter as the pen moves faster. */
    move(speed: number) {
      if (!pen || !ctx) return;
      const s = Math.min(1, speed / 2.6);
      const t = ctx.currentTime;
      pen.gain.gain.setTargetAtTime(0.018 * s, t, 0.03);
      pen.filter.frequency.setTargetAtTime(1700 + s * 1700, t, 0.05);
    },
    up() {
      if (!pen || !ctx) return;
      const { src, gain } = pen;
      const t = ctx.currentTime;
      gain.gain.setTargetAtTime(0, t, 0.035);
      src.stop(t + 0.25);
      pen = null;
    },
  },
};
