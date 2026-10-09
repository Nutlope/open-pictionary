"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconBrandX, IconCheck, IconCopy, IconDownload, IconLink, IconPhoto, IconShare2, IconVideo, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { CLIP_H, CLIP_W, clipCache, drawClip, pageFont, timeline, type ClipDoc } from "./clip";
import { encodeClip, videoSupport } from "./encode";
import { useScrollLock } from "./useScrollLock";
import { useWide } from "./useWide";

export type ShareTarget = {
  clip: ClipDoc;
  /** The pasteable result, given the link once there is one. */
  text: (url: string | null) => string;
  /** Resolves to the link to send: a replay, or the daily. */
  link: () => Promise<{ url: string; image: string } | { error: string }>;
  file: string;
  /** The clip shows a doodle of today's daily word. */
  spoiler?: boolean;
};

const spring = { type: "spring", stiffness: 420, damping: 36 } as const;

/** The clip, playing on a loop in a phone-shaped frame. Tap to start over. */
function ClipPreview({ doc, className }: { doc: ClipDoc; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const start = useRef(0);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(c.clientWidth * dpr);
    c.height = Math.round(c.clientHeight * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const cache = clipCache(doc, pageFont());
    const loop = timeline(doc).total + 0.9;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    start.current = performance.now();
    let raf = 0;
    const frame = () => {
      const v = still ? loop - 1 : ((performance.now() - start.current) / 1000) % loop;
      ctx.setTransform(c.width / CLIP_W, 0, 0, c.height / CLIP_H, 0, 0);
      drawClip(ctx, doc, v, cache);
      if (!still) raf = requestAnimationFrame(frame);
    };
    document.fonts.ready.then(() => (raf = requestAnimationFrame(frame)));
    return () => cancelAnimationFrame(raf);
  }, [doc]);
  return (
    <button
      type="button"
      onClick={() => (start.current = performance.now())}
      className={cn("relative block aspect-[9/16] overflow-hidden rounded-[22px] bg-card-2 shadow-[var(--lift-hi)]", className)}
      aria-label="Your clip. Tap to play it from the start."
    >
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    </button>
  );
}

type Video = { state: "off" | "making" | "ready" | "failed"; progress: number; file: File | null };

/**
 * The share sheet. Three ways out, all prepared the moment it opens: the
 * result as text with a link (Wordle style), a vertical video of the round,
 * and the link's own card.
 */
export function ShareSheet({ target, onClose }: { target: ShareTarget | null; onClose: () => void }) {
  const wide = useWide();
  const [link, setLink] = useState<{ url: string; image: string } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"result" | "link" | null>(null);
  const [video, setVideo] = useState<Video>({ state: "off", progress: 0, file: null });
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [mobile, setMobile] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wantVideo = useRef(false);
  useScrollLock(!!target);

  useEffect(() => {
    setMobile(/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) && "share" in navigator);
  }, []);

  // Opening: a clean slate, focus on close, and Escape. Not repeated when the
  // round it shows updates underneath (a model answering late).
  const isOpen = !!target;
  useEffect(() => {
    if (!isOpen) return;
    setLink(null);
    setLinkError(null);
    setCopied(null);
    const t = setTimeout(() => closeRef.current?.focus(), 80);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", esc);
    };
  }, [isOpen, onClose]);

  const getLink = target?.link;
  useEffect(() => {
    if (!getLink) return;
    let live = true;
    getLink().then((r) => {
      if (!live) return;
      if ("error" in r) setLinkError(r.error);
      else {
        setLink(r);
        setLinkError(null);
      }
    });
    return () => {
      live = false;
    };
  }, [getLink]);

  // The video is made in the background as soon as the sheet opens, so it
  // is usually ready by the time anyone reaches for it.
  const clip = target?.clip;
  const fileName = target?.file;
  useEffect(() => {
    if (!clip) return;
    let live = true;
    const abort = new AbortController();
    wantVideo.current = false;
    setVideo({ state: "off", progress: 0, file: null });
    videoSupport().then((ok) => {
      if (!ok || !live) return;
      setVideo({ state: "making", progress: 0, file: null });
      encodeClip(clip, pageFont(), (p) => live && setVideo((v) => ({ ...v, progress: p })), abort.signal)
        .then((blob) => {
          if (!live) return;
          const file = new File([blob], `${fileName}.mp4`, { type: "video/mp4" });
          setCanShareFiles(!!navigator.canShare?.({ files: [file] }));
          setVideo({ state: "ready", progress: 1, file });
        })
        .catch(() => live && setVideo({ state: "failed", progress: 0, file: null }));
    });
    return () => {
      live = false;
      abort.abort();
    };
  }, [clip, fileName]);

  const text = target ? target.text(link?.url ?? null) : "";

  const copy = async (what: "result" | "link") => {
    const value = what === "result" ? text : link?.url;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const i = document.createElement("textarea");
      i.value = value;
      document.body.appendChild(i);
      i.select();
      document.execCommand("copy");
      i.remove();
    }
    setCopied(what);
    setTimeout(() => setCopied((c) => (c === what ? null : c)), 1800);
  };

  const saveFile = useCallback((file: Blob, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, []);

  const sendVideo = useCallback(async () => {
    if (!target || !video.file) return;
    if (canShareFiles && mobile) {
      try {
        await navigator.share({ files: [video.file], text: target.text(link?.url ?? null) });
      } catch {}
    } else saveFile(video.file, video.file.name);
  }, [target, video.file, canShareFiles, mobile, link, saveFile]);

  // Asked for the video before it was ready: hand it over the moment it is,
  // where the browser allows that without a fresh tap.
  useEffect(() => {
    if (video.state === "ready" && wantVideo.current && !(canShareFiles && mobile)) {
      wantVideo.current = false;
      sendVideo();
    }
  }, [video.state, canShareFiles, mobile, sendVideo]);

  const saveImage = async () => {
    if (!link || !target) return;
    const blob = await fetch(link.image).then((r) => r.blob());
    saveFile(blob, `${target.file}.png`);
  };

  const native = async () => {
    try {
      await navigator.share({ text });
    } catch {}
  };

  const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
  const videoLabel = canShareFiles && mobile ? "Share video" : "Save video";

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
              transition={spring}
              className={cn(
                "pointer-events-auto bg-card p-4 shadow-[var(--float)] sm:p-5",
                wide ? "w-[min(660px,100%)] rounded-[28px]" : "w-full rounded-t-[28px] pb-[max(1rem,env(safe-area-inset-bottom))]",
              )}
            >
              <div className="flex items-start justify-between gap-4 px-1">
                <div>
                  <h2 className="tx-display">Share your round</h2>
                  <p className="tx-small mt-1 text-ink-2">
                    {target.spoiler
                      ? "Your result, spoiler free. The video shows your doodle, so it gives today's word away."
                      : "Friends get the replay with the word hidden, a box to guess it, and your time to beat."}
                  </p>
                </div>
                <button ref={closeRef} onClick={onClose} aria-label="Close" className="pill pill-icon -mt-1 -mr-1 shrink-0 bg-card-2 shadow-none">
                  <IconX size={18} stroke={2.2} />
                </button>
              </div>

              <div className="mt-4 flex gap-4 sm:gap-5">
                <ClipPreview doc={target.clip} className="w-[112px] shrink-0 sm:w-[212px]" />

                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  {/* the result, as it will paste */}
                  <div className="rounded-2xl bg-card-2 px-4 py-3">
                    <p className="tx-body font-semibold whitespace-pre-line [overflow-wrap:anywhere]">{text.split("\n").slice(0, 2).join("\n")}</p>
                    <p className="tx-small mt-1 truncate text-ink-3">
                      {link ? link.url.replace(/^https?:\/\//, "") : linkError ? linkError : "making your link…"}
                    </p>
                  </div>
                  <button type="button" onClick={() => copy("result")} disabled={!link && !linkError} className="pill pill-ink h-11 justify-center">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span
                        key={copied === "result" ? "y" : "n"}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="flex items-center gap-1.5"
                      >
                        {copied === "result" ? <IconCheck size={17} stroke={2.6} /> : <IconCopy size={17} stroke={2} />}
                        {copied === "result" ? "Copied" : "Copy result"}
                      </motion.span>
                    </AnimatePresence>
                  </button>

                  {video.state !== "off" && video.state !== "failed" ? (
                    <button
                      type="button"
                      onClick={() => (video.state === "ready" ? sendVideo() : (wantVideo.current = true))}
                      className="pill relative h-11 justify-center overflow-hidden bg-card-2 shadow-none max-sm:hidden"
                    >
                      {video.state === "making" ? (
                        <span className="absolute inset-y-0 left-0 bg-ink/8 transition-[width] duration-200" style={{ width: `${video.progress * 100}%` }} aria-hidden />
                      ) : null}
                      <span className="relative flex items-center gap-1.5">
                        {video.state === "ready" ? <IconDownload size={17} stroke={2} /> : <IconVideo size={17} stroke={2} />}
                        {video.state === "ready" ? videoLabel : `Making video ${Math.round(video.progress * 100)}%`}
                      </span>
                    </button>
                  ) : null}

                  <div className="grid grid-cols-3 gap-2 max-sm:hidden">
                    <a href={xUrl} target="_blank" rel="noopener noreferrer" className="pill h-10 justify-center bg-card-2 px-2 shadow-none" aria-label="Post on X">
                      <IconBrandX size={17} stroke={2} />
                      <span className="max-md:hidden">Post</span>
                    </a>
                    <button type="button" onClick={() => copy("link")} disabled={!link} className="pill h-10 justify-center bg-card-2 px-2 shadow-none" aria-label="Copy link">
                      {copied === "link" ? <IconCheck size={17} stroke={2.6} /> : <IconLink size={17} stroke={2} />}
                      <span className="max-md:hidden">{copied === "link" ? "Copied" : "Link"}</span>
                    </button>
                    <button type="button" onClick={saveImage} disabled={!link} className="pill h-10 justify-center bg-card-2 px-2 shadow-none" aria-label="Save the card image">
                      <IconPhoto size={17} stroke={2} />
                      <span className="max-md:hidden">Card</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* phones: one big button for the video, the rest in a row */}
              <div className="mt-3 flex flex-wrap gap-2 sm:hidden [&>*]:flex-1">
                {video.state !== "off" && video.state !== "failed" ? (
                  <button
                    type="button"
                    onClick={() => (video.state === "ready" ? sendVideo() : (wantVideo.current = true))}
                    className="pill relative h-12 basis-full justify-center overflow-hidden bg-card-2 shadow-none"
                  >
                    {video.state === "making" ? (
                      <span className="absolute inset-y-0 left-0 bg-ink/8 transition-[width] duration-200" style={{ width: `${video.progress * 100}%` }} aria-hidden />
                    ) : null}
                    <span className="relative flex items-center gap-1.5 font-semibold">
                      <IconVideo size={18} stroke={2} />
                      {video.state === "ready" ? videoLabel : `Making video ${Math.round(video.progress * 100)}%`}
                    </span>
                  </button>
                ) : null}
                {mobile ? (
                  <button type="button" onClick={native} className="pill h-11 justify-center bg-card-2 shadow-none" aria-label="Share">
                    <IconShare2 size={18} stroke={2} />
                  </button>
                ) : null}
                <a href={xUrl} target="_blank" rel="noopener noreferrer" className="pill h-11 justify-center bg-card-2 shadow-none" aria-label="Post on X">
                  <IconBrandX size={18} stroke={2} />
                </a>
                <button type="button" onClick={() => copy("link")} disabled={!link} className="pill h-11 justify-center bg-card-2 shadow-none" aria-label="Copy link">
                  {copied === "link" ? <IconCheck size={18} stroke={2.6} /> : <IconLink size={18} stroke={2} />}
                </button>
                <button type="button" onClick={saveImage} disabled={!link} className="pill h-11 justify-center bg-card-2 shadow-none" aria-label="Save the card image">
                  <IconPhoto size={18} stroke={2} />
                </button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
