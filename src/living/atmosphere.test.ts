import { describe, it, expect } from "vitest";
import { crossfadeAlpha } from "./atmosphere";

/** Unit tests for the pure crossfade-alpha math extracted from the
 *  rAF-driven `initAtmosphere` tag-switch/frame loop (DOM/canvas glue is not
 *  unit-testable in isolation; this covers the one piece of logic that is
 *  pure). See `switchTag`/`frame` in atmosphere.ts for how `fadeT`/`carry`
 *  are derived from wall-clock time in practice. */
describe("crossfadeAlpha", () => {
  it("at the start of a fresh fade (fadeT=0, carry=1): prev fully opaque, active fully transparent", () => {
    const { prevAlpha, activeAlpha } = crossfadeAlpha(0, 1);
    expect(prevAlpha).toBe(1);
    expect(activeAlpha).toBe(0);
  });

  it("at the end of a fade (fadeT=1, carry=1): prev fully transparent, active fully opaque", () => {
    const { prevAlpha, activeAlpha } = crossfadeAlpha(1, 1);
    expect(prevAlpha).toBe(0);
    expect(activeAlpha).toBe(1);
  });

  it("at the midpoint of a fresh fade (fadeT=0.5, carry=1): both systems at half opacity", () => {
    const { prevAlpha, activeAlpha } = crossfadeAlpha(0.5, 1);
    expect(prevAlpha).toBeCloseTo(0.5, 10);
    expect(activeAlpha).toBeCloseTo(0.5, 10);
  });

  it("clamps fadeT above 1 down to 1", () => {
    const { prevAlpha, activeAlpha } = crossfadeAlpha(1.7, 1);
    expect(prevAlpha).toBe(0);
    expect(activeAlpha).toBe(1);
  });

  it("clamps fadeT below 0 up to 0", () => {
    const { prevAlpha, activeAlpha } = crossfadeAlpha(-0.3, 1);
    expect(prevAlpha).toBe(1);
    expect(activeAlpha).toBe(0);
  });

  it("scales the outgoing fade by carry, not just (1 - fadeT)", () => {
    const { prevAlpha } = crossfadeAlpha(0.5, 0.4);
    expect(prevAlpha).toBeCloseTo(0.2, 10); // 0.4 * (1 - 0.5)
  });

  it("carry-over continuity: a switch landing mid-fade continues from the interrupted alpha, not a snap to full", () => {
    // Simulates atmosphere.ts's switchTag(): a fade starts at t0 (fadeT=0,
    // carry=1). At t0+300ms (half of a 600ms crossfade), fadeT=0.5, so the
    // active (incoming) system's live alpha is 0.5 — that's exactly what a
    // second switch landing at that instant must carry over as the new
    // prev's starting multiplier.
    const midFadeT = 300 / 600;
    const interrupted = crossfadeAlpha(midFadeT, 1);
    expect(interrupted.activeAlpha).toBeCloseTo(0.5, 10);

    const newCarry = interrupted.activeAlpha;
    // The instant the second switch lands, the new fade resets to fadeT=0.
    const justAfterSwitch = crossfadeAlpha(0, newCarry);

    // Continuity: the demoted system's alpha right after the switch must
    // equal its alpha right before the switch — no pop up to 1, no pop
    // down to 0.
    expect(justAfterSwitch.prevAlpha).toBeCloseTo(interrupted.activeAlpha, 10);
  });

  it("without carry-over (old buggy behavior would be carry=1 always), a mid-fade switch would incorrectly pop to full opacity", () => {
    // Documents the bug this fixes: if carry were hardcoded to 1 (the old
    // behavior — outgoing system always assumed to start from full), a
    // switch landing at fadeT=0.5 (interrupted alpha 0.5) would jump the
    // outgoing system's alpha from 0.5 up to 1 the instant it lands.
    const buggyCarry = 1;
    const poppedAlpha = crossfadeAlpha(0, buggyCarry).prevAlpha;
    expect(poppedAlpha).toBe(1);
    expect(poppedAlpha).not.toBeCloseTo(0.5, 10);
  });

  it("fades an interrupted outgoing system all the way to zero by the end of its (new) window, regardless of carry", () => {
    const { prevAlpha } = crossfadeAlpha(1, 0.5);
    expect(prevAlpha).toBe(0);
  });
});
