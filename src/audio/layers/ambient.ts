import type { AmbientKind, SoundLayer } from "../types";
import { FADE_SEC } from "../constants";
import { fadeIn, fadeOut } from "../ramps";
import { createBrownNoiseBuffer } from "../noise";
import { loadAmbientSample, peekAmbientSample } from "../ambientSamples";

/** Shortest and longest stretch of the loop one segment plays, crossfades included. */
const SEGMENT_MIN_SEC = 10;
const SEGMENT_MAX_SEC = 16;
/** Equal-power overlap between consecutive segments. */
const CROSSFADE_SEC = 3;
/** Loop distance kept between crossfading material, so the overlap never comb-filters. */
const CROSSFADE_GAP_SEC = CROSSFADE_SEC + 1;
/** The first segment eases in; the layer's own start fade is only FADE_SEC. */
const FIRST_FADE_SEC = 1;
/** Loop edges left unplayed: some decoders pad an MP3's first and last frames with silence. */
const EDGE_SEC = 0.25;
/** A loop that arrives after start() begins this far ahead of the audio clock. */
const LATE_START_SEC = 0.05;
/**
 * Audio a live context keeps scheduled ahead, topped up as segments end: a
 * manual stop orphans few nodes, and a throttled tab never runs dry.
 */
const HORIZON_SEC = 300;

const CURVE_POINTS = 64;
const EQUAL_POWER_IN = Float32Array.from({ length: CURVE_POINTS }, (_, i) =>
  Math.sin((Math.PI / 2) * (i / (CURVE_POINTS - 1))),
);
const EQUAL_POWER_OUT = EQUAL_POWER_IN.slice().reverse();

/**
 * Random loop offset in [lo, hi] at least CROSSFADE_GAP_SEC away from
 * `avoid`, the loop position the outgoing segment fades out from.
 */
function pickOffset(lo: number, hi: number, avoid: number | null): number {
  const below = avoid === null ? hi - lo : Math.max(0, Math.min(hi, avoid - CROSSFADE_GAP_SEC) - lo);
  const aboveStart = avoid === null ? hi : Math.max(lo, avoid + CROSSFADE_GAP_SEC);
  const above = Math.max(0, hi - aboveStart);
  // A loop too short to keep the material apart still plays; it just overlaps.
  if (below + above === 0) return lo + Math.random() * (hi - lo);
  const r = Math.random() * (below + above);
  return r < below ? lo + r : aboveStart + (r - below);
}

/**
 * Snap to a whole sample frame. A fractional start or offset makes the source
 * interpolate between samples: a lowpass that dulls some segments' highs and
 * not others'.
 */
function toFrame(seconds: number, rate: number): number {
  return Math.round(seconds * rate) / rate;
}

/**
 * Plays a recorded loop as an endless bed that never repeats with the loop's
 * period: consecutive segments start at random points in the recording and
 * overlap by an equal-power crossfade, and no segment plays across the
 * recording's own seam. `loop` may still be decoding; the bed then eases in
 * once it arrives.
 */
export function createShuffledLoopLayer(
  ctx: BaseAudioContext,
  loop: AudioBuffer | Promise<AudioBuffer>,
): SoundLayer {
  const output = ctx.createGain();
  output.gain.value = 0;
  // An offline render never waits for "ended" events: it gets its whole timeline up front.
  const renderEnd =
    "startRendering" in ctx && "length" in ctx && typeof ctx.length === "number"
      ? ctx.length / ctx.sampleRate
      : null;
  const pending = new Set<AudioBufferSourceNode>();
  let buffer: AudioBuffer | null = loop instanceof Promise ? null : loop;
  let playing = false;
  let startAt = 0;
  let stopAt: number | null = null;
  let nextStart = 0;
  /** Loop offset where the latest segment's fade-out begins. */
  let lastTail: number | null = null;

  function schedule(): void {
    if (!buffer || !playing) return;
    const usable = buffer.duration - 2 * EDGE_SEC;
    if (usable < SEGMENT_MIN_SEC) {
      throw new Error(`Ambient loop too short: ${buffer.duration.toFixed(2)} s`);
    }
    const maxDur = Math.min(SEGMENT_MAX_SEC, usable);
    const until = renderEnd ?? ctx.currentTime + HORIZON_SEC;
    const limit = stopAt === null ? until : Math.min(until, stopAt);
    // JS stalled past the horizon (e.g. a frozen background tab): the last
    // segment already faded out, so ease back in from now rather than start a
    // burst of segments whose times have passed.
    if (lastTail !== null && nextStart < ctx.currentTime) {
      nextStart = toFrame(ctx.currentTime + LATE_START_SEC, ctx.sampleRate);
      lastTail = null;
    }
    while (nextStart < limit) {
      const dur = toFrame(SEGMENT_MIN_SEC + Math.random() * (maxDur - SEGMENT_MIN_SEC), ctx.sampleRate);
      const offset = toFrame(pickOffset(EDGE_SEC, EDGE_SEC + usable - dur, lastTail), buffer.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(output);
      const fadeInSec = lastTail === null ? FIRST_FADE_SEC : CROSSFADE_SEC;
      gain.gain.setValueCurveAtTime(EQUAL_POWER_IN, nextStart, fadeInSec);
      gain.gain.setValueCurveAtTime(EQUAL_POWER_OUT, nextStart + dur - CROSSFADE_SEC, CROSSFADE_SEC);
      src.start(nextStart, offset, dur);
      if (stopAt !== null) src.stop(stopAt);
      src.onended = () => {
        pending.delete(src);
        gain.disconnect();
        schedule();
      };
      pending.add(src);
      lastTail = offset + dur - CROSSFADE_SEC;
      nextStart = toFrame(nextStart + dur - CROSSFADE_SEC, ctx.sampleRate);
    }
  }

  if (loop instanceof Promise) {
    loop.then(
      (loaded) => {
        buffer = loaded;
        nextStart = toFrame(Math.max(startAt, ctx.currentTime + LATE_START_SEC), ctx.sampleRate);
        schedule();
      },
      (error: unknown) => console.error("Ambient loop failed to load", error),
    );
  }

  return {
    output,
    start(t: number) {
      fadeIn(output.gain, 1, t);
      playing = true;
      startAt = t;
      nextStart = t;
      schedule();
    },
    stop(t: number) {
      fadeOut(output.gain, t);
      stopAt = t + FADE_SEC + 0.01;
      for (const src of pending) src.stop(stopAt);
    },
  };
}

function createBrownNoiseLayer(ctx: BaseAudioContext): SoundLayer {
  const src = ctx.createBufferSource();
  src.buffer = createBrownNoiseBuffer(ctx);
  src.loop = true;
  const output = ctx.createGain();
  output.gain.value = 0;
  src.connect(output);
  return {
    output,
    start(t: number) {
      fadeIn(output.gain, 1, t);
      src.start(t);
    },
    stop(t: number) {
      fadeOut(output.gain, t);
      src.stop(t + FADE_SEC + 0.01);
    },
  };
}

/** Ambient layer: a recorded natural bed, or synthesized brown noise. */
export function createAmbientLayer(ctx: BaseAudioContext, kind: AmbientKind): SoundLayer {
  if (kind === "brown") return createBrownNoiseLayer(ctx);
  return createShuffledLoopLayer(ctx, peekAmbientSample(ctx, kind) ?? loadAmbientSample(ctx, kind));
}
