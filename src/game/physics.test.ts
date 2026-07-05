import { describe, it, expect } from "vitest";
import {
  TICK_MS,
  RUN_SPEED_M_S,
  QUIET_BASE_M_S,
  QUIET_CATCHUP_M_S,
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
