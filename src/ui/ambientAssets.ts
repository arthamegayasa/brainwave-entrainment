import { setAmbientSampleSource } from "../audio/ambientSamples";
import type { SampleAmbientKind } from "../audio/types";
import rain from "../assets/ambient/rain.mp3";
import ocean from "../assets/ambient/ocean.mp3";
import wind from "../assets/ambient/wind.mp3";
import stream from "../assets/ambient/stream.mp3";
import forest from "../assets/ambient/forest.mp3";
import night from "../assets/ambient/night.mp3";

/** Hashed build URLs of the recorded ambient loops; the service worker precaches them. */
const AMBIENT_URLS: Record<SampleAmbientKind, string> = {
  rain,
  ocean,
  wind,
  stream,
  forest,
  night,
};

/** Serve the recorded ambient loops to the audio engine (ADR-026). */
export function installAmbientAssets(): void {
  setAmbientSampleSource(async (kind, sampleRate) => {
    const response = await fetch(AMBIENT_URLS[kind]);
    if (!response.ok) {
      throw new Error(`Ambient "${kind}" failed to load: HTTP ${response.status}`);
    }
    // Chrome's live AudioContext decodes at the file's own rate (44.1 kHz in a
    // 48 kHz context); an OfflineAudioContext always resamples to its rate.
    return new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(
      await response.arrayBuffer(),
    );
  });
}
