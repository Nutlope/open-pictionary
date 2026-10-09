"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { IconCheck, IconPencil, IconTrophy, IconVolume, IconVolumeOff } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { onSoundChange, setSoundOn, soundOn } from "./sound";

const spring = { type: "spring", stiffness: 480, damping: 34 } as const;

/* ------------------------------------------------------------------
   The dock: the header's controls as one frosted capsule that takes on the
   room's color, instead of a row of white buttons. A soft highlight glides
   to whichever item the pointer is on.
   ------------------------------------------------------------------ */
const Hot = createContext<{ hot: string | null; set: (id: string | null) => void }>({ hot: null, set: () => {} });

export function Dock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [hot, set] = useState<string | null>(null);
  return (
    <Hot.Provider value={{ hot, set }}>
      <div className={cn("dock", className)} onPointerLeave={() => set(null)}>
        {children}
      </div>
    </Hot.Provider>
  );
}

function Glow({ id }: { id: string }) {
  const { hot } = useContext(Hot);
  return (
    <AnimatePresence>
      {hot === id ? (
        <motion.span
          layoutId="dock-glow"
          aria-hidden
          className="absolute inset-0 rounded-full bg-white/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ type: "spring", stiffness: 520, damping: 40 }}
        />
      ) : null}
    </AnimatePresence>
  );
}

type ItemProps = { id: string; icon?: boolean; className?: string; children: React.ReactNode } & (
  | ({ href: string } & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children" | "id">)
  | ({ href?: undefined } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "id">)
);

export function DockItem({ id, icon, className, children, ...rest }: ItemProps) {
  const { set } = useContext(Hot);
  const cls = cn("dock-item", icon && "dock-item-icon", className);
  // Touch has no hover: a tap must not leave the highlight behind.
  const enter = (e: React.PointerEvent) => e.pointerType === "mouse" && set(id);
  const inner = (
    <>
      <Glow id={id} />
      <span className="relative flex items-center gap-[inherit]">{children}</span>
    </>
  );
  if (rest.href != null) {
    const { href, ...link } = rest;
    return (
      <Link href={href} className={cls} onPointerEnter={enter} {...link}>
        {inner}
      </Link>
    );
  }
  const { href: _, ...button } = rest;
  return (
    <button type="button" className={cls} onPointerEnter={enter} {...button}>
      {inner}
    </button>
  );
}

/* ---------------- the items ---------------- */

export function SoundToggle({ inDock, className }: { inDock?: boolean; className?: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(soundOn());
    return onSoundChange(() => setOn(soundOn()));
  }, []);
  const label = on ? "Mute sounds" : "Turn sounds on";
  const icon = (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span key={String(on)} className="flex" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring}>
        {on ? <IconVolume size={18} stroke={2} /> : <IconVolumeOff size={18} stroke={2} />}
      </motion.span>
    </AnimatePresence>
  );
  if (inDock) {
    return (
      <DockItem id="sound" icon className={className} aria-label={label} title={label} onClick={() => setSoundOn(!on)}>
        {icon}
      </DockItem>
    );
  }
  return (
    <button type="button" className={cn("pill pill-ghost pill-icon", className)} aria-label={label} onClick={() => setSoundOn(!on)}>
      {icon}
    </button>
  );
}

export function BoardButton({ onClick }: { onClick: () => void }) {
  return (
    <DockItem id="board" onClick={onClick} aria-label="Leaderboard" className="max-sm:w-9 max-sm:justify-center max-sm:px-0">
      <IconTrophy size={17} stroke={2} />
      <span className="hidden sm:inline">Leaderboard</span>
    </DockItem>
  );
}

/**
 * The way between free play and the daily. On the free table it shows
 * today's number, with a live dot until you have drawn it and a check after.
 */
export function DailyPill({ mode, d, played }: { mode: "free" | "daily"; d: number; played: boolean }) {
  if (mode === "daily") {
    return (
      <DockItem id="daily" href="/" prefetch>
        <IconPencil size={17} stroke={2} />
        Free play
      </DockItem>
    );
  }
  return (
    <DockItem id="daily" href="/daily" prefetch aria-label={`Daily doodle number ${d}${played ? ", done" : ""}`}>
      {played ? (
        <span className="grid size-4 place-items-center rounded-full bg-[#00A870] text-white">
          <IconCheck size={11} stroke={3.4} />
        </span>
      ) : (
        <span className="live-dot relative size-2 rounded-full bg-[#F2442E]" aria-hidden />
      )}
      <span>
        Daily <span className="tx-num opacity-60">#{d}</span>
      </span>
    </DockItem>
  );
}
