/**
 * The referee, part one: everything that can be decided without a model.
 * Pure, so the client can use it too (to clean a guess for display).
 */
const ARTICLES = new Set(["a", "an", "the", "some", "my"]);
/** Words that dress a guess up without changing what it names. */
const FILLER = new Set([
  "drawing", "sketch", "doodle", "picture", "image", "cartoon", "simple", "of", "icon",
  "outline", "shape", "symbol", "emoji", "little", "small", "big", "cute", "face", "head",
]);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singular(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && /(ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) return w.slice(0, -1);
  return w;
}

function canon(s: string): string {
  const words = normalize(s).split(" ").filter((w) => w && !ARTICLES.has(w));
  return words.map(singular).join(" ");
}

function stripFiller(s: string): string {
  const words = s.split(" ");
  const kept = words.filter((w) => !FILLER.has(w));
  return kept.length ? kept.join(" ") : s;
}

/** Levenshtein, capped: we only care about 0, 1 or "more". */
function within1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Clean a raw model reply into a guess: first line, no "it's a", no
 * punctuation, at most four words.
 */
export function cleanGuess(raw: string): string {
  let s = raw.replace(/<think>[\s\S]*?(<\/think>|$)/gi, " ");
  s = s.split(/\n/).map((l) => l.trim()).find(Boolean) ?? "";
  s = s.replace(/^(guess|answer|final answer)\s*[:\-]\s*/i, "");
  s = s.replace(/^(it'?s|it is|this is|that'?s|i think it'?s|looks like|i see)\s+/i, "");
  s = normalize(s).split(" ").filter((w, i) => !(i === 0 && ARTICLES.has(w))).slice(0, 4).join(" ");
  return s.slice(0, 40);
}

export type Verdict = "correct" | "close" | "wrong";

/**
 * Instant verdict, or null when only a model can tell (synonyms the list
 * missed, and "hot dog" for "dog" type traps).
 */
export function quickJudge(guess: string, word: string, also: string[]): Verdict | null {
  const g = canon(guess);
  if (!g) return "wrong";
  const gs = stripFiller(g);
  for (const form of [word, ...also]) {
    const f = canon(form);
    if (!f) continue;
    if (g === f || gs === f) return "correct";
    if (g.replace(/ /g, "") === f.replace(/ /g, "") || gs.replace(/ /g, "") === f.replace(/ /g, "")) return "correct";
    // Typo tolerance only on long words: "house" and "horse" are one edit apart.
    if (f.length >= 8 && (within1(g, f) || within1(gs, f))) return "correct";
  }
  return null;
}
