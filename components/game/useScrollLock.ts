import { useEffect } from "react";

/** Keep the page still behind an open sheet (phones scroll-chain otherwise). */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, [locked]);
}
