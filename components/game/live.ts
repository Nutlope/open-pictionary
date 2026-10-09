import { useEffect, useState } from "react";
import type { Pulse, BoardRow } from "@/lib/server/stats";
import type { DailyBoard } from "@/lib/server/daily";

/**
 * The live numbers, fetched once and shared by every component that shows
 * them. The pulse polls gently while the tab is visible; the board loads
 * when someone opens it, and is reused for the model cards.
 */
export type { Pulse, BoardRow, DailyBoard };
export type Board = { rounds: number; rows: BoardRow[] };

function shared<T>(load: () => Promise<T>, maxAgeMs: number) {
  let value: T | null = null;
  let at = 0;
  let pending: Promise<T> | null = null;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  return {
    get: () => value,
    set(v: T) {
      value = v;
      at = Date.now();
      emit();
    },
    async refresh(force = false): Promise<T | null> {
      if (!force && value && Date.now() - at < maxAgeMs) return value;
      pending ??= load()
        .then((v) => {
          value = v;
          at = Date.now();
          emit();
          return v;
        })
        .finally(() => (pending = null));
      return pending.catch(() => value);
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => void subs.delete(f);
    },
  };
}

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

export const pulse = shared(() => json<Pulse>("/api/pulse"), 20_000);
export const board = shared(() => json<Board>("/api/board"), 30_000);

/**
 * The shared value, starting from what the server rendered with. The stores
 * live in module scope, so they are only ever touched in effects: on the
 * server they would be shared by every request.
 */
function useShared<T>(s: ReturnType<typeof shared<T>>, initial: T | null = null): T | null {
  const [v, setV] = useState<T | null>(initial);
  useEffect(() => {
    if (initial) s.set(initial);
    else if (s.get()) setV(s.get());
    return s.subscribe(() => setV(s.get()));
  }, [s, initial]);
  return v;
}

/** Live counter, daily player count and the wrong guess of the day. */
export function usePulse(initial?: Pulse | null): Pulse | null {
  const v = useShared(pulse, initial ?? null);
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const tick = () => document.visibilityState === "visible" && pulse.refresh();
    const start = () => {
      clearInterval(id);
      id = setInterval(tick, 30_000);
    };
    const t = setTimeout(() => (tick(), start()), initial ? 30_000 : 0);
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(t);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [initial]);
  return v;
}

export function useBoard(active: boolean): { data: Board | null; failed: boolean } {
  const data = useShared(board);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!active) return;
    board.refresh().then((v) => setFailed(!v));
  }, [active]);
  return { data, failed };
}
