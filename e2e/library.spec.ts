import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  EVENING_THETA,
  advanceAudioClock,
  audioStates,
  endPlay,
  frequencyValue,
  importSession,
  openSessions,
  playFromLibrary,
  recordAudioContexts,
  setUpPreset,
  shownHz,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  // A Wednesday noon: every test stays inside one Monday–Sunday week. The wall
  // clock runs on its own; time heard is moved on the audio clock only.
  await page.clock.install({ time: new Date("2026-09-23T12:00:00") });
  await recordAudioContexts(page);
  await openSessions(page);
});

/** Start Meditating for 15 minutes from Sessions. */
async function startPreset(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect(page.locator(".timer")).not.toHaveText("15:00");
}

/** Listen to a Preset for 5 minutes, end it, and read the completion card's weekly count. */
async function completePreset(page: Page): Promise<Locator> {
  await startPreset(page);
  await advanceAudioClock(page, 301);
  await endPlay(page);
  return page.getByText(/^Session #\d+ this week$/);
}

/** Evening Theta with more entrainment layers (two isochronic on fixed Beats, one monaural) and a rain bed. */
const LAYERED_THETA = {
  ...EVENING_THETA,
  id: "layered-theta",
  name: "Layered Theta",
  layers: [
    ...EVENING_THETA.layers,
    { id: "layer-2", type: "isochronic", carrierHz: 432, beatMode: "fixed", fixedBeatHz: 12, gain: 0.5 },
    { id: "layer-3", type: "isochronic", carrierHz: 300, beatMode: "fixed", fixedBeatHz: 8, gain: 0.5 },
    { id: "layer-4", type: "monaural", carrierHz: 250, beatMode: "follow", fixedBeatHz: 6, gain: 0.5 },
    { id: "layer-5", type: "rain", carrierHz: 0, beatMode: "follow", fixedBeatHz: 6, gain: 0.4 },
  ],
};

const playerTimer = (page: Page) => page.locator(".player .timer");

/** Seconds on a "mm:ss" clock. */
function clockSec(clock: string | null): number {
  const [min, sec] = (clock ?? "").split(":").map(Number);
  return min * 60 + sec;
}

test("Play on a saved Studio session asks only for a length, defaulting to the last one used, then opens the Player", async ({
  page,
}) => {
  const row = await importSession(page);
  await row.getByRole("button", { name: "Play", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Set up Evening Theta" });
  await expect(sheet.getByRole("button", { name: "30 min", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("button", { name: /Headphones|Speaker|ambient/i })).toHaveCount(0);
  await sheet.getByRole("button", { name: "15 min", exact: true }).click();
  await sheet.getByRole("button", { name: "Start Session" }).click();

  await expect(page.locator(".player").getByRole("heading", { name: "Evening Theta" })).toBeVisible();
  await expect(playerTimer(page)).toHaveText(/^1[45]:\d\d$/);
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  // The Player belongs to the Library, where the Play was chosen.
  await expect(page.getByRole("button", { name: "Library", exact: true })).toHaveClass(/current/);
  await expect(page.getByRole("button", { name: "Sessions", exact: true })).not.toHaveClass(/current/);

  await endPlay(page);
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await row.getByRole("button", { name: "Play", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "15 min", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("a saved Studio session pauses and resumes in place from the Player", async ({ page }) => {
  const row = await importSession(page);
  await playFromLibrary(page, row, "15 min");
  await expect.poll(() => audioStates(page)).toEqual(["running"]);

  await page.getByRole("button", { name: "Pause Play" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
  await expect(page.locator(".phase-label")).toHaveText("Paused");
  const heldAt = clockSec(await playerTimer(page).textContent());
  await page.waitForTimeout(2000);
  expect(clockSec(await playerTimer(page).textContent())).toBe(heldAt);

  await page.getByRole("button", { name: "Resume Play" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  // It counts down from where it held, not from the start.
  await expect.poll(async () => clockSec(await playerTimer(page).textContent())).toBeLessThan(heldAt);
  expect(clockSec(await playerTimer(page).textContent())).toBeGreaterThan(heldAt - 10);
});

test("the Player has no Ambient or Mixer for Studio-designed audio and shows each entrainment layer's frequencies", async ({
  page,
}) => {
  const row = await importSession(page, LAYERED_THETA);
  await playFromLibrary(page, row, "15 min");
  await expect(page.getByRole("button", { name: "Ambient", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mixer", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "🎧 Headphones · Frequency details" }).click();
  const details = page.getByRole("dialog", { name: "Frequency details" });
  const layer = (name: string) => details.getByRole("group", { name, exact: true });
  await expect(details.getByRole("group")).toHaveCount(4); // the rain bed has no frequencies
  await expect(details.getByText("Use headphones", { exact: false })).toBeVisible();

  // Binaural: one tone per ear. It follows the ramp, which has just left 10 Hz.
  await expect(frequencyValue(layer("Binaural"), "Left · Carrier")).toHaveText("200.00 Hz");
  const beat = await shownHz(frequencyValue(layer("Binaural"), "Beat"));
  expect(beat).toBeGreaterThan(9);
  expect(beat).toBeLessThanOrEqual(10);
  const right = await shownHz(frequencyValue(layer("Binaural"), "Right · Carrier + Beat"));
  expect(Math.abs(right - 200 - beat)).toBeLessThan(0.03);
  // Isochronic: a tone pulsed at its own fixed Beat; two layers of a type are numbered.
  await expect(frequencyValue(layer("Isochronic 1"), "Tone · Carrier")).toHaveText("432.00 Hz");
  await expect(frequencyValue(layer("Isochronic 1"), "Pulse · Beat")).toHaveText("12.00 Hz");
  await expect(frequencyValue(layer("Isochronic 2"), "Tone · Carrier")).toHaveText("300.00 Hz");
  await expect(frequencyValue(layer("Isochronic 2"), "Pulse · Beat")).toHaveText("8.00 Hz");
  // Monaural: both tones in both ears, following the ramp.
  await expect(frequencyValue(layer("Monaural"), "Tone 1 · Carrier")).toHaveText("250.00 Hz");
  const monauralBeat = await shownHz(frequencyValue(layer("Monaural"), "Beat"));
  const secondTone = await shownHz(frequencyValue(layer("Monaural"), "Tone 2 · Carrier + Beat"));
  expect(Math.abs(secondTone - 250 - monauralBeat)).toBeLessThan(0.03);

  // The ramp moves the following Beats (10 → 6 Hz over 5 minutes); fixed Beats stay.
  await advanceAudioClock(page, 150);
  await expect(frequencyValue(layer("Binaural"), "Beat")).toHaveText(/^[78]\.\d\d Hz$/);
  await expect(frequencyValue(layer("Monaural"), "Beat")).toHaveText(/^[78]\.\d\d Hz$/);
  await expect(frequencyValue(layer("Isochronic 1"), "Pulse · Beat")).toHaveText("12.00 Hz");
});

test("audio without entrainment layers says so in its frequency details", async ({ page }) => {
  const row = await importSession(page, {
    ...EVENING_THETA,
    id: "rain-only",
    name: "Rain Only",
    layers: [{ id: "rain", type: "rain", carrierHz: 0, beatMode: "follow", fixedBeatHz: 6, gain: 0.5 }],
  });
  await playFromLibrary(page, row, "15 min");
  await page.getByRole("button", { name: "◉ Speaker · Frequency details" }).click();
  const details = page.getByRole("dialog", { name: "Frequency details" });
  await expect(details.getByText("This audio has no entrainment layers.")).toBeVisible();
  await expect(details.locator(".freq-item")).toHaveCount(0);
  await expect(details.getByText("Use headphones", { exact: false })).toHaveCount(0);
});

test("at phone size, a saved Studio session goes through the duration sheet into a Player that fits, and its row shows Playing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const row = await importSession(page);
  await playFromLibrary(page, row, "15 min");
  await expect(page.locator(".topbar")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(844);
  const toggle = await page.getByRole("button", { name: "Pause Play" }).boundingBox();
  expect(toggle!.y + toggle!.height).toBeLessThanOrEqual(844);
  await advanceAudioClock(page, 120);
  await expect(playerTimer(page)).toHaveText(/^12:\d\d$/);

  await page.getByRole("button", { name: "Minimize Player" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  // Leaving the Library and coming back still marks the running Play.
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  const playing = row.getByRole("button", { name: /^Playing/ });
  await expect(playing).toBeVisible();
  const chip = await playing.boundingBox();
  expect(chip!.x + chip!.width).toBeLessThanOrEqual(390);
  await expect(row.getByRole("button", { name: "Play", exact: true })).toHaveCount(0);

  // Tapping the row opens the running Play; it never restarts it.
  await playing.click();
  await expect(playerTimer(page)).toHaveText(/^12:\d\d$/);
  expect(await audioStates(page)).toEqual(["running"]);
});

test("a saved Studio session ended from the Player after 5 minutes shows the completion card and counts", async ({
  page,
}) => {
  const row = await importSession(page);
  await playFromLibrary(page, row, "15 min");
  await advanceAudioClock(page, 301);
  await endPlay(page);
  await expect(page.getByRole("heading", { name: "Evening Theta complete" })).toBeVisible();
  await expect(page.getByText("Session #1 this week")).toBeVisible();

  await page.getByRole("button", { name: "Back to Library" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(await completePreset(page)).toHaveText("Session #2 this week");
});

test("a saved Studio session ended before 5 minutes returns to the Library without a card or credit", async ({
  page,
}) => {
  const row = await importSession(page);
  await playFromLibrary(page, row, "15 min");
  await advanceAudioClock(page, 270);
  await endPlay(page);
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByText(/^Session #\d+ this week$/)).toHaveCount(0);

  await expect(await completePreset(page)).toHaveText("Session #1 this week");
});

test("a saved Studio session that reaches its natural end shows the completion card", async ({ page }) => {
  const row = await importSession(page);
  await playFromLibrary(page, row, "15 min");
  await advanceAudioClock(page, 15 * 60);
  await expect(page.getByRole("heading", { name: "Evening Theta complete" })).toBeVisible();
  await expect(page.getByText("Session #1 this week")).toBeVisible();
  // The audio stops and the device is released.
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
});

test("a Preset stopped by a Library Play counts, without a completion card", async ({ page }) => {
  const row = await importSession(page);
  await startPreset(page);
  await advanceAudioClock(page, 301);

  await page.getByRole("button", { name: "Library", exact: true }).click();
  await playFromLibrary(page, row, "15 min");
  await expect(page.locator(".player").getByRole("heading", { name: "Evening Theta" })).toBeVisible();
  await expect(page.getByText(/^Session #\d+ this week$/)).toHaveCount(0);

  // Sessions shows the goals again, not a completion card.
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Choose your goal/ })).toBeVisible();
  await expect(await completePreset(page)).toHaveText("Session #2 this week");
});

test("leaving the page ends the running Play there, with its credit", async ({ page }) => {
  await startPreset(page);
  await advanceAudioClock(page, 301);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
  await expect(page.getByText("Session #1 this week")).toBeVisible();
  // The audio stops and the device is released.
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
});

test("a wall-clock jump is not listening: the timer and credit follow the audio clock", async ({
  page,
}) => {
  await startPreset(page);
  // Ten minutes pass on the wall clock (timers fire, the page repaints), as
  // when a frozen page thaws, but the audio clock only moved in real time.
  await page.clock.fastForward("10:00");
  await expect(page.locator(".timer")).toHaveText(/^14:\d\d$/);
  await page.locator(".player-stage").click(); // reveal controls after inactivity
  await endPlay(page);
  await expect(page.getByRole("heading", { name: /Choose your goal/ })).toBeVisible();
});
