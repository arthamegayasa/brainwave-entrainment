/**
 * Preserve samples within [-1, 1] and clamp compressor overshoot at full scale.
 * This bounds sample values, not device loudness or inter-sample peaks.
 */
export function createSampleCeiling(ctx: BaseAudioContext): WaveShaperNode {
  const ceiling = ctx.createWaveShaper();
  ceiling.curve = new Float32Array([-1, 1]);
  // Resampling filters could introduce new peaks after the clamp.
  ceiling.oversample = "none";
  return ceiling;
}
