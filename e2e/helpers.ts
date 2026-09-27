import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    /** Every AudioContext the app created, recorded by recordAudioContexts(). */
    __audioContexts: AudioContext[];
    /** Moves the recorded contexts' audio clock forward; see advanceAudioClock(). */
    __advanceAudioClock: (sec: number) => void;
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
