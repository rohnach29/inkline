/**
 * Deterministic rhyme + scansion helpers for the verse engine.
 *
 * Rhyme is decided by a curated table: sound-families are declared as word
 * lists (FAMILY_WORDS), which covers English's irregular spelling honestly
 * (true/you, snow/go, said/unread). Any word not in the table falls back to
 * its "rime" — the spelling from the last vowel group to the end — which
 * groups regular pairs (door/floor, night/sight) for free.
 *
 * Syllables use a vowel-group heuristic (silent-e, consonant+le, y-as-vowel)
 * with a small exceptions map for the words the heuristic mis-hears.
 *
 * No randomness, no locale, no clock — pure string functions.
 */

const VOWELS = "aeiouy";

/** last word of a line, lowercased, punctuation stripped */
export function lastWord(line: string): string {
  const words = line
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/g, ""))
    .filter((w) => w.length > 0);
  const last = words[words.length - 1];
  return last ?? "";
}

/**
 * Sound-families as word lists. Each family is a set of words that rhyme by
 * ear even when they do not rhyme by spelling. The family key is arbitrary but
 * stable. Grow these lists as the couplet library needs new end-words.
 */
const FAMILY_WORDS: Record<string, readonly string[]> = {
  // /uː/
  OO: [
    "you", "true", "blue", "do", "to", "too", "two", "through", "threw",
    "knew", "grew", "new", "few", "view", "clue", "flew", "shoe", "who",
    "drew", "crew", "dew", "glue", "chew", "screw", "into", "undo",
  ],
  // /oʊ/
  OH: [
    "go", "so", "no", "snow", "know", "grow", "low", "slow", "glow", "flow",
    "show", "throw", "though", "toe", "ago", "below", "owe", "sew", "although",
    "window", "shadow", "tomorrow", "sorrow", "hello",
  ],
  // /ɛd/
  ED: [
    "said", "unread", "red", "bed", "head", "thread", "instead", "ahead",
    "led", "fled", "bread", "dead", "spread", "shed", "wed", "fed", "sled",
  ],
  // /ʊd/
  OOD: [
    "good", "should", "would", "could", "stood", "wood", "hood",
    "understood", "withstood",
  ],
  // /ɔr/
  OR: [
    "door", "floor", "more", "store", "before", "four", "your", "pour",
    "roar", "shore", "wore", "core", "score", "sore", "tore", "adore",
    "explore", "ignore", "for", "oar", "soar", "chore", "bore", "restore",
  ],
  // /iː/
  EE: [
    "me", "be", "he", "she", "we", "free", "tree", "three", "sea", "see",
    "key", "knee", "agree", "degree", "plea", "flea", "spree", "flee",
    "guarantee", "history", "memory", "company",
  ],
  // /aɪt/
  ITE: [
    "night", "light", "sight", "right", "bright", "tight", "flight", "might",
    "white", "bite", "kite", "write", "quite", "height", "delight",
    "tonight", "spite", "invite", "ignite", "goodnight",
  ],
  // /eɪ/
  AY: [
    "day", "way", "say", "play", "stay", "away", "gray", "grey", "pray",
    "sway", "weigh", "they", "hey", "obey", "delay", "today", "betray",
    "astray", "okay", "halfway", "anyway", "yesterday",
  ],
  // /ɑr/
  AR: [
    "far", "car", "star", "are", "scar", "jar", "bar", "guitar", "afar",
  ],
  // /oʊn/
  OWN: [
    "own", "known", "grown", "stone", "alone", "bone", "phone", "zone",
    "thrown", "shown", "groan", "moan", "loan", "unknown", "overgrown",
  ],
  // /aɪnd/
  IND: [
    "mind", "find", "kind", "blind", "behind", "signed", "lined", "grind",
    "designed", "combined", "unwind", "remind", "defined", "aligned",
  ],
  // /eɪk/
  AKE: [
    "make", "take", "wake", "lake", "snake", "brake", "break", "awake",
    "mistake", "sake", "shake", "stake", "ache", "daybreak", "keepsake",
  ],
  // /ʌn/
  UN: [
    "run", "sun", "done", "none", "one", "won", "fun", "begun", "undone",
    "ton", "son", "bun", "spun", "stun", "everyone", "someone",
  ],
  // /ænd/
  AND: [
    "and", "hand", "land", "stand", "sand", "band", "grand", "understand",
    "command", "planned", "unplanned", "expand", "withstand",
  ],
  // /ɪr/
  EAR: [
    "year", "near", "clear", "here", "appear", "disappear", "fear", "dear",
    "cheer", "hear", "sphere", "mere", "sincere", "frontier", "steer",
    "engineer", "career", "premier",
  ],
  // /eɪn/
  AIN: [
    "rain", "plain", "plane", "train", "gain", "pain", "main", "chain",
    "remain", "explain", "terrain", "brain", "lane", "vain", "vein",
    "reign", "contain", "sustain", "campaign", "again",
  ],
  // /eɪm/
  AME: [
    "name", "came", "same", "game", "flame", "blame", "frame", "claim",
    "aim", "shame", "became", "tame", "acclaim", "proclaim",
  ],
  // /ɑrt/
  ART: [
    "heart", "part", "start", "art", "apart", "cart", "chart", "smart",
    "dart", "depart", "counterpart", "restart",
  ],
  // /ɛst/
  EST: [
    "rest", "best", "west", "chest", "guest", "test", "quest", "pressed",
    "blessed", "confessed", "nest", "crest", "unrest", "addressed",
  ],
  // /ɛl/
  ELL: [
    "well", "tell", "fell", "bell", "shell", "spell", "swell", "dwell",
    "farewell", "hotel", "propel", "rebel", "compel",
  ],
  // /ɪl/
  ILL: [
    "still", "hill", "will", "fill", "chill", "thrill", "until", "uphill",
    "spill", "drill", "skill", "windmill", "standstill", "downhill",
  ],
  // /ɔl/
  ALL: [
    "all", "call", "fall", "tall", "wall", "small", "stall", "hall",
    "recall", "install", "overall", "waterfall", "nightfall",
  ],
  // /aʊt/
  OUT: [
    "out", "about", "without", "shout", "doubt", "throughout", "scout",
    "bout", "sprout", "devout", "rout", "workout", "runabout",
  ],
  // /iːp/
  EEP: [
    "deep", "keep", "sleep", "sweep", "steep", "leap", "cheap", "heap",
    "weep", "creep", "asleep", "upkeep", "oversleep",
  ],
  // /ɑrk/
  ARK: [
    "dark", "mark", "park", "spark", "bark", "lark", "remark", "arc",
    "landmark", "benchmark", "embark",
  ],
  // /iːt/
  EAT: [
    "feet", "street", "meet", "sweet", "beat", "heat", "seat", "complete",
    "repeat", "defeat", "greet", "sheet", "neat", "treat", "concrete",
    "heartbeat", "retreat",
  ],
  // /ɜːrst/
  ERST: [
    "first", "thirst", "burst", "worst", "versed", "cursed", "nursed",
    "rehearsed",
  ],
  // /oʊd/
  ROAD: [
    "road", "code", "load", "mode", "rode", "showed", "owed", "toad",
    "abode", "explode", "episode", "overload", "erode",
  ],
  // /oʊz/
  OZE: [
    "knows", "goes", "those", "rose", "chose", "close", "nose", "froze",
    "suppose", "arose", "prose", "grows", "throws", "shows", "flows",
    "glows", "toes", "compose", "expose", "doze",
  ],
  // /aɪd/
  IDE: [
    "side", "ride", "wide", "hide", "tide", "guide", "pride", "stride",
    "decide", "inside", "beside", "tried", "cried", "dried", "applied",
    "denied", "aside", "collide", "confide", "provide", "worldwide",
  ],
  // /oʊld/
  OLD: [
    "old", "cold", "gold", "hold", "told", "bold", "sold", "fold", "scold",
    "behold", "untold", "unfold", "uphold", "foretold",
  ],
  // /eɪs/
  ACE: [
    "face", "place", "race", "space", "grace", "trace", "chase", "base",
    "case", "embrace", "replace", "erase", "displace", "misplace", "commonplace",
  ],
  // /iːm/
  EAM: [
    "dream", "stream", "seem", "team", "gleam", "beam", "scheme", "extreme",
    "redeem", "esteem", "supreme", "downstream", "daydream",
  ],
  // /oʊt/
  OAT: [
    "coat", "boat", "note", "wrote", "float", "throat", "remote", "vote",
    "quote", "devote", "anecdote", "footnote", "afloat",
  ],
  // /ɛr/
  AIR: [
    "air", "care", "there", "where", "share", "stare", "bear", "wear",
    "pair", "fair", "hair", "chair", "spare", "aware", "prepare",
    "everywhere", "despair", "compare", "repair", "elsewhere", "unaware",
    "declare", "swear", "beware",
  ],
  // /aɪ/
  EYE: [
    "eye", "sky", "high", "by", "my", "why", "cry", "try", "lie", "tie",
    "goodbye", "reply", "sigh", "fly", "dry", "shy", "spy", "deny", "supply",
    "nearby", "sky", "buy", "guy", "apply", "rely", "goodbye", "occupy",
    "identify", "satisfy", "multiply", "alibi",
  ],
  // /ɪŋk/
  INK: [
    "think", "ink", "blink", "drink", "link", "sink", "wink", "brink",
    "shrink", "rink", "rethink", "unlink",
  ],
  // /uːn/
  OON: [
    "moon", "soon", "noon", "spoon", "tune", "june", "dune", "balloon",
    "afternoon", "cartoon", "monsoon", "lagoon", "harpoon",
  ],
  // /ɛlt/
  ELT: [
    "felt", "belt", "melt", "dealt", "knelt", "dwelt", "svelte", "pelt",
  ],
  // /ʌst/
  UST: [
    "dust", "must", "trust", "just", "rust", "gust", "crust", "thrust",
    "adjust", "distrust", "robust", "mistrust", "combust",
  ],
  // /iːl/
  EAL: [
    "real", "feel", "steel", "wheel", "heal", "deal", "meal", "peel",
    "reveal", "conceal", "appeal", "reel", "kneel", "ideal", "surreal",
  ],
  // /aʊnd/
  OUND: [
    "ground", "sound", "found", "round", "bound", "around", "pound",
    "wound", "mound", "profound", "surround", "astound", "background",
    "underground", "unbound",
  ],
};

const EXCEPTIONS = new Map<string, string>();
for (const [family, words] of Object.entries(FAMILY_WORDS)) {
  for (const w of words) {
    EXCEPTIONS.set(w, family);
  }
}

/** the "rime": spelling from the start of the last vowel group to the end. */
function rime(word: string): string {
  let i = word.length - 1;
  while (i >= 0 && !VOWELS.includes(word[i] as string)) i--;
  if (i < 0) return ""; // no vowel at all
  while (i >= 0 && VOWELS.includes(word[i] as string)) i--;
  return word.slice(i + 1);
}

/** rhyme family key via curated table + exceptions map; "" if unknown */
export function rhymeFamily(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return "";
  const exact = EXCEPTIONS.get(w);
  if (exact !== undefined) return exact;
  const r = rime(w);
  if (r === "") return "";
  // Prefix with a marker so a rime like "OO" can never collide with a family
  // key. Rimes are lowercase; family keys are uppercase.
  return `.${r}`;
}

const SYLLABLE_EXCEPTIONS: Record<string, number> = {
  kilometers: 5,
  kilometer: 4,
  quiet: 2,
  quietly: 3,
  pavement: 2,
  measured: 2,
  every: 2,
  little: 2,
  poem: 2,
  poems: 2,
  fire: 1,
  hour: 1,
  hours: 1,
  our: 1,
  ours: 1,
  evening: 2,
  different: 2,
  chocolate: 2,
  business: 2,
  interest: 2,
  travelled: 2,
  traveled: 2,
};

/** heuristic syllable count: vowel groups, silent-e, -le endings, y-as-vowel */
export function syllableCount(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  const pinned = SYLLABLE_EXCEPTIONS[w];
  if (pinned !== undefined) return pinned;

  const groups = w.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 0;

  // silent past-tense 'e' (mapped, pressed): "-ed" after a consonant other
  // than t or d is not its own syllable.
  if (w.endsWith("ed") && w.length >= 3 && count > 1) {
    const before = w[w.length - 3] as string;
    if (!VOWELS.includes(before) && before !== "t" && before !== "d") {
      count -= 1;
    }
  }

  // silent trailing 'e' (came, stone) — but not consonant+le (little, table),
  // and never drop below 1.
  if (w.endsWith("e") && count > 1) {
    const isConsonantLe =
      w.length >= 2 &&
      w.endsWith("le") &&
      !VOWELS.includes(w[w.length - 3] ?? "a");
    if (!isConsonantLe) count -= 1;
  }

  return count < 1 ? 1 : count;
}

export function lineSyllables(line: string): number {
  const words = line
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/g, ""))
    .filter((w) => w.length > 0);
  let total = 0;
  for (const w of words) total += syllableCount(w);
  return total;
}
