/** Shared analysis helpers for offline-render tests. */

export function countZeroCrossings(data: Float32Array): number {
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i - 1] <= 0 && data[i] > 0) count++;
  }
  return count;
}

export function maxAbs(data: Float32Array): number {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  return max;
}

export function maxDelta(data: Float32Array): number {
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    max = Math.max(max, Math.abs(data[i] - data[i - 1]));
  }
  return max;
}

/** RMS per window of `windowSize` samples. */
export function rmsSeries(data: Float32Array, windowSize: number): number[] {
  const out: number[] = [];
  for (let start = 0; start + windowSize <= data.length; start += windowSize) {
    let sum = 0;
    for (let i = start; i < start + windowSize; i++) sum += data[i] * data[i];
    out.push(Math.sqrt(sum / windowSize));
  }
  return out;
}

/** Smoothed absolute envelope (moving average over `windowSize` samples). */
export function envelope(data: Float32Array, windowSize: number): Float32Array {
  const out = new Float32Array(data.length);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += Math.abs(data[i]);
    if (i >= windowSize) sum -= Math.abs(data[i - windowSize]);
    out[i] = sum / Math.min(i + 1, windowSize);
  }
  return out;
}

/** Count rising threshold crossings with hysteresis (pulse onsets). */
export function countPulseOnsets(
  env: Float32Array,
  riseThreshold: number,
  fallThreshold: number,
): number {
  let count = 0;
  let armed = true;
  for (let i = 0; i < env.length; i++) {
    if (armed && env[i] > riseThreshold) {
      count++;
      armed = false;
    } else if (!armed && env[i] < fallThreshold) {
      armed = true;
    }
  }
  return count;
}
