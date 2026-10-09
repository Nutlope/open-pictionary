"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconKey } from "@tabler/icons-react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Bring your own Together key. It lives in this browser's localStorage only and
 * rides along in the request body; the server prefers it over the house key,
 * so a visitor with a key pays for their own races and skips the free limits.
 */
const STORAGE_KEY = "together:api-key";
const EVENT = "together:key-change";

export function useTogetherKey() {
  const [apiKey, setState] = useState("");
  useEffect(() => {
    const read = () => {
      try {
        setState(localStorage.getItem(STORAGE_KEY) ?? "");
      } catch {}
    };
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  const setApiKey = useCallback((v: string) => {
    try {
      if (v.trim()) localStorage.setItem(STORAGE_KEY, v.trim());
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { apiKey, setApiKey, hasKey: apiKey.length > 0 };
}

export function KeyControl({ className, align = "right" }: { className?: string; align?: "right" | "left" }) {
  const { apiKey, setApiKey, hasKey } = useTogetherKey();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(apiKey);
    const t = setTimeout(() => input.current?.focus(), 60);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", esc);
    };
  }, [open, apiKey]);

  const save = () => {
    setApiKey(draft);
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      <button type="button" className="pill" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {hasKey ? <span className="size-2 rounded-full bg-[#00A870]" aria-hidden /> : <IconKey size={16} stroke={2} />}
        <span>{hasKey ? "Your key" : "Use your key"}</span>
      </button>
      <AnimatePresence>
        {open ? (
          <>
            <button aria-label="Close" tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
            <motion.div
              role="dialog"
              aria-label="Your Together API key"
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.12 } }}
              transition={{ type: "spring", stiffness: 520, damping: 34 }}
              style={{ transformOrigin: align === "right" ? "top right" : "top left" }}
              className={cn(
                "sticker absolute top-full z-50 mt-2 w-[19rem] p-4 shadow-[var(--float)]",
                align === "right" ? "right-0" : "left-0",
              )}
            >
              <p className="tx-name">Race on your own key</p>
              <p className="tx-small mt-1 text-ink-2">No free limits. Each round costs you about a cent or less.</p>
              <input
                ref={input}
                type="password"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="Paste your Together key"
                autoComplete="off"
                spellCheck={false}
                className="tx-body mt-3 h-11 w-full rounded-xl bg-card-2 px-3.5 text-ink outline-none ring-ink/0 transition-shadow placeholder:text-ink-3 focus:ring-2 focus:ring-ink"
              />
              <p className="tx-small mt-2 text-ink-3">Stays in this browser. Never stored or logged on our side.</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <a href={BRAND.keysUrl} target="_blank" rel="noopener noreferrer" className="tx-small font-semibold underline decoration-ink-4 underline-offset-4 hover:decoration-ink">
                  Get a key
                </a>
                <span className="flex gap-1.5">
                  {hasKey ? (
                    <button
                      type="button"
                      className="pill pill-ghost h-9 bg-card-2"
                      onClick={() => {
                        setApiKey("");
                        setDraft("");
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                  <button type="button" className="pill pill-ink h-9" onClick={save}>
                    Save
                  </button>
                </span>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
