/**
 * Word banks for the naming grammars in names.ts.
 *
 * Register: Shel Silverstein storybook. Wry, concrete, kid-serious.
 * Never corporate ("Elevation Experience"), never greeting-card ("Journey
 * of a Thousand Miles"). A hill can be named after a bad mood. A route
 * can be named after a day of the week you dread. That's the bar.
 */

/** Hill-name adjectives/nouns for the "Mount ___" pattern. */
export const HILL_MOUNT_WORDS: readonly string[] = [
  "Regret",
  "Nuisance",
  "Second Thoughts",
  "Grudge",
  "Almost",
  "Doubt",
  "Overreach",
  "Nevermind",
  "Complaint",
  "Spite",
] as const;

/** Adjectives for "The ___ Hill" pattern. */
export const HILL_THE_ADJ_WORDS: readonly string[] = [
  "Unreasonable",
  "Ungrateful",
  "Uncalled-For",
  "Unnecessary",
  "Unbothered",
  "Unforgiving",
  "Unspoken",
  "Unhurried",
  "Undecided",
  "Unimpressed",
] as const;

/** Nouns describing what a hill does, for "The Hill That ___" pattern. */
export const HILL_THAT_CLAUSES: readonly string[] = [
  "Wouldn't Quit",
  "Kept Going",
  "Lied About Its Size",
  "Ate the Morning",
  "Never Apologized",
  "Watched You Walk",
  "Won Anyway",
  "Didn't Care",
  "Kept a Secret",
  "Took Its Time",
] as const;

/** Weekday-ish or routine-ish adjectives for "The ___ Route" / "The ___ Loop". */
export const ROUTE_ADJ_WORDS: readonly string[] = [
  "Tuesday",
  "Usual",
  "Long Way",
  "Short Way",
  "Wrong Turn",
  "Same Old",
  "Grey",
  "Half-Hearted",
  "No-Excuses",
  "Backward",
] as const;

/** Nouns for route pattern endings ("The Tuesday ___"). */
export const ROUTE_NOUNS: readonly string[] = [
  "Loop",
  "Route",
  "Circuit",
  "Trudge",
  "Detour",
  "Path",
  "Shuffle",
  "Stretch",
] as const;

/** Non-numeric superlatives for very long quiets (days >= 100). */
export const QUIET_VAST_WORDS: readonly string[] = [
  "Great",
  "Vast",
  "Long, Long",
  "Endless",
  "Deep",
  "Bottomless",
  "Enormous",
  "Everlasting",
] as const;

/** Adjectives for shorter quiets (days < 100). */
export const QUIET_SHORT_WORDS: readonly string[] = [
  "Long",
  "Slow",
  "Ordinary",
  "Small",
  "Grey",
  "Stubborn",
  "Patient",
  "Uneventful",
] as const;

/** Nouns for what a "ghost" (a run that almost happened, or a route abandoned) is called. */
export const GHOST_NOUNS: readonly string[] = [
  "Elevation Ghost",
  "Hill That Wasn't",
  "Mile That Got Away",
  "Almost-Run",
  "Turnaround",
  "Second-Guess",
  "Unfinished Business",
  "Missing Mile",
  "Ghost Loop",
  "Empty Shoe",
] as const;

/** Nouns for night-beast names, used as "The ___ Beast" or similar (time is embedded separately). */
export const NIGHT_BEAST_NOUNS: readonly string[] = [
  "Something",
  "Beast",
  "Watcher",
  "Wanderer",
  "Creature",
  "Shape",
  "Thing",
  "Prowler",
] as const;

/** Book title patterns' filler nouns/phrases, Silverstein-flavored. */
export const TITLE_PHRASES: readonly string[] = [
  "Where the Pavement Ends",
  "The Hill I Complained About",
  "A Year of Almost Quitting",
  "The Long Way Home, Every Time",
  "Where the Sidewalk Gave Up",
  "The Book of Small Victories",
  "Everything I Ran From",
  "The Places My Feet Remember",
  "Uphill, Both Ways, Actually",
  "The Year the Quiet Won",
] as const;
