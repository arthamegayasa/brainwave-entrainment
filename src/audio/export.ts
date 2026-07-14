import { Mp3Encoder } from "@breezystack/lamejs";
import { BuilderEngine } from "./builder";
import type { CustomSession } from "./builder";

/**
 * Offline MP3 export for bank sessions (engine layer — pure TS, no React).
 * Renders a sanitized CustomSession through the existing BuilderEngine inside
 * an OfflineAudioContext, then encodes the result to MP3 entirely in the
 * browser (ADR-004: synthesis stays 100% client-side, no audio files served).
 */

const SAMPLE_RATE = 44100;
/** LAME consumes fixed 1152-sample granules. */
const BLOCK_SIZE = 1152;
/** Yield to the event loop every N encoded blocks so the UI stays alive. */
const YIELD_EVERY = 200;

export type ExportPhase = "rendering" | "encoding";

type ContextFactory = (
  channels: number,
  length: number,
  sampleRate: number,
) => OfflineAudioContext;

const defaultFactory: ContextFactory = (channels, length, sampleRate) =>
  new OfflineAudioContext(channels, length, sampleRate);

/**
 * Render a custom session offline: same BuilderEngine the live player uses,
 * so ramp curve, layer mix, fades, and the safety limiter all carry over.
 * The factory parameter exists so tests can inject node-web-audio-api.
 */
export function renderSession(
  spec: CustomSession,
  durationMin: number,
  createContext: ContextFactory = defaultFactory,
): Promise<AudioBuffer> {
  const length = Math.round(SAMPLE_RATE * durationMin * 60);
  const ctx = createContext(2, length, SAMPLE_RATE);
  const engine = new BuilderEngine(ctx);
  engine.start(spec.layers, spec.curve, durationMin);
  return ctx.startRendering();
}

/**
 * Encode an AudioBuffer to a 320 kbps (default) stereo MP3. Mono input is
 * duplicated to both channels — binaural content NEEDS stereo, so the encoder
 * always runs with 2 channels. Chunked with periodic event-loop yields so a
 * long encode never freezes the page.
 */
export async function encodeMp3(
  buffer: AudioBuffer,
  opts?: { kbps?: number; onProgress?: (pct: number) => void },
): Promise<Blob> {
  const encoder = new Mp3Encoder(2, buffer.sampleRate, opts?.kbps ?? 320);
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels >= 2 ? buffer.getChannelData(1) : left;

  const totalBlocks = Math.ceil(left.length / BLOCK_SIZE);
  const leftBlock = new Int16Array(BLOCK_SIZE);
  const rightBlock = new Int16Array(BLOCK_SIZE);
  const chunks: Uint8Array[] = [];

  for (let block = 0; block < totalBlocks; block++) {
    const start = block * BLOCK_SIZE;
    const size = Math.min(BLOCK_SIZE, left.length - start);
    for (let i = 0; i < size; i++) {
      leftBlock[i] = floatToInt16(left[start + i]);
      rightBlock[i] = floatToInt16(right[start + i]);
    }
    const l = size === BLOCK_SIZE ? leftBlock : leftBlock.subarray(0, size);
    const r = size === BLOCK_SIZE ? rightBlock : rightBlock.subarray(0, size);
    const chunk = encoder.encodeBuffer(l, r);
    if (chunk.length > 0) chunks.push(chunk);

    if ((block + 1) % YIELD_EVERY === 0) {
      opts?.onProgress?.(Math.round(((block + 1) / totalBlocks) * 100));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const last = encoder.flush();
  if (last.length > 0) chunks.push(last);
  opts?.onProgress?.(100);
  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
}

/** Clamp to [-1, 1] and scale to signed 16-bit PCM. */
function floatToInt16(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample));
  return (s < 0 ? s * 0x8000 : s * 0x7fff) | 0;
}

/**
 * One-call export: offline render, then MP3 encode, with phase callbacks for
 * UI feedback ("Rendering…" has no granular progress; encoding reports %).
 */
export async function exportSessionMp3(
  spec: CustomSession,
  durationMin: number,
  onPhase?: (phase: ExportPhase, pct?: number) => void,
): Promise<Blob> {
  onPhase?.("rendering");
  const buffer = await renderSession(spec, durationMin);
  return encodeMp3(buffer, {
    onProgress: (pct) => onPhase?.("encoding", pct),
  });
}
