export const TICK_MS = 1000 / 120;
export const RUN_SPEED_M_S = 4.2; // runner auto-run speed (game-meters/s)
export const QUIET_BASE_M_S = 3.6; // fog base speed
// NOTE: the name suggests a landing-idle rule, but that is NOT what happens.
// The normative rule lives in step() below: the fog rubber-bands between
// QUIET_BASE_M_S and QUIET_CATCHUP_M_S purely on the gap (xM - quietXM) —
// engage when gap > 120, disengage back to base once gap <= 120.
export const QUIET_CATCHUP_M_S = 5.4;
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

  // Quiet (fog): rubber-bands to keep tension. Base speed unless the gap
  // between the runner and the fog exceeds the threshold, in which case the
  // fog catches up faster until the gap closes back to the threshold.
  const gap = xM - s.quietXM;
  const quietSpeed = gap > RUBBER_BAND_GAP_M ? QUIET_CATCHUP_M_S : QUIET_BASE_M_S;
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
