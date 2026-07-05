import type { Rng } from "./rng";
import {
  HILL_MOUNT_WORDS,
  HILL_THE_ADJ_WORDS,
  HILL_THAT_CLAUSES,
  ROUTE_ADJ_WORDS,
  ROUTE_NOUNS,
  QUIET_VAST_WORDS,
  QUIET_SHORT_WORDS,
  GHOST_NOUNS,
  NIGHT_BEAST_NOUNS,
  TITLE_PHRASES,
} from "./lexicon";

/**
 * Naming grammars. Every function forks its own independent stream from
 * the book-level rng, keyed by a stable label, so name(k) never depends
 * on what other names were drawn before or after it — call order is
 * irrelevant, only the (seed, key) pair matters.
 */

export function nameHill(rng: Rng, key: string): string {
  const r = rng.fork(`name:hill:${key}`);
  const pattern = r.int(3);
  if (pattern === 0) {
    return `Mount ${r.pick(HILL_MOUNT_WORDS)}`;
  }
  if (pattern === 1) {
    return `The ${r.pick(HILL_THE_ADJ_WORDS)} Hill`;
  }
  return `The Hill That ${r.pick(HILL_THAT_CLAUSES)}`;
}

export function nameRoute(rng: Rng, key: string): string {
  const r = rng.fork(`name:route:${key}`);
  const adj = r.pick(ROUTE_ADJ_WORDS);
  const bare = r.int(2) === 0;
  if (bare) {
    return `The ${adj}`;
  }
  return `The ${adj} ${r.pick(ROUTE_NOUNS)}`;
}

export function nameQuiet(rng: Rng, key: string, days: number): string {
  const r = rng.fork(`name:quiet:${key}`);
  if (days >= 100) {
    const useExactDays = r.int(2) === 0;
    if (useExactDays) {
      return `The ${days}-Day Quiet`;
    }
    return `The ${r.pick(QUIET_VAST_WORDS)} Quiet`;
  }
  return `The ${r.pick(QUIET_SHORT_WORDS)} Quiet`;
}

export function nameGhost(rng: Rng, key: string): string {
  const r = rng.fork(`name:ghost:${key}`);
  return `The ${r.pick(GHOST_NOUNS)}`;
}

export function nameNightBeast(
  rng: Rng,
  key: string,
  localTime: string,
): string {
  const r = rng.fork(`name:nightBeast:${key}`);
  const bare = r.int(2) === 0;
  if (bare) {
    return `The ${localTime}`;
  }
  return `The ${localTime} ${r.pick(NIGHT_BEAST_NOUNS)}`;
}

export function bookTitle(rng: Rng): string {
  const r = rng.fork("name:bookTitle");
  return r.pick(TITLE_PHRASES);
}
