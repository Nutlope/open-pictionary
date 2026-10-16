"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { IconBrandGithub, IconCheck, IconPencil, IconStarFilled, IconTrophy, IconVolume, IconVolumeOff } from "@tabler/icons-react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { onSoundChange, setSoundOn, soundOn } from "./sound";
import { board } from "./live";

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

export function DockItem({ id, icon, className, children, onWarm, ...rest }: ItemProps & { onWarm?: () => void }) {
  const { set } = useContext(Hot);
  const cls = cn("dock-item", icon && "dock-item-icon", className);
  // Touch has no hover: a tap must not leave the highlight behind.
  const enter = (e: React.PointerEvent) => {
    onWarm?.();
    if (e.pointerType === "mouse") set(id);
  };
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
  // Reaching for it is enough to start loading the board, so it opens full.
  const warm = () => void board.refresh();
  return (
    <DockItem id="board" onClick={onClick} onWarm={warm} onFocus={warm} aria-label="Leaderboard" className="max-sm:w-9 max-sm:justify-center max-sm:px-0">
      <IconTrophy size={17} stroke={2} />
      <span className="hidden sm:inline">Leaderboard</span>
    </DockItem>
  );
}

/**
 * The day's page: a tiny tear-off calendar with today's number on it. Once
 * drawn, the page flips over to a check.
 */
function DayTile({ d, done }: { d: number; done: boolean }) {
  return (
    <span className="relative grid h-[18px] w-4 overflow-hidden rounded-[4px] bg-white shadow-[inset_0_0_0_1.5px_var(--ink)]" aria-hidden>
      <span className="absolute inset-x-0 top-0 h-[5px] bg-ink" />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={done ? "done" : "d"}
          initial={{ rotateX: -90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={{ rotateX: 90, opacity: 0 }}
          transition={spring}
          style={{ transformOrigin: "50% 0%" }}
          className={cn("col-start-1 row-start-1 mt-[5px] grid place-items-center", done && "bg-[#00A870] text-white")}
        >
          {done ? <IconCheck size={9} stroke={4} /> : <span className="tx-num text-[9px] leading-none font-extrabold">{d}</span>}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** The way between free play and the daily. */
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
      <DayTile d={d} done={played} />
      <span>Daily</span>
    </DockItem>
  );
}

/** Open source: the repo, with its star count rolling in once GitHub answers. */
export function StarButton() {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/stars")
      .then((r) => r.json())
      .then((j: { stars: number | null }) => live && setStars(j.stars))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const n = stars == null ? null : stars >= 1000 ? `${(stars / 1000).toFixed(stars >= 10_000 ? 0 : 1)}k` : String(stars);
  return (
    <a
      href={BRAND.repoUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${BRAND.name} on GitHub${stars != null ? `, ${stars} stars` : ""}`}
      className="dock group h-[42px] shrink-0 gap-0 px-3 sm:px-3.5 text-[0.875rem] font-semibold text-ink transition-transform active:scale-95"
    >
      <IconBrandGithub size={18} stroke={2} />
      <AnimatePresence initial={false}>
        {n != null ? (
          <motion.span
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            transition={spring}
            className="flex items-center gap-1 overflow-hidden whitespace-nowrap max-sm:hidden"
          >
            <span className="ml-2 h-4 w-px bg-ink/15" />
            <IconStarFilled size={13} className="ml-1 text-ink/70 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:scale-125 group-hover:rotate-[72deg] group-hover:text-[#FFB020]" />
            <span className="tx-num">{n}</span>
          </motion.span>
        ) : null}
      </AnimatePresence>
    </a>
  );
}
