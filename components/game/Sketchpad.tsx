"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { SPACE, paint, snapshot, strokeLength, type Point, type Stroke } from "@/lib/sketch";
import { cn } from "@/lib/utils";
import { lookAt } from "./Creature";
import { sound } from "./sound";

export type SketchpadHandle = {
  undo: () => void;
  clear: () => void;
  /** Total ink laid down, in logical px. Grows while a stroke is in progress. */
  ink: () => number;
  strokeCount: () => number;
  snapshot: (size: number) => string | null;
  strokes: () => Stroke[];
  /** Show a finished drawing (packed [x, y, t] strokes), read-only. */
  load: (packed: number[][]) => void;
};

const INK = "#14181f";
// A small round nib for a cursor, so the paper feels like paper.
const CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Ccircle cx='8' cy='8' r='3.2' fill='%2314181f'/%3E%3Ccircle cx='8' cy='8' r='5.5' fill='none' stroke='%2314181f' stroke-opacity='.25'/%3E%3C/svg%3E") 8 8, crosshair`;

export function Sketchpad({
  ref,
  locked,
  onStrokeStart,
  onChange,
  className,
}: {
  ref?: Ref<SketchpadHandle>;
  locked: boolean;
  onStrokeStart?: () => void;
  /** Fires on every ink change, at most once per frame. */
  onChange?: () => void;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const inkDone = useRef(0);
  const active = useRef<{ id: number; stroke: Stroke } | null>(null);
  const frame = useRef(0);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const cb = useRef({ onStrokeStart, onChange });
  cb.current = { onStrokeStart, onChange };

  const draw = () => {
    frame.current = 0;
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const k = c.width / SPACE;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    paint(ctx, strokes.current, INK);
  };

  const schedule = () => {
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        draw();
        cb.current.onChange?.();
      });
    }
  };

  useImperativeHandle(ref, () => ({
    undo() {
      if (active.current) return;
      const s = strokes.current.pop();
      if (s) inkDone.current = Math.max(0, inkDone.current - strokeLength(s.points));
      schedule();
    },
    clear() {
      if (active.current) sound.pen.up();
      active.current = null;
      strokes.current = [];
      inkDone.current = 0;
      schedule();
    },
    ink() {
      const a = active.current;
      return inkDone.current + (a ? strokeLength(a.stroke.points) : 0);
    },
    strokeCount() {
      return strokes.current.length;
    },
    snapshot(size: number) {
      return snapshot(strokes.current, size);
    },
    strokes() {
      return strokes.current;
    },
    load(packed) {
      active.current = null;
      strokes.current = packed.map((flat) => {
        const points: Point[] = [];
        for (let i = 0; i + 1 < flat.length; i += 3) points.push([flat[i], flat[i + 1], 0.5]);
        return { points, done: true };
      });
      inkDone.current = strokes.current.reduce((n, s) => n + strokeLength(s.points), 0);
      schedule();
    },
  }));

  // The moment the paper locks (a win, the horn), a stroke still under the
  // pen ends there: the doodle on screen is the doodle that was judged.
  useEffect(() => {
    const a = active.current;
    if (!locked || !a) return;
    a.stroke.done = true;
    inkDone.current += strokeLength(a.stroke.points);
    active.current = null;
    sound.pen.up();
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  // Keep the backing store matched to the element at device resolution.
  useEffect(() => {
    const el = wrap.current;
    const c = canvas.current;
    if (!el || !c) return;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = Math.round(el.clientWidth * dpr);
      if (w > 0 && c.width !== w) {
        c.width = w;
        c.height = w;
        draw();
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toLogical = (e: { clientX: number; clientY: number; pressure: number }): Point => {
    const r = canvas.current!.getBoundingClientRect();
    lookAt(e.clientX, e.clientY);
    return [((e.clientX - r.left) / r.width) * SPACE, ((e.clientY - r.top) / r.height) * SPACE, e.pressure || 0.5];
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (lockedRef.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (active.current) return; // second finger: ignore, no accidental pinch strokes
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer: draw without capture */
    }
    const stroke: Stroke = { points: [toLogical(e)], times: [performance.now()], done: false };
    strokes.current.push(stroke);
    active.current = { id: e.pointerId, stroke };
    cb.current.onStrokeStart?.();
    sound.pen.down();
    schedule();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const now = performance.now();
    const pts = a.stroke.points;
    const before = pts[pts.length - 1];
    const then = a.stroke.times?.[a.stroke.times.length - 1] ?? now;
    for (const ev of events.length ? events : [e.nativeEvent]) {
      pts.push(toLogical(ev));
      a.stroke.times?.push(now);
    }
    const last = pts[pts.length - 1];
    if (before && now > then) sound.pen.move(Math.hypot(last[0] - before[0], last[1] - before[1]) / (now - then));
    schedule();
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    a.stroke.done = true;
    inkDone.current += strokeLength(a.stroke.points);
    active.current = null;
    sound.pen.up();
    schedule();
  };

  return (
    <div ref={wrap} className={cn("relative aspect-square w-full", className)}>
      <canvas
        ref={canvas}
        aria-label="Drawing canvas"
        role="img"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        style={{ cursor: locked ? "default" : CURSOR }}
        className="absolute inset-0 h-full w-full touch-none select-none"
      />
    </div>
  );
}
