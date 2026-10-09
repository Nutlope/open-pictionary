import { useEffect, useState } from "react";

/** Sheets float as cards from 640px up and rise from the bottom below it. */
export function useWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const m = matchMedia("(min-width: 640px)");
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}
