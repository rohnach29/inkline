import { describe, it, expect } from "vitest";
import {
  TICK_MS,
  RUN_SPEED_M_S,
  QUIET_BASE_M_S,
  QUIET_CATCHUP_M_S,
  QUIET_RAMP_M_S2,
  QUIET_MAX_M_S,
  JUMP_V,
  GRAVITY,
  initialState,
  step,
  simulate,
  type GameInput,
  type GameState,
} from "./physics";

const DT = TICK_MS / 1000;
const NO_JUMP: GameInput = { jumpPressed: false };
const JUMP: GameInput = { jumpPressed: true };

describe("initialState", () => {
  it("matches the exact documented starting values", () => {
    const s = initialState();
    expect(s.tick).toBe(0);
    expect(s.xM).toBe(40);
    expect(s.yM).toBe(0);
    expect(s.vyM).toBe(0);
    expect(s.grounded).toBe(true);
    expect(s.quietXM).toBe(0);
    expect(s.stumbleUntilTick).toBe(0);
    expect(s.alive).toBe(true);
  });
});

describe("step: jump", () => {
  it("triggers a jump only when grounded", () => {
    const airborne: GameState = {
      ...initialState(),
      grounded: false,
      vyM: 2,
      yM: 5,
    };
    const result = step(airborne, JUMP);
    // Jump must NOT engage mid-air: vyM follows plain gravity integration,
    // never gets set to JUMP_V.
    expect(result.vyM).toBeCloseTo(2 - GRAVITY * DT, 10);
    expect(result.yM).toBeCloseTo(5 + (2 - GRAVITY * DT) * DT, 10);
    expect(result.grounded).toBe(false);
  });

  it("sets vyM to JUMP_V and leaves the ground when grounded and jumpPressed", () => {
    const grounded: GameState = { ...initialState(), grounded: true };
    const result = step(grounded, JUMP);
    expect(result.grounded).toBe(false);
    // vyM after this tick = JUMP_V - GRAVITY*dt (gravity applies same tick).
    expect(result.vyM).toBeCloseTo(JUMP_V - GRAVITY * DT, 10);
  });

  it("reaches an apex within 5% of JUMP_V^2/(2*GRAVITY)", () => {
    let s = initialState();
    let maxY = 0;
    s = step(s, JUMP);
    maxY = Math.max(maxY, s.yM);
    // Continue with no further jump input until landed (well beyond flight time).
    for (let i = 0; i < 400; i++) {
      s = step(s, NO_JUMP);
      maxY = Math.max(maxY, s.yM);
    }
    const expectedApex = (JUMP_V * JUMP_V) / (2 * GRAVITY);
    expect(Math.abs(maxY - expectedApex) / expectedApex).toBeLessThan(0.05);
  });

  it("lands back at yM 0 and grounded after the flight completes", () => {
    let s = initialState();
    s = step(s, JUMP);
    for (let i = 0; i < 400; i++) {
      s = step(s, NO_JUMP);
    }
    expect(s.grounded).toBe(true);
    expect(s.yM).toBe(0);
    expect(s.vyM).toBe(0);
  });
});

describe("step: stumble window", () => {
  it("halves speed for exactly the ticks before stumbleUntilTick, then resumes", () => {
    let s: GameState = { ...initialState(), stumbleUntilTick: 5 };
    const halfDx = (RUN_SPEED_M_S / 2) * DT;
    const fullDx = RUN_SPEED_M_S * DT;

    for (let i = 0; i < 5; i++) {
      const prevX = s.xM;
      s = step(s, NO_JUMP);
      expect(s.xM - prevX).toBeCloseTo(halfDx, 10);
    }
    // 6th tick: s.tick is now 5, which is NOT < stumbleUntilTick (5) -> normal speed.
    const prevX = s.xM;
    s = step(s, NO_JUMP);
    expect(s.xM - prevX).toBeCloseTo(fullDx, 10);
  });
});

describe("step: quiet (fog)", () => {
  it("advances at exactly QUIET_BASE_M_S per tick when the gap is small", () => {
    const s = initialState(); // xM 40, quietXM 0 -> gap well under 120
    const result = step(s, NO_JUMP);
    expect(result.quietXM).toBeCloseTo(QUIET_BASE_M_S * DT, 10);
  });

  it("switches to QUIET_CATCHUP_M_S when the post-move gap exceeds 120", () => {
    const s: GameState = { ...initialState(), xM: 300, quietXM: 100 };
    const result = step(s, NO_JUMP);
    const newX = 300 + RUN_SPEED_M_S * DT;
    expect(newX - 100).toBeGreaterThan(120); // sanity: gap does exceed 120
    expect(result.quietXM).toBeCloseTo(100 + QUIET_CATCHUP_M_S * DT, 10);
  });

  it("stays at QUIET_BASE_M_S when the post-move gap is exactly 120 (disengage boundary)", () => {
    const xM = 500;
    const newX = xM + RUN_SPEED_M_S * DT;
    const quietXM = newX - 120; // gap will be exactly 120, not > 120
    const s: GameState = { ...initialState(), xM, quietXM };
    const result = step(s, NO_JUMP);
    expect(result.quietXM).toBeCloseTo(quietXM + QUIET_BASE_M_S * DT, 10);
  });

  it("stays at QUIET_BASE_M_S just under the 120 threshold", () => {
    const s: GameState = { ...initialState(), xM: 150, quietXM: 100 };
    const result = step(s, NO_JUMP);
    expect(result.quietXM).toBeCloseTo(100 + QUIET_BASE_M_S * DT, 10);
  });
});

describe("step: quiet acceleration (the Quiet ramps up)", () => {
  it("base fog speed at tick 0 is exactly QUIET_BASE_M_S", () => {
    const s = initialState();
    const result = step(s, NO_JUMP);
    expect(result.quietXM).toBe(QUIET_BASE_M_S * DT);
  });

  it("fog base speed reaches RUN_SPEED_M_S (4.2) at t = 75s", () => {
    // (RUN_SPEED - QUIET_BASE) / QUIET_RAMP = (4.2 - 3.6) / 0.008 = 75s.
    const tick75s = Math.round(75_000 / TICK_MS); // 9000 ticks at 120Hz
    expect(tick75s * TICK_MS).toBeCloseTo(75_000, 6);
    // Keep the gap small so the rubber band stays out of the picture.
    const s: GameState = { ...initialState(), tick: tick75s, xM: 400, quietXM: 350 };
    const result = step(s, NO_JUMP);
    const advance = result.quietXM - s.quietXM;
    expect(advance / DT).toBeCloseTo(RUN_SPEED_M_S, 10);
  });

  it("fog base speed is capped at QUIET_MAX_M_S for large t", () => {
    // t = 400s: uncapped ramp would give 3.6 + 0.008*400 = 6.8 > 6.0 cap.
    const tick400s = Math.round(400_000 / TICK_MS); // 48000 ticks
    const s: GameState = { ...initialState(), tick: tick400s, xM: 2000, quietXM: 1950 };
    const result = step(s, NO_JUMP);
    const advance = result.quietXM - s.quietXM;
    expect(advance / DT).toBeCloseTo(QUIET_MAX_M_S, 10);
  });

  it("rubber band takes the max of catch-up and ramped base when gap > 120", () => {
    // Late game: base(400s) = QUIET_MAX (6.0) > QUIET_CATCHUP (5.4). With a
    // gap over 120 the fog must use the FASTER of the two, not drop to 5.4.
    const tick400s = Math.round(400_000 / TICK_MS);
    const s: GameState = { ...initialState(), tick: tick400s, xM: 2000, quietXM: 1000 };
    const result = step(s, NO_JUMP);
    const advance = result.quietXM - s.quietXM;
    expect(advance / DT).toBeCloseTo(Math.max(QUIET_CATCHUP_M_S, QUIET_MAX_M_S), 10);
    // Early game with a big gap: base(0) = 3.6 < 5.4, catch-up wins.
    const early: GameState = { ...initialState(), xM: 300, quietXM: 100 };
    const earlyResult = step(early, NO_JUMP);
    expect((earlyResult.quietXM - early.quietXM) / DT).toBeCloseTo(QUIET_CATCHUP_M_S, 10);
  });

  it("every game ends: an unstumbled 40000-tick run finishes with alive === false", () => {
    // Pre-amendment the fog (3.6) could never catch the runner (4.2) without
    // stumbles -- the game was immortal and the score card never appeared.
    // With the ramp, fog speed passes 4.2 at 75s; analytically the gap
    // gap(t) = 40 + 0.6t - 0.004t^2 closes at t = 200s (24000 ticks), well
    // inside 40000 ticks (~333s).
    const script: GameInput[] = new Array<GameInput>(40_000).fill(NO_JUMP);
    const final = simulate(initialState(), script);
    expect(final.alive).toBe(false);
    // Death freeze pins the state at the death tick -- confirm it happened
    // in the analytically expected neighborhood, not at the 40000 cutoff.
    expect(final.tick).toBeGreaterThan(20_000);
    expect(final.tick).toBeLessThan(28_000);
  });
});

describe("step: death freeze", () => {
  it("marks alive=false once the fog is at or past the runner", () => {
    // Fog base speed (3.6) is slower than run speed (4.2), so the only way
    // for quietXM to reach/pass xM in a single tick is to already be there.
    const s: GameState = { ...initialState(), xM: 10, quietXM: 15 };
    const result = step(s, NO_JUMP);
    expect(result.alive).toBe(false);
  });

  it("returns the identical state object (including tick) once dead", () => {
    const dead: GameState = { ...initialState(), tick: 77, alive: false };
    const result = step(dead, JUMP);
    expect(result).toBe(dead);
    expect(result.tick).toBe(77);
  });
});

describe("step: no mutation", () => {
  it("returns a new object and never mutates the input state", () => {
    const s = initialState();
    const snapshot: GameState = { ...s };
    const result = step(s, JUMP);
    expect(result).not.toBe(s);
    expect(s).toEqual(snapshot);
  });
});

describe("simulate: determinism", () => {
  function scriptA(n: number): GameInput[] {
    const script: GameInput[] = [];
    for (let i = 0; i < n; i++) {
      script.push({ jumpPressed: i % 100 === 0 });
    }
    return script;
  }

  /** A single jump near the very end so flight-in-progress state (yM, vyM,
   *  grounded) at tick 2000 depends on exactly when the jump happened —
   *  jump timing doesn't affect xM/quietXM, so the divergent script must
   *  still be airborne at the tick-2000 cutoff to produce a different state. */
  function scriptWithSingleJump(n: number, jumpAtTick: number): GameInput[] {
    const script: GameInput[] = [];
    for (let i = 0; i < n; i++) {
      script.push({ jumpPressed: i === jumpAtTick });
    }
    return script;
  }

  it("produces identical final states for two runs of the same 2000-tick script", () => {
    const script = scriptA(2000);
    const finalA = simulate(initialState(), script);
    const finalB = simulate(initialState(), script);
    expect(finalA).toEqual(finalB);
  });

  it("produces a different final state for a differing 2000-tick script", () => {
    // Flight time is ~78 ticks; jumping at 1990 is still airborne at tick
    // 2000, while jumping at 1000 has long since landed.
    const finalA = simulate(initialState(), scriptWithSingleJump(2000, 1990));
    const finalC = simulate(initialState(), scriptWithSingleJump(2000, 1000));
    expect(finalA).not.toEqual(finalC);
    expect(finalA.grounded).toBe(false);
    expect(finalC.grounded).toBe(true);
  });
});
