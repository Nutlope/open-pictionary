"use client";

import { AnimatePresence, motion } from "motion/react";
import { IconFlameFilled } from "@tabler/icons-react";

/**
 * The streak, as a small flame that only shows up once there is something to
 * lose. It pops when it grows, and drops away when it breaks.
 */
export function StreakChip({ n, unit, title }: { n: number; unit?: string; title: string }) {
  return (
    <AnimatePresence initial={false}>
      {n >= 2 ? (
        <motion.span
          key="streak"
          title={title}
          initial={{ opacity: 0, scale: 0.4, rotate: -20 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, y: 14, rotate: 24, transition: { duration: 0.35, ease: [0.5, 0, 0.75, 0] } }}
          transition={{ type: "spring", stiffness: 520, damping: 18 }}
          className="tx-label inline-flex items-center gap-1 rounded-full bg-ink py-1 pr-2.5 pl-1.5 text-white"
        >
          <motion.span key={n} initial={{ scale: 1.8, rotate: -16 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 480, damping: 12 }} className="flex">
            <IconFlameFilled size={14} className="text-[#FF8A3D]" />
          </motion.span>
          <span className="relative inline-grid overflow-hidden tx-num">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={n} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "-100%" }} transition={{ type: "spring", stiffness: 420, damping: 28 }}>
                {n}
              </motion.span>
            </AnimatePresence>
          </span>
          {unit ? <span className="text-white/70">{unit}</span> : null}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

/** The dealt word, letter by letter. */
export function Word({ word }: { word: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.h1 key={word} className="tx-word flex whitespace-pre" aria-label={word} exit={{ opacity: 0, y: -18, transition: { duration: 0.15 } }}>
        {word.split("").map((ch, i) => (
          <motion.span
            key={i}
            aria-hidden
            initial={{ opacity: 0, y: 28, rotate: 8, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, rotate: 0, filter: "blur(0px)" }}
            transition={{ type: "spring", stiffness: 520, damping: 26, delay: i * 0.035 }}
            className="inline-block"
          >
            {ch}
          </motion.span>
        ))}
      </motion.h1>
    </AnimatePresence>
  );
}
