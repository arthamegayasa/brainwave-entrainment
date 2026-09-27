import { describe, expect, it } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import { createSilentWav } from "../../src/audio/silentWav";

describe("Media controls silence", () => {
  it("encodes at least five seconds of valid PCM WAV with zero-valued samples", () => {
    const bytes = createSilentWav();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ascii = (offset: number, length: number) =>
      String.fromCharCode(...bytes.subarray(offset, offset + length));
    expect(ascii(0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(bytes.length - 8);
    expect(ascii(8, 4)).toBe("WAVE");
    expect(ascii(12, 4)).toBe("fmt ");
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint16(34, true)).toBe(16); // signed, zero means silence
    expect(ascii(36, 4)).toBe("data");
    const sampleRate = view.getUint32(24, true);
    const dataLength = view.getUint32(40, true);
    expect(dataLength).toBe(bytes.length - 44);
    expect(dataLength / (sampleRate * 2)).toBeGreaterThanOrEqual(5);
    expect(bytes.subarray(44).every((sample) => sample === 0)).toBe(true);
  });

  it("decodes as five seconds of digital silence in a real audio decoder", async () => {
    const bytes = createSilentWav();
    const ctx = new OfflineAudioContext(1, 8000, 8000);
    const decoded = await ctx.decodeAudioData(bytes.buffer as ArrayBuffer);
    expect(decoded.duration).toBeGreaterThanOrEqual(5);
    expect(decoded.numberOfChannels).toBe(1);
    expect(decoded.getChannelData(0).every((sample) => sample === 0)).toBe(true);
  });
});
