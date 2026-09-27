import type { AmbientKind, SampleAmbientKind } from "./types";

/**
 * Recorded ambient loops (ADR-026). The engine stays free of asset URLs,
 * `fetch`, and decoders: the app installs a source that returns a loop
 * decoded at a given sample rate (src/ui/ambientAssets.ts); tests install one
 * that decodes the files from disk.
 */
export type AmbientSampleSource = (
  kind: SampleAmbientKind,
  sampleRate: number,
) => Promise<AudioBuffer>;

interface DecodedEntry {
  promise: Promise<AudioBuffer>;
  /** Set once decoding finished, so engines can start the loop synchronously. */
  buffer: AudioBuffer | null;
}

/**
 * A decoded 30 s stereo loop is ~11 MB at 48 kHz; keep only the most recent
 * few so browsing every ambience does not pin them all in memory.
 */
const MAX_DECODED = 3;

let source: AmbientSampleSource | null = null;
/** Keyed by kind and sample rate, least recently used first. */
const decoded = new Map<string, DecodedEntry>();

export function setAmbientSampleSource(next: AmbientSampleSource): void {
  source = next;
  decoded.clear();
}

export function isSampleAmbient(kind: AmbientKind): kind is SampleAmbientKind {
  return kind !== "brown";
}

/**
 * The loop for `kind` at `ctx`'s sample rate, cached. A loop at the
 * context's own rate plays without AudioBufferSourceNode's linear
 * resampler, which dulls the high end of rain and stream.
 */
export function loadAmbientSample(
  ctx: BaseAudioContext,
  kind: SampleAmbientKind,
): Promise<AudioBuffer> {
  const key = `${kind}@${ctx.sampleRate}`;
  const hit = decoded.get(key);
  if (hit) {
    decoded.delete(key);
    decoded.set(key, hit);
    return hit.promise;
  }
  if (!source) {
    return Promise.reject(new Error("No ambient sample source installed"));
  }
  const promise = source(kind, ctx.sampleRate);
  const entry: DecodedEntry = { promise, buffer: null };
  decoded.set(key, entry);
  promise.then(
    (buffer) => {
      entry.buffer = buffer;
    },
    // Forget failures so the next request retries (e.g. back online).
    () => {
      if (decoded.get(key) === entry) decoded.delete(key);
    },
  );
  while (decoded.size > MAX_DECODED) {
    decoded.delete(decoded.keys().next().value!);
  }
  return promise;
}

/** The loop if it is already decoded at `ctx`'s rate. */
export function peekAmbientSample(
  ctx: BaseAudioContext,
  kind: SampleAmbientKind,
): AudioBuffer | null {
  return decoded.get(`${kind}@${ctx.sampleRate}`)?.buffer ?? null;
}

/**
 * Decode every recorded loop in `kinds` before an offline render: an
 * OfflineAudioContext renders without waiting for late-arriving buffers.
 */
export async function preloadAmbientSamples(
  ctx: BaseAudioContext,
  kinds: Iterable<AmbientKind>,
): Promise<void> {
  const wanted = new Set([...kinds].filter(isSampleAmbient));
  await Promise.all([...wanted].map((kind) => loadAmbientSample(ctx, kind)));
}
