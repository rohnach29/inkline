import type { Year } from "../ingest";

/** FNV-1a 32-bit hash of a string. Always returns an unsigned 32-bit int. */
export function hashString(s: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Stable seed for a Year: hash of run ids + km (fixed 3-decimal) joined.
 *  seedFromYear(y) === hashString(y.runs.map(r => `${r.id}:${r.km.toFixed(3)}`).join("|")) */
export function seedFromYear(year: Year): number {
  return hashString(
    year.runs.map((r) => `${r.id}:${r.km.toFixed(3)}`).join("|"),
  );
}

export class Rng {
  readonly seed: number;
  private state: number;

  constructor(seed: number) {
    this.seed = seed;
    this.state = seed >>> 0;
  }

  /** next float in [0, 1) — mulberry32 core */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** integer in [0, n) */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** pick one element; throws on empty array */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) {
      throw new Error("Rng.pick: cannot pick from an empty array");
    }
    const el = arr[this.int(arr.length)];
    // arr.length > 0 guaranteed above and index is in [0, length), so el is defined.
    return el as T;
  }

  /** new independent Rng seeded by hashString(`${this.seed}:${label}`) —
   *  forking with the same label twice gives identical streams;
   *  fork does NOT advance the parent stream. */
  fork(label: string): Rng {
    return new Rng(hashString(`${this.seed}:${label}`));
  }
}
