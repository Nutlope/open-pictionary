"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { IconCheck, IconPencil, IconTrophy, IconVolume, IconVolumeOff } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { onSoundChange, setSoundOn, soundOn } from "./sound";

const spring = { type: "spring", stiffness: 480, damping: 34 } as const;

export function SoundToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(soundOn());
    return onSoundChange(() => setOn(soundOn()));
  }, []);
  return (
    <button type="button" className={cn("pill pill-icon", className)} aria-label={on ? "Mute sounds" : "Turn sounds on"} onClick={() => setSoundOn(!on)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={String(on)} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring}>
          {on ? <IconVolume size={18} stroke={2} /> : <IconVolumeOff size={18} stroke={2} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export function BoardButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="pill" onClick={onClick} aria-label="Leaderboard">
      <IconTrophy size={17} stroke={2} />
      <span className="hidden sm:inline">Leaderboard</span>
    </button>
  );
}

/**
 * The way between free play and the daily. On the free table it shows
 * today's number, with a live dot until you have drawn it and a check after.
 */
export function DailyPill({ mode, d, played }: { mode: "free" | "daily"; d: number; played: boolean }) {
  if (mode === "daily") {
    return (
      <Link href="/" className="pill" prefetch>
        <IconPencil size={17} stroke={2} />
        Free play
      </Link>
    );
  }
  return (
    <Link href="/daily" className="pill" prefetch aria-label={`Daily doodle number ${d}${played ? ", done" : ""}`}>
      {played ? (
        <span className="grid size-[18px] place-items-center rounded-full bg-[#00A870] text-white">
          <IconCheck size={12} stroke={3.2} />
        </span>
      ) : (
        <span className="live-dot relative size-2.5 rounded-full bg-[#F2442E]" aria-hidden />
      )}
      <span>
        Daily <span className="tx-num text-ink-2">#{d}</span>
      </span>
    </Link>
  );
}
