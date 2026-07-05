/** Pure spec/spawn/step logic for the living-book atmosphere layer — sparse,
 *  monochrome ink-fleck "weather" keyed to a chapter's `data-atmosphere` tag.
 *  Zero DOM/canvas here: `atmosphere.ts` is the thin glue that spawns/steps
 *  these particles each rAF and paints them. Fully unit-tested with a seeded
 *  fake rand and a fixed dt so behavior never depends on wall-clock time or
 *  `Math.random()` inside this module. */

export type AtmoTag = "monsoon" | "fireflies" | "leaves" | "snow";

export interface ParticleSpec {
  count: number;
  speedY: [number, number];
  speedX: [number, number];
  size: [number, number];
  alpha: [number, number];
  flicker: boolean;
}

/** How fast a flicker particle's alpha oscillates, in cycles/second — chosen
 *  to read as an irregular firefly pulse rather than a strobe. Each particle
 *  keeps its own `phase` so a whole swarm doesn't blink in lockstep. */
const FLICKER_HZ = 1.6;

const SPECS: Record<AtmoTag, ParticleSpec> = {
  monsoon: {
    count: 90,
    speedY: [140, 260],
    speedX: [-30, -10],
    size: [1, 2],
    alpha: [0.18, 0.35],
    flicker: false,
  },
  fireflies: {
    count: 14,
    speedY: [-8, 8],
    speedX: [-12, 12],
    size: [1.5, 2.5],
    alpha: [0.05, 0.55],
    flicker: true,
  },
  leaves: {
    count: 18,
    speedY: [22, 50],
    speedX: [-25, 25],
    size: [2.5, 4.5],
    alpha: [0.25, 0.45],
    flicker: false,
  },
  snow: {
    count: 45,
    speedY: [18, 40],
    speedX: [-12, 12],
    size: [1.5, 3],
    alpha: [0.25, 0.5],
    flicker: false,
  },
};

/** Looks up the exact particle spec for an atmosphere tag. Unknown tags
 *  (including the empty string, emitted by chapters with no weather) -> null,
 *  the caller's signal to run no particle system at all. */
export function specFor(tag: string): ParticleSpec | null {
  return Object.prototype.hasOwnProperty.call(SPECS, tag) ? SPECS[tag as AtmoTag] : null;
}

export interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
}

function range(rand: () => number, [lo, hi]: [number, number]): number {
  return lo + rand() * (hi - lo);
}

/** Spawns `spec.count` particles scattered uniformly over the `w`x`h` canvas
 *  area, with velocity/size/alpha drawn from the spec's ranges and an initial
 *  flicker `phase` spread over a full cycle so a freshly spawned swarm isn't
 *  synchronized. `rand` is injected (never `Math.random` directly) so this
 *  is fully deterministic under test. */
export function spawn(spec: ParticleSpec, w: number, h: number, rand: () => number): P[] {
  const particles: P[] = [];
  for (let i = 0; i < spec.count; i++) {
    particles.push({
      x: rand() * w,
      y: rand() * h,
      vx: range(rand, spec.speedX),
      vy: range(rand, spec.speedY),
      size: range(rand, spec.size),
      alpha: range(rand, spec.alpha),
      phase: rand() * Math.PI * 2,
    });
  }
  return particles;
}

/** Advances every particle by `dtMs` of motion (mutates in place — the hot
 *  rAF path can't afford to reallocate an array every frame): position moves
 *  by velocity * dt, wrapping around both axes so particles cycle through
 *  the visible area forever instead of draining off-screen. Flicker specs
 *  oscillate alpha via each particle's own phase, stying within
 *  `spec.alpha`; non-flicker particles keep the alpha they spawned with. */
export function step(ps: P[], spec: ParticleSpec, w: number, h: number, dtMs: number): void {
  const dt = dtMs / 1000;
  const [aLo, aHi] = spec.alpha;
  const mid = (aLo + aHi) / 2;
  const amp = (aHi - aLo) / 2;

  for (const p of ps) {
    p.x = wrap(p.x + p.vx * dt, w);
    p.y = wrap(p.y + p.vy * dt, h);

    if (spec.flicker) {
      p.phase += dt * FLICKER_HZ * Math.PI * 2;
      p.alpha = mid + amp * Math.sin(p.phase);
    }
  }
}

function wrap(value: number, size: number): number {
  const m = value % size;
  return m < 0 ? m + size : m;
}
