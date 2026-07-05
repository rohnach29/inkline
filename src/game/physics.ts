export const TICK_MS = 1000 / 120;
export const RUN_SPEED_M_S = 4.2; // runner auto-run speed (game-meters/s)
export const QUIET_BASE_M_S = 3.6; // fog base speed
// NOTE: the name suggests a landing-idle rule, but that is NOT what happens.
// The normative rule lives in step() below: the rubber band keys purely on
// the gap (xM - quietXM) — while gap > 120 the fog runs at the faster of
// QUIET_CATCHUP_M_S and the time-ramped base speed; at gap <= 120 it drops
// back to the ramped base.
export const QUIET_CATCHUP_M_S = 5.4;
// The Quiet accelerates: base fog speed ramps up with elapsed game time so
// every run ends and the score card (the shareable payoff) always appears.
// Without the ramp an unstumbled runner (4.2) outruns the fog (3.6) forever.
// base(t) crosses RUN_SPEED_M_S at t = (4.2 - 3.6) / 0.008 = 75s.
export const QUIET_RAMP_M_S2 = 0.008; // fog acceleration (m/s per second of game time)
export const QUIET_MAX_M_S = 6.0; // fog speed ceiling
export const JUMP_V = 7.2; // m/s upward
export const GRAVITY = 22; // m/s^2 downward

const RUBBER_BAND_GAP_M = 120;

/** Edge-triggered per tick. */
export interface GameInput {
  jumpPressed: boolean;
}

export interface GameState {
  tick: number;
  xM: number;
  yM: number; // height above ground line (0 = on ground)
  vyM: number;
  grounded: boolean;
  quietXM: number; // fog front position
  stumbleUntilTick: number; // > tick => speed halved (obstacle hit)
  alive: boolean;
}

export function initialState(): GameState {
  return {
    tick: 0,
    xM: 40, // head start
    yM: 0,
    vyM: 0,
    grounded: true,
    quietXM: 0,
    stumbleUntilTick: 0,
    alive: true,
  };
}

/**
 * One fixed tick. Pure function: returns a NEW state object, never mutates
 * the input. Once !alive, step is a no-op that returns the SAME reference
 * (death freeze).
 */
export function step(s: GameState, input: GameInput): GameState {
  if (!s.alive) return s;

  const dt = TICK_MS / 1000;

  // Position: speed halves while the current tick is inside the stumble
  // window set by a caller (obstacle collisions are handled outside physics).
  const speed = s.tick < s.stumbleUntilTick ? RUN_SPEED_M_S / 2 : RUN_SPEED_M_S;
  const xM = s.xM + speed * dt;

  // Jump: only engages from the ground.
  let vyM = s.vyM;
  let grounded = s.grounded;
  if (grounded && input.jumpPressed) {
    vyM = JUMP_V;
    grounded = false;
  }

  // Air: gravity integrates every tick; clamps back to the ground line.
  vyM -= GRAVITY * dt;
  let yM = s.yM + vyM * dt;
  if (yM <= 0) {
    yM = 0;
    vyM = 0;
    grounded = true;
  }

  // Quiet (fog): base speed ramps with elapsed game time (capped), so the
  // fog eventually outpaces the runner and every game ends. The rubber band
  // stays layered on top: when the gap exceeds the threshold the fog moves
  // at the FASTER of catch-up and the ramped base until the gap closes.
  const elapsedS = (s.tick * TICK_MS) / 1000;
  const base = Math.min(QUIET_BASE_M_S + QUIET_RAMP_M_S2 * elapsedS, QUIET_MAX_M_S);
  const gap = xM - s.quietXM;
  const quietSpeed = gap > RUBBER_BAND_GAP_M ? Math.max(QUIET_CATCHUP_M_S, base) : base;
  const quietXM = s.quietXM + quietSpeed * dt;

  const alive = quietXM < xM;

  return {
    tick: s.tick + 1,
    xM,
    yM,
    vyM,
    grounded,
    quietXM,
    stumbleUntilTick: s.stumbleUntilTick,
    alive,
  };
}

/** Convenience: run N ticks with a scripted input sequence (tests + attract mode). */
export function simulate(s: GameState, script: readonly GameInput[]): GameState {
  let state = s;
  for (const input of script) {
    state = step(state, input);
  }
  return state;
}
