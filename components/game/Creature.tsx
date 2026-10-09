"use client";

import { useEffect, useId, useRef } from "react";
import { motion, useAnimationControls } from "motion/react";
import { RACER_BY_KEY, type RacerKey } from "@/lib/racers";
import { BODIES, CROWN_PATH, type Prim } from "@/lib/creatures";

/* ------------------------------------------------------------------
   Gaze: one pointer listener and one animation loop for every creature
   on the page. Pupils ease toward the pen; when the pen rests, each
   creature glances around on its own, now and then. Writes transforms
   straight to the DOM so watching never re-renders React.
   ------------------------------------------------------------------ */
type Eye = { el: SVGGElement; x: number; y: number };
const eyes = new Set<Eye>();
const glances = new WeakMap<Element, { x: number; y: number; until: number }>();
let pointer: { x: number; y: number; t: number } | null = null;
let raf = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let listening = false;
let calm = false;

function glance(svg: Element, now: number) {
  let g = glances.get(svg);
  if (!g || now > g.until) {
    const look = Math.random() < 0.42;
    const a = Math.random() * Math.PI * 2;
    g = { x: look ? Math.cos(a) * 2.7 : 0, y: look ? Math.sin(a) * 1.7 : 0, until: now + 1300 + Math.random() * 2900 };
    glances.set(svg, g);
  }
  return g;
}

function loop() {
  raf = 0;
  const now = performance.now();
  const fresh = pointer && now - pointer.t < 2600;
  let moving = false;
  let next = Infinity;
  for (const e of eyes) {
    let tx = 0;
    let ty = 0;
    const svg = e.el.ownerSVGElement;
    if (fresh && pointer && svg) {
      const r = svg.getBoundingClientRect();
      const dx = pointer.x - (r.left + r.width / 2);
      const dy = pointer.y - (r.top + r.height * 0.6);
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, d / 160);
      tx = (dx / d) * 3 * reach;
      ty = (dy / d) * 3 * reach;
    } else if (svg && !calm) {
      const g = glance(svg, now);
      tx = g.x;
      ty = g.y;
      next = Math.min(next, g.until);
    }
    e.x += (tx - e.x) * 0.22;
    e.y += (ty - e.y) * 0.22;
    if (Math.abs(tx - e.x) > 0.02 || Math.abs(ty - e.y) > 0.02) moving = true;
    e.el.style.transform = `translate(${e.x.toFixed(2)}px, ${e.y.toFixed(2)}px)`;
  }
  clearTimeout(timer);
  if (moving || fresh) raf = requestAnimationFrame(loop);
  else if (next < Infinity && eyes.size) timer = setTimeout(kick, next - now + 20);
}

function kick() {
  if (!raf) raf = requestAnimationFrame(loop);
}

/** Point every creature's eyes at a screen position (the pen, or a replayed pen). */
export function lookAt(x: number, y: number) {
  pointer = { x, y, t: performance.now() };
  kick();
}

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const on = (e: PointerEvent) => {
    pointer = { x: e.clientX, y: e.clientY, t: performance.now() };
    kick();
  };
  window.addEventListener("pointermove", on, { passive: true });
  window.addEventListener("pointerdown", on, { passive: true });
}

/* ------------------------------------------------------------------
   Bodies
   ------------------------------------------------------------------ */
export function BodyShape({ prims, color, round }: { prims: Prim[]; color: string; round?: number }) {
  return (
    <g fill={color} stroke={round ? color : undefined} strokeWidth={round} strokeLinejoin="round">
      {prims.map((p, i) =>
        "c" in p ? (
          <circle key={i} cx={p.c[0]} cy={p.c[1]} r={p.c[2]} />
        ) : "r" in p ? (
          <rect key={i} x={p.r[0]} y={p.r[1]} width={p.r[2]} height={p.r[3]} rx={p.r[4]} />
        ) : (
          <path key={i} d={p.d} />
        ),
      )}
    </g>
  );
}

export type Mood = "idle" | "thinking" | "happy" | "sad" | "sleepy";
export type Pulse = { kind: "hop" | "shake" | "jump"; n: number } | null;

const LID: Record<Mood, number> = { idle: 0, thinking: 0.5, happy: 0, sad: 0.12, sleepy: 0.86 };

function Pupil({ cx, cy, mood }: { cx: number; cy: number; mood: Mood }) {
  const ref = useRef<SVGGElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    listen();
    const eye: Eye = { el, x: 0, y: 0 };
    eyes.add(eye);
    kick();
    return () => {
      eyes.delete(eye);
    };
  }, []);
  return (
    <g ref={ref} style={{ willChange: "transform" }}>
      <circle cx={cx} cy={cy + (mood === "sad" ? 1.6 : 0)} r={mood === "sad" ? 3.1 : 3.7} fill="#16130f" />
      <circle cx={cx + 1.2} cy={cy - 1.3} r="1.1" fill="#fff" />
    </g>
  );
}

export function Creature({
  k,
  size = 44,
  mood = "idle",
  pulse = null,
  crown = false,
  className,
}: {
  k: RacerKey;
  size?: number;
  mood?: Mood;
  pulse?: Pulse;
  crown?: boolean;
  className?: string;
}) {
  const r = RACER_BY_KEY[k];
  const body = BODIES[r.shape];
  const controls = useAnimationControls();
  const uid = useId();
  // Each creature blinks on its own rhythm.
  const blinkDelay = `${(uid.charCodeAt(uid.length - 2) % 9) * -0.53}s`;

  useEffect(() => {
    if (!pulse) return;
    if (pulse.kind === "hop") {
      controls.start({ y: [0, -7, 0], scaleY: [1, 1.06, 1], transition: { duration: 0.38, ease: [0.3, 1.4, 0.5, 1] } });
    } else if (pulse.kind === "shake") {
      controls.start({ x: [0, -3.5, 3.5, -2, 2, 0], rotate: [0, -4, 4, -2, 0], transition: { duration: 0.42 } });
    } else {
      controls.start({
        y: [0, -16, 0, -6, 0],
        rotate: [0, -8, 8, 0],
        scale: [1, 1.12, 0.96, 1.03, 1],
        transition: { duration: 0.8, ease: "easeOut" },
      });
    }
  }, [pulse, controls]);

  const lx = 32 - body.gap;
  const rx = 32 + body.gap;
  const ey = body.eyeY;
  const lid = LID[mood];

  return (
    <motion.div animate={controls} className={className} style={{ width: size, height: size, position: "relative", flexShrink: 0 }}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="overflow-visible">
        <BodyShape prims={body.prims} color={r.color} round={body.round} />
        {mood === "happy" ? (
          <g stroke="#16130f" strokeWidth="3.2" strokeLinecap="round" fill="none">
            <path d={`M${lx - 5} ${ey + 1.5} Q ${lx} ${ey - 5} ${lx + 5} ${ey + 1.5}`} />
            <path d={`M${rx - 5} ${ey + 1.5} Q ${rx} ${ey - 5} ${rx + 5} ${ey + 1.5}`} />
          </g>
        ) : (
          <g className="creature-blink" style={{ animationDelay: blinkDelay }}>
            <ellipse cx={lx} cy={ey} rx="6.6" ry="7.6" fill="#fff" />
            <ellipse cx={rx} cy={ey} rx="6.6" ry="7.6" fill="#fff" />
            <Pupil cx={lx} cy={ey} mood={mood} />
            <Pupil cx={rx} cy={ey} mood={mood} />
            {/* Lids: half down while it thinks, nearly shut when it dozes. */}
            <rect className="lid" x={lx - 7.5} y={ey - 8.4} width="15" height="16.8" fill={r.color} style={{ transform: `scaleY(${lid})` }} />
            <rect className="lid" x={rx - 7.5} y={ey - 8.4} width="15" height="16.8" fill={r.color} style={{ transform: `scaleY(${lid})` }} />
          </g>
        )}
      </svg>
      {mood === "sleepy" ? (
        <span aria-hidden className="creature-z pointer-events-none absolute font-extrabold text-ink" style={{ left: size * 0.78, top: -size * 0.12, fontSize: Math.max(10, size * 0.3) }}>
          z
        </span>
      ) : null}
      {crown ? (
        <motion.svg
          viewBox="0 0 32 22"
          aria-hidden
          initial={{ y: -26, opacity: 0, rotate: -25 }}
          animate={{ y: 0, opacity: 1, rotate: -12 }}
          transition={{ type: "spring", stiffness: 420, damping: 14, delay: 0.15 }}
          style={{ position: "absolute", width: size * 0.55, left: size * 0.06, top: -size * 0.32 }}
        >
          <path d={CROWN_PATH} fill="#FFC531" stroke="#16130f" strokeWidth="2" strokeLinejoin="round" />
        </motion.svg>
      ) : null}
    </motion.div>
  );
}
