/**
 * The daily doodle: one word a day, the same for everyone, numbered like a
 * puzzle. Days roll over at midnight UTC so the whole world shares one board.
 * Shared by client and server; the word itself is only ever chosen on the server.
 */
export const DAILY_EPOCH = Date.UTC(2026, 9, 9);
const DAY = 86_400_000;

/** #1 was 2026-10-09. */
export function dailyNumber(at = Date.now()) {
  return Math.floor((at - DAILY_EPOCH) / DAY) + 1;
}

export function dailyEndsAt(n: number) {
  return DAILY_EPOCH + n * DAY;
}

/** "5h 12m", "12m", "40s": how long until the next word. */
export function untilNext(n: number, now = Date.now()) {
  const ms = Math.max(0, dailyEndsAt(n) - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.ceil(ms / 1000)}s`;
}
