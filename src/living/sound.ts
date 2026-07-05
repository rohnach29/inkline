/** Synthesized-only pencil sound for the living-book layer: a scratch while
 *  a route/flight arc draws in, and a paper whoosh on keyboard page-turns.
 *  No audio assets, ever — every sound here is procedurally generated noise
 *  run through WebAudio filter nodes. Off by default; the AudioContext this
 *  module needs is created lazily, and only once `enabled` is (or becomes)
 *  true — never merely because the module was imported or constructed. See
 *  `attachSound` below for exactly when that happens. */

const SOUND_KEY = "inkline-sound";

/** How long the (looping) noise buffer is, in seconds. Loops underneath
 *  scratch sustains of any length (draws run 2-6s per timing.ts/flight.ts),
 *  so this only needs to be long enough that the loop seam isn't audible as
 *  a short repeating click — a couple of seconds of noise is plenty. */
const NOISE_BUFFER_SECONDS = 2;

const SCRATCH_Q = 0.8;
/** Fixed lowpass cutoff stacked after the bandpass — shaves the top end off
 *  the noise so the scratch reads as pencil-on-paper rather than a hiss;
 *  comfortably above the bandpass's own upper range (1600-2000Hz) so it
 *  shapes tone without fighting the bandpass. */
const SCRATCH_LOWPASS_HZ = 3200;
/** Subtle tremor depth: the tremolo gain oscillates in [1 - depth, 1 + depth]
 *  around unity, so a depth of 0.25 is a noticeable-but-subtle amplitude
 *  wobble, not a hard chop. */
const TREMOR_DEPTH = 0.25;
const MASTER_SCRATCH_GAIN = 0.06;
const MASTER_WHOOSH_GAIN = 0.1;
/** Quick linear fade in/out bookending the whoosh burst so it never clicks
 *  at the start/end of the buffer. */
const WHOOSH_EDGE_MS = 20;
const WHOOSH_Q = 1.2;

// ---------------------------------------------------------------------
// Pure params (TDD'd in sound.test.ts)
// ---------------------------------------------------------------------

export interface ScratchParams {
  attackMs: 80;
  releaseMs: 150;
  /** Bandpass center frequency in Hz, always within [1600, 2000]. */
  bandpassHz: number;
  /** Amplitude-tremor LFO frequency in Hz, always within [8, 14]. */
  tremorHz: number;
}

export interface WhooshParams {
  durationMs: 220;
  sweepFromHz: 400;
  sweepToHz: 900;
}

/** Classic GLSL-style pseudo-random hash: deterministic given `n` (no
 *  `Math.random()` — this must reproduce the exact same value for the exact
 *  same draw duration every time), spread across [0, 1) in a way that
 *  doesn't visibly correlate with small changes in `n`. */
function hashUnit(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Deterministic per-draw scratch timbre: `drawMs` (the same duration the
 *  ink stroke itself takes to draw in) seeds a bandpass center and tremor
 *  rate so different chapters/runs sound subtly different from each other
 *  without ever being random — the same `drawMs` always yields the exact
 *  same timbre. Envelope shape (attack/release) is fixed regardless of
 *  `drawMs`; only the tone varies. */
export function scratchParams(drawMs: number): ScratchParams {
  const bandpassHz = 1600 + hashUnit(drawMs) * 400;
  const tremorHz = 8 + hashUnit(drawMs + 7919) * 6;
  return { attackMs: 80, releaseMs: 150, bandpassHz, tremorHz };
}

/** Fixed-shape params for the page-turn whoosh — unlike the scratch, the
 *  whoosh never varies (there's no per-event input to seed it from; a
 *  keyboard nav is a keyboard nav). */
export function whooshParams(): WhooshParams {
  return { durationMs: 220, sweepFromHz: 400, sweepToHz: 900 };
}

/** The toolbar's toggle label for the given enabled state. */
export function soundLabel(enabled: boolean): string {
  return enabled ? "sound: on (pencil)" : "sound: off";
}

// ---------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------

/** Reads the persisted sound preference. Absent (never toggled before, or
 *  storage unavailable) always means OFF — sound is opt-in, never opt-out
 *  by default. */
export function loadSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

function persistSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // Storage unavailable (private browsing, quota) — the toggle still
    // works for the current session, it just won't survive a reload.
  }
}

// ---------------------------------------------------------------------
// Glue
// ---------------------------------------------------------------------

/** The two events the animated living-book layer fires around every ink
 *  draw — reveal.ts (route maps) and flight.ts (flight arcs) both accept an
 *  optional `DrawHooks` and call these at the real start/end of their own
 *  draw-in animation (not the runner-fade/dot-fade tail that follows it).
 *  `SoundHandle` below implements this directly so it can be passed as-is
 *  wherever a `DrawHooks` is expected. */
export interface DrawHooks {
  onDrawStart(drawMs: number): void;
  onDrawEnd(): void;
}

export interface SoundHandle extends DrawHooks {
  isEnabled(): boolean;
  /** Flips the enabled state, persists it, and returns the new state. Turning
   *  on resumes (creating, if this is truly the first time) the
   *  AudioContext; turning off suspends it and cuts any in-flight scratch. */
  toggle(): boolean;
  /** Plays the page-turn whoosh once, if enabled. No-op while disabled. */
  whoosh(): void;
  /** Stops any in-flight scratch immediately (no release ramp) — used when
   *  the living-book layer itself tears down mid-draw. */
  teardown(): void;
}

interface ActiveScratch {
  stop(): void;
}

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * NOISE_BUFFER_SECONDS));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    // Ephemeral audio synthesis only, never serialized — same Math.random()
    // exception `docs/superpowers/plans/2026-07-05-plan-d-living-book.md`
    // grants `src/living/**` for screen-only particle effects.
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/** Starts one scratch "voice": looping white noise -> bandpass (per
 *  `params`, Q 0.8) -> lowpass -> tremolo (LFO-modulated gain) -> envelope
 *  gain (80ms attack, then held at sustain until `.stop()` is called, which
 *  releases over 150ms) -> destination. Returns a handle whose `stop()` is
 *  safe to call at most once. */
function playScratch(ctx: AudioContext, buffer: AudioBuffer, params: ScratchParams): ActiveScratch {
  const now = ctx.currentTime;

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = params.bandpassHz;
  bandpass.Q.value = SCRATCH_Q;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = SCRATCH_LOWPASS_HZ;

  const tremoloGain = ctx.createGain();
  tremoloGain.gain.value = 1;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = params.tremorHz;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = TREMOR_DEPTH;
  lfo.connect(lfoDepth);
  lfoDepth.connect(tremoloGain.gain);

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(MASTER_SCRATCH_GAIN, now + params.attackMs / 1000);

  noise.connect(bandpass).connect(lowpass).connect(tremoloGain).connect(envelope).connect(ctx.destination);

  noise.start(now);
  lfo.start(now);

  let stopped = false;
  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      const stopAt = ctx.currentTime;
      const releaseS = params.releaseMs / 1000;
      envelope.gain.cancelScheduledValues(stopAt);
      envelope.gain.setValueAtTime(envelope.gain.value, stopAt);
      envelope.gain.linearRampToValueAtTime(0, stopAt + releaseS);
      noise.stop(stopAt + releaseS + 0.02);
      lfo.stop(stopAt + releaseS + 0.02);
    },
  };
}

/** Plays the page-turn whoosh once: a 220ms filtered noise burst whose
 *  bandpass sweeps 400Hz -> 900Hz, with a short linear fade in/out so the
 *  burst never clicks. Fire-and-forget — the nodes stop and are garbage
 *  collected on their own once the burst ends. */
function playWhoosh(ctx: AudioContext, buffer: AudioBuffer, params: WhooshParams): void {
  const now = ctx.currentTime;
  const durationS = params.durationMs / 1000;
  const edgeS = Math.min(WHOOSH_EDGE_MS / 1000, durationS / 2);

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.Q.value = WHOOSH_Q;
  bandpass.frequency.setValueAtTime(params.sweepFromHz, now);
  bandpass.frequency.linearRampToValueAtTime(params.sweepToHz, now + durationS);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(MASTER_WHOOSH_GAIN, now + edgeS);
  gain.gain.setValueAtTime(MASTER_WHOOSH_GAIN, now + durationS - edgeS);
  gain.gain.linearRampToValueAtTime(0, now + durationS);

  noise.connect(bandpass).connect(gain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + durationS + 0.02);
}

/** Wires up the pencil-sound system. Reads the persisted preference (default
 *  off) but — critically — does NOT touch `AudioContext` at all during
 *  construction: the context is only ever created the first time it is
 *  actually needed to produce sound while `enabled` is true, which happens
 *  either from an explicit `toggle()` to on, or (for a session that loads
 *  with a previously-persisted "on" preference) the first draw/whoosh event
 *  that occurs while enabled. Either way, `new AudioContext()` is never
 *  called before the user has opted in at least once. */
export function attachSound(): SoundHandle {
  let ctx: AudioContext | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let enabled = loadSoundEnabled();
  let activeScratch: ActiveScratch | null = null;

  function ensureContext(): AudioContext {
    if (!ctx) {
      ctx = new AudioContext();
      noiseBuffer = createNoiseBuffer(ctx);
    }
    return ctx;
  }

  /** Returns a ready-to-use (resumed) context, lazily creating it on first
   *  need, only while enabled — or null while disabled, so every call site
   *  below has one guard instead of repeating the enabled-check. */
  function contextIfEnabled(): AudioContext | null {
    if (!enabled) return null;
    const context = ensureContext();
    void context.resume();
    return context;
  }

  function stopActiveScratch(): void {
    if (activeScratch) {
      activeScratch.stop();
      activeScratch = null;
    }
  }

  return {
    isEnabled(): boolean {
      return enabled;
    },

    toggle(): boolean {
      enabled = !enabled;
      persistSoundEnabled(enabled);
      if (enabled) {
        void ensureContext().resume();
      } else if (ctx) {
        stopActiveScratch();
        void ctx.suspend();
      }
      return enabled;
    },

    onDrawStart(drawMs: number): void {
      const context = contextIfEnabled();
      if (!context || !noiseBuffer) return;
      stopActiveScratch(); // defensive: draws don't overlap in practice, but never stack voices
      activeScratch = playScratch(context, noiseBuffer, scratchParams(drawMs));
    },

    onDrawEnd(): void {
      stopActiveScratch();
    },

    whoosh(): void {
      const context = contextIfEnabled();
      if (!context || !noiseBuffer) return;
      playWhoosh(context, noiseBuffer, whooshParams());
    },

    teardown(): void {
      stopActiveScratch();
    },
  };
}
