import { RACERS, RACER_BY_KEY, onColor, type RacerKey, type Shape } from "@/lib/racers";
import { BODIES, CROWN_PATH, GLYPH_PATH } from "@/lib/creatures";
import { SPACE, paint, strokeAt, strokePath, type Stroke } from "@/lib/sketch";
import type { ReplayGuess } from "@/lib/replay";

/**
 * The vertical clip: a round retold in a few seconds for Stories, Reels and
 * TikTok. The word hides as blanks, the doodle draws itself, the seven
 * creatures blurt their guesses in bubbles, and the winner's color floods
 * the room when one gets it. Drawn frame by frame on a 1080x1920 canvas, so
 * the same function feeds the live preview and the video encoder.
 */
export type ClipDoc = {
  word: string;
  strokes: number[][];
  log: ReplayGuess[];
  winner: RacerKey | null;
  winMs: number | null;
  endMs: number;
  room: string;
  daily?: number | null;
  site: string;
};

export const CLIP_W = 1080;
export const CLIP_H = 1920;
export const CLIP_FPS = 30;

const INK = "#16130f";
const SAD = "#E6E0D6";
const INTRO = 0.6;
const HOLD = 2.9;
/** However long the round took, the drawing plays in at most this long. */
const MAX_DRAW = 4.4;

const PAPER = { x: 90, y: 490, s: 900, r: 72 };
const ROW_Y = 1676;
const CREATURE = 116;
/** Seven creatures across the frame, centered. */
const colX = (i: number) => CLIP_W / 2 + (i - (RACERS.length - 1) / 2) * 134;

export type Timeline = { speed: number; drawEnd: number; total: number; winAt: number | null; T: number };

export function timeline(doc: ClipDoc): Timeline {
  const T = doc.winMs ?? doc.endMs;
  const speed = Math.max(1, T / (MAX_DRAW * 1000));
  const drawEnd = INTRO + T / speed / 1000;
  return { speed, drawEnd, total: drawEnd + HOLD, winAt: doc.winMs != null ? drawEnd : null, T };
}

/** Round time shown at video time v. After the win it runs at real speed, so late solvers still land. */
function roundAt(v: number, tl: Timeline, end: number) {
  if (v <= tl.drawEnd) return Math.max(0, (v - INTRO) * 1000 * tl.speed);
  return Math.min(Math.max(end, tl.T), tl.T + (v - tl.drawEnd) * 1000);
}

/** Video time at which a round moment happens. */
function videoAt(t: number, tl: Timeline) {
  return t <= tl.T ? INTRO + t / tl.speed / 1000 : tl.drawEnd + (t - tl.T) / 1000;
}

/* ---------------- easing ---------------- */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const outCubic = (t: number) => 1 - (1 - t) ** 3;
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const outBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
const hop = (t: number) => (t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t));

export type ClipCache = {
  font: string;
  strokes: Map<number, Stroke>;
  bodies: Map<Shape, Path2D>;
  glyph: Path2D;
  crown: Path2D;
  flecks: { a: number; s: number; r: number; c: string; w: number; round: boolean }[];
};

export function clipCache(doc: ClipDoc, font: string): ClipCache {
  let seed = [...doc.word].reduce((n, c) => n * 31 + c.charCodeAt(0), 7) >>> 0;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const winColor = doc.winner ? RACER_BY_KEY[doc.winner].color : INK;
  const palette = [winColor, winColor, winColor, ...RACERS.map((r) => r.color)];
  return {
    font,
    strokes: new Map(),
    bodies: new Map(),
    glyph: new Path2D(GLYPH_PATH),
    crown: new Path2D(CROWN_PATH),
    flecks: Array.from({ length: 70 }, () => ({
      a: rand() * Math.PI * 2,
      s: 700 + rand() * 900,
      r: (rand() - 0.5) * 12,
      c: palette[Math.floor(rand() * palette.length)],
      w: 14 + rand() * 12,
      round: rand() < 0.35,
    })),
  };
}

function bodyPath(cache: ClipCache, shape: Shape) {
  let p = cache.bodies.get(shape);
  if (!p) {
    p = new Path2D();
    for (const prim of BODIES[shape].prims) {
      if ("c" in prim) {
        p.moveTo(prim.c[0] + prim.c[2], prim.c[1]);
        p.arc(prim.c[0], prim.c[1], prim.c[2], 0, Math.PI * 2);
      } else if ("r" in prim) p.roundRect(prim.r[0], prim.r[1], prim.r[2], prim.r[3], prim.r[4]);
      else p.addPath(new Path2D(prim.d));
    }
    cache.bodies.set(shape, p);
  }
  return p;
}

function font(c: ClipCache, weight: number, px: number) {
  return `${weight} ${px}px ${c.font}`;
}

/* ---------------- pieces ---------------- */

type Mood = "idle" | "thinking" | "happy" | "sad";

function drawCreature(
  ctx: CanvasRenderingContext2D,
  cache: ClipCache,
  k: RacerKey,
  x: number,
  y: number,
  size: number,
  mood: Mood,
  look: [number, number],
) {
  const r = RACER_BY_KEY[k];
  const b = BODIES[r.shape];
  const s = size / 64;
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(s, s);
  const body = bodyPath(cache, r.shape);
  ctx.fillStyle = r.color;
  ctx.fill(body);
  if (b.round) {
    ctx.strokeStyle = r.color;
    ctx.lineWidth = b.round;
    ctx.lineJoin = "round";
    ctx.stroke(body);
  }
  const lx = 32 - b.gap;
  const rx = 32 + b.gap;
  const ey = b.eyeY;
  if (mood === "happy") {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    for (const ex of [lx, rx]) {
      ctx.beginPath();
      ctx.moveTo(ex - 5, ey + 1.5);
      ctx.quadraticCurveTo(ex, ey - 5, ex + 5, ey + 1.5);
      ctx.stroke();
    }
  } else {
    for (const ex of [lx, rx]) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(ex, ey, 6.6, 7.6, 0, 0, Math.PI * 2);
      ctx.fill();
      const px = ex + look[0] * 2.8;
      const py = ey + look[1] * 2.4 + (mood === "sad" ? 1.6 : 0);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(px, py, mood === "sad" ? 3.1 : 3.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(px + 1.2, py - 1.3, 1.1, 0, Math.PI * 2);
      ctx.fill();
      if (mood === "thinking") {
        ctx.fillStyle = r.color;
        ctx.fillRect(ex - 7.5, ey - 8.4, 15, 8.4);
      }
    }
  }
  ctx.restore();
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** Draw the clip at video time v (seconds) into a context scaled to 1080x1920. */
export function drawClip(ctx: CanvasRenderingContext2D, doc: ClipDoc, v: number, cache: ClipCache) {
  const tl = timeline(doc);
  const r = roundAt(v, tl, doc.endMs);
  const winner = doc.winner ? RACER_BY_KEY[doc.winner] : null;
  const winIndex = winner ? RACERS.findIndex((x) => x.key === winner.key) : -1;
  const sinceWin = tl.winAt != null ? v - tl.winAt : -1;
  const ended = v >= tl.drawEnd;
  const revealAt = tl.winAt ?? tl.drawEnd + 0.3;
  const revealed = v >= revealAt;

  ctx.save();
  ctx.textBaseline = "alphabetic";

  /* the room, and the winner's color pouring in */
  ctx.fillStyle = doc.room;
  ctx.fillRect(0, 0, CLIP_W, CLIP_H);
  if (winner && sinceWin >= 0) {
    const k = inOutCubic(clamp01(sinceWin / 0.9));
    ctx.fillStyle = winner.room;
    ctx.beginPath();
    ctx.arc(colX(winIndex), ROW_Y, 40 + k * 2300, 0, Math.PI * 2);
    ctx.fill();
  } else if (!winner && ended) {
    ctx.globalAlpha = clamp01((v - tl.drawEnd) / 0.6);
    ctx.fillStyle = SAD;
    ctx.fillRect(0, 0, CLIP_W, CLIP_H);
    ctx.globalAlpha = 1;
  }

  /* header: the mark and the name, and the daily number */
  ctx.save();
  ctx.translate(86, 76);
  ctx.scale(1.7, 1.7);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(cache.glyph);
  ctx.fillStyle = "#F2442E";
  ctx.beginPath();
  ctx.arc(25, 13.5, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(25, 13.5, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = INK;
  ctx.font = font(cache, 800, 50);
  ctx.fillText("open pictionary", 150, 126);
  if (doc.daily) {
    ctx.font = font(cache, 700, 36);
    const label = `daily #${doc.daily}`;
    const w = ctx.measureText(label).width + 52;
    pill(ctx, CLIP_W - 90 - w, 82, w, 64, "rgba(255,255,255,0.55)");
    ctx.fillStyle = INK;
    ctx.fillText(label, CLIP_W - 90 - w + 26, 126);
  }

  /* the word: blanks until someone gets it */
  ctx.textAlign = "center";
  ctx.font = font(cache, 750, 54);
  ctx.fillStyle = "rgba(22,19,15,0.66)";
  ctx.fillText(revealed ? (winner ? `${winner.label} got it` : "nobody got it") : "can you guess it?", CLIP_W / 2, 262);
  let size = 150;
  ctx.font = font(cache, 800, size);
  const fullW = ctx.measureText(doc.word).width;
  if (fullW > 900) {
    size = Math.floor((size * 900) / fullW);
    ctx.font = font(cache, 800, size);
  }
  const letters = [...doc.word];
  const widths = letters.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = CLIP_W / 2 - total / 2;
  ctx.textAlign = "left";
  letters.forEach((ch, i) => {
    const w = widths[i];
    const t = clamp01((v - revealAt - i * 0.045) / 0.32);
    if (ch !== " ") {
      if (t < 1) {
        ctx.fillStyle = "rgba(22,19,15,0.32)";
        const bw = w * 0.74 * (1 - t * 0.7);
        ctx.beginPath();
        ctx.roundRect(x + (w - bw) / 2, 420 - size * 0.07, bw, Math.max(14, size * 0.1), 10);
        ctx.fill();
      }
      if (t > 0) {
        const e = outBack(t);
        ctx.save();
        ctx.globalAlpha = clamp01(t * 2);
        ctx.translate(x + w / 2, 420);
        ctx.scale(0.6 + 0.4 * e, 0.6 + 0.4 * e);
        ctx.translate(0, (1 - e) * 40);
        ctx.fillStyle = INK;
        ctx.fillText(ch, -w / 2, 0);
        ctx.restore();
      }
    }
    x += w;
  });

  /* the paper, a little squash when the stamp lands */
  const squash = sinceWin > 0.3 ? 1 - 0.012 * hop(clamp01((sinceWin - 0.3) / 0.3)) : 1;
  ctx.save();
  ctx.translate(PAPER.x + PAPER.s / 2, PAPER.y + PAPER.s / 2);
  ctx.scale(squash, squash);
  ctx.translate(-(PAPER.x + PAPER.s / 2), -(PAPER.y + PAPER.s / 2));
  ctx.shadowColor = "rgba(22,19,15,0.26)";
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 28;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(PAPER.x, PAPER.y, PAPER.s, PAPER.s, PAPER.r);
  ctx.fill();
  ctx.shadowColor = "transparent";

  let pen: [number, number] | null = null;
  const strokes: Stroke[] = [];
  doc.strokes.forEach((flat, i) => {
    const hit = cache.strokes.get(i);
    if (hit) return strokes.push(hit);
    const s = strokeAt(flat, Math.min(r, tl.T));
    if (!s) return;
    if (s.done) cache.strokes.set(i, s);
    else pen = [s.points.at(-1)![0], s.points.at(-1)![1]];
    strokes.push(s);
  });
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(PAPER.x, PAPER.y, PAPER.s, PAPER.s, PAPER.r);
  ctx.clip();
  ctx.translate(PAPER.x, PAPER.y);
  ctx.scale(PAPER.s / SPACE, PAPER.s / SPACE);
  paint(ctx, strokes, INK);
  // A bolder line than the paper on screen: it has to read on a phone at arm's length.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  for (const s of strokes) if (s.points.length) ctx.stroke(strokePath(s));
  ctx.restore();
  ctx.restore();

  /* the clock, until the stamp takes its place */
  const clockOut = sinceWin >= 0 ? clamp01(sinceWin / 0.15) : 0;
  if (clockOut < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - clockOut;
    const label = `${(Math.min(r, tl.T) / 1000).toFixed(1)}s`;
    ctx.font = font(cache, 800, 52);
    const w = Math.max(212, ctx.measureText("00.0s").width + 104);
    const px = PAPER.x + PAPER.s - 30 - w;
    const py = PAPER.y + 30;
    ctx.shadowColor = "rgba(22,19,15,0.16)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    pill(ctx, px, py, w, 92, "#fff");
    ctx.shadowColor = "transparent";
    ctx.fillStyle = ended ? "rgba(22,19,15,0.2)" : "#F2442E";
    ctx.beginPath();
    ctx.arc(px + 44, py + 46, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.fillText(label, px + 72, py + 64);
    ctx.restore();
  }

  /* the field */
  const look = (cx: number, cy: number): [number, number] => {
    const tx = pen ? PAPER.x + (pen[0] / SPACE) * PAPER.s : CLIP_W / 2;
    const ty = pen ? PAPER.y + (pen[1] / SPACE) * PAPER.s : PAPER.y + PAPER.s / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    const d = Math.hypot(dx, dy) || 1;
    return [dx / d, dy / d];
  };
  const indexed = doc.log.map((e, i) => ({ ...e, i, at: videoAt(e.t, tl) }));
  RACERS.forEach((racer, i) => {
    const mine = indexed.filter((e) => e.k === racer.key);
    const seen = mine.filter((e) => e.at <= v);
    const last = seen.at(-1);
    const solved = seen.find((e) => e.v === "correct");
    const next = mine.find((e) => e.at > v);
    const cx = colX(i);
    let dy = 0;
    let dx = 0;
    let rot = 0;
    if (last) {
      const age = v - last.at;
      dy -= 14 * hop(age / 0.3);
      if (last.v === "wrong" && age > 0.12 && age < 0.5) {
        const p = (age - 0.12) / 0.38;
        dx = Math.sin(p * Math.PI * 4) * 7 * (1 - p);
        rot = Math.sin(p * Math.PI * 4) * 0.06 * (1 - p);
      }
    }
    if (solved) dy -= 30 * hop((v - solved.at - 0.1) / 0.5);
    const mood: Mood = solved ? "happy" : next && next.t - r < 1300 && !ended ? "thinking" : ended && seen.length ? "sad" : "idle";

    ctx.save();
    ctx.translate(cx + dx, ROW_Y + dy);
    ctx.rotate(rot);
    drawCreature(ctx, cache, racer.key, 0, 0, CREATURE, mood, look(cx, ROW_Y));
    if (winner?.key === racer.key && sinceWin > 0.15) {
      const t = outBack(clamp01((sinceWin - 0.15) / 0.4));
      ctx.save();
      ctx.translate(-CREATURE * 0.38, -CREATURE * 0.62 - (1 - t) * 60);
      ctx.rotate(-0.21);
      ctx.globalAlpha = clamp01(t * 2);
      const s = (CREATURE * 0.55) / 32;
      ctx.scale(s, s);
      ctx.fillStyle = "#FFC531";
      ctx.fill(cache.crown);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke(cache.crown);
      ctx.restore();
    }
    ctx.restore();

    /* its latest guess, in a bubble */
    if (!last) return;
    const age = v - last.at;
    const life = last.v === "correct" ? Infinity : last.v === "close" ? 1.5 : 1.1;
    if (age > life) return;
    const fade = last.v === "correct" ? 1 : clamp01((life - age) / 0.2);
    const pop = outBack(clamp01(age / 0.2));
    const judged = age > 0.12;
    const text = judged && last.v === "correct" ? `${last.g}!` : last.g;
    ctx.font = font(cache, 750, 44);
    const label = fitText(ctx, text, 300);
    const w = ctx.measureText(label).width + 48;
    const h = 80;
    const bottom = i % 2 === 0 ? 1592 : 1500;
    const bx = Math.max(56, Math.min(CLIP_W - 56 - w, cx - w / 2));
    const fill = !judged ? "#fff" : last.v === "correct" ? racer.color : last.v === "close" ? "#FFF1D6" : "#fff";
    const ink = !judged ? INK : last.v === "correct" ? onColor(racer.color) : last.v === "close" ? "#B45309" : "rgba(22,19,15,0.45)";
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(cx, bottom);
    ctx.scale(0.5 + 0.5 * pop, 0.5 + 0.5 * pop);
    ctx.translate(-cx, -bottom);
    ctx.shadowColor = "rgba(22,19,15,0.18)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(bx, bottom - h, w, h, h / 2);
    ctx.moveTo(cx - 12, bottom - 2);
    ctx.lineTo(cx, bottom + 14);
    ctx.lineTo(cx + 12, bottom - 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = ink;
    ctx.textAlign = "left";
    ctx.fillText(label, bx + 24, bottom - h / 2 + 15);
    if (judged && last.v === "wrong") {
      const p = outCubic(clamp01((age - 0.12) / 0.25));
      ctx.fillStyle = ink;
      ctx.fillRect(bx + 18, bottom - h / 2 - 1, (w - 36) * p, 5);
    }
    ctx.restore();
  });

  /* the stamp */
  if (winner && doc.winMs != null && sinceWin > 0.1) {
    const t = clamp01((sinceWin - 0.1) / 0.38);
    const e = outBack(t);
    ctx.save();
    ctx.globalAlpha = clamp01(t * 3);
    ctx.translate(PAPER.x + PAPER.s - 150, PAPER.y + 150);
    ctx.rotate((-10 + (1 - e) * 26) * (Math.PI / 180));
    ctx.scale(2.3 - 1.3 * e, 2.3 - 1.3 * e);
    ctx.shadowColor = "rgba(22,19,15,0.3)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = winner.color;
    ctx.beginPath();
    ctx.arc(0, 0, 128, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, 122, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = winner.color;
    ctx.beginPath();
    ctx.arc(0, 0, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = onColor(winner.color);
    ctx.textAlign = "center";
    ctx.font = font(cache, 650, 30);
    ctx.fillText("got it in", 0, -22);
    ctx.font = font(cache, 800, 78);
    ctx.fillText(`${(doc.winMs / 1000).toFixed(1)}s`, 0, 50);
    ctx.restore();
  }

  /* confetti */
  if (winner && sinceWin > 0.2 && sinceWin < 2.4) {
    const t = sinceWin - 0.2;
    const ox = PAPER.x + PAPER.s - 150;
    const oy = PAPER.y + 150;
    for (const f of cache.flecks) {
      const px = ox + Math.cos(f.a) * f.s * t * 0.9;
      const py = oy + Math.sin(f.a) * f.s * t * 0.9 - 300 * t + 1500 * t * t;
      ctx.save();
      ctx.globalAlpha = clamp01((2.2 - t) / 0.5);
      ctx.translate(px, py);
      ctx.rotate(f.r * t);
      ctx.fillStyle = f.c;
      if (f.round) {
        ctx.beginPath();
        ctx.arc(0, 0, f.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(-f.w / 2, -f.w / 4, f.w, f.w / 2);
      ctx.restore();
    }
  }

  /* where to play */
  ctx.textAlign = "center";
  ctx.font = font(cache, 700, 40);
  const cta = `your turn: ${doc.site}`;
  const cw = ctx.measureText(cta).width + 72;
  const show = ended ? clamp01((v - tl.drawEnd - 0.9) / 0.4) : 0;
  const k = show > 0 ? 0.86 + 0.14 * outBack(show) : 1;
  ctx.translate(CLIP_W / 2, 1838);
  ctx.scale(k, k);
  ctx.translate(-CLIP_W / 2, -1838);
  pill(ctx, CLIP_W / 2 - cw / 2, 1796, cw, 84, show > 0 ? INK : "rgba(255,255,255,0.5)");
  ctx.fillStyle = show > 0 ? "#fff" : "rgba(22,19,15,0.75)";
  ctx.fillText(show > 0 ? cta : doc.site, CLIP_W / 2, 1852);
  ctx.restore();
}

/** The family name the page is already using, for the canvas. */
export function pageFont() {
  return getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
}
