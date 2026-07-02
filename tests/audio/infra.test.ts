import { describe, it, expect } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEMO, SOLFEGGIO } from "../../src/audio/constants";

/** Count rising zero-crossings in a Float32Array — estimates frequency for a 1s render. */
function countZeroCrossings(data: Float32Array): number {
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i - 1] <= 0 && data[i] > 0) count++;
  }
  return count;
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("test infrastructure (real OfflineAudioContext)", () => {
  it("renders a real 440 Hz oscillator through a gain node", async () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const osc = ctx.createOscillator();
    osc.frequency.value = 440;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0);

    let max = 0;
    for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
    expect(max).toBeGreaterThan(0.3);

    const crossings = countZeroCrossings(data);
    expect(crossings).toBeGreaterThanOrEqual(435);
    expect(crossings).toBeLessThanOrEqual(445);
  });
});

describe("React purity guard (ENG-07)", () => {
  it("src/audio/ contains no React imports", () => {
    const files = collectTsFiles(join(process.cwd(), "src", "audio"));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      expect(content, `${file} must not import react`).not.toMatch(/from\s+['"]react/);
    }
  });
});

describe("demo constants contract", () => {
  it("centralizes audition parameters", () => {
    expect(DEMO.binaural.carrier).toBe(200);
    expect(DEMO.binaural.beat).toBe(10);
    expect(DEMO.isochronic.carrier).toBe(528); // solfeggio-as-carrier (ENG-04 evidence)
    expect(DEMO.solfeggio.tone).toBe(528);
    expect(SOLFEGGIO.healing).toBe(528);
  });
});
