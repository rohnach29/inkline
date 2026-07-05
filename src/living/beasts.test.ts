import { describe, it, expect } from "vitest";
import { wireBeast } from "./beasts";

/** Minimal stand-in for the one thing `wireBeast` touches on `el` —
 *  `classList.add` — since vitest here runs in its default node environment
 *  (no jsdom), a real DOM Element isn't available. Cast through `unknown`
 *  to satisfy the `Element` parameter type structurally. */
function fakeDoodle(): { el: Element; aliveCount: () => number } {
  let count = 0;
  const el = {
    classList: {
      add(cls: string): void {
        if (cls === "is-alive") count++;
      },
    },
  } as unknown as Element;
  return { el, aliveCount: () => count };
}

/** A controllable fake clock: `now()` reads the current tick, `advance(ms)`
 *  moves it forward — lets tests exercise wireBeast's 1400ms re-trigger
 *  window deterministically without real timers. */
function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("wireBeast", () => {
  it("fires on the first enter", () => {
    const { el } = fakeDoodle();
    const clock = fakeClock();
    const trigger = wireBeast(el, clock.now);
    expect(trigger("enter")).toBe(true);
  });

  it("adds the is-alive class exactly once when it fires", () => {
    const { el, aliveCount } = fakeDoodle();
    const clock = fakeClock();
    const trigger = wireBeast(el, clock.now);
    trigger("enter");
    expect(aliveCount()).toBe(1);
  });

  it("does not re-fire while still alive, just before the 1400ms window ends", () => {
    const { el } = fakeDoodle();
    const clock = fakeClock();
    const trigger = wireBeast(el, clock.now);
    expect(trigger("enter")).toBe(true);
    clock.advance(1399);
    expect(trigger("enter")).toBe(false);
  });

  it("does not add is-alive again for a re-entry that doesn't fire", () => {
    const { el, aliveCount } = fakeDoodle();
    const clock = fakeClock();
    const trigger = wireBeast(el, clock.now);
    trigger("enter");
    clock.advance(500);
    trigger("enter");
    expect(aliveCount()).toBe(1);
  });

  it("re-fires exactly once the 1400ms window has elapsed", () => {
    const { el } = fakeDoodle();
    const clock = fakeClock();
    const trigger = wireBeast(el, clock.now);
    trigger("enter");
    clock.advance(1400);
    expect(trigger("enter")).toBe(true);
  });

  it("re-fires well after the window has elapsed", () => {
    const { el } = fakeDoodle();
    const clock = fakeClock();
    const trigger = wireBeast(el, clock.now);
    trigger("enter");
    clock.advance(5000);
    expect(trigger("enter")).toBe(true);
  });

  it("each successful fire re-arms its own fresh 1400ms window", () => {
    const { el } = fakeDoodle();
    const clock = fakeClock();
    const trigger = wireBeast(el, clock.now);
    trigger("enter"); // fires at t=0, alive until t=1400
    clock.advance(1400);
    expect(trigger("enter")).toBe(true); // fires at t=1400, alive until t=2800
    clock.advance(1399);
    expect(trigger("enter")).toBe(false); // t=2799, still inside the new window
  });

  it("tracks alive windows independently per element", () => {
    const a = fakeDoodle();
    const b = fakeDoodle();
    const clock = fakeClock();
    const triggerA = wireBeast(a.el, clock.now);
    const triggerB = wireBeast(b.el, clock.now);
    triggerA("enter");
    clock.advance(500);
    expect(triggerB("enter")).toBe(true);
  });
});
