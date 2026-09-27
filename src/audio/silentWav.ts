/** A looping PCM source long enough to claim full browser audio focus. No Web Audio graph uses it. */
export function createSilentWav(): Uint8Array {
  const sampleRate = 8000;
  const dataLength = sampleRate * 5 * 2; // five seconds, mono signed 16-bit PCM
  const bytes = new Uint8Array(44 + dataLength); // untouched samples are exactly zero
  const view = new DataView(bytes.buffer);
  const label = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  label(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  label(8, "WAVE");
  label(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  label(36, "data");
  view.setUint32(40, dataLength, true);
  return bytes;
}
