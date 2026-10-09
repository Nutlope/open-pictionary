/**
 * Daily board names. Picked from two short lists instead of typed, so the
 * board never needs moderating and every name sounds like it belongs here.
 */
const ADJ = [
  "sleepy", "brave", "fuzzy", "tiny", "sneaky", "jolly", "wobbly", "speedy", "cosmic", "crispy",
  "lucky", "mellow", "zippy", "bouncy", "cheeky", "dizzy", "fancy", "gentle", "happy", "jazzy",
  "loopy", "merry", "nifty", "peppy", "quirky", "snappy", "toasty", "witty", "zesty", "breezy",
  "chunky", "dapper", "fluffy", "giddy", "plucky", "swift", "velvet", "sunny", "salty", "spicy",
];
const NOUN = [
  "waffle", "otter", "noodle", "pickle", "panda", "muffin", "badger", "dumpling", "penguin", "taco",
  "walrus", "bagel", "koala", "pretzel", "llama", "nugget", "hedgehog", "biscuit", "narwhal", "pancake",
  "raccoon", "turnip", "yeti", "gecko", "crumpet", "moose", "sprout", "wombat", "mango", "puffin",
  "kiwi", "pebble", "comet", "squid", "toucan", "marmot", "radish", "ferret", "croissant", "lemur",
];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function randomName(): string {
  return `${pick(ADJ)} ${pick(NOUN)}`;
}

export function isName(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const [a, n, ...rest] = s.split(" ");
  return rest.length === 0 && ADJ.includes(a) && NOUN.includes(n);
}
