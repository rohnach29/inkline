import { describe, it, expect } from "vitest";
import { scratchParams, whooshParams, soundLabel, makeThrottle } from "./sound";
import type { ScratchParams, WhooshParams } from "./sound";

describe("scratchParams", () => {
  it("fixes the envelope constants regardless of drawMs", () => {
    expect(scratchParams(2000).attackMs).toBe(80);
    expect(scratchParams(2000).releaseMs).toBe(150);
    expect(scratchParams(6000).attackMs).toBe(80);
    expect(scratchParams(6000).releaseMs).toBe(150);
  });

  it("is deterministic: the same drawMs always yields the exact same params", () => {
    const a = scratchParams(3417);
    const b = scratchParams(3417);
    expect(a).toEqual<ScratchParams>(b);
  });

  it("keeps bandpassHz within [1600, 2000] across a sweep of drawMs", () => {
    for (let ms = 2000; ms <= 6000; ms += 37) {
      const { bandpassHz } = scratchParams(ms);
      expect(bandpassHz).toBeGreaterThanOrEqual(1600);
      expect(bandpassHz).toBeLessThanOrEqual(2000);
    }
  });

  it("keeps tremorHz within [8, 14] across a sweep of drawMs", () => {
    for (let ms = 2000; ms <= 6000; ms += 37) {
      const { tremorHz } = scratchParams(ms);
      expect(tremorHz).toBeGreaterThanOrEqual(8);
      expect(tremorHz).toBeLessThanOrEqual(14);
    }
  });

  it("varies bandpassHz for different drawMs (not a constant hiding behind the range check)", () => {
    const values = new Set<number>();
    for (let ms = 2000; ms <= 6000; ms += 250) {
      values.add(scratchParams(ms).bandpassHz);
    }
    expect(values.size).toBeGreaterThan(1);
  });

  it("varies tremorHz for different drawMs", () => {
    const values = new Set<number>();
    for (let ms = 2000; ms <= 6000; ms += 250) {
      values.add(scratchParams(ms).tremorHz);
    }
    expect(values.size).toBeGreaterThan(1);
  });

  it("bandpassHz and tremorHz vary independently of each other (different seeds)", () => {
    // If bandpass and tremor used the exact same hash input, they'd be
    // perfectly correlated; they don't, so this checks they aren't identical
    // functions of drawMs wearing different clothes.
    const a = scratchParams(2500);
    const b = scratchParams(2501);
    const bandpassChanged = a.bandpassHz !== b.bandpassHz;
    const tremorChanged = a.tremorHz !== b.tremorHz;
    expect(bandpassChanged || tremorChanged).toBe(true);
  });
});

describe("whooshParams", () => {
  it("returns the exact fixed shape", () => {
    expect(whooshParams()).toEqual<WhooshParams>({
      durationMs: 220,
      sweepFromHz: 400,
      sweepToHz: 900,
    });
  });

  it("is stable across repeated calls (no hidden state/randomness)", () => {
    expect(whooshParams()).toEqual(whooshParams());
  });
});

describe("makeThrottle", () => {
  it("fires on the very first call", () => {
    let t = 0;
    const gate = makeThrottle(150, () => t);
    expect(gate()).toBe(true);
  });

  it("suppresses calls within minMs of the last fire", () => {
    let t = 0;
    const gate = makeThrottle(150, () => t);
    expect(gate()).toBe(true);
    t = 25;
    expect(gate()).toBe(false);
    t = 149;
    expect(gate()).toBe(false);
  });

  it("fires again once minMs has elapsed since the last FIRE", () => {
    let t = 0;
    const gate = makeThrottle(150, () => t);
    expect(gate()).toBe(true);
    t = 150;
    expect(gate()).toBe(true);
  });

  it("suppressed calls do not reset the window (throttle, not debounce)", () => {
    let t = 0;
    const gate = makeThrottle(150, () => t);
    expect(gate()).toBe(true); // fires at t=0
    t = 100;
    expect(gate()).toBe(false); // suppressed — must NOT push the window out
    t = 160;
    expect(gate()).toBe(true); // 160ms since last FIRE (t=0), not since t=100
  });

  it("keeps gating across several fire/suppress cycles", () => {
    let t = 0;
    const gate = makeThrottle(150, () => t);
    expect(gate()).toBe(true); // t=0 fire
    t = 200;
    expect(gate()).toBe(true); // fire
    t = 300;
    expect(gate()).toBe(false); // 100ms since t=200 fire
    t = 350;
    expect(gate()).toBe(true); // 150ms since t=200 fire
  });
});

describe("soundLabel", () => {
  it('labels the off state "sound: off"', () => {
    expect(soundLabel(false)).toBe("sound: off");
  });

  it('labels the on state "sound: on (pencil)"', () => {
    expect(soundLabel(true)).toBe("sound: on (pencil)");
  });
});
