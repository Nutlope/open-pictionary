"use client";

import { useEffect, useId, useRef } from "react";
import { motion, useAnimationControls } from "motion/react";
import { RACER_BY_KEY, type RacerKey, type Shape } from "@/lib/racers";

/* ------------------------------------------------------------------
   Gaze: one pointer listener and one animation loop for every creature
   on the page. Pupils ease toward the pen; when the pen rests, they
   drift back to the middle. Writes transforms straight to the DOM so
   watching never re-renders React.
   ------------------------------------------------------------------ */
type Eye = { el: SVGGElement; x: number; y: number };
const eyes = new Set<Eye>();
let pointer: { x: number; y: number; t: number } | null = null;
let raf = 0;
let listening = false;

function loop() {
  raf = 0;
  const now = performance.now();
  const fresh = pointer && now - pointer.t < 2600;
  let moving = false;
  for (const e of eyes) {
    let tx = 0;
    let ty = 0;
    if (fresh && pointer) {
      const r = e.el.ownerSVGElement?.getBoundingClientRect();
      if (r) {
        const dx = pointer.x - (r.left + r.width / 2);
        const dy = pointer.y - (r.top + r.height * 0.6);
        const d = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, d / 160);
        tx = (dx / d) * 3 * reach;
        ty = (dy / d) * 3 * reach;
      }
    }
    e.x += (tx - e.x) * 0.22;
    e.y += (ty - e.y) * 0.22;
    if (Math.abs(tx - e.x) > 0.02 || Math.abs(ty - e.y) > 0.02) moving = true;
    e.el.style.transform = `translate(${e.x.toFixed(2)}px, ${e.y.toFixed(2)}px)`;
  }
  if (moving || fresh) raf = requestAnimationFrame(loop);
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
  const on = (e: PointerEvent) => {
    pointer = { x: e.clientX, y: e.clientY, t: performance.now() };
    kick();
  };
  window.addEventListener("pointermove", on, { passive: true });
  window.addEventListener("pointerdown", on, { passive: true });
}

/* ------------------------------------------------------------------
   Bodies. 64x64 boxes, eyes placed per shape.
   ------------------------------------------------------------------ */
const BODY: Record<Shape, { eyeY: number; gap: number; draw: (c: string) => React.ReactNode }> = {
  circle: { eyeY: 33, gap: 10, draw: (c) => <circle cx="32" cy="33" r="27" fill={c} /> },
  square: { eyeY: 33, gap: 10, draw: (c) => <rect x="6" y="7" width="52" height="52" rx="15" fill={c} /> },
  triangle: {
    eyeY: 41,
    gap: 9,
    draw: (c) => <path d="M32 10 L57 54 L7 54 Z" fill={c} stroke={c} strokeWidth="9" strokeLinejoin="round" />,
  },
  pill: { eyeY: 33, gap: 11, draw: (c) => <rect x="3" y="14" width="58" height="38" rx="19" fill={c} /> },
  drop: {
    eyeY: 40,
    gap: 9.5,
    draw: (c) => <path d="M32 3 C 40 14, 57 28, 57 40 A 25 22 0 0 1 7 40 C 7 28, 24 14, 32 3 Z" fill={c} />,
  },
  flower: {
    eyeY: 33,
    gap: 9.5,
    draw: (c) => (
      <g fill={c}>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return <circle key={i} cx={32 + Math.cos(a) * 17} cy={33 + Math.sin(a) * 17} r="11" />;
        })}
        <circle cx="32" cy="33" r="19" />
      </g>
    ),
  },
};

export type Mood = "idle" | "thinking" | "happy" | "sad";
export type Pulse = { kind: "hop" | "shake" | "jump"; n: number } | null;

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
  const body = BODY[r.shape];
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

  return (
    <motion.div animate={controls} className={className} style={{ width: size, height: size, position: "relative", flexShrink: 0 }}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="overflow-visible">
        {body.draw(r.color)}
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
            {/* Lids drop halfway while it thinks. */}
            <g className={mood === "thinking" ? "creature-think" : undefined}>
              <rect className="lid" x={lx - 7.5} y={ey - 9} width="15" height="8.2" fill={r.color} />
              <rect className="lid" x={rx - 7.5} y={ey - 9} width="15" height="8.2" fill={r.color} />
            </g>
          </g>
        )}
      </svg>
      {crown ? (
        <motion.svg
          viewBox="0 0 32 22"
          aria-hidden
          initial={{ y: -26, opacity: 0, rotate: -25 }}
          animate={{ y: 0, opacity: 1, rotate: -12 }}
          transition={{ type: "spring", stiffness: 420, damping: 14, delay: 0.15 }}
          style={{ position: "absolute", width: size * 0.55, left: size * 0.06, top: -size * 0.32 }}
        >
          <path d="M3 19 L1.5 5 L9.5 11 L16 2 L22.5 11 L30.5 5 L29 19 Z" fill="#FFC531" stroke="#16130f" strokeWidth="2" strokeLinejoin="round" />
        </motion.svg>
      ) : null}
    </motion.div>
  );
}
