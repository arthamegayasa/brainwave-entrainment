import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

declare global {
  interface Window {
    /** Every AudioContext the app created, recorded by recordAudioContexts(). */
    __audioContexts: AudioContext[];
    /** Moves the recorded contexts' audio clock forward; see advanceAudioClock(). */
    __advanceAudioClock: (sec: number) => void;
    /** AnalyserNodes tapped in parallel from the actual Web Audio destination input. */
    __outputAnalysers: [AnalyserNode, AnalyserNode] | null;
  }
}

/**
 * Record every AudioContext the app creates so tests can read its state, and
 * let tests move its audio clock (currentTime) forward as if more had played.
 */
export async function recordAudioContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const created: AudioContext[] = [];
    let skippedSec = 0;
    window.__audioContexts = created;
    window.__advanceAudioClock = (sec) => {
      skippedSec += sec;
    };
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) {
        super(options);
        created.push(this);
      }

      get currentTime(): number {
        return super.currentTime + skippedSec;
      }
    };
  });
}

/**
 * Tap the final stereo signal without replacing or changing its connection to
 * the speakers. The silent media element cannot enter this Web Audio graph.
 */
export async function recordLiveOutput(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__outputAnalysers = null;
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (
      this: AudioNode,
      destination: AudioNode | AudioParam,
      output?: number,
      input?: number,
    ) {
      if (destination instanceof AudioDestinationNode && !window.__outputAnalysers) {
        const ctx = this.context;
        const splitter = ctx.createChannelSplitter(2);
        const left = ctx.createAnalyser();
        const right = ctx.createAnalyser();
        for (const analyser of [left, right]) {
          analyser.fftSize = 32768;
          analyser.smoothingTimeConstant = 0;
          // Keep the tap in the rendering graph, without adding any sound.
          const sink = ctx.createGain();
          sink.gain.value = 0;
          Reflect.apply(connect, analyser, [sink]);
          Reflect.apply(connect, sink, [destination]);
        }
        Reflect.apply(connect, this, [splitter]);
        Reflect.apply(connect, splitter, [left, 0, 0]);
        Reflect.apply(connect, splitter, [right, 1, 0]);
        window.__outputAnalysers = [left, right];
      }
      return destination instanceof AudioParam
        ? Reflect.apply(connect, this, [destination, output ?? 0])
        : Reflect.apply(connect, this, [destination, output ?? 0, input ?? 0]);
    } as typeof AudioNode.prototype.connect;
  });
}

/** Peak-frequency interpolation from the actual per-channel AnalyserNode output. */
export function liveFrequencies(page: Page, nearHz: number[]): Promise<number[]> {
  return page.evaluate((targets) => {
    const analysers = window.__outputAnalysers;
    if (!analysers) throw new Error("No live Web Audio output tap");
    return analysers.map((analyser, channel) => {
      const bins = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(bins);
      const binHz = analyser.context.sampleRate / analyser.fftSize;
      const target = targets[channel];
      let peak = Math.round(target / binHz);
      for (let bin = Math.max(1, peak - 5); bin <= Math.min(bins.length - 2, peak + 5); bin++) {
        if (bins[bin] > bins[peak]) peak = bin;
      }
      const before = bins[peak - 1];
      const after = bins[peak + 1];
      const offset = (before - after) / (2 * (before - 2 * bins[peak] + after));
      return (peak + offset) * binHz;
    });
  }, nearHz);
}

/** State of each AudioContext the app created, in creation order. */
export function audioStates(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__audioContexts.map((ctx) => ctx.state));
}

/**
 * Move the audio clock forward by `sec`, as if that much more had played: what
 * the app reads as time heard. Page timers and the wall clock do not move.
 */
export async function advanceAudioClock(page: Page, sec: number): Promise<void> {
  await page.evaluate((s) => window.__advanceAudioClock(s), sec);
}

/** Landing → Sessions, skipping the first-visit goal picker. */
export async function openSessions(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Start a Free Session" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("heading", { name: /Choose your goal/ })).toBeVisible();
}

/** Open a preset's setup sheet and pick a length. */
export async function setUpPreset(page: Page, name: string, length: string): Promise<void> {
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await page.getByRole("button", { name: length, exact: true }).click();
}

/** End a Preset Play deliberately through its Player menu. */
export async function endPlay(page: Page): Promise<void> {
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "End session" }).click();
}

/** A saved Studio session, as an exported .swarasanti.json file. */
export const EVENING_THETA = {
  version: 1,
  id: "evening-theta",
  name: "Evening Theta",
  curve: { startHz: 10, targetHz: 6, endHz: null, rampInMin: 5, rampOutMin: 0 },
  layers: [
    {
      id: "layer-1",
      type: "binaural",
      carrierHz: 200,
      beatMode: "follow",
      fixedBeatHz: 6,
      gain: 0.6,
    },
  ],
  createdAt: "2026-09-20T10:00:00.000Z",
};

/** Import a saved Studio session (Evening Theta by default) into the Library and return its row. */
export async function importSession(
  page: Page,
  session: { id: string; name: string; [field: string]: unknown } = EVENING_THETA,
): Promise<Locator> {
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: `${session.id}.swarasanti.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(session)),
  });
  return page.locator(".library-item", { hasText: session.name });
}

/**
 * Play a Library row through its duration sheet, choosing `length` ("15 min"
 * … "∞"); the Player opens.
 */
export async function playFromLibrary(page: Page, row: Locator, length: string): Promise<void> {
  await row.getByRole("button", { name: "Play", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: length, exact: true }).click();
  await sheet.getByRole("button", { name: "Start Session" }).click();
  await expect(page.locator(".player")).toBeVisible();
}

/** A value in the Player's frequency details, by its label ("Left · Carrier", "Beat", …). */
export function frequencyValue(scope: Locator, label: string): Locator {
  return scope
    .locator(".freq-item")
    .filter({ has: scope.page().getByText(label, { exact: true }) })
    .locator(".v");
}

/** The Hz a frequency-details value shows. */
export async function shownHz(value: Locator): Promise<number> {
  return Number((await value.textContent())?.split(" ")[0]);
}
