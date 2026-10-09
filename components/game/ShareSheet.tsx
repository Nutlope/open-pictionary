"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconBrandX, IconCheck, IconCopy, IconDownload, IconShare2, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useScrollLock } from "./useScrollLock";

export type ShareTarget = { id: string; url: string; text: string; word: string };

/**
 * The share sheet. What gets shared is a link to a live replay (the doodle
 * redraws itself while the six models race again), with a preview card made
 * for feeds, and a dare: beat this time on the same word.
 */
export function ShareSheet({ target, onClose }: { target: ShareTarget | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [canNative, setCanNative] = useState(false);
  const [wide, setWide] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);
  useScrollLock(!!target);

  useEffect(() => {
    setCanNative(typeof navigator !== "undefined" && "share" in navigator && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
    const m = matchMedia("(min-width: 640px)");
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (!target) return;
    setCopied(false);
    setLoaded(false);
    const t = setTimeout(() => closeRef.current?.focus(), 80);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", esc);
    };
  }, [target, onClose]);

  const image = target ? `/r/${target.id}/opengraph-image` : "";

  const copy = async () => {
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.url);
    } catch {
      const i = document.createElement("textarea");
      i.value = target.url;
      document.body.appendChild(i);
      i.select();
      document.execCommand("copy");
      i.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const download = async () => {
    if (!target) return;
    const blob = await fetch(image).then((r) => r.blob());
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `doodle-derby-${target.word.replace(/\s+/g, "-")}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const native = async () => {
    if (!target) return;
    try {
      await navigator.share({ title: "doodle derby", text: target.text, url: target.url });
    } catch {}
  };

  const xUrl = target
    ? `https://x.com/intent/post?text=${encodeURIComponent(target.text)}&url=${encodeURIComponent(target.url)}`
    : "#";

  return (
    <AnimatePresence>
      {target ? (
        <>
          <motion.button
            key="scrim"
            aria-label="Close"
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default bg-ink/30 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div key="sheet-wrap" className={cn("pointer-events-none fixed inset-0 z-50 flex justify-center", wide ? "items-center p-4" : "items-end")}>
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Share this round"
            initial={wide ? { opacity: 0, y: 24, scale: 0.96 } : { y: "100%" }}
            animate={wide ? { opacity: 1, y: 0, scale: 1 } : { y: 0 }}
            exit={wide ? { opacity: 0, y: 16, scale: 0.97, transition: { duration: 0.15 } } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className={cn(
              "pointer-events-auto bg-card p-4 shadow-[var(--float)] sm:p-5",
              wide ? "w-[min(560px,100%)] rounded-[28px]" : "w-full rounded-t-[28px] pb-[max(1rem,env(safe-area-inset-bottom))]",
            )}
          >
            <div className="flex items-start justify-between gap-4 px-1">
              <div>
                <h2 className="tx-display">Send the replay</h2>
                <p className="tx-small mt-1 text-ink-2">
                  Friends watch your doodle redraw itself while the models race again. Then they get your word and your time to beat.
                </p>
              </div>
              <button ref={closeRef} onClick={onClose} aria-label="Close" className="pill pill-icon -mt-1 -mr-1 shrink-0 bg-card-2 shadow-none">
                <IconX size={18} stroke={2.2} />
              </button>
            </div>

            {/* the card, exactly as it will unfurl in a feed */}
            <div className="relative mt-4 aspect-[1200/630] overflow-hidden rounded-2xl bg-card-2">
              {!loaded ? (
                <div className="absolute inset-0 grid animate-pulse place-items-center bg-card-2">
                  <span className="tx-label text-ink-3">Making your card…</span>
                </div>
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt="Preview of the shared card"
                onLoad={() => setLoaded(true)}
                className={cn("h-full w-full object-cover transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0")}
              />
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-card-2 p-1.5 pl-4">
              <span className="tx-small min-w-0 flex-1 truncate text-ink-2">{target.url.replace(/^https?:\/\//, "")}</span>
              <button type="button" onClick={copy} className="pill pill-ink h-10 shrink-0">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={String(copied)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-1.5"
                  >
                    {copied ? <IconCheck size={17} stroke={2.6} /> : <IconCopy size={17} stroke={2} />}
                    {copied ? "Copied" : "Copy link"}
                  </motion.span>
                </AnimatePresence>
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              {canNative ? (
                <button type="button" onClick={native} className="pill col-span-2 h-12 justify-center bg-ink text-white">
                  <IconShare2 size={18} stroke={2} />
                  Share to an app
                </button>
              ) : null}
              <a href={xUrl} target="_blank" rel="noopener noreferrer" className="pill h-11 justify-center bg-card-2 shadow-none">
                <IconBrandX size={17} stroke={2} />
                Post on X
              </a>
              <button type="button" onClick={download} className="pill h-11 justify-center bg-card-2 shadow-none">
                <IconDownload size={17} stroke={2} />
                Save image
              </button>
            </div>
          </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
