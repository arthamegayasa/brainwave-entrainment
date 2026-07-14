import { describe, it, expect } from "vitest";
import { OfflineAudioContext, AudioBuffer } from "node-web-audio-api";
import { renderSession, encodeMp3 } from "../../src/audio/export";
import type { CustomSession } from "../../src/audio/builder";

const SPEC: CustomSession = {
  version: 1,
  id: "export-test",
  name: "Export Test",
  curve: { startHz: 10, targetHz: 6, endHz: null, rampInMin: 0.02, rampOutMin: 0 },
  layers: [
    {
      id: "l1",
      type: "binaural",
      carrierHz: 200,
      beatMode: "follow",
      fixedBeatHz: 6,
      gain: 0.8,
    },
    {
      id: "l2",
      type: "pure",
      carrierHz: 528,
      beatMode: "fixed",
      fixedBeatHz: 6,
      gain: 0.4,
    },
  ],
  createdAt: "2026-07-14T00:00:00.000Z",
};

/** Inject node-web-audio-api's OfflineAudioContext (no DOM in vitest). */
const createContext = (channels: number, length: number, sampleRate: number) =>
  new OfflineAudioContext(channels, length, sampleRate) as unknown as globalThis.OfflineAudioContext;

/** Render once, share between tests (keeps the suite fast). */
let shared: Promise<globalThis.AudioBuffer> | null = null;
function renderShared(): Promise<globalThis.AudioBuffer> {
  shared ??= renderSession(SPEC, 0.05, createContext);
  return shared;
}

function rms(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

/** MP3 frame sync (0xFF 0xEx) or an ID3 tag header. */
async function looksLikeMp3(blob: Blob): Promise<boolean> {
  const b = new Uint8Array(await blob.arrayBuffer());
  const frameSync = b[0] === 0xff && (b[1] & 0xe0) === 0xe0;
  const id3 = b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33; // 'I','D','3'
  return frameSync || id3;
}

describe("export engine (offline render + MP3 encode)", () => {
  it("renderSession renders a non-silent stereo buffer at 44.1 kHz", async () => {
    const buffer = await renderShared();
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.sampleRate).toBe(44100);
    expect(rms(buffer.getChannelData(0))).toBeGreaterThan(0);
  });

  it("encodeMp3 produces a real MP3 blob from a stereo buffer", async () => {
    const buffer = await renderShared();
    const blob = await encodeMp3(buffer);
    expect(blob.type).toBe("audio/mpeg");
    expect(blob.size).toBeGreaterThan(500);
    expect(await looksLikeMp3(blob)).toBe(true);
  });

  it("encodeMp3 duplicates a mono buffer into a valid stereo MP3", async () => {
    const mono = new AudioBuffer({
      numberOfChannels: 1,
      length: 22050,
      sampleRate: 44100,
    });
    const data = mono.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.5;
    }
    const blob = await encodeMp3(mono as unknown as globalThis.AudioBuffer);
    expect(blob.size).toBeGreaterThan(500);
    expect(await looksLikeMp3(blob)).toBe(true);
  });
});
